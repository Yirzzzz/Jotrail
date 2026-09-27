/**
 * Record something that happened.
 *
 * The date defaults to today but is editable, which is the point: a moment
 * entered now can be filed at the time it actually happened, and the timeline
 * will place it there (MVP_PLAN.md milestone 4).
 *
 * It also records something that *has not* happened: a deadline, a booked date,
 * an intention. Which of the two is being written follows the date — a future
 * date is a plan, because nothing in the future can have happened yet — and the
 * dialog says so as soon as the date changes rather than making the user find a
 * mode switch first. The toggle exists for the one case the date cannot express:
 * a deadline entered late, already past, still not met.
 */

import { useState } from 'react';
import { CalendarClock, Check, Plus, X } from 'lucide-react';

import { Modal } from '@/components/Modal';
import { useInvalidate, useRepoQuery, useRepository } from '@/data/RepositoryContext';
import { SubjectField, useSubjectField } from '@/features/registers/SubjectField';
import type { TimelineImportance } from '@/domain/types';
import { useI18n } from '@/lib/i18n';
import {
  dateInputValue,
  differenceInLocalDays,
  fromDateTimeInputs,
  nowIso,
  timeInputValue,
  toDate,
} from '@/lib/datetime';

interface Props {
  journeyId?: string;
  onClose: () => void;
}

export function RecordEventDialog({ journeyId, onClose }: Props) {
  const { t } = useI18n();
  const importanceOptions: { value: TimelineImportance; label: string; hint: string }[] = [
    {
      value: 'compact',
      label: t('Minor', '简短'),
      hint: t('A single line on the timeline', '在时间线上显示为一行'),
    },
    { value: 'normal', label: t('Normal', '普通'), hint: t('Title and details', '标题和详情') },
    {
      value: 'milestone',
      label: t('Milestone', '里程碑'),
      hint: t('Given more room', '用更多空间突出显示'),
    },
  ];
  const repository = useRepository();
  const invalidate = useInvalidate();
  const journeys = useRepoQuery((repo) => repo.listJourneys(), []);

  const now = nowIso();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [reflection, setReflection] = useState('');
  const [date, setDate] = useState(dateInputValue(now));
  const [time, setTime] = useState(timeInputValue(now));
  const [importance, setImportance] = useState<TimelineImportance>('normal');
  const [selectedJourneys, setSelectedJourneys] = useState<string[]>(
    journeyId ? [journeyId] : [],
  );

  // A transition is optional: most events simply happened. When filled in, the
  // event becomes readable as history the journey can track over time.
  const [isTracking, setTracking] = useState(false);
  const [stateSubject, setStateSubject] = useState('');
  const [stateField, setStateField] = useState('');
  const [stateFrom, setStateFrom] = useState('');
  const [stateTo, setStateTo] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Whether this is a plan.
   *
   * `null` means "follow the date", which is the state the dialog opens in and
   * stays in unless the user says otherwise: a date in the future can only be a
   * plan, and a past one is almost always a record. Deriving it means the common
   * case — type a 2027 deadline, press the button — needs no mode switch, and the
   * dialog cannot end up in a state that contradicts its own date field.
   *
   * An explicit `true`/`false` overrides that, for the case the date genuinely
   * cannot express: a deadline entered after it has already passed, still unmet.
   */
  const [plannedOverride, setPlannedOverride] = useState<boolean | null>(null);

  /*
   * The tracked thing this event is about, and the stage it reached.
   *
   * Both optional and both must stay so: `AGENTS.md` §1 requires that recording
   * stays easier than filing, so an event never needs a subject to be written.
   * The register is a place things accumulate, not a gate in front of the pen.
   *
   * Scoped to the *first* selected Journey, because a subject belongs to exactly
   * one and both repositories refuse one from elsewhere — offering a thing from
   * another Journey would be offering an error.
   */
  const primaryJourney = selectedJourneys[0] ?? null;
  const subjectField = useSubjectField({ journeyId: primaryJourney, entryTitle: title });

  /*
   * The to-dos this event comes with.
   *
   * Today's two inputs are the smallest units the app has — one thing that
   * happened, one thing to do — and recording an event carries *both*: an
   * interview happens, and it leaves work behind. So this is deliberately the
   * same unit as Today's task composer, due date included, rather than a
   * title-only relative of it. A gap worth writing down is often a gap with a
   * date on it, and that date is what feeds "Up next".
   */
  const [todos, setTodos] = useState<{ title: string; dueAt: string }[]>([]);
  const [todoDraft, setTodoDraft] = useState('');
  const [todoDue, setTodoDue] = useState('');

  const addTodo = () => {
    const trimmed = todoDraft.trim();
    if (!trimmed) return;
    setTodos((current) => [...current, { title: trimmed, dueAt: todoDue }]);
    setTodoDraft('');
    setTodoDue('');
  };

  const occurredAt = fromDateTimeInputs(date, time);

  /*
   * A date after today can only be a plan. Compared in whole local days rather
   * than by instant, so an event being logged for later this afternoon is still
   * "today" and stays a record — the alternative turns an ordinary same-day
   * entry into a commitment because of a few hours.
   */
  const dateIsAhead = (() => {
    const target = toDate(occurredAt);
    return target ? differenceInLocalDays(new Date(), target) > 0 : false;
  })();
  const isPlanned = plannedOverride ?? dateIsAhead;

  const stateIsComplete = stateField.trim().length > 0 && stateTo.trim().length > 0;

  const canSubmit =
    title.trim().length > 0 &&
    occurredAt !== null &&
    (!isTracking || stateIsComplete || isPlanned) &&
    subjectField.blockedReason === null &&
    !isSaving;

  // A greyed-out button with no explanation is a dead end; name what is missing.
  let blockedReason: string | null = null;
  if (!isSaving && title.trim().length === 0) {
    blockedReason = isPlanned
      ? t('Add what is planned', '请填写计划事项')
      : t('Add what happened', '请填写发生的事');
  } else if (!isSaving && occurredAt === null) {
    blockedReason = t('Check the date', '请检查日期');
  } else if (!isSaving && subjectField.blockedReason) {
    blockedReason = subjectField.blockedReason;
  } else if (!isSaving && isTracking && !stateIsComplete && !isPlanned) {
    blockedReason = t('Name what changed, and its new value', '请填写变化的状态及新值');
  }

  const toggleJourney = (id: string) => {
    setSelectedJourneys((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !occurredAt) return;

    setIsSaving(true);
    setError(null);
    try {
      await repository.createTimelineEvent({
        title: title.trim(),
        ...(summary.trim() ? { summary: summary.trim() } : {}),
        ...(reflection.trim() ? { reflection: reflection.trim() } : {}),
        occurredAt,
        importance,
        journeyIds: selectedJourneys,
        // What makes this a commitment rather than a record. `occurredAt` is then
        // the date it is aimed at, kept as `plannedFor` when it is confirmed.
        ...(isPlanned ? { planned: true } : {}),
        /*
         * What this event is about — a thing that already exists, or one being
         * started here — and the stage it reached. Resolved by the field itself,
         * which keeps the sentinel it uses internally out of the payload.
         */
        ...subjectField.filing,
        /*
         * A to-do still sitting in the draft field counts: losing it because the
         * user pressed Record instead of Enter would be the dialog quietly
         * discarding what they typed.
         */
        ...(() => {
          const pending = todoDraft.trim();
          const all = pending ? [...todos, { title: pending, dueAt: todoDue }] : todos;
          return all.length > 0
            ? {
                tasks: all.map((todo) => ({
                  title: todo.title,
                  // Only send a date that actually parses, same as Today does.
                  ...(todo.dueAt && fromDateTimeInputs(todo.dueAt)
                    ? { dueAt: fromDateTimeInputs(todo.dueAt) as string }
                    : {}),
                })),
              }
            : {};
        })(),
        /*
         * A plan cannot carry a transition — nothing has changed yet, and both
         * repositories refuse one. The section is hidden while planning, so this
         * guard only matters if the user filled it in and *then* moved the date
         * into the future; dropping it silently beats submitting something the
         * backend will reject.
         */
        ...(isTracking && stateIsComplete && !isPlanned
          ? {
              state: {
                field: stateField.trim(),
                to: stateTo.trim(),
                ...(stateFrom.trim() ? { from: stateFrom.trim() } : {}),
                ...(stateSubject.trim() ? { subject: stateSubject.trim() } : {}),
              },
            }
          : {}),
      });
      invalidate();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setIsSaving(false);
    }
  };

  return (
    <Modal
      title={
        isPlanned ? t('Plan something ahead', '记录未来计划') : t('Record an event', '记录事件')
      }
      description={
        isPlanned
          ? t(
              'A deadline or a date you are working towards. Mark it as happened when it does.',
              '记下一个截止日期或期待的日子。实现之后，再标记为已发生。',
            )
          : t(
              'Something that happened, at the time it happened.',
              '记下一件事，以及它发生的时间。',
            )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="modal__body">
          {error ? <p className="error-banner">{error}</p> : null}

          <div className="field">
            <label className="field__label" htmlFor="event-title">
              {isPlanned
                ? t('What is planned', '计划做什么')
                : t('What happened', '发生了什么')}
            </label>
            <input
              id="event-title"
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={
                isPlanned
                  ? t(
                      'ICLR 2027 截稿 · Interview · Race day…',
                      'ICLR 2027 截稿 · 面试 · 比赛日…',
                    )
                  : t(
                      'Applied · First session · Paper accepted…',
                      '已申请 · 第一次训练 · 论文录用…',
                    )
              }
              autoComplete="off"
            />
          </div>

          {/*
            What this is about, when the Journey tracks things.

            Directly under the title because it *qualifies the title*: `一面`
            means little until you know it is 卫澜深海’s. Shared with the confirm
            dialog, because a plan becoming real is the same moment as far as a
            register is concerned (D-051).
          */}
          <SubjectField field={subjectField} idPrefix="event" />

          {/*
            The second of the two smallest units.

            Today offers exactly two inputs — "What happened" and "Something to
            do" — and an event carries both: an interview happens, and it leaves
            work behind. This is the same task unit as Today's composer, due date
            included, so recording an event is not a lesser version of writing
            two entries by hand.

            The to-dos are created in the same transaction as the event, linked
            back to it via `origin_type='event'`, and inherit its Journeys.
          */}
          <div className="field">
            <span className="field__label">
              {t('Something to do', '待办事项')}{' '}
              <span className="field__hint">{t('Optional', '选填')}</span>
            </span>
            <span className="field__hint">
              {t(
                'Work this leaves behind. Kept with the event, and dated work reaches “Up next”.',
                '记录由此产生的待办。它们会与事件保存在一起，设有日期的任务会出现在“接下来”。',
              )}
            </span>

            {todos.length > 0 ? (
              <ul className="revealed">
                {todos.map((todo, index) => (
                  <li key={`${todo.title}-${index}`} className="revealed__row">
                    <span className="revealed__title">{todo.title}</span>
                    {todo.dueAt ? <span className="revealed__due">{todo.dueAt}</span> : null}
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setTodos(todos.filter((_, at) => at !== index))}
                      title={t(`Remove ${todo.title}`, `移除 ${todo.title}`)}
                      aria-label={t(`Remove ${todo.title}`, `移除 ${todo.title}`)}
                      data-autofocus="false"
                    >
                      <X size={13} strokeWidth={2} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="revealed__composer">
              <input
                id="event-todo"
                className="input"
                value={todoDraft}
                onChange={(event) => setTodoDraft(event.target.value)}
                onKeyDown={(event) => {
                  /*
                   * Enter adds a line rather than submitting the dialog — this is
                   * a list builder, and someone typing three items should not
                   * have the first one save the whole event.
                   */
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTodo();
                  }
                }}
                placeholder={t('Next action, idea, or reminder…', '下一步、想法或提醒…')}
                autoComplete="off"
                aria-label={t('Something to do', '待办事项')}
              />
              <input
                type="date"
                className="composer__date-input"
                value={todoDue}
                onChange={(event) => setTodoDue(event.target.value)}
                aria-label={t('Due date for this to-do', '此待办的截止日期')}
                aria-invalid={todoDue.trim() !== '' && fromDateTimeInputs(todoDue) === null}
                data-autofocus="false"
              />
              <button
                type="button"
                className="button button--outline"
                onClick={addTodo}
                disabled={!todoDraft.trim()}
                data-autofocus="false"
              >
                <Plus size={14} strokeWidth={2} aria-hidden />
                {t('Add', '添加')}
              </button>
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="event-summary">
              {t('Details', '详情')}{' '}
              <span className="field__hint">{t('Optional', '选填')}</span>
            </label>
            <textarea
              id="event-summary"
              className="input input--textarea"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={2}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="event-reflection">
              {t('Why?', '为什么？')}{' '}
              <span className="field__hint">{t('Optional', '选填')}</span>
            </label>
            <textarea
              id="event-reflection"
              className="input input--textarea"
              value={reflection}
              onChange={(event) => setReflection(event.target.value)}
              placeholder={t(
                'Worth writing down now; hard to reconstruct later.',
                '值得现在记下的感受，以后可能难以还原。',
              )}
              rows={2}
            />
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="field__label" htmlFor="event-date">
                {isPlanned ? t('Deadline', '截止日期') : t('When', '日期')}
              </label>
              <input
                id="event-date"
                type="date"
                className="input"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                aria-invalid={date.trim() !== '' && occurredAt === null}
              />
            </div>
            <div className="field" style={{ width: 120 }}>
              <label className="field__label" htmlFor="event-time">
                {t('Time', '时间')}
              </label>
              <input
                id="event-time"
                type="time"
                className="input"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </div>
          </div>

          {/*
            Which of the two things is being written.

            Below the date rather than above it, because the date is what usually
            decides this: pick a future day and the answer is already right, so
            the control reads as confirmation instead of a question to answer
            first. It is a real control for the case the date cannot express — a
            deadline entered after it passed, still unmet — and it is how an
            explicit choice survives a later change of date.
          */}
          <div className="field">
            <span className="field__label">{t('Kind', '类型')}</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className={`button ${!isPlanned ? 'button--outline' : ''}`}
                aria-pressed={!isPlanned}
                onClick={() => setPlannedOverride(false)}
                data-autofocus="false"
              >
                <Check size={14} strokeWidth={2} aria-hidden />
                {t('It happened', '已发生')}
              </button>
              <button
                type="button"
                className={`button ${isPlanned ? 'button--outline' : ''}`}
                aria-pressed={isPlanned}
                onClick={() => setPlannedOverride(true)}
                data-autofocus="false"
              >
                <CalendarClock size={14} strokeWidth={2} aria-hidden />
                {t('Planned', '计划')}
              </button>
            </div>
            <span className="field__hint">
              {isPlanned
                ? dateIsAhead
                  ? t(
                      'That date is ahead, so this is kept as a plan until you mark it as happened.',
                      '日期在未来，将作为计划保留，直到你标记为已发生。',
                    )
                  : t(
                      'Kept as a plan even though the date has passed — it will read as overdue.',
                      '日期虽然已过，仍作为计划保留，并显示为已逾期。',
                    )
                : t('On the record, at the date above.', '按上方日期记入时间线。')}
            </span>
          </div>

          <div className="field">
            <span className="field__label">{t('Weight', '重要程度')}</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {importanceOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`button ${importance === option.value ? 'button--outline' : ''}`}
                  aria-pressed={importance === option.value}
                  onClick={() => setImportance(option.value)}
                  title={option.hint}
                  data-autofocus="false"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/*
            A transition, when this event is something *changing* rather than
            just happening. Recorded as history, so the journey can show how the
            state moved over time instead of only its value now.

            Absent while planning: a transition asserts that something *is* now a
            different value, and a plan asserts nothing yet. Offering it would
            invite the user to record a level they have not reached, and the
            journey's tracked states would report it as fact.
          */}
          {!isPlanned ? (
            <>
              <div className="field">
                <button
                  type="button"
                  className={`button ${isTracking ? 'button--outline' : ''}`}
                  aria-pressed={isTracking}
                  onClick={() => setTracking(!isTracking)}
                  data-autofocus="false"
                  style={{ alignSelf: 'flex-start' }}
                >
                  {isTracking
                    ? t('Recording a change', '正在记录状态变化')
                    : t('This changed a state…', '记录一次状态变化…')}
                </button>
                {!isTracking ? (
                  <span className="field__hint">
                    {t(
                      'For “Not ready → Ready”, “Basic → Intermediate” and the like. Kept as history and shown on the Journey’s overview.',
                      '例如“未准备好 → 已准备好”、“基础 → 进阶”。变化会保留为历史，并显示在旅程概览中。',
                    )}
                  </span>
                ) : null}
              </div>

              {isTracking ? (
                <>
                  <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <div className="field" style={{ flex: 1 }}>
                      <label className="field__label" htmlFor="state-subject">
                        {t('What', '对象')}{' '}
                        <span className="field__hint">{t('Optional', '选填')}</span>
                      </label>
                      <input
                        id="state-subject"
                        className="input"
                        value={stateSubject}
                        onChange={(event) => setStateSubject(event.target.value)}
                        placeholder={t(
                          'ROS2 · ByteDance · Bench press',
                          'ROS2 · 字节跳动 · 卧推',
                        )}
                        autoComplete="off"
                      />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label className="field__label" htmlFor="state-field">
                        {t('Kind of state', '状态类型')}
                      </label>
                      <input
                        id="state-field"
                        className="input"
                        value={stateField}
                        onChange={(event) => setStateField(event.target.value)}
                        placeholder={t(
                          'capability · readiness · weight',
                          '能力 · 准备程度 · 重量',
                        )}
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <div className="field" style={{ flex: 1 }}>
                      <label className="field__label" htmlFor="state-from">
                        {t('From', '原状态')}{' '}
                        <span className="field__hint">{t('Optional', '选填')}</span>
                      </label>
                      <input
                        id="state-from"
                        className="input"
                        value={stateFrom}
                        onChange={(event) => setStateFrom(event.target.value)}
                        placeholder={t('basic', '基础')}
                        autoComplete="off"
                      />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label className="field__label" htmlFor="state-to">
                        {t('To', '新状态')}
                      </label>
                      <input
                        id="state-to"
                        className="input"
                        value={stateTo}
                        onChange={(event) => setStateTo(event.target.value)}
                        placeholder={t('intermediate', '进阶')}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {(journeys.data ?? []).length > 0 ? (
            <div className="field">
              <span className="field__label">
                {t('Journeys', '旅程')}{' '}
                <span className="field__hint">{t('Optional', '选填')}</span>
              </span>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {(journeys.data ?? []).map((journey) => (
                  <button
                    key={journey.id}
                    type="button"
                    className={`button ${
                      selectedJourneys.includes(journey.id) ? 'button--outline' : ''
                    }`}
                    aria-pressed={selectedJourneys.includes(journey.id)}
                    onClick={() => toggleJourney(journey.id)}
                    data-autofocus="false"
                  >
                    {journey.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="modal__footer">
          {/* Say why the button is unavailable rather than just greying it out. */}
          {blockedReason ? <span className="modal__footer-hint">{blockedReason}</span> : null}
          <button type="button" className="button" onClick={onClose} data-autofocus="false">
            {t('Cancel', '取消')}
          </button>
          <button type="submit" className="button button--primary" disabled={!canSubmit}>
            {isSaving
              ? t('Saving…', '正在保存…')
              : isPlanned
                ? t('Add to timeline', '添加到时间线')
                : t('Record', '记录')}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

/**
 * Confirm that a planned event happened.
 *
 * Deliberately not the edit dialog with an extra button. Editing answers "what
 * did I get wrong about this?"; this answers "it happened — when?", which is a
 * different question with a different default: the date opens on *now* rather
 * than on what is stored, because the common case is confirming something as you
 * finish it.
 *
 * What changes at this moment: what it ended up being called, when it actually
 * happened, and **what it turned out to be about, at what stage**. That last part
 * is the same question the record dialog asks, and it belongs here for the same
 * reason — this *is* the moment something happens, so it is the moment a stage
 * becomes true. `2027 ICRA` is not at 投稿 until the submission really occurs
 * (D-051).
 *
 * The deadline it was aiming for is shown but not editable — it is about to become
 * a fact about the past, and moving it belongs in the edit dialog while the entry
 * is still a plan.
 */

import { useState } from 'react';
import { CalendarClock } from 'lucide-react';

import { Modal } from '@/components/Modal';
import { useInvalidate, useRepository } from '@/data/RepositoryContext';
import { SubjectField, useSubjectField } from '@/features/registers/SubjectField';
import type { TimelineEntry } from '@/domain/types';
import { useI18n } from '@/lib/i18n';
import {
  dateInputValue,
  formatFullDate,
  fromDateTimeInputs,
  nowIso,
  timeInputValue,
} from '@/lib/datetime';

interface Props {
  entry: TimelineEntry;
  onClose: () => void;
}

export function MarkHappenedDialog({ entry, onClose }: Props) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();

  /*
   * Now, not the planned date.
   *
   * "9.10 号就完成了投稿" is the case this exists for: the deadline was later, the
   * thing happened earlier, and the entry has to land on the earlier date.
   * Defaulting to the target would quietly file every confirmation on its
   * deadline and lose exactly the fact worth keeping.
   */
  const now = nowIso();
  const [title, setTitle] = useState(entry.title);
  const [date, setDate] = useState(dateInputValue(now));
  const [time, setTime] = useState(timeInputValue(now));

  /*
   * What it turned out to be about.
   *
   * Seeded with whatever the plan already carried, so confirming `2027 ICLR 截稿`
   * — already filed onto that paper — only has to answer the stage. An unfiled
   * plan like `2027 ICRA` gets the whole question, including "+ A new one…".
   *
   * Scoped to the entry's first Journey, because a subject belongs to exactly one.
   */
  const subjectField = useSubjectField({
    journeyId: entry.journeys[0]?.id ?? null,
    entryTitle: title,
    initialSubjectId: entry.subjectId,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const occurredAt = fromDateTimeInputs(date, time);
  const canSubmit =
    title.trim().length > 0 &&
    occurredAt !== null &&
    subjectField.blockedReason === null &&
    !isSaving;

  // Name what is missing rather than leaving a dead grey button, as the other
  // two event dialogs do.
  let blockedReason: string | null = null;
  if (!isSaving && title.trim().length === 0) {
    blockedReason = t('An event needs a title', '请填写事件标题');
  } else if (!isSaving && occurredAt === null) {
    blockedReason = t('Check the date', '请检查日期');
  } else if (!isSaving && subjectField.blockedReason) {
    blockedReason = subjectField.blockedReason;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !occurredAt) return;

    setIsSaving(true);
    setError(null);
    try {
      await repository.confirmTimelineEvent(entry.id, {
        occurredAt,
        title: title.trim(),
        /*
         * The thing and its stage. `subjectId` is sent explicitly — including as
         * `null` — so unfiling is expressible; omitting the key would mean "leave
         * it", which cannot say "actually, nothing in particular".
         */
        ...(subjectField.filing.newSubject
          ? { newSubject: subjectField.filing.newSubject }
          : { subjectId: subjectField.filing.subjectId ?? null }),
        stage: subjectField.filing.stage ?? null,
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
      title={t('Mark as happened', '标记为已发生')}
      description={t(
        'This moves it onto the record, at the time it actually happened.',
        '按实际发生的时间，将它正式记入时间线。',
      )}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="modal__body">
          {error ? <p className="error-banner">{error}</p> : null}

          {/*
            What it was aiming for, kept visible while re-dating it. Without this
            the user is choosing "when did it happen" with no reminder of the
            deadline they are comparing against.
          */}
          <p className="field__hint" style={{ display: 'flex', gap: 'var(--space-1)' }}>
            <CalendarClock size={12} strokeWidth={2} aria-hidden />
            {t(
              `Planned for ${formatFullDate(entry.plannedFor ?? entry.occurredAt)}. That date is kept.`,
              `原定于 ${formatFullDate(entry.plannedFor ?? entry.occurredAt)}。原计划日期将被保留。`,
            )}
          </p>

          <div className="field">
            <label className="field__label" htmlFor="mark-happened-title">
              {t('What happened', '发生了什么')}
            </label>
            <input
              id="mark-happened-title"
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoComplete="off"
            />
            <span className="field__hint">
              {t(
                'Reword it if the plan and the outcome read differently.',
                '如果结果与计划不同，可以修改描述。',
              )}
            </span>
          </div>

          {/*
            What it turned out to be about, and the stage it reached.

            The same field the record dialog uses, because this is the same
            question at the other moment it applies — a plan becoming real is when
            a stage becomes true (D-051). Above the date for the same reason it sits
            under the title there: it qualifies what happened, and the date is a
            detail of it.
          */}
          <SubjectField
            field={subjectField}
            idPrefix="mark-happened"
            label={t('What this was', '这件事关于什么')}
          />

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="field__label" htmlFor="mark-happened-date">
                {t('When it happened', '发生日期')}
              </label>
              <input
                id="mark-happened-date"
                type="date"
                className="input"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                aria-invalid={date.trim() !== '' && occurredAt === null}
              />
            </div>
            <div className="field" style={{ width: 120 }}>
              <label className="field__label" htmlFor="mark-happened-time">
                {t('Time', '时间')}
              </label>
              <input
                id="mark-happened-time"
                type="time"
                className="input"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </div>
          </div>
        </div>

        <footer className="modal__footer">
          {blockedReason ? <span className="modal__footer-hint">{blockedReason}</span> : null}
          <button type="button" className="button" onClick={onClose} data-autofocus="false">
            {t('Cancel', '取消')}
          </button>
          <button type="submit" className="button button--primary" disabled={!canSubmit}>
            {isSaving ? t('Saving…', '正在保存…') : t('It happened', '已发生')}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

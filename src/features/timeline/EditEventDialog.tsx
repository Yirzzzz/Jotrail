/**
 * Correct an event that was already recorded.
 *
 * Deliberately not a mode on `RecordEventDialog`. Only four things can change —
 * the wording and when it happened — so reusing that form would mean suppressing
 * its Weight, Journeys, state-change and to-do sections, which is more code and
 * more risk than the fields themselves. What an edit *cannot* do is the point:
 * an event's weight, its journeys and the work it revealed are how it sits in
 * the story, and changing those is re-recording it, not correcting it (D-040).
 *
 * The same form edits a plan, where the date field is a *deadline* being moved
 * rather than a past moment being corrected. Only the labels differ: the fields
 * and the write are identical, and `timeline::update` keeps `plannedFor` in step
 * with the new date so confirming later reports the revised deadline.
 *
 * Plan lifecycle actions are separate confirmations: cancelling an unfulfilled
 * plan, or undoing a mistaken confirmation. An otherwise read-only milestone
 * can expose the latter without gaining permission to edit its wording.
 */

import { useState } from 'react';

import { Modal } from '@/components/Modal';
import { useInvalidate, useRepository } from '@/data/RepositoryContext';
import { canRevertConfirmation, isEditable, isPlanned } from '@/domain/timeline';
import type { TimelineEntry } from '@/domain/types';
import { useI18n } from '@/lib/i18n';
import {
  dateInputValue,
  formatFullDate,
  fromDateTimeInputs,
  timeInputValue,
} from '@/lib/datetime';

interface Props {
  entry: TimelineEntry;
  onClose: () => void;
}

export function EditEventDialog({ entry, onClose }: Props) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();
  const planned = isPlanned(entry);
  const editable = isEditable(entry);
  const revertible = canRevertConfirmation(entry);

  const [title, setTitle] = useState(entry.title);
  const [summary, setSummary] = useState(entry.summary ?? '');
  const [reflection, setReflection] = useState(entry.reflection ?? '');
  const [date, setDate] = useState(dateInputValue(entry.occurredAt));
  const [time, setTime] = useState(timeInputValue(entry.occurredAt));

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<'cancel' | 'revert' | null>(null);

  const occurredAt = fromDateTimeInputs(date, time);
  const canSubmit = editable && title.trim().length > 0 && occurredAt !== null && !isSaving;

  // Same courtesy as the record dialog: name what is missing rather than just
  // grey the button out.
  let blockedReason: string | null = null;
  if (!isSaving && title.trim().length === 0) {
    blockedReason = t('An event needs a title', '请填写事件标题');
  } else if (!isSaving && occurredAt === null) {
    blockedReason = t('Check the date', '请检查日期');
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !occurredAt) return;

    setIsSaving(true);
    setError(null);
    try {
      await repository.updateTimelineEvent(entry.id, {
        title: title.trim(),
        // Emptied on purpose reads as `null`, which clears the field rather than
        // storing an empty string.
        summary: summary.trim() || null,
        reflection: reflection.trim() || null,
        occurredAt,
      });
      invalidate();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setIsSaving(false);
    }
  };

  const applyAction = async () => {
    if (!action || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      if (action === 'cancel') await repository.deletePlannedTimelineEvent(entry.id);
      else await repository.revertConfirmedTimelineEvent(entry.id);
      invalidate();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setIsSaving(false);
    }
  };

  const close = () => {
    if (!isSaving) onClose();
  };

  if (action) {
    const cancelling = action === 'cancel';
    const back = () => {
      if (isSaving) return;
      setError(null);
      setAction(null);
    };
    return (
      <Modal
        key="confirm-plan-action"
        title={
          cancelling
            ? t('Cancel this plan?', '取消这项计划？')
            : t('Return this event to a plan?', '将此事件恢复为计划？')
        }
        onClose={back}
      >
        <div className="modal__body">
          {error ? (
            <p className="error-banner" role="alert">
              {error}
            </p>
          ) : null}
          <p className="selectable">{entry.title}</p>
          <p className="field__hint">
            {cancelling
              ? t(
                  'This removes only this unfulfilled plan from its timelines and upcoming items. Already recorded history and linked tasks are kept.',
                  '仅从时间线和接下来事项中移除这项尚未实现的计划。已有历史和关联任务会保留。',
                )
              : t(
                  `This undoes its confirmation and returns it to ${formatFullDate(entry.plannedFor)}. Its wording, tracked item and target date are kept. It will no longer count as something that happened or set the current stage.`,
                  `撤销确认并恢复为 ${formatFullDate(entry.plannedFor)} 的计划。描述、跟踪对象和目标日期会保留。它将不再计为已发生的事件，也不再决定当前阶段。`,
                )}
          </p>
          {cancelling ? (
            <p className="field__hint">
              {t('Cancelling a plan cannot be undone.', '取消计划后无法撤销。')}
            </p>
          ) : null}
        </div>
        <footer className="modal__footer">
          <button type="button" className="button" onClick={back} disabled={isSaving}>
            {cancelling ? t('Keep plan', '保留计划') : t('Keep as happened', '保留已发生状态')}
          </button>
          <button
            type="button"
            className={`button ${cancelling ? 'button--danger' : 'button--primary'}`}
            onClick={() => void applyAction()}
            disabled={isSaving}
            data-autofocus="false"
          >
            {isSaving
              ? t('Saving…', '正在保存…')
              : cancelling
                ? t('Cancel plan', '取消计划')
                : t('Return to plan', '恢复为计划')}
          </button>
        </footer>
      </Modal>
    );
  }

  return (
    <Modal
      title={
        planned
          ? t('Edit plan', '编辑计划')
          : editable
            ? t('Edit event', '编辑事件')
            : t('Manage confirmed plan', '管理已确认的计划')
      }
      description={
        planned
          ? t(
              'Change the wording, or move the date you are working towards.',
              '修改描述，或调整计划日期。',
            )
          : editable
            ? t(
                'Fix the wording, or file it at the time it actually happened.',
                '修改描述，或更正实际发生的时间。',
              )
            : t(
                'This milestone or minor entry keeps its recorded wording. A mistaken confirmation can be undone.',
                '这条里程碑或简短记录会保留原有描述。误操作的确认可以撤销。',
              )
      }
      onClose={close}
    >
      <form onSubmit={submit}>
        <div className="modal__body">
          {error ? (
            <p className="error-banner" role="alert">
              {error}
            </p>
          ) : null}

          {editable ? (
            <>
              <div className="field">
                <label className="field__label" htmlFor="edit-event-title">
                  {planned
                    ? t('What is planned', '计划做什么')
                    : t('What happened', '发生了什么')}
                </label>
                <input
                  id="edit-event-title"
                  className="input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="edit-event-summary">
                  {t('Details', '详情')}{' '}
                  <span className="field__hint">{t('Optional', '选填')}</span>
                </label>
                <textarea
                  id="edit-event-summary"
                  className="input input--textarea"
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  rows={2}
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="edit-event-reflection">
                  {t('Why?', '为什么？')}{' '}
                  <span className="field__hint">{t('Optional', '选填')}</span>
                </label>
                <textarea
                  id="edit-event-reflection"
                  className="input input--textarea"
                  value={reflection}
                  onChange={(event) => setReflection(event.target.value)}
                  rows={2}
                />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <div className="field" style={{ flex: 1 }}>
                  <label className="field__label" htmlFor="edit-event-date">
                    {planned ? t('Deadline', '截止日期') : t('When', '日期')}
                  </label>
                  <input
                    id="edit-event-date"
                    type="date"
                    className="input"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    aria-invalid={date.trim() !== '' && occurredAt === null}
                  />
                </div>
                <div className="field" style={{ width: 120 }}>
                  <label className="field__label" htmlFor="edit-event-time">
                    {t('Time', '时间')}
                  </label>
                  <input
                    id="edit-event-time"
                    type="time"
                    className="input"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <p className="selectable">{entry.title}</p>
          )}

          {planned || revertible ? (
            <div className="edit-event__plan-action">
              <p className="field__hint">
                {planned
                  ? t('No longer going ahead?', '不再继续这项计划？')
                  : t('Marked as happened by mistake?', '误标记为已发生？')}
              </p>
              <button
                type="button"
                className="button button--outline"
                disabled={isSaving}
                onClick={() => {
                  setError(null);
                  setAction(planned ? 'cancel' : 'revert');
                }}
                data-autofocus="false"
              >
                {planned ? t('Cancel plan…', '取消计划…') : t('Return to plan…', '恢复为计划…')}
              </button>
            </div>
          ) : null}
        </div>

        <footer className="modal__footer">
          {blockedReason ? <span className="modal__footer-hint">{blockedReason}</span> : null}
          <button
            type="button"
            className="button"
            onClick={close}
            disabled={isSaving}
            data-autofocus={editable ? 'false' : undefined}
          >
            {editable ? t('Cancel', '取消') : t('Close', '关闭')}
          </button>
          {editable ? (
            <button type="submit" className="button button--primary" disabled={!canSubmit}>
              {isSaving ? t('Saving…', '正在保存…') : t('Save changes', '保存修改')}
            </button>
          ) : null}
        </footer>
      </form>
    </Modal>
  );
}

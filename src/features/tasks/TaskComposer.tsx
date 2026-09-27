/**
 * One-line task entry. A title is all that is required; a task created inside a
 * journey inherits that journey (USER_FLOWS.md Flow E).
 *
 * A due date is optional and hidden until asked for, because most tasks do not
 * have one — but the ones that do are what "Up next" reads, so there has to be a
 * way to set it.
 */

import { useState } from 'react';
import { CalendarPlus, Plus, X } from 'lucide-react';

import { useInvalidate, useRepository } from '@/data/RepositoryContext';
import { fromDateTimeInputs } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';

interface Props {
  journeyId?: string;
  placeholder?: string;
  onCreated?: () => void;
}

export function TaskComposer({ journeyId, placeholder, onCreated }: Props) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();

  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isDatingTask, setDatingTask] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A typed-but-unparseable date must not silently create an undated task.
  const dueAt = dueDate.trim() ? fromDateTimeInputs(dueDate) : null;
  const dueDateIsInvalid = dueDate.trim().length > 0 && dueAt === null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || isSaving || dueDateIsInvalid) return;

    setIsSaving(true);
    setError(null);
    try {
      await repository.createTask({
        title: trimmed,
        ...(journeyId ? { journeyId } : {}),
        ...(dueAt ? { dueAt } : {}),
      });
      setTitle('');
      setDueDate('');
      setDatingTask(false);
      invalidate();
      onCreated?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <form className="composer" onSubmit={submit}>
        <input
          className="composer__input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={placeholder ?? t('Add a task…', '添加任务…')}
          aria-label={t('New task', '新建任务')}
        />

        {isDatingTask ? (
          <span className="composer__date">
            <input
              type="date"
              className="composer__date-input"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              aria-label={t('Due date', '截止日期')}
              aria-invalid={dueDateIsInvalid}
              autoFocus
            />
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                setDueDate('');
                setDatingTask(false);
              }}
              title={t('Remove due date', '移除截止日期')}
              aria-label={t('Remove due date', '移除截止日期')}
            >
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="icon-button"
            onClick={() => setDatingTask(true)}
            title={t('Add a due date', '添加截止日期')}
            aria-label={t('Add a due date', '添加截止日期')}
          >
            <CalendarPlus size={15} strokeWidth={2} aria-hidden />
          </button>
        )}

        <button
          type="submit"
          className="button button--outline"
          disabled={!title.trim() || isSaving || dueDateIsInvalid}
        >
          <Plus size={14} strokeWidth={2} aria-hidden />
          {t('Add', '添加')}
        </button>
      </form>
      {error ? <p className="error-banner">{error}</p> : null}
    </>
  );
}

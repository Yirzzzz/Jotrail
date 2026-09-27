/**
 * Confirmation for deleting a journey.
 *
 * Deletion is irreversible, so the dialog states plainly what survives and what
 * does not, with real counts rather than a vague warning. Archiving is offered
 * alongside, because "I want this out of my sidebar" is the more common wish and
 * it loses nothing.
 */

import { useState } from 'react';
import { Archive, Trash2 } from 'lucide-react';

import { Modal } from '@/components/Modal';
import { useInvalidate, useRepoQuery, useRepository } from '@/data/RepositoryContext';
import type { Journey } from '@/domain/types';
import { useI18n } from '@/lib/i18n';

interface Props {
  journey: Journey;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteJourneyDialog({ journey, onClose, onDeleted }: Props) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();

  const notes = useRepoQuery((repo) => repo.listNotes({ journeyId: journey.id }), [journey.id]);
  const tasks = useRepoQuery((repo) => repo.listTasks({ journeyId: journey.id }), [journey.id]);
  const entries = useRepoQuery(
    (repo) => repo.listTimeline({ journeyId: journey.id }),
    [journey.id],
  );

  const [isWorking, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noteCount = notes.data?.length ?? 0;
  const taskCount = tasks.data?.length ?? 0;
  const entryCount = entries.data?.length ?? 0;

  const run = async (action: 'delete' | 'archive') => {
    setWorking(true);
    setError(null);
    try {
      if (action === 'delete') {
        await repository.deleteJourney(journey.id);
      } else {
        await repository.setJourneyStatus(journey.id, 'archived');
      }
      invalidate();
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setWorking(false);
    }
  };

  const kept: string[] = [];
  if (noteCount > 0)
    kept.push(t(`${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`, `${noteCount} 篇笔记`));
  if (taskCount > 0)
    kept.push(t(`${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`, `${taskCount} 项任务`));

  return (
    <Modal
      title={t(`Delete “${journey.title}”?`, `删除“${journey.title}”？`)}
      onClose={onClose}
    >
      <div className="modal__body">
        {error ? <p className="error-banner">{error}</p> : null}

        <p style={{ color: 'var(--ink-secondary)', lineHeight: 1.7 }}>
          {entryCount > 0
            ? t(
                `This Journey’s timeline — ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'} — will be gone for good.`,
                `此旅程的时间线（共 ${entryCount} 条记录）将被永久删除。`,
              )
            : t('This Journey has no timeline history yet.', '此旅程还没有时间线记录。')}
        </p>

        {kept.length > 0 ? (
          <p style={{ color: 'var(--ink-secondary)', lineHeight: 1.7 }}>
            {t(
              `Your ${kept.join(' and ')} will be kept and become unfiled — you can find them under Notes and link them elsewhere.`,
              `你的${kept.join('和')}会被保留，并取消与此旅程的关联。你可以在笔记中找到它们，再关联到其他旅程。`,
            )}
          </p>
        ) : null}

        <p className="field__hint">
          {t(
            'Prefer Archive if you only want it out of the way: it keeps everything and can be undone.',
            '如果只是想暂时收起这个旅程，可以选择归档。所有内容都会保留，之后也能恢复。',
          )}
        </p>
      </div>

      <footer className="modal__footer">
        <button type="button" className="button" onClick={onClose} data-autofocus="false">
          {t('Cancel', '取消')}
        </button>
        <button
          type="button"
          className="button button--outline"
          onClick={() => void run('archive')}
          disabled={isWorking}
          data-autofocus="false"
        >
          <Archive size={14} strokeWidth={2} aria-hidden />
          {t('Archive instead', '改为归档')}
        </button>
        <button
          type="button"
          className="button button--danger"
          onClick={() => void run('delete')}
          disabled={isWorking}
          data-autofocus="false"
        >
          <Trash2 size={14} strokeWidth={2} aria-hidden />
          {isWorking ? t('Deleting…', '正在删除…') : t('Delete', '删除')}
        </button>
      </footer>
    </Modal>
  );
}

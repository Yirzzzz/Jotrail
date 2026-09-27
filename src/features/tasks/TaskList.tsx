/**
 * Lightweight task list. Completing a task records a timeline event, which is
 * the entire reason tasks exist in this product — they enrich a journey's
 * history without the app becoming a task manager (MVP_PLAN.md milestone 5).
 */

import { useState } from 'react';
import { Check, FolderPlus, Trash2 } from 'lucide-react';

import { JourneyIcon } from '@/components/JourneyIcon';
import { useInvalidate, useRepoQuery, useRepository } from '@/data/RepositoryContext';
import type { TaskWithLinks } from '@/domain/types';
import { differenceInLocalDays, formatShortDate, toDate } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';

interface Props {
  tasks: TaskWithLinks[];
  /** Journey badges are useful outside a journey, noise inside one. */
  showJourneys?: boolean;
  /**
   * Offer "file into a Journey" on each row. Used outside a journey, where a
   * task may not belong to one yet.
   */
  allowFiling?: boolean;
  onChanged?: () => void;
  emptyState?: React.ReactNode;
}

export function TaskList({
  tasks,
  showJourneys = false,
  allowFiling = false,
  onChanged,
  emptyState,
}: Props) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();
  const [error, setError] = useState<string | null>(null);
  const [filingTaskId, setFilingTaskId] = useState<string | null>(null);

  // Only read journeys when the filing menu can actually appear.
  const journeys = useRepoQuery(
    (repo) => (allowFiling ? repo.listJourneys() : Promise.resolve([])),
    [allowFiling],
  );

  if (tasks.length === 0) return <>{emptyState ?? null}</>;

  const toggle = async (task: TaskWithLinks) => {
    setError(null);
    try {
      await repository.setTaskStatus(task.id, task.status === 'done' ? 'todo' : 'done');
      invalidate();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const remove = async (task: TaskWithLinks) => {
    setError(null);
    try {
      await repository.deleteTask(task.id);
      invalidate();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  /** File an existing task into a journey — the task equivalent of D-008. */
  const file = async (task: TaskWithLinks, journeyId: string) => {
    setFilingTaskId(null);
    setError(null);
    try {
      await repository.linkTaskToJourney(task.id, journeyId);
      invalidate();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <>
      {error ? <p className="error-banner">{error}</p> : null}

      <ul className="task-list">
        {tasks.map((task) => {
          const done = task.status === 'done';
          return (
            <li key={task.id} className={`task-row ${done ? 'task-row--done' : ''}`}>
              <button
                type="button"
                className="task-row__checkbox"
                role="checkbox"
                aria-checked={done}
                onClick={() => void toggle(task)}
                title={done ? t('Reopen task', '重新打开任务') : t('Complete task', '完成任务')}
                aria-label={
                  done
                    ? t(`Reopen ${task.title}`, `重新打开 ${task.title}`)
                    : t(`Complete ${task.title}`, `完成 ${task.title}`)
                }
              >
                <Check size={12} strokeWidth={3} aria-hidden />
              </button>

              <div className="task-row__main">
                <div className="task-row__title selectable">{task.title}</div>
                <div className="task-row__meta">
                  {task.dueAt && !done ? <DueLabel dueAt={task.dueAt} /> : null}
                  {done && task.completedAt ? (
                    <span>
                      {t(
                        `Completed ${formatShortDate(task.completedAt)}`,
                        `完成于 ${formatShortDate(task.completedAt)}`,
                      )}
                    </span>
                  ) : null}
                  {showJourneys
                    ? task.journeys.map((journey) => (
                        <span key={journey.id} className="pill">
                          <JourneyIcon name={journey.icon} size={11} />
                          {journey.title}
                        </span>
                      ))
                    : null}
                </div>
              </div>

              <div className="task-row__actions">
                {allowFiling ? (
                  <div className="task-row__file">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setFilingTaskId(filingTaskId === task.id ? null : task.id)}
                      title={t('Add to a Journey', '添加到旅程')}
                      aria-label={t(
                        `Add ${task.title} to a Journey`,
                        `将 ${task.title} 添加到旅程`,
                      )}
                      aria-expanded={filingTaskId === task.id}
                    >
                      <FolderPlus size={13} strokeWidth={2} aria-hidden />
                    </button>

                    {filingTaskId === task.id ? (
                      <div className="task-row__file-menu">
                        {(() => {
                          const available = (journeys.data ?? []).filter(
                            (journey) =>
                              !task.journeys.some((linked) => linked.id === journey.id),
                          );
                          if (available.length === 0) {
                            return (
                              <p className="link-menu__empty">
                                {journeys.data?.length
                                  ? t('Already in every Journey.', '已添加到所有旅程。')
                                  : t('No Journeys yet.', '还没有旅程。')}
                              </p>
                            );
                          }
                          return available.map((journey) => (
                            <button
                              key={journey.id}
                              type="button"
                              className="link-menu__item"
                              onClick={() => void file(task, journey.id)}
                            >
                              <JourneyIcon name={journey.icon} size={14} />
                              {journey.title}
                            </button>
                          ));
                        })()}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="button"
                  className="icon-button"
                  onClick={() => void remove(task)}
                  title={t('Delete task', '删除任务')}
                  aria-label={t(`Delete ${task.title}`, `删除 ${task.title}`)}
                >
                  <Trash2 size={13} strokeWidth={2} aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function DueLabel({ dueAt }: { dueAt: string }) {
  const { t } = useI18n();
  const date = toDate(dueAt);
  if (!date) return null;

  // Positive means the due date is behind us.
  const daysLate = differenceInLocalDays(date, new Date());
  const overdue = daysLate > 0;

  let text: string;
  if (daysLate === 0) text = t('Due today', '今天截止');
  else if (daysLate === 1) text = t('Due yesterday', '昨天截止');
  else if (overdue)
    text = t(`Overdue · ${formatShortDate(dueAt)}`, `已逾期 · ${formatShortDate(dueAt)}`);
  else text = t(`Due ${formatShortDate(dueAt)}`, `${formatShortDate(dueAt)} 截止`);

  return <span className={overdue ? 'task-row__due--overdue' : undefined}>{text}</span>;
}

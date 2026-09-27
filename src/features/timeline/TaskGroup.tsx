/**
 * Several task events on one day, as a single block.
 *
 * This is the "task group" density from `PRODUCT_SPEC.md` §9. Without it, a
 * journey with daily tasks becomes a wall of one-line rows and the entries that
 * actually carry meaning — notes, state changes, milestones — get lost among
 * them.
 */

import { Check, Plus, RotateCcw } from 'lucide-react';

import { JourneyIcon } from '@/components/JourneyIcon';
import type { TimelineEntry } from '@/domain/types';
import { formatTimeOfDay } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';

const ICONS = {
  task_added: Plus,
  task_completed: Check,
  task_reopened: RotateCcw,
} as const;

function iconFor(eventType: string) {
  return ICONS[eventType as keyof typeof ICONS] ?? Check;
}

export function TaskGroup({
  entries,
  showJourneys = false,
}: {
  entries: TimelineEntry[];
  showJourneys?: boolean;
}) {
  const { t } = useI18n();
  // Journey badges belong on the group, not repeated on every row.
  const journeys = showJourneys
    ? [...new Map(entries.flatMap((e) => e.journeys).map((j) => [j.id, j])).values()]
    : [];

  const completed = entries.filter((entry) => entry.eventType === 'task_completed').length;
  const added = entries.filter((entry) => entry.eventType === 'task_added').length;

  /*
   * The heading stays the plain noun. It was briefly "Tasks completed", which
   * read well but put the word *complete* on a Journey screen — the exact
   * progress-completion vocabulary the product refuses (AGENTS.md §7), and the
   * journey-screen test guards against. The count line below already says how
   * many are done.
   */
  // "2 done · 1 added" — what happened, at a glance.
  const parts: string[] = [];
  if (completed > 0) parts.push(t(`${completed} done`, `${completed} 项完成`));
  if (added > 0) parts.push(t(`${added} added`, `${added} 项新增`));
  const summary = parts.join(' · ');

  return (
    <div className="entry entry--tasks">
      <div className="task-group__surface">
        <div className="task-group__head">
          <span className="section-label task-group__label">
            <Check size={11} strokeWidth={2.5} aria-hidden />
            {t('Tasks', '任务')}
          </span>
          {/* One string, not interpolated fragments — otherwise it renders as
              several text nodes and reads as broken-up text to anything
              inspecting it, including tests. */}
          {summary ? <span className="entry__time">{summary}</span> : null}
        </div>

        <ul className="task-group">
          {entries.map((entry) => {
            const Icon = iconFor(entry.eventType);
            const done = entry.eventType === 'task_completed';
            return (
              <li
                key={entry.id}
                className={`task-group__row ${done ? 'task-group__row--done' : ''}`}
              >
                <span className="task-group__icon">
                  <Icon size={13} strokeWidth={done ? 2.5 : 2} aria-hidden />
                </span>
                <span className="task-group__title selectable">{entry.title}</span>
                <span className="task-group__time">{formatTimeOfDay(entry.occurredAt)}</span>
              </li>
            );
          })}
        </ul>

        {journeys.length > 0 ? (
          <div className="entry__journeys">
            {journeys.map((journey) => (
              <span key={journey.id} className="pill">
                <JourneyIcon name={journey.icon} size={11} />
                {journey.title}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

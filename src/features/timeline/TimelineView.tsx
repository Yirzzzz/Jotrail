/**
 * Chronological month → day → entries layout, shared by the journey timeline and
 * the global timeline. Both read the same event records (DECISIONS.md D-005);
 * only the scope and the journey badges differ.
 */

import { groupByMonthAndDay, groupTaskRuns } from '@/domain/timeline';
import type { TimelineEntry } from '@/domain/types';
import { useI18n } from '@/lib/i18n';
import {
  formatDayOfMonth,
  formatMonthAbbrev,
  formatMonthHeading,
  formatWeekdayShort,
  localMonthKey,
} from '@/lib/datetime';
import { TaskGroup } from './TaskGroup';
import { TimelineEntryView } from './TimelineEntryView';
import './Timeline.css';

interface Props {
  entries: TimelineEntry[];
  showJourneys?: boolean;
  /** The current turning point — given the accent edge from the timeline reference. */
  highlightId?: string;
  onOpenEntry?: (entry: TimelineEntry) => void;
  /** Passed to every entry; each decides for itself whether it qualifies. */
  onEditEntry?: (entry: TimelineEntry) => void;
  /** Same: only planned entries render the "It happened" action. */
  onMarkEntryHappened?: (entry: TimelineEntry) => void;
  emptyState?: React.ReactNode;
}

export function TimelineView({
  entries,
  showJourneys = false,
  highlightId,
  onOpenEntry,
  onEditEntry,
  onMarkEntryHappened,
  emptyState,
}: Props) {
  useI18n();
  const months = groupByMonthAndDay(entries);

  if (months.length === 0) {
    return <>{emptyState ?? null}</>;
  }

  return (
    <div className="timeline">
      {months.map((month) => (
        <section key={month.key} className="timeline__month">
          <header className="timeline__month-heading">
            <h2 className="section-label">{formatMonthHeading(month.occurredAt)}</h2>
            <span className="timeline__month-rule" aria-hidden />
          </header>

          {month.days.map((day) => {
            // Show the month abbreviation on the rail only when the day's month
            // differs from its heading — rare, but it keeps the rail unambiguous
            // for anyone reading a single day out of context.
            const showMonthOnRail = localMonthKey(day.occurredAt) !== month.key;

            return (
              <div key={day.key} className="timeline__day">
                <div className="timeline__date">
                  {showMonthOnRail ? (
                    <div className="timeline__date-month">
                      {formatMonthAbbrev(day.occurredAt)}
                    </div>
                  ) : null}
                  <div className="timeline__date-day">{formatDayOfMonth(day.occurredAt)}</div>
                  <div className="timeline__date-weekday">
                    {formatWeekdayShort(day.occurredAt)}
                  </div>
                </div>

                <div className="timeline__entries">
                  {groupTaskRuns(day.entries).map((block) =>
                    block.kind === 'tasks' ? (
                      <TaskGroup
                        key={`tasks-${block.entries[0]?.id}`}
                        entries={block.entries}
                        showJourneys={showJourneys}
                      />
                    ) : (
                      <TimelineEntryView
                        key={block.entry.id}
                        entry={block.entry}
                        showJourneys={showJourneys}
                        highlighted={block.entry.id === highlightId}
                        onOpen={onOpenEntry}
                        onEdit={onEditEntry}
                        onMarkHappened={onMarkEntryHappened}
                      />
                    ),
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

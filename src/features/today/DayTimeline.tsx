/**
 * Today, as a table.
 *
 * Three columns — time, activity, journey — sharing the head row that
 * `TodayScreen` prints above them. The previous version gave every entry a
 * bordered card with an icon chip, which is right on the Timeline screen where an
 * entry carries a reflection, a state change and a task list. Here the rows are
 * one line each, so cards were 60px of chrome around 20px of text.
 *
 * The pip in the time column is the entry's Journey colour, which is the same
 * signal the tag on the right carries. Colour is never alone: the tag names the
 * Journey in words beside it.
 */

import { JourneyIcon } from '@/components/JourneyIcon';
import { eventTypeLabel } from '@/domain/timeline';
import type { TimelineEntry } from '@/domain/types';
import { formatTimeOfDay } from '@/lib/datetime';
import { penStyle } from '@/lib/pens';
import { useI18n } from '@/lib/i18n';
import { EventImageGallery } from '@/features/timeline/EventImages';

interface Props {
  entries: TimelineEntry[];
  onOpenEntry: (entry: TimelineEntry) => void;
}

export function DayTimeline({ entries, onOpenEntry }: Props) {
  const { t } = useI18n();
  return (
    <ol className="day">
      {entries.map((entry) => {
        const openable = entry.sourceType === 'note' && Boolean(entry.sourceId);
        /*
         * The row takes its first Journey's pen. An entry in two Journeys shows
         * both tags; the pip follows the first, which is the one the tags lead
         * with too.
         */
        const channelPen = entry.journeys[0] ? penStyle(entry.journeys[0].id) : undefined;

        const body = (
          <>
            {/*
             * The pip has the head row's chip column to itself, so the times
             * below line up under TIME rather than under the chip.
             */}
            <span className="day__pip" aria-hidden />

            <span className="day__time">{formatTimeOfDay(entry.occurredAt)}</span>

            <span className="day__activity">
              <span className="day__title selectable">{entry.title}</span>
              {entry.summary ? (
                <span className="day__summary selectable">{entry.summary}</span>
              ) : null}
            </span>

            <span className="day__journeys">
              {entry.journeys.map((journey) => (
                <span
                  key={journey.id}
                  className="pill pill--channel"
                  style={penStyle(journey.id)}
                >
                  <JourneyIcon name={journey.icon} size={10} />
                  {journey.title}
                </span>
              ))}
            </span>
          </>
        );

        return (
          <li key={entry.id} className="day__row" style={channelPen}>
            {openable ? (
              <button
                type="button"
                className="day__button"
                onClick={() => onOpenEntry(entry)}
                aria-label={t(`Open ${entry.title}`, `打开 ${entry.title}`)}
              >
                {body}
              </button>
            ) : (
              <div className="day__button day__button--static">{body}</div>
            )}
            {!openable && entry.images.length > 0 ? (
              <div className="day__images">
                <EventImageGallery images={entry.images} title={entry.title} />
              </div>
            ) : null}
            <span className="visually-hidden">{eventTypeLabel(entry)}</span>
          </li>
        );
      })}
    </ol>
  );
}

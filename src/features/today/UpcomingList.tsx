/**
 * "Up next" — the reference's 接下来 panel.
 *
 * Only real dates: task due dates and events the user already placed in the
 * future. The countdown is arithmetic on those dates, not an estimate the app
 * invented.
 *
 * Today and overdue *tasks* are deliberately absent — they appear as due work
 * above, and listing them twice on one screen would make one task look like two.
 * Planned events are the exception: nothing else on Today shows them, so a
 * deadline that falls today or has already passed appears here rather than
 * vanishing on the day it matters most.
 */

import type { UpcomingItem } from '@/domain/upcoming';
import { formatShortDate } from '@/lib/datetime';
import { translate, useI18n } from '@/lib/i18n';

export function UpcomingList({ items }: { items: UpcomingItem[] }) {
  useI18n();
  return (
    <ul className="upcoming">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`} className="upcoming__row">
          <span className="upcoming__main">
            <span className="upcoming__title selectable">{item.title}</span>
            {item.journeys.length > 0 ? (
              <span className="upcoming__journeys">{item.journeys.join(' · ')}</span>
            ) : null}
          </span>

          <span className="upcoming__when">
            <span className="upcoming__date">{formatShortDate(item.at)}</span>
            {/*
              An unmet deadline is the one thing in this panel that needs to catch
              the eye, and the word "Overdue" says so on its own — the colour only
              reinforces it.
            */}
            <span
              className="upcoming__countdown"
              style={item.daysAway < 0 ? { color: 'var(--warning)' } : undefined}
            >
              {formatCountdown(item.daysAway)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * `1` → `Tomorrow`, `3` → `3 days left`, `0` → `Today`, `-2` → `2 days late`.
 *
 * The negative cases only arise for planned events; a task never reaches this
 * list until it is at least a day out.
 */
function formatCountdown(daysAway: number): string {
  if (daysAway === 0) return translate('Today', '今天');
  if (daysAway === 1) return translate('Tomorrow', '明天');
  if (daysAway === -1) return translate('1 day late', '已逾期 1 天');
  if (daysAway < 0)
    return translate(`${Math.abs(daysAway)} days late`, `已逾期 ${Math.abs(daysAway)} 天`);
  return translate(`${daysAway} days left`, `还有 ${daysAway} 天`);
}

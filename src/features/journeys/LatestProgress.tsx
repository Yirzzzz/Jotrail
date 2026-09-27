/**
 * Latest progress — the horizontal path from the overview reference.
 *
 * Nodes are real turning points (start, state changes, milestones). The wave
 * connects them; it does not plot a quantity. Y is decoration. X is order.
 */

import { useId, type CSSProperties } from 'react';
import { Sparkles } from 'lucide-react';

import { formatCompactDate } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';
import { formatStateValue } from '@/domain/timeline';
import type { DevelopmentPoint } from '@/domain/development';

interface Props {
  points: DevelopmentPoint[];
  onSelectPoint?: (id: string) => void;
}

export function LatestProgress({ points, onSelectPoint }: Props) {
  const { t } = useI18n();
  const headingId = useId();

  /*
   * One point is worth drawing: a journey created today with its first progress
   * recorded is the commonest case there is, and it used to render nothing at
   * all. Zero points still renders nothing — there is genuinely no path yet.
   */
  if (points.length === 0) return null;

  return (
    <section className="progress" aria-labelledby={headingId}>
      <h2 id={headingId} className="progress__heading">
        {t('Latest progress', '最新进展')}
      </h2>

      <div className="progress__board">
        <div className="progress__scroller">
          <div
            className="progress__track"
            style={{ '--progress-count': points.length } as CSSProperties}
          >
            <svg
              className="progress__wave"
              viewBox="0 0 100 24"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path
                className="progress__wave-glow"
                d={WAVE_PATH}
                fill="none"
                strokeWidth="4.5"
                strokeLinecap="round"
              />
              <path
                className="progress__wave-line"
                d={WAVE_PATH}
                fill="none"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>

            <ol className="progress__points">
              {points.map((point, index) => {
                const isLast = index === points.length - 1;
                const selectable = Boolean(onSelectPoint) && point.kind !== 'start';
                const date = isLast ? t('Now', '现在') : formatCompactDate(point.occurredAt);

                const body = (
                  <>
                    <span className="progress__date">{date}</span>
                    {isLast ? (
                      <span className="progress__node progress__node--now" aria-hidden>
                        <Sparkles size={10} strokeWidth={2.4} />
                      </span>
                    ) : (
                      <span
                        className={`progress__node progress__node--${point.kind}`}
                        aria-hidden
                      />
                    )}
                    <span className="progress__label" title={point.label}>
                      {point.label}
                    </span>
                    {point.transition?.to ? (
                      <span className="progress__change">
                        {formatStateValue(point.transition.to)}
                      </span>
                    ) : null}
                  </>
                );

                return (
                  <li
                    key={point.id}
                    className="progress__point"
                    aria-current={isLast ? 'step' : undefined}
                  >
                    {selectable ? (
                      <button
                        type="button"
                        className="progress__hit"
                        aria-label={`${point.label}, ${date}`}
                        onClick={() => onSelectPoint?.(point.id)}
                      >
                        {body}
                      </button>
                    ) : (
                      <div className="progress__hit progress__hit--static">{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A gentle twice-through wave; nodes sit on the row, the path weaves behind. */
const WAVE_PATH = 'M 0 14 C 8 6, 17 22, 25 14 S 33 6, 50 14 S 67 22, 75 14 S 83 6, 100 14';

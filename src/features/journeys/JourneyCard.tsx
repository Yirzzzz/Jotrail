/**
 * A Journey as a card.
 *
 * Two variants, and they are genuinely different objects rather than one card at
 * two sizes:
 *
 * - `rail` is a row in the margin: a 3px pen bar down the leading edge, the icon
 *   and title, its real counts, and the Journey's own trace at thumbnail scale.
 *   The trace is the point — it is what makes three Journeys in a list
 *   distinguishable at a glance, and it is real data, not decoration.
 * - `board` is a tile on a grid: the same information with room to breathe and a
 *   status pill, since a board is where status is being compared.
 *
 * Counts are of notes and tasks that actually link here. Nothing is a
 * percentage, and nothing is a progress bar (D-007).
 */

import { ChartTrace } from '@/components/ChartTrace';
import { JourneyIcon } from '@/components/JourneyIcon';
import { StatusPill } from '@/components/StatusPill';
import { samplesForWindow, type TraceWindow } from '@/domain/trace';
import type { Journey, TimelineEntry } from '@/domain/types';
import { penStyle } from '@/lib/pens';
import { translate, useI18n } from '@/lib/i18n';
import './Journey.css';

interface Props {
  journey: Journey;
  /**
   * What the card reports under the title. A Journey's "size" is a different
   * question on different screens — Today asks how much is filed in it, the
   * Timeline asks how much happened in it — so the caller supplies the figures
   * and their nouns rather than the card assuming notes and tasks.
   */
  counts: { label: string; value: number }[];
  variant?: 'board' | 'rail';
  /**
   * The Journey's own events. Given, the rail card draws its trace; omitted, the
   * card simply has no trace rather than an invented one.
   */
  entries?: TimelineEntry[];
  onOpen: (journeyId: string) => void;
}

export function JourneyCard({ journey, counts, variant = 'board', entries, onOpen }: Props) {
  const { t } = useI18n();
  const isRail = variant === 'rail';
  const window = spanOf(journey);
  const samples = entries ? samplesForWindow(entries, window) : [];

  return (
    <button
      type="button"
      className={`journey-card journey-card--${variant}`}
      style={penStyle(journey.id)}
      onClick={() => onOpen(journey.id)}
    >
      <span className="journey-card__main">
        <span className="journey-card__head">
          <span className="journey-card__icon" aria-hidden>
            <JourneyIcon name={journey.icon} size={isRail ? 13 : 15} />
          </span>
          <span className="journey-card__title">{journey.title}</span>
        </span>

        <span className="journey-card__foot">
          <span className="journey-card__counts">{formatCounts(counts)}</span>
          {isRail ? null : <StatusPill status={journey.status} />}
        </span>
      </span>

      {/*
       * A thumbnail of the real trace. Two marks cannot describe a shape, so
       * below that the card shows nothing rather than a straight line implying
       * steadiness it has no evidence for.
       */}
      {isRail && samples.length > 2 ? (
        <span className="journey-card__trace">
          <ChartTrace
            samples={samples}
            window={window}
            showStylus={false}
            height={28}
            label={t(
              `${journey.title}: ${samples.length} marks since it started.`,
              `${journey.title}：开始以来共 ${samples.length} 条记录。`,
            )}
          />
        </span>
      ) : null}
    </button>
  );
}

/**
 * The window the thumbnail spans: the Journey's start to its end, or to now
 * while it is still running. Floored at one day so a same-day Journey does not
 * collapse every mark onto one pixel.
 */
function spanOf(journey: Journey): TraceWindow {
  const oneDay = 24 * 60 * 60 * 1000;
  const fromMs = Date.parse(journey.startedAt);
  const toMs = journey.endedAt ? Date.parse(journey.endedAt) : Date.now();

  const safeFrom = Number.isFinite(fromMs) ? fromMs : Date.now() - oneDay;
  const safeTo = Number.isFinite(toMs) ? toMs : Date.now();

  return { fromMs: safeFrom, toMs: Math.max(safeTo, safeFrom + oneDay) };
}

/** `2 notes · 1 task`. Naive pluralisation, which is correct for these nouns. */
function formatCounts(counts: { label: string; value: number }[]): string {
  return counts
    .map(({ label, value }) => {
      const nouns: Record<string, string> = {
        note: '篇笔记',
        task: '项任务',
        entry: '条记录',
        mark: '条记录',
        event: '个事件',
        milestone: '个里程碑',
      };
      return translate(
        `${value} ${value === 1 ? label : `${label}s`}`,
        `${value} ${nouns[label] ?? label}`,
      );
    })
    .join(' · ');
}

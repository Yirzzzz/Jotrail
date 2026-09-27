/**
 * The multi-pen sheet — the recorder with all its channels on one paper.
 *
 * This is the signature view, and the reason the world is a *multi*-pen
 * recorder rather than a single trace: each Journey gets its own band on a
 * shared time axis, drawn in its own pen, and one stylus crosses every band at
 * the present moment. Reading down a column tells you what a given hour looked
 * like across your whole life; reading across a band tells you how one thread
 * moved.
 *
 * Bands rather than overlaid lines, deliberately: four traces sharing one
 * baseline cross and obscure each other, and then colour becomes the only way
 * to tell them apart. Separate bands stay legible with no colour at all — each
 * one is labelled, and its Lucide icon sits beside the label.
 */

import { useMemo } from 'react';

import { ChartTrace } from '@/components/ChartTrace';
import { JourneyIcon } from '@/components/JourneyIcon';
import { type TraceSample, type TraceWindow, samplesForWindow } from '@/domain/trace';
import type { Journey, TimelineEntry } from '@/domain/types';
import { penStyle } from '@/lib/pens';
import { useI18n, type Translate } from '@/lib/i18n';

/**
 * How many channels the sheet shows at once. Four, because the instrument has
 * four pens; beyond that the paper is telling you less, not more, and the
 * remainder is stated in words instead.
 */
const MAX_BANDS = 4;

interface ChannelBand {
  key: string;
  title: string;
  icon: string | null;
  journeyId: string | null;
  samples: TraceSample[];
}

export interface SheetChartProps {
  entries: readonly TimelineEntry[];
  journeys: readonly Journey[];
  window: TraceWindow;
  /** True when the window contains the present, which draws the stylus. */
  live?: boolean;
  onOpenJourney?: (journeyId: string) => void;
}

export function SheetChart({
  entries,
  journeys,
  window: traceWindow,
  live = false,
  onOpenJourney,
}: SheetChartProps) {
  const { t } = useI18n();
  const bands = useMemo(
    () => buildBands(entries, journeys, traceWindow, t),
    [entries, journeys, traceWindow, t],
  );

  const hiddenCount = Math.max(0, countChannelsWithMarks(entries, journeys) - bands.length);

  return (
    <div className="sheet-chart">
      {bands.map((band) => (
        <div
          key={band.key}
          className="sheet-chart__band"
          style={band.journeyId ? penStyle(band.journeyId) : undefined}
        >
          {/* The channel's silkscreen label, at the left of its own band. */}
          {band.journeyId && onOpenJourney ? (
            <button
              type="button"
              className="sheet-chart__label sheet-chart__label--action"
              onClick={() => onOpenJourney(band.journeyId as string)}
            >
              <span className="sheet-chart__label-icon" aria-hidden>
                <JourneyIcon name={band.icon} size={13} />
              </span>
              <span className="sheet-chart__label-text">{band.title}</span>
            </button>
          ) : (
            <span className="sheet-chart__label">
              <span className="sheet-chart__label-text">{band.title}</span>
            </span>
          )}

          <div className="sheet-chart__lane">
            <ChartTrace
              samples={band.samples}
              window={traceWindow}
              showStylus={live}
              height={46}
              label={bandDescription(band, t)}
            />
          </div>

          <span className="readout sheet-chart__count">
            {String(band.samples.length).padStart(2, '0')}
          </span>
        </div>
      ))}

      {hiddenCount > 0 ? (
        <p className="sheet-chart__overflow readout">
          {t(
            `+${hiddenCount} more ${hiddenCount === 1 ? 'channel' : 'channels'} with marks today`,
            `另有 ${hiddenCount} 个频道今天有记录`,
          )}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One band per Journey that recorded something in the window, busiest first,
 * plus an "Unfiled" band for entries that belong to no Journey.
 *
 * A Journey with nothing in the window gets no band: an empty lane would say
 * "this thread is dead" when it only means "nothing happened today".
 */
function buildBands(
  entries: readonly TimelineEntry[],
  journeys: readonly Journey[],
  traceWindow: TraceWindow,
  t: Translate,
): ChannelBand[] {
  const inWindow = samplesForWindow(entries, traceWindow);
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));

  const byJourney = new Map<string, TraceSample[]>();
  const unfiled: TraceSample[] = [];

  for (const sample of inWindow) {
    const entry = entriesById.get(sample.entryId);
    if (!entry || entry.journeys.length === 0) {
      unfiled.push(sample);
      continue;
    }
    // A note linked to two Journeys marks both channels, which is true.
    for (const journey of entry.journeys) {
      const existing = byJourney.get(journey.id);
      if (existing) existing.push(sample);
      else byJourney.set(journey.id, [sample]);
    }
  }

  const journeyBands: ChannelBand[] = [...byJourney.entries()]
    .map(([journeyId, samples]) => {
      const journey = journeys.find((candidate) => candidate.id === journeyId);
      return {
        key: journeyId,
        title: journey?.title ?? t('Journey', '旅程'),
        icon: journey?.icon ?? null,
        journeyId,
        samples,
      };
    })
    .sort((left, right) => right.samples.length - left.samples.length);

  const bands = journeyBands.slice(0, MAX_BANDS);

  if (unfiled.length > 0) {
    bands.push({
      key: 'unfiled',
      title: t('Unfiled', '未归类'),
      icon: null,
      journeyId: null,
      samples: unfiled,
    });
  }

  return bands;
}

/** How many channels have marks, for the overflow line. */
function countChannelsWithMarks(
  entries: readonly TimelineEntry[],
  journeys: readonly Journey[],
): number {
  const ids = new Set<string>();
  for (const entry of entries) {
    for (const journey of entry.journeys) {
      if (journeys.some((candidate) => candidate.id === journey.id)) ids.add(journey.id);
    }
  }
  return ids.size;
}

function bandDescription(band: ChannelBand, t: Translate): string {
  const count = band.samples.length;
  return t(
    `${band.title}: ${count} ${count === 1 ? 'mark' : 'marks'}.`,
    `${band.title}：${count} 条记录。`,
  );
}

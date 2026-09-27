/**
 * Trace geometry — turning real events into the recorder's pen path.
 *
 * This is the honest core of the world, so it is worth being explicit about
 * what the drawing is allowed to mean:
 *
 * - **X is time.** Always `occurredAt`, never `createdAt`. The whole reason the
 *   schema separates them is that a note typed on Sunday about Friday belongs
 *   at Friday, and the pen has to agree.
 * - **Y is importance**, and only the three values the domain already stores:
 *   `compact`, `normal`, `milestone`. It is not engagement, productivity, or a
 *   score. A flat stretch means nothing was recorded, which is true and worth
 *   seeing.
 * - **Nothing is invented.** No smoothing that implies readings between events,
 *   no baseline drift, no synthetic activity to make a sparse week look busy.
 *   An empty window returns a flat line at rest, and the caller says so in
 *   words.
 */

import type { TimelineEntry, TimelineImportance } from './types';
import { onlyHappened } from './timeline';

/** A single pen deflection: one event, placed in the window. */
export interface TraceSample {
  /** 0–1 across the window. */
  position: number;
  /** 0–1 deflection from the baseline. */
  amplitude: number;
  entryId: string;
  occurredAt: string;
  importance: TimelineImportance;
}

export interface TraceWindow {
  fromMs: number;
  toMs: number;
}

/** A marker belongs to a peak actually drawn, not every underlying event. */
export interface TracePeak {
  sample: TraceSample;
  x: number;
  y: number;
}

export interface TraceGeometry {
  linePath: string;
  fillPath: string;
  peaks: TracePeak[];
}

/**
 * Deflection per importance. A milestone reaches full scale; a compact note
 * barely lifts the pen. Three fixed steps, because the domain has three values
 * and interpolating between them would be inventing a scale.
 */
const AMPLITUDE_BY_IMPORTANCE: Record<TimelineImportance, number> = {
  compact: 0.34,
  normal: 0.62,
  milestone: 1,
};

export function amplitudeFor(importance: TimelineImportance): number {
  return AMPLITUDE_BY_IMPORTANCE[importance];
}

/** Events inside the window, as samples, oldest first. */
export function samplesForWindow(
  entries: readonly TimelineEntry[],
  window: TraceWindow,
): TraceSample[] {
  const span = window.toMs - window.fromMs;
  if (span <= 0) return [];

  return (
    /*
     * Commitments do not deflect the pen. The trace is a record of what the
     * instrument actually wrote; a deadline is an appointment, and drawing one
     * would put a mark on the sheet for something that has not happened. An
     * overdue plan sits inside the window and would otherwise be plotted, which
     * is exactly the case that makes filtering here rather than at the call site
     * necessary.
     */
    onlyHappened(entries)
      .map((entry) => ({ entry, occurredMs: Date.parse(entry.occurredAt) }))
      // A malformed timestamp must not place a deflection at 1970.
      .filter(({ occurredMs }) => Number.isFinite(occurredMs))
      .filter(({ occurredMs }) => occurredMs >= window.fromMs && occurredMs <= window.toMs)
      .sort((left, right) => left.occurredMs - right.occurredMs)
      .map(({ entry, occurredMs }) => ({
        position: (occurredMs - window.fromMs) / span,
        amplitude: amplitudeFor(entry.importance),
        entryId: entry.id,
        occurredAt: entry.occurredAt,
        importance: entry.importance,
      }))
  );
}

/**
 * Line, fill and visible peaks in one `0 0 width height` coordinate system.
 * Keeping them together prevents a skipped deflection leaving a floating dot.
 *
 * The pen rests on a baseline and deflects at each event. Between events it
 * returns to rest, because that is what the instrument does and it is the
 * truthful reading: quiet time looks quiet.
 *
 * Each deflection is drawn as a pair of cubic segments — up to the peak, back
 * down — with the control points held close to the event so the curve reads as
 * a pen responding rather than as a smoothed data fit.
 *
 * `drawnTo` bounds how far the paper has actually passed under the pen, 0–1.
 * For a window containing the present that is NOW: the recorder cannot have
 * drawn tomorrow, and a line running to the right edge of an unfinished day
 * would claim it did. Defaults to the whole window, which is correct for any
 * window already in the past.
 */
export function traceGeometry(
  samples: readonly TraceSample[],
  width: number,
  height: number,
  drawnTo = 1,
): TraceGeometry {
  const baseline = height;
  const empty: TraceGeometry = { linePath: '', fillPath: '', peaks: [] };
  if (width <= 0 || height <= 0) return empty;

  const penLimit = Math.max(0, Math.min(1, drawnTo)) * width;
  if (penLimit <= 0) return empty;

  /**
   * Half-width of one deflection.
   *
   * Sized so the deflections for this many events fit side by side in the
   * available width, then floored at 2px so a very crowded window still shows
   * distinguishable marks rather than one solid block.
   */
  const nominalLobe = Math.max(2, Math.min(26, penLimit / (samples.length * 2.4)));

  const segments: string[] = [`M 0 ${round(baseline)}`];
  const peaks: TracePeak[] = [];
  let penX = 0;

  for (const sample of samples) {
    const centreX = sample.position * width;
    // An event beyond the drawn edge has not been reached by the pen yet.
    if (centreX > penLimit) break;

    /*
     * The pen cannot travel backwards.
     *
     * Once the previous deflection has carried the pen past this event's own
     * position, there is no room left to draw it as a separate excursion — and
     * drawing it anyway sent the path back to a peak the pen had already gone
     * by, which is what made a crowded run visibly zig-zag. Such an event is
     * skipped in both the line and its markers. The event itself is never lost:
     * it still has a row in the timeline beside the chart.
     */
    if (centreX <= penX) continue;

    // Each half is sized from the room actually available on that side.
    const riseLobe = Math.min(nominalLobe, centreX - penX);
    const fallLobe = Math.min(nominalLobe, penLimit - centreX);

    const peakY = baseline - sample.amplitude * height;
    peaks.push({ sample, x: round(centreX), y: round(peakY) });
    const startX = centreX - riseLobe;
    const endX = centreX + fallLobe;

    if (startX > penX) segments.push(`L ${round(startX)} ${round(baseline)}`);

    // Rise: control points between the foot and the peak, never behind either.
    segments.push(
      `C ${round(startX + riseLobe * 0.42)} ${round(baseline)}` +
        ` ${round(centreX - riseLobe * 0.3)} ${round(peakY)}` +
        ` ${round(centreX)} ${round(peakY)}`,
    );
    // Fall: mirrored within whatever room is left after the peak.
    segments.push(
      `C ${round(centreX + fallLobe * 0.3)} ${round(peakY)}` +
        ` ${round(endX - fallLobe * 0.42)} ${round(baseline)}` +
        ` ${round(endX)} ${round(baseline)}`,
    );

    penX = endX;
  }

  if (penX < penLimit) segments.push(`L ${round(penLimit)} ${round(baseline)}`);
  const linePath = segments.join(' ');
  return {
    linePath,
    fillPath: `${linePath} L ${round(penLimit)} ${round(height)} L 0 ${round(height)} Z`,
    peaks,
  };
}

/** The stroke alone, for callers that only need path data. */
export function tracePath(
  samples: readonly TraceSample[],
  width: number,
  height: number,
  drawnTo = 1,
): string {
  return traceGeometry(samples, width, height, drawnTo).linePath;
}

/**
 * The same path closed against the baseline, for the gradient fill under the
 * trace. Kept separate so the stroke stays a stroke.
 */
export function traceFillPath(
  samples: readonly TraceSample[],
  width: number,
  height: number,
  drawnTo = 1,
): string {
  return traceGeometry(samples, width, height, drawnTo).fillPath;
}

/** The window covering one local day. */
export function dayWindow(reference: Date): TraceWindow {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { fromMs: start.getTime(), toMs: end.getTime() };
}

/** Where NOW sits in the window, 0–1, or `null` when it is outside it. */
export function nowPosition(window: TraceWindow, now: Date = new Date()): number | null {
  const span = window.toMs - window.fromMs;
  if (span <= 0) return null;
  const position = (now.getTime() - window.fromMs) / span;
  return position < 0 || position > 1 ? null : position;
}

/** Two decimals is plenty for path data and keeps the DOM small. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

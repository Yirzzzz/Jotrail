/**
 * The pen trace — the recorder's signature mark.
 *
 * One SVG per channel: a gradient fill under a gradient stroke, an event pip at
 * each deflection peak, and the NOW stylus where the current time falls. The
 * geometry all comes from `domain/trace.ts`; this component only draws it.
 *
 * Two things it deliberately does not do:
 *
 * - It is not a sparkline. Y is the domain's three importance values, and the
 *   flat stretches are real quiet time rather than interpolation.
 * - It is never the only way to read the data. Every trace sits beside the same
 *   events in text, so the drawing is a second reading, not the only one.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { type TraceSample, type TraceWindow, nowPosition, traceGeometry } from '@/domain/trace';

/**
 * The trace is drawn in **real pixel coordinates**, measured from the element.
 *
 * The obvious approach — a fixed viewBox with `preserveAspectRatio="none"` — was
 * wrong twice over. Squashing a 1000×100 box into a 46px lane compressed every
 * deflection into two or three pixels, so the trace disappeared and only the
 * stylus line remained visible; and the non-uniform scale turned each round pip
 * into an ellipse. Measuring means one unit is one pixel, so a deflection is the
 * height it says it is and a circle stays a circle.
 */

/** Vertical padding inside the lane, so a full-scale peak is not clipped. */
const PEAK_HEADROOM = 5;

/** Until the element has been measured there is no honest geometry to draw. */
const UNMEASURED = 0;

export interface ChartTraceProps {
  samples: readonly TraceSample[];
  window: TraceWindow;
  /**
   * Pen tokens come from the container (`penStyle`), so this component never
   * knows which of the four channels it is. Defaults to the instrument's own
   * ink for a trace that belongs to no single Journey.
   */
  className?: string;
  /** Draw the NOW stylus. Only true for a window that contains the present. */
  showStylus?: boolean;
  /** Accessible summary. Required: the drawing must say what it shows. */
  label: string;
  height?: number;
  onSelectSample?: (sample: TraceSample) => void;
}

export function ChartTrace({
  samples,
  window: traceWindow,
  className,
  showStylus = false,
  label,
  height = 100,
  onSelectSample,
}: ChartTraceProps) {
  /*
   * The pen's own travel: the lane's height less the headroom that keeps a
   * milestone's peak and the stroke's round cap inside the box.
   */
  const viewHeight = height;
  const penTravel = Math.max(1, viewHeight - PEAK_HEADROOM);

  const gradientId = useId();
  const fillId = `${gradientId}-fill`;
  const strokeId = `${gradientId}-stroke`;

  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(UNMEASURED);
  const [stylusAt, setStylusAt] = useState<number | null>(() =>
    showStylus ? nowPosition(traceWindow) : null,
  );

  /**
   * Track the element's own width, so the drawing follows a resized window or a
   * collapsing rail. `useLayoutEffect` measures before paint, which avoids a
   * frame of empty lane on first render.
   */
  useLayoutEffect(() => {
    const element = svgRef.current;
    if (!element) return;

    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();

    // jsdom has no ResizeObserver; the single measurement above is enough there.
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /**
   * How far the paper has passed under the pen.
   *
   * On a live window this is NOW, so the trace stops where the pen actually is
   * rather than claiming to have drawn the rest of the day. It is extended to the
   * last recorded mark when something sits *ahead* of NOW: an entry dated later
   * today is real, the list below the sheet shows it, and a trace that stopped
   * short would contradict the text beside it. On a window already in the past
   * the whole sheet has been drawn.
   */
  const lastSampleAt = samples.length > 0 ? Math.max(...samples.map((s) => s.position)) : 0;
  const drawnTo = showStylus ? Math.max(stylusAt ?? 1, lastSampleAt) : 1;

  const {
    linePath,
    fillPath: areaPath,
    peaks,
  } = traceGeometry(samples, width, penTravel, drawnTo);

  // Paint line, fill and markers together. A stroke-only reveal left dots
  // floating ahead of the line on mount and every time the window resized.

  /** The stylus tracks real time, so it stays truthful in a long session. */
  useEffect(() => {
    if (!showStylus) {
      setStylusAt(null);
      return;
    }
    setStylusAt(nowPosition(traceWindow));
    const timer = setInterval(() => setStylusAt(nowPosition(traceWindow)), 30_000);
    return () => clearInterval(timer);
  }, [showStylus, traceWindow]);

  return (
    <svg
      ref={svgRef}
      className={`trace ${className ?? ''}`.trim()}
      // One unit is one pixel, so nothing is scaled and nothing distorts.
      viewBox={`0 0 ${Math.max(width, 1)} ${viewHeight}`}
      width={width || undefined}
      style={{ height }}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={strokeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--pen-from, var(--stylus))" />
          <stop offset="100%" stopColor="var(--pen-to, var(--stylus))" />
        </linearGradient>
        {/*
         * Vertical, so the fill fades out as it falls away from the pen.
         *
         * The top stop is deliberately substantial: at 0.16 the fill was
         * invisible against white at the sizes this actually renders at (44px in
         * a Journey header, 28px in a rail card), which left the trace reading as
         * a bare line. The fill is what makes the shape legible at a glance, so
         * it has to survive being small. It still clears to nothing at the
         * baseline, so it never competes with text set below the lane.
         */}
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--pen-from, var(--stylus))" stopOpacity="0.28" />
          <stop offset="60%" stopColor="var(--pen-to, var(--stylus))" stopOpacity="0.08" />
          <stop offset="100%" stopColor="var(--pen-to, var(--stylus))" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/*
       * The pen's travel is offset down by the headroom, so the baseline sits on
       * the lane's floor and a full-scale peak has room at the top.
       */}
      <g transform={`translate(0, ${PEAK_HEADROOM})`}>
        <path className="trace__area" d={areaPath} fill={`url(#${fillId})`} />
        <path
          className="trace__line"
          d={linePath}
          fill="none"
          stroke={`url(#${strokeId})`}
          strokeLinecap="round"
        />

        {/* Only drawn peaks get markers; crowded, skipped events leave no dots. */}
        {peaks.map(({ sample, x: cx, y: cy }) => {
          const isMilestone = sample.importance === 'milestone';
          return (
            <g key={sample.entryId} className="trace__pip-group">
              {isMilestone ? (
                <circle
                  className="trace__pip-ring"
                  cx={cx}
                  cy={cy}
                  r="5"
                  fill="none"
                  stroke="var(--pen-ink, var(--stylus))"
                  strokeWidth="1.25"
                />
              ) : null}
              <circle
                className="trace__pip"
                cx={cx}
                cy={cy}
                r={isMilestone ? 2.5 : 2}
                fill="var(--pen-ink, var(--stylus))"
                onClick={onSelectSample ? () => onSelectSample(sample) : undefined}
              />
            </g>
          );
        })}
      </g>

      {stylusAt !== null ? (
        <g className="trace__stylus" aria-hidden>
          {/* The pen arm: a full-height hairline at the present moment. */}
          <line
            x1={stylusAt * width}
            y1="0"
            x2={stylusAt * width}
            y2={viewHeight}
            stroke="var(--stylus)"
            strokeWidth="1"
            strokeOpacity="0.45"
          />
          {/* The tip itself, in contact with the paper at the baseline. */}
          <circle
            className="trace__stylus-tip"
            cx={stylusAt * width}
            cy={viewHeight - 1}
            r="3"
            fill="var(--stylus)"
          />
        </g>
      ) : null}
    </svg>
  );
}

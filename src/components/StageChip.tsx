/**
 * A stage, as a small tag in its own tone.
 *
 * The one place a stage's colour is rendered, so every surface that shows a stage
 * — register rows, timeline entries, the Overview cross-section — agrees without
 * repeating the token lookup.
 *
 * **Colour is never the only signal.** The chip always contains the stage's own
 * name, so the register reads in greyscale and for anyone who cannot separate the
 * hues — the rule `StatusPill` and `pens.ts` already follow. A tone the build does
 * not know falls back to neutral rather than rendering an invisible border, which
 * is what a hand-edited database or an older set would otherwise produce.
 */

import type { StageTone } from '@/domain/types';
import { isStageTone } from '@/domain/types';
import './StageChip.css';

/** Resolve a stored tone to one this build can render. */
export function stageTone(tone: string | null | undefined): StageTone {
  return tone && isStageTone(tone) ? tone : 'neutral';
}

/**
 * The CSS custom properties a tone resolves to, for a container that wants to
 * carry the tone itself — a card's left edge, a bar segment.
 */
export function stageToneStyle(tone: string | null | undefined): React.CSSProperties {
  const resolved = stageTone(tone);
  return {
    '--stage-ink': `var(--stage-${resolved}-ink)`,
    '--stage-wash': `var(--stage-${resolved}-wash)`,
  } as React.CSSProperties;
}

interface Props {
  label: string;
  tone?: string | null;
  /**
   * Marks a stage recorded outside the register's set — typed before the set
   * existed, or left behind by an edit. Drawn as an outline rather than a fill,
   * because it is a real value that the set does not describe.
   */
  offSet?: boolean;
  title?: string;
}

export function StageChip({ label, tone, offSet = false, title }: Props) {
  return (
    <span
      className={`stage-chip${offSet ? ' stage-chip--off-set' : ''}`}
      style={stageToneStyle(tone)}
      title={title}
    >
      {label}
    </span>
  );
}

/**
 * Pen assignment — which of the four channel gradients a Journey draws in.
 *
 * The rule is *one Journey, one pen, forever*. The pen is derived from the
 * Journey's id, so it survives restarts, reordering and renaming without
 * storing anything and without a migration. Two Journeys can share a pen once
 * there are more than four; that is honest, because the pen is a channel
 * label, not an identity claim, and the title is always present beside it.
 *
 * Colour is never the only signal. Every place a pen appears, the Journey's
 * name or its Lucide icon appears too — so the four gradients stay decoration
 * on top of a label that already works in greyscale.
 */

/** How many pens the instrument carries. Matches `--pen-N-*` in tokens.css. */
export const PEN_COUNT = 4;

export type PenIndex = 1 | 2 | 3 | 4;

/**
 * FNV-1a, 32-bit. A hash rather than a running counter because the pen has to
 * be a pure function of the id: the sidebar, the Today sheet and a Journey's
 * own header all resolve it independently and must agree.
 */
function hashIdentifier(identifier: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < identifier.length; index += 1) {
    hash ^= identifier.charCodeAt(index);
    // `Math.imul` keeps the multiply in 32-bit range, which `*` would not.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function penForJourney(journeyId: string): PenIndex {
  return ((hashIdentifier(journeyId) % PEN_COUNT) + 1) as PenIndex;
}

/**
 * The CSS custom properties a pen resolves to, as an inline style object.
 *
 * Components set this on a container and then reference `var(--pen-from)` in
 * their stylesheet, so no component has to know which of the four it drew.
 */
export function penStyle(journeyId: string): React.CSSProperties {
  const pen = penForJourney(journeyId);
  return {
    '--pen-from': `var(--pen-${pen}-from)`,
    '--pen-to': `var(--pen-${pen}-to)`,
    '--pen-ink': `var(--pen-${pen}-ink)`,
    '--pen-wash': `var(--pen-${pen}-wash)`,
  } as React.CSSProperties;
}

/**
 * A stable channel designation, the way a recorder labels its pens: CH1–CH4
 * plus a two-digit index within that channel. Shown in mono beside a Journey
 * so the pen has a text form for anyone who cannot use the colour.
 */
export function channelLabel(journeyId: string, ordinal: number): string {
  return `CH${penForJourney(journeyId)}·${String(ordinal + 1).padStart(2, '0')}`;
}

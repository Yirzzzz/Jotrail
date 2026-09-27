/**
 * Motion preference, read at the moment of animating.
 *
 * Checked per call rather than cached, because the OS setting can change while
 * the app is open and a desktop app is often open for days. The CSS side of the
 * same preference lives in `tokens.css`; this is for the JS-driven motion (the
 * trace draw and the scrub spring) that no stylesheet can reach.
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

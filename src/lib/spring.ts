/**
 * A damped-spring integrator, for the one motion in this app that physically
 * overshoots: the sheet settling back after a scrub is released.
 *
 * Everything else in the recorder decelerates and stops, which is what
 * `--ease-out-expo` is for. Dragging the sheet, though, loads it — releasing it
 * has to return under tension, pass rest slightly, and settle. A cubic-bezier
 * cannot express that honestly: its overshoot is fixed at authoring time, so it
 * behaves identically whether the user dragged 4px or 400px. A spring reads the
 * release velocity, so a flick and a nudge settle differently, which is the
 * whole point.
 *
 * Semi-implicit Euler at a clamped timestep. Stable at the stiffness used here
 * and small enough to keep on the main thread beside a `transform` write.
 */

export interface SpringConfig {
  /** Pull toward the target. Higher is snappier. */
  stiffness: number;
  /** Resistance. Below the critical value the spring overshoots. */
  damping: number;
  mass: number;
  /** Distance and speed below which the spring is considered at rest. */
  restDistance: number;
  restVelocity: number;
}

/**
 * Tuned so a released sheet crosses rest once and settles inside ~300ms, which
 * keeps it in the 200–300ms band the pinned reference asks for while still
 * being a real spring rather than a curve imitating one.
 */
export const SHEET_SPRING: SpringConfig = {
  stiffness: 220,
  damping: 22,
  mass: 1,
  restDistance: 0.05,
  restVelocity: 0.05,
};

export interface SpringState {
  value: number;
  velocity: number;
}

/**
 * Advance a spring by `elapsedSeconds`.
 *
 * The timestep is clamped to 1/30s: when a tab is backgrounded the browser
 * hands back one enormous delta on return, and an unclamped step would launch
 * the spring instead of settling it.
 */
export function advanceSpring(
  state: SpringState,
  target: number,
  elapsedSeconds: number,
  config: SpringConfig = SHEET_SPRING,
): SpringState {
  const step = Math.min(elapsedSeconds, 1 / 30);

  const displacement = state.value - target;
  const springForce = -config.stiffness * displacement;
  const dampingForce = -config.damping * state.velocity;
  const acceleration = (springForce + dampingForce) / config.mass;

  const velocity = state.velocity + acceleration * step;
  const value = state.value + velocity * step;

  return { value, velocity };
}

export function isSpringAtRest(
  state: SpringState,
  target: number,
  config: SpringConfig = SHEET_SPRING,
): boolean {
  return (
    Math.abs(state.value - target) < config.restDistance &&
    Math.abs(state.velocity) < config.restVelocity
  );
}

/**
 * Run a spring to rest, calling `onFrame` with each value.
 *
 * Returns a cancel function. Under `prefers-reduced-motion` the caller should
 * skip this entirely and jump to the target — the spring carries no information
 * that the final position does not.
 */
export function runSpring(
  from: SpringState,
  target: number,
  onFrame: (value: number) => void,
  config: SpringConfig = SHEET_SPRING,
): () => void {
  let state = from;
  let frame = 0;
  let previousTimestamp: number | null = null;

  const tick = (timestamp: number) => {
    const elapsedSeconds =
      previousTimestamp === null ? 1 / 60 : (timestamp - previousTimestamp) / 1000;
    previousTimestamp = timestamp;

    state = advanceSpring(state, target, elapsedSeconds, config);

    if (isSpringAtRest(state, target, config)) {
      onFrame(target);
      return;
    }

    onFrame(state.value);
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

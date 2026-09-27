/**
 * Reading a journey's *development* out of its history.
 *
 * Everything here is derived from timeline events that already exist. Nothing
 * invents a number: there is no completion percentage, no score, no progress
 * ring, because a life theme does not have one (DECISIONS.md D-007). What a
 * journey does have is a sequence of moments that mattered and a set of states
 * that changed, and those are what these selectors surface.
 *
 * All pure, so the rules are testable without a renderer.
 */

import { onlyHappened, parseStateChange } from './timeline';
import type { StateChange } from './timeline';
import type { TimelineEntry } from './types';

/** One node on the development spine. */
export interface DevelopmentPoint {
  id: string;
  /** Short label for under the node. */
  label: string;
  occurredAt: string;
  kind: 'milestone' | 'state' | 'start';
  /** The transition, when this point came from a state change. */
  transition: StateChange | null;
}

/**
 * The turning points of a journey, oldest first.
 *
 * Milestones and state changes only. Notes and completed tasks are the texture
 * of a journey; these are its structure, and mixing them would bury the few
 * moments that actually changed direction.
 *
 * Pass `startedAt` to pin the left of the Latest progress path at the day the
 * Journey began — the first node in the overview reference.
 */
export function developmentSpine(
  entries: TimelineEntry[],
  options: { limit?: number; startedAt?: string; startLabel?: string } = {},
): DevelopmentPoint[] {
  const limit = options.limit ?? 6;

  /*
   * Commitments are excluded before anything else happens here. A deadline the
   * user set as a milestone is not a turning point the journey has reached — it
   * is one they are heading for — and letting it onto the spine would draw the
   * path continuing into a future that has not happened yet. It joins the spine
   * the moment it is confirmed, which is exactly right.
   */
  const turning = onlyHappened(entries)
    .filter((entry) => entry.importance === 'milestone' || entry.eventType === 'state_changed')
    .map((entry): DevelopmentPoint => {
      const transition = parseStateChange(entry.payloadJson);
      return {
        id: entry.id,
        label: entry.title,
        occurredAt: entry.occurredAt,
        kind: entry.importance === 'milestone' ? 'milestone' : 'state',
        transition,
      };
    })
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  /*
   * A journey with nothing recorded gets no spine at all — not even its own
   * start. The start is context for development that happened; on its own it
   * would draw a path implying movement where there has been none, which is the
   * kind of invented progress this module refuses (D-007).
   */
  if (turning.length === 0) return [];

  const start = startPoint(options.startedAt, options.startLabel);
  const room = Math.max(1, limit - (start ? 1 : 0));
  const recent = turning.slice(-room);

  return start ? [start, ...recent] : recent;
}

/**
 * The node for the journey's own beginning.
 *
 * This used to return `null` when the journey started on the same local day as
 * its first turning point, to avoid drawing two nodes almost on top of each
 * other. That traded a cosmetic problem for a much worse one: with the start
 * suppressed a journey holding one recorded change has a single point, and
 * `LatestProgress` refuses to draw a path from one point — so the whole panel
 * vanished silently.
 *
 * It hit the most ordinary case there is: a journey created today, with today's
 * first progress recorded in it. The user records a real turning point and the
 * screen that exists to show development shows nothing.
 *
 * Two coincident nodes are the truth — the journey really did start and move on
 * the same day — and the path handles them. `LatestProgress` now also renders a
 * lone point, so a brand-new journey shows its beginning rather than an absence.
 */
function startPoint(
  startedAt: string | undefined,
  startLabel: string | undefined,
): DevelopmentPoint | null {
  if (!startedAt) return null;

  return {
    id: 'journey-start',
    label: startLabel ?? 'Started',
    occurredAt: startedAt,
    kind: 'start',
    transition: null,
  };
}

/** A state being tracked over time, with its latest value and its history. */
export interface TrackedState {
  /** `capability`, `readiness`… — what is being tracked. */
  field: string;
  /** Whose state it is; `null` when the journey tracks only one of this field. */
  subject: string | null;
  /** Current value, from the most recent transition. */
  current: string;
  /** The value before the most recent transition, when there was one. */
  previous: string | null;
  changedAt: string;
  /** How many transitions are on record — evidence of movement, not a score. */
  changeCount: number;
}

/**
 * Every state this journey tracks, most recently changed first.
 *
 * This is the honest form of the reference image's "capability map": the levels
 * are the user's own recorded values rather than percentages the app made up,
 * and each one is backed by a real transition with a date.
 *
 * Grouping is by `field` + `subject`, so one journey can track ROS2 and C++
 * separately, or a single readiness with no subject at all.
 */
export function trackedStates(entries: TimelineEntry[]): TrackedState[] {
  interface Accumulator {
    field: string;
    subject: string | null;
    transitions: { change: StateChange; occurredAt: string }[];
  }

  const groups = new Map<string, Accumulator>();

  /*
   * `timeline_create_event` refuses a state change on a planned event, so this
   * filter should never have anything to do. It is here because a tracked state
   * reporting a level the user has not reached would be the worst failure this
   * module has, and the guarantee is worth two words.
   */
  for (const entry of onlyHappened(entries)) {
    if (entry.eventType !== 'state_changed') continue;

    const change = parseStateChange(entry.payloadJson);
    if (!change?.field || !change.to) continue;

    // A journey's own status is journey metadata, shown in the rail already.
    if (change.field === 'status') continue;

    const subject = change.subject ?? subjectFromTitle(entry.title);
    const key = `${change.field}::${subject ?? ''}`;

    const group = groups.get(key) ?? { field: change.field, subject, transitions: [] };
    group.transitions.push({ change, occurredAt: entry.occurredAt });
    groups.set(key, group);
  }

  const states = [...groups.values()].map((group): TrackedState => {
    const ordered = [...group.transitions].sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt),
    );
    const latest = ordered.at(-1)!;
    return {
      field: group.field,
      subject: group.subject,
      current: latest.change.to!,
      previous: latest.change.from,
      changedAt: latest.occurredAt,
      changeCount: ordered.length,
    };
  });

  return states.sort((a, b) => b.changedAt.localeCompare(a.changedAt));
}

/**
 * `ROS2 · Basic → Intermediate` → `ROS2`.
 *
 * A fallback for events recorded before `subject` existed in the payload, and
 * for the seeded fixture. The separator is the one the design reference uses in
 * its own titles.
 */
function subjectFromTitle(title: string): string | null {
  const [head] = title.split('·');
  const trimmed = head?.trim();
  // Only treat it as a subject if something followed the separator.
  return trimmed && trimmed !== title.trim() ? trimmed : null;
}

/**
 * What the journey is currently on, taken from its most recent development.
 *
 * The reference image shows this as "当前焦点" with a percentage ring. The focus
 * itself is real — it is the latest thing that moved — so it is kept; the ring
 * is not, because nothing in the data measures it.
 */
export function currentFocus(entries: TimelineEntry[]): TimelineEntry | null {
  // What the journey is *on* is the last thing that moved, not the next thing
  // due: a deadline six months out would otherwise sort last and be announced as
  // the current focus.
  const happened = onlyHappened(entries);
  const spineEvents = happened.filter(
    (entry) => entry.importance === 'milestone' || entry.eventType === 'state_changed',
  );
  const ordered = [...(spineEvents.length > 0 ? spineEvents : happened)].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );
  return ordered.at(-1) ?? null;
}

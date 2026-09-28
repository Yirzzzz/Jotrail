/**
 * Timeline presentation logic: grouping entries into the month → day rhythm the
 * design reference uses, and deciding how each event should be labelled and how
 * much visual weight it deserves.
 *
 * Grouping and density remain pure. Presentation labels follow the local
 * interface language, without changing the underlying event or its content.
 */

import { differenceInLocalDays, localDayKey, localMonthKey, toDate } from '@/lib/datetime';
import type { TimelineEntry, TimelineImportance } from './types';
import { translate } from '@/lib/i18n';

export interface TimelineDay {
  /** `YYYY-MM-DD`, local. */
  key: string;
  /** `occurredAt` of the first entry that day, for rendering the date rail. */
  occurredAt: string;
  entries: TimelineEntry[];
}

/**
 * A day's entries, with consecutive task events collected into groups.
 *
 * A journey with daily tasks would otherwise be a wall of one-line rows, which
 * is the "task group" density `PRODUCT_SPEC.md` §9 asks for.
 */
export type TimelineBlock =
  { kind: 'entry'; entry: TimelineEntry } | { kind: 'tasks'; entries: TimelineEntry[] };

const TASK_EVENTS = new Set(['task_added', 'task_completed', 'task_reopened']);

export function isTaskEvent(entry: Pick<TimelineEntry, 'eventType'>): boolean {
  return TASK_EVENTS.has(entry.eventType);
}

/**
 * Collapse runs of task events into one block, leaving everything else alone.
 *
 * Only *consecutive* task events merge: a note logged between two tasks keeps
 * them apart, because the order things happened in is the point. A run of one
 * stays a plain row — a lone task needs no group heading.
 */
export function groupTaskRuns(entries: TimelineEntry[]): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  let run: TimelineEntry[] = [];

  const flush = () => {
    if (run.length === 0) return;
    // A group of one is just a row.
    blocks.push(
      run.length === 1 ? { kind: 'entry', entry: run[0]! } : { kind: 'tasks', entries: run },
    );
    run = [];
  };

  for (const entry of entries) {
    if (isTaskEvent(entry)) {
      run.push(entry);
    } else {
      flush();
      blocks.push({ kind: 'entry', entry });
    }
  }
  flush();

  return blocks;
}

export interface TimelineMonth {
  /** `YYYY-MM`, local. */
  key: string;
  occurredAt: string;
  days: TimelineDay[];
}

/**
 * Group entries into months and days, preserving the order they arrive in.
 *
 * The repository already sorted by `occurred_at`, so this must not re-sort:
 * ascending and descending timelines both flow through here unchanged.
 */
export function groupByMonthAndDay(entries: TimelineEntry[]): TimelineMonth[] {
  const months: TimelineMonth[] = [];
  const monthIndex = new Map<string, TimelineMonth>();
  const dayIndex = new Map<string, TimelineDay>();

  for (const entry of entries) {
    const monthKey = localMonthKey(entry.occurredAt);
    const dayKey = localDayKey(entry.occurredAt);

    let month = monthIndex.get(monthKey);
    if (!month) {
      month = { key: monthKey, occurredAt: entry.occurredAt, days: [] };
      monthIndex.set(monthKey, month);
      months.push(month);
    }

    let day = dayIndex.get(dayKey);
    if (!day) {
      day = { key: dayKey, occurredAt: entry.occurredAt, entries: [] };
      dayIndex.set(dayKey, day);
      month.days.push(day);
    }

    day.entries.push(entry);
  }

  return months;
}

/**
 * Short label for the kind of event. Deliberately domain-neutral: a state
 * change reads the same whether it describes a job application, a skill or a
 * deadlift.
 */
export function eventTypeLabel(entry: Pick<TimelineEntry, 'eventType' | 'importance'>): string {
  if (entry.importance === 'milestone') return translate('Milestone', '里程碑');

  switch (entry.eventType) {
    case 'note_logged':
      return translate('Note', '笔记');
    case 'task_added':
      return translate('Task added', '添加任务');
    case 'task_completed':
      return translate('Task done', '完成任务');
    case 'task_reopened':
      return translate('Task reopened', '重新打开任务');
    case 'state_changed':
      return translate('State change', '状态变化');
    case 'journey_status_changed':
      return translate('Status', '状态');
    case 'event_recorded':
      return translate('Event', '事件');
    default:
      // Unknown types still render: `some_new_thing` → `Some new thing`.
      return humanise(entry.eventType);
  }
}

function humanise(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return translate('Event', '事件');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Whether clicking the entry can open a source object. */
export function isOpenable(entry: Pick<TimelineEntry, 'sourceType' | 'sourceId'>): boolean {
  return entry.sourceType === 'note' && Boolean(entry.sourceId);
}

// ---------------------------------------------------------------------------
// Planned entries
// ---------------------------------------------------------------------------

/** Whether this entry is a commitment rather than something that happened. */
export function isPlanned(entry: Pick<TimelineEntry, 'eventState'>): boolean {
  return entry.eventState === 'planned';
}

/**
 * Entries that actually happened, for every reading derived from history.
 *
 * The development spine, the current focus, the pen trace, the month's counts,
 * "last activity" — all of them answer questions about the past, and a
 * commitment is not an answer to any of them. Without this filter a deadline
 * dated next March would become a journey's newest development and its current
 * focus, i.e. the app would report progress from something that has not
 * happened.
 *
 * One named helper rather than an inline predicate repeated six times, so the
 * next derived panel gets the rule for free instead of rediscovering it.
 */
export function onlyHappened<T extends Pick<TimelineEntry, 'eventState'>>(
  entries: readonly T[],
): T[] {
  return entries.filter((entry) => entry.eventState !== 'planned');
}

/**
 * A planned entry whose date has come and gone without being confirmed.
 *
 * Worth naming because it is the one state the whole design exists to keep
 * legible: the deadline arrived and nothing was recorded. Derived from the clock
 * rather than stored, which is correct here — unlike the planned/recorded
 * distinction, this genuinely *is* a fact about what time it is now, and it
 * stops being true the moment the entry is confirmed.
 */
export function isOverdue(
  entry: Pick<TimelineEntry, 'eventState' | 'occurredAt'>,
  now: Date = new Date(),
): boolean {
  if (entry.eventState !== 'planned') return false;

  const target = toDate(entry.occurredAt);
  if (!target) return false;
  // Whole local days, so a deadline is not "overdue" for the rest of its own day.
  return differenceInLocalDays(target, now) > 0;
}

/**
 * How a planned entry's date reads: `In 12 days`, `Tomorrow`, `Today`,
 * `3 days ago`.
 *
 * A countdown is the honest thing to show on a commitment — it is arithmetic on
 * a date the user chose, not an estimate the app invented (D-007).
 */
export function plannedCountdown(occurredAt: string, now: Date = new Date()): string {
  const target = toDate(occurredAt);
  if (!target) return '';

  const daysAway = differenceInLocalDays(now, target);
  if (daysAway === 0) return translate('Today', '今天');
  if (daysAway === 1) return translate('Tomorrow', '明天');
  if (daysAway === -1) return translate('Yesterday', '昨天');
  if (daysAway > 1) return translate(`In ${daysAway} days`, `${daysAway} 天后`);
  return translate(`${Math.abs(daysAway)} days ago`, `${Math.abs(daysAway)} 天前`);
}

/**
 * Whether an entry can be corrected after the fact (DECISIONS.md D-040).
 *
 * Only what the user recorded by hand, at normal weight. Derived entries — a
 * logged note, the task events, a status change — restate another object, and
 * editing one would let it disagree with the thing it reports; those are
 * corrected at their source. Milestones and minor entries stay read-only by
 * choice, and a milestone is structural besides: it feeds the development spine.
 *
 * The same rule is enforced in `timeline::update` on the Rust side. This copy
 * decides whether to *offer* the affordance; that one is the guarantee.
 *
 * Note it reads `importance`, not `densityFor`: a minor entry carrying a
 * reflection renders at full density while its stored weight is
 * still `compact`, and it stays read-only. Editability follows the weight that
 * was chosen, not the card it happens to draw.
 *
 * Editable and openable are disjoint — openable requires a note source, and a
 * recorded event has none — which is what lets `TimelineEntryView` put a button
 * inside an entry without ever nesting it in the entry's own button.
 *
 * **A planned entry is always editable**, whatever its weight. D-040 protects
 * history from being quietly rewritten; a plan is not history but a statement
 * about the future, and revising it — the deadline moved, the wording was rough
 * — is how a plan normally behaves. Freezing a mistyped deadline until its date
 * arrived would be the rule protecting nothing.
 */
export function isEditable(
  entry: Pick<TimelineEntry, 'eventType' | 'importance' | 'eventState'>,
): boolean {
  if (entry.eventState === 'planned') return true;
  return entry.eventType === 'event_recorded' && entry.importance === 'normal';
}

/** Attachments may be corrected without rewriting the event's historical text. */
export function canEditEventImages(
  entry: Pick<TimelineEntry, 'eventType' | 'sourceType' | 'sourceId'>,
): boolean {
  return (
    entry.sourceType === null &&
    entry.sourceId === null &&
    (entry.eventType === 'event_recorded' || entry.eventType === 'state_changed')
  );
}

/** Undo a mistaken confirmation, never turn ordinary or derived history into a plan. */
export function canRevertConfirmation(
  entry: Pick<
    TimelineEntry,
    'eventType' | 'eventState' | 'plannedFor' | 'sourceType' | 'sourceId'
  >,
): boolean {
  return (
    entry.eventState === 'recorded' &&
    entry.eventType === 'event_recorded' &&
    entry.plannedFor !== null &&
    entry.sourceType === null &&
    entry.sourceId === null
  );
}

export interface StateChange {
  field: string | null;
  from: string | null;
  to: string | null;
  /**
   * Whose state changed, so one journey can track several subjects (ROS2 and
   * C++ separately). Absent on events recorded before this existed; callers
   * fall back to parsing it out of the title.
   */
  subject: string | null;
}

/**
 * Read a `state_changed` payload.
 *
 * Malformed JSON must never break the timeline (ARCHITECTURE.md §14), so this
 * returns `null` instead of throwing and the caller falls back to the summary.
 */
export function parseStateChange(payloadJson: string | null): StateChange | null {
  if (!payloadJson) return null;

  try {
    const parsed: unknown = JSON.parse(payloadJson);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const record = parsed as Record<string, unknown>;
    const asText = (value: unknown): string | null =>
      typeof value === 'string' && value.trim() ? value : null;

    const change: StateChange = {
      field: asText(record.field),
      from: asText(record.from),
      to: asText(record.to),
      subject: asText(record.subject),
    };
    // Only useful if it actually describes a transition.
    return change.from || change.to ? change : null;
  } catch {
    return null;
  }
}

/** `not_ready` → `Not ready`, for rendering transition values. */
export function formatStateValue(value: string | null): string {
  return value ? humanise(value) : '—';
}

/**
 * Density for an entry. Compact events are one-liners; milestones get room.
 * Anything carrying a reflection is lifted to at least `normal`, because a
 * reflection is the most valuable thing to find when looking back.
 *
 * A planned entry never renders compact. It has to carry its own controls —
 * "It happened", the countdown, the dashed edge that marks it as unconfirmed —
 * and a one-line row has nowhere to put them. The user's choice of weight still
 * matters for milestones; it just cannot shrink a commitment below a card.
 */
export function densityFor(
  entry: Pick<TimelineEntry, 'importance' | 'reflection' | 'eventState'>,
): TimelineImportance {
  if (entry.eventState === 'planned' && entry.importance === 'compact') return 'normal';
  if (entry.importance === 'compact' && entry.reflection) return 'normal';
  return entry.importance;
}

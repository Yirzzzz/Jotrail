/**
 * Domain types. These mirror `src-tauri/src/domain.rs` one-for-one: serde emits
 * camelCase, and `Option<T>` crosses the boundary as `T | null`.
 *
 * Command *inputs* use optional properties instead, because serde treats a
 * missing `Option` field as `None`.
 */

export type JourneyStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived';

export type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled';

export type TimelineImportance = 'compact' | 'normal' | 'milestone';

/**
 * Whether an entry is a record or a commitment.
 *
 * `recorded` happened, at `occurredAt`. `planned` is something the user intends
 * — a deadline, a booked date — that has not happened yet.
 *
 * Deliberately stored rather than derived from comparing `occurredAt` to now: a
 * deadline that passes unmet would otherwise become indistinguishable from
 * something that actually happened, and the timeline would claim a paper was
 * submitted because its due date arrived.
 */
export type TimelineEventState = 'planned' | 'recorded';

export const JOURNEY_STATUSES: readonly JourneyStatus[] = [
  'planning',
  'active',
  'paused',
  'completed',
  'archived',
];

export interface Journey {
  id: string;
  title: string;
  description: string | null;
  status: JourneyStatus;
  icon: string | null;
  coverPath: string | null;
  /** UTC ISO-8601. */
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Badge-sized journey, used for timeline and note context. */
export interface JourneyRef {
  id: string;
  title: string;
  icon: string | null;
}

export interface Note {
  id: string;
  title: string;
  bodyMd: string;
  noteType: string;
  /** Optional: many notes are timeless knowledge rather than events. */
  occurredAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface NoteWithLinks extends Note {
  journeys: JourneyRef[];
  /** Ids of the journeys this note is pinned in. */
  pinnedIn: string[];
}

export interface Task {
  id: string;
  title: string;
  detailsMd: string | null;
  status: TaskStatus;
  dueAt: string | null;
  completedAt: string | null;
  /**
   * What produced this task — currently `'event'`, when an event revealed work
   * to do. Free-form for the same reason `eventType` is.
   */
  originType: string | null;
  originId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskWithLinks extends Task {
  journeys: JourneyRef[];
}

export interface TimelineEvent {
  id: string;
  /** Free-form so new kinds of history need no schema change. */
  eventType: string;
  title: string;
  summary: string | null;
  reflection: string | null;
  /** Drives chronology — this is what the timeline sorts and groups by. */
  occurredAt: string;
  /** When the record entered the system. Never used for ordering. */
  createdAt: string;
  sourceType: string | null;
  sourceId: string | null;
  importance: TimelineImportance;
  payloadJson: string | null;
  eventState: TimelineEventState;
  /**
   * The date a planned entry is aimed at.
   *
   * While planned this equals `occurredAt` — a commitment's place on the
   * timeline *is* its target. Confirming moves `occurredAt` to when the thing
   * actually happened and leaves this holding the original date, which is what
   * lets an entry say "due the 12th, done on the 10th".
   */
  plannedFor: string | null;
  /**
   * The thing this entry is *about* — a paper, a position, a film.
   *
   * Distinct from `sourceType`/`sourceId`, which record what *produced* the
   * entry. A hand-recorded interview has no source but is very much about a
   * position, and one entry could have both.
   */
  subjectId: string | null;
  /**
   * The stage that thing reached: 投稿, 拒稿, 一面. Free-form.
   *
   * `stage`, not `state`: the domain already has `TimelineEventState`, two
   * `status` fields and a `StateChange` payload. A subject is *at* a stage.
   */
  stage: string | null;
}

/**
 * A thing a Journey keeps track of, and the unit a register lists.
 *
 * Deliberately thin — a name and a kind, no custom fields. `kind` is free-form,
 * which is what makes a new register (`paper`, `position`, `film`) cost no code.
 */
export interface Subject {
  id: string;
  /** One Journey, unlike notes and tasks which are many-to-many. */
  journeyId: string;
  kind: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A subject with its register row filled in — all of it derived from events
 * rather than stored twice, so it can never disagree with its own history.
 */
export interface SubjectSummary extends Subject {
  /** The `stage` of its most recent event; `null` until something is recorded. */
  currentStage: string | null;
  lastEventAt: string | null;
  /** How many events are on record. Evidence of movement, not a score. */
  eventCount: number;
}

/**
 * A grouping the app believes it found in existing event titles.
 *
 * Read-only until the user confirms: the parse is good on repeated names
 * (`TMM 投稿` + `TMM 一轮大修返稿` → `TMM`) and deliberately silent on anything
 * recorded once, where there is no evidence of where the name ends.
 */
export interface ProposedSubject {
  title: string;
  /** `[eventId, eventTitle, stage]`, oldest first. */
  events: [string, string, string][];
}

export interface TimelineEntry extends TimelineEvent {
  journeys: JourneyRef[];
  /**
   * Tasks this event produced, rendered inside the entry — an interview and the
   * gaps it revealed read as one moment, not as unrelated rows.
   */
  tasks: TaskWithLinks[];
  /**
   * The tone of this entry's `stage`, when its register has a set naming it.
   *
   * Derived by the repository rather than stored on the event: the colour belongs
   * to the stage set, so a cached copy would go stale as soon as the set was
   * recoloured. `null` when the register has no set, or the stage was recorded
   * outside it — that renders untoned, never as an error.
   */
  stageTone: string | null;
}

export type TimelineOrder = 'oldest' | 'newest';

// ---------------------------------------------------------------------------
// Command inputs
// ---------------------------------------------------------------------------

export interface NewJourneyInput {
  title: string;
  description?: string;
  icon?: string;
  startedAt?: string;
  status?: JourneyStatus;
}

export interface JourneyPatch {
  title?: string;
  /** `null` clears the description; omitting the key leaves it untouched. */
  description?: string | null;
  icon?: string;
  startedAt?: string;
}

export interface NewNoteInput {
  title?: string;
  bodyMd?: string;
  noteType?: string;
  occurredAt?: string;
  /** Links and logs the note to this journey in the same transaction. */
  journeyId?: string;
}

export interface NotePatch {
  title?: string;
  bodyMd?: string;
  occurredAt?: string | null;
  noteType?: string;
}

/**
 * Correcting an event that was already recorded.
 *
 * Deliberately smaller than `NewTimelineEventInput`: only what a user can get
 * wrong about a moment they already described — its wording and when it
 * happened. Weight, journeys, the tracked transition and the to-dos it revealed
 * are all left out, so an edit cannot quietly restructure history (D-040).
 *
 * `null` clears a field; leaving the key off leaves it alone.
 */
export interface TimelineEventPatch {
  title?: string;
  summary?: string | null;
  reflection?: string | null;
  occurredAt?: string;
  /**
   * Filing an existing entry onto a tracked thing, or off one. `null` unfiles.
   *
   * Included here — unlike weight and journeys, which D-040 keeps out of an edit
   * — because filing is a *correction of an association*, the same reasoning
   * D-016 applies to note links. It is also how a notebook written before
   * registers existed gets organised, one entry at a time.
   */
  subjectId?: string | null;
  stage?: string | null;
}

export interface NewTaskInput {
  title: string;
  detailsMd?: string;
  dueAt?: string;
  journeyId?: string;
  /**
   * Set when the task comes from something. A task with an origin records no
   * "added" timeline entry, because whatever it came from already says so.
   */
  originType?: string;
  originId?: string;
}

export interface NewTimelineEventInput {
  eventType?: string;
  title: string;
  summary?: string;
  reflection?: string;
  occurredAt?: string;
  importance?: TimelineImportance;
  journeyIds?: string[];
  /**
   * Records that something *changed* rather than simply happened. Becomes the
   * event's `payloadJson`, which is what lets a journey read its tracked states
   * back out of history.
   */
  state?: StateChangeInput;
  /**
   * To-dos the event comes with, created alongside it.
   *
   * The same unit as Today's task composer — title plus an optional due date —
   * because recording an event carries both of the app's smallest units: what
   * happened, and what there is to do about it. Titles alone would make this a
   * lesser relative of the Today input rather than the same thing.
   */
  tasks?: NewEventTaskInput[];
  /**
   * Records a commitment instead of a fact: a deadline, a booked date, an
   * intention. `occurredAt` then means "aimed at", and the entry stays visibly
   * unconfirmed until the user says it happened.
   */
  planned?: boolean;
  /**
   * The thing this event is about. Optional and must stay so: recording has to
   * remain easier than filing (AGENTS.md §1).
   */
  subjectId?: string;
  /** The stage that thing reached. Only meaningful alongside `subjectId`. */
  stage?: string;
  /**
   * A thing to start tracking, named here rather than picked.
   *
   * Created with the event in one transaction, and the event is filed onto it —
   * so `stage` applies to it exactly as it would to a `subjectId`. Ignored when
   * `subjectId` is set, since that already names a thing.
   */
  newSubject?: NewEventSubjectInput;
}

/**
 * A thing to start tracking *while* recording the event that is about it.
 *
 * The first event about something is the moment it becomes worth tracking — a
 * paper exists, as far as the notebook is concerned, when it is submitted
 * somewhere. Requiring the row to exist first meant leaving the dialog, creating
 * it in the register, and coming back, which is four steps to write down one
 * moment (D-049).
 *
 * Mutually exclusive with `subjectId`: one names a thing that already exists, the
 * other creates one, and sending both is a contradiction rather than a preference.
 * The new thing joins the event's first Journey, because a subject belongs to
 * exactly one.
 */
export interface NewEventSubjectInput {
  /** Which register it joins — the user's own word, e.g. 论文, 岗位. */
  kind: string;
  title: string;
}

export interface NewSubjectInput {
  journeyId: string;
  kind: string;
  title: string;
}

/**
 * Renaming a tracked thing, or moving it to another register.
 *
 * The whole reason a subject is a row: its events keep pointing at the id, so a
 * rename cannot split its history the way free-text grouping would.
 */
export interface SubjectPatch {
  title?: string;
  kind?: string;
}

/**
 * The tones a stage may carry.
 *
 * A closed list, and that is the design decision rather than a limitation: the
 * user picks a *meaning* and `tokens.css` owns the colour. A free colour picker
 * would store a hex literal in the database — `AGENTS.md` §7's "never hard-code a
 * colour in a component" with extra steps — and nothing would keep it legible on
 * paper-white or above 4.5:1.
 *
 * Six: enough to separate the stages of a real register, few enough that the
 * page does not become the rainbow of category colours `UX_SPEC.md` §7 warns
 * against. Mirrors `STAGE_TONES` in `domain.rs`, which rejects anything else.
 */
export const STAGE_TONES = [
  'neutral',
  'channel',
  'warm',
  'positive',
  'caution',
  'negative',
] as const;

export type StageTone = (typeof STAGE_TONES)[number];

/** Whether a string from the database is a tone this build knows how to render. */
export function isStageTone(value: string): value is StageTone {
  return (STAGE_TONES as readonly string[]).includes(value);
}

/**
 * A named, reusable vocabulary for a register — 「面试流程」, 「观影」.
 *
 * Global rather than per-Journey, which is the point: defined once, picked again
 * by next year's Journey.
 *
 * Not a workflow, and not an order either. A stage says what something *is now*,
 * not where it stands in a sequence — so there are no transitions, nothing
 * restricts what may follow what, and the set contributes no display order. What
 * it contributes is *which stages exist* (so an empty one can be reported) and
 * *what colour each carries*.
 */
export interface StageSet {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface StageOption {
  id: string;
  setId: string;
  /** The user's own word, and the value stored on events. */
  label: string;
  tone: string;
  /**
   * Insertion order — where the stage sits in the editor's list, and nothing
   * more. Not a display order: the register groups by recency of movement and the
   * Overview's cross-section by count. Kept only so a set re-reads in a stable
   * order rather than reshuffling its own rows between saves.
   */
  position: number;
}

export interface StageSetWithOptions extends StageSet {
  options: StageOption[];
  /** How many registers use it — shown before a delete. */
  registerCount: number;
}

export interface NewStageSetInput {
  name: string;
  options: NewStageOptionInput[];
}

export interface NewStageOptionInput {
  label: string;
  /** Omitted means `neutral`, so a set can be typed without opening the palette. */
  tone?: StageTone;
}

/**
 * Renaming a set, and/or replacing its stage list.
 *
 * Each entry carries the id of the row it replaces, when it has one. That is
 * load-bearing: an entry *with* an id whose label changed is a **rename**, and a
 * rename cascades onto every event that stored the old label. Without the id, a
 * rename and a different stage are indistinguishable.
 */
export interface StageSetPatch {
  name?: string;
  options?: StageOptionPatch[];
}

export interface StageOptionPatch {
  id?: string;
  label: string;
  tone?: StageTone;
}

/** How many things sit at one stage. Counts, never percentages (D-007). */
export interface StageTally {
  label: string;
  tone: string;
  count: number;
  /**
   * Recorded on events but not in the register's set — typed before the set
   * existed, or stranded by an edit. Reported rather than dropped, so the parts
   * still add up to the register.
   */
  offSet: boolean;
}

/**
 * One register's cross-section, and the unit the Journey Overview renders.
 *
 * Whole registers rather than loose stage counts, because the honest denominator
 * is the register — "9 papers" — and a stage count without one is the
 * free-floating metric D-007 refuses.
 */
export interface RegisterTally {
  kind: string;
  /** The set's name, when the register has one. */
  setName: string | null;
  stages: StageTally[];
  /** Things with nothing recorded yet: a real state, not an invented stage. */
  unstaged: number;
  total: number;
}

/**
 * Confirming that a planned event actually happened.
 *
 * Separate from `TimelineEventPatch` because it is a different act: the patch
 * corrects how a moment is described, this changes what the entry *is* — from
 * intended to on the record. One call so the state flip and the real date land
 * together.
 */
export interface ConfirmPlannedEventInput {
  /** When it actually happened. Defaults to now on the Rust side. */
  occurredAt?: string;
  /** An optional rewording, saving a second trip through the edit dialog. */
  title?: string;
  /**
   * The thing this turned out to be about, and the stage it reached.
   *
   * Confirming is the moment a plan becomes a fact, which is exactly when a stage
   * becomes true — so this is the same question the record dialog asks, asked at
   * the other moment it applies (D-051). Without it a plan could only ever arrive
   * on the record unfiled and unstaged, and the register would not know the thing
   * had moved.
   *
   * `null` unfiles; omitting the key leaves whatever the plan already carried.
   */
  subjectId?: string | null;
  /** A thing to start tracking, named at the moment it turns out to matter. */
  newSubject?: NewEventSubjectInput;
  /** `null` clears the stage; omitting leaves it. */
  stage?: string | null;
}

export interface NewEventTaskInput {
  title: string;
  /** Optional, and what feeds "Up next" when present. */
  dueAt?: string;
}

export interface StateChangeInput {
  /** What changed: `readiness`, `capability`, `weight`… */
  field: string;
  from?: string;
  to: string;
  /** Whose state it is, so one journey can track several subjects. */
  subject?: string;
}

export interface AppInfo {
  databasePath: string;
  schemaVersion: number;
  seededDemoData: boolean;
}

export interface BackupInfo {
  id: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
  beforeRestore?: boolean;
}

export interface ExportInfo {
  path: string;
  noteCount: number;
}

/**
 * The whole persistence contract, in one place.
 *
 * UI code depends on this interface and never on Tauri directly, which is what
 * lets the same components run against the in-memory implementation in tests.
 */

import type {
  AppInfo,
  BackupInfo,
  ExportInfo,
  ConfirmPlannedEventInput,
  Journey,
  JourneyPatch,
  JourneyStatus,
  NewJourneyInput,
  NewNoteInput,
  NewStageSetInput,
  NewStateCategoryInput,
  NewSubjectInput,
  NewTaskInput,
  NewTimelineEventInput,
  NotePatch,
  NoteWithLinks,
  ProposedSubject,
  RegisterTally,
  StageSetPatch,
  StageSetWithOptions,
  StateCategory,
  StateCategoryPatch,
  Subject,
  SubjectPatch,
  SubjectSummary,
  TaskStatus,
  TaskWithLinks,
  TimelineEntry,
  TimelineEventPatch,
  TimelineOrder,
} from '@/domain/types';

export interface Repository {
  // Journeys
  listJourneys(): Promise<Journey[]>;
  getJourney(id: string): Promise<Journey>;
  createJourney(input: NewJourneyInput): Promise<Journey>;
  updateJourney(id: string, patch: JourneyPatch): Promise<Journey>;
  /** Also appends the transition to history. */
  setJourneyStatus(id: string, status: JourneyStatus): Promise<Journey>;
  /**
   * Delete a journey. Notes and tasks are kept — they can live unfiled. Only
   * this journey's own history goes with it.
   */
  deleteJourney(id: string): Promise<void>;

  // Notes
  listNotes(options?: { search?: string; journeyId?: string }): Promise<NoteWithLinks[]>;
  getNote(id: string): Promise<NoteWithLinks>;
  createNote(input: NewNoteInput): Promise<NoteWithLinks>;
  /** Autosave path — deliberately writes no timeline history. */
  updateNote(id: string, patch: NotePatch): Promise<NoteWithLinks>;
  deleteNote(id: string): Promise<void>;
  listDeletedNotes(): Promise<NoteWithLinks[]>;
  restoreNote(id: string): Promise<NoteWithLinks>;
  /** Links the note and logs it onto that journey's timeline. */
  linkNoteToJourney(
    noteId: string,
    journeyId: string,
    occurredAt?: string,
  ): Promise<TimelineEntry>;
  unlinkNoteFromJourney(noteId: string, journeyId: string): Promise<void>;
  setNotePinned(noteId: string, journeyId: string, pinned: boolean): Promise<void>;

  // Tasks
  listTasks(options?: { journeyId?: string }): Promise<TaskWithLinks[]>;
  createTask(input: NewTaskInput): Promise<TaskWithLinks>;
  /** Completing or reopening also records a timeline event. */
  setTaskStatus(id: string, status: TaskStatus): Promise<TaskWithLinks>;
  linkTaskToJourney(taskId: string, journeyId: string): Promise<void>;
  unlinkTaskFromJourney(taskId: string, journeyId: string): Promise<void>;
  deleteTask(id: string): Promise<void>;

  // Timeline
  /** Data URL for an owned local image; timeline lists never transfer original bytes. */
  readEventImage(id: string, variant: 'thumbnail' | 'original'): Promise<string>;
  listTimeline(options?: {
    journeyId?: string;
    order?: TimelineOrder;
  }): Promise<TimelineEntry[]>;
  createTimelineEvent(input: NewTimelineEventInput): Promise<TimelineEntry>;
  /**
   * Correct a recorded event's wording or date within D-040's edit restrictions.
   * An images-only patch also permits explicit milestones/state changes (D-062).
   */
  updateTimelineEvent(id: string, patch: TimelineEventPatch): Promise<TimelineEntry>;
  /**
   * Mark a planned event as having happened, at `occurredAt` (default: now).
   *
   * The state flip and the real date are one call, so an entry can never be on
   * the record while still dated at the deadline it was aiming for. The date it
   * *was* aimed at is kept as `plannedFor`.
   */
  confirmTimelineEvent(id: string, input?: ConfirmPlannedEventInput): Promise<TimelineEntry>;
  /**
   * Abandon a planned event. Only planned entries — recorded history is not
   * deletable, which remains D-040's open gap.
   */
  deletePlannedTimelineEvent(id: string): Promise<void>;
  revertConfirmedTimelineEvent(id: string): Promise<TimelineEntry>;
  /**
   * Timeline entries matching `search`.
   *
   * Separate from `listTimeline` because the contracts differ: that one returns a
   * whole history and must never be silently narrowed. Matches the words the user
   * wrote (title, summary, reflection), the **stage** an entry recorded, and the
   * name of the thing it is about — so both 返修 and TMM find the entries that
   * describe them (D-047).
   */
  searchTimeline(
    search: string,
    options?: { journeyId?: string; order?: TimelineOrder },
  ): Promise<TimelineEntry[]>;

  // Subjects — the things a register lists
  /**
   * One register: the things of a kind in a Journey, each with its derived
   * stage. Omit `kind` for the Journey's whole set.
   */
  listSubjects(journeyId: string, kind?: string): Promise<SubjectSummary[]>;
  /** Registers with subjects or a stage-set configuration; counts only real subjects. */
  subjectKinds(journeyId: string): Promise<[string, number][]>;
  /**
   * Stages already used in this register, most recent first. Stands in for a
   * vocabulary editor: a register acquires its language by being used.
   */
  subjectStagesUsed(journeyId: string, kind: string): Promise<string[]>;
  createSubject(input: NewSubjectInput): Promise<Subject>;
  /** Rename, or move to another register. Its events follow it. */
  updateSubject(id: string, patch: SubjectPatch): Promise<Subject>;
  /** Stop tracking. Its events stay on the timeline — they happened. */
  deleteSubject(id: string): Promise<void>;
  /**
   * What the app would make of this Journey's untagged event titles. Read-only:
   * the caller shows it and the user confirms, because the parse is a guess.
   */
  proposeSubjects(journeyId: string): Promise<ProposedSubject[]>;
  /**
   * Tracked things whose name matches, across every Journey. The most useful
   * search result of the three: it opens the thing's whole history rather than
   * one moment in it.
   */
  searchSubjects(search: string): Promise<SubjectSummary[]>;

  // Stage sets — a register's named vocabulary of labels and colours
  /** Every set, with its stages and how many registers use each. */
  listStageSets(): Promise<StageSetWithOptions[]>;
  /**
   * Create a set and its stages in one call. A set with no stages is refused:
   * the vocabulary *is* the set.
   */
  createStageSet(input: NewStageSetInput): Promise<StageSetWithOptions>;
  /**
   * Rename a set, and/or replace its stage list.
   *
   * Renaming a stage cascades onto every event that recorded the old label, so a
   * thing stays at the stage it reached even after the word for it changes.
   */
  updateStageSet(id: string, patch: StageSetPatch): Promise<StageSetWithOptions>;
  /** Delete a set. Recorded stages survive as plain text — history is not deleted. */
  deleteStageSet(id: string): Promise<void>;
  /** Describe a register with a set, replacing whatever it used before. */
  attachStageSet(journeyId: string, kind: string, setId: string): Promise<void>;
  /** Stop describing a register with a set. Recorded stages are left alone. */
  detachStageSet(journeyId: string, kind: string): Promise<void>;
  /** The set describing one register, if it has one. */
  stageSetForRegister(journeyId: string, kind: string): Promise<StageSetWithOptions | null>;
  /**
   * How many things sit at each stage, per register — the Overview's
   * cross-section. Counts only; a register has no completion (D-007).
   */
  registerTallies(journeyId: string): Promise<RegisterTally[]>;

  // Independent Journey classifications. Shared legacy stages remain above.
  listStateCategories(journeyId: string): Promise<StateCategory[]>;
  createStateCategory(input: NewStateCategoryInput): Promise<StateCategory>;
  updateStateCategory(id: string, patch: StateCategoryPatch): Promise<StateCategory>;

  // App
  appInfo(): Promise<AppInfo>;
  listBackups(): Promise<BackupInfo[]>;
  createBackup(): Promise<BackupInfo>;
  /** Replaces the notebook, first taking a safety backup returned to the caller. */
  restoreBackup(id: string): Promise<BackupInfo>;
  exportNotebook(): Promise<ExportInfo>;
  openDataFolder(kind: 'backups' | 'exports'): Promise<void>;
}

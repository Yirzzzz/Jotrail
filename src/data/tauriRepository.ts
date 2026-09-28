/**
 * Repository backed by the Rust commands. Every method is a direct `invoke`;
 * argument names match the command signatures in `src-tauri/src/commands.rs`.
 */

import { invoke } from '@tauri-apps/api/core';

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
} from '@/domain/types';
import type { Repository } from './repository';

export function createTauriRepository(): Repository {
  return {
    listJourneys: () => invoke<Journey[]>('journeys_list'),
    getJourney: (id) => invoke<Journey>('journey_get', { id }),
    createJourney: (input: NewJourneyInput) => invoke<Journey>('journey_create', { input }),
    updateJourney: (id, patch: JourneyPatch) =>
      invoke<Journey>('journey_update', { id, patch }),
    setJourneyStatus: (id, status: JourneyStatus) =>
      invoke<Journey>('journey_set_status', { id, status }),
    deleteJourney: (id) => invoke<void>('journey_delete', { id }),

    listNotes: (options = {}) =>
      invoke<NoteWithLinks[]>('notes_list', {
        search: options.search ?? null,
        journeyId: options.journeyId ?? null,
      }),
    getNote: (id) => invoke<NoteWithLinks>('note_get', { id }),
    createNote: (input: NewNoteInput) => invoke<NoteWithLinks>('note_create', { input }),
    updateNote: (id, patch: NotePatch) => invoke<NoteWithLinks>('note_update', { id, patch }),
    deleteNote: (id) => invoke<void>('note_delete', { id }),
    listDeletedNotes: () => invoke<NoteWithLinks[]>('notes_deleted'),
    restoreNote: (id) => invoke<NoteWithLinks>('note_restore', { id }),
    linkNoteToJourney: (noteId, journeyId, occurredAt) =>
      invoke<TimelineEntry>('note_link_journey', {
        noteId,
        journeyId,
        occurredAt: occurredAt ?? null,
      }),
    unlinkNoteFromJourney: (noteId, journeyId) =>
      invoke<void>('note_unlink_journey', { noteId, journeyId }),
    setNotePinned: (noteId, journeyId, pinned) =>
      invoke<void>('note_set_pinned', { noteId, journeyId, pinned }),

    listTasks: (options = {}) =>
      invoke<TaskWithLinks[]>('tasks_list', { journeyId: options.journeyId ?? null }),
    createTask: (input: NewTaskInput) => invoke<TaskWithLinks>('task_create', { input }),
    setTaskStatus: (id, status: TaskStatus) =>
      invoke<TaskWithLinks>('task_set_status', { id, status }),
    linkTaskToJourney: (taskId, journeyId) =>
      invoke<void>('task_link_journey', { taskId, journeyId }),
    unlinkTaskFromJourney: (taskId, journeyId) =>
      invoke<void>('task_unlink_journey', { taskId, journeyId }),
    deleteTask: (id) => invoke<void>('task_delete', { id }),

    readEventImage: (id, variant) => invoke<string>('event_image_read', { id, variant }),
    listTimeline: (options = {}) =>
      invoke<TimelineEntry[]>('timeline_list', {
        journeyId: options.journeyId ?? null,
        order: options.order ?? 'oldest',
      }),
    createTimelineEvent: (input: NewTimelineEventInput) =>
      invoke<TimelineEntry>('timeline_create_event', { input }),
    updateTimelineEvent: (id, patch: TimelineEventPatch) =>
      invoke<TimelineEntry>('timeline_update_event', { id, patch }),
    confirmTimelineEvent: (id, input: ConfirmPlannedEventInput = {}) =>
      invoke<TimelineEntry>('timeline_confirm_event', { id, input }),
    deletePlannedTimelineEvent: (id) => invoke<void>('timeline_delete_planned_event', { id }),
    revertConfirmedTimelineEvent: (id) =>
      invoke<TimelineEntry>('timeline_revert_confirmed_event', { id }),
    searchTimeline: (search, options = {}) =>
      invoke<TimelineEntry[]>('timeline_search', {
        search,
        journeyId: options.journeyId ?? null,
        order: options.order ?? 'newest',
      }),

    listSubjects: (journeyId, kind) =>
      invoke<SubjectSummary[]>('subjects_list', { journeyId, kind: kind ?? null }),
    subjectKinds: (journeyId) => invoke<[string, number][]>('subject_kinds', { journeyId }),
    subjectStagesUsed: (journeyId, kind) =>
      invoke<string[]>('subject_stages_used', { journeyId, kind }),
    createSubject: (input: NewSubjectInput) => invoke<Subject>('subject_create', { input }),
    updateSubject: (id, patch: SubjectPatch) =>
      invoke<Subject>('subject_update', { id, patch }),
    deleteSubject: (id) => invoke<void>('subject_delete', { id }),
    proposeSubjects: (journeyId) => invoke<ProposedSubject[]>('subject_propose', { journeyId }),
    searchSubjects: (search) => invoke<SubjectSummary[]>('subject_search', { search }),

    listStageSets: () => invoke<StageSetWithOptions[]>('stage_sets_list'),
    createStageSet: (input: NewStageSetInput) =>
      invoke<StageSetWithOptions>('stage_set_create', { input }),
    updateStageSet: (id, patch: StageSetPatch) =>
      invoke<StageSetWithOptions>('stage_set_update', { id, patch }),
    deleteStageSet: (id) => invoke<void>('stage_set_delete', { id }),
    attachStageSet: (journeyId, kind, setId) =>
      invoke<void>('stage_set_attach', { journeyId, kind, setId }),
    detachStageSet: (journeyId, kind) => invoke<void>('stage_set_detach', { journeyId, kind }),
    stageSetForRegister: (journeyId, kind) =>
      invoke<StageSetWithOptions | null>('stage_set_for_register', { journeyId, kind }),
    registerTallies: (journeyId) => invoke<RegisterTally[]>('register_tallies', { journeyId }),

    listStateCategories: (journeyId) =>
      invoke<StateCategory[]>('state_categories_list', { journeyId }),
    createStateCategory: (input: NewStateCategoryInput) =>
      invoke<StateCategory>('state_category_create', { input }),
    updateStateCategory: (id, patch: StateCategoryPatch) =>
      invoke<StateCategory>('state_category_update', { id, patch }),

    appInfo: () => invoke<AppInfo>('app_info'),
    listBackups: () => invoke<BackupInfo[]>('backups_list'),
    createBackup: () => invoke<BackupInfo>('backup_create'),
    restoreBackup: (id) => invoke<BackupInfo>('backup_restore', { id }),
    exportNotebook: () => invoke<ExportInfo>('notebook_export'),
    openDataFolder: (kind) => invoke<void>('data_folder_open', { kind }),
  };
}

/** True when running inside the desktop shell rather than a plain browser. */
export function isTauriAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

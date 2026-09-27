/**
 * In-memory repository.
 *
 * Purpose: run the UI in tests and in a plain browser (`npm run dev:web`)
 * without the desktop shell. SQLite in `src-tauri` remains the real
 * implementation and the source of truth for persistence behaviour — the rules
 * duplicated here are only the ones the UI needs in order to behave correctly
 * (link → log, complete → record, order by `occurredAt`).
 */

import { nowIso } from '@/lib/datetime';
import { deriveTitle, summaryExcerpt } from '@/domain/notes';
import { canRevertConfirmation, isEditable } from '@/domain/timeline';
import { groupTitlesBySharedPrefix } from '@/domain/registers';
import type {
  AppInfo,
  Journey,
  JourneyRef,
  JourneyStatus,
  Note,
  NoteWithLinks,
  NewSubjectInput,
  StageOption,
  StageSet,
  StageSetWithOptions,
  StageTally,
  StageTone,
  Subject,
  Task,
  TimelineEntry,
  TimelineEvent,
} from '@/domain/types';
import { isStageTone, STAGE_TONES } from '@/domain/types';
import type { Repository } from './repository';

interface Link {
  journeyId: string;
  targetType: 'note' | 'task';
  targetId: string;
  pinned: boolean;
}

interface State {
  journeys: Journey[];
  notes: Note[];
  tasks: Task[];
  links: Link[];
  events: TimelineEvent[];
  eventJourneys: { eventId: string; journeyId: string }[];
  subjects: Subject[];
  stageSets: StageSet[];
  stageOptions: StageOption[];
  /** Mirrors `register_stage_sets`: one set per `(journeyId, kind)`. */
  registerStageSets: { journeyId: string; kind: string; setId: string }[];
}

/**
 * Insertion order per event, mirroring the `seq` column added in migration 0002.
 * Two events can share `occurredAt` to the millisecond, and ordering must not
 * fall through to an arbitrary id — the timeline would then shuffle between
 * reads.
 */
const sequence = new WeakMap<TimelineEvent, number>();

let counter = 0;
function id(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString().padStart(4, '0')}`;
}

const STATUS_LABELS: Record<JourneyStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived',
};

/**
 * Mirrors `stage_sets::checked_tone` — an unknown tone is refused rather than
 * silently rendered as an invisible border, and an absent one is `neutral`.
 */
function checkedStageTone(tone: string | undefined): StageTone {
  const trimmed = tone?.trim();
  if (!trimmed) return 'neutral';
  if (!isStageTone(trimmed)) {
    throw new Error(
      `unknown stage tone \`${trimmed}\`; expected one of ${STAGE_TONES.join(', ')}`,
    );
  }
  return trimmed;
}

/**
 * Mirrors `stage_sets::checked_labels`. Duplicates are refused because the label
 * is the key: events store it, so two stages sharing one would make "how many
 * are at 一面" unanswerable.
 */
function checkedStageLabels(labels: string[]): string[] {
  const checked: string[] = [];
  for (const label of labels) {
    const trimmed = label.trim();
    if (!trimmed) throw new Error('a stage needs a name');
    if (checked.includes(trimmed)) {
      throw new Error(
        `\`${trimmed}\` is listed twice; a stage name has to be unique within a set`,
      );
    }
    checked.push(trimmed);
  }
  return checked;
}

export function createMemoryRepository(initial?: Partial<State>): Repository {
  const state: State = {
    journeys: initial?.journeys ?? [],
    notes: initial?.notes ?? [],
    tasks: initial?.tasks ?? [],
    links: initial?.links ?? [],
    events: initial?.events ?? [],
    eventJourneys: initial?.eventJourneys ?? [],
    subjects: initial?.subjects ?? [],
    stageSets: initial?.stageSets ?? [],
    stageOptions: initial?.stageOptions ?? [],
    registerStageSets: initial?.registerStageSets ?? [],
  };

  let seqCounter = 0;
  const nextSeq = () => {
    seqCounter += 1;
    return seqCounter;
  };

  // Seeded events keep the order the fixture listed them in.
  for (const event of state.events) {
    if (!sequence.has(event)) sequence.set(event, nextSeq());
  }

  const journeyRef = (journeyId: string): JourneyRef | null => {
    const journey = state.journeys.find((item) => item.id === journeyId);
    return journey ? { id: journey.id, title: journey.title, icon: journey.icon } : null;
  };

  const refsForTarget = (targetType: 'note' | 'task', targetId: string): JourneyRef[] =>
    state.links
      .filter((link) => link.targetType === targetType && link.targetId === targetId)
      .map((link) => journeyRef(link.journeyId))
      .filter((ref): ref is JourneyRef => ref !== null);

  const withNoteLinks = (note: Note): NoteWithLinks => ({
    ...note,
    journeys: refsForTarget('note', note.id),
    pinnedIn: state.links
      .filter((link) => link.targetType === 'note' && link.targetId === note.id && link.pinned)
      .map((link) => link.journeyId),
  });

  const withTaskLinks = (task: Task) => ({
    ...task,
    journeys: refsForTarget('task', task.id),
  });

  const withEventJourneys = (event: TimelineEvent): TimelineEntry => ({
    ...event,
    journeys: state.eventJourneys
      .filter((entry) => entry.eventId === event.id)
      .map((entry) => journeyRef(entry.journeyId))
      .filter((ref): ref is JourneyRef => ref !== null),
    // Work this event produced, rendered inside its entry.
    tasks: state.tasks
      .filter((task) => task.originType === 'event' && task.originId === event.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(withTaskLinks),
    /*
     * The stage's colour, resolved from the set describing its subject's
     * register. Mirrors `timeline::stage_tones`: derived on read, never stored, so
     * recolouring a set updates every entry that used it.
     */
    stageTone: stageToneFor(event),
  });

  const addEvent = (event: TimelineEvent, journeyIds: string[]): TimelineEntry => {
    sequence.set(event, nextSeq());
    state.events.push(event);
    for (const journeyId of journeyIds) {
      state.eventJourneys.push({ eventId: event.id, journeyId });
    }
    return withEventJourneys(event);
  };

  const requireJourney = (journeyId: string): Journey => {
    const journey = state.journeys.find((item) => item.id === journeyId);
    if (!journey) throw new Error(`journey \`${journeyId}\` not found`);
    return journey;
  };

  const journeyIdsForTarget = (targetType: 'note' | 'task', targetId: string): string[] =>
    state.links
      .filter((link) => link.targetType === targetType && link.targetId === targetId)
      .map((link) => link.journeyId);

  /**
   * A set's stages, in the order they were entered.
   *
   * Stable rather than meaningful: a stage carries no position (D-043), so this
   * order exists only so the editor's rows do not reshuffle between saves. No
   * display derives from it.
   */
  const optionsOf = (setId: string): StageOption[] =>
    state.stageOptions
      .filter((option) => option.setId === setId)
      .sort(
        (left, right) =>
          left.position - right.position || left.label.localeCompare(right.label),
      );

  const withStageOptions = (set: StageSet): StageSetWithOptions => ({
    ...set,
    options: optionsOf(set.id),
    registerCount: state.registerStageSets.filter((entry) => entry.setId === set.id).length,
  });

  /**
   * The tone an event's stage carries, from the set describing its subject's
   * register. Mirrors `timeline::stage_tones`.
   *
   * `null` when the register has no set or the stage sits outside it — which
   * renders untoned rather than as an error, because a stage typed before the set
   * existed is still what the user wrote.
   */
  const stageToneFor = (event: TimelineEvent): string | null => {
    if (!event.subjectId || !event.stage) return null;
    const subject = state.subjects.find((item) => item.id === event.subjectId);
    if (!subject) return null;

    const attachment = state.registerStageSets.find(
      (entry) => entry.journeyId === subject.journeyId && entry.kind === subject.kind,
    );
    if (!attachment) return null;

    return (
      state.stageOptions.find(
        (option) => option.setId === attachment.setId && option.label === event.stage,
      )?.tone ?? null
    );
  };

  /**
   * A subject's current stage: the `stage` of its most recent event, by
   * `occurredAt` then insertion order. Mirrors the correlated subquery in
   * `subjects::list` — never stored, so it cannot disagree with history.
   */
  const currentStageOf = (subjectId: string): string | null => {
    const latest = state.events
      .filter(
        (event) =>
          event.subjectId === subjectId && event.stage && event.eventState === 'recorded',
      )
      .sort(
        (left, right) =>
          left.occurredAt.localeCompare(right.occurredAt) ||
          (sequence.get(left) ?? 0) - (sequence.get(right) ?? 0),
      )
      .at(-1);
    return latest?.stage ?? null;
  };

  const logNote = (note: Note, journeyId: string, occurredAt?: string): TimelineEntry => {
    requireJourney(journeyId);

    const already = state.links.some(
      (link) =>
        link.targetType === 'note' && link.targetId === note.id && link.journeyId === journeyId,
    );
    if (!already) {
      state.links.push({ journeyId, targetType: 'note', targetId: note.id, pinned: false });
    }

    const summary = summaryExcerpt(note.bodyMd, note.title);
    return addEvent(
      {
        id: id('evt'),
        eventType: 'note_logged',
        title: note.title,
        summary: summary || null,
        reflection: null,
        occurredAt: occurredAt ?? note.occurredAt ?? note.createdAt,
        createdAt: nowIso(),
        sourceType: 'note',
        sourceId: note.id,
        importance: 'normal',
        payloadJson: null,
        eventState: 'recorded',
        plannedFor: null,
        subjectId: null,
        stage: null,
      },
      [journeyId],
    );
  };

  /**
   * Mirrors `tasks::link_within`: filing a task into a journey records that it
   * was added, dated when the task was created so it lands where the decision
   * belongs. A task that is already finished also gets its completion.
   */
  const linkTask = (task: Task, journeyId: string): void => {
    const already = state.links.some(
      (link) =>
        link.targetType === 'task' && link.targetId === task.id && link.journeyId === journeyId,
    );
    if (already) return;

    state.links.push({ journeyId, targetType: 'task', targetId: task.id, pinned: false });

    // A task that came from an event needs no "added" row: the event says so.
    if (task.originType) {
      if (task.status === 'done' && task.completedAt) recordCompletion(task, journeyId);
      return;
    }

    addEvent(
      {
        id: id('evt'),
        eventType: 'task_added',
        title: task.title,
        summary: 'Added',
        reflection: null,
        occurredAt: task.createdAt,
        createdAt: nowIso(),
        sourceType: 'task',
        sourceId: task.id,
        importance: 'compact',
        payloadJson: null,
        eventState: 'recorded',
        plannedFor: null,
        subjectId: null,
        stage: null,
      },
      [journeyId],
    );

    if (task.status === 'done' && task.completedAt) recordCompletion(task, journeyId);
  };

  /** The "already finished when filed" case, shared by both link paths. */
  const recordCompletion = (task: Task, journeyId: string): void => {
    if (!task.completedAt) return;
    addEvent(
      {
        id: id('evt'),
        eventType: 'task_completed',
        title: task.title,
        summary: 'Completed',
        reflection: null,
        occurredAt: task.completedAt,
        createdAt: nowIso(),
        sourceType: 'task',
        sourceId: task.id,
        importance: 'compact',
        payloadJson: JSON.stringify({ field: 'status', from: 'todo', to: 'done' }),
        eventState: 'recorded',
        plannedFor: null,
        subjectId: null,
        stage: null,
      },
      [journeyId],
    );
  };

  /** Mirrors `timeline::detach_source_from_journey`. */
  const detachSource = (sourceType: string, sourceId: string, journeyId: string): void => {
    const affected = state.events
      .filter((event) => event.sourceType === sourceType && event.sourceId === sourceId)
      .map((event) => event.id);

    state.eventJourneys = state.eventJourneys.filter(
      (entry) => !(entry.journeyId === journeyId && affected.includes(entry.eventId)),
    );
    state.events = state.events.filter(
      (event) =>
        !affected.includes(event.id) ||
        state.eventJourneys.some((entry) => entry.eventId === event.id),
    );
  };

  /**
   * Insert a subject row, mirroring `subjects::create`.
   *
   * Shared by `createSubject` and by the record path, which creates a thing and
   * the first event about it together — one implementation so the two cannot
   * validate differently.
   */
  const createSubjectRow = (input: NewSubjectInput): Subject => {
    const title = input.title.trim();
    if (!title) throw new Error('a tracked item needs a name');
    const kind = input.kind.trim();
    if (!kind) throw new Error('a tracked item needs a kind');
    requireJourney(input.journeyId);

    const now = nowIso();
    const subject: Subject = {
      id: id('sub'),
      journeyId: input.journeyId,
      kind,
      title,
      createdAt: now,
      updatedAt: now,
    };
    state.subjects.push(subject);
    return subject;
  };

  return {
    // --- Journeys ---------------------------------------------------------
    listJourneys: async () =>
      [...state.journeys].sort((a, b) => {
        const archived = Number(a.status === 'archived') - Number(b.status === 'archived');
        return archived !== 0 ? archived : a.createdAt.localeCompare(b.createdAt);
      }),

    getJourney: async (journeyId) => requireJourney(journeyId),

    createJourney: async (input) => {
      const title = input.title.trim();
      if (!title) throw new Error('a journey needs a title');

      const now = nowIso();
      const journey: Journey = {
        id: id('jny'),
        title,
        description: input.description?.trim() || null,
        status: input.status ?? 'active',
        icon: input.icon ?? null,
        coverPath: null,
        startedAt: input.startedAt ?? now,
        endedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      state.journeys.push(journey);
      return journey;
    },

    updateJourney: async (journeyId, patch) => {
      const journey = requireJourney(journeyId);
      if (patch.title !== undefined) {
        const title = patch.title.trim();
        if (!title) throw new Error('a journey needs a title');
        journey.title = title;
      }
      // An explicit `null` clears; an absent key leaves the value alone.
      if ('description' in patch) {
        journey.description = patch.description?.trim() || null;
      }
      if (patch.icon !== undefined) journey.icon = patch.icon;
      if (patch.startedAt !== undefined) journey.startedAt = patch.startedAt;
      journey.updatedAt = nowIso();
      return journey;
    },

    setJourneyStatus: async (journeyId, status) => {
      const journey = requireJourney(journeyId);
      if (journey.status === status) return journey;

      const previous = journey.status;
      const now = nowIso();
      journey.status = status;
      journey.endedAt = status === 'completed' || status === 'archived' ? now : null;
      journey.updatedAt = now;

      addEvent(
        {
          id: id('evt'),
          eventType: 'journey_status_changed',
          title: journey.title,
          summary: `${STATUS_LABELS[previous]} → ${STATUS_LABELS[status]}`,
          reflection: null,
          occurredAt: now,
          createdAt: now,
          sourceType: 'journey',
          sourceId: journey.id,
          importance: status === 'completed' ? 'milestone' : 'compact',
          payloadJson: JSON.stringify({ field: 'status', from: previous, to: status }),
          eventState: 'recorded',
          plannedFor: null,
          subjectId: null,
          stage: null,
        },
        [journey.id],
      );
      return journey;
    },

    deleteJourney: async (journeyId) => {
      requireJourney(journeyId);

      // Mirrors journeys::delete — notes and tasks survive unfiled; derived
      // events for this journey go, free-standing recorded ones stay.
      const affected = state.eventJourneys
        .filter((entry) => entry.journeyId === journeyId)
        .map((entry) => entry.eventId);

      state.journeys = state.journeys.filter((journey) => journey.id !== journeyId);
      state.links = state.links.filter((link) => link.journeyId !== journeyId);
      state.eventJourneys = state.eventJourneys.filter(
        (entry) => entry.journeyId !== journeyId,
      );

      state.events = state.events.filter((event) => {
        if (!affected.includes(event.id)) return true;
        if (state.eventJourneys.some((entry) => entry.eventId === event.id)) return true;
        // Orphaned: keep only if it stands on its own.
        return !['journey', 'note', 'task'].includes(event.sourceType ?? '');
      });
    },

    // --- Notes ------------------------------------------------------------
    listNotes: async (options = {}) => {
      const needle = options.search?.trim().toLowerCase();
      return state.notes
        .filter((note) => !note.deletedAt)
        .filter(
          (note) =>
            !needle ||
            note.title.toLowerCase().includes(needle) ||
            note.bodyMd.toLowerCase().includes(needle),
        )
        .filter(
          (note) =>
            !options.journeyId ||
            journeyIdsForTarget('note', note.id).includes(options.journeyId),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(withNoteLinks);
    },

    getNote: async (noteId) => {
      const note = state.notes.find((item) => item.id === noteId);
      if (!note) throw new Error(`note \`${noteId}\` not found`);
      return withNoteLinks(note);
    },

    createNote: async (input) => {
      const now = nowIso();
      const body = input.bodyMd ?? '';
      const note: Note = {
        id: id('note'),
        title: input.title?.trim() || deriveTitle(body),
        bodyMd: body,
        noteType: input.noteType ?? 'note',
        occurredAt: input.occurredAt ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      state.notes.push(note);

      /*
       * Mirrors the Rust `notes::create`: an empty note is **linked** to the
       * journey but not logged onto its timeline. `New note` inside a journey
       * used to put an `Untitled` row on the timeline before anything was
       * written.
       */
      if (input.journeyId) {
        if (body.trim()) {
          logNote(note, input.journeyId);
        } else {
          requireJourney(input.journeyId);
          state.links.push({
            journeyId: input.journeyId,
            targetType: 'note',
            targetId: note.id,
            pinned: false,
          });
        }
      }
      return withNoteLinks(note);
    },

    updateNote: async (noteId, patch) => {
      const note = state.notes.find((item) => item.id === noteId);
      if (!note) throw new Error(`note \`${noteId}\` not found`);

      const wasEmpty = !note.bodyMd.trim();

      if (patch.bodyMd !== undefined) note.bodyMd = patch.bodyMd;
      note.title = patch.title?.trim() || deriveTitle(note.bodyMd);
      if ('occurredAt' in patch) note.occurredAt = patch.occurredAt ?? null;
      if (patch.noteType !== undefined) note.noteType = patch.noteType;
      note.updatedAt = nowIso();

      /*
       * Mirrors the Rust `notes::update`: a note created inside a journey is
       * linked immediately but kept off the timeline until it has content. This
       * is where it earns its entry — the first edit that gives it something to
       * read logs it onto every journey it belongs to.
       *
       * Ordinary edits still write no history; only the empty → non-empty
       * transition does, and only if nothing was logged for this note already.
       */
      const gainedContent = wasEmpty && Boolean(note.bodyMd.trim());
      const alreadyLogged = state.events.some(
        (event) => event.sourceType === 'note' && event.sourceId === noteId,
      );
      if (gainedContent && !alreadyLogged) {
        for (const journeyId of journeyIdsForTarget('note', noteId)) {
          logNote(note, journeyId);
        }
      }

      return withNoteLinks(note);
    },

    deleteNote: async (noteId) => {
      const note = state.notes.find((item) => item.id === noteId);
      if (!note) throw new Error(`note \`${noteId}\` not found`);
      note.deletedAt = nowIso();

      /*
       * Mirrors `timeline::delete_for_source`. The note row is kept so the text
       * is recoverable, but its timeline entries go: an entry asserts "this
       * happened and is here to read", which stops being true once the note is
       * deleted. Leaving them made unopenable, unremovable rows.
       */
      const orphaned = state.events
        .filter((event) => event.sourceType === 'note' && event.sourceId === noteId)
        .map((event) => event.id);
      state.events = state.events.filter((event) => !orphaned.includes(event.id));
      state.eventJourneys = state.eventJourneys.filter(
        (entry) => !orphaned.includes(entry.eventId),
      );
    },

    listDeletedNotes: async () =>
      state.notes
        .filter((note) => note.deletedAt !== null)
        .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
        .map(withNoteLinks),
    restoreNote: async (noteId) => {
      const note = state.notes.find((item) => item.id === noteId && item.deletedAt !== null);
      if (!note) throw new Error(`deleted note \`${noteId}\` not found`);
      note.deletedAt = null;
      return withNoteLinks(note);
    },

    linkNoteToJourney: async (noteId, journeyId, occurredAt) => {
      const note = state.notes.find((item) => item.id === noteId);
      if (!note) throw new Error(`note \`${noteId}\` not found`);
      return logNote(note, journeyId, occurredAt);
    },

    unlinkNoteFromJourney: async (noteId, journeyId) => {
      state.links = state.links.filter(
        (link) =>
          !(
            link.targetType === 'note' &&
            link.targetId === noteId &&
            link.journeyId === journeyId
          ),
      );
      detachSource('note', noteId, journeyId);
    },

    setNotePinned: async (noteId, journeyId, pinned) => {
      const link = state.links.find(
        (item) =>
          item.targetType === 'note' &&
          item.targetId === noteId &&
          item.journeyId === journeyId,
      );
      if (!link) throw new Error(`link between note \`${noteId}\` and journey not found`);
      link.pinned = pinned;
    },

    // --- Tasks ------------------------------------------------------------
    listTasks: async (options = {}) =>
      state.tasks
        .filter(
          (task) =>
            !options.journeyId ||
            journeyIdsForTarget('task', task.id).includes(options.journeyId),
        )
        .sort((a, b) => {
          const finished = (task: Task) =>
            Number(task.status === 'done' || task.status === 'cancelled');
          const byFinished = finished(a) - finished(b);
          if (byFinished !== 0) return byFinished;

          const byMissingDue = Number(!a.dueAt) - Number(!b.dueAt);
          if (byMissingDue !== 0) return byMissingDue;
          if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt.localeCompare(b.dueAt);
          if (a.completedAt && b.completedAt && a.completedAt !== b.completedAt) {
            return b.completedAt.localeCompare(a.completedAt);
          }
          return a.createdAt.localeCompare(b.createdAt);
        })
        .map(withTaskLinks),

    createTask: async (input) => {
      const title = input.title.trim();
      if (!title) throw new Error('a task needs a title');

      const now = nowIso();
      const task: Task = {
        id: id('task'),
        title,
        detailsMd: input.detailsMd?.trim() || null,
        status: 'todo',
        dueAt: input.dueAt ?? null,
        completedAt: null,
        originType: input.originType ?? null,
        originId: input.originId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      state.tasks.push(task);

      if (input.journeyId) {
        requireJourney(input.journeyId);
        linkTask(task, input.journeyId);
      }
      return withTaskLinks(task);
    },

    setTaskStatus: async (taskId, status) => {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) throw new Error(`task \`${taskId}\` not found`);
      if (task.status === status) return withTaskLinks(task);

      const previous = task.status;
      const now = nowIso();
      task.status = status;
      task.completedAt = status === 'done' ? now : null;
      task.updatedAt = now;

      const logged: [string, string] | null =
        status === 'done'
          ? ['task_completed', 'Completed']
          : previous === 'done'
            ? ['task_reopened', 'Reopened']
            : null;

      if (logged) {
        const [eventType, label] = logged;
        addEvent(
          {
            id: id('evt'),
            eventType,
            title: task.title,
            summary: label,
            reflection: null,
            occurredAt: now,
            createdAt: now,
            sourceType: 'task',
            sourceId: task.id,
            importance: 'compact',
            payloadJson: JSON.stringify({ field: 'status', from: previous, to: status }),
            eventState: 'recorded',
            plannedFor: null,
            subjectId: null,
            stage: null,
          },
          journeyIdsForTarget('task', task.id),
        );
      }
      return withTaskLinks(task);
    },

    linkTaskToJourney: async (taskId, journeyId) => {
      requireJourney(journeyId);
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) throw new Error(`task \`${taskId}\` not found`);
      linkTask(task, journeyId);
    },

    unlinkTaskFromJourney: async (taskId, journeyId) => {
      state.links = state.links.filter(
        (link) =>
          !(
            link.targetType === 'task' &&
            link.targetId === taskId &&
            link.journeyId === journeyId
          ),
      );
      detachSource('task', taskId, journeyId);
    },

    deleteTask: async (taskId) => {
      state.tasks = state.tasks.filter((task) => task.id !== taskId);
      state.links = state.links.filter(
        (link) => !(link.targetType === 'task' && link.targetId === taskId),
      );
    },

    // --- Timeline ---------------------------------------------------------
    listTimeline: async (options = {}) => {
      const direction = options.order === 'newest' ? -1 : 1;
      return state.events
        .filter(
          (event) =>
            !options.journeyId ||
            state.eventJourneys.some(
              (entry) => entry.eventId === event.id && entry.journeyId === options.journeyId,
            ),
        )
        .sort((a, b) => {
          // occurredAt leads; insertion order breaks ties. Matches the SQL in
          // src-tauri/src/db/timeline.rs.
          const byOccurred = a.occurredAt.localeCompare(b.occurredAt);
          if (byOccurred !== 0) return byOccurred * direction;
          return ((sequence.get(a) ?? 0) - (sequence.get(b) ?? 0)) * direction;
        })
        .map(withEventJourneys);
    },

    /*
     * Mirrors `timeline::search`. The fields matched are the same five, and the
     * subject join is the one that makes searching `TMM` find entries titled only
     * `TMM` *and* entries that merely belong to it.
     */
    searchTimeline: async (search, options = {}) => {
      const needle = search.trim().toLowerCase();
      const direction = options.order === 'newest' ? -1 : 1;

      const matches = (event: TimelineEvent): boolean => {
        // Blank is "no filter", never "match nothing" — same as the SQL.
        if (!needle) return true;
        const subject = event.subjectId
          ? state.subjects.find((item) => item.id === event.subjectId)
          : undefined;
        return [event.title, event.summary, event.reflection, event.stage, subject?.title].some(
          (field) => (field ?? '').toLowerCase().includes(needle),
        );
      };

      return state.events
        .filter(
          (event) =>
            matches(event) &&
            (!options.journeyId ||
              state.eventJourneys.some(
                (entry) => entry.eventId === event.id && entry.journeyId === options.journeyId,
              )),
        )
        .sort((a, b) => {
          const byOccurred = a.occurredAt.localeCompare(b.occurredAt);
          if (byOccurred !== 0) return byOccurred * direction;
          return ((sequence.get(a) ?? 0) - (sequence.get(b) ?? 0)) * direction;
        })
        .map(withEventJourneys);
    },

    /*
     * Mirrors `timeline::update`, refusals included. The two implementations
     * disagreeing is exactly how the note-deletion bug escaped, so the guards
     * here are the same guards and in the same order.
     */
    updateTimelineEvent: async (id, patch) => {
      const event = state.events.find((item) => item.id === id);
      if (!event) throw new Error(`timeline event \`${id}\` not found`);
      if (!isEditable(event)) {
        throw new Error(
          'only planned events and recorded events of normal weight can be edited',
        );
      }

      if (patch.title !== undefined) {
        const title = patch.title.trim();
        if (!title) throw new Error('an event needs a title');
        event.title = title;
      }

      // `null` clears; an absent key leaves the field alone; text that trims to
      // nothing is stored as null, the same normalisation the create path does.
      const resolve = (value: string | null | undefined, current: string | null) => {
        if (value === undefined) return current;
        return value === null ? null : value.trim() || null;
      };
      event.summary = resolve(patch.summary, event.summary);
      event.reflection = resolve(patch.reflection, event.reflection);

      if (patch.occurredAt !== undefined) event.occurredAt = patch.occurredAt;

      /*
       * While planned, `occurredAt` *is* the date being aimed at, so moving a
       * deadline has to move both or confirming later would report a target the
       * user had already changed. On a recorded event the target is history.
       */
      if (event.eventState === 'planned') event.plannedFor = event.occurredAt;

      /*
       * Filing onto a tracked thing, or off one. Mirrors `timeline::update`,
       * including the guard: a register must only ever take events from its own
       * Journey, or its counts would describe things the user never put there.
       */
      if (patch.subjectId !== undefined) {
        if (patch.subjectId === null) {
          event.subjectId = null;
          event.stage = null;
        } else {
          const subject = state.subjects.find((item) => item.id === patch.subjectId);
          if (!subject) throw new Error(`tracked item \`${patch.subjectId}\` not found`);
          const onThatJourney = state.eventJourneys.some(
            (entry) => entry.eventId === id && entry.journeyId === subject.journeyId,
          );
          if (!onThatJourney) {
            throw new Error('a tracked item can only take events from its own Journey');
          }
          event.subjectId = subject.id;
        }
      }

      // A stage with nothing to be the stage *of* is meaningless.
      if (patch.stage !== undefined && event.subjectId) {
        event.stage = patch.stage === null ? null : patch.stage.trim() || null;
      }

      /*
       * Mutated in place rather than replaced: `sequence` is keyed by object
       * identity, so a new object would lose its insertion order and land at the
       * wrong end of any tie on `occurredAt`. `createdAt`, `importance`,
       * `eventType`, `source*` and `payloadJson` are untouched for the same
       * reasons as in Rust.
       */
      return withEventJourneys(event);
    },

    /** Mirrors `timeline::confirm`. */
    confirmTimelineEvent: async (id, input = {}) => {
      const event = state.events.find((item) => item.id === id);
      if (!event) throw new Error(`timeline event \`${id}\` not found`);
      if (event.eventState !== 'planned') {
        throw new Error('only a planned event can be marked as happened');
      }

      const title = input.title === undefined ? event.title : input.title.trim();
      if (!title) throw new Error('an event needs a title');

      /*
       * What it turned out to be about, and the stage it reached. Mirrors
       * `timeline::confirm`: confirming is the moment a plan becomes a fact, so it
       * is also the moment a stage becomes true (D-051).
       */
      if (input.subjectId !== undefined && input.newSubject) {
        throw new Error(
          'an event is about one thing: name a new one or pick an existing one, not both',
        );
      }

      const journeyIdsOfEvent = state.eventJourneys
        .filter((entry) => entry.eventId === id)
        .map((entry) => entry.journeyId);

      if (input.newSubject) {
        const [firstJourneyId] = journeyIdsOfEvent;
        if (!firstJourneyId) {
          throw new Error('a new tracked item needs a Journey to belong to');
        }
        event.subjectId = createSubjectRow({
          journeyId: firstJourneyId,
          kind: input.newSubject.kind,
          title: input.newSubject.title,
        }).id;
      } else if (input.subjectId !== undefined) {
        if (input.subjectId === null) {
          event.subjectId = null;
        } else {
          const subject = state.subjects.find((item) => item.id === input.subjectId);
          if (!subject) throw new Error(`tracked item \`${input.subjectId}\` not found`);
          if (!journeyIdsOfEvent.includes(subject.journeyId)) {
            throw new Error('a tracked item can only take events from its own Journey');
          }
          event.subjectId = subject.id;
        }
      }

      if (input.stage !== undefined) {
        event.stage = input.stage?.trim() || null;
      }
      // A stage with nothing to be the stage *of* is meaningless.
      if (!event.subjectId) event.stage = null;

      // The target is kept, not overwritten by the outcome: that is what lets an
      // entry read "due the 12th, done on the 10th".
      event.title = title;
      event.plannedFor = event.plannedFor ?? event.occurredAt;
      event.occurredAt = input.occurredAt ?? nowIso();
      event.eventState = 'recorded';

      return withEventJourneys(event);
    },

    /** Mirrors `timeline::revert_confirmed`. The original target and filing survive. */
    revertConfirmedTimelineEvent: async (id) => {
      const event = state.events.find((item) => item.id === id);
      if (!event) throw new Error(`timeline event \`${id}\` not found`);
      if (!canRevertConfirmation(event) || event.plannedFor === null) {
        throw new Error(
          'only a confirmed plan can be returned to planned; other recorded history is kept',
        );
      }
      event.eventState = 'planned';
      event.occurredAt = event.plannedFor;
      return withEventJourneys(event);
    },

    /** Mirrors `timeline::delete_planned`. Recorded history is never removed. */
    deletePlannedTimelineEvent: async (id) => {
      const event = state.events.find((item) => item.id === id);
      if (!event) throw new Error(`timeline event \`${id}\` not found`);
      if (event.eventState !== 'planned') {
        throw new Error('only a planned event can be removed; recorded history is kept');
      }

      for (const task of state.tasks) {
        if (task.originType === 'event' && task.originId === id) {
          task.originType = null;
          task.originId = null;
        }
      }
      state.events = state.events.filter((item) => item.id !== id);
      state.eventJourneys = state.eventJourneys.filter((entry) => entry.eventId !== id);
    },

    // --- Subjects ---------------------------------------------------------

    /**
     * Mirrors `subjects::list`: the register's derived columns are computed from
     * events on every read rather than cached, so a row cannot disagree with its
     * own history.
     */
    listSubjects: async (journeyId, kind) => {
      const eventsAbout = (subjectId: string) =>
        state.events
          .filter((event) => event.subjectId === subjectId)
          .sort((a, b) => {
            // occurredAt leads, insertion order breaks ties — the same ordering
            // the timeline itself uses, so "latest" means the same thing here.
            const byOccurred = a.occurredAt.localeCompare(b.occurredAt);
            if (byOccurred !== 0) return byOccurred;
            return (sequence.get(a) ?? 0) - (sequence.get(b) ?? 0);
          });

      return state.subjects
        .filter(
          (subject) => subject.journeyId === journeyId && (!kind || subject.kind === kind),
        )
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((subject) => {
          const events = eventsAbout(subject.id);
          return {
            ...subject,
            currentStage: currentStageOf(subject.id),
            lastEventAt: events.at(-1)?.occurredAt ?? null,
            eventCount: events.length,
          };
        });
    },

    subjectKinds: async (journeyId) => {
      const counts = new Map<string, number>();
      for (const subject of state.subjects.filter((item) => item.journeyId === journeyId)) {
        counts.set(subject.kind, (counts.get(subject.kind) ?? 0) + 1);
      }
      return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    },

    /** Most recently used first — see the Rust test for why that ordering. */
    subjectStagesUsed: async (journeyId, kind) => {
      const ids = new Set(
        state.subjects
          .filter((subject) => subject.journeyId === journeyId && subject.kind === kind)
          .map((subject) => subject.id),
      );

      const lastUsed = new Map<string, string>();
      for (const event of state.events) {
        if (!event.stage || !event.subjectId || !ids.has(event.subjectId)) continue;
        const previous = lastUsed.get(event.stage);
        if (!previous || event.occurredAt > previous) {
          lastUsed.set(event.stage, event.occurredAt);
        }
      }

      return [...lastUsed.entries()]
        .sort((a, b) => b[1].localeCompare(a[1]))
        .map(([stage]) => stage);
    },

    createSubject: async (input) => createSubjectRow(input),

    updateSubject: async (subjectId, patch) => {
      const subject = state.subjects.find((item) => item.id === subjectId);
      if (!subject) throw new Error(`tracked item \`${subjectId}\` not found`);

      if (patch.title !== undefined) {
        const title = patch.title.trim();
        if (!title) throw new Error('a tracked item needs a name');
        subject.title = title;
      }
      if (patch.kind !== undefined) {
        const kind = patch.kind.trim();
        if (!kind) throw new Error('a tracked item needs a kind');
        subject.kind = kind;
      }
      subject.updatedAt = nowIso();

      // Mutated in place: the events point at the id, so a rename is invisible
      // to history. That is the whole reason this is a row.
      return subject;
    },

    /** Mirrors `ON DELETE SET NULL` — untracking never erases what happened. */
    deleteSubject: async (subjectId) => {
      const exists = state.subjects.some((item) => item.id === subjectId);
      if (!exists) throw new Error(`tracked item \`${subjectId}\` not found`);

      state.subjects = state.subjects.filter((item) => item.id !== subjectId);
      for (const event of state.events) {
        if (event.subjectId === subjectId) {
          event.subjectId = null;
          event.stage = null;
        }
      }
    },

    proposeSubjects: async (journeyId) => {
      const untagged = state.events
        .filter(
          (event) =>
            event.eventType === 'event_recorded' &&
            !event.subjectId &&
            state.eventJourneys.some(
              (entry) => entry.eventId === event.id && entry.journeyId === journeyId,
            ),
        )
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

      return groupTitlesBySharedPrefix(
        untagged.map((event) => [event.id, event.title] as [string, string]),
      );
    },

    /** Mirrors `subjects::search` — name match only, across every Journey. */
    searchSubjects: async (search) => {
      const needle = search.trim().toLowerCase();
      if (!needle) return [];

      return state.subjects
        .filter((subject) => subject.title.toLowerCase().includes(needle))
        .sort((left, right) => left.title.localeCompare(right.title))
        .map((subject) => {
          const own = state.events.filter((event) => event.subjectId === subject.id);
          const latest = [...own]
            .sort(
              (left, right) =>
                left.occurredAt.localeCompare(right.occurredAt) ||
                (sequence.get(left) ?? 0) - (sequence.get(right) ?? 0),
            )
            .at(-1);
          return {
            ...subject,
            currentStage: currentStageOf(subject.id),
            lastEventAt: latest?.occurredAt ?? null,
            eventCount: own.length,
          };
        });
    },

    createTimelineEvent: async (input) => {
      const title = input.title.trim();
      if (!title) throw new Error('an event needs a title');

      const journeyIds = input.journeyIds ?? [];
      journeyIds.forEach(requireJourney);

      /*
       * A thing being tracked for the first time, named while recording rather
       * than picked. Mirrors `timeline_create_event`: created *before* the event
       * so the event can carry its id, refused alongside `subjectId` because the
       * two disagree about what the event is about, and filed onto the first
       * Journey since a subject belongs to exactly one.
       */
      let createdSubjectId: string | null = null;
      if (input.newSubject) {
        if (input.subjectId) {
          throw new Error(
            'an event is about one thing: name a new one or pick an existing one, not both',
          );
        }

        const [firstJourneyId] = journeyIds;
        if (!firstJourneyId) {
          throw new Error('a new tracked item needs a Journey to belong to');
        }

        createdSubjectId = createSubjectRow({
          journeyId: firstJourneyId,
          kind: input.newSubject.kind,
          title: input.newSubject.title,
        }).id;
      }

      // Mirrors the Rust command: a recorded transition becomes the payload,
      // and forces the event type so history stays readable.
      let payloadJson: string | null = null;
      let eventType = input.eventType?.trim() || 'event_recorded';
      if (input.state) {
        // Mirrors the Rust refusal: a transition is a fact, and a plan has none.
        if (input.planned) {
          throw new Error(
            'a planned event cannot record a state change, because nothing has changed yet',
          );
        }

        const field = input.state.field.trim();
        const to = input.state.to.trim();
        if (!field || !to) throw new Error('a state change needs a field and a new value');

        const from = input.state.from?.trim();
        const subject = input.state.subject?.trim();
        payloadJson = JSON.stringify({
          field,
          from: from ? from : null,
          to,
          subject: subject ? subject : null,
        });
        eventType = 'state_changed';
      }

      const entry = addEvent(
        {
          id: id('evt'),
          eventType,
          title,
          summary: input.summary?.trim() || null,
          reflection: input.reflection?.trim() || null,
          occurredAt: input.occurredAt ?? nowIso(),
          createdAt: nowIso(),
          sourceType: null,
          sourceId: null,
          importance: input.importance ?? 'normal',
          payloadJson,
          /*
           * A commitment rather than a record, and `plannedFor` starts equal to
           * `occurredAt`: while planned, an entry's place on the timeline *is*
           * the date it is aimed at. Mirrors `timeline_create_event`.
           */
          eventState: input.planned ? 'planned' : 'recorded',
          plannedFor: input.planned ? (input.occurredAt ?? nowIso()) : null,
          /*
           * Filed onto a tracked thing only when the user picked one, and only if
           * that thing lives on one of this event's Journeys — the same guard as
           * Rust, so a register can never acquire an unrelated event and report a
           * count the user did not create.
           */
          subjectId: (() => {
            // A thing created just above is already known to be on this event's
            // first Journey, so it needs no membership check.
            if (createdSubjectId) return createdSubjectId;
            if (!input.subjectId) return null;
            const subject = state.subjects.find((item) => item.id === input.subjectId);
            if (!subject) throw new Error(`tracked item \`${input.subjectId}\` not found`);
            if (!journeyIds.includes(subject.journeyId)) {
              throw new Error('a tracked item can only take events from its own Journey');
            }
            return subject.id;
          })(),
          // A stage with nothing to be the stage *of* is meaningless.
          stage: input.subjectId || createdSubjectId ? input.stage?.trim() || null : null,
        },
        journeyIds,
      );

      /*
       * Work the event revealed. Mirrors the Rust command, which creates these in
       * the same transaction and links them back via `origin_type='event'` — so
       * "the interview showed me three gaps" is one act, and the timeline renders
       * the tasks inside the event rather than as unrelated rows.
       *
       * This was missing while the Rust side had it, which made the feature dead
       * in dev preview and invisible to every test, since both run on this
       * implementation.
       *
       * The tasks inherit the event's Journeys: a gap revealed by an interview
       * belongs to the same thread the interview does.
       */
      for (const todo of input.tasks ?? []) {
        const taskTitle = todo.title.trim();
        if (!taskTitle) continue;

        const task: Task = {
          id: id('task'),
          title: taskTitle,
          detailsMd: null,
          status: 'todo',
          dueAt: todo.dueAt ?? null,
          completedAt: null,
          originType: 'event',
          originId: entry.id,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        state.tasks.push(task);

        /*
         * Filed through `linkTask`, which is where journey membership lives
         * (`state.links`) — a task carries no journey ids of its own. It also
         * knows not to write an "added" event for a task with an origin: the
         * event being recorded already says where this came from.
         */
        for (const journeyId of journeyIds) {
          linkTask(task, journeyId);
        }
      }

      /*
       * Re-derive so the returned entry carries the tasks just created —
       * `addEvent` computed its links before they existed.
       */
      return withEventJourneys(
        state.events.find((event) => event.id === entry.id) ?? { ...entry },
      );
    },

    // --- Stage sets -------------------------------------------------------

    /*
     * Mirrors `db/stage_sets.rs`. The rules duplicated here are the ones the UI
     * depends on: order is the set's own, a tone is validated against the closed
     * list, a rename follows the events that recorded the old label, and a tally
     * reports empty stages as well as stages recorded outside the set. SQLite
     * remains the real implementation (D-017).
     */

    listStageSets: async () =>
      [...state.stageSets]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(withStageOptions),

    createStageSet: async (input) => {
      const name = input.name.trim();
      if (!name) throw new Error('a stage set needs a name');
      if (input.options.length === 0) throw new Error('a stage set needs at least one stage');

      const labels = checkedStageLabels(input.options.map((option) => option.label));
      const tones = input.options.map((option) => checkedStageTone(option.tone));

      const now = nowIso();
      const set: StageSet = { id: id('stgset'), name, createdAt: now, updatedAt: now };
      state.stageSets.push(set);
      labels.forEach((label, position) => {
        state.stageOptions.push({
          id: id('stgopt'),
          setId: set.id,
          label,
          tone: tones[position] ?? 'neutral',
          position,
        });
      });

      return withStageOptions(set);
    },

    updateStageSet: async (setId, patch) => {
      const set = state.stageSets.find((item) => item.id === setId);
      if (!set) throw new Error(`stage set \`${setId}\` not found`);

      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) throw new Error('a stage set needs a name');
        set.name = name;
      }

      if (patch.options) {
        if (patch.options.length === 0) {
          throw new Error('a stage set needs at least one stage');
        }
        const labels = checkedStageLabels(patch.options.map((option) => option.label));
        const tones = patch.options.map((option) => checkedStageTone(option.tone));
        const previous = new Map(
          state.stageOptions
            .filter((option) => option.setId === setId)
            .map((option) => [option.id, option.label] as const),
        );

        /*
         * Renames first, while the old labels are still on the events — and only
         * within registers this set describes, because two registers may use the
         * same word under different sets.
         */
        const attached = state.registerStageSets.filter((entry) => entry.setId === setId);
        patch.options.forEach((option, index) => {
          if (!option.id) return;
          const oldLabel = previous.get(option.id);
          if (oldLabel === undefined) {
            throw new Error(`stage \`${option.id}\` does not belong to this set`);
          }
          const newLabel = labels[index]!;
          if (oldLabel === newLabel) return;

          for (const entry of attached) {
            const subjectIds = state.subjects
              .filter(
                (subject) =>
                  subject.journeyId === entry.journeyId && subject.kind === entry.kind,
              )
              .map((subject) => subject.id);
            for (const event of state.events) {
              if (
                event.stage === oldLabel &&
                event.subjectId &&
                subjectIds.includes(event.subjectId)
              ) {
                event.stage = newLabel;
              }
            }
          }
        });

        state.stageOptions = state.stageOptions.filter((option) => option.setId !== setId);
        patch.options.forEach((option, position) => {
          state.stageOptions.push({
            // Existing rows keep their id, which is what makes a second rename work.
            id: option.id && previous.has(option.id) ? option.id : id('stgopt'),
            setId,
            label: labels[position]!,
            tone: tones[position] ?? 'neutral',
            position,
          });
        });
      }

      set.updatedAt = nowIso();
      return withStageOptions(set);
    },

    /** Recorded stages survive: history is not deleted with its description. */
    deleteStageSet: async (setId) => {
      const exists = state.stageSets.some((item) => item.id === setId);
      if (!exists) throw new Error(`stage set \`${setId}\` not found`);

      state.stageSets = state.stageSets.filter((item) => item.id !== setId);
      state.stageOptions = state.stageOptions.filter((option) => option.setId !== setId);
      state.registerStageSets = state.registerStageSets.filter(
        (entry) => entry.setId !== setId,
      );
    },

    attachStageSet: async (journeyId, kind, setId) => {
      const trimmedKind = kind.trim();
      if (!trimmedKind) throw new Error('a register needs a kind');
      requireJourney(journeyId);
      if (!state.stageSets.some((item) => item.id === setId)) {
        throw new Error(`stage set \`${setId}\` not found`);
      }

      // Replaces rather than accumulates — one set per register.
      state.registerStageSets = state.registerStageSets.filter(
        (entry) => !(entry.journeyId === journeyId && entry.kind === trimmedKind),
      );
      state.registerStageSets.push({ journeyId, kind: trimmedKind, setId });
    },

    detachStageSet: async (journeyId, kind) => {
      state.registerStageSets = state.registerStageSets.filter(
        (entry) => !(entry.journeyId === journeyId && entry.kind === kind),
      );
    },

    stageSetForRegister: async (journeyId, kind) => {
      const entry = state.registerStageSets.find(
        (item) => item.journeyId === journeyId && item.kind === kind,
      );
      if (!entry) return null;
      const set = state.stageSets.find((item) => item.id === entry.setId);
      return set ? withStageOptions(set) : null;
    },

    registerTallies: async (journeyId) => {
      const kinds = new Map<string, number>();
      for (const subject of state.subjects.filter((item) => item.journeyId === journeyId)) {
        kinds.set(subject.kind, (kinds.get(subject.kind) ?? 0) + 1);
      }

      return [...kinds.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([kind, total]) => {
          const subjects = state.subjects.filter(
            (subject) => subject.journeyId === journeyId && subject.kind === kind,
          );

          const recorded = new Map<string, number>();
          let unstaged = 0;
          for (const subject of subjects) {
            const stage = currentStageOf(subject.id);
            if (stage === null) unstaged += 1;
            else recorded.set(stage, (recorded.get(stage) ?? 0) + 1);
          }

          const entry = state.registerStageSets.find(
            (item) => item.journeyId === journeyId && item.kind === kind,
          );
          const set = entry
            ? (state.stageSets.find((item) => item.id === entry.setId) ?? null)
            : null;

          const stages: StageTally[] = [];
          if (set) {
            for (const option of optionsOf(set.id)) {
              stages.push({
                label: option.label,
                tone: option.tone,
                // Every stage of the set appears, including the empty ones.
                count: recorded.get(option.label) ?? 0,
                offSet: false,
              });
              recorded.delete(option.label);
            }
          }

          // Stages recorded outside the set are reported, never dropped: the
          // parts have to add up to the register.
          for (const [label, count] of recorded) {
            stages.push({ label, tone: 'neutral', count, offSet: true });
          }

          /*
           * Biggest first, then by label. Mirrors `stage_sets::tallies`: the set
           * supplies no order (D-043), so one sort covers everything — including
           * the off-set stages, which are real places things are and must not be
           * ranked behind the set by a position it no longer defines.
           */
          stages.sort(
            (left, right) => right.count - left.count || left.label.localeCompare(right.label),
          );

          return { kind, setName: set?.name ?? null, stages, unstaged, total };
        });
    },

    appInfo: async (): Promise<AppInfo> => ({
      databasePath: 'in-memory (browser preview)',
      schemaVersion: 1,
      seededDemoData: state.journeys.length > 0,
      supportsDataFiles: false,
    }),
    listBackups: async () => [],
    createBackup: async () => {
      throw new Error('Backups are available in the desktop app.');
    },
    restoreBackup: async () => {
      throw new Error('Backup restore is available in the desktop app.');
    },
    exportNotebook: async () => {
      throw new Error('File export is available in the desktop app.');
    },
    openDataFolder: async () => {
      throw new Error('Data folders are available in the desktop app.');
    },
  };
}

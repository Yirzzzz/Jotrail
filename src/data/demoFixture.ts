/**
 * Loads `fixtures/demo-seed.json` into an in-memory repository.
 *
 * Used only when the app runs outside the desktop shell (`npm run dev:web`) and
 * in tests. The desktop app seeds the same fixture through Rust
 * (`src-tauri/src/db/seed.rs`), which is the real implementation.
 */

import demoSeed from '../../fixtures/demo-seed.json';
import type {
  Journey,
  JourneyStatus,
  Note,
  Task,
  TaskStatus,
  TimelineEvent,
  TimelineEventState,
  TimelineImportance,
} from '@/domain/types';
import { createMemoryRepository } from './memoryRepository';
import type { Repository } from './repository';

/** Fixture timestamps carry offsets; the app stores UTC. */
function utc(value: string): string {
  return new Date(value).toISOString();
}

function utcOrNull(value: string | undefined): string | null {
  return value ? utc(value) : null;
}

export function createDemoRepository(): Repository {
  const journeys: Journey[] = demoSeed.journeys.map((journey) => ({
    id: journey.id,
    title: journey.title,
    description: journey.description ?? null,
    status: (journey.status ?? 'active') as JourneyStatus,
    icon: journey.icon ?? null,
    coverPath: null,
    startedAt: utc(journey.startedAt),
    endedAt: null,
    createdAt: utc(journey.startedAt),
    updatedAt: utc(journey.startedAt),
  }));

  const notes: Note[] = demoSeed.notes.map((note) => ({
    id: note.id,
    title: note.title,
    bodyMd: note.bodyMd,
    noteType: note.noteType ?? 'note',
    occurredAt: null,
    createdAt: utc(note.createdAt),
    updatedAt: utc(note.updatedAt ?? note.createdAt),
    deletedAt: null,
  }));

  const tasks: Task[] = demoSeed.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    detailsMd: null,
    status: (task.status ?? 'todo') as TaskStatus,
    dueAt: null,
    completedAt: utcOrNull(task.completedAt),
    // The fixture has no event-spawned tasks; both link paths read these.
    originType: null,
    originId: null,
    createdAt: utc(task.createdAt),
    updatedAt: utc(task.updatedAt ?? task.createdAt),
  }));

  const links = demoSeed.journeyLinks.map((link) => ({
    journeyId: link.journeyId,
    targetType: link.targetType as 'note' | 'task',
    targetId: link.targetId,
    pinned: link.pinned ?? false,
  }));

  const events: TimelineEvent[] = demoSeed.timelineEvents.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    title: event.title,
    summary: event.summary ?? null,
    reflection: event.reflection ?? null,
    occurredAt: utc(event.occurredAt),
    createdAt: utc(event.createdAt ?? event.occurredAt),
    sourceType: event.sourceType ?? null,
    sourceId: event.sourceId ?? null,
    importance: (event.importance ?? 'normal') as TimelineImportance,
    payloadJson: 'payload' in event && event.payload ? JSON.stringify(event.payload) : null,
    eventState: (('eventState' in event ? event.eventState : undefined) ??
      'recorded') as TimelineEventState,
    // A planned entry's position on the timeline *is* the date it is aimed at,
    // so the fixture needs to state it only once. Mirrors `seed.rs`.
    plannedFor:
      ('eventState' in event ? event.eventState : undefined) === 'planned'
        ? utc(event.occurredAt)
        : null,
    /*
     * The fixture declares no tracked things. A register is something the user
     * builds from their own material, and seeding one would put words in their
     * mouth — the same reason there is no invented reflection in here.
     */
    subjectId: null,
    stage: null,
  }));

  const eventJourneys = demoSeed.timelineEvents.flatMap((event) =>
    (event.journeyIds ?? []).map((journeyId) => ({ eventId: event.id, journeyId })),
  );

  // The fixture lists tasks without their events; the Rust seed derives them, so
  // derive them here too or the previews diverge.
  for (const task of tasks) {
    const taskJourneys = links
      .filter((link) => link.targetType === 'task' && link.targetId === task.id)
      .map((link) => link.journeyId);
    if (taskJourneys.length === 0) continue;

    const push = (eventId: string, event: Omit<TimelineEvent, 'id'>) => {
      events.push({ id: eventId, ...event });
      for (const journeyId of taskJourneys) {
        eventJourneys.push({ eventId, journeyId });
      }
    };

    push(`event-${task.id}-added`, {
      eventType: 'task_added',
      title: task.title,
      summary: 'Added',
      reflection: null,
      occurredAt: task.createdAt,
      createdAt: task.createdAt,
      sourceType: 'task',
      sourceId: task.id,
      importance: 'compact',
      payloadJson: null,
      eventState: 'recorded',
      plannedFor: null,
      subjectId: null,
      stage: null,
    });

    if (task.status !== 'done' || !task.completedAt) continue;

    push(`event-${task.id}-completed`, {
      eventType: 'task_completed',
      title: task.title,
      summary: 'Completed',
      reflection: null,
      occurredAt: task.completedAt,
      createdAt: task.completedAt,
      sourceType: 'task',
      sourceId: task.id,
      importance: 'compact',
      payloadJson: JSON.stringify({ field: 'status', from: 'todo', to: 'done' }),
      eventState: 'recorded',
      plannedFor: null,
      subjectId: null,
      stage: null,
    });
  }

  return createMemoryRepository({ journeys, notes, tasks, links, events, eventJourneys });
}

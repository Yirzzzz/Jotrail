/**
 * What is coming, and what happened today.
 *
 * Both selectors exist because the reference dashboards lead with two questions
 * a notebook can actually answer from real records: "what does today look like"
 * and "what is next". Neither invents anything — the day timeline is the events
 * already recorded today, and the upcoming list is task due dates and
 * future-dated events the user entered themselves.
 */

import { differenceInLocalDays, isSameLocalDay, toDate } from '@/lib/datetime';
import { isPlanned, onlyHappened } from './timeline';
import type { TaskWithLinks, TimelineEntry } from './types';

/**
 * Open tasks that need attention *now*: overdue, due today, or undated.
 *
 * Later dates belong to "Up next". Splitting them means a task due tomorrow
 * is not listed twice on the same screen.
 */
export function tasksDueNow(
  tasks: TaskWithLinks[],
  options: { now?: Date } = {},
): TaskWithLinks[] {
  const now = options.now ?? new Date();

  return tasksByUrgency(tasks, options).filter((task) => {
    const due = toDate(task.dueAt);
    if (!due) return true;
    return differenceInLocalDays(now, due) <= 0;
  });
}

/**
 * Open tasks by urgency: overdue first, then soonest, then the undated.
 *
 * Undated tasks sink because they have no claim on today. The Today rail
 * further filters this list through `tasksDueNow` so later dates live in
 * "Up next" instead of appearing twice.
 */
export function tasksByUrgency(
  tasks: TaskWithLinks[],
  options: { now?: Date } = {},
): TaskWithLinks[] {
  const now = options.now ?? new Date();

  const open = tasks.filter((task) => task.status === 'todo' || task.status === 'doing');

  return [...open].sort((left, right) => {
    const leftDue = toDate(left.dueAt);
    const rightDue = toDate(right.dueAt);

    // Undated tasks keep their relative order, below everything dated.
    if (!leftDue && !rightDue) return left.createdAt.localeCompare(right.createdAt);
    if (!leftDue) return 1;
    if (!rightDue) return -1;

    // Negative days-away is overdue, so plain ascending puts the most urgent
    // first without a special case.
    const byDue = differenceInLocalDays(now, leftDue) - differenceInLocalDays(now, rightDue);
    if (byDue !== 0) return byDue;

    // Same day: whichever was written down first.
    return left.createdAt.localeCompare(right.createdAt);
  });
}

export interface UpcomingItem {
  id: string;
  title: string;
  /** UTC ISO-8601 of when it is due/planned. */
  at: string;
  /**
   * Whole local days from today. `>= 1` for tasks; a *planned event* may also be
   * `0` (today) or negative (its deadline has passed unmet), because unlike a
   * task it appears nowhere else on Today.
   */
  daysAway: number;
  kind: 'task' | 'event';
  /**
   * True when this is a commitment the user has not yet confirmed. The rail
   * badges it, so "ICLR 2027 截稿" does not read as a scheduled fact.
   */
  planned: boolean;
  /** Journey titles, for context on a global list. */
  journeys: string[];
}

/**
 * Tasks due later and events already dated in the future, soonest first.
 *
 * Tasks deliberately exclude today and anything overdue: those need attention
 * *now* and are already shown as due work, so repeating them here would
 * double-count one task in two places on one screen.
 *
 * **Planned events are the exception, and include today and overdue.** There is
 * no "due work" list for them to be double-counted against — the day's table
 * shows what *happened*, and a deadline has not happened. Excluding them would
 * mean a commitment vanished from Today on the very day it came due, which is
 * the one day it matters most. An overdue plan sorts to the top for the same
 * reason.
 */
export function upcomingItems(
  tasks: TaskWithLinks[],
  entries: TimelineEntry[],
  options: { limit?: number; now?: Date } = {},
): UpcomingItem[] {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 5;

  const fromTasks = tasks
    .filter((task) => task.status === 'todo' || task.status === 'doing')
    .flatMap((task): UpcomingItem[] => {
      const due = toDate(task.dueAt);
      if (!due || !task.dueAt) return [];

      const daysAway = differenceInLocalDays(now, due);
      if (daysAway < 1) return [];

      return [
        {
          id: task.id,
          title: task.title,
          at: task.dueAt,
          daysAway,
          kind: 'task',
          planned: false,
          journeys: task.journeys.map((journey) => journey.title),
        },
      ];
    });

  const fromEvents = entries.flatMap((entry): UpcomingItem[] => {
    const at = toDate(entry.occurredAt);
    if (!at) return [];

    const daysAway = differenceInLocalDays(now, at);
    const planned = isPlanned(entry);
    // A recorded event only qualifies while still ahead; a plan also counts
    // today and once its date has passed.
    if (!planned && daysAway < 1) return [];

    return [
      {
        id: entry.id,
        title: entry.title,
        at: entry.occurredAt,
        daysAway,
        kind: 'event',
        planned,
        journeys: entry.journeys.map((journey) => journey.title),
      },
    ];
  });

  return [...fromTasks, ...fromEvents].sort((a, b) => a.at.localeCompare(b.at)).slice(0, limit);
}

/**
 * Today's events in the order they happened, earliest first.
 *
 * The stored timeline is newest-first for the global view; a day reads forwards,
 * the way the reference dashboard shows it (09:15 → 18:37).
 */
export function todaysEntries(
  entries: TimelineEntry[],
  options: { now?: Date } = {},
): TimelineEntry[] {
  const now = (options.now ?? new Date()).toISOString();

  /*
   * A deadline falling today has not happened today. This table is the day's
   * record — "09:15 投了简历" — and a commitment listed among those rows would
   * read as done. It reaches the day through "Up next" instead, which is where
   * something still owed belongs.
   */
  return onlyHappened(entries)
    .filter((entry) => isSameLocalDay(entry.occurredAt, now))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

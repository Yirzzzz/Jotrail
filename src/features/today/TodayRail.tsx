/**
 * Today's context rail.
 *
 * Matches the pinned Today reference's right column: what is coming, what needs
 * doing now, pinned reading, Journeys in motion. Upcoming and due-now are split
 * so a task due tomorrow is not listed twice.
 */

import { ArrowRight, Activity, CalendarClock, Compass, Pin, SquareCheck } from 'lucide-react';

import { useRepoQuery } from '@/data/RepositoryContext';
import { tasksDueNow, todaysEntries, upcomingItems } from '@/domain/upcoming';
import type { NoteWithLinks, TaskWithLinks, TimelineEntry } from '@/domain/types';
import { formatRelativeDay } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';
import { JourneyCard } from '@/features/journeys/JourneyCard';
import { TaskList } from '@/features/tasks/TaskList';
import { UpcomingList } from './UpcomingList';
import { useAppStore } from '@/app/store';

/** Enough to be useful, few enough that the rail does not become a backlog. */
const TASK_LIMIT = 8;

export function TodayRail() {
  const { t } = useI18n();
  const navigate = useAppStore((state) => state.navigate);
  const openJourney = useAppStore((state) => state.openJourney);
  const openNote = useAppStore((state) => state.openNote);

  const tasks = useRepoQuery((repo) => repo.listTasks(), []);
  const notes = useRepoQuery((repo) => repo.listNotes(), []);
  const journeys = useRepoQuery((repo) => repo.listJourneys(), []);
  const entries = useRepoQuery((repo) => repo.listTimeline({ order: 'newest' }), []);

  const dueAll = tasksDueNow(tasks.data ?? []);
  const dueNow = dueAll.slice(0, TASK_LIMIT);
  const dueOverflow = dueAll.length - dueNow.length;
  const upcoming = upcomingItems(tasks.data ?? [], entries.data ?? []);

  const pinned = (notes.data ?? []).filter((note) => note.pinnedIn.length > 0).slice(0, 5);
  const active = (journeys.data ?? []).filter((journey) => journey.status === 'active');

  /*
   * The day's own totals, for the card at the foot of the rail. All three are
   * counts of real records — the entries on today's sheet, and the notes and
   * tasks those entries touch.
   */
  const allEntries = entries.data ?? [];
  const today = todaysEntries(allEntries);
  const notesToday = (notes.data ?? []).filter((note) => isToday(note.createdAt)).length;
  const tasksToday = (tasks.data ?? []).filter(
    (task) => task.completedAt && isToday(task.completedAt),
  ).length;

  return (
    <div className="rail">
      <div className="rail__scroll scroll-area">
        {upcoming.length > 0 ? (
          <section className="rail__section">
            <div className="rail__section-head">
              <h2 className="rail__section-title">
                <span className="rail__section-icon">
                  <CalendarClock size={13} strokeWidth={2} aria-hidden />
                </span>
                {t('Up next', '接下来')}
              </h2>
            </div>
            <UpcomingList items={upcoming} />
          </section>
        ) : null}

        <section className="rail__section">
          <div className="rail__section-head">
            <h2 className="rail__section-title">
              <span className="rail__section-icon">
                <SquareCheck size={13} strokeWidth={2} aria-hidden />
              </span>
              {t('To do', '待办')}
            </h2>
            {dueNow.length > 0 ? <span className="rail__count">{dueNow.length}</span> : null}
          </div>

          <TaskList
            tasks={dueNow}
            showJourneys
            allowFiling
            emptyState={
              <p className="rail__empty">{t('Nothing due today.', '今天没有到期事项。')}</p>
            }
          />

          {dueOverflow > 0 ? (
            <p className="rail__more">
              {t(`${dueOverflow} more not shown`, `另有 ${dueOverflow} 项未显示`)}
            </p>
          ) : null}
        </section>

        {pinned.length > 0 ? (
          <section className="rail__section">
            <div className="rail__section-head">
              <h2 className="rail__section-title">
                <span className="rail__section-icon">
                  <Pin size={13} strokeWidth={2} aria-hidden />
                </span>
                {t('Pinned notes', '置顶笔记')}
              </h2>
            </div>
            <ul>
              {pinned.map((note) => (
                <li key={note.id} className="rail__row">
                  <button
                    type="button"
                    className="rail__link"
                    onClick={() => openNote(note.id)}
                    title={note.title}
                  >
                    {note.title}
                  </button>
                  <span className="rail__row-label">{formatRelativeDay(note.updatedAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {active.length > 0 ? (
          <section className="rail__section">
            <div className="rail__section-head">
              <h2 className="rail__section-title">
                <span className="rail__section-icon">
                  <Compass size={13} strokeWidth={2} aria-hidden />
                </span>
                {t('Active journeys', '进行中的旅程')}
              </h2>
            </div>
            <div className="rail__journey-cards">
              {active.map((journey) => {
                const counts = countsFor(journey.id, notes.data ?? [], tasks.data ?? []);
                return (
                  <JourneyCard
                    key={journey.id}
                    journey={journey}
                    counts={[
                      { label: 'note', value: counts.notes },
                      { label: 'task', value: counts.tasks },
                    ]}
                    variant="rail"
                    entries={entriesFor(journey.id, allEntries)}
                    onOpen={openJourney}
                  />
                );
              })}
            </div>

            <button
              type="button"
              className="button rail__action"
              onClick={() => navigate({ name: 'journeys' })}
            >
              {t('All Journeys', '全部旅程')}
              <ArrowRight size={13} strokeWidth={2} aria-hidden />
            </button>
          </section>
        ) : null}

        {/*
         * The day in three figures. Last in the rail because it is a summary, and
         * a summary is what you read after the things it summarises.
         */}
        <section className="rail__section">
          <div className="rail__section-head">
            <h2 className="rail__section-title">
              <span className="rail__section-icon">
                <Activity size={13} strokeWidth={2} aria-hidden />
              </span>
              {t('About today', '今日概况')}
            </h2>
          </div>
          <dl className="rail__stats">
            <div className="rail__stat">
              <dt>{t('Entries', '记录')}</dt>
              <dd>{today.length}</dd>
            </div>
            <div className="rail__stat">
              <dt>{t('Notes', '笔记')}</dt>
              <dd>{notesToday}</dd>
            </div>
            <div className="rail__stat">
              <dt>{t('Tasks', '任务')}</dt>
              <dd>{tasksToday}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

/** A journey's own events, for its trace thumbnail. */
function entriesFor(journeyId: string, entries: TimelineEntry[]): TimelineEntry[] {
  return entries.filter((entry) => entry.journeys.some((journey) => journey.id === journeyId));
}

/** Local-day comparison: the rail counts what happened *today* where you are. */
function isToday(iso: string): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function countsFor(
  journeyId: string,
  notes: NoteWithLinks[],
  tasks: TaskWithLinks[],
): { notes: number; tasks: number } {
  return {
    notes: notes.filter((note) => note.journeys.some((journey) => journey.id === journeyId))
      .length,
    tasks: tasks.filter((task) => task.journeys.some((journey) => journey.id === journeyId))
      .length,
  };
}

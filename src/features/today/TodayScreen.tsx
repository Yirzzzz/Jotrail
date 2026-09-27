/**
 * Today — the page as it stands right now.
 *
 * THESIS: the record has been accumulating all day whether or not you looked at
 * it. Opening Today shows the page as it is at this minute: the date stamped at
 * the head, the day's entries as a table beneath it, then the pen ready to write.
 *
 * FIRST VIEWPORT: the date as the page's one piece of display type, the day read
 * as three scannable columns (time / activity / journey), and both inputs in
 * reach without scrolling.
 *
 * The day used to lead with a multi-pen chart of the same events. It is gone
 * (D-034): on a single day a trace plots three or four marks against 24 hours of
 * mostly-flat baseline, which is a picture of nothing much, directly above the
 * same events listed exactly. A Journey's trace still earns its place, because
 * there the axis spans months and the shape is the point.
 *
 * Refusals carried forward: no fabricated name, no fake quote, no invented
 * progress bars, no sync/bell/avatar chrome. Counts are real links.
 */

import { useMemo } from 'react';
import { Clock3, FileText, PenLine, Plus, SquareCheck } from 'lucide-react';

import { useInvalidate, useRepoQuery, useRepository } from '@/data/RepositoryContext';
import { todaysEntries } from '@/domain/upcoming';
import type {
  JourneyStatus,
  NoteWithLinks,
  TaskWithLinks,
  TimelineEntry,
} from '@/domain/types';
import { formatGreetingDate, greetingForHour } from '@/lib/datetime';
import { getIntlLocale, useI18n } from '@/lib/i18n';
import { JourneyCard } from '@/features/journeys/JourneyCard';
import { TaskComposer } from '@/features/tasks/TaskComposer';
import { useAppStore } from '@/app/store';
import { DayTimeline } from './DayTimeline';
import { LogComposer } from './LogComposer';
import './Today.css';
import '@/features/journeys/Journey.css';

export function TodayScreen() {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();
  const openJourney = useAppStore((state) => state.openJourney);
  const openNote = useAppStore((state) => state.openNote);
  const navigate = useAppStore((state) => state.navigate);
  const setOverlay = useAppStore((state) => state.setOverlay);

  const journeys = useRepoQuery((repo) => repo.listJourneys(), []);
  const tasks = useRepoQuery((repo) => repo.listTasks(), []);
  const notes = useRepoQuery((repo) => repo.listNotes(), []);
  const entries = useRepoQuery((repo) => repo.listTimeline({ order: 'newest' }), []);

  /**
   * One `Date` per mount rather than per render, so the stamp and the day's
   * filter cannot disagree mid-session.
   */
  const now = useMemo(() => new Date(), []);
  const greeting = greetingForHour(now.getHours());
  const dateLine = formatGreetingDate(now);

  const allNotes = notes.data ?? [];
  const allTasks = tasks.data ?? [];
  const allEntries = entries.data ?? [];
  const today = todaysEntries(allEntries);
  const reflections = today.filter((entry) => entry.reflection?.trim());

  const carousel = [...(journeys.data ?? [])]
    .filter((journey) => journey.status !== 'archived' && journey.status !== 'completed')
    .sort((left, right) => statusRank(left.status) - statusRank(right.status));

  const isQuietStart =
    (journeys.data ?? []).length === 0 && allNotes.length === 0 && today.length === 0;

  const createNote = async () => {
    const note = await repository.createNote({});
    invalidate();
    openNote(note.id);
  };

  const openEntry = (entry: TimelineEntry) => {
    if (entry.sourceType === 'note' && entry.sourceId) openNote(entry.sourceId);
  };

  return (
    <div className="today">
      <div className="today__column">
        {/*
         * The head of the page. The date is the subject; the greeting is a
         * courtesy on the line beneath it, because the page's identity is *when
         * it is*, not how it greets you.
         */}
        <header className="sheet-head">
          <div className="sheet-head__marks">
            <span className="section-label">{t('Sheet', '今日页')}</span>
            <span className="readout">{sheetDesignation(now)}</span>
          </div>

          <div className="sheet-head__stamp-row">
            <h1 className="stamp">{dateLine}</h1>
            <button
              type="button"
              className="button button--outline sheet-head__timeline-link"
              onClick={() => navigate({ name: 'timeline' })}
            >
              <Clock3 size={13} strokeWidth={2} aria-hidden />
              {t('View timeline', '查看时间线')}
            </button>
          </div>

          <p className="stamp__caption">
            <span className="sheet-head__greeting">{greeting}</span>
            <span className="sheet-head__caption-sep" aria-hidden>
              &middot;
            </span>
            <span className="sheet-head__count">
              {t(
                `${today.length} ${today.length === 1 ? 'entry' : 'entries'} today`,
                `今天有 ${today.length} 条记录`,
              )}
            </span>
          </p>
        </header>

        {/*
         * The day as a table. Column heads earn their keep because every row
         * carries all three fields, and someone scanning for "when" wants a
         * single column to run their eye down.
         */}
        <section className="pane day-sheet" aria-labelledby="today-day-heading">
          <h2 id="today-day-heading" className="visually-hidden">
            {t('Today, in order', '今天的记录，按时间排列')}
          </h2>

          <div className="day-sheet__head" aria-hidden>
            <span className="day-sheet__datechip">
              <span className="day-sheet__datechip-weekday">{weekdayAbbrev(now)}</span>
              <span className="day-sheet__datechip-day">{now.getDate()}</span>
            </span>
            <span className="day-sheet__column-label">{t('Time', '时间')}</span>
            <span className="day-sheet__column-label">{t('Activity', '记录')}</span>
            <span className="day-sheet__column-label day-sheet__column-label--end">
              {t('Journey', '旅程')}
            </span>
          </div>

          {today.length > 0 ? (
            <DayTimeline entries={today} onOpenEntry={openEntry} />
          ) : (
            /*
             * An empty day says so plainly rather than apologising for it. Quiet
             * time is real data.
             */
            <p className="day-sheet__empty">
              {t(
                'Nothing recorded yet. One line below puts the first entry on today’s sheet.',
                '还没有记录。在下方写一句话，开始今天的记录。',
              )}
            </p>
          )}

          {/*
           * Not a second composer — a shortcut to the one below, so the table has
           * the affordance a table implies without duplicating the input.
           */}
          <button
            type="button"
            className="day-sheet__add"
            onClick={() => document.getElementById(LOG_INPUT_ID)?.focus()}
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
            {t('Add entry', '添加记录')}
          </button>
        </section>

        {/*
         * The pen. Both inputs stay visible; this is why the screen gets opened.
         * The gutter icon marks which of the two a row is — something done, or
         * something still to do.
         */}
        <section className="pane capture" aria-labelledby="today-now-heading">
          <h2 id="today-now-heading" className="section-label capture__heading">
            {t('Write to the sheet', '记下今天')}
          </h2>

          <div className="capture__field">
            <span className="capture__gutter" aria-hidden>
              <PenLine size={14} strokeWidth={2} />
            </span>
            <div className="capture__body">
              <span className="capture__label">{t('What happened', '发生了什么')}</span>
              <LogComposer inputId={LOG_INPUT_ID} />
            </div>
          </div>

          <div className="capture__field">
            <span className="capture__gutter" aria-hidden>
              <SquareCheck size={14} strokeWidth={2} />
            </span>
            <div className="capture__body">
              <span className="capture__label">{t('Something to do', '待办事项')}</span>
              <TaskComposer
                placeholder={t('Next action, idea, or reminder…', '下一步、想法或提醒…')}
              />
            </div>
          </div>
        </section>

        {reflections.length > 0 ? (
          <section className="today__section">
            <h2 className="today__section-heading today__section-heading--spaced">
              {t('Looking back', '回顾')}
            </h2>
            <div className="today__review">
              {reflections.map((entry) => (
                <blockquote key={entry.id} className="today__review-block">
                  <p className="today__review-text selectable">{entry.reflection}</p>
                  <footer className="today__review-source">{entry.title}</footer>
                </blockquote>
              ))}
            </div>
          </section>
        ) : null}

        {carousel.length > 0 ? (
          <section className="today__section">
            <div className="today__section-head">
              <h2 className="today__section-heading">
                {t('Journeys running', '正在进行的旅程')}
              </h2>
            </div>
            <div className="today__journey-scroller">
              {carousel.map((journey) => {
                const counts = countsFor(journey.id, allNotes, allTasks);
                return (
                  <JourneyCard
                    key={journey.id}
                    journey={journey}
                    counts={[
                      { label: 'note', value: counts.notes },
                      { label: 'task', value: counts.tasks },
                    ]}
                    onOpen={openJourney}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        {isQuietStart ? (
          <div className="empty-state">
            <div className="empty-state__title">{t('A quiet start', '从容开始')}</div>
            <p>
              {t(
                'Write a note, or create a Journey for something you want to follow over time. Both work; neither needs setting up first.',
                '写一篇笔记，或为想要长期记录的事创建一段旅程。随时开始，无需提前准备。',
              )}
            </p>
            <div className="empty-state__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => void createNote()}
              >
                <FileText size={14} strokeWidth={2} aria-hidden />
                {t('Write a note', '写笔记')}
              </button>
              <button
                type="button"
                className="button button--outline"
                onClick={() => setOverlay('new-journey')}
              >
                <Plus size={14} strokeWidth={2} aria-hidden />
                {t('New Journey', '新建旅程')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The log input's id, shared so the table's "Add entry" row can move focus into
 * the composer instead of being a second input that writes the same record.
 */
const LOG_INPUT_ID = 'today-log-input';

/**
 * The sheet's designation, the way a recorder stamps its own output: an ISO date
 * so it sorts, because that is what a filed chart needs.
 */
function sheetDesignation(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `JN-${year}${month}${day}`;
}

/**
 * `FRI`, for the date chip at the head of the day's table.
 *
 * Follow the selected interface language, not the operating-system locale.
 * The user's content stays in whatever language they wrote it.
 */
function weekdayAbbrev(date: Date): string {
  return date.toLocaleDateString(getIntlLocale(), { weekday: 'short' }).toUpperCase();
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

function statusRank(status: JourneyStatus): number {
  if (status === 'active') return 0;
  if (status === 'planning') return 1;
  if (status === 'paused') return 2;
  return 3;
}

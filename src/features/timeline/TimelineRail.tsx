/**
 * The Timeline screen's context rail.
 *
 * Everything here is arithmetic on records that already exist — this month's
 * counts, which Journeys have been active, and the most recent state changes.
 * Nothing is invented, and nothing restates what the column beside it already
 * shows in full.
 *
 * Deliberately absent: the decorative pull-quote the reference sketches at the
 * foot of this rail. The app has no quote to put there. Inventing one, or
 * promoting a line of the user's own writing to an epigraph they did not choose,
 * would be the app putting words in their mouth.
 */

import { Activity, ArrowRight, BarChart3, History, Target } from 'lucide-react';

import { useRepoQuery } from '@/data/RepositoryContext';
import { formatStateValue, onlyHappened, parseStateChange } from '@/domain/timeline';
import type { Journey, TimelineEntry } from '@/domain/types';
import { formatTimeOfDay } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';
import { JourneyCard } from '@/features/journeys/JourneyCard';
import { useAppStore } from '@/app/store';

/** Enough to orient, few enough that the rail stays a summary. */
const CHANGE_LIMIT = 4;
const JOURNEY_LIMIT = 3;

export function TimelineRail() {
  const { t } = useI18n();
  const navigate = useAppStore((state) => state.navigate);
  const openJourney = useAppStore((state) => state.openJourney);

  const entries = useRepoQuery((repo) => repo.listTimeline({ order: 'newest' }), []);
  const journeys = useRepoQuery((repo) => repo.listJourneys(), []);
  const tasks = useRepoQuery((repo) => repo.listTasks(), []);

  /*
   * Everything in this rail is a count or a history of what *happened*, so plans
   * are dropped once here rather than at each panel. A deadline this month is not
   * an event recorded this month.
   */
  const allEntries = onlyHappened(entries.data ?? []);
  const allJourneys = journeys.data ?? [];

  const thisMonth = allEntries.filter((entry) => isThisMonth(entry.occurredAt));
  const tasksCompletedThisMonth = (tasks.data ?? []).filter(
    (task) => task.completedAt && isThisMonth(task.completedAt),
  ).length;
  const activeJourneyCount = allJourneys.filter(
    (journey) => journey.status === 'active' || journey.status === 'planning',
  ).length;

  /*
   * "Focus" is measured, not chosen: the Journeys with the most events this
   * month, which is the same thing as where the user's attention has actually
   * been going.
   */
  const focusJourneys = rankByRecentActivity(allJourneys, thisMonth).slice(0, JOURNEY_LIMIT);

  /* Only real state transitions — the thing this product exists to preserve. */
  const recentChanges = allEntries
    .filter((entry) => entry.eventType === 'state_changed')
    .slice(0, CHANGE_LIMIT);

  return (
    <div className="rail">
      <div className="rail__scroll scroll-area">
        <section className="rail__section">
          <div className="rail__section-head">
            <h2 className="rail__section-title">
              <span className="rail__section-icon">
                <BarChart3 size={13} strokeWidth={2} aria-hidden />
              </span>
              {t('This month', '本月')}
            </h2>
          </div>
          <dl className="rail__stats">
            <div className="rail__stat">
              <dt>{t('Events recorded', '记录的事件')}</dt>
              <dd>{thisMonth.length}</dd>
            </div>
            <div className="rail__stat">
              <dt>{t('Tasks completed', '完成的任务')}</dt>
              <dd>{tasksCompletedThisMonth}</dd>
            </div>
            <div className="rail__stat">
              <dt>{t('Journeys active', '活跃的旅程')}</dt>
              <dd>{activeJourneyCount}</dd>
            </div>
          </dl>
        </section>

        {focusJourneys.length > 0 ? (
          <section className="rail__section">
            <div className="rail__section-head">
              <h2 className="rail__section-title">
                <span className="rail__section-icon">
                  <Target size={13} strokeWidth={2} aria-hidden />
                </span>
                {t('Focus journeys', '关注的旅程')}
              </h2>
            </div>
            <div className="rail__journey-cards">
              {focusJourneys.map(({ journey, eventCount }) => (
                <JourneyCard
                  key={journey.id}
                  journey={journey}
                  /*
                   * On this screen a Journey's weight is how much *happened* in
                   * it, so the card reports events rather than notes and tasks.
                   */
                  counts={[{ label: 'event', value: eventCount }]}
                  variant="rail"
                  entries={entriesFor(journey.id, allEntries)}
                  onOpen={openJourney}
                />
              ))}
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

        {recentChanges.length > 0 ? (
          <section className="rail__section">
            <div className="rail__section-head">
              <h2 className="rail__section-title">
                <span className="rail__section-icon">
                  <History size={13} strokeWidth={2} aria-hidden />
                </span>
                {t('Recent changes', '最近的变化')}
              </h2>
            </div>
            <ul className="rail__changes">
              {recentChanges.map((entry) => {
                const change = parseStateChange(entry.payloadJson);
                return (
                  <li key={entry.id} className="rail__change">
                    <span className="rail__change-head">
                      <span className="rail__change-title">{entry.title}</span>
                      <span className="rail__change-time">
                        {formatTimeOfDay(entry.occurredAt)}
                      </span>
                    </span>
                    {change ? (
                      <span className="rail__change-detail">
                        {change.field ? `${formatStateValue(change.field)}: ` : null}
                        {formatStateValue(change.from)} &rarr; {formatStateValue(change.to)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {thisMonth.length === 0 && recentChanges.length === 0 ? (
          <section className="rail__section">
            <div className="rail__section-head">
              <h2 className="rail__section-title">
                <span className="rail__section-icon">
                  <Activity size={13} strokeWidth={2} aria-hidden />
                </span>
                {t('Nothing yet', '还没有记录')}
              </h2>
            </div>
            <p className="rail__empty">
              {t(
                'Once events start landing here, this margin summarises the month beside them.',
                '记录开始积累后，这里会呈现本月的概况。',
              )}
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

interface RankedJourney {
  journey: Journey;
  eventCount: number;
}

/**
 * Journeys ordered by how many of the given entries touched them, dropping the
 * ones nothing touched. Archived Journeys stay out: the rail is about where
 * attention is now.
 */
function rankByRecentActivity(journeys: Journey[], entries: TimelineEntry[]): RankedJourney[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const journey of entry.journeys) {
      counts.set(journey.id, (counts.get(journey.id) ?? 0) + 1);
    }
  }

  return journeys
    .filter((journey) => journey.status !== 'archived')
    .map((journey) => ({ journey, eventCount: counts.get(journey.id) ?? 0 }))
    .sort((left, right) => right.eventCount - left.eventCount);
}

function entriesFor(journeyId: string, entries: TimelineEntry[]): TimelineEntry[] {
  return entries.filter((entry) => entry.journeys.some((journey) => journey.id === journeyId));
}

/** Local-month comparison, so "this month" means the user's calendar month. */
function isThisMonth(iso: string): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

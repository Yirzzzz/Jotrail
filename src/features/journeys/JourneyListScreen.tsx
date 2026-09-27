/**
 * The user's journeys. Their own list, in their own order — no domain
 * categories, no templates chosen for them.
 */

import { Plus } from 'lucide-react';

import { JourneyIcon } from '@/components/JourneyIcon';
import { StatusPill } from '@/components/StatusPill';
import { useRepoQuery } from '@/data/RepositoryContext';
import { formatDateRange } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';
import { useAppStore } from '@/app/store';
import './Journey.css';

export function JourneyListScreen() {
  const { t } = useI18n();
  const openJourney = useAppStore((state) => state.openJourney);
  const setOverlay = useAppStore((state) => state.setOverlay);
  const journeys = useRepoQuery((repository) => repository.listJourneys(), []);

  const list = journeys.data ?? [];

  return (
    <div className="journey__body">
      <div className="journey__toolbar">
        <h1 style={{ fontSize: 'var(--text-page)', fontWeight: 'var(--weight-semibold)' }}>
          {t('Journeys', '旅程')}
        </h1>
        <button
          type="button"
          className="button button--outline"
          onClick={() => setOverlay('new-journey')}
        >
          <Plus size={14} strokeWidth={2} aria-hidden />
          {t('New Journey', '新建旅程')}
        </button>
      </div>

      {list.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__title">{t('No Journeys yet', '还没有旅程')}</div>
          <p>
            {t(
              'A Journey is any theme you want to follow over time — a job search, a training plan, a paper, a saving goal. Create one and it will start collecting its own history.',
              '旅程是你想长期记录的主题——求职、训练计划、论文或储蓄目标。创建一个旅程，让它慢慢积累自己的故事。',
            )}
          </p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => setOverlay('new-journey')}
            style={{ marginTop: 'var(--space-4)' }}
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
            {t('Create your first Journey', '创建第一个旅程')}
          </button>
        </div>
      ) : (
        <div className="journey-list">
          {list.map((journey) => (
            <button
              key={journey.id}
              type="button"
              className="journey-list__row"
              onClick={() => openJourney(journey.id)}
            >
              <span className="journey-list__icon">
                <JourneyIcon name={journey.icon} size={17} />
              </span>
              <span className="journey-list__main">
                <span className="journey-list__title">{journey.title}</span>
                <span className="journey-list__description">
                  {journey.description ?? formatDateRange(journey.startedAt, journey.endedAt)}
                </span>
              </span>
              <span className="journey-list__aside">
                <StatusPill status={journey.status} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

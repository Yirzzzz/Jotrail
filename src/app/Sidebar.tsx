/**
 * Left navigation. The Journeys section is the user's own list — no
 * preconfigured domain categories (UX_SPEC.md §4).
 */

import { useEffect, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  Clock3,
  FileText,
  Leaf,
  MoreHorizontal,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { JourneyIcon } from '@/components/JourneyIcon';
import { useInvalidate, useRepoQuery, useRepository } from '@/data/RepositoryContext';
import type { Journey } from '@/domain/types';
import type { Route } from '@/app/store';
import { useAppStore } from '@/app/store';
import { DeleteJourneyDialog } from '@/features/journeys/DeleteJourneyDialog';
import { useI18n } from '@/lib/i18n';

function NavItem({
  icon: Icon,
  label,
  isCurrent,
  count,
  onClick,
}: {
  icon?: LucideIcon;
  label: string;
  isCurrent: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="nav-item"
        aria-current={isCurrent ? 'page' : undefined}
        onClick={onClick}
        title={label}
      >
        {Icon ? (
          <span className="nav-item__icon">
            <Icon size={16} strokeWidth={1.75} aria-hidden />
          </span>
        ) : null}
        <span className="nav-item__label">{label}</span>
        {count !== undefined && count > 0 ? (
          <span className="nav-item__count">{count}</span>
        ) : null}
      </button>
    </li>
  );
}

export function Sidebar() {
  const { t } = useI18n();
  const route = useAppStore((state) => state.route);
  const navigate = useAppStore((state) => state.navigate);
  const openJourney = useAppStore((state) => state.openJourney);
  const setOverlay = useAppStore((state) => state.setOverlay);

  const journeys = useRepoQuery((repository) => repository.listJourneys(), []);
  const openTasks = useRepoQuery((repository) => repository.listTasks(), []);

  const [pendingDelete, setPendingDelete] = useState<Journey | null>(null);

  const outstanding =
    openTasks.data?.filter((task) => task.status === 'todo' || task.status === 'doing')
      .length ?? 0;

  const is = (name: Route['name']) => route.name === name;

  return (
    <nav className="sidebar" aria-label={t('Main', '主导航')}>
      {/* The top bar now clears the window controls, so this is just the mark. */}
      <div className="sidebar__top">
        <span className="sidebar__brand">
          <span className="sidebar__brand-mark">
            <Leaf size={13} strokeWidth={2} aria-hidden />
          </span>
          <span className="sidebar__brand-label">Journey Notes</span>
        </span>
      </div>

      <div className="sidebar__scroll scroll-area">
        <ul>
          <NavItem
            icon={CalendarDays}
            label={t('Today', '今天')}
            isCurrent={is('today')}
            count={outstanding}
            onClick={() => navigate({ name: 'today' })}
          />
          <NavItem
            icon={FileText}
            label={t('Notes', '笔记')}
            isCurrent={is('notes')}
            onClick={() => navigate({ name: 'notes' })}
          />
          <NavItem
            icon={Clock3}
            label={t('Timeline', '时间线')}
            isCurrent={is('timeline')}
            onClick={() => navigate({ name: 'timeline' })}
          />
        </ul>

        <div className="sidebar__section">
          <div className="sidebar__section-header">
            <span className="section-label">{t('Journeys', '旅程')}</span>
            <button
              type="button"
              className="icon-button"
              onClick={() => setOverlay('new-journey')}
              title={t('New Journey', '新建旅程')}
              aria-label={t('New Journey', '新建旅程')}
            >
              <Plus size={15} strokeWidth={2} aria-hidden />
            </button>
          </div>

          <ul>
            {(journeys.data ?? []).map((journey) => (
              <JourneyNavItem
                key={journey.id}
                journey={journey}
                isCurrent={route.name === 'journey' && route.journeyId === journey.id}
                onClick={() => openJourney(journey.id)}
                onDelete={() => setPendingDelete(journey)}
              />
            ))}
          </ul>

          {journeys.data?.length === 0 ? (
            <button
              type="button"
              className="nav-item"
              onClick={() => setOverlay('new-journey')}
              style={{ color: 'var(--ink-tertiary)' }}
            >
              <span className="nav-item__icon">
                <Plus size={16} strokeWidth={1.75} aria-hidden />
              </span>
              <span className="nav-item__label">{t('Add your first', '创建第一个旅程')}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="sidebar__footer">
        <ul>
          <NavItem
            icon={Settings}
            label={t('Settings', '设置')}
            isCurrent={is('settings')}
            onClick={() => navigate({ name: 'settings' })}
          />
        </ul>
      </div>

      {pendingDelete ? (
        <DeleteJourneyDialog
          journey={pendingDelete}
          onClose={() => setPendingDelete(null)}
          onDeleted={() => {
            const deleted = pendingDelete;
            setPendingDelete(null);
            // Don't leave the app looking at a journey that no longer exists.
            const current = useAppStore.getState().route;
            if (current.name === 'journey' && current.journeyId === deleted.id) {
              navigate({ name: 'journeys' });
            }
          }}
        />
      ) : null}
    </nav>
  );
}

/**
 * A journey row. The actions menu appears on hover or keyboard focus rather than
 * sitting there permanently — the sidebar should stay quiet when idle.
 */
function JourneyNavItem({
  journey,
  isCurrent,
  onClick,
  onDelete,
}: {
  journey: Journey;
  isCurrent: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();
  const [isMenuOpen, setMenuOpen] = useState(false);

  // Clicking anywhere else, or pressing Escape, dismisses the menu.
  useEffect(() => {
    if (!isMenuOpen) return;

    const close = () => setMenuOpen(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isMenuOpen]);

  const setStatus = async (status: Journey['status']) => {
    setMenuOpen(false);
    await repository.setJourneyStatus(journey.id, status);
    invalidate();
  };

  return (
    <li className="journey-row">
      <button
        type="button"
        className="nav-item"
        aria-current={isCurrent ? 'page' : undefined}
        onClick={onClick}
        title={journey.title}
      >
        <span className="nav-item__icon">
          <JourneyIcon name={journey.icon} size={15} />
        </span>
        <span className="nav-item__label">{journey.title}</span>
        <span className={`journey-dot journey-dot--${journey.status}`} aria-hidden />
      </button>

      <button
        type="button"
        className="journey-row__menu-button"
        aria-label={t(`Options for ${journey.title}`, `${journey.title}的选项`)}
        aria-expanded={isMenuOpen}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => setMenuOpen(!isMenuOpen)}
      >
        <MoreHorizontal size={14} strokeWidth={2} aria-hidden />
      </button>

      {isMenuOpen ? (
        <div className="journey-row__menu" onMouseDown={(event) => event.stopPropagation()}>
          {journey.status === 'archived' ? (
            <button
              type="button"
              className="journey-row__menu-item"
              onClick={() => void setStatus('active')}
            >
              <ArchiveRestore size={13} strokeWidth={2} aria-hidden />
              {t('Unarchive', '取消归档')}
            </button>
          ) : (
            <button
              type="button"
              className="journey-row__menu-item"
              onClick={() => void setStatus('archived')}
            >
              <Archive size={13} strokeWidth={2} aria-hidden />
              {t('Archive', '归档')}
            </button>
          )}
          <button
            type="button"
            className="journey-row__menu-item journey-row__menu-item--danger"
            onClick={() => {
              setMenuOpen(false);
              onDelete();
            }}
          >
            <Trash2 size={13} strokeWidth={2} aria-hidden />
            {t('Delete…', '删除…')}
          </button>
        </div>
      ) : null}
    </li>
  );
}

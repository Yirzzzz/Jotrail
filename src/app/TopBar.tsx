/**
 * The window's top bar: a centred search field with window controls either side.
 *
 * Present on every screen in all four pinned reference screens (D-029), and the
 * structural piece the app was missing most — without it the sidebar and the
 * content column both started at the very top of the window with nothing tying
 * them together.
 *
 * The search field is a real control, not chrome: clicking it or pressing the
 * shortcut opens the command palette that already exists.
 */

import { PanelLeft, PanelRight, Search, Settings } from 'lucide-react';

import { useAppStore } from './store';
import { useI18n } from '@/lib/i18n';

export function TopBar() {
  const { t } = useI18n();
  const route = useAppStore((state) => state.route);
  const setOverlay = useAppStore((state) => state.setOverlay);
  const navigate = useAppStore((state) => state.navigate);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const toggleRail = useAppStore((state) => state.toggleRail);
  const railHidden = useAppStore((state) => state.railHidden);
  const sidebarHidden = useAppStore((state) => state.sidebarHidden);

  // Today, Journey and Timeline each have a rail to collapse.
  const hasRail =
    route.name === 'journey' || route.name === 'today' || route.name === 'timeline';

  return (
    // The whole bar is draggable, so the window still moves with a hidden titlebar.
    <header className="topbar" data-tauri-drag-region>
      <div className="topbar__left">
        <button
          type="button"
          className="icon-button"
          onClick={toggleSidebar}
          title={sidebarHidden ? t('Show sidebar', '显示侧栏') : t('Hide sidebar', '隐藏侧栏')}
          aria-label={
            sidebarHidden ? t('Show sidebar', '显示侧栏') : t('Hide sidebar', '隐藏侧栏')
          }
          aria-pressed={!sidebarHidden}
        >
          <PanelLeft size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      {/* Looks like a field, behaves like a button: the palette owns the input. */}
      <button
        type="button"
        className="topbar__search"
        onClick={() => setOverlay('command')}
        aria-label={t('Search notes and Journeys', '搜索笔记和旅程')}
        aria-keyshortcuts="Meta+K Control+K"
      >
        <Search size={14} strokeWidth={2} aria-hidden />
        <span className="topbar__search-label">
          {t('Search notes, Journeys…', '搜索笔记、旅程…')}
        </span>
        <kbd className="topbar__kbd">⌘K</kbd>
      </button>

      <div className="topbar__right">
        <button
          type="button"
          className="icon-button"
          onClick={() => navigate({ name: 'settings' })}
          title={t('Settings', '设置')}
          aria-label={t('Settings', '设置')}
          aria-current={route.name === 'settings' ? 'page' : undefined}
        >
          <Settings size={16} strokeWidth={1.75} aria-hidden />
        </button>
        {hasRail ? (
          <button
            type="button"
            className="icon-button"
            onClick={toggleRail}
            title={railHidden ? t('Show details', '显示详情') : t('Hide details', '隐藏详情')}
            aria-label={
              railHidden ? t('Show details', '显示详情') : t('Hide details', '隐藏详情')
            }
            aria-pressed={!railHidden}
          >
            <PanelRight size={16} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </div>
    </header>
  );
}

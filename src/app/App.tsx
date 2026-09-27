/**
 * Composes the three-region shell, routes the main column, and owns the global
 * keyboard shortcuts.
 *
 * Routing is a small state machine in `store.ts` rather than a router: the app
 * has six destinations and no URLs to honour, so a router would be weight
 * without benefit.
 */

import { useEffect } from 'react';
import { useI18n } from '@/lib/i18n';

import { useInvalidate, useRepository } from '@/data/RepositoryContext';
import { CommandPalette } from '@/features/capture/CommandPalette';
import { JourneyListScreen } from '@/features/journeys/JourneyListScreen';
import { JourneyScreen, JourneyScreenRail } from '@/features/journeys/JourneyScreen';
import { NewJourneyDialog } from '@/features/journeys/NewJourneyDialog';
import { NotesScreen, NotesScreenRail } from '@/features/notes/NotesScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { GlobalTimelineScreen } from '@/features/timeline/GlobalTimelineScreen';
import { TimelineRail } from '@/features/timeline/TimelineRail';
import { TodayScreen } from '@/features/today/TodayScreen';
import { TodayRail } from '@/features/today/TodayRail';
import { DesktopCloseGuard } from './DesktopCloseGuard';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useAppStore } from './store';
import './AppShell.css';

export function App() {
  const { language } = useI18n();
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);
  const route = useAppStore((state) => state.route);
  const overlay = useAppStore((state) => state.overlay);
  const railHidden = useAppStore((state) => state.railHidden);
  const sidebarHidden = useAppStore((state) => state.sidebarHidden);
  const setOverlay = useAppStore((state) => state.setOverlay);
  const closeOverlay = useAppStore((state) => state.closeOverlay);
  const openJourney = useAppStore((state) => state.openJourney);
  const openNote = useAppStore((state) => state.openNote);

  const repository = useRepository();
  const invalidate = useInvalidate();

  /*
   * Four of the six destinations have a context rail. Notes only has one once a
   * note is actually open — with nothing selected there is no note to describe.
   */
  const routeHasRail =
    route.name === 'journey' ||
    route.name === 'today' ||
    route.name === 'timeline' ||
    route.name === 'notes';
  const hasRail = routeHasRail && !railHidden;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;

      if (event.key === 'k') {
        event.preventDefault();
        setOverlay('command');
        return;
      }

      if (event.key === 'n') {
        event.preventDefault();
        // Inside a journey, a new note belongs to that journey.
        const current = useAppStore.getState().route;
        const journeyId = current.name === 'journey' ? current.journeyId : undefined;
        void repository
          .createNote(journeyId ? { journeyId } : {})
          .then((note) => {
            invalidate();
            openNote(note.id);
          })
          .catch(() => {
            // Surfaced on the notes screen; a shortcut should not throw a dialog.
          });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setOverlay, repository, invalidate, openNote]);

  return (
    <div
      className={[
        'shell',
        hasRail ? '' : 'shell--no-rail',
        sidebarHidden ? 'shell--no-sidebar' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <TopBar />
      {sidebarHidden ? null : <Sidebar />}

      <main className="shell__main">
        <div className="shell__main-scroll scroll-area">
          {route.name === 'today' ? <TodayScreen /> : null}
          {route.name === 'notes' ? <NotesScreen noteId={route.noteId} /> : null}
          {route.name === 'timeline' ? <GlobalTimelineScreen /> : null}
          {route.name === 'journeys' ? <JourneyListScreen /> : null}
          {route.name === 'journey' ? (
            <JourneyScreen journeyId={route.journeyId} tab={route.tab} />
          ) : null}
          {route.name === 'settings' ? <SettingsScreen /> : null}
        </div>
      </main>

      {routeHasRail ? (
        <aside className="shell__rail" data-drawer={railHidden ? 'closed' : 'open'}>
          {route.name === 'journey' ? <JourneyScreenRail journeyId={route.journeyId} /> : null}
          {route.name === 'today' ? <TodayRail /> : null}
          {route.name === 'timeline' ? <TimelineRail /> : null}
          {route.name === 'notes' ? <NotesScreenRail noteId={route.noteId} /> : null}
        </aside>
      ) : null}

      {overlay === 'command' ? <CommandPalette onClose={closeOverlay} /> : null}
      {overlay === 'new-journey' ? (
        <NewJourneyDialog
          onClose={closeOverlay}
          onCreated={(journeyId) => {
            closeOverlay();
            // A new journey opens on its timeline (USER_FLOWS.md Flow A).
            openJourney(journeyId);
          }}
        />
      ) : null}
      <DesktopCloseGuard />
    </div>
  );
}

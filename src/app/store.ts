/**
 * Navigation and transient UI state. Domain data is never stored here — it is
 * read from the repository (ARCHITECTURE.md §2).
 */

import { create } from 'zustand';

/**
 * The four generic tabs, plus one per register the Journey actually has.
 *
 * A register tab is `{ register: kind }` rather than a string, so a `kind` the
 * user typed can never collide with a built-in tab name — someone whose register
 * is literally called `notes` still gets both tabs.
 */
export type JourneyTab = 'timeline' | 'notes' | 'tasks' | 'overview' | { register: string };

/** Stable key for a tab, for React keys and `aria-selected` comparisons. */
export function tabKey(tab: JourneyTab): string {
  return typeof tab === 'string' ? tab : `register:${tab.register}`;
}

export function sameTab(left: JourneyTab, right: JourneyTab): boolean {
  return tabKey(left) === tabKey(right);
}

export type Route =
  | { name: 'today' }
  | { name: 'notes'; noteId?: string }
  | { name: 'timeline' }
  | { name: 'journeys' }
  | { name: 'journey'; journeyId: string; tab: JourneyTab }
  | { name: 'settings' };

/** Transient overlays, closed with Escape. */
export type Overlay = 'none' | 'command' | 'new-journey' | 'quick-capture';

interface AppStore {
  route: Route;
  overlay: Overlay;
  /** Collapses the context rail; also collapses automatically at narrow widths. */
  railHidden: boolean;
  /** Collapses the left navigation, from the top bar's panel button. */
  sidebarHidden: boolean;
  navigate: (route: Route) => void;
  openJourney: (journeyId: string, tab?: JourneyTab) => void;
  openNote: (noteId: string) => void;
  setOverlay: (overlay: Overlay) => void;
  closeOverlay: () => void;
  toggleRail: () => void;
  toggleSidebar: () => void;
}

const LAST_ROUTE_KEY = 'journey-notes.last-route';

/**
 * Restore the last route (USER_FLOWS.md Flow H). Journey ids are validated by
 * the screen itself, so a stale id degrades to a "not found" state rather than
 * a crash.
 */
function loadLastRoute(): Route {
  if (typeof localStorage === 'undefined') return { name: 'today' };

  try {
    const raw = localStorage.getItem(LAST_ROUTE_KEY);
    if (!raw) return { name: 'today' };

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { name: 'today' };

    const candidate = parsed as { name?: unknown; journeyId?: unknown; tab?: unknown };
    switch (candidate.name) {
      case 'today':
      case 'timeline':
      case 'journeys':
      case 'settings':
        return { name: candidate.name };
      case 'notes':
        // Note ids are not restored: reopening on a blank editor is friendlier
        // than reopening on a note that has since been deleted.
        return { name: 'notes' };
      case 'journey':
        if (typeof candidate.journeyId !== 'string') return { name: 'today' };
        return {
          name: 'journey',
          journeyId: candidate.journeyId,
          tab: isJourneyTab(candidate.tab) ? candidate.tab : 'timeline',
        };
      default:
        return { name: 'today' };
    }
  } catch {
    return { name: 'today' };
  }
}

function isJourneyTab(value: unknown): value is JourneyTab {
  if (value === 'timeline' || value === 'notes' || value === 'tasks' || value === 'overview') {
    return true;
  }
  /*
   * A restored register tab is validated for *shape* only. Whether that register
   * still exists is the screen's business — a `kind` the user has since renamed
   * or emptied must degrade to an empty register rather than crash, the same way
   * a stale journey id degrades to "not found" (D-013).
   */
  return (
    typeof value === 'object' &&
    value !== null &&
    'register' in value &&
    typeof (value as { register: unknown }).register === 'string' &&
    (value as { register: string }).register.length > 0
  );
}

function persistRoute(route: Route): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify(route));
  } catch {
    // A full or unavailable localStorage must never block navigation.
  }
}

export const useAppStore = create<AppStore>((set, get) => ({
  route: loadLastRoute(),
  overlay: 'none',
  railHidden: false,
  sidebarHidden: false,

  navigate: (route) => {
    persistRoute(route);
    set({ route, overlay: 'none' });
  },

  openJourney: (journeyId, tab = 'timeline') => {
    get().navigate({ name: 'journey', journeyId, tab });
  },

  openNote: (noteId) => {
    get().navigate({ name: 'notes', noteId });
  },

  setOverlay: (overlay) => set({ overlay }),
  closeOverlay: () => set({ overlay: 'none' }),
  toggleRail: () => set((state) => ({ railHidden: !state.railHidden })),
  toggleSidebar: () => set((state) => ({ sidebarHidden: !state.sidebarHidden })),
}));

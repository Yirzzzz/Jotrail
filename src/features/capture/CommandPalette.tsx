/**
 * `Cmd/Ctrl+K` — search and jump (UX_SPEC.md §11).
 *
 * Searches **Journeys, tracked things, notes, open tasks and timeline entries**, and offers
 * the two create actions. Arrow keys and Enter work throughout; Escape closes.
 *
 * Tracked things and timeline entries were missing until D-047, so
 * two entries about `TMM` — and, after D-046 moved state words into `stage`, every
 * 拒稿 — could not be found at all. A tracked thing ranks above its own entries
 * because it opens the whole history rather than one moment in it.
 */

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, FileText, Layers, Plus, Search, SquareCheck } from 'lucide-react';

import { JourneyIcon } from '@/components/JourneyIcon';
import { Modal } from '@/components/Modal';
import { StageChip } from '@/components/StageChip';
import { useInvalidate, useRepoQuery, useRepository } from '@/data/RepositoryContext';
import { formatRelativeDay } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';
import { useAppStore } from '@/app/store';
import { TaskDetailsDialog } from './TaskDetailsDialog';

interface Item {
  key: string;
  label: string;
  hint?: string;
  /** Rendered after the label — a stage chip, when the hit has one. */
  badge?: React.ReactNode;
  icon: React.ReactNode;
  /** Task details replace the search dialog without closing its overlay. */
  keepOpen?: boolean;
  run: () => void | Promise<void>;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();
  const openJourney = useAppStore((state) => state.openJourney);
  const openNote = useAppStore((state) => state.openNote);
  const setOverlay = useAppStore((state) => state.setOverlay);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const journeys = useRepoQuery((repo) => repo.listJourneys(), []);
  const tasks = useRepoQuery((repo) => repo.listTasks(), []);
  const notes = useRepoQuery((repo) => repo.listNotes(query ? { search: query } : {}), [query]);
  /*
   * Both are query-only: with nothing typed the palette is a jump list, and
   * dumping every event into it would bury the Journeys.
   */
  const things = useRepoQuery(
    (repo) => (query.trim() ? repo.searchSubjects(query) : Promise.resolve([])),
    [query],
  );
  const entries = useRepoQuery(
    (repo) =>
      query.trim() ? repo.searchTimeline(query, { order: 'newest' }) : Promise.resolve([]),
    [query],
  );

  const items = useMemo<Item[]>(() => {
    const needle = query.trim().toLowerCase();

    const journeyItems: Item[] = (journeys.data ?? [])
      .filter((journey) => !needle || journey.title.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((journey) => ({
        key: `journey-${journey.id}`,
        label: journey.title,
        hint: t('Journey', '旅程'),
        icon: <JourneyIcon name={journey.icon} size={15} />,
        run: () => openJourney(journey.id),
      }));

    /*
     * Tracked things, above their own entries: opening one shows the whole
     * history of that paper or position, which is almost always what someone
     * typing `TMM` wants. Lands on the register tab it belongs to.
     */
    const thingItems: Item[] = (things.data ?? []).slice(0, 5).map((thing) => ({
      key: `subject-${thing.id}`,
      label: thing.title,
      hint: thing.kind,
      badge: thing.currentStage ? (
        <StageChip label={thing.currentStage} tone={null} />
      ) : undefined,
      icon: <Layers size={15} strokeWidth={1.75} aria-hidden />,
      run: () => openJourney(thing.journeyId, { register: thing.kind }),
    }));

    const noteItems: Item[] = (notes.data ?? []).slice(0, 6).map((note) => ({
      key: `note-${note.id}`,
      label: note.title,
      hint: formatRelativeDay(note.updatedAt),
      icon: <FileText size={15} strokeWidth={1.75} aria-hidden />,
      run: () => openNote(note.id),
    }));

    const taskItems: Item[] = (tasks.data ?? [])
      .filter(
        (task) =>
          needle &&
          (task.status === 'todo' || task.status === 'doing') &&
          `${task.title}\n${task.detailsMd ?? ''}`.toLowerCase().includes(needle),
      )
      .slice(0, 6)
      .map((task) => ({
        key: `task-${task.id}`,
        label: task.title,
        hint:
          task.status === 'doing'
            ? t('Task · In progress', '任务 · 进行中')
            : t('Task · To do', '任务 · 待办'),
        icon: <SquareCheck size={15} strokeWidth={1.75} aria-hidden />,
        keepOpen: true,
        run: () => setSelectedTaskId(task.id),
      }));
    const taskResultKeys = new Set(taskItems.map((item) => item.key));

    /*
     * Timeline entries. Task-backed history opens that task; other entries open
     * the Journey's timeline, where the entry lives.
     *
     * **`note_logged` entries are dropped.** The note itself is already a result
     * above, and both rows would open the same editor — searching `ROS2` returned
     * it twice, which an existing test caught. The query is right to return them
     * (a Journey-scoped search wants its whole history); the palette is where two
     * rows leading to one destination should collapse into one.
     *
     * Open task results replace the history rows that lead to the same task.
     * Other task history remains searchable, including completed tasks.
     */
    const entryItems: Item[] = (entries.data ?? [])
      .filter(
        (entry) =>
          entry.sourceType !== 'note' &&
          !(entry.sourceType === 'task' && taskResultKeys.has(`task-${entry.sourceId}`)),
      )
      .slice(0, 6)
      .map((entry) => ({
        key: `entry-${entry.id}`,
        label: entry.title,
        hint: formatRelativeDay(entry.occurredAt),
        badge: entry.stage ? (
          <StageChip label={entry.stage} tone={entry.stageTone} />
        ) : undefined,
        icon: <CalendarClock size={15} strokeWidth={1.75} aria-hidden />,
        keepOpen: entry.sourceType === 'task' && Boolean(entry.sourceId),
        run: () => {
          if (entry.sourceType === 'task' && entry.sourceId) {
            setSelectedTaskId(entry.sourceId);
            return;
          }
          const journey = entry.journeys[0];
          if (journey) openJourney(journey.id);
        },
      }));

    const actions: Item[] = [
      {
        key: 'action-new-note',
        label: query.trim()
          ? t(`New note “${query.trim()}”`, `新建笔记“${query.trim()}”`)
          : t('New note', '新建笔记'),
        hint: '⌘N',
        icon: <FileText size={15} strokeWidth={1.75} aria-hidden />,
        run: async () => {
          const note = await repository.createNote(
            query.trim() ? { title: query.trim(), bodyMd: `# ${query.trim()}\n\n` } : {},
          );
          invalidate();
          openNote(note.id);
        },
      },
      {
        key: 'action-new-journey',
        label: t('New Journey', '新建旅程'),
        icon: <Plus size={15} strokeWidth={1.75} aria-hidden />,
        run: () => setOverlay('new-journey'),
      },
    ];

    return [
      ...journeyItems,
      ...thingItems,
      ...noteItems,
      ...taskItems,
      ...entryItems,
      ...actions,
    ];
  }, [
    query,
    journeys.data,
    things.data,
    notes.data,
    tasks.data,
    entries.data,
    openJourney,
    openNote,
    repository,
    invalidate,
    setOverlay,
    t,
  ]);

  // Keep the highlight in range as results change under it.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!selectedTaskId) return;
    const onSearchShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k' && !event.isComposing) {
        event.preventDefault();
        setSelectedTaskId(null);
        setActiveIndex(0);
      }
    };
    window.addEventListener('keydown', onSearchShortcut);
    return () => window.removeEventListener('keydown', onSearchShortcut);
  }, [selectedTaskId]);

  const runItem = (item: Item) => {
    // Close before a navigation action, which may open a different overlay.
    if (!item.keepOpen) onClose();
    void item.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % Math.max(items.length, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + items.length) % Math.max(items.length, 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) runItem(item);
    }
  };

  if (selectedTaskId) {
    return (
      <TaskDetailsDialog
        taskId={selectedTaskId}
        onBack={() => {
          setSelectedTaskId(null);
          setActiveIndex(0);
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal title={t('Search', '搜索')} onClose={onClose} variant="command">
      <div className="command__search">
        <Search size={16} strokeWidth={2} aria-hidden />
        <input
          className="command__input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t(
            'Search Journeys, notes, tasks, entries…',
            '搜索旅程、笔记、任务、记录…',
          )}
          aria-label={t('Search', '搜索')}
          autoComplete="off"
        />
      </div>

      <div className="command__results">
        {items.length === 0 ? (
          <p className="command__empty">{t('Nothing matches.', '没有找到匹配的结果。')}</p>
        ) : (
          items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              className="command__item"
              data-active={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => runItem(item)}
              data-autofocus="false"
            >
              <span className="command__item-icon">{item.icon}</span>
              <span className="command__item-label">{item.label}</span>
              {item.badge ? <span className="command__item-badge">{item.badge}</span> : null}
              {item.hint ? <span className="command__item-hint">{item.hint}</span> : null}
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}

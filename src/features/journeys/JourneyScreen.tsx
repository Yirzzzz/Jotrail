/**
 * The product-defining screen. Timeline is the default tab (DECISIONS.md D-004).
 *
 * Tabs are generic: Timeline, Notes, Tasks, Overview. Domain-specific views
 * (Positions, Skills, Workouts…) are a post-MVP extension, not something baked
 * into every journey.
 *
 * The timeline opens newest-first and can be flipped to read forwards, the same
 * control the global timeline has (DECISIONS.md D-015).
 */

import { useEffect, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpWideNarrow, FileText, Plus } from 'lucide-react';

import { useInvalidate, useRepoQuery, useRepository } from '@/data/RepositoryContext';
import { currentFocus } from '@/domain/development';
import { excerpt, noteTypeLabel } from '@/domain/notes';
import type { SubjectSummary, TimelineEntry, TimelineOrder } from '@/domain/types';
import { formatRelativeDay } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';
import { TaskComposer } from '@/features/tasks/TaskComposer';
import { TaskList } from '@/features/tasks/TaskList';
import { RecordEventDialog } from '@/features/timeline/RecordEventDialog';
import { EditEventDialog } from '@/features/timeline/EditEventDialog';
import { MarkHappenedDialog } from '@/features/timeline/MarkHappenedDialog';
import { TimelineView } from '@/features/timeline/TimelineView';
import { RegisterView } from '@/features/registers/RegisterView';
import { NewRegisterDialog } from '@/features/registers/NewRegisterDialog';
import { SubjectHistoryDialog } from '@/features/registers/SubjectHistoryDialog';
import type { JourneyTab } from '@/app/store';
import { useAppStore } from '@/app/store';
import { JourneyHeader } from './JourneyHeader';
import { JourneyOverview } from './JourneyOverview';
import { JourneyRail } from './JourneyRail';
import './Journey.css';

export function JourneyScreen({ journeyId, tab }: { journeyId: string; tab: JourneyTab }) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();
  const openJourney = useAppStore((state) => state.openJourney);
  const openNote = useAppStore((state) => state.openNote);

  const [isRecordingEvent, setRecordingEvent] = useState(false);
  const [editing, setEditing] = useState<TimelineEntry | null>(null);
  const [confirming, setConfirming] = useState<TimelineEntry | null>(null);
  /**
   * The tracked thing whose own history is being read, if any.
   *
   * Held here rather than in the route: it is a filter on the timeline this
   * screen already has, not a separate destination, so it should not survive a
   * restart pointing at something that may be gone (same reasoning as D-013 on
   * not restoring note ids).
   */
  const [openSubject, setOpenSubject] = useState<SubjectSummary | null>(null);
  const [isCreatingRegister, setCreatingRegister] = useState(false);
  /*
   * Newest-first, so opening a Journey answers "where is this now?".
   *
   * D-015 originally had a journey read forwards from its beginning, on the
   * grounds that a journey is a story. The story reading is still one click
   * away, but it is not what the screen is usually opened for: the entries a
   * user comes back to are the ones at the end, and reading forwards buried
   * them below everything that came before.
   */
  const [order, setOrder] = useState<TimelineOrder>('newest');

  useEffect(() => {
    const scroller = document.querySelector('.shell__main-scroll');
    if (scroller instanceof HTMLElement) scroller.scrollTop = 0;
  }, [tab, journeyId]);

  const journey = useRepoQuery((repo) => repo.getJourney(journeyId), [journeyId]);
  const entries = useRepoQuery(
    (repo) => repo.listTimeline({ journeyId, order }),
    [journeyId, order],
  );
  const notes = useRepoQuery((repo) => repo.listNotes({ journeyId }), [journeyId]);
  const tasks = useRepoQuery((repo) => repo.listTasks({ journeyId }), [journeyId]);
  const registers = useRepoQuery((repo) => repo.subjectKinds(journeyId), [journeyId]);
  /*
   * Stage counts per register, for the Overview's cross-section. Fetched here
   * rather than inside the panel so the whole screen shares one read, the way
   * notes and tasks already do.
   */
  const tallies = useRepoQuery((repo) => repo.registerTallies(journeyId), [journeyId]);
  const classifications = useRepoQuery(
    async (repo) => {
      const [categories, subjects] = await Promise.all([
        repo.listStateCategories(journeyId),
        repo.listSubjects(journeyId),
      ]);
      return { journeyId, categories, subjects };
    },
    [journeyId],
  );
  const currentClassifications =
    classifications.data?.journeyId === journeyId ? classifications.data : undefined;

  if (journey.error) {
    return (
      <div className="journey__body">
        <div className="empty-state">
          <div className="empty-state__title">{t('Journey not found', '未找到旅程')}</div>
          <p>{journey.error}</p>
        </div>
      </div>
    );
  }

  if (!journey.data) return <div className="journey__body" />;

  const record = journey.data;
  const timelineEntries = entries.data ?? [];
  const noteList = notes.data ?? [];
  const taskList = tasks.data ?? [];
  // Focus remains the latest recorded turning point in either feed direction.
  const highlightId = currentFocus(timelineEntries)?.id;

  const registerKinds = registers.data ?? [];
  /*
   * Which register this tab is, if any. A `kind` restored from localStorage that
   * no longer exists still renders — as its own empty register — rather than
   * throwing, because the shape is valid even when the register has been emptied.
   */
  const registerKind = typeof tab === 'object' ? tab.register : null;
  /*
   * The open thing's own events, oldest first.
   *
   * Filtered from the timeline this screen already loaded rather than fetched
   * again — a thing's history *is* a slice of the Journey's, which is the point
   * of `subject_id` living on the event. Ascending because a single thing reads
   * as a story (投稿 → 拒稿 → 大修), regardless of how the feed above is sorted.
   */
  const subjectEntries = openSubject
    ? [...timelineEntries]
        .filter((entry) => entry.subjectId === openSubject.id)
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    : [];

  const createNoteHere = async () => {
    // Created and linked in one step, so it lands on this timeline immediately.
    const note = await repository.createNote({ journeyId });
    invalidate();
    openNote(note.id);
  };

  const openEntry = (entry: TimelineEntry) => {
    if (entry.sourceType === 'note' && entry.sourceId) openNote(entry.sourceId);
  };

  return (
    <>
      <div className="journey">
        <JourneyHeader
          journey={record}
          tab={tab}
          counts={{ notes: noteList.length, tasks: taskList.length }}
          entries={timelineEntries}
          registers={registerKinds}
          onSelectTab={(next) => openJourney(journeyId, next)}
        />

        <div className="journey__body">
          {tab === 'timeline' ? (
            <>
              <div className="journey__toolbar">
                <span className="meta-text">
                  {timelineEntries.length === 0
                    ? t('Nothing recorded yet', '还没有记录')
                    : t(
                        `${timelineEntries.length} ${
                          timelineEntries.length === 1 ? 'entry' : 'entries'
                        }`,
                        `${timelineEntries.length} 条记录`,
                      )}
                </span>
                <div className="journey__toolbar-actions">
                  <button
                    type="button"
                    className="button"
                    onClick={() => setOrder(order === 'newest' ? 'oldest' : 'newest')}
                    title={
                      order === 'newest'
                        ? t('Show oldest first', '从最早开始显示')
                        : t('Show newest first', '从最新开始显示')
                    }
                  >
                    {order === 'newest' ? (
                      <ArrowDownWideNarrow size={14} strokeWidth={2} aria-hidden />
                    ) : (
                      <ArrowUpWideNarrow size={14} strokeWidth={2} aria-hidden />
                    )}
                    {order === 'newest'
                      ? t('Newest first', '最新在前')
                      : t('Oldest first', '最早在前')}
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => void createNoteHere()}
                  >
                    <FileText size={14} strokeWidth={2} aria-hidden />
                    {t('New note', '新建笔记')}
                  </button>
                  <button
                    type="button"
                    className="button button--outline"
                    onClick={() => setRecordingEvent(true)}
                  >
                    <Plus size={14} strokeWidth={2} aria-hidden />
                    {t('Record event', '记录事件')}
                  </button>
                </div>
              </div>

              <TimelineView
                entries={timelineEntries}
                highlightId={highlightId}
                onOpenEntry={openEntry}
                onEditEntry={setEditing}
                onMarkEntryHappened={setConfirming}
                emptyState={
                  <div className="empty-state">
                    <div className="empty-state__title">
                      {t('This Journey is new', '旅程刚刚开始')}
                    </div>
                    <p>
                      {t(
                        'Start with a note, task, or event. This timeline will grow as the Journey develops.',
                        '从一篇笔记、一项任务或一个事件开始。随着旅程展开，时间线也会慢慢丰富。',
                      )}
                    </p>
                  </div>
                }
              />
            </>
          ) : null}

          {tab === 'notes' ? (
            <>
              <div className="journey__toolbar">
                <span className="meta-text">
                  {noteList.length === 0
                    ? t('No notes yet', '还没有笔记')
                    : t(
                        `${noteList.length} ${noteList.length === 1 ? 'note' : 'notes'}`,
                        `${noteList.length} 篇笔记`,
                      )}
                </span>
                <button
                  type="button"
                  className="button button--outline"
                  onClick={() => void createNoteHere()}
                >
                  <Plus size={14} strokeWidth={2} aria-hidden />
                  {t('New note', '新建笔记')}
                </button>
              </div>

              {noteList.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state__title">
                    {t('No notes here yet', '这里还没有笔记')}
                  </div>
                  <p>
                    {t(
                      'Notes written here are linked to this Journey and appear on its timeline.',
                      '在这里写下的笔记会关联到此旅程，并显示在时间线上。',
                    )}
                  </p>
                </div>
              ) : (
                <div className="note-list">
                  {noteList.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      className="note-row"
                      onClick={() => openNote(note.id)}
                    >
                      <div className="note-row__head">
                        <span className="note-row__title">{note.title}</span>
                        <span className="note-row__date">
                          {formatRelativeDay(note.updatedAt)}
                        </span>
                      </div>
                      {note.bodyMd.trim() ? (
                        <div className="note-row__excerpt">{excerpt(note.bodyMd, 120)}</div>
                      ) : null}
                      <div className="note-row__meta">
                        <span className="pill pill--quiet">{noteTypeLabel(note.noteType)}</span>
                        {note.pinnedIn.includes(journeyId) ? (
                          <span className="pill">{t('Pinned', '已置顶')}</span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {tab === 'tasks' ? (
            <>
              <TaskComposer
                journeyId={journeyId}
                placeholder={t('Add a task to this Journey…', '为此旅程添加任务…')}
              />
              <TaskList
                tasks={taskList}
                emptyState={
                  <div className="empty-state">
                    <div className="empty-state__title">{t('No tasks', '没有任务')}</div>
                    <p>
                      {t(
                        'Add one above. Completing a task is recorded on this Journey’s timeline.',
                        '在上方添加任务。完成任务后，会自动记录在此旅程的时间线上。',
                      )}
                    </p>
                  </div>
                }
              />
            </>
          ) : null}

          {tab === 'overview' ? (
            <JourneyOverview
              journey={record}
              entries={timelineEntries}
              notes={noteList}
              counts={{
                notes: noteList.length,
                tasks: taskList.length,
                openTasks: taskList.filter(
                  (task) => task.status === 'todo' || task.status === 'doing',
                ).length,
                entries: timelineEntries.length,
              }}
              registers={registerKinds}
              tallies={tallies.data ?? []}
              categories={currentClassifications?.categories ?? []}
              subjects={currentClassifications?.subjects ?? []}
              classificationError={classifications.error}
              onSelectTab={(next) => openJourney(journeyId, next)}
              onOpenNote={openNote}
              onTrackSomething={() => setCreatingRegister(true)}
              onStatusChange={async (status) => {
                await repository.setJourneyStatus(journeyId, status);
                invalidate();
              }}
            />
          ) : null}

          {/*
            A register. `registerKind` is non-null only for a `{ register }` tab,
            so this and the four above are mutually exclusive without a switch.
          */}
          {registerKind ? (
            <RegisterView
              journeyId={journeyId}
              kind={registerKind}
              onOpenSubject={setOpenSubject}
            />
          ) : null}
        </div>
      </div>

      {isRecordingEvent ? (
        <RecordEventDialog journeyId={journeyId} onClose={() => setRecordingEvent(false)} />
      ) : null}
      {editing ? <EditEventDialog entry={editing} onClose={() => setEditing(null)} /> : null}
      {confirming ? (
        <MarkHappenedDialog entry={confirming} onClose={() => setConfirming(null)} />
      ) : null}
      {/*
        One tracked thing's own history, in a dialog over the register.

        The same `TimelineView` the Journey uses, given a narrower slice — which is
        the payoff of putting `subject_id` on the event: a thing's history needs no
        second renderer and no second query, because it *is* the timeline, filtered.
      */}
      {openSubject ? (
        <SubjectHistoryDialog
          title={openSubject.title}
          entries={subjectEntries}
          onOpenEntry={openEntry}
          onEditEntry={(entry) => {
            setOpenSubject(null);
            setEditing(entry);
          }}
          onMarkEntryHappened={(entry) => {
            setOpenSubject(null);
            setConfirming(entry);
          }}
          onClose={() => setOpenSubject(null)}
        />
      ) : null}
      {isCreatingRegister ? (
        <NewRegisterDialog
          journeyId={journeyId}
          onCreated={(kind) => {
            setCreatingRegister(false);
            // Straight into the register just created, which is where the user
            // was heading.
            openJourney(journeyId, { register: kind });
          }}
          onClose={() => setCreatingRegister(false)}
        />
      ) : null}
    </>
  );
}

/** Rail for the journey screen, exported for `App` to place in the third column. */
export function JourneyScreenRail({ journeyId }: { journeyId: string }) {
  const repository = useRepository();
  const invalidate = useInvalidate();
  const openNote = useAppStore((state) => state.openNote);
  const [isRecordingEvent, setRecordingEvent] = useState(false);

  const journey = useRepoQuery((repo) => repo.getJourney(journeyId), [journeyId]);
  const notes = useRepoQuery((repo) => repo.listNotes({ journeyId }), [journeyId]);
  const tasks = useRepoQuery((repo) => repo.listTasks({ journeyId }), [journeyId]);
  const entries = useRepoQuery(
    (repo) => repo.listTimeline({ journeyId, order: 'oldest' }),
    [journeyId],
  );

  if (!journey.data) return null;

  return (
    <>
      <JourneyRail
        journey={journey.data}
        notes={notes.data ?? []}
        tasks={tasks.data ?? []}
        entries={entries.data ?? []}
        onOpenNote={openNote}
        onTogglePin={async (note) => {
          await repository.setNotePinned(
            note.id,
            journeyId,
            !note.pinnedIn.includes(journeyId),
          );
          invalidate();
        }}
        onAddEvent={() => setRecordingEvent(true)}
      />
      {isRecordingEvent ? (
        <RecordEventDialog journeyId={journeyId} onClose={() => setRecordingEvent(false)} />
      ) : null}
    </>
  );
}

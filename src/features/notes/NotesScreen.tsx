/**
 * Global note library: index on the left, editor on the right.
 *
 * A new note opens straight into the editor with the cursor in the body — no
 * dialog, no required fields (PRODUCT_SPEC.md §11).
 */

import { useEffect, useState } from 'react';
import { FileText, Plus, Search } from 'lucide-react';

import { useInvalidate, useRepoQuery, useRepository } from '@/data/RepositoryContext';
import { excerpt } from '@/domain/notes';
import { formatRelativeDay } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';
import { useAppStore } from '@/app/store';
import { NoteEditor } from './NoteEditor';
import { NoteRail } from './NoteRail';
import './Notes.css';

export function NotesScreen({ noteId }: { noteId?: string }) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();
  const openNote = useAppStore((state) => state.openNote);

  const [search, setSearch] = useState('');
  const [freshNoteId, setFreshNoteId] = useState<string | null>(null);

  const notes = useRepoQuery((repo) => repo.listNotes({ search }), [search]);
  const list = notes.data ?? [];

  // With nothing selected, open the most recently edited note.
  const selectedId = noteId ?? list.at(0)?.id;
  const selected = list.find((note) => note.id === selectedId);

  useEffect(() => {
    if (!noteId && selectedId) openNote(selectedId);
  }, [noteId, selectedId, openNote]);

  const create = async () => {
    const note = await repository.createNote({});
    invalidate();
    setFreshNoteId(note.id);
    openNote(note.id);
  };

  return (
    <div className="notes">
      <aside className="notes__index">
        <div className="notes__index-head">
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <span className="section-label">{t('Notes', '笔记')}</span>
            <button
              type="button"
              className="icon-button"
              onClick={() => void create()}
              title={t('New note (⌘N)', '新建笔记 (⌘N)')}
              aria-label={t('New note', '新建笔记')}
            >
              <Plus size={15} strokeWidth={2} aria-hidden />
            </button>
          </div>

          <div className="notes__search">
            <Search size={13} strokeWidth={2} aria-hidden />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('Search notes', '搜索笔记')}
              aria-label={t('Search notes', '搜索笔记')}
            />
          </div>
        </div>

        <div className="notes__index-list scroll-area">
          {list.length === 0 ? (
            <p className="notes__index-empty">
              {search
                ? t(`Nothing matches “${search}”.`, `没有找到与“${search}”匹配的笔记。`)
                : t('No notes yet.', '还没有笔记。')}
            </p>
          ) : (
            list.map((note) => (
              <button
                key={note.id}
                type="button"
                className="notes__index-item"
                aria-current={note.id === selectedId}
                onClick={() => openNote(note.id)}
              >
                <div className="notes__index-title">{note.title}</div>
                {note.bodyMd.trim() ? (
                  <div className="notes__index-excerpt">{excerpt(note.bodyMd, 70)}</div>
                ) : null}
                <div className="notes__index-date">{formatRelativeDay(note.updatedAt)}</div>
              </button>
            ))
          )}
        </div>
      </aside>

      {selected ? (
        <NoteEditor
          // Keyed so switching notes gets fresh editor state rather than
          // carrying another note's draft across.
          key={selected.id}
          note={selected}
          autoFocus={selected.id === freshNoteId}
          onDeleted={() => {
            const next = list.find((note) => note.id !== selected.id);
            if (next) openNote(next.id);
            else useAppStore.getState().navigate({ name: 'notes' });
          }}
        />
      ) : (
        <div className="editor">
          <div className="editor__scroll scroll-area">
            <div className="editor__column">
              <div className="empty-state">
                <div className="empty-state__title">{t('Nothing open', '还没有打开笔记')}</div>
                <p>
                  {t(
                    'Write a note now and decide later whether it belongs to a Journey. Notes are useful on their own.',
                    '先写一篇笔记，之后再决定是否关联到旅程。笔记本身就有价值。',
                  )}
                </p>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void create()}
                  style={{ marginTop: 'var(--space-4)' }}
                >
                  <FileText size={14} strokeWidth={2} aria-hidden />
                  {t('Start writing', '开始书写')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The Notes screen's context rail, mounted by the shell rather than by the
 * screen — the rail is a sibling of the main column in the app grid, not a child
 * of it (see `App.tsx`).
 *
 * It resolves the note itself rather than taking one as a prop, because the shell
 * only knows the route's `noteId`. With nothing open, or while the list is still
 * loading, it renders nothing: an empty margin is honest, and a skeleton here
 * would flash on every note switch.
 */
export function NotesScreenRail({ noteId }: { noteId?: string }) {
  const openNote = useAppStore((state) => state.openNote);
  const openJourney = useAppStore((state) => state.openJourney);

  const notes = useRepoQuery((repo) => repo.listNotes(), []);
  const journeys = useRepoQuery((repo) => repo.listJourneys(), []);

  const all = notes.data ?? [];
  /* Mirrors the screen's own fallback: with nothing selected, the newest note. */
  const note = all.find((candidate) => candidate.id === noteId) ?? all.at(0);
  if (!note) return null;

  return (
    <NoteRail
      note={note}
      allNotes={all}
      journeys={journeys.data ?? []}
      onOpenNote={openNote}
      onOpenJourney={openJourney}
    />
  );
}

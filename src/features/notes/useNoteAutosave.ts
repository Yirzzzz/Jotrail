/**
 * Debounced editing for one note (ARCHITECTURE.md §9). The draft and serial
 * writer outlive this hook so navigation, reopening and backup can await the
 * same save. NoteEditor is keyed by note id: each mount edits one note.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { useRepository } from '@/data/RepositoryContext';
import type { NoteWithLinks } from '@/domain/types';
import { noteSaveQueue } from './pendingNoteSaves';
import type { SaveState } from './pendingNoteSaves';

export type { SaveState } from './pendingNoteSaves';

const DEBOUNCE_MS = 700;

export interface NoteAutosave {
  title: string;
  bodyMd: string;
  setTitle: (title: string) => void;
  setBodyMd: (body: string) => void;
  saveState: SaveState;
  error: string | null;
  /** Wait until the latest draft is persisted; rejects if a write fails. */
  flush: () => Promise<void>;
  /** Save from an event handler; failures stay visible in saveState. */
  saveInBackground: () => void;
  retry: () => void;
}

export function useNoteAutosave(
  note: NoteWithLinks,
  onSaved?: (note: NoteWithLinks) => void,
): NoteAutosave {
  const repository = useRepository();
  const [queue] = useState(() => noteSaveQueue(repository, note));
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    queue.onSaved = (updated) => onSavedRef.current?.(updated);
    // Continue saving after navigation. Failed drafts remain in the registry
    // for reopening or Settings to retry. Process termination is not a flush.
    return () => queue.saveInBackground();
  }, [queue]);

  useEffect(() => {
    if (snapshot.saveState !== 'unsaved') return;
    const timer = setTimeout(queue.saveInBackground, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [queue, snapshot.saveState, snapshot.title, snapshot.bodyMd]);

  return {
    ...snapshot,
    setTitle: queue.setTitle,
    setBodyMd: queue.setBodyMd,
    flush: queue.flush,
    saveInBackground: queue.saveInBackground,
    retry: queue.saveInBackground,
  };
}

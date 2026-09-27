import type { Repository } from '@/data/repository';
import { deriveTitle } from '@/domain/notes';
import type { NoteWithLinks } from '@/domain/types';

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

interface Draft {
  title: string;
  bodyMd: string;
}

interface SaveSnapshot extends Draft {
  saveState: SaveState;
  error: string | null;
}

// Only unsaved work is retained. A queue survives navigation (and a failed
// write), so reopening the note cannot start a second writer on stale text.
const pendingSaves = new Set<NoteSaveQueue>();
const byRepository = new WeakMap<Repository, Map<string, NoteSaveQueue>>();

export class NoteSaveQueue {
  private draft: Draft;
  private saved: Draft;
  private snapshot: SaveSnapshot;
  private manualTitle: boolean;
  private inFlight: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  onSaved?: (note: NoteWithLinks) => void;

  constructor(
    private repository: Repository,
    private noteId: string,
    note: NoteWithLinks,
  ) {
    this.draft = { title: note.title, bodyMd: note.bodyMd };
    this.saved = this.draft;
    this.snapshot = { ...this.draft, saveState: 'saved', error: null };
    this.manualTitle = note.title !== deriveTitle(note.bodyMd);
  }

  getSnapshot = (): SaveSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<SaveSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private isDirty(): boolean {
    return this.draft.title !== this.saved.title || this.draft.bodyMd !== this.saved.bodyMd;
  }

  private register(): void {
    pendingSaves.add(this);
    let notes = byRepository.get(this.repository);
    if (!notes) {
      notes = new Map();
      byRepository.set(this.repository, notes);
    }
    notes.set(this.noteId, this);
  }

  private finish(): void {
    pendingSaves.delete(this);
    const notes = byRepository.get(this.repository);
    if (notes?.get(this.noteId) === this) notes.delete(this.noteId);
  }

  setTitle = (next: string): void => {
    this.manualTitle = next.trim().length > 0;
    const title = this.manualTitle ? next : deriveTitle(this.draft.bodyMd);
    this.draft = { ...this.draft, title };
    this.register();
    this.publish({ title: next, saveState: 'unsaved' });
  };

  setBodyMd = (bodyMd: string): void => {
    const title = this.manualTitle ? this.draft.title : deriveTitle(bodyMd);
    this.draft = { title, bodyMd };
    this.register();
    this.publish({ title, bodyMd, saveState: 'unsaved' });
  };

  /** Every caller waits for the same serial drain, including later edits. */
  flush = (): Promise<void> => {
    if (this.inFlight) return this.inFlight;
    if (!this.isDirty()) {
      this.finish();
      this.publish({ saveState: 'saved', error: null });
      return Promise.resolve();
    }

    this.inFlight = Promise.resolve()
      .then(async () => {
        try {
          while (this.isDirty()) {
            const draft = { ...this.draft };
            this.publish({ saveState: 'saving' });
            const updated = await this.repository.updateNote(this.noteId, draft);
            this.saved = draft;
            this.onSaved?.(updated);
          }
          this.finish();
          this.publish({ saveState: 'saved', error: null });
        } catch (cause) {
          this.publish({
            saveState: 'error',
            error: cause instanceof Error ? cause.message : String(cause),
          });
          throw cause;
        }
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  };

  saveInBackground = (): void => {
    // The snapshot keeps the error visible, and the registry keeps the draft
    // retryable even if its editor has unmounted.
    void this.flush().catch(() => {});
  };
}

export function noteSaveQueue(repository: Repository, note: NoteWithLinks): NoteSaveQueue {
  return (
    byRepository.get(repository)?.get(note.id) ?? new NoteSaveQueue(repository, note.id, note)
  );
}

/** Drain before backup/restore; a failure retains the draft and blocks the caller. */
export async function flushPendingNoteSaves(): Promise<void> {
  while (pendingSaves.size > 0) {
    // Let all writers settle even if one fails, so none can land after restore.
    const results = await Promise.allSettled([...pendingSaves].map((save) => save.flush()));
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }
}

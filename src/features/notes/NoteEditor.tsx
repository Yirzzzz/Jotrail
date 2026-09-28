/**
 * The writing surface for one note.
 *
 * Metadata lives in the bar at the bottom, never between the user and the text
 * (AGENTS.md §12, USER_FLOWS.md Flow B). Journey association is offered here and
 * is entirely optional.
 */

import { useState } from 'react';
import {
  Check,
  ChevronRight,
  CircleAlert,
  Link2,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import { JourneyIcon } from '@/components/JourneyIcon';
import { useInvalidate, useRepoQuery, useRepository } from '@/data/RepositoryContext';
import { bodyWithoutTitleHeading, noteTypeLabel, readingTime } from '@/domain/notes';
import type { NoteWithLinks } from '@/domain/types';
import { formatRelativeDay } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';
import { penStyle } from '@/lib/pens';
import { useAppStore } from '@/app/store';
import { MarkdownEditor } from './MarkdownEditor';
import { useNoteAutosave } from './useNoteAutosave';
import type { SaveState } from './useNoteAutosave';

interface Props {
  note: NoteWithLinks;
  /** Focus the body immediately — used for a freshly created note. */
  autoFocus?: boolean;
  onDeleted?: () => void;
}

export function NoteEditor({ note, autoFocus = false, onDeleted }: Props) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();
  const journeys = useRepoQuery((repo) => repo.listJourneys(), []);
  const openJourney = useAppStore((state) => state.openJourney);

  const [isLinkMenuOpen, setLinkMenuOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const autosave = useNoteAutosave(note, invalidate);

  const linked = note.journeys;
  const linkable = (journeys.data ?? []).filter(
    (journey) => !linked.some((item) => item.id === journey.id),
  );

  const link = async (journeyId: string) => {
    setLinkMenuOpen(false);
    setActionError(null);
    try {
      // Save first: the timeline event snapshots the note's title and excerpt.
      await autosave.flush();
      await repository.linkNoteToJourney(note.id, journeyId);
      invalidate();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const unlink = async (journeyId: string) => {
    setActionError(null);
    try {
      await repository.unlinkNoteFromJourney(note.id, journeyId);
      invalidate();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const remove = async () => {
    setActionError(null);
    try {
      // Keep the latest text in the recoverable note, and finish any pending
      // writer before deleting so it cannot save into an already deleted row.
      await autosave.flush();
      await repository.deleteNote(note.id);
      invalidate();
      onDeleted?.();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const minutes = readingTime(autosave.bodyMd);
  const hasRepeatedTitleHeading =
    bodyWithoutTitleHeading({ title: autosave.title, bodyMd: autosave.bodyMd }) !==
    autosave.bodyMd;

  return (
    <div className="editor">
      <div className="editor__scroll scroll-area">
        <div className="editor__column">
          {/*
            Where this note sits. The reference leads with it, and it earns the
            line: a note reached from a Journey or from search otherwise arrives
            with no indication of what it belongs to.
          */}
          <nav className="editor__breadcrumb" aria-label={t('Location', '位置')}>
            <span className="editor__breadcrumb-root">{t('Notes', '笔记')}</span>
            <ChevronRight size={12} strokeWidth={2} aria-hidden />
            <span className="editor__breadcrumb-current">
              {autosave.title || t('Untitled', '无标题')}
            </span>
          </nav>

          <input
            className="editor__title"
            value={autosave.title}
            onChange={(event) => autosave.setTitle(event.target.value)}
            onBlur={autosave.saveInBackground}
            placeholder={t('Untitled', '无标题')}
            aria-label={t('Note title', '笔记标题')}
          />

          {/*
            The Journeys this note belongs to, directly under the title — the
            reference puts them there, and it is where they answer "what is this
            part of". Adding and removing still happens in the footer bar, so the
            writing surface stays free of controls.
          */}
          {linked.length > 0 ? (
            <div className="editor__tags">
              {linked.map((journey) => (
                <button
                  key={journey.id}
                  type="button"
                  className="pill pill--channel editor__tag"
                  style={penStyle(journey.id)}
                  onClick={() => openJourney(journey.id)}
                  title={t(`Open ${journey.title}`, `打开${journey.title}`)}
                >
                  <JourneyIcon name={journey.icon} size={11} />
                  {journey.title}
                </button>
              ))}
            </div>
          ) : null}

          <div className="editor__meta">
            <span className="pill pill--quiet">{noteTypeLabel(note.noteType)}</span>
            <span className="meta-text">
              {t(
                `Edited ${formatRelativeDay(note.updatedAt)}`,
                `编辑于${formatRelativeDay(note.updatedAt)}`,
              )}
            </span>
            {minutes ? <span className="meta-text">· {minutes}</span> : null}
          </div>

          {/* No preview toggle: the editor renders Markdown as you write. */}
          <MarkdownEditor
            value={autosave.bodyMd}
            onChange={autosave.setBodyMd}
            onSave={autosave.saveInBackground}
            onBlur={autosave.saveInBackground}
            autoFocus={autoFocus}
            placeholder={t('Start writing…', '开始书写…')}
            hideLeadingTitleHeading={hasRepeatedTitleHeading}
          />
        </div>
      </div>

      <div className="editor__bar">
        <SaveIndicator state={autosave.saveState} onRetry={autosave.retry} />

        <div className="editor__journeys">
          {linked.map((journey) => (
            <span key={journey.id} className="editor__journey-chip">
              <JourneyIcon name={journey.icon} size={11} />
              {journey.title}
              <button
                type="button"
                onClick={() => void unlink(journey.id)}
                title={t(`Remove from ${journey.title}`, `从${journey.title}移除`)}
                aria-label={t(`Remove from ${journey.title}`, `从${journey.title}移除`)}
              >
                <X size={11} strokeWidth={2.5} aria-hidden />
              </button>
            </span>
          ))}

          <div className="link-menu">
            <button
              type="button"
              className="button"
              onClick={() => setLinkMenuOpen(!isLinkMenuOpen)}
              aria-expanded={isLinkMenuOpen}
              aria-label={t('Add to Journey', '添加到旅程')}
            >
              {linked.length === 0 ? (
                <>
                  <Link2 size={14} strokeWidth={2} aria-hidden />
                  {t('Add to Journey', '添加到旅程')}
                </>
              ) : (
                <Plus size={14} strokeWidth={2} aria-hidden />
              )}
            </button>

            {isLinkMenuOpen ? (
              <div className="link-menu__panel">
                {linkable.length === 0 ? (
                  <p className="link-menu__empty">
                    {journeys.data?.length
                      ? t('Already in every Journey.', '已关联所有旅程。')
                      : t('No Journeys yet.', '还没有旅程。')}
                  </p>
                ) : (
                  linkable.map((journey) => (
                    <button
                      key={journey.id}
                      type="button"
                      className="link-menu__item"
                      onClick={() => void link(journey.id)}
                    >
                      <JourneyIcon name={journey.icon} size={14} />
                      {journey.title}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>

        <span className="editor__bar-spacer" />

        <button
          type="button"
          className="button button--danger"
          onClick={() => void remove()}
          title={t('Delete note', '删除笔记')}
        >
          <Trash2 size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {actionError ? (
        <p className="error-banner" style={{ margin: 'var(--space-3) var(--space-6)' }}>
          {actionError}
        </p>
      ) : null}
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const { t } = useI18n();
  if (state === 'error') {
    return (
      <button
        type="button"
        className="editor__save-state editor__save-state--error"
        onClick={onRetry}
        title={t('Retry save', '重试保存')}
      >
        <CircleAlert size={13} strokeWidth={2} aria-hidden />
        {t('Not saved — retry', '未保存 — 重试')}
      </button>
    );
  }

  const content: Record<Exclude<SaveState, 'error'>, React.ReactNode> = {
    saved: (
      <>
        <Check size={13} strokeWidth={2.5} aria-hidden />
        {t('Saved', '已保存')}
      </>
    ),
    saving: (
      <>
        <Loader2 size={13} strokeWidth={2} aria-hidden />
        {t('Saving…', '保存中…')}
      </>
    ),
    unsaved: <>{t('Unsaved changes', '有未保存的更改')}</>,
  };

  return (
    <span className="editor__save-state" aria-live="polite">
      {content[state]}
    </span>
  );
}

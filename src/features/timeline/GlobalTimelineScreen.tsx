/**
 * Global timeline: the same event records as any journey timeline, unscoped
 * (DECISIONS.md D-005). Each entry carries its journey badges here, because
 * context is what distinguishes this view.
 *
 * Newest-first by default: the global view is usually "what has been happening
 * lately", whereas a journey reads as a story from its beginning.
 */

import { useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpWideNarrow, Plus } from 'lucide-react';

import { useRepoQuery } from '@/data/RepositoryContext';
import type { TimelineEntry, TimelineOrder } from '@/domain/types';
import { useAppStore } from '@/app/store';
import { useI18n } from '@/lib/i18n';
import { RecordEventDialog } from './RecordEventDialog';
import { EditEventDialog } from './EditEventDialog';
import { MarkHappenedDialog } from './MarkHappenedDialog';
import { TimelineView } from './TimelineView';
import '@/features/journeys/Journey.css';
import './Timeline.css';

export function GlobalTimelineScreen() {
  const { t } = useI18n();
  const openNote = useAppStore((state) => state.openNote);
  const [order, setOrder] = useState<TimelineOrder>('newest');
  const [isRecordingEvent, setRecordingEvent] = useState(false);
  const [editing, setEditing] = useState<TimelineEntry | null>(null);
  const [confirming, setConfirming] = useState<TimelineEntry | null>(null);

  const entries = useRepoQuery((repository) => repository.listTimeline({ order }), [order]);
  const list = entries.data ?? [];

  const openEntry = (entry: TimelineEntry) => {
    if (entry.sourceType === 'note' && entry.sourceId) openNote(entry.sourceId);
  };

  return (
    <>
      <div className="timeline-screen">
        <div className="timeline-screen__head">
          <h1 className="timeline-screen__title">{t('Timeline', '时间线')}</h1>
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
                ? t('Newest first', '最新优先')
                : t('Oldest first', '最早优先')}
            </button>
            <button
              type="button"
              className="button button--pen"
              onClick={() => setRecordingEvent(true)}
            >
              <Plus size={14} strokeWidth={2} aria-hidden />
              {t('Record event', '记录事件')}
            </button>
          </div>
        </div>

        <TimelineView
          entries={list}
          showJourneys
          onOpenEntry={openEntry}
          onEditEntry={setEditing}
          onMarkEntryHappened={setConfirming}
          emptyState={
            <div className="empty-state">
              <div className="empty-state__title">
                {t('Nothing recorded yet', '还没有记录')}
              </div>
              <p>
                {t(
                  'Notes you log to a Journey, tasks you complete, and events you record will all appear here in the order they happened.',
                  '归入旅程的笔记、完成的任务和记录的事件，都会按发生时间显示在这里。',
                )}
              </p>
            </div>
          }
        />
      </div>

      {isRecordingEvent ? <RecordEventDialog onClose={() => setRecordingEvent(false)} /> : null}
      {editing ? <EditEventDialog entry={editing} onClose={() => setEditing(null)} /> : null}
      {confirming ? (
        <MarkHappenedDialog entry={confirming} onClose={() => setConfirming(null)} />
      ) : null}
    </>
  );
}

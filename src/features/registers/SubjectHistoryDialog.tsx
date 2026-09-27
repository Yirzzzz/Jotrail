/**
 * One tracked thing's own history.
 *
 * The payoff of putting `subject_id` on the *event* rather than in a separate
 * table: this is the same `TimelineView` the Journey screen renders, handed a
 * narrower slice. No second renderer, no second query, and a thing's history can
 * never drift from the Journey's — it is literally the same rows.
 *
 * Ascending, unlike the feed it came from. A single thing reads as a story
 * (投稿 → 拒稿 → 投稿 → 大修), which is D-015's original argument for the Journey
 * timeline — true of one submission even where it was false of the whole Journey.
 */

import { Modal } from '@/components/Modal';
import { TimelineView } from '@/features/timeline/TimelineView';
import type { TimelineEntry } from '@/domain/types';
import { useI18n } from '@/lib/i18n';

interface Props {
  title: string;
  entries: TimelineEntry[];
  onOpenEntry: (entry: TimelineEntry) => void;
  onEditEntry: (entry: TimelineEntry) => void;
  onMarkEntryHappened: (entry: TimelineEntry) => void;
  onClose: () => void;
}

export function SubjectHistoryDialog({
  title,
  entries,
  onOpenEntry,
  onEditEntry,
  onMarkEntryHappened,
  onClose,
}: Props) {
  const { t } = useI18n();
  return (
    <Modal
      title={title}
      description={
        entries.length === 0
          ? t('Nothing recorded about this yet.', '还没有相关记录。')
          : t(
              `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}, oldest first.`,
              `${entries.length} 条记录，最早在前。`,
            )
      }
      onClose={onClose}
    >
      <div className="modal__body">
        <TimelineView
          entries={entries}
          onOpenEntry={onOpenEntry}
          onEditEntry={onEditEntry}
          onMarkEntryHappened={onMarkEntryHappened}
          emptyState={
            <div className="empty-state">
              <div className="empty-state__title">
                {t('Nothing recorded yet', '还没有记录')}
              </div>
              <p>
                {t(
                  'Record an event and file it under this, and its history will build up here.',
                  '记录一个事件并关联到此项，它的历史就会在这里慢慢积累。',
                )}
              </p>
            </div>
          }
        />
      </div>

      <footer className="modal__footer">
        <button type="button" className="button" onClick={onClose}>
          {t('Close', '关闭')}
        </button>
      </footer>
    </Modal>
  );
}

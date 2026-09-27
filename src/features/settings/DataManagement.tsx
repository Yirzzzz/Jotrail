import { useEffect, useRef, useState } from 'react';
import { ArchiveRestore, Download, FolderOpen, RotateCcw, Save } from 'lucide-react';

import { Modal } from '@/components/Modal';
import { useAppStore } from '@/app/store';
import { beginAppDataOperation } from '@/app/dataOperationGuard';
import { useInvalidate, useRepoQuery, useRepository } from '@/data/RepositoryContext';
import type { BackupInfo } from '@/domain/types';
import { formatFullDate, formatTimeOfDay } from '@/lib/datetime';
import { flushPendingNoteSaves } from '@/features/notes/pendingNoteSaves';
import { useI18n } from '@/lib/i18n';

function backupDate(backup: BackupInfo): string {
  return `${formatFullDate(backup.createdAt)} · ${formatTimeOfDay(backup.createdAt)}`;
}

export function DataManagement({ supportsFiles }: { supportsFiles: boolean }) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();
  const openNote = useAppStore((state) => state.openNote);
  const [showTrash, setShowTrash] = useState(false);
  const [selected, setSelected] = useState<BackupInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<[string, string] | null>(null);
  const backups = useRepoQuery(
    (repo) => (supportsFiles ? repo.listBackups() : Promise.resolve([])),
    [supportsFiles],
  );
  const deleted = useRepoQuery(
    (repo) => (showTrash ? repo.listDeletedNotes() : Promise.resolve([])),
    [showTrash],
  );

  // The busy dialog blocks pointer navigation; also prevent global shortcuts
  // from opening a new editor while a restore is replacing the notebook.
  useEffect(() => {
    if (!busy) return;
    const blockShortcuts = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && ['n', 'k'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('keydown', blockShortcuts, true);
    return () => document.removeEventListener('keydown', blockShortcuts, true);
  }, [busy]);

  const run = async (label: string, action: () => Promise<void>, flush = true) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const endOperation = beginAppDataOperation();
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      if (flush) await flushPendingNoteSaves();
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      // A failed restore may still have produced its safety backup.
      invalidate();
      endOperation();
      busyRef.current = false;
      setBusy(null);
    }
  };

  return (
    <>
      <section className="settings__section">
        <h2 className="section-label settings__section-title">
          {t('Backup & export', '备份与导出')}
        </h2>
        <p className="settings__help">
          {t(
            'Save a complete snapshot, or take your notes with you as Markdown. Exports also include Journey links, tasks, events and states.',
            '保存完整快照，或将笔记导出为 Markdown。导出也包含旅程关联、任务、事件和状态。',
          )}
        </p>
        {!supportsFiles ? (
          <p className="settings__help">
            {t(
              'File backups and exports are available in the desktop app.',
              '文件备份和导出功能可在桌面应用中使用。',
            )}
          </p>
        ) : (
          <>
            <div className="settings__actions">
              <button
                type="button"
                className="button button--primary"
                disabled={Boolean(busy)}
                onClick={() =>
                  void run(t('Creating backup…', '正在创建备份…'), async () => {
                    const result = await repository.createBackup();
                    setMessage([`Backup saved: ${result.path}`, `备份已保存：${result.path}`]);
                  })
                }
              >
                <Save size={14} aria-hidden />
                {t('Back up now', '立即备份')}
              </button>
              <button
                type="button"
                className="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  void run(t('Exporting notebook…', '正在导出笔记本…'), async () => {
                    const result = await repository.exportNotebook();
                    setMessage([
                      `Exported ${result.noteCount} notes: ${result.path}`,
                      `已导出 ${result.noteCount} 篇笔记：${result.path}`,
                    ]);
                  })
                }
              >
                <Download size={14} aria-hidden />
                {t('Export notebook', '导出笔记本')}
              </button>
            </div>
            <div className="settings__actions">
              {(['backups', 'exports'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run(
                      t('Opening folder…', '正在打开文件夹…'),
                      () => repository.openDataFolder(kind),
                      false,
                    )
                  }
                >
                  <FolderOpen size={14} aria-hidden />
                  {t(
                    `Open ${kind} folder`,
                    kind === 'backups' ? '打开备份文件夹' : '打开导出文件夹',
                  )}
                </button>
              ))}
            </div>
            <p className="settings__help">
              {t(
                'Files stay on this computer. Copy a backup or export to another disk to protect against device loss.',
                '文件保存在这台设备上。建议将备份或导出文件复制到其他磁盘，以防设备丢失。',
              )}
            </p>
            {backups.error ? (
              <p className="error-banner" role="alert">
                {backups.error}
              </p>
            ) : null}
            {backups.isLoading ? (
              <p className="settings__help">{t('Loading backups…', '正在加载备份…')}</p>
            ) : null}
            {backups.data?.length ? (
              <ul className="settings__records" aria-label={t('Saved backups', '已保存的备份')}>
                {backups.data.map((backup) => (
                  <li key={backup.id}>
                    <div>
                      <span>{backupDate(backup)}</span>
                      <small>
                        {backup.beforeRestore
                          ? t('Before restore', '恢复前的备份')
                          : t('Manual backup', '手动备份')}{' '}
                        · {Math.max(1, Math.round(backup.sizeBytes / 1024))} KB
                      </small>
                    </div>
                    <button
                      type="button"
                      className="button"
                      disabled={Boolean(busy)}
                      onClick={() => setSelected(backup)}
                      aria-label={t(
                        `Restore backup from ${backupDate(backup)}`,
                        `恢复 ${backupDate(backup)} 的备份`,
                      )}
                    >
                      <RotateCcw size={14} aria-hidden />
                      {t('Restore', '恢复')}
                    </button>
                  </li>
                ))}
              </ul>
            ) : !backups.isLoading && !backups.error ? (
              <p className="settings__help">{t('No backups yet.', '还没有备份。')}</p>
            ) : null}
          </>
        )}
        {message ? (
          <p className="settings__result selectable" role="status">
            {t(...message)}
          </p>
        ) : null}
        {error ? (
          <p className="error-banner" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="settings__section">
        <button
          type="button"
          className="disclosure"
          aria-expanded={showTrash}
          onClick={() => setShowTrash(!showTrash)}
        >
          <ArchiveRestore size={15} aria-hidden />
          {t('Recently deleted notes', '最近删除的笔记')}
        </button>
        {showTrash ? (
          <>
            <p className="settings__help">
              {t(
                'Restore the original text and its Journey links. Removed timeline entries are not recreated. Notes stay here until you restore them.',
                '恢复原文及其旅程关联，不会重新创建已移除的时间线记录。笔记会一直保留在这里，直到你恢复它们。',
              )}
            </p>
            {deleted.error ? (
              <p className="error-banner" role="alert">
                {deleted.error}
              </p>
            ) : null}
            {deleted.isLoading ? (
              <p className="settings__help">
                {t('Loading deleted notes…', '正在加载已删除的笔记…')}
              </p>
            ) : null}
            {deleted.data?.length ? (
              <ul className="settings__records" aria-label={t('Deleted notes', '已删除的笔记')}>
                {deleted.data.map((note) => (
                  <li key={note.id}>
                    <div>
                      <span>{note.title}</span>
                      <small>
                        {t(
                          `Deleted ${formatFullDate(note.deletedAt)}`,
                          `删除于 ${formatFullDate(note.deletedAt)}`,
                        )}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="button"
                      disabled={Boolean(busy)}
                      aria-label={t(`Restore ${note.title}`, `恢复${note.title}`)}
                      onClick={() =>
                        void run(t('Restoring note…', '正在恢复笔记…'), async () => {
                          const restored = await repository.restoreNote(note.id);
                          openNote(restored.id);
                        })
                      }
                    >
                      {t('Restore & open', '恢复并打开')}
                    </button>
                  </li>
                ))}
              </ul>
            ) : !deleted.isLoading && !deleted.error ? (
              <p className="settings__help">{t('No deleted notes.', '没有已删除的笔记。')}</p>
            ) : null}
          </>
        ) : null}
      </section>

      {selected && !busy ? (
        <Modal
          title={t('Restore this backup?', '恢复这份备份？')}
          onClose={() => setSelected(null)}
        >
          <div className="modal__body">
            <p>
              {t(
                `This replaces the entire notebook with the snapshot from ${backupDate(selected)}. Changes made after that snapshot will no longer be in the active notebook.`,
                `这将用 ${backupDate(selected)} 的快照替换整个笔记本。快照之后的更改将不再出现在当前笔记本中。`,
              )}
            </p>
            <p className="settings__help">
              {t(
                'Your current notebook will be backed up first, so you can return to it. If saving or validation fails, restoration will not start.',
                '恢复前会先备份当前笔记本，方便你还原。如果保存或校验失败，将不会开始恢复。',
              )}
            </p>
          </div>
          <footer className="modal__footer">
            <button type="button" className="button" onClick={() => setSelected(null)}>
              {t('Keep current notebook', '保留当前笔记本')}
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                const backup = selected;
                setSelected(null);
                void run(t('Restoring backup…', '正在恢复备份…'), async () => {
                  const safety = await repository.restoreBackup(backup.id);
                  setMessage([
                    `Notebook restored. Your previous notebook was saved to: ${safety.path}`,
                    `笔记本已恢复。之前的笔记本已保存至：${safety.path}`,
                  ]);
                });
              }}
            >
              {t('Restore backup', '恢复备份')}
            </button>
          </footer>
        </Modal>
      ) : null}
      {busy ? (
        <Modal title={busy} onClose={() => {}}>
          <div className="modal__body">
            <p role="status">
              {t(
                'Please keep the app open while your data is being saved.',
                '正在保存数据，请保持应用开启。',
              )}
            </p>
          </div>
          <footer className="modal__footer">
            <button type="button" className="button" aria-disabled="true">
              {t('Working…', '处理中…')}
            </button>
          </footer>
        </Modal>
      ) : null}
    </>
  );
}

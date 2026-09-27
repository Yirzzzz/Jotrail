import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { Modal } from '@/components/Modal';
import { isTauriAvailable } from '@/data/tauriRepository';
import { flushPendingNoteSaves } from '@/features/notes/pendingNoteSaves';
import { translate, useI18n } from '@/lib/i18n';
import { isAppDataOperationPending } from './dataOperationGuard';

/** Protect normal window-close requests; forced termination cannot be intercepted. */
export function DesktopCloseGuard() {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closing = useRef(false);

  const close = useCallback(async () => {
    // Settings already shows its own Working dialog. Keep that visible instead
    // of stacking another focus-trapping modal over an operation in progress.
    if (closing.current || isAppDataOperationPending()) return;
    closing.current = true;
    setSaving(true);
    setError(null);
    try {
      await flushPendingNoteSaves();
      if (isAppDataOperationPending()) return;
      // destroy bypasses close-requested, so this does not recurse.
      await getCurrentWindow().destroy();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      closing.current = false;
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    if (!isTauriAvailable()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested((event) => {
        event.preventDefault();
        if (!disposed) return close();
      })
      .then((remove) => {
        if (disposed) remove();
        else unlisten = remove;
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          setError(
            translate(
              `Could not prepare safe closing: ${String(cause)}`,
              `无法准备安全关闭：${String(cause)}`,
            ),
          );
        }
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [close]);

  useEffect(() => {
    if (!saving && !error) return;
    const blockShortcuts = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && ['n', 'k'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('keydown', blockShortcuts, true);
    return () => document.removeEventListener('keydown', blockShortcuts, true);
  }, [saving, error]);

  if (!saving && !error) return null;

  return (
    <Modal
      title={
        saving
          ? t('Saving before closing…', '正在保存，即将关闭…')
          : t('Journey Notes is still open', 'Journey Notes 尚未关闭')
      }
      onClose={() => {
        if (!closing.current) setError(null);
      }}
    >
      <div className="modal__body">
        {saving ? (
          <p role="status">
            {t(
              'Finishing your note saves before closing this window.',
              '正在完成笔记保存，随后关闭此窗口。',
            )}
          </p>
        ) : (
          <>
            <p>
              {t(
                'Your note could not be saved or the window could not close. You can keep editing or retry.',
                '笔记未能保存，或窗口无法关闭。你可以继续编辑或重试。',
              )}
            </p>
            <p className="error-banner" role="alert">
              {error}
            </p>
          </>
        )}
      </div>
      {saving ? (
        <footer className="modal__footer">
          <button type="button" className="button" aria-disabled="true">
            {t('Saving…', '保存中…')}
          </button>
        </footer>
      ) : (
        <footer className="modal__footer">
          <button type="button" className="button" onClick={() => setError(null)}>
            {t('Keep editing', '继续编辑')}
          </button>
          <button type="button" className="button button--primary" onClick={() => void close()}>
            {t('Retry save & close', '重试保存并关闭')}
          </button>
        </footer>
      )}
    </Modal>
  );
}

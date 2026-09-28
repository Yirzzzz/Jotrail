/**
 * Start tracking a new kind of thing.
 *
 * Two fields: what kind of thing, and the first one. **No field builder and no
 * stage vocabulary** — that would be the schema editor `AGENTS.md` §12 forbids,
 * and it would make a register a form before it was ever useful. Stages
 * accumulate from whatever gets typed while recording.
 *
 * The name is the user's own word — 岗位, 论文, 电影 — so it is stored and shown
 * exactly as written. Unlike the four fixed tabs, a register label is content
 * rather than chrome (D-019).
 */

import { useState } from 'react';

import { Modal } from '@/components/Modal';
import { useInvalidate, useRepository } from '@/data/RepositoryContext';
import { useI18n } from '@/lib/i18n';

interface Props {
  journeyId: string;
  /** Called with the new kind, so the caller can open its tab immediately. */
  onCreated: (kind: string) => void;
  onClose: () => void;
}

export function NewRegisterDialog({ journeyId, onCreated, onClose }: Props) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();

  const [kind, setKind] = useState('');
  const [first, setFirst] = useState('');
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * This short form creates a register through its first item; it does not set
   * up states. Unlike New Journey, which may persist an empty register through
   * its state-set binding, submitting this form needs an item to save.
   */
  const canSubmit = kind.trim().length > 0 && first.trim().length > 0 && !isSaving;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);
    try {
      const trimmedKind = kind.trim();
      // Creating the first thing is what brings the register into being.
      await repository.createSubject({
        journeyId,
        kind: trimmedKind,
        title: first.trim(),
      });
      invalidate();
      onCreated(trimmedKind);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  return (
    <Modal title={t('Track a new kind of thing', '创建新的清单')} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal__body">
          {error ? <p className="error-banner">{error}</p> : null}

          <div className="field">
            <label className="field__label" htmlFor="register-kind">
              {t('What kind of thing', '内容类型')}
            </label>
            <input
              id="register-kind"
              className="input"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="register-first">
              {t('First one', '第一项')}
            </label>
            <input
              id="register-first"
              className="input"
              value={first}
              onChange={(event) => setFirst(event.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        <footer className="modal__footer">
          {/* Name what is missing rather than leaving a dead grey button. */}
          {!isSaving && !kind.trim() ? (
            <span className="modal__footer-hint">
              {t('Name the kind of thing', '请填写内容类型')}
            </span>
          ) : !isSaving && !first.trim() ? (
            <span className="modal__footer-hint">
              {t('Add the first one to create the register', '添加第一项以创建清单')}
            </span>
          ) : null}
          <button type="button" className="button" onClick={onClose} data-autofocus="false">
            {t('Cancel', '取消')}
          </button>
          <button type="submit" className="button button--primary" disabled={!canSubmit}>
            {isSaving ? t('Creating…', '正在创建…') : t('Create', '创建')}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

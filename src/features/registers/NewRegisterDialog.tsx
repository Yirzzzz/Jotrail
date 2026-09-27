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
   * Both fields are required, and that is a consequence of the schema rather than
   * a preference: a `kind` exists only as a property of the things that carry it,
   * so `subject_kinds` reads distinct kinds off the rows themselves. A register
   * with nothing in it has nowhere to be stored, and submitting one would appear
   * to succeed while creating no tab at all.
   *
   * The alternative was a `registers` table whose only column is a name — a table
   * earning nothing, and a second place for the same fact to live.
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
    <Modal
      title={t('Track a new kind of thing', '创建新的清单')}
      description={t(
        'Papers, positions, films — whatever this Journey accumulates.',
        '论文、岗位、电影——记录旅程中积累的任何内容。',
      )}
      onClose={onClose}
    >
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
              placeholder={t('Papers · Roles · Films', '论文 · 岗位 · 电影')}
              autoComplete="off"
            />
            <span className="field__hint">
              {t(
                'Becomes a tab on this Journey. Your own word — it is shown as you write it.',
                '它会成为此旅程的一个标签页，使用你自己的名称并原样显示。',
              )}
            </span>
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
              placeholder={t(
                '2027 ICLR · ByteDance · Dune: Part Two',
                '2027 ICLR · ByteDance · 沙丘 2',
              )}
              autoComplete="off"
            />
            <span className="field__hint">
              {t(
                'No stages to define first. Whatever you type when recording becomes this register’s own vocabulary.',
                '不必预先定义阶段。记录时写下的阶段会成为这个清单自己的用语。',
              )}
            </span>
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

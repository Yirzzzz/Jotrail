/**
 * Choose the stages a register uses: reuse a set already defined, or define a new
 * one.
 *
 * This dialog is where the reuse the feature exists for actually happens. Sets
 * are global, so next year's 秋招 opens this, sees 「面试流程」with 投递 / 一面 /
 * 二面 / offer and their colours, and picks it — nothing retyped.
 *
 * Every existing set is offered regardless of which register defined it. A set is
 * a vocabulary, not a property of one Journey, and guessing which ones are
 * "relevant" would need the app to know what a paper is.
 */

import { useState } from 'react';
import { Layers, Plus } from 'lucide-react';

import { Modal } from '@/components/Modal';
import { StageChip } from '@/components/StageChip';
import { useInvalidate, useRepoQuery, useRepository } from '@/data/RepositoryContext';
import type { StageSetWithOptions } from '@/domain/types';
import { useI18n } from '@/lib/i18n';
import { StageSetDialog } from './StageSetDialog';
import './StageSet.css';

interface Props {
  journeyId: string;
  kind: string;
  /** The set currently attached, so it can be named and offered for editing. */
  current: StageSetWithOptions | null;
  onClose: () => void;
}

export function StageSetPicker({ journeyId, kind, current, onClose }: Props) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();

  const sets = useRepoQuery((repo) => repo.listStageSets(), []);
  const [isDefining, setDefining] = useState(false);
  const [editing, setEditing] = useState<StageSetWithOptions | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isDefining) {
    return (
      <StageSetDialog
        attachTo={{ journeyId, kind }}
        onSaved={onClose}
        onClose={() => setDefining(false)}
      />
    );
  }

  if (editing) {
    return (
      <StageSetDialog existing={editing} onSaved={onClose} onClose={() => setEditing(null)} />
    );
  }

  const attach = async (set: StageSetWithOptions) => {
    setError(null);
    try {
      await repository.attachStageSet(journeyId, kind, set.id);
      invalidate();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const detach = async () => {
    setError(null);
    try {
      await repository.detachStageSet(journeyId, kind);
      invalidate();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const available = sets.data ?? [];

  return (
    <Modal title={t(`Stages for ${kind}`, `${kind}的阶段`)} onClose={onClose}>
      <div className="modal__body">
        {error ? <p className="error-banner">{error}</p> : null}

        {current ? (
          <div className="field">
            <span className="field__label">{t('Currently using', '当前使用')}</span>
            <div className="stage-editor__preview">
              {current.options.map((option) => (
                <StageChip key={option.id} label={option.label} tone={option.tone} />
              ))}
            </div>
            <span className="field__hint">
              {current.name}
              {current.registerCount > 1
                ? t(
                    ` — edits also affect ${current.registerCount - 1} other register${
                      current.registerCount - 1 === 1 ? '' : 's'
                    }.`,
                    `——编辑也会影响另外 ${current.registerCount - 1} 个清单。`,
                  )
                : '.'}
            </span>
          </div>
        ) : null}

        <div className="field">
          <span className="field__label">
            {current
              ? t('Use a different set', '使用其他阶段集')
              : t('Available sets', '可用阶段集')}
          </span>

          {available.length === 0 ? (
            <span className="field__hint">{t('No stage sets yet.', '暂无阶段集。')}</span>
          ) : (
            <ul className="stage-set-picker">
              {available
                .filter((set) => set.id !== current?.id)
                .map((set) => (
                  <li key={set.id}>
                    <button
                      type="button"
                      className="stage-set-option"
                      onClick={() => attach(set)}
                    >
                      <span>
                        <span className="stage-set-option__name">{set.name}</span>
                        <span className="stage-set-option__stages">
                          {set.options.map((option) => (
                            <StageChip
                              key={option.id}
                              label={option.label}
                              tone={option.tone}
                            />
                          ))}
                        </span>
                      </span>
                      {/*
                        How many registers already use it — the honest signal that
                        this is shared, and a warning that editing it is not local.
                      */}
                      <span className="stage-set-option__reuse">
                        {set.registerCount === 0
                          ? t('unused', '尚未使用')
                          : t(
                              `in ${set.registerCount} register${set.registerCount === 1 ? '' : 's'}`,
                              `${set.registerCount} 个清单在使用`,
                            )}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      <footer className="modal__footer">
        {current ? (
          <button type="button" className="button" onClick={detach} data-autofocus="false">
            {t('Stop using stages', '停用阶段集')}
          </button>
        ) : null}
        {current ? (
          <button
            type="button"
            className="button"
            onClick={() => setEditing(current)}
            data-autofocus="false"
          >
            <Layers size={13} strokeWidth={2} aria-hidden />
            {t(`Edit ${current.name}`, `编辑 ${current.name}`)}
          </button>
        ) : null}
        <button type="button" className="button" onClick={onClose} data-autofocus="false">
          {t('Cancel', '取消')}
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => setDefining(true)}
        >
          <Plus size={13} strokeWidth={2} aria-hidden />
          {t('Define a new set', '创建阶段集')}
        </button>
      </footer>
    </Modal>
  );
}

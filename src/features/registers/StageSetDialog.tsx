/**
 * Define the stages a register uses: a name, then a list of stages each with a
 * tone.
 *
 * This is the editor for the thing the user asked for: 论文 uses 投稿 / 大修 /
 * 接收, 岗位 uses 投递 / 一面 / 二面 / offer, and both are the same component with
 * different words. Nothing here knows what a paper is.
 *
 * Written with slashes rather than arrows on purpose — a set is a vocabulary, not
 * a pipeline.
 *
 * Three rules it holds to:
 *
 * - **No colour picker.** Six named tones, each resolving to a token. The user
 *   picks a meaning; `tokens.css` owns the hue. A free hex field would put a
 *   hard-coded colour in the database with no guarantee of contrast (AGENTS.md §7).
 * - **No transitions and no ordering.** A stage says what something *is now*, not
 *   where it sits in a sequence, so the list is a set of labels and nothing more.
 *   There are no reorder controls, because moving a row would change nothing the
 *   user can see: the register groups by recency of movement and the Overview by
 *   count.
 * - **No built-in templates.** The user builds their own vocabulary; shipping
 *   「面试流程」as a preset would bake a job-hunt tracker into the product
 *   (AGENTS.md §12).
 */

import { useState } from 'react';

import { Modal } from '@/components/Modal';
import { useInvalidate, useRepository } from '@/data/RepositoryContext';
import type { StageSetWithOptions } from '@/domain/types';
import { useI18n } from '@/lib/i18n';
import type { DraftStage } from './StageListEditor';
import {
  StageListEditor,
  blankStage,
  namedStages,
  stageOptionsFrom,
  stagesFromOptions,
} from './StageListEditor';
import './StageSet.css';
import { OptionReplacements, useOptionReplacements } from './OptionReplacements';

interface Props {
  /** Editing an existing set, or `null` to define a new one. */
  existing?: StageSetWithOptions | null;
  /**
   * Where to attach the set once saved. Optional: a set can be defined from
   * Settings without a register in mind.
   */
  attachTo?: { journeyId: string; kind: string };
  onSaved: (set: StageSetWithOptions) => void;
  onClose: () => void;
  onChooseSet?: () => void;
}

export function StageSetDialog({
  existing = null,
  attachTo,
  onSaved,
  onClose,
  onChooseSet,
}: Props) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();

  const [name, setName] = useState(existing?.name ?? '');
  const [stages, setStages] = useState<DraftStage[]>(() =>
    // One empty row when new, so the shape of the thing is visible immediately.
    existing ? stagesFromOptions(existing.options) : [blankStage()],
  );
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const named = namedStages(stages);
  const replacements = useOptionReplacements(existing?.options ?? [], stages);
  const canSubmit =
    name.trim().length > 0 && named.length > 0 && replacements.complete && !isSaving;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);
    try {
      const options = stageOptionsFrom(stages);

      const saved = existing
        ? await repository.updateStageSet(existing.id, {
            name: name.trim(),
            options,
            replacements: replacements.replacements,
          })
        : await repository.createStageSet({ name: name.trim(), options });

      if (attachTo) {
        await repository.attachStageSet(attachTo.journeyId, attachTo.kind, saved.id);
      }
      invalidate();
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={existing ? t('Edit category', '编辑分类') : t('Add category', '新增分类')}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="modal__body">
          {error ? <p className="error-banner">{error}</p> : null}
          {existing && existing.registerCount > 1 ? (
            <p className="field__hint">
              {t(
                `Changes apply to all ${existing.registerCount} registers using this set.`,
                `修改会应用到使用此分类的全部 ${existing.registerCount} 个清单。`,
              )}
            </p>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="stage-set-name">
              {t('Name', '名称')}
            </label>
            <input
              id="stage-set-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="stage-set-mode">
              {t('Selection', '选择方式')}
            </label>
            <select id="stage-set-mode" className="input" value="single" disabled>
              <option value="single">{t('Single choice', '单选')}</option>
            </select>
          </div>

          <div className="field">
            <span className="field__label">{t('Options', '选项')}</span>
            <StageListEditor
              stages={stages}
              onChange={setStages}
              labelPrefix={t('Option', '选项')}
              addLabel={t('Add option', '添加选项')}
              showPreview={false}
            />
          </div>
          <OptionReplacements field={replacements} />
        </div>

        <footer className="modal__footer">
          {!replacements.complete ? (
            <span className="modal__footer-hint">
              {t('Choose replacements for removed options', '请为删除的选项选择替代项')}
            </span>
          ) : !isSaving && !name.trim() ? (
            <span className="modal__footer-hint">
              {t('Name the category', '请填写分类名称')}
            </span>
          ) : !isSaving && named.length === 0 ? (
            <span className="modal__footer-hint">
              {t('Add at least one option', '请至少添加一个选项')}
            </span>
          ) : null}
          {onChooseSet ? (
            <button
              type="button"
              className="button"
              onClick={onChooseSet}
              disabled={isSaving}
              data-autofocus="false"
            >
              {t('Change set', '更换分类集')}
            </button>
          ) : null}
          <button type="button" className="button" onClick={onClose} data-autofocus="false">
            {t('Cancel', '取消')}
          </button>
          <button type="submit" className="button button--primary" disabled={!canSubmit}>
            {isSaving
              ? t('Saving…', '正在保存…')
              : existing
                ? t('Save', '保存')
                : t('Create', '创建')}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

import { useState } from 'react';

import { Modal } from '@/components/Modal';
import { useInvalidate, useRepository } from '@/data/RepositoryContext';
import type { StateCategory } from '@/domain/types';
import { useI18n } from '@/lib/i18n';
import {
  StageListEditor,
  blankStage,
  namedStages,
  stageOptionsFrom,
  stagesFromOptions,
} from './StageListEditor';
import { OptionReplacements, useOptionReplacements } from './OptionReplacements';

export function StateCategoryDialog({
  journeyId,
  existing,
  onClose,
  onSaved,
}: {
  journeyId: string;
  existing?: StateCategory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();
  const [name, setName] = useState(existing?.name ?? '');
  const [mode, setMode] = useState<'single' | 'multiple'>(existing?.selectionMode ?? 'single');
  const [stages, setStages] = useState(() =>
    existing ? stagesFromOptions(existing.options) : [blankStage()],
  );
  const replacements = useOptionReplacements(existing?.options ?? [], stages);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim() && namedStages(stages).length > 0 && replacements.complete;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const options = stageOptionsFrom(stages);
      if (existing) {
        await repository.updateStateCategory(existing.id, {
          name: name.trim(),
          options,
          replacements: replacements.replacements,
        });
      } else {
        await repository.createStateCategory({
          journeyId,
          name: name.trim(),
          selectionMode: mode,
          options,
        });
      }
      invalidate();
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={existing ? t('Edit category', '编辑分类') : t('Add category', '新增分类')}
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="modal__body">
          {error ? (
            <p className="error-banner" role="alert">
              {error}
            </p>
          ) : null}
          <div className="field">
            <label className="field__label" htmlFor="category-name">
              {t('Name', '名称')}
            </label>
            <input
              id="category-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="category-mode">
              {t('Selection', '选择方式')}
            </label>
            <select
              id="category-mode"
              className="input"
              value={mode}
              onChange={(event) =>
                setMode(event.target.value === 'multiple' ? 'multiple' : 'single')
              }
              disabled={Boolean(existing)}
            >
              <option value="single">{t('Single choice', '单选')}</option>
              <option value="multiple">{t('Multiple choices', '多选')}</option>
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
          ) : null}
          <button
            type="button"
            className="button"
            onClick={onClose}
            disabled={saving}
            data-autofocus="false"
          >
            {t('Cancel', '取消')}
          </button>
          <button type="submit" className="button button--primary" disabled={!valid || saving}>
            {saving ? t('Saving…', '正在保存…') : t('Save', '保存')}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

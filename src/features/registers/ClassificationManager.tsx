import { useState } from 'react';
import { Plus } from 'lucide-react';

import { Modal } from '@/components/Modal';
import { StageChip } from '@/components/StageChip';
import { useRepoQuery } from '@/data/RepositoryContext';
import type { StateCategory, StageSetWithOptions } from '@/domain/types';
import { useI18n } from '@/lib/i18n';
import { StageSetDialog } from './StageSetDialog';
import { StageSetPicker } from './StageSetPicker';
import { StateCategoryDialog } from './StateCategoryDialog';
import './Classifications.css';

type Editing =
  | { type: 'new' }
  | { type: 'category'; category: StateCategory }
  | { type: 'legacy'; set: StageSetWithOptions; kind: string }
  | { type: 'picker'; kind: string; current: StageSetWithOptions | null };

export function ClassificationManager({
  journeyId,
  onClose,
}: {
  journeyId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<Editing | null>(null);
  const query = useRepoQuery(
    async (repo) => {
      const [categories, kinds] = await Promise.all([
        repo.listStateCategories(journeyId),
        repo.subjectKinds(journeyId),
      ]);
      const registers = await Promise.all(
        kinds.map(async ([kind]) => ({
          kind,
          set: await repo.stageSetForRegister(journeyId, kind),
        })),
      );
      return { journeyId, categories, registers };
    },
    [journeyId],
  );
  const current = query.data?.journeyId === journeyId ? query.data : undefined;
  const back = () => setEditing(null);

  if (editing?.type === 'new' || editing?.type === 'category') {
    return (
      <StateCategoryDialog
        journeyId={journeyId}
        existing={editing.type === 'category' ? editing.category : undefined}
        onClose={back}
        onSaved={back}
      />
    );
  }
  if (editing?.type === 'legacy') {
    return (
      <StageSetDialog
        existing={editing.set}
        onClose={back}
        onSaved={back}
        onChooseSet={() =>
          setEditing({ type: 'picker', kind: editing.kind, current: editing.set })
        }
      />
    );
  }
  if (editing?.type === 'picker') {
    return (
      <StageSetPicker
        journeyId={journeyId}
        kind={editing.kind}
        current={editing.current}
        onClose={back}
      />
    );
  }

  // One shared legacy set may describe more than one register in this Journey.
  const legacy = (current?.registers ?? []).filter(
    (register, index, all) =>
      !register.set || all.findIndex((item) => item.set?.id === register.set?.id) === index,
  );

  return (
    <Modal title={t('Manage categories', '管理分类')} onClose={onClose}>
      <div className="modal__body">
        {query.error ? (
          <p className="error-banner" role="alert">
            {query.error}
          </p>
        ) : null}
        {!current && !query.error ? (
          <p className="field__hint">{t('Loading…', '正在加载…')}</p>
        ) : null}
        <div className="classification-manager">
          {legacy.map(({ kind, set }) => (
            <div className="classification-manager__row" key={set?.id ?? kind}>
              <div className="classification-manager__content">
                <div className="classification-manager__name">{set?.name ?? kind}</div>
                <span className="field__hint">{t('Single choice', '单选')}</span>
                {set ? (
                  <div className="classification-manager__options">
                    {set.options.map((option) => (
                      <StageChip key={option.id} label={option.label} tone={option.tone} />
                    ))}
                  </div>
                ) : null}
              </div>
              {set ? (
                <button
                  type="button"
                  className="button"
                  aria-label={t(`Edit ${set.name}`, `编辑${set.name}`)}
                  onClick={() => setEditing({ type: 'legacy', set, kind })}
                >
                  {t('Edit', '编辑')}
                </button>
              ) : null}
              {!set ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => setEditing({ type: 'picker', kind, current: set })}
                >
                  {t('Set up', '设置')}
                </button>
              ) : null}
            </div>
          ))}
          {(current?.categories ?? []).map((category) => (
            <div className="classification-manager__row" key={category.id}>
              <div className="classification-manager__content">
                <div className="classification-manager__name">{category.name}</div>
                <span className="field__hint">
                  {category.selectionMode === 'multiple'
                    ? t('Multiple choices', '多选')
                    : t('Single choice', '单选')}
                </span>
                <div className="classification-manager__options">
                  {category.options.map((option) => (
                    <StageChip key={option.id} label={option.label} tone={option.tone} />
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="button"
                aria-label={t(`Edit ${category.name}`, `编辑${category.name}`)}
                onClick={() => setEditing({ type: 'category', category })}
              >
                {t('Edit', '编辑')}
              </button>
            </div>
          ))}
        </div>
        {current && legacy.length === 0 && current.categories.length === 0 ? (
          <p className="field__hint">{t('No categories yet.', '暂无分类。')}</p>
        ) : null}
      </div>
      <footer className="modal__footer">
        <button type="button" className="button" onClick={onClose} data-autofocus="false">
          {t('Close', '关闭')}
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => setEditing({ type: 'new' })}
        >
          <Plus size={13} aria-hidden />
          {t('Add category', '新增分类')}
        </button>
      </footer>
    </Modal>
  );
}

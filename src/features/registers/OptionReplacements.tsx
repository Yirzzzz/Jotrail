import { useState } from 'react';

import { useI18n } from '@/lib/i18n';
import type { DraftStage } from './StageListEditor';
import { namedStages } from './StageListEditor';
import './Classifications.css';

interface ExistingOption {
  id: string;
  label: string;
  usageCount: number;
}

/** Only used, removed options need an explicit destination. */
export function useOptionReplacements(existing: ExistingOption[], stages: DraftStage[]) {
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const retained = namedStages(stages).filter((stage): stage is DraftStage & { id: string } =>
    Boolean(stage.id),
  );
  const removed = existing.filter(
    (option) => option.usageCount > 0 && !retained.some((row) => row.id === option.id),
  );
  const replacements = removed.flatMap((option) => {
    const target = chosen[option.id];
    return target && retained.some((row) => row.id === target)
      ? [{ fromOptionId: option.id, toOptionId: target }]
      : [];
  });
  return {
    removed,
    retained,
    replacements,
    complete: replacements.length === removed.length,
    chosen,
    choose: (from: string, to: string) => setChosen((current) => ({ ...current, [from]: to })),
  };
}

export function OptionReplacements({
  field,
}: {
  field: ReturnType<typeof useOptionReplacements>;
}) {
  const { t } = useI18n();
  if (field.removed.length === 0) return null;
  return (
    <div className="classification-replacements">
      {field.removed.map((option) => (
        <div className="field" key={option.id}>
          <label className="field__label" htmlFor={`replace-${option.id}`}>
            {t(`Replace ${option.label} with`, `将「${option.label}」改为`)}
            <span className="field__hint">
              {t(`${option.usageCount} records`, `${option.usageCount} 条记录`)}
            </span>
          </label>
          <select
            id={`replace-${option.id}`}
            className="input"
            value={
              field.replacements.find((item) => item.fromOptionId === option.id)?.toOptionId ??
              ''
            }
            onChange={(event) => field.choose(option.id, event.target.value)}
          >
            <option value="">{t('Choose a replacement', '请选择替代选项')}</option>
            {field.retained.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.label.trim()}
              </option>
            ))}
          </select>
          {field.retained.length === 0 ? (
            <span className="field__hint">
              {t('Keep an existing option as the replacement.', '请保留一个已有选项作为替代。')}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

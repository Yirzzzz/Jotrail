import { useState, type ReactNode } from 'react';

import { StageChip } from '@/components/StageChip';
import { useRepoQuery } from '@/data/RepositoryContext';
import type {
  EventClassification,
  EventClassificationInput,
  StateCategory,
} from '@/domain/types';
import { useI18n } from '@/lib/i18n';
import './Classifications.css';

/** Only touched groups are sent: omission keeps history; [] deliberately clears. */
export function useClassificationField({
  journeyIds,
  initial = [],
  subjectId = '',
}: {
  journeyIds: string[];
  initial?: EventClassification[];
  subjectId?: string | null;
}) {
  const scope = JSON.stringify([...journeyIds].sort());
  const draftScope = `${scope}:${subjectId ?? ''}`;
  const [drafts, setDrafts] = useState<{ scope: string; values: Record<string, string[]> }>({
    scope: draftScope,
    values: {},
  });
  if (drafts.scope !== draftScope) setDrafts({ scope: draftScope, values: {} });
  const values = drafts.scope === draftScope ? drafts.values : {};
  const query = useRepoQuery(
    async (repo) => {
      const categories = (
        await Promise.all(journeyIds.map((id) => repo.listStateCategories(id)))
      ).flat();
      return { scope, categories };
    },
    [scope],
  );
  const categories = query.data?.scope === scope ? query.data.categories : [];
  const inputs: EventClassificationInput[] = Object.entries(values)
    .filter(([categoryId]) => categories.some((category) => category.id === categoryId))
    .map(([categoryId, optionIds]) => ({ categoryId, optionIds }));
  const selected = (category: StateCategory) =>
    values[category.id] ??
    initial
      .find((item) => item.categoryId === category.id)
      ?.options.map((option) => option.id) ??
    [];
  const setSelection = (categoryId: string, optionIds: string[]) => {
    setDrafts((current) => ({
      scope: draftScope,
      values: {
        ...(current.scope === draftScope ? current.values : {}),
        [categoryId]: optionIds,
      },
    }));
  };
  return {
    categories,
    inputs,
    selected,
    error: query.error,
    toggle: (category: StateCategory, optionId: string) => {
      const previous = selected(category);
      setSelection(
        category.id,
        previous.includes(optionId)
          ? previous.filter((id) => id !== optionId)
          : category.selectionMode === 'single'
            ? [optionId]
            : [...previous, optionId],
      );
    },
    clear: (categoryId: string) => setSelection(categoryId, []),
  };
}

export function ClassificationField({
  field,
  disabled = false,
}: {
  field: ReturnType<typeof useClassificationField>;
  disabled?: boolean;
}) {
  return (
    <>
      {field.error ? (
        <p className="error-banner" role="alert">
          {field.error}
        </p>
      ) : null}
      {field.categories.map((category) => (
        <ClassificationChoice
          key={category.id}
          name={category.name}
          selectionMode={category.selectionMode}
          options={category.options}
          selected={field.selected(category)}
          onToggle={(id) => field.toggle(category, id)}
          onClear={() => field.clear(category.id)}
          disabled={disabled}
        />
      ))}
    </>
  );
}

/** One named peer group, regardless of how its values are persisted. */
export function ClassificationChoice({
  name,
  selectionMode = 'single',
  options,
  selected,
  onToggle,
  onClear,
  disabled = false,
  children,
}: {
  name: string;
  selectionMode?: 'single' | 'multiple';
  options: { id: string; label: string; tone: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="field classification-field" disabled={disabled}>
      <legend className="field__label">
        {name}{' '}
        <span className="field__hint">
          {selectionMode === 'multiple' ? t('Multiple choices', '多选') : t('Optional', '选填')}
        </span>
      </legend>
      <div className="stage-picker" role="group" aria-label={name}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="stage-picker__option"
            aria-pressed={selected.includes(option.id)}
            onClick={() => onToggle(option.id)}
            data-autofocus="false"
          >
            <StageChip label={option.label} tone={option.tone} />
          </button>
        ))}
        {selected.length > 0 ? (
          <button
            type="button"
            className="button classification-field__clear"
            onClick={onClear}
            aria-label={t(`Clear ${name}`, `清除${name}`)}
            data-autofocus="false"
          >
            {t('Clear', '清除')}
          </button>
        ) : null}
      </div>
      {children}
    </fieldset>
  );
}

export function ClassificationChips({
  classifications = [],
  legacy,
}: {
  classifications: EventClassification[];
  legacy?: {
    label: string;
    tone?: string | null;
    name?: string | null;
    offSet?: boolean;
    title?: string;
  };
}) {
  const { t } = useI18n();
  // Storage origin does not grant visual rank: every value is a direct peer.
  const values = [
    ...(legacy?.label
      ? [
          {
            ...legacy,
            key: 'legacy',
            name: legacy.name ?? t('State', '状态'),
          },
        ]
      : []),
    ...classifications.flatMap((category) =>
      category.options.map((option) => ({
        key: `${category.categoryId}:${option.id}`,
        name: category.categoryName,
        label: option.label,
        tone: option.tone,
        offSet: false,
        title: undefined,
      })),
    ),
  ];
  if (values.length === 0) return null;
  return (
    <span className="classification-chips">
      {values.map((value) => (
        <span key={value.key} aria-label={`${value.name}：${value.label}`}>
          <StageChip
            label={value.label}
            tone={value.tone}
            offSet={value.offSet}
            title={value.title ?? `${value.name}：${value.label}`}
          />
        </span>
      ))}
    </span>
  );
}

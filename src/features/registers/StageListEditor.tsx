/**
 * The stage list itself — rows of "label + tone", and nothing else.
 *
 * Extracted so the two places that define stages share one implementation: the
 * standalone `StageSetDialog`, and the optional section inside `NewJourneyDialog`.
 * The previous version of this feature had a probe script that *copied* this
 * markup, and it silently kept passing after the real row changed — duplicating a
 * layout is exactly how that happens, so this is one component with two callers.
 *
 * Presentational and uncontrolled by persistence: it owns no repository calls and
 * no dialog chrome. The caller decides what saving means.
 */

import { Plus, X } from 'lucide-react';

import { StageChip } from '@/components/StageChip';
import type { StageTone } from '@/domain/types';
import { STAGE_TONES } from '@/domain/types';
import { useI18n } from '@/lib/i18n';
import './StageSet.css';

/** A row being edited. `id` is present only for a stage that already exists. */
export interface DraftStage {
  id?: string;
  label: string;
  tone: StageTone;
  /** Local key, so React rows stay stable while a new stage has no id yet. */
  key: string;
}

let draftKeyCounter = 0;

/** A fresh blank row. */
export function blankStage(): DraftStage {
  draftKeyCounter += 1;
  return { label: '', tone: 'neutral', key: `draft-${draftKeyCounter}` };
}

/** Existing stages, as editable rows. */
export function stagesFromOptions(
  options: { id: string; label: string; tone: string }[],
): DraftStage[] {
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    tone: (STAGE_TONES as readonly string[]).includes(option.tone)
      ? (option.tone as StageTone)
      : 'neutral',
    key: option.id,
  }));
}

/**
 * The rows worth saving.
 *
 * Blank rows are dropped rather than rejected: an empty row is the affordance for
 * adding one, so leaving the last one untouched is normal use rather than a
 * mistake worth an error message.
 */
export function namedStages(stages: DraftStage[]): DraftStage[] {
  return stages.filter((stage) => stage.label.trim().length > 0);
}

/** The shape both repositories take, from rows the user has filled in. */
export function stageOptionsFrom(stages: DraftStage[]) {
  return namedStages(stages).map((stage) => ({
    ...(stage.id ? { id: stage.id } : {}),
    label: stage.label.trim(),
    tone: stage.tone,
  }));
}

/**
 * What a tone is *for*, in words.
 *
 * The names are semantic rather than colours (`positive`, not `green`) because
 * that is what they are in the tokens, and because a user who later gets a dark
 * theme should not have picked "green" and received something else. The hint text
 * is what makes them choosable without a swatch legend.
 */
const TONE_HINTS: Record<StageTone, string> = {
  neutral: 'Quiet — most stages',
  channel: 'In progress',
  warm: 'Notable',
  positive: 'Went well',
  caution: 'Needs work',
  negative: 'Did not land',
};

const TONE_HINTS_ZH: Record<StageTone, string> = {
  neutral: '中性 — 适用于大多数阶段',
  channel: '进行中',
  warm: '值得关注',
  positive: '进展顺利',
  caution: '仍需努力',
  negative: '未能达成',
};

interface Props {
  stages: DraftStage[];
  onChange: (stages: DraftStage[]) => void;
  /**
   * Distinguishes the `aria-label`s when two editors could be on one screen.
   * Defaults to plain `Stage 1`, which is what the standalone dialog wants.
   */
  labelPrefix?: string;
  /** Shown under the rows. The caller owns the wording for its own context. */
  hint?: string;
  /** The chips preview, on by default — it is how a tone choice is checked. */
  showPreview?: boolean;
  addLabel?: string;
}

export function StageListEditor({
  stages,
  onChange,
  labelPrefix,
  hint,
  showPreview = true,
  addLabel,
}: Props) {
  const { t } = useI18n();
  const prefix = labelPrefix ?? t('Stage', '阶段');
  const named = namedStages(stages);

  const updateStage = (key: string, patch: Partial<DraftStage>) => {
    onChange(stages.map((stage) => (stage.key === key ? { ...stage, ...patch } : stage)));
  };

  return (
    <>
      <ul className="stage-editor">
        {stages.map((stage, index) => (
          <li key={stage.key} className="stage-editor__row">
            <input
              className="input stage-editor__label"
              value={stage.label}
              onChange={(event) => updateStage(stage.key, { label: event.target.value })}
              placeholder={t('Stage name', '阶段名称')}
              aria-label={`${prefix} ${index + 1}`}
              autoComplete="off"
            />

            {/*
              The palette. A radio group rather than a select, because six swatches
              shown at once is how a colour is chosen — and each carries its
              meaning as text in the title, so the choice is not colour-only.
            */}
            <div
              className="stage-editor__tones"
              role="radiogroup"
              aria-label={t(
                `Tone for ${stage.label.trim() || `${prefix.toLowerCase()} ${index + 1}`}`,
                `${stage.label.trim() || `${prefix} ${index + 1}`}的颜色`,
              )}
            >
              {STAGE_TONES.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  role="radio"
                  aria-checked={stage.tone === tone}
                  aria-label={t(`${tone} — ${TONE_HINTS[tone]}`, TONE_HINTS_ZH[tone])}
                  title={t(`${tone} — ${TONE_HINTS[tone]}`, TONE_HINTS_ZH[tone])}
                  className="stage-editor__tone"
                  data-tone={tone}
                  onClick={() => updateStage(stage.key, { tone })}
                  data-autofocus="false"
                />
              ))}
            </div>

            {/*
              Remove only. There are deliberately no reorder controls: a stage says
              what something is now and carries no position, so moving a row would
              change nothing the user can see (D-043).
            */}
            <div className="stage-editor__actions">
              <button
                type="button"
                className="icon-button"
                aria-label={t(
                  `Remove ${stage.label.trim() || 'stage'}`,
                  `移除${stage.label.trim() || '阶段'}`,
                )}
                disabled={stages.length === 1}
                onClick={() => onChange(stages.filter((item) => item.key !== stage.key))}
                data-autofocus="false"
              >
                <X size={13} strokeWidth={2} aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="button stage-editor__add"
        onClick={() => onChange([...stages, blankStage()])}
        data-autofocus="false"
      >
        <Plus size={13} strokeWidth={2} aria-hidden />
        {addLabel ?? t('Add a stage', '添加阶段')}
      </button>

      {hint ? <span className="field__hint">{hint}</span> : null}

      {showPreview && named.length > 0 ? (
        <div className="stage-editor__preview">
          {named.map((stage) => (
            <StageChip key={stage.key} label={stage.label.trim()} tone={stage.tone} />
          ))}
        </div>
      ) : null}
    </>
  );
}

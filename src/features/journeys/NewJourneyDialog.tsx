/**
 * Creating a journey should feel like opening a notebook, not configuring a
 * database (USER_FLOWS.md Flow A): a title is the only requirement, and the new
 * journey opens straight onto its timeline.
 *
 * It also carries the one optional piece of structure worth offering at this
 * moment: **what this Journey keeps track of, and the states those things can be
 * in.** That was originally reachable only from a register tab that did not exist
 * until the first item was added, which meant a brand-new Journey had nowhere to
 * set up states at all (D-044).
 *
 * The section is **collapsed by default**, which is what keeps Flow A intact: a
 * title is still the only requirement, and most Journeys — 健身, 旅行 — track no
 * such things and never open it.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';

import { JourneyIcon, JOURNEY_ICON_NAMES } from '@/components/JourneyIcon';
import { Modal } from '@/components/Modal';
import { StageChip } from '@/components/StageChip';
import { useInvalidate, useRepoQuery, useRepository } from '@/data/RepositoryContext';
import { dateInputValue, fromDateTimeInputs, nowIso } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';
import type { DraftStage } from '@/features/registers/StageListEditor';
import {
  StageListEditor,
  blankStage,
  namedStages,
  stageOptionsFrom,
} from '@/features/registers/StageListEditor';

interface Props {
  onClose: () => void;
  onCreated: (journeyId: string) => void;
}

export function NewJourneyDialog({ onClose, onCreated }: Props) {
  const { t } = useI18n();
  const iconLabels: Record<string, string> = {
    briefcase: '公文包',
    bot: '机器人',
    dumbbell: '哑铃',
    'piggy-bank': '储蓄罐',
    plane: '飞机',
    notebook: '笔记本',
    'graduation-cap': '学位帽',
    target: '目标',
    heart: '爱心',
    leaf: '叶子',
    sprout: '幼苗',
    compass: '指南针',
    map: '地图',
    lightbulb: '灯泡',
    'flask-conical': '烧瓶',
    landmark: '建筑',
  };
  const repository = useRepository();
  const invalidate = useInvalidate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(dateInputValue(nowIso()));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * The optional structure. Collapsed until asked for, and one register at most:
   * two stage lists in one dialog would turn opening a notebook into a setup
   * wizard, and any further register can be added from the Overview.
   */
  const [isTracking, setTracking] = useState(false);
  const [kind, setKind] = useState('');
  const [firstItem, setFirstItem] = useState('');
  const [stages, setStages] = useState<DraftStage[]>(() => [blankStage()]);
  /** An existing set, when the user would rather reuse one than retype it. */
  const [reusedSetId, setReusedSetId] = useState('');

  // Only queried for the picker; a Journey with no tracking never reads this.
  const stageSets = useRepoQuery((repo) => repo.listStageSets(), []);
  const availableSets = stageSets.data ?? [];
  const reusedSet = availableSets.find((set) => set.id === reusedSetId) ?? null;

  const missingKind =
    isTracking &&
    !kind.trim() &&
    (firstItem.trim().length > 0 || namedStages(stages).length > 0 || Boolean(reusedSet));
  const canSubmit = title.trim().length > 0 && !missingKind && !isSaving;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSaving(true);
    setError(null);
    try {
      const started = fromDateTimeInputs(startedAt);
      const journey = await repository.createJourney({
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(icon ? { icon } : {}),
        ...(started ? { startedAt: started } : {}),
      });

      /*
       * The register, when one was asked for. Deliberately after the Journey and
       * not in the same transaction: a stage set that fails to save must not lose
       * the Journey the user actually came here to make. The failure is surfaced
       * with the Journey already created, and the Overview can finish the job.
       */
      const trackedKind = kind.trim();
      if (isTracking && trackedKind) {
        // A first item is optional. Configuring states also makes the register
        // discoverable, so its first item can be recorded from an event later.
        if (firstItem.trim()) {
          await repository.createSubject({
            journeyId: journey.id,
            kind: trackedKind,
            title: firstItem.trim(),
          });
        }

        if (reusedSet) {
          await repository.attachStageSet(journey.id, trackedKind, reusedSet.id);
        } else if (namedStages(stages).length > 0) {
          const set = await repository.createStageSet({
            // Named after the register, because the user was not asked for a set
            // name here — one field fewer at the moment they least want a form.
            name: trackedKind,
            options: stageOptionsFrom(stages),
          });
          await repository.attachStageSet(journey.id, trackedKind, set.id);
        }
      }

      invalidate();
      onCreated(journey.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setIsSaving(false);
    }
  };

  return (
    <Modal title={t('New Journey', '新建旅程')} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal__body">
          {error ? <p className="error-banner">{error}</p> : null}

          <div className="field">
            <label className="field__label" htmlFor="journey-title">
              {t('Name', '名称')}
            </label>
            <input
              id="journey-title"
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="journey-description">
              {t('What is this for?', '为什么开始？')}{' '}
              <span className="field__hint">{t('Optional', '选填')}</span>
            </label>
            <textarea
              id="journey-description"
              className="input input--textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="journey-start">
              {t('Started', '开始日期')}
            </label>
            <input
              id="journey-start"
              type="date"
              className="input"
              value={startedAt}
              onChange={(event) => setStartedAt(event.target.value)}
            />
          </div>

          <div className="field">
            <span className="field__label">
              {t('Icon', '图标')} <span className="field__hint">{t('Optional', '选填')}</span>
            </span>
            <div className="icon-picker">
              {JOURNEY_ICON_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="icon-picker__option"
                  aria-pressed={icon === name}
                  aria-label={t(name, iconLabels[name] ?? name)}
                  onClick={() => setIcon(icon === name ? null : name)}
                  data-autofocus="false"
                >
                  <JourneyIcon name={name} size={16} />
                </button>
              ))}
            </div>
          </div>

          {/*
            The optional structure, folded away.

            A disclosure rather than a checkbox: the point is that the whole
            subject is out of the way until wanted, and a checkbox would still
            occupy a line asserting that tracking things is a normal part of
            making a Journey. It is not — most Journeys just get written in.
          */}
          <div className="field">
            <button
              type="button"
              className="disclosure"
              aria-expanded={isTracking}
              onClick={() => setTracking(!isTracking)}
              data-autofocus="false"
            >
              {isTracking ? (
                <ChevronDown size={14} strokeWidth={2} aria-hidden />
              ) : (
                <ChevronRight size={14} strokeWidth={2} aria-hidden />
              )}
              <Layers size={13} strokeWidth={2} aria-hidden />
              {t('Does this Journey track a set of things?', '这个旅程需要一个清单吗？')}
              <span className="field__hint">{t('Optional', '选填')}</span>
            </button>

            {isTracking ? (
              <div className="disclosure__body">
                <div className="field">
                  <label className="field__label" htmlFor="journey-kind">
                    {t('What kind of thing', '内容类型')}
                  </label>
                  <input
                    id="journey-kind"
                    className="input"
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                    autoComplete="off"
                  />
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="journey-first-item">
                    {t('First one', '第一项')}{' '}
                    <span className="field__hint">{t('Optional', '选填')}</span>
                  </label>
                  <input
                    id="journey-first-item"
                    className="input"
                    value={firstItem}
                    onChange={(event) => setFirstItem(event.target.value)}
                    autoComplete="off"
                  />
                </div>

                {/*
                  Reuse before retyping. This is the whole reason a stage set is a
                  named thing rather than a per-Journey list: next year's 秋招 picks
                  the same one and nothing is entered twice.
                */}
                {availableSets.length > 0 ? (
                  <div className="field">
                    <label className="field__label" htmlFor="journey-stage-set">
                      {t('States', '状态')}
                    </label>
                    <select
                      id="journey-stage-set"
                      className="input"
                      value={reusedSetId}
                      onChange={(event) => setReusedSetId(event.target.value)}
                    >
                      <option value="">
                        {t('Define new states below', '在下方定义新状态')}
                      </option>
                      {availableSets.map((set) => (
                        <option key={set.id} value={set.id}>
                          {set.name} — {set.options.map((option) => option.label).join(' · ')}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {reusedSet ? (
                  <div className="field">
                    <span className="field__label">{t('Using', '使用中')}</span>
                    <div className="stage-editor__preview">
                      {reusedSet.options.map((option) => (
                        <StageChip key={option.id} label={option.label} tone={option.tone} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="field">
                    <span className="field__label">
                      {t('States', '状态')}{' '}
                      <span className="field__hint">{t('Optional', '选填')}</span>
                    </span>
                    <StageListEditor
                      stages={stages}
                      onChange={setStages}
                      labelPrefix={t('State', '状态')}
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <footer className="modal__footer">
          {missingKind ? (
            <span className="modal__footer-hint">
              {t('Name the kind of thing to save its states', '请填写内容类型以保存状态')}
            </span>
          ) : null}
          <button type="button" className="button" onClick={onClose} data-autofocus="false">
            {t('Cancel', '取消')}
          </button>
          <button type="submit" className="button button--primary" disabled={!canSubmit}>
            {isSaving ? t('Creating…', '正在创建…') : t('Create Journey', '创建旅程')}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

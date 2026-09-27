/**
 * "About which" — naming the thing an entry is about, and the stage it reached.
 *
 * Shared by the two dialogs that need it, for a reason worth stating: **recording
 * something and confirming that a plan happened are the same moment** as far as a
 * register is concerned. Both are the point at which a thing reaches a stage, so
 * both need the same question. The confirm dialog originally had none of this, so
 * a plan could only ever arrive on the record unfiled and unstaged — the gap the
 * user hit on `2027 ICRA` (D-051).
 *
 * A hook plus a view rather than one self-contained component: the parent needs
 * the resolved payload for its own submit and its own blocked-reason line, and
 * lifting that out of a `useEffect` keeps the data flowing one way.
 */

import { Layers } from 'lucide-react';
import { useState } from 'react';

import { StageChip } from '@/components/StageChip';
import { useRepoQuery } from '@/data/RepositoryContext';
import { splitKnownStageFromTitle } from '@/domain/registers';
import type { NewEventSubjectInput, StageOption, SubjectSummary } from '@/domain/types';
import { useI18n } from '@/lib/i18n';

/**
 * Sentinel for "the thing this is about does not exist yet".
 *
 * A value in the same `<select>` rather than a separate toggle, because it is the
 * same question — *which* thing — and "a new one" is one of the answers.
 */
const NEW_SUBJECT = '\u0000new';

/** What the caller sends to the repository. */
export interface SubjectFiling {
  subjectId?: string;
  newSubject?: NewEventSubjectInput;
  stage?: string;
}

export interface SubjectFieldState {
  /** Everything the caller needs at submit time. */
  filing: SubjectFiling;
  /** Non-null when the user has started something they have not finished. */
  blockedReason: string | null;
  /** Whether there is anything to render at all. */
  isAvailable: boolean;
  // --- internals the view needs -----------------------------------------
  subjectId: string;
  setSubjectId: (value: string) => void;
  trackable: SubjectSummary[];
  registerKinds: string[];
  chosenSubject: SubjectSummary | null;
  isCreating: boolean;
  newSubjectName: string;
  setNewSubjectName: (value: string) => void;
  newSubjectKind: string;
  rawNewSubjectKind: string;
  setNewSubjectKind: (value: string) => void;
  stage: string;
  setStage: (value: string) => void;
  stagesUsed: string[];
  setOptions: StageOption[];
  setName: string | null;
  readFromTitle: boolean;
}

/**
 * Resolve the filing question against one Journey's registers.
 *
 * @param journeyId The Journey whose registers are offered. A subject belongs to
 *   exactly one, and both repositories refuse one from elsewhere, so offering a
 *   thing from another Journey would be offering an error.
 * @param entryTitle What the user wrote. The name and stage are read out of it
 *   rather than asked for twice (D-050).
 * @param initialSubjectId The subject the entry already carries, when confirming
 *   one that was filed while it was still a plan.
 */
export function useSubjectField({
  journeyId,
  entryTitle,
  initialSubjectId = '',
}: {
  journeyId: string | null;
  entryTitle: string;
  initialSubjectId?: string | null;
}): SubjectFieldState {
  const { t } = useI18n();
  const [subjectId, setSubjectIdRaw] = useState(initialSubjectId ?? '');
  /** `null` follows the title; a string is a name of the user's own (D-050). */
  const [nameChosen, setNameChosen] = useState<string | null>(null);
  /** `null` follows the title in the same way. */
  const [stageChosen, setStageChosen] = useState<string | null>(null);
  const [kindChosen, setKindChosen] = useState('');

  const subjects = useRepoQuery(
    (repo) => (journeyId ? repo.listSubjects(journeyId) : Promise.resolve([])),
    [journeyId],
  );
  const trackable = subjects.data ?? [];
  const chosenSubject = trackable.find((subject) => subject.id === subjectId) ?? null;
  const isCreating = subjectId === NEW_SUBJECT;

  /*
   * The registers this Journey has, read off its things rather than fetched: a
   * `kind` exists only as a property of the rows carrying it, so the list is
   * already here and a second query would only be a second chance to disagree.
   */
  const registerKinds = [...new Set(trackable.map((subject) => subject.kind))];

  // The only register, when there is only one: a select with a single option is a
  // question with one answer.
  const newSubjectKind =
    kindChosen || (registerKinds.length === 1 ? (registerKinds[0] as string) : '');

  // Whose vocabulary applies — the chosen thing's, or the one being joined.
  const activeKind = isCreating ? newSubjectKind : (chosenSubject?.kind ?? '');

  const stagesUsedQuery = useRepoQuery(
    (repo) =>
      journeyId && activeKind
        ? repo.subjectStagesUsed(journeyId, activeKind)
        : Promise.resolve([]),
    [journeyId, activeKind],
  );
  const registerStageSet = useRepoQuery(
    (repo) =>
      journeyId && activeKind
        ? repo.stageSetForRegister(journeyId, activeKind)
        : Promise.resolve(null),
    [journeyId, activeKind],
  );
  const stagesUsed = stagesUsedQuery.data ?? [];
  const setOptions = registerStageSet.data?.options ?? [];

  /*
   * Everything this register calls a stage: the set's labels plus every stage
   * already typed on one of its things. Both are the user's own words, and either
   * is enough evidence to read a stage off the end of a title.
   */
  const knownStages = [
    ...new Set([...setOptions.map((option) => option.label), ...stagesUsed]),
  ];
  const titleSplit = splitKnownStageFromTitle(entryTitle, knownStages);

  const newSubjectName = nameChosen ?? titleSplit.name;
  /*
   * A stage is only read out of the title while *creating*, where the title is
   * known to be about the new thing. For a thing picked from the register the
   * title may be about anything, so nothing is assumed.
   */
  const stage = stageChosen ?? (isCreating ? titleSplit.stage : '');
  const readFromTitle = stageChosen === null && titleSplit.stage.length > 0;

  const setSubjectId = (value: string) => {
    setSubjectIdRaw(value);
    /*
     * Both fields go back to following the title. A stage belongs to a register's
     * vocabulary, so one typed for a different thing may not exist here — and a
     * name typed for a different answer is no longer the answer.
     */
    setStageChosen(null);
    setNameChosen(null);
  };

  const isComplete =
    !isCreating || (newSubjectName.trim().length > 0 && newSubjectKind.trim().length > 0);

  let blockedReason: string | null = null;
  if (isCreating && !newSubjectName.trim()) {
    blockedReason = t(
      'Name the new one, or pick something else',
      '请为新内容命名，或选择其他内容',
    );
  } else if (isCreating && !newSubjectKind.trim()) {
    blockedReason = t('Say what kind of thing it is', '请填写内容类型');
  }

  /*
   * `NEW_SUBJECT` is a UI sentinel and must never reach a repository as an id, so
   * the two branches are exclusive by construction rather than by sending both and
   * letting the backend choose.
   */
  const trimmedStage = stage.trim();
  const filing: SubjectFiling = isCreating
    ? {
        newSubject: { kind: newSubjectKind.trim(), title: newSubjectName.trim() },
        ...(trimmedStage ? { stage: trimmedStage } : {}),
      }
    : subjectId
      ? { subjectId, ...(trimmedStage ? { stage: trimmedStage } : {}) }
      : {};

  return {
    filing,
    blockedReason: isComplete ? null : blockedReason,
    isAvailable: trackable.length > 0,
    subjectId,
    setSubjectId,
    trackable,
    registerKinds,
    chosenSubject,
    isCreating,
    newSubjectName,
    setNewSubjectName: setNameChosen,
    newSubjectKind,
    rawNewSubjectKind: kindChosen,
    setNewSubjectKind: setKindChosen,
    stage,
    setStage: setStageChosen,
    stagesUsed,
    setOptions,
    setName: registerStageSet.data?.name ?? null,
    readFromTitle,
  };
}

/**
 * The field itself.
 *
 * Absent entirely for a Journey with no register, which is most of them — an empty
 * picker would be chrome advertising a feature the user has not asked for. When
 * present it is optional: "Nothing in particular" is always available, which is
 * what keeps recording easier than filing (AGENTS.md §1).
 *
 * @param idPrefix Scopes the element ids, so two of these can never collide if a
 *   screen ever shows both.
 */
export function SubjectField({
  field,
  idPrefix,
  label,
}: {
  field: SubjectFieldState;
  idPrefix: string;
  label?: string;
}) {
  const { t } = useI18n();
  if (!field.isAvailable) return null;

  const stageListId = `${idPrefix}-stage-options`;

  return (
    <div className="field">
      <label className="field__label" htmlFor={`${idPrefix}-subject`}>
        <Layers size={12} strokeWidth={2} aria-hidden /> {label ?? t('About which', '关联内容')}{' '}
        <span className="field__hint">{t('Optional', '选填')}</span>
      </label>

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <select
          id={`${idPrefix}-subject`}
          className="input"
          style={{ flex: 1 }}
          value={field.subjectId}
          onChange={(event) => field.setSubjectId(event.target.value)}
        >
          <option value="">{t('Nothing in particular', '不关联具体内容')}</option>
          {field.trackable.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.kind} · {subject.title}
              {subject.currentStage ? ` (${subject.currentStage})` : ''}
            </option>
          ))}
          {/*
            Last: the list is things that exist, and this is the answer for when
            none of them is the one. Not worded as "track something new" — the
            register does the tracking; the user is naming what this is about.
          */}
          <option value={NEW_SUBJECT}>{t('+ A new one…', '+ 新建一项…')}</option>
        </select>

        {/*
          The stage, once there is something to be the stage of. Free text with a
          datalist rather than a fixed dropdown: the vocabulary is whatever has
          been typed before, and a new stage must always be possible without
          configuring anything first.
        */}
        {field.subjectId && !field.isCreating ? (
          <>
            <input
              className="input"
              style={{ width: 160 }}
              list={stageListId}
              value={field.stage}
              onChange={(event) => field.setStage(event.target.value)}
              placeholder={t('Submitted · First interview', '投稿 · 一面')}
              aria-label={t('Stage it reached', '到达的阶段')}
              autoComplete="off"
            />
            <datalist id={stageListId}>
              {field.stagesUsed.map((used) => (
                <option key={used} value={used} />
              ))}
            </datalist>
          </>
        ) : null}
      </div>

      {/*
        The new thing, on its own row — below the picker rather than replacing it,
        so the choice that led here stays visible and reversible.

        Both fields arrive filled in: `2026 CVPR 投稿` above already says what this
        is about and what happened to it, so neither is asked for twice (D-050).
        Editing either detaches it from the title.
      */}
      {field.isCreating ? (
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="field__label" htmlFor={`${idPrefix}-new-subject`}>
              {t('Name in the register', '清单中的名称')}
            </label>
            <input
              id={`${idPrefix}-new-subject`}
              className="input"
              value={field.newSubjectName}
              onChange={(event) => field.setNewSubjectName(event.target.value)}
              placeholder={t(
                '2027 ICLR · SEER Robotics · Dune: Part Two',
                '2027 ICLR · 上海仙工 · 沙丘 2',
              )}
              autoComplete="off"
            />
          </div>

          {/*
            Which register it joins. Only asked when there is a real choice: with
            one register the answer is already known.
          */}
          {field.registerKinds.length === 1 ? null : (
            <div className="field" style={{ width: 180 }}>
              <label className="field__label" htmlFor={`${idPrefix}-new-subject-kind`}>
                {t('Kind of thing', '内容类型')}
              </label>
              <input
                id={`${idPrefix}-new-subject-kind`}
                className="input"
                list={`${idPrefix}-register-kinds`}
                value={field.rawNewSubjectKind}
                onChange={(event) => field.setNewSubjectKind(event.target.value)}
                placeholder={t('Papers · Roles', '论文 · 岗位')}
                autoComplete="off"
              />
              <datalist id={`${idPrefix}-register-kinds`}>
                {field.registerKinds.map((kind) => (
                  <option key={kind} value={kind} />
                ))}
              </datalist>
            </div>
          )}

          <div className="field" style={{ width: 160 }}>
            <label className="field__label" htmlFor={`${idPrefix}-new-subject-stage`}>
              {t('Stage', '阶段')} <span className="field__hint">{t('Optional', '选填')}</span>
            </label>
            <input
              id={`${idPrefix}-new-subject-stage`}
              className="input"
              list={stageListId}
              value={field.stage}
              onChange={(event) => field.setStage(event.target.value)}
              placeholder={t('Submitted · First interview', '投稿 · 一面')}
              autoComplete="off"
            />
            <datalist id={stageListId}>
              {field.stagesUsed.map((used) => (
                <option key={used} value={used} />
              ))}
            </datalist>
          </div>
        </div>
      ) : null}

      {/*
        The register's own stages, one click each, in their own colours. This is
        what a defined vocabulary buys at the moment of recording: after the first
        time a stage is picked rather than retyped or half-remembered.

        Listed in the order the set was written in, which carries no meaning beyond
        being stable — a stage is a label, not a step. The text field stays
        available on purpose: a stage outside the set has to remain writable.
      */}
      {field.subjectId && field.setOptions.length > 0 ? (
        <div
          className="stage-picker"
          role="group"
          aria-label={t('Stages in this register', '此清单中的阶段')}
        >
          {field.setOptions.map((option) => {
            const isChosen = field.stage.trim() === option.label;
            return (
              <button
                key={option.id}
                type="button"
                className="stage-picker__option"
                aria-pressed={isChosen}
                // Clicking the chosen stage clears it, so a mis-click is undoable
                // without reaching for the text field.
                onClick={() => field.setStage(isChosen ? '' : option.label)}
                data-autofocus="false"
              >
                <StageChip label={option.label} tone={option.tone} />
              </button>
            );
          })}
        </div>
      ) : null}

      {field.subjectId && !field.isCreating ? (
        <span className="field__hint">
          {field.chosenSubject?.currentStage
            ? t(
                `Currently ${field.chosenSubject.currentStage}. This becomes its stage instead.`,
                `当前阶段为${field.chosenSubject.currentStage}，将更新为这里填写的阶段。`,
              )
            : field.setOptions.length > 0
              ? t(
                  `Becomes its stage in the register. Pick one of ${field.setName}'s, or type anything else.`,
                  `将成为清单中的当前阶段。可以从${field.setName}中选择，也可以输入其他阶段。`,
                )
              : t(
                  'Becomes its stage in the register. Type anything — the register learns it.',
                  '将成为清单中的当前阶段。自由填写，清单会记住你的用语。',
                )}
        </span>
      ) : null}

      {/*
        What this will do, said plainly: a row is being added to the register, not
        just a label to the entry.
      */}
      {field.isCreating && !field.blockedReason ? (
        <span className="field__hint">
          {t(
            `Adds ${field.newSubjectName.trim()} to ${field.newSubjectKind.trim()}${field.stage.trim() ? ` at ${field.stage.trim()}` : ''}, with this entry as its first.`,
            `将${field.newSubjectName.trim()}加入${field.newSubjectKind.trim()}${field.stage.trim() ? `，阶段为${field.stage.trim()}` : ''}，并以此事件作为第一条记录。`,
          )}
          {field.readFromTitle
            ? t(
                ' Name and stage read from what you wrote above.',
                '名称和阶段来自你在上方填写的内容。',
              )
            : ''}
        </span>
      ) : null}
    </div>
  );
}

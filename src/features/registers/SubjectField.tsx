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

import { ClassificationChoice } from './ClassificationField';
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
  stageTouched: boolean;
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
  initialStage,
  linkedJourneyIds,
}: {
  journeyId: string | null;
  entryTitle: string;
  initialSubjectId?: string | null;
  initialStage?: string | null;
  linkedJourneyIds?: string[];
}): SubjectFieldState {
  const { t } = useI18n();
  const [subjectId, setSubjectIdRaw] = useState(initialSubjectId ?? '');
  /** `null` follows the title; a string is a name of the user's own (D-050). */
  const [nameChosen, setNameChosen] = useState<string | null>(null);
  /** `null` follows the title in the same way. */
  const [stageChosen, setStageChosen] = useState<string | null>(initialStage ?? null);
  const [stageTouched, setStageTouched] = useState(false);
  const [kindChosen, setKindChosen] = useState('');
  const queryScope = JSON.stringify([journeyId, ...(linkedJourneyIds ?? [])]);
  const [scope, setScope] = useState(queryScope);

  // Filing belongs to one Journey. Changing that Journey must not carry a
  // previous film, register or stage into the next event's save payload.
  if (scope !== queryScope) {
    setScope(queryScope);
    setSubjectIdRaw('');
    setNameChosen(null);
    setStageChosen(null);
    setStageTouched(false);
    setKindChosen('');
  }

  const registers = useRepoQuery(
    async (repo) => {
      const ids = [
        ...new Set(
          [journeyId, ...(linkedJourneyIds ?? [])].filter((id): id is string => Boolean(id)),
        ),
      ];
      const [subjects, kinds] = journeyId
        ? await Promise.all([
            Promise.all(ids.map((id) => repo.listSubjects(id))).then((lists) => lists.flat()),
            repo.subjectKinds(journeyId),
          ])
        : [[], []];
      return { scope: queryScope, subjects, kinds };
    },
    [queryScope],
  );
  // useRepoQuery keeps previous data while refreshing. Only read results from
  // the current scope, including during a slow Journey switch.
  const current = registers.data?.scope === queryScope ? registers.data : undefined;
  const trackable = current?.subjects ?? [];
  const chosenSubject = trackable.find((subject) => subject.id === subjectId) ?? null;
  const isCreating = subjectId === NEW_SUBJECT;

  // Configured states already express a register, even before its first item.
  // The repository includes those zero-item registers as well as existing ones.
  const registerKinds = current?.kinds.map(([kind]) => kind) ?? [];

  // The only register, when there is only one: a select with a single option is a
  // question with one answer.
  const newSubjectKind =
    kindChosen || (registerKinds.length === 1 ? (registerKinds[0] as string) : '');

  // Whose vocabulary applies — the chosen thing's, or the one being joined.
  const activeKind = isCreating ? newSubjectKind : (chosenSubject?.kind ?? '');
  const activeJourney = chosenSubject?.journeyId ?? journeyId;

  const vocabulary = useRepoQuery(
    async (repo) => {
      const [used, set] =
        activeJourney && activeKind
          ? await Promise.all([
              repo.subjectStagesUsed(activeJourney, activeKind),
              repo.stageSetForRegister(activeJourney, activeKind),
            ])
          : [[], null];
      return { journeyId: activeJourney, kind: activeKind, used, set };
    },
    [activeJourney, activeKind],
  );
  const currentVocabulary =
    vocabulary.data?.journeyId === activeJourney && vocabulary.data.kind === activeKind
      ? vocabulary.data
      : undefined;
  const stagesUsed = currentVocabulary?.used ?? [];
  const setOptions = currentVocabulary?.set?.options ?? [];

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
    // A different item resets its draft. Returning to the original item restores
    // its stored value, which an untouched confirmation will also preserve.
    setStageChosen(value === initialSubjectId ? (initialStage ?? null) : null);
    setStageTouched(false);
    setNameChosen(null);
  };

  let blockedReason: string | null = null;
  if (subjectId && !current) {
    blockedReason = registers.error
      ? t('Could not load the associated content.', '无法加载关联内容。')
      : t('Loading the associated content…', '正在加载关联内容…');
  } else if (isCreating && !newSubjectName.trim()) {
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
  // A confirmed plan may already reference a subject in another linked Journey.
  // Keep that id even if this first-Journey picker cannot list it; the repository
  // checks ownership against all event links, not just the currently shown list.
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
    blockedReason,
    isAvailable: registerKinds.length > 0 || trackable.length > 0,
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
    setNewSubjectKind: (value) => {
      setKindChosen(value);
      setStageChosen(null);
      setStageTouched(false);
    },
    stage,
    stageTouched,
    setStage: (value) => {
      setStageChosen(value);
      setStageTouched(true);
    },
    stagesUsed,
    setOptions,
    setName: currentVocabulary?.set?.name ?? null,
    readFromTitle,
  };
}

/**
 * The field itself.
 *
 * Absent for a Journey with neither tracked items nor configured states. A state
 * set is enough to offer the first item here; no detour through another screen.
 * "Nothing in particular" remains the default, keeping filing optional.
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

  return (
    <div className="field">
      <label className="field__label" htmlFor={`${idPrefix}-subject`}>
        <Layers size={12} strokeWidth={2} aria-hidden /> {label ?? t('About which', '关联内容')}{' '}
        <span className="field__hint">{t('Optional', '选填')}</span>
      </label>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <select
          id={`${idPrefix}-subject`}
          className="input"
          style={{ flex: '1 1 180px', minWidth: 0 }}
          value={field.subjectId}
          onChange={(event) => field.setSubjectId(event.target.value)}
        >
          <option value="">{t('Nothing in particular', '不关联具体内容')}</option>
          {field.trackable.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.kind} · {subject.title}
            </option>
          ))}
          {/*
            Last: the list is things that exist, and this is the answer for when
            none of them is the one. Not worded as "track something new" — the
            register does the tracking; the user is naming what this is about.
          */}
          <option value={NEW_SUBJECT}>{t('+ A new one…', '+ 新建一项…')}</option>
        </select>
      </div>

      {!field.subjectId ? (
        <span className="field__hint">
          {t(
            "Select or add an item to set that item's stage.",
            '选择或新建内容后，可设置该内容的状态。',
          )}
        </span>
      ) : null}

      {/*
        The new thing, on its own row — below the picker rather than replacing it,
        so the choice that led here stays visible and reversible.

        Both fields arrive filled in: `2026 CVPR 投稿` above already says what this
        is about and what happened to it, so neither is asked for twice (D-050).
        Editing either detaches it from the title.
      */}
      {field.isCreating ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div className="field" style={{ flex: '1 1 180px', minWidth: 0 }}>
            <label className="field__label" htmlFor={`${idPrefix}-new-subject`}>
              {t('Name in the register', '清单中的名称')}
            </label>
            <input
              id={`${idPrefix}-new-subject`}
              className="input"
              value={field.newSubjectName}
              onChange={(event) => field.setNewSubjectName(event.target.value)}
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
                autoComplete="off"
              />
              <datalist id={`${idPrefix}-register-kinds`}>
                {field.registerKinds.map((kind) => (
                  <option key={kind} value={kind} />
                ))}
              </datalist>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** The register's vocabulary is a named peer of every other category. */
export function SubjectStageField({
  field,
  idPrefix,
  categoryName,
  disabled = false,
}: {
  field: SubjectFieldState;
  idPrefix: string;
  categoryName?: string | null;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [other, setOther] = useState(false);
  const scope = `${field.subjectId}:${field.setName ?? ''}`;
  const [previousScope, setPreviousScope] = useState(scope);
  if (previousScope !== scope) {
    setPreviousScope(scope);
    setOther(false);
  }
  if (!field.subjectId && !field.stage) return null;
  const name = field.setName ?? categoryName ?? t('State', '状态');
  const options = field.setOptions.map((option) => ({ ...option, id: option.label }));
  const value = field.stage.trim();
  const offSet = value !== '' && !options.some((option) => option.label === value);
  const hasSubject = Boolean(field.subjectId);
  const inputVisible = hasSubject && (options.length === 0 || other || offSet);
  const inputId = `${idPrefix}-stage`;
  const listId = `${idPrefix}-stage-options`;

  return (
    <ClassificationChoice
      name={name}
      options={hasSubject ? options : []}
      selected={value ? [value] : []}
      disabled={disabled}
      onToggle={(label) => {
        field.setStage(value === label ? '' : label);
        setOther(false);
      }}
      onClear={() => {
        field.setStage('');
        setOther(false);
      }}
    >
      {!hasSubject ? <span className="field__hint">{field.stage}</span> : null}
      {hasSubject && options.length > 0 ? (
        <button
          type="button"
          className="button classification-field__clear"
          aria-expanded={inputVisible}
          onClick={() => setOther(!inputVisible)}
          data-autofocus="false"
        >
          {t('Other…', '其他…')}
        </button>
      ) : null}
      {inputVisible ? (
        <>
          <input
            id={inputId}
            className="input"
            value={field.stage}
            list={listId}
            onChange={(event) => field.setStage(event.target.value)}
            aria-label={name}
            autoComplete="off"
          />
          <datalist id={listId}>
            {field.stagesUsed.map((used) => (
              <option key={used} value={used} />
            ))}
          </datalist>
        </>
      ) : null}
    </ClassificationChoice>
  );
}

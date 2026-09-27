/**
 * One register: the things of a kind in a Journey, grouped by where each stands.
 *
 * This is the 图鉴 view. What makes it honest is that **every column but the name
 * is derived from events** — the stage is the last one recorded, the count is a
 * count. There is no completion percentage, because a set of things you are
 * following has no completion (D-007), and no draggable board, because a stage
 * vocabulary that the user types has no defined order (AGENTS.md §12).
 *
 * Generic by construction: nothing here knows what a paper is. A film register
 * is the same component with a different `kind`.
 */

import { useState } from 'react';
import { CalendarClock, Layers, Palette, Plus, Sparkles } from 'lucide-react';

import { useInvalidate, useRepoQuery, useRepository } from '@/data/RepositoryContext';
import { StageChip } from '@/components/StageChip';
import { groupByStage, registerTally } from '@/domain/registers';
import type { SubjectSummary } from '@/domain/types';
import { formatRelativeDay } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';
import { StageSetPicker } from './StageSetPicker';
import './Register.css';

interface Props {
  journeyId: string;
  kind: string;
  /** Opens the thing's own history — a timeline filtered to it. */
  onOpenSubject: (subject: SubjectSummary) => void;
}

export function RegisterView({ journeyId, kind, onOpenSubject }: Props) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();

  const subjects = useRepoQuery(
    (repo) => repo.listSubjects(journeyId, kind),
    [journeyId, kind],
  );
  /*
   * The vocabulary this register uses, when the user has defined one. Absent is
   * the normal state for a new register and behaves exactly as it did before
   * stage sets existed — stages accumulate from what gets typed.
   */
  const stageSet = useRepoQuery(
    (repo) => repo.stageSetForRegister(journeyId, kind),
    [journeyId, kind],
  );
  /*
   * Things written before this register existed, if the app can see any. Offered
   * rather than applied: the grouping reads the user's own titles, and a parse of
   * someone's writing is a suggestion, not a fact.
   */
  const proposals = useRepoQuery((repo) => repo.proposeSubjects(journeyId), [journeyId]);

  const [draft, setDraft] = useState('');
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPickingStages, setPickingStages] = useState(false);

  const rows = subjects.data ?? [];
  const set = stageSet.data ?? null;
  const tally = registerTally(rows);
  // With a set the groups follow its order and empty stages still appear; without
  // one, by recency, exactly as before.
  const groups = groupByStage(rows, set?.options ?? []);
  const unfiled = proposals.data ?? [];

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title || isSaving) return;

    setSaving(true);
    setError(null);
    try {
      await repository.createSubject({ journeyId, kind, title });
      setDraft('');
      invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="register">
      {/*
        Counts, not a score. "9 tracked · 7 with something recorded · 4 stages" is
        arithmetic on real rows; a percentage would be the invented progress
        D-007 exists to refuse.
      */}
      <div className="register__tally">
        <span className="meta-text">
          {tally.total === 0
            ? t('Nothing tracked yet', '还没有清单内容')
            : t(
                `${tally.total} tracked · ${tally.withEvents} with something recorded · ${tally.stages} ${
                  tally.stages === 1 ? 'stage' : 'stages'
                }`,
                `共 ${tally.total} 项 · ${tally.withEvents} 项已有记录 · ${tally.stages} 个阶段`,
              )}
        </span>

        {/*
          The way into the vocabulary. Named after the set once there is one, so
          the control says what it will open rather than what it does.
        */}
        <button
          type="button"
          className="button register__stages-button"
          onClick={() => setPickingStages(true)}
        >
          <Palette size={13} strokeWidth={2} aria-hidden />
          {set ? set.name : t('Set up stages', '设置阶段')}
        </button>
      </div>

      {/*
        One line to add a thing. The whole register must stay this cheap — the
        moment it needs a form, it becomes the data entry AGENTS.md §1 forbids.
      */}
      <form className="composer register__composer" onSubmit={add}>
        <span className="composer__icon" aria-hidden>
          <Plus size={15} strokeWidth={2} />
        </span>
        <input
          className="composer__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('Add something to track…', '添加想持续记录的内容…')}
          aria-label={t(`Add to ${kind}`, `添加到${kind}`)}
        />
        <button
          type="submit"
          className="button button--outline"
          disabled={!draft.trim() || isSaving}
        >
          {t('Add', '添加')}
        </button>
      </form>
      {error ? <p className="error-banner">{error}</p> : null}

      {/*
        The offer to adopt what is already written. Shown above the register
        because on a notebook that predates registers it is the fastest way to a
        populated one — and it disappears for good once nothing is left to adopt.
      */}
      {unfiled.length > 0 ? (
        <section className="register__proposal">
          <div className="register__proposal-head">
            <Sparkles size={13} strokeWidth={2} aria-hidden />
            <span>
              {t(
                `${unfiled.length} ${unfiled.length === 1 ? 'thing' : 'things'} already look tracked in this Journey’s entries`,
                `此旅程的记录中，已有 ${unfiled.length} 项内容可能适合加入清单`,
              )}
            </span>
          </div>
          <ul className="register__proposal-list">
            {unfiled.map((proposal) => (
              <li key={proposal.title} className="register__proposal-row">
                <span className="register__proposal-title">{proposal.title}</span>
                <span className="register__proposal-stages">
                  {proposal.events.map(([, , stage]) => stage).join(' · ')}
                </span>
                <button
                  type="button"
                  className="button"
                  onClick={async () => {
                    const subject = await repository.createSubject({
                      journeyId,
                      kind,
                      title: proposal.title,
                    });
                    for (const [eventId, , stage] of proposal.events) {
                      await repository.updateTimelineEvent(eventId, {
                        subjectId: subject.id,
                        stage,
                      });
                    }
                    invalidate();
                  }}
                >
                  {t('Adopt', '纳入清单')}
                </button>
              </li>
            ))}
          </ul>
          <p className="register__proposal-note">
            {t(
              'Read from the titles you already wrote. Check the stages before adopting — anything recorded only once is left out, because there is no way to tell where its name ends.',
              '这些建议来自已有记录的标题，纳入前请核对阶段。仅出现一次的内容不会列出，因为还无法可靠区分名称与阶段。',
            )}
          </p>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__title">
            {t('This register is empty', '这个清单还是空的')}
          </div>
          <p>
            {t(
              'Add something above, then record events about it. Each thing’s stage is whatever its most recent event says — nothing to keep in sync by hand.',
              '在上方添加一项内容，然后记录与它有关的事件。阶段以最近的事件为准，无需手动同步。',
            )}
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.stage ?? '\u0000none'} className="register__group">
            <header className="register__group-head">
              {/*
                The stage in its own tone when the set names it, so the colour the
                user chose is what marks the section — and the name is inside the
                chip, so the heading still reads without it.
              */}
              <h3 className="section-label">
                {group.stage === null ? (
                  t('Nothing recorded yet', '还没有记录')
                ) : group.tone ? (
                  <StageChip label={group.stage} tone={group.tone} />
                ) : (
                  <StageChip
                    label={group.stage}
                    offSet={set !== null}
                    title={
                      set
                        ? t(
                            `Recorded, but not one of ${set.name}'s stages`,
                            `已记录，但不属于${set.name}中的阶段`,
                          )
                        : undefined
                    }
                  />
                )}
              </h3>
              <span className="register__group-count">{group.subjects.length}</span>
              <span className="register__group-rule" aria-hidden />
            </header>

            {/*
              A stage of the set with nothing at it. Kept rather than hidden: "is
              anything at 大修" is a real question, and a visible zero is the answer
              that a derived vocabulary could never give.
            */}
            {group.subjects.length === 0 ? (
              <p className="register__group-empty">
                {t('Nothing here yet.', '这里还没有内容。')}
              </p>
            ) : null}

            <ul className="register__rows">
              {group.subjects.map((subject) => (
                <li key={subject.id}>
                  <button
                    type="button"
                    className="register__row"
                    onClick={() => onOpenSubject(subject)}
                    aria-label={t(`Open ${subject.title}`, `打开 ${subject.title}`)}
                  >
                    <span className="register__row-icon" aria-hidden>
                      <Layers size={14} strokeWidth={2} />
                    </span>
                    <span className="register__row-title selectable">{subject.title}</span>
                    <span className="register__row-meta">
                      {subject.eventCount > 0 ? (
                        <>
                          <span className="register__row-count">
                            {t(
                              `${subject.eventCount} ${subject.eventCount === 1 ? 'entry' : 'entries'}`,
                              `${subject.eventCount} 条记录`,
                            )}
                          </span>
                          {subject.lastEventAt ? (
                            <span className="register__row-when">
                              <CalendarClock size={11} strokeWidth={2} aria-hidden />
                              {formatRelativeDay(subject.lastEventAt)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="register__row-when">
                          {t('Not started', '尚未开始')}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {isPickingStages ? (
        <StageSetPicker
          journeyId={journeyId}
          kind={kind}
          current={set}
          onClose={() => setPickingStages(false)}
        />
      ) : null}
    </div>
  );
}

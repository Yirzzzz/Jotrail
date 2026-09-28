/**
 * Journey Overview — the review surface.
 *
 * Follows the composition of the dark overview reference: current focus, the
 * development so far, the states being tracked, entry points into the journey's
 * own material, milestones, and pinned reading.
 *
 * What it deliberately does **not** copy from that image: the 68% focus ring,
 * the per-capability percentages, and the "5 days to completion" estimate.
 * Nothing in the data measures any of them, and inventing them is the specific
 * thing D-007 and AGENTS.md §7 rule out. The honest version of that panel is
 * "Tracked states": the user's own recorded levels, each dated and backed by a
 * real transition.
 */

import { ArrowRight, CircleDot, Flag, Layers, Pin, Plus } from 'lucide-react';

import { StatusPill } from '@/components/StatusPill';
import { currentFocus, developmentSpine, trackedStates } from '@/domain/development';
import { eventTypeLabel, formatStateValue, onlyHappened } from '@/domain/timeline';
import type {
  Journey,
  JourneyStatus,
  NoteWithLinks,
  RegisterTally,
  StateCategory,
  SubjectSummary,
  TimelineEntry,
} from '@/domain/types';
import { JOURNEY_STATUSES } from '@/domain/types';
import { formatFullDate, formatRelativeDay } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';
import { statusLabel } from '@/components/StatusPill';
import type { JourneyTab } from '@/app/store';
import { LatestProgress } from './LatestProgress';
import { StateDistributions } from './StateDistributions';

interface Props {
  journey: Journey;
  entries: TimelineEntry[];
  notes: NoteWithLinks[];
  counts: { notes: number; tasks: number; openTasks: number; entries: number };
  /** `[kind, count]` per register, for the entry points below. */
  registers?: [string, number][];
  /**
   * How many things sit at each stage, per register. Empty for a Journey that
   * tracks nothing, which is most of them.
   */
  tallies?: RegisterTally[];
  categories?: StateCategory[];
  subjects?: SubjectSummary[];
  classificationError?: string | null;
  onSelectTab: (tab: JourneyTab) => void;
  onOpenNote: (noteId: string) => void;
  onStatusChange: (status: JourneyStatus) => Promise<void>;
  /** Opens the dialog that starts a new register. */
  onTrackSomething?: () => void;
}

export function JourneyOverview({
  journey,
  entries,
  notes,
  counts,
  registers = [],
  tallies = [],
  categories = [],
  subjects = [],
  classificationError,
  onSelectTab,
  onOpenNote,
  onStatusChange,
  onTrackSomething,
}: Props) {
  const { t } = useI18n();
  const focus = currentFocus(entries);
  const spine = developmentSpine(entries, {
    startedAt: journey.startedAt,
    startLabel: t('Started', '开始'),
  });
  const states = trackedStates(entries);
  /*
   * Sorted here rather than inherited from `entries`.
   *
   * The Timeline tab's direction toggle changes the order this component is
   * handed, and a Milestones list that silently reversed because of a control on
   * another tab would be a bug rather than a feature. Milestones read forwards —
   * they are what the journey has reached, in the order it reached them — which
   * matches the development spine just above.
   *
   * "Reached" is also why plans are excluded: a planned milestone belongs on the
   * timeline and in "Up next", and listing it here would put something still
   * ahead of the user among their achievements.
   */
  const milestones = onlyHappened(entries)
    .filter((entry) => entry.importance === 'milestone')
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const pinned = notes.filter((note) => note.pinnedIn.includes(journey.id));

  return (
    <div className="overview">
      {focus ? (
        <section className="focus-card">
          <div className="focus-card__label">
            <CircleDot size={13} strokeWidth={2} aria-hidden />
            {t('Current focus', '当前重点')}
          </div>
          <h3 className="focus-card__title selectable">{focus.title}</h3>
          {focus.summary ? (
            <p className="focus-card__summary selectable">{focus.summary}</p>
          ) : null}
          <div className="focus-card__meta">
            {focus.eventType !== 'event_recorded' || focus.importance === 'milestone' ? (
              <span className="pill pill--quiet">{eventTypeLabel(focus)}</span>
            ) : null}
            <span className="focus-card__when">{formatRelativeDay(focus.occurredAt)}</span>
          </div>
        </section>
      ) : null}

      <LatestProgress points={spine} />

      {states.length > 0 ? (
        <section>
          <h2 className="section-label overview__section-title">
            {t('Tracked states', '状态记录')}
          </h2>
          <ul className="states">
            {states.map((state) => (
              <li key={`${state.field}-${state.subject ?? ''}`} className="states__row">
                <div className="states__identity">
                  <span className="states__subject selectable">
                    {state.subject ?? formatStateValue(state.field)}
                  </span>
                  {state.subject ? (
                    <span className="states__field">{formatStateValue(state.field)}</span>
                  ) : null}
                </div>

                <div className="states__value">
                  {state.previous ? (
                    <>
                      <span className="states__previous">
                        {formatStateValue(state.previous)}
                      </span>
                      <ArrowRight size={12} strokeWidth={2} aria-hidden />
                    </>
                  ) : null}
                  <span className="pill pill--accent">{formatStateValue(state.current)}</span>
                </div>

                <span className="states__when">
                  {formatRelativeDay(state.changedAt)}
                  {state.changeCount > 1 ? (
                    <span className="states__count">
                      {' · '}
                      {t(`${state.changeCount} changes`, `${state.changeCount} 次变化`)}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        Where each register's things currently stand.

        Placed after Tracked states because both answer "where are things now",
        and before the entry points because it *is* the reason to open one. The
        user asked for this on the Overview specifically.

        Counts only, in the stage names the user chose. No percentage and no
        funnel — a stage says what something is now and carries no position at all,
        so independent counts side by side, biggest first, is the honest shape
        (D-007, D-043, AGENTS.md §7).
      */}
      {classificationError ? (
        <p className="error-banner" role="alert">
          {classificationError}
        </p>
      ) : null}
      <StateDistributions
        tallies={tallies}
        categories={categories}
        subjects={subjects}
        onOpenRegister={(kind) => onSelectTab({ register: kind })}
      />

      {/*
        The reference shows Papers/Projects/Skills here. Those are per-journey
        custom views (D-003, post-MVP); these link to the tabs that actually
        exist, with real counts.
      */}
      <section>
        <h2 className="section-label overview__section-title">
          {t('In this Journey', '旅程内容')}
        </h2>
        <div className="entry-points">
          <EntryPoint
            label={t('Timeline', '时间线')}
            count={counts.entries}
            noun="entry"
            onClick={() => onSelectTab('timeline')}
          />
          <EntryPoint
            label={t('Notes', '笔记')}
            count={counts.notes}
            noun="note"
            onClick={() => onSelectTab('notes')}
          />
          <EntryPoint
            label={t('Tasks', '任务')}
            count={counts.tasks}
            noun="task"
            hint={
              counts.openTasks > 0
                ? t(`${counts.openTasks} open`, `${counts.openTasks} 项待完成`)
                : undefined
            }
            onClick={() => onSelectTab('tasks')}
          />

          {/*
            The registers this Journey has, alongside the three built-in tabs.
            Same treatment on purpose: a register is a first-class part of a
            Journey, not a special feature bolted beside it.
          */}
          {registers.map(([kind, total]) => (
            <EntryPoint
              key={kind}
              label={kind}
              count={total}
              noun="item"
              onClick={() => onSelectTab({ register: kind })}
            />
          ))}
        </div>

        {/*
          The way in. On the Overview rather than the tab strip because creating a
          register is a rare, deliberate act, and a permanent `+` among the tabs
          would advertise structure-building on a screen whose job is writing
          (AGENTS.md §1).
        */}
        {onTrackSomething ? (
          <button type="button" className="button overview__track" onClick={onTrackSomething}>
            {registers.length === 0 ? (
              <Layers size={14} strokeWidth={2} aria-hidden />
            ) : (
              <Plus size={14} strokeWidth={2} aria-hidden />
            )}
            {registers.length === 0
              ? t('Track a kind of thing', '创建一个清单')
              : t('Another kind of thing', '再建一个清单')}
          </button>
        ) : null}

        {registers.length === 0 ? (
          <p className="field__hint" style={{ marginTop: 'var(--space-2)' }}>
            {t(
              'For a Journey that accumulates things — papers, positions, films. Each one gets its own tab, and its stage is read from the events you record about it.',
              '如果旅程中逐渐积累了论文、岗位、电影等内容，可以按类型创建清单。每个清单都有自己的标签页，阶段会根据你记录的事件更新。',
            )}
          </p>
        ) : null}
      </section>

      {milestones.length > 0 ? (
        <section>
          <h2 className="section-label overview__section-title">{t('Milestones', '里程碑')}</h2>
          <ul className="milestones">
            {milestones.map((entry) => (
              <li key={entry.id} className="milestones__row">
                <Flag size={12} strokeWidth={2} aria-hidden className="milestones__icon" />
                <span className="milestones__title selectable">{entry.title}</span>
                <span className="milestones__date">{formatFullDate(entry.occurredAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pinned.length > 0 ? (
        <section>
          <h2 className="section-label overview__section-title">
            {t('Pinned reading', '置顶阅读')}
          </h2>
          <div className="note-list">
            {pinned.map((note) => (
              <button
                key={note.id}
                type="button"
                className="note-row"
                onClick={() => onOpenNote(note.id)}
              >
                <div className="note-row__head">
                  <span className="note-row__title">
                    <Pin
                      size={11}
                      strokeWidth={2}
                      aria-hidden
                      style={{ marginRight: 6, color: 'var(--pen-1-ink)' }}
                    />
                    {note.title}
                  </span>
                  <span className="note-row__date">{formatRelativeDay(note.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="section-label overview__section-title">{t('About', '关于')}</h2>
        <p className="overview__about selectable">
          {journey.description ?? t('No description yet.', '还没有描述。')}
        </p>
        <div className="rail__row">
          <span className="rail__row-label">{t('Started', '开始时间')}</span>
          <span className="rail__row-value">{formatFullDate(journey.startedAt)}</span>
        </div>
        <div className="rail__row">
          <span className="rail__row-label">{t('Status', '状态')}</span>
          <span className="rail__row-value">
            <StatusPill status={journey.status} />
          </span>
        </div>
      </section>

      <section>
        <h2 className="section-label overview__section-title">
          {t('Change status', '更改状态')}
        </h2>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {JOURNEY_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={`button ${journey.status === status ? 'button--outline' : ''}`}
              aria-pressed={journey.status === status}
              onClick={() => void onStatusChange(status)}
            >
              {statusLabel(status)}
            </button>
          ))}
        </div>
        <p className="field__hint" style={{ marginTop: 'var(--space-3)' }}>
          {t(
            'Status changes are kept on the timeline, so the history stays readable.',
            '状态变化会保留在时间线上，方便回看旅程的来路。',
          )}
        </p>
      </section>
    </div>
  );
}

function EntryPoint({
  label,
  count,
  noun,
  hint,
  onClick,
}: {
  label: string;
  count: number;
  noun: string;
  hint?: string;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const nouns: Record<string, string> = {
    entry: '条记录',
    note: '篇笔记',
    task: '项任务',
    item: '项',
  };
  return (
    <button type="button" className="entry-point" onClick={onClick}>
      <span className="entry-point__label">{label}</span>
      <span className="entry-point__count">
        {t(`${count} ${count === 1 ? noun : `${noun}s`}`, `${count} ${nouns[noun] ?? noun}`)}
      </span>
      {hint ? <span className="entry-point__hint">{hint}</span> : null}
    </button>
  );
}

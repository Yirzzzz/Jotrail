/**
 * One timeline entry, with the title left and quiet metadata at the top right.
 *
 * Three densities retain the same event information while presentation varies:
 *
 *   compact   — one line, no chip
 *   normal    — icon, title, excerpt and quiet metadata, on the page
 *   milestone — the same, with a bounded surface and an accent edge
 *
 * A reflection is always given its own block: it is the thing most worth
 * finding when looking back (PRODUCT_SPEC.md §2).
 */

import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  Check,
  CircleCheck,
  FileText,
  Flag,
  Lightbulb,
  ImagePlus,
  Pencil,
  RotateCcw,
  Sparkles,
  Square,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { JourneyIcon } from '@/components/JourneyIcon';
import { StageChip, stageToneStyle } from '@/components/StageChip';
import {
  canRevertConfirmation,
  canEditEventImages,
  densityFor,
  eventTypeLabel,
  formatStateValue,
  isEditable,
  isOpenable,
  isOverdue,
  isPlanned,
  parseStateChange,
  plannedCountdown,
} from '@/domain/timeline';
import type { TimelineEntry } from '@/domain/types';
import { formatFullDate, formatTimeOfDay, isSameLocalDay } from '@/lib/datetime';
import { penStyle } from '@/lib/pens';
import { useI18n } from '@/lib/i18n';
import { EventImageGallery } from './EventImages';

interface Props {
  entry: TimelineEntry;
  /** Journey badges are shown on the global timeline, not inside a journey. */
  showJourneys?: boolean;
  /** Latest turning point on a Journey timeline (reference image 1). */
  highlighted?: boolean;
  onOpen?: (entry: TimelineEntry) => void;
  /** Edit eligible wording, or manage a confirmed plan without rewriting history. */
  onEdit?: (entry: TimelineEntry) => void;
  /**
   * Offered only on planned entries: the act of saying a commitment happened.
   * This is the affordance that turns a deadline into a record.
   */
  onMarkHappened?: (entry: TimelineEntry) => void;
}

/** The chip icon per event kind, so a timeline is scannable down the left edge. */
const CHIP_ICONS: Record<string, LucideIcon> = {
  note_logged: FileText,
  state_changed: Sparkles,
  task_completed: CircleCheck,
  task_added: CircleCheck,
  task_reopened: RotateCcw,
  journey_status_changed: Briefcase,
  event_recorded: Flag,
};

export function TimelineEntryView({
  entry,
  showJourneys = false,
  highlighted = false,
  onOpen,
  onEdit,
  onMarkHappened,
}: Props) {
  const { t } = useI18n();
  const density = densityFor(entry);
  const openable = isOpenable(entry) && Boolean(onOpen);
  /*
   * Editable and openable are disjoint by construction: openable needs a note
   * source, and an editable entry is always a recorded event, which has none.
   * That is what lets the pencil be a real <button> — an openable entry renders
   * as a button itself, and nesting one inside it would be invalid HTML. If
   * either rule is ever widened, this is the assumption that breaks.
   */
  const manageable =
    (isEditable(entry) || canEditEventImages(entry) || canRevertConfirmation(entry)) &&
    Boolean(onEdit);
  /*
   * Same disjointness argument, and it holds for the same reason: a planned
   * entry is one the user recorded by hand, so it has no note source and never
   * renders as a button.
   */
  const planned = isPlanned(entry);
  const confirmable = planned && Boolean(onMarkHappened);

  /*
   * An entry inherits the pen of the Journey it belongs to, so a milestone's cap
   * and chip are that channel's colour rather than always pen 1. An entry in two
   * Journeys takes the first — the tags below it name both.
   */
  const channelPen = entry.journeys[0] ? penStyle(entry.journeys[0].id) : undefined;

  const className = [
    'entry',
    `entry--${density}`,
    entry.eventType === 'task_reopened' ? 'entry--reopened' : '',
    highlighted ? 'entry--latest' : '',
    // The dashed edge that says "not yet true", and its overdue variant.
    planned ? 'entry--planned' : '',
    planned && isOverdue(entry) ? 'entry--overdue' : '',
    // A staged entry takes its stage's colour on the left edge.
    entry.stageTone ? 'entry--staged' : '',
  ]
    .filter(Boolean)
    .join(' ');

  /*
   * The pen, plus the stage tone when there is one.
   *
   * Both are custom properties on the same element, and they do not compete: the
   * pen colours the chip and the milestone cap (which Journey this belongs to),
   * while the stage tone colours only the left edge (what state the thing it is
   * about reached). Keeping them on separate marks is what stops a timeline of
   * staged entries from losing its channel identity.
   */
  const entryStyle = entry.stageTone
    ? { ...channelPen, ...stageToneStyle(entry.stageTone) }
    : channelPen;

  const content =
    density === 'compact' ? (
      <CompactBody
        entry={entry}
        showJourneys={showJourneys}
        onEdit={manageable ? onEdit : undefined}
      />
    ) : (
      <FullBody
        entry={entry}
        density={density}
        showJourneys={showJourneys}
        onEdit={manageable ? onEdit : undefined}
        onMarkHappened={confirmable ? onMarkHappened : undefined}
      />
    );

  if (openable) {
    // Without an explicit label the accessible name would be the entire entry
    // read aloud — time, type, title, excerpt and reflection.
    return (
      <button
        type="button"
        id={`timeline-entry-${entry.id}`}
        className={className}
        style={entryStyle}
        onClick={() => onOpen?.(entry)}
        aria-label={t(`Open ${entry.title}`, `打开 ${entry.title}`)}
        title={t(`Open ${entry.title}`, `打开 ${entry.title}`)}
      >
        {content}
      </button>
    );
  }

  return (
    <div id={`timeline-entry-${entry.id}`} className={className} style={entryStyle}>
      {content}
    </div>
  );
}

function EventActionsButton({
  entry,
  onEdit,
}: {
  entry: TimelineEntry;
  onEdit?: (entry: TimelineEntry) => void;
}) {
  const { t } = useI18n();
  if (!onEdit) return null;
  const editable = isEditable(entry);
  const label = editable
    ? t(`Edit ${entry.title}`, `编辑 ${entry.title}`)
    : canEditEventImages(entry) && !canRevertConfirmation(entry)
      ? t(`Edit images for ${entry.title}`, `编辑 ${entry.title} 的图片`)
      : t(`Manage ${entry.title}`, `管理 ${entry.title}`);
  const Icon = editable ? Pencil : canRevertConfirmation(entry) ? RotateCcw : ImagePlus;
  return (
    <button
      type="button"
      className="icon-button entry__edit"
      onClick={() => onEdit(entry)}
      title={label}
      aria-label={label}
    >
      <Icon size={13} strokeWidth={2} aria-hidden />
    </button>
  );
}

function CompactBody({
  entry,
  showJourneys,
  onEdit,
}: {
  entry: TimelineEntry;
  showJourneys: boolean;
  onEdit?: (entry: TimelineEntry) => void;
}) {
  useI18n();
  const reopened = entry.eventType === 'task_reopened';
  return (
    <>
      <div className="entry__head">
        <div className="entry__heading">
          <span className="entry__icon">
            {reopened ? (
              <RotateCcw size={13} strokeWidth={2} aria-hidden />
            ) : (
              <Check size={14} strokeWidth={2.5} aria-hidden />
            )}
          </span>
          <span className="entry__title selectable">{entry.title}</span>
          <EventActionsButton entry={entry} onEdit={onEdit} />
        </div>
        <div className="entry__meta">
          <span className="entry__time">{formatTimeOfDay(entry.occurredAt)}</span>
        </div>
      </div>
      {entry.images.length > 0 ? (
        <EventImageGallery images={entry.images} title={entry.title} />
      ) : null}
      {showJourneys ? <JourneyBadges entry={entry} /> : null}
    </>
  );
}

function FullBody({
  entry,
  density,
  showJourneys,
  onEdit,
  onMarkHappened,
}: {
  entry: TimelineEntry;
  density: 'normal' | 'milestone';
  showJourneys: boolean;
  onEdit?: (entry: TimelineEntry) => void;
  onMarkHappened?: (entry: TimelineEntry) => void;
}) {
  const { t } = useI18n();
  const transition =
    entry.eventType === 'state_changed' ? parseStateChange(entry.payloadJson) : null;
  const planned = isPlanned(entry);
  const overdue = planned && isOverdue(entry);
  // Ordinary events need no type badge; only show labels that add information.
  const showTypeBadge =
    planned || entry.eventType !== 'event_recorded' || entry.importance === 'milestone';
  // A commitment gets the calendar rather than its event kind: what matters
  // about it is that it is *dated*, not what sort of thing it will be.
  const ChipIcon = planned ? CalendarClock : (CHIP_ICONS[entry.eventType] ?? Flag);

  return (
    <div className="entry__surface">
      {/* Metadata shares the title row, wrapping only when the container needs it. */}
      <span className="entry__chip" aria-hidden>
        <ChipIcon size={16} strokeWidth={2} />
      </span>

      <div className="entry__main">
        <div className="entry__head">
          <div className="entry__heading">
            <span className="entry__title selectable">{entry.title}</span>
            <EventActionsButton entry={entry} onEdit={onEdit} />
          </div>

          <div className={`entry__meta${planned ? ' entry__plan' : ''}`}>
            {planned ? (
              <>
                <span className="entry__plan-date">{formatFullDate(entry.occurredAt)}</span>
                <span className="entry__plan-countdown">
                  {plannedCountdown(entry.occurredAt)}
                </span>
              </>
            ) : (
              <span className="entry__time">{formatTimeOfDay(entry.occurredAt)}</span>
            )}
            {/*
              Keep the time and stage together at the trailing edge. The header
              can wrap as a whole inside a narrow timeline or history dialog.
            */}
            {entry.stage ? <StageChip label={entry.stage} tone={entry.stageTone} /> : null}
            {/*
              On a commitment the badge says what it *is* rather than what kind of
              event it will become: "Planned", or "Overdue" once its date has gone
              by unconfirmed. That word is the accessible equivalent of the dashed
              border, so the state never rests on colour alone.
            */}
            {showTypeBadge ? (
              <span className="entry__badge">
                {planned ? (
                  <>
                    <CalendarClock size={10} strokeWidth={2.5} aria-hidden />
                    {overdue ? t('Overdue', '已逾期') : t('Planned', '计划')}
                  </>
                ) : (
                  <>
                    {density === 'milestone' ? (
                      <Flag size={10} strokeWidth={2.5} aria-hidden />
                    ) : null}
                    {eventTypeLabel(entry)}
                  </>
                )}
              </span>
            ) : null}
          </div>
        </div>

        {/*
          Once confirmed, an entry that used to be a plan keeps saying what it
          had been aimed at — the interesting half of meeting a deadline is the
          gap between the two dates. Shown only when they differ, so an event
          confirmed on its target day does not carry a line repeating itself.
        */}
        {!planned && entry.plannedFor && !isSameLocalDay(entry.plannedFor, entry.occurredAt) ? (
          <div className="entry__plan-met">
            <CalendarClock size={11} strokeWidth={2} aria-hidden />
            {t(
              `Planned for ${formatFullDate(entry.plannedFor)}`,
              `原定于 ${formatFullDate(entry.plannedFor)}`,
            )}
          </div>
        ) : null}

        {transition ? (
          <div className="entry__transition">
            {transition.field ? (
              <span className="entry__transition-field">
                {formatStateValue(transition.field)}
              </span>
            ) : null}
            <span className="entry__transition-from">{formatStateValue(transition.from)}</span>
            <ArrowRight size={13} strokeWidth={2} aria-hidden />
            <span className="entry__transition-to">{formatStateValue(transition.to)}</span>
          </div>
        ) : null}

        {/* A transition payload already says what changed; the summary would repeat it. */}
        {entry.summary && !transition ? (
          <p className="entry__summary selectable">{entry.summary}</p>
        ) : null}

        {entry.images.length > 0 ? (
          <EventImageGallery images={entry.images} title={entry.title} />
        ) : null}

        {entry.reflection ? (
          <div className="entry__reflection">
            <div className="entry__reflection-label">
              <Lightbulb size={11} strokeWidth={2} aria-hidden />
              {t('Why?', '为什么？')}
            </div>
            <p className="entry__reflection-body selectable">{entry.reflection}</p>
          </div>
        ) : null}

        {/*
         * Work this event revealed, rendered *inside* it.
         *
         * This is the whole reason a task can carry `originType: 'event'`: an
         * interview and the gaps it exposed are one moment, and reading them as
         * one is what separates this from three unrelated to-dos that happen to
         * share a date. The tasks were stored correctly and rendered nowhere
         * until this existed.
         *
         * Status shows as a mark rather than a control: this is a record of what
         * the event produced, and ticking things off belongs on Today and in the
         * Journey's Tasks tab, where a task is the subject rather than evidence.
         */}
        {entry.tasks.length > 0 ? (
          <div className="entry__revealed">
            <div className="entry__revealed-label">
              <Sparkles size={11} strokeWidth={2} aria-hidden />
              {t('This revealed', '由此发现的待办')}
            </div>
            <ul className="entry__revealed-list">
              {entry.tasks.map((task) => {
                const done = task.status === 'done';
                return (
                  <li
                    key={task.id}
                    className={`entry__revealed-row ${done ? 'entry__revealed-row--done' : ''}`}
                  >
                    <span className="entry__revealed-mark" aria-hidden>
                      {done ? (
                        <CircleCheck size={13} strokeWidth={2.5} />
                      ) : (
                        <Square size={12} strokeWidth={2} />
                      )}
                    </span>
                    <span className="entry__revealed-title selectable">{task.title}</span>
                    <span className="visually-hidden">
                      {done ? t('Done', '已完成') : t('Still open', '待完成')}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {showJourneys ? <JourneyBadges entry={entry} /> : null}

        {/*
          The act that turns a commitment into a record.
          
          Inside the card rather than on hover like the pencil: correcting an
          event is rare, but confirming a plan is the entire reason a planned
          entry exists, and it should be visible without hunting. The label is a
          plain statement of what clicking it means.
        */}
        {onMarkHappened ? (
          <div className="entry__plan-actions">
            <button
              type="button"
              className="button button--outline entry__plan-confirm"
              onClick={() => onMarkHappened(entry)}
              aria-label={t(
                `Mark ${entry.title} as happened`,
                `将 ${entry.title} 标记为已发生`,
              )}
            >
              <Check size={14} strokeWidth={2.5} aria-hidden />
              {t('It happened', '已发生')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function JourneyBadges({ entry }: { entry: TimelineEntry }) {
  if (entry.journeys.length === 0) return null;

  return (
    <div className="entry__journeys">
      {entry.journeys.map((journey) => (
        // Each badge is stamped in its own channel's ink, with the icon and the
        // title beside it — so the pen is never the only thing identifying it.
        <span key={journey.id} className="pill pill--channel" style={penStyle(journey.id)}>
          <JourneyIcon name={journey.icon} size={11} />
          {journey.title}
        </span>
      ))}
    </div>
  );
}

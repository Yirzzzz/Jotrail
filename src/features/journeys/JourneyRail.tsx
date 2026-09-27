/**
 * Journey context rail: About, Pinned, Upcoming (UX_SPEC.md §7).
 *
 * Explicitly not a metrics panel. "Last activity" is here because it answers a
 * real question when reopening an old journey; a progress percentage is not,
 * because life themes do not have one (DECISIONS.md D-007).
 */

import { CalendarClock, Clock3, Flag, Info, Pin, Plus, Target } from 'lucide-react';

import { StatusPill } from '@/components/StatusPill';
import { currentFocus } from '@/domain/development';
import { isOverdue, isPlanned, onlyHappened, plannedCountdown } from '@/domain/timeline';
import type { Journey, NoteWithLinks, TaskWithLinks, TimelineEntry } from '@/domain/types';
import { formatFullDate, formatRelativeDay, formatShortDate } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';

interface Props {
  journey: Journey;
  notes: NoteWithLinks[];
  tasks: TaskWithLinks[];
  entries: TimelineEntry[];
  onOpenNote: (noteId: string) => void;
  onTogglePin: (note: NoteWithLinks) => void;
  onAddEvent: () => void;
}

export function JourneyRail({
  journey,
  notes,
  tasks,
  entries,
  onOpenNote,
  onTogglePin,
  onAddEvent,
}: Props) {
  const { t } = useI18n();
  const pinned = notes.filter((note) => note.pinnedIn.includes(journey.id));
  const openTasks = tasks.filter((task) => task.status === 'todo' || task.status === 'doing');
  /*
   * Commitments belong in "Up next" beside the open tasks — they are the other
   * half of what this Journey still owes. Soonest first, and overdue ones lead,
   * which plain ascending order gives for free.
   */
  const plans = entries
    .filter(isPlanned)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const upcoming = openTasks.slice(0, 5);
  /*
   * "Last activity" has to be the last thing that *happened*. The entries arrive
   * oldest-first, so the tail is the newest — and a deadline dated next March
   * would sit there, making a dormant Journey report activity months in the
   * future.
   */
  const happened = onlyHappened(entries);
  const latest = happened.at(-1) ?? happened.at(0);
  const focus = currentFocus(entries);

  return (
    <div className="rail">
      <div className="rail__scroll scroll-area">
        <section className="rail__section">
          <div className="rail__section-head">
            <h2 className="rail__section-title">
              <span className="rail__section-icon">
                <Info size={13} strokeWidth={2} aria-hidden />
              </span>
              {t('About this Journey', '关于此旅程')}
            </h2>
          </div>

          <div className="rail__row">
            <span className="rail__row-label">
              <span className="rail__row-icon">
                <CalendarClock size={12} strokeWidth={2} aria-hidden />
              </span>
              {t('Started', '开始时间')}
            </span>
            <span className="rail__row-value">{formatFullDate(journey.startedAt)}</span>
          </div>
          <div className="rail__row">
            <span className="rail__row-label">
              <span className="rail__row-icon">
                <Flag size={12} strokeWidth={2} aria-hidden />
              </span>
              {t('Status', '状态')}
            </span>
            <span className="rail__row-value">
              <StatusPill status={journey.status} />
            </span>
          </div>
          {latest ? (
            <div className="rail__row">
              <span className="rail__row-label">
                <span className="rail__row-icon">
                  <Clock3 size={12} strokeWidth={2} aria-hidden />
                </span>
                {t('Last activity', '最近动态')}
              </span>
              <span className="rail__row-value">{formatRelativeDay(latest.occurredAt)}</span>
            </div>
          ) : null}
        </section>

        {/* The reference's 焦点 card: what this Journey is currently on. */}
        {focus ? (
          <section className="rail__section">
            <div className="rail__section-head">
              <h2 className="rail__section-title">
                <span className="rail__section-icon">
                  <Target size={13} strokeWidth={2} aria-hidden />
                </span>
                {t('Focus', '当前重点')}
              </h2>
            </div>
            <p className="rail__focus-title selectable">{focus.title}</p>
            <p className="rail__focus-when">{formatRelativeDay(focus.occurredAt)}</p>
          </section>
        ) : null}

        <section className="rail__section">
          <div className="rail__section-head">
            <h2 className="rail__section-title">
              <span className="rail__section-icon">
                <Pin size={13} strokeWidth={2} aria-hidden />
              </span>
              {t('Pinned notes', '置顶笔记')}
            </h2>
          </div>
          {pinned.length === 0 ? (
            <p className="rail__empty">
              {t(
                'Pin a note to keep it within reach while this Journey is open.',
                '置顶一篇笔记，打开此旅程时就能随时找到它。',
              )}
            </p>
          ) : (
            <ul>
              {pinned.map((note) => (
                <li key={note.id} className="rail__row">
                  <button
                    type="button"
                    className="rail__row-value"
                    style={{
                      textAlign: 'left',
                      color: 'var(--ink)',
                      flex: 1,
                      minWidth: 0,
                    }}
                    onClick={() => onOpenNote(note.id)}
                    title={note.title}
                  >
                    {note.title}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onTogglePin(note)}
                    title={t('Unpin', '取消置顶')}
                    aria-label={t(`Unpin ${note.title}`, `取消置顶 ${note.title}`)}
                  >
                    <Pin size={13} strokeWidth={2} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rail__section">
          <div className="rail__section-head">
            <h2 className="rail__section-title">
              <span className="rail__section-icon">
                <CalendarClock size={13} strokeWidth={2} aria-hidden />
              </span>
              {t('Up next', '接下来')}
            </h2>
          </div>
          {plans.length === 0 && upcoming.length === 0 ? (
            <p className="rail__empty">{t('Nothing outstanding.', '没有待办事项。')}</p>
          ) : (
            <ul>
              {plans.map((plan) => (
                <li key={plan.id} className="rail__row">
                  <span className="rail__row-value" style={{ flex: 1, textAlign: 'left' }}>
                    {plan.title}
                  </span>
                  {/* The countdown, in the warning ink once the date has passed. */}
                  <span
                    className="rail__row-label"
                    style={isOverdue(plan) ? { color: 'var(--warning)' } : undefined}
                  >
                    {isOverdue(plan)
                      ? t('Overdue', '已逾期')
                      : plannedCountdown(plan.occurredAt)}
                  </span>
                </li>
              ))}
              {upcoming.map((task) => (
                <li key={task.id} className="rail__row">
                  <span className="rail__row-value" style={{ flex: 1, textAlign: 'left' }}>
                    {task.title}
                  </span>
                  {task.dueAt ? (
                    <span className="rail__row-label">{formatShortDate(task.dueAt)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/*
         * The rail's one action, and the only filled control in the margin. Not
         * wrapped in a card: a card would imply it is a section of information,
         * and it is a button.
         */}
        <button type="button" className="button rail__record" onClick={onAddEvent}>
          <Plus size={14} strokeWidth={2} aria-hidden />
          {t('Record an event', '记录事件')}
        </button>
      </div>
    </div>
  );
}

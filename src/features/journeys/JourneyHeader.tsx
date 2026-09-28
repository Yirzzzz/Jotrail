/**
 * Journey header and tabs — the head of this channel's own strip (D-032).
 *
 * Leads with identity and intent, not statistics. The channel designation and
 * the pen's gradient rule identify which of the four pens this Journey draws in;
 * the title is set in the display face at stamp scale, because on the Journey
 * screen the *Journey* is what the sheet is about.
 *
 * No cover band. The previous header put the title on a photographic slot the
 * user has not filled, so every Journey opened on the same pale placeholder —
 * 208px of decoration above the content. Covers remain a real product idea
 * (D-029); they are simply not the header's structure.
 *
 * Tabs are the four generic ones — no Positions/Skills, which belong to future
 * per-journey custom views (AGENTS.md §7, DECISIONS.md D-003).
 */

import {
  CalendarRange,
  Clock3,
  FileText,
  LayoutGrid,
  Layers,
  SquareCheck,
  Tags,
} from 'lucide-react';
import { useState } from 'react';
import { ClassificationManager } from '@/features/registers/ClassificationManager';
import type { LucideIcon } from 'lucide-react';

import { ChartTrace } from '@/components/ChartTrace';
import { JourneyIcon } from '@/components/JourneyIcon';
import { StatusPill } from '@/components/StatusPill';
import { samplesForWindow, type TraceWindow } from '@/domain/trace';
import type { Journey, TimelineEntry } from '@/domain/types';
import { formatDateRange } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';
import { penForJourney, penStyle } from '@/lib/pens';
import type { JourneyTab } from '@/app/store';
import { sameTab, tabKey } from '@/app/store';

const TABS: { id: JourneyTab; label: string; chinese: string; icon: LucideIcon }[] = [
  { id: 'timeline', label: 'Timeline', chinese: '时间线', icon: Clock3 },
  { id: 'notes', label: 'Notes', chinese: '笔记', icon: FileText },
  { id: 'tasks', label: 'Tasks', chinese: '任务', icon: SquareCheck },
  { id: 'overview', label: 'Overview', chinese: '概览', icon: LayoutGrid },
];

interface Props {
  journey: Journey;
  tab: JourneyTab;
  counts: { notes?: number; tasks?: number };
  /** The Journey's own events, for the channel trace across its whole span. */
  entries: TimelineEntry[];
  /**
   * Registers this Journey actually has, as `[kind, count]`. Empty for a Journey
   * that tracks nothing, which is most of them — a register is opt-in, so the
   * tab strip stays four items until the user creates one.
   */
  registers?: [string, number][];
  onSelectTab: (tab: JourneyTab) => void;
}

export function JourneyHeader({
  journey,
  tab,
  counts,
  entries,
  registers = [],
  onSelectTab,
}: Props) {
  const { t } = useI18n();
  const [managingCategories, setManagingCategories] = useState(false);
  const window = journeySpan(journey);
  const samples = samplesForWindow(entries, window);
  // The pen is still running only while the Journey is, which is when NOW applies.
  const isLive = journey.status === 'active' || journey.status === 'planning';

  return (
    <>
      <header className="journey__header" style={penStyle(journey.id)}>
        <div className="journey__marks">
          <span className="section-label">{t('Channel', '轨道')}</span>
          <span className="readout journey__channel">CH{penForJourney(journey.id)}</span>
          <StatusPill status={journey.status} />
          <button
            type="button"
            className="button journey__classifications"
            onClick={() => setManagingCategories(true)}
          >
            <Tags size={13} aria-hidden />
            {t('Manage categories', '管理分类')}
          </button>
        </div>

        <div className="journey__identity">
          <span className="journey__icon" aria-hidden>
            <JourneyIcon name={journey.icon} size={20} />
          </span>
          <div className="journey__identity-text">
            <h1 className="journey__title selectable">{journey.title}</h1>
            {journey.description ? (
              <p className="journey__intent selectable">{journey.description}</p>
            ) : null}
          </div>
        </div>

        <div className="journey__meta">
          <span className="journey__meta-item">
            <CalendarRange size={13} strokeWidth={2} aria-hidden />
            {formatDateRange(journey.startedAt, journey.endedAt)}
          </span>
          {/*
            The reference also shows a 目标 (goal) line here. There is no goal
            field on a Journey, and repeating the title to fill the slot would
            be decoration — so it stays out until the field exists.
          */}
        </div>

        {/*
          A compact trace keeps the Journey's overall span visible while the
          dated records below remain the main reading surface.
        */}
        {samples.length > 0 ? (
          <div className="journey__trace">
            <ChartTrace
              samples={samples}
              window={window}
              showStylus={isLive}
              height={44}
              label={t(
                `${journey.title}: ${samples.length} ${samples.length === 1 ? 'mark' : 'marks'} across ${formatDateRange(journey.startedAt, journey.endedAt)}.`,
                `${journey.title}：${formatDateRange(journey.startedAt, journey.endedAt)}，共 ${samples.length} 条记录。`,
              )}
            />
            <div className="journey__trace-axis" aria-hidden>
              <span className="readout">{shortDate(journey.startedAt)}</span>
              <span className="readout">
                {journey.endedAt ? shortDate(journey.endedAt) : t('Now', '现在')}
              </span>
            </div>
          </div>
        ) : null}
      </header>

      <div className="journey__tabs" role="tablist" aria-label={t('Journey views', '旅程视图')}>
        {TABS.map(({ id, label, chinese, icon: Icon }) => {
          const count =
            id === 'notes' ? counts.notes : id === 'tasks' ? counts.tasks : undefined;
          return (
            <button
              key={tabKey(id)}
              type="button"
              role="tab"
              className="journey__tab"
              aria-selected={sameTab(tab, id)}
              onClick={() => onSelectTab(id)}
            >
              <Icon size={14} strokeWidth={2} aria-hidden />
              {t(label, chinese)}
              {count !== undefined && count > 0 ? (
                <span className="journey__tab-count">{count}</span>
              ) : null}
            </button>
          );
        })}

        {/*
          One tab per register, after the four generic ones.

          The label is the user's own `kind` — 岗位, 论文 — because unlike the tabs
          above it is not chrome (D-019). The count is real: it is how many things
          are in that register.
        */}
        {registers.map(([kind, total]) => {
          const id: JourneyTab = { register: kind };
          return (
            <button
              key={tabKey(id)}
              type="button"
              role="tab"
              className="journey__tab"
              aria-selected={sameTab(tab, id)}
              onClick={() => onSelectTab(id)}
            >
              <Layers size={14} strokeWidth={2} aria-hidden />
              {kind}
              {total > 0 ? <span className="journey__tab-count">{total}</span> : null}
            </button>
          );
        })}
      </div>
      {managingCategories ? (
        <ClassificationManager
          key={journey.id}
          journeyId={journey.id}
          onClose={() => setManagingCategories(false)}
        />
      ) : null}
    </>
  );
}

/**
 * The window the channel's trace spans: the Journey's start to its end, or to
 * now while it is still running.
 *
 * A single-day Journey would collapse to a zero-width window, so the floor is
 * one day — otherwise every mark would land on the same pixel.
 */
function journeySpan(journey: Journey): TraceWindow {
  const fromMs = Date.parse(journey.startedAt);
  const toMs = journey.endedAt ? Date.parse(journey.endedAt) : Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  const safeFrom = Number.isFinite(fromMs) ? fromMs : Date.now() - oneDay;
  const safeTo = Number.isFinite(toMs) ? toMs : Date.now();

  return { fromMs: safeFrom, toMs: Math.max(safeTo, safeFrom + oneDay) };
}

/**
 * `8/12`, for the ends of the trace's axis.
 *
 * Numeric and locale-pinned: an axis tick is a coordinate, not prose, and it has
 * to stay narrow enough not to collide with the tick opposite. The OS locale
 * would render this as `8月12日` on a Chinese system — five glyphs where two
 * figures belong, and English chrome by decision (PRODUCT.md).
 */
function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

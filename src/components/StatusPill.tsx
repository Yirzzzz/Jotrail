/**
 * Journey status as a small tag. Statuses are qualitative by design — the
 * product does not put a completion percentage on a life theme (DECISIONS.md
 * D-007).
 *
 * In the recorder world (D-032) status is the *pen's condition*, and it is
 * carried by an icon as well as a word: a running pen, a lifted pen, a closed
 * trace. Colour is the third signal, never the first, so the tag still reads in
 * greyscale and for anyone who cannot separate the hues.
 */

import { Archive, Check, Circle, Pause, PenLine } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { JourneyStatus } from '@/domain/types';
import { translate, useI18n } from '@/lib/i18n';

/*
 * The words are the incumbent product vocabulary, unchanged. The world supplies
 * the marks, not new terminology: renaming a status is a product decision, not a
 * visual one.
 */
const LABELS: Record<JourneyStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived',
};

const CHINESE_LABELS: Record<JourneyStatus, string> = {
  planning: '计划中',
  active: '进行中',
  paused: '已暂停',
  completed: '已完成',
  archived: '已归档',
};

/** The pen's condition, as a mark. */
const ICONS: Record<JourneyStatus, LucideIcon> = {
  planning: Circle,
  active: PenLine,
  paused: Pause,
  completed: Check,
  archived: Archive,
};

/** Only the two live states earn colour; the rest stay neutral. */
const VARIANTS: Record<JourneyStatus, string> = {
  planning: 'pill--warm',
  active: 'pill--channel',
  paused: '',
  completed: '',
  archived: '',
};

export function statusLabel(status: JourneyStatus): string {
  return translate(LABELS[status], CHINESE_LABELS[status]);
}

export function StatusPill({ status }: { status: JourneyStatus }) {
  const { t } = useI18n();
  const Icon = ICONS[status];
  return (
    <span className={`pill ${VARIANTS[status]}`.trim()}>
      <Icon size={11} strokeWidth={2} aria-hidden />
      {t(LABELS[status], CHINESE_LABELS[status])}
    </span>
  );
}

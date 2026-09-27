/**
 * Time helpers.
 *
 * The rule the whole app follows: timestamps are stored as UTC ISO-8601 and
 * rendered — and, importantly, *grouped* — in the viewer's local timezone.
 * Grouping by UTC day would file a 00:30 local entry under the previous day for
 * anyone east of Greenwich, so every key below is derived from local getters.
 */

import { getIntlLocale, translate } from './i18n';

const FORMAT_OPTIONS = {
  monthYear: { month: 'long', year: 'numeric' },
  weekday: { weekday: 'short' },
  month: { month: 'short' },
  fullDate: { month: 'short', day: 'numeric', year: 'numeric' },
  shortDate: { month: 'short', day: 'numeric' },
  time: { hour: '2-digit', minute: '2-digit', hour12: false },
  greeting: { weekday: 'long', month: 'long', day: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(kind: keyof typeof FORMAT_OPTIONS): Intl.DateTimeFormat {
  const locale = getIntlLocale();
  const key = `${locale}:${kind}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, FORMAT_OPTIONS[kind]);
    formatters.set(key, cached);
  }
  return cached;
}

/** Parse a stored timestamp, returning `null` rather than an Invalid Date. */
export function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `YYYY-MM-DD` in local time — the timeline's day bucket. */
export function localDayKey(iso: string): string {
  const date = toDate(iso);
  if (!date) return 'unknown';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `YYYY-MM` in local time — the timeline's month bucket. */
export function localMonthKey(iso: string): string {
  const date = toDate(iso);
  if (!date) return 'unknown';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** `AUGUST 2026`, matching the month rules in the primary design reference. */
export function formatMonthHeading(iso: string): string {
  const date = toDate(iso);
  return date ? formatter('monthYear').format(date).toUpperCase() : '';
}

export function formatDayOfMonth(iso: string): string {
  const date = toDate(iso);
  return date ? pad(date.getDate()) : '--';
}

/** `TUE` */
export function formatWeekdayShort(iso: string): string {
  const date = toDate(iso);
  return date ? formatter('weekday').format(date).toUpperCase() : '';
}

/** `SEP` — shown on the date rail when the month changes. */
export function formatMonthAbbrev(iso: string): string {
  const date = toDate(iso);
  return date ? formatter('month').format(date).toUpperCase() : '';
}

/**
 * Time-of-day greeting for the Today hero. The
 * hour boundaries follow evening-first use (PRODUCT.md) rather than splitting
 * the night into a false "morning".
 */
export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return translate('Good morning', '早上好');
  if (hour >= 12 && hour < 18) return translate('Good afternoon', '下午好');
  return translate('Good evening', '晚上好');
}

/** `Tuesday, August 12` — enough for a day you are already inside. */
export function formatGreetingDate(date: Date = new Date()): string {
  return formatter('greeting').format(date);
}

/** `8/25` — compact date for the Latest progress path. */
export function formatCompactDate(iso: string): string {
  const date = toDate(iso);
  if (!date) return '';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** `14:30` */
export function formatTimeOfDay(iso: string): string {
  const date = toDate(iso);
  return date ? formatter('time').format(date) : '';
}

/** `Aug 12, 2026` */
export function formatFullDate(iso: string | null | undefined): string {
  const date = toDate(iso);
  return date ? formatter('fullDate').format(date) : '—';
}

/** `Aug 12` */
export function formatShortDate(iso: string | null | undefined): string {
  const date = toDate(iso);
  if (!date) return '—';
  return formatter('shortDate').format(date);
}

/** `2026.08.12 — Now`, as shown under the journey title. */
export function formatDateRange(startedAt: string, endedAt: string | null): string {
  const start = toDate(startedAt);
  if (!start) return '';
  const dotted = (date: Date) =>
    `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
  const end = toDate(endedAt);
  return `${dotted(start)} — ${end ? dotted(end) : translate('Now', '至今')}`;
}

/**
 * `Today` / `Yesterday` / `Aug 12` — for note lists, where an exact timestamp
 * is more precision than the reader wants.
 */
export function formatRelativeDay(iso: string, now: Date = new Date()): string {
  const date = toDate(iso);
  if (!date) return '—';

  const days = differenceInLocalDays(date, now);
  if (days === 0) return translate('Today', '今天');
  if (days === 1) return translate('Yesterday', '昨天');
  if (days > 1 && days < 7) return translate(`${days} days ago`, `${days} 天前`);
  if (date.getFullYear() === now.getFullYear()) return formatShortDate(iso);
  return formatFullDate(iso);
}

/** Whole local days between two instants, ignoring time of day. */
export function differenceInLocalDays(earlier: Date, later: Date): number {
  const a = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  const b = new Date(later.getFullYear(), later.getMonth(), later.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function isSameLocalDay(a: string, b: string): boolean {
  return localDayKey(a) === localDayKey(b);
}

/** `YYYY-MM-DD` for `<input type="date">`, in local time. */
export function dateInputValue(iso: string | null | undefined): string {
  const date = toDate(iso);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `HH:MM` for `<input type="time">`, in local time. */
export function timeInputValue(iso: string | null | undefined): string {
  const date = toDate(iso);
  if (!date) return '';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Turn local date/time form fields back into a UTC timestamp. Missing time
 * means "some point that day", which we place at noon so the entry cannot slip
 * into a neighbouring day when read in a nearby timezone.
 */
export function fromDateTimeInputs(date: string, time?: string): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!dateMatch) return null;
  const [, year, month, day] = dateMatch;

  let hours = 12;
  let minutes = 0;
  if (time && time.trim()) {
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!timeMatch) return null;
    hours = Number(timeMatch[1]);
    minutes = Number(timeMatch[2]);
    if (hours > 23 || minutes > 59) return null;
  }

  const local = new Date(Number(year), Number(month) - 1, Number(day), hours, minutes, 0, 0);
  return Number.isNaN(local.getTime()) ? null : local.toISOString();
}

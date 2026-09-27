/**
 * Note presentation helpers.
 *
 * `deriveTitle` mirrors `notes::derive_title` in Rust. The duplication is
 * deliberate: the editor needs to show the title it is about to save while the
 * user types, and the backend needs a backstop so a title can never be blank in
 * the database. Both tested; both trivial.
 */

import type { NoteWithLinks } from './types';
import { translate } from '@/lib/i18n';

const EXCERPT_LIMIT = 160;

/** First meaningful line of the body, used when no explicit title is set. */
export function deriveTitle(body: string): string {
  const line = body
    .split('\n')
    .map((raw) => raw.replace(/^#+/, '').trim())
    .find((raw) => raw.length > 0);
  if (!line) return 'Untitled';
  return [...line].slice(0, 80).join('');
}

/** Flattened preview for lists and timeline summaries. */
export function excerpt(body: string, limit = EXCERPT_LIMIT): string {
  const flattened = body
    .split('\n')
    .map((raw) => raw.replace(/^#+/, '').trim())
    .filter((raw) => raw.length > 0)
    .join(' · ');

  const characters = [...flattened];
  if (characters.length <= limit) return flattened;
  return `${characters.slice(0, limit).join('').trimEnd()}…`;
}

/**
 * Excerpt for a timeline summary, skipping a first line that merely repeats the
 * title. Mirrors `notes::excerpt` in Rust — without this a logged note prints
 * the same text as both its heading and its summary.
 */
export function summaryExcerpt(body: string, title: string, limit = EXCERPT_LIMIT): string {
  const lines = body
    .split('\n')
    .map((raw) => raw.replace(/^#+/, '').trim())
    .filter((raw) => raw.length > 0);

  if (lines[0] === title.trim()) lines.shift();

  const flattened = lines.join(' · ');
  const characters = [...flattened];
  if (characters.length <= limit) return flattened;
  return `${characters.slice(0, limit).join('').trimEnd()}…`;
}

/** Body with a leading `# Title` line removed, so it isn't shown twice. */
export function bodyWithoutTitleHeading(note: Pick<NoteWithLinks, 'title' | 'bodyMd'>): string {
  const lines = note.bodyMd.split('\n');
  const firstMeaningful = lines.findIndex((line) => line.trim().length > 0);
  if (firstMeaningful === -1) return note.bodyMd;

  const candidate = lines[firstMeaningful] ?? '';
  const heading = /^#{1,6}\s+(.*)$/.exec(candidate.trim());
  if (heading && heading[1]?.trim() === note.title.trim()) {
    return lines.slice(firstMeaningful + 1).join('\n');
  }
  return note.bodyMd;
}

/** Rough reading time, shown as note metadata. Counts CJK characters as words. */
export function readingTime(body: string): string | null {
  const latinWords = body.match(/[A-Za-z0-9'’-]+/g)?.length ?? 0;
  const cjkCharacters = body.match(/[㐀-䶿一-鿿぀-ヿ]/g)?.length ?? 0;
  const words = latinWords + cjkCharacters;
  if (words === 0) return null;

  const minutes = Math.max(1, Math.round(words / 220));
  return translate(`${minutes} min read`, `阅读约 ${minutes} 分钟`);
}

/**
 * Word count, on the same counting rule as `readingTime` so the two figures can
 * never disagree in the same panel: Latin words plus CJK characters, because a
 * Chinese character is closer to a word than to a letter.
 */
export function wordCount(body: string): number {
  const latinWords = body.match(/[A-Za-z0-9'’-]+/g)?.length ?? 0;
  const cjkCharacters = body.match(/[㐀-䶿一-鿿぀-ヿ]/g)?.length ?? 0;
  return latinWords + cjkCharacters;
}

/**
 * Other notes reachable from this one, by shared Journey.
 *
 * This is the honest form of the reference's "Related notes" panel. There is no
 * similarity model and no tag system to relate notes by, but a shared Journey is
 * a real, user-made connection — the user filed both notes under the same thread
 * themselves. Ordered by how many Journeys they share, then by recency.
 */
export function relatedNotes(
  note: NoteWithLinks,
  all: NoteWithLinks[],
  limit = 4,
): NoteWithLinks[] {
  const journeyIds = new Set(note.journeys.map((journey) => journey.id));
  if (journeyIds.size === 0) return [];

  return all
    .filter((candidate) => candidate.id !== note.id)
    .map((candidate) => ({
      note: candidate,
      shared: candidate.journeys.filter((journey) => journeyIds.has(journey.id)).length,
    }))
    .filter((entry) => entry.shared > 0)
    .sort(
      (left, right) =>
        right.shared - left.shared || right.note.updatedAt.localeCompare(left.note.updatedAt),
    )
    .slice(0, limit)
    .map((entry) => entry.note);
}

/** Human label for a note's type. Free-form types still render sensibly. */
export function noteTypeLabel(noteType: string): string {
  switch (noteType) {
    case 'note':
      return translate('Note', '笔记');
    case 'learning':
      return translate('Learning note', '学习笔记');
    case 'reflection':
      return translate('Reflection', '反思');
    case 'log':
      return translate('Log', '记录');
    default:
      return noteType
        .replace(/[_-]+/g, ' ')
        .replace(/^./, (character) => character.toUpperCase());
  }
}

/**
 * Register presentation logic, plus the title grouper.
 *
 * A **register** is one kind of tracked thing inside a Journey — papers,
 * positions, films. The things themselves are `Subject` rows; everything else a
 * register shows is derived from the events that point at them, so a row can
 * never disagree with its own history.
 *
 * All pure, so the rules stay testable without a renderer or a database.
 */

import type {
  ProposedSubject,
  RegisterTally,
  StageOption,
  StageTone,
  SubjectSummary,
} from './types';
import { isStageTone } from './types';

/**
 * Human label for a register kind. Free-form kinds still read sensibly, the same
 * way `eventTypeLabel` handles unknown event types.
 *
 * Chrome is English by decision (D-019), but a *kind* is something the user
 * typed — `岗位`, `论文` — so it is shown as written. The known keys below are
 * only the machine-ish defaults the UI might create.
 */
export function kindLabel(kind: string): string {
  switch (kind) {
    case 'paper':
      return 'Papers';
    case 'position':
      return 'Positions';
    case 'film':
      return 'Films';
    case 'book':
      return 'Books';
    default:
      return kind;
  }
}

/** One stage, and the things currently at it. */
export interface StageGroup {
  /** `null` groups the things nothing has been recorded about yet. */
  stage: string | null;
  subjects: SubjectSummary[];
  /**
   * The tone this stage carries, when the register has a set that names it.
   * `null` for an unstaged group, or a stage recorded outside the set.
   */
  tone: StageTone | null;
}

/**
 * Group a register by current stage, most recently active stage first.
 *
 * Grouped rather than a kanban: `AGENTS.md` §12 rules out a board as the product
 * metaphor.
 *
 * **A stage set contributes no order** (D-043, revised). A stage is a label and a
 * colour — it says what something *is now*, not where it sits in a sequence — so
 * ordering the groups by the set would assert a progression the user explicitly
 * said does not exist. What is real is how recently each stage saw movement, and
 * that is the only thing that orders these groups, with or without a set.
 *
 * What the set *does* contribute is **which stages exist at all**, so a stage
 * with nothing at it still appears. That is information a derived vocabulary
 * could never provide — it is the answer to "is anything at 大修" — and having no
 * activity, such a group naturally falls to the bottom rather than needing a rule
 * of its own. Things with no events yet come last under a `null` stage: added but
 * not started is a real state, and an honest blank beats inventing a first stage.
 */
export function groupByStage(
  subjects: SubjectSummary[],
  setOptions: StageOption[] = [],
): StageGroup[] {
  const toneOf = new Map<string, StageTone>(
    setOptions.map((option) => [
      option.label,
      isStageTone(option.tone) ? option.tone : 'neutral',
    ]),
  );
  const groups = new Map<string, StageGroup>();

  // Seeded so a stage the set names appears even with nothing at it. This is
  // about existence, not position — the sort below ignores the set entirely.
  for (const option of setOptions) {
    groups.set(option.label, {
      stage: option.label,
      subjects: [],
      tone: toneOf.get(option.label) ?? 'neutral',
    });
  }

  for (const subject of subjects) {
    const key = subject.currentStage ?? '\u0000none';
    const group = groups.get(key) ?? {
      stage: subject.currentStage,
      subjects: [],
      tone: subject.currentStage ? (toneOf.get(subject.currentStage) ?? null) : null,
    };
    group.subjects.push(subject);
    groups.set(key, group);
  }

  const latestActivity = (group: StageGroup): string =>
    group.subjects.reduce(
      (latest, subject) =>
        subject.lastEventAt && subject.lastEventAt > latest ? subject.lastEventAt : latest,
      '',
    );

  return [...groups.values()].sort((left, right) => {
    // The unstarted group always sits at the bottom.
    if (left.stage === null) return 1;
    if (right.stage === null) return -1;

    /*
     * Recency of movement. A stage nothing is at has no activity, so it sorts to
     * the end on this comparison alone; the label tiebreak only settles which of
     * several empty stages reads first, and keeps the order stable between reads.
     */
    const byActivity = latestActivity(right).localeCompare(latestActivity(left));
    return byActivity !== 0 ? byActivity : left.stage.localeCompare(right.stage);
  });
}

/**
 * How many things are in a register, and how many have moved at all.
 *
 * Both are counts of real rows — "9 papers, 7 with something recorded" — which is
 * the honest form of the progress number D-007 refuses. There is deliberately no
 * percentage: a register has no completion, because a set of things you are
 * tracking is not a task list.
 */
export function registerTally(subjects: SubjectSummary[]): {
  total: number;
  withEvents: number;
  stages: number;
} {
  const stages = new Set(
    subjects.map((subject) => subject.currentStage).filter((stage): stage is string => !!stage),
  );
  return {
    total: subjects.length,
    withEvents: subjects.filter((subject) => subject.eventCount > 0).length,
    stages: stages.size,
  };
}

/**
 * A register's cross-section, reduced to the stages worth drawing.
 *
 * Stages with nothing at them are kept in `groupByStage` — an empty group in the
 * register is a real answer — but they are dropped from the *Overview* bar,
 * because a zero-width segment draws nothing and its label would sit against a
 * bar it does not appear in. The count of them is reported in words instead.
 *
 * Deliberately returns no percentages and no widths-as-fractions-of-a-goal. The
 * bar is proportional to the register's own total, which is the only denominator
 * that exists (D-007).
 */
export interface RegisterCrossSection {
  kind: string;
  setName: string | null;
  segments: { label: string; tone: StageTone; count: number; offSet: boolean }[];
  /** Stages in the set that nothing is at, reported rather than drawn. */
  emptyStages: string[];
  unstaged: number;
  total: number;
}

export function crossSection(tally: RegisterTally): RegisterCrossSection {
  return {
    kind: tally.kind,
    setName: tally.setName,
    segments: tally.stages
      .filter((stage) => stage.count > 0)
      .map((stage) => ({
        label: stage.label,
        tone: isStageTone(stage.tone) ? stage.tone : 'neutral',
        count: stage.count,
        offSet: stage.offSet,
      })),
    emptyStages: tally.stages
      .filter((stage) => stage.count === 0 && !stage.offSet)
      .map((stage) => stage.label),
    unstaged: tally.unstaged,
    total: tally.total,
  };
}

// ---------------------------------------------------------------------------
// Grouping titles that were written before registers existed
// ---------------------------------------------------------------------------

/** Longest shared leading run of characters. */
function sharedPrefix(left: string, right: string): string {
  const leftChars = [...left];
  const rightChars = [...right];
  let taken = 0;
  while (taken < leftChars.length && taken < rightChars.length) {
    if (leftChars[taken] !== rightChars[taken]) break;
    taken += 1;
  }
  return leftChars.slice(0, taken).join('');
}

/** Longest shared trailing run of characters. */
function sharedSuffix(left: string, right: string): string {
  const leftChars = [...left].reverse();
  const rightChars = [...right].reverse();
  let taken = 0;
  while (taken < leftChars.length && taken < rightChars.length) {
    if (leftChars[taken] !== rightChars[taken]) break;
    taken += 1;
  }
  return leftChars.slice(0, taken).reverse().join('');
}

const CJK = /[\u3000-\u9fff\uf900-\ufaff]/;

/**
 * Whether two remainders end with the same *word* rather than the same character.
 *
 * The case this exists for: `2026 AAAI 投稿` and `2026 ICML 投稿` share the prefix
 * `2026 `, which ends in a space and would otherwise look like a name. But both
 * remainders end in `投稿`, so the titles diverge in the middle and reconverge —
 * the name has not finished, and `2026` is a year. Whereas `投稿` and
 * `一轮大修返稿` share only `稿`, mid-word, which is coincidence.
 */
function remaindersEndWithSameWord(first: string, second: string): boolean {
  // The shared suffix carries its own leading space (`" 投稿"`), which has to go
  // before the boundary check — otherwise the head reads `AAAI` with no trailing
  // space and the whole condition silently never fires.
  const suffix = sharedSuffix(first, second).replace(/^\s+/, '');
  if (!suffix) return false;

  return [first, second].every((rest) => {
    const head = rest.slice(0, rest.length - suffix.length);
    return head.length === 0 || /\s$/.test(head);
  });
}

/** Whether a shared prefix is believable as a thing's name. */
function prefixIsBelievable(prefix: string, first: string, second: string): boolean {
  if ([...prefix].length < 2) return false;
  if (!first.trim() || !second.trim()) return false;
  if (remaindersEndWithSameWord(first, second)) return false;

  const last = [...prefix].at(-1);
  if (!last) return false;
  if (/\s/.test(last)) return true;

  // A script change is a boundary the writer made without typing a separator:
  // `卫澜深海——VLA` + `一面`.
  const endIsCjk = CJK.test(last);
  return [first, second]
    .map((rest) => [...rest].at(0))
    .every((start) => start !== undefined && CJK.test(start) !== endIsCjk);
}

/**
 * Find things that were written as `name + stage` in event titles.
 *
 * Mirrors `subjects::group_by_shared_prefix` in Rust, which is the real
 * implementation — this copy exists so `dev:web` and the frontend tests behave
 * the same (D-017). Both are tested against the same real titles.
 *
 * The insight is that **repetition reveals the boundary**: a name used twice
 * leaves a shared prefix, so no vocabulary of stage words is needed and the rule
 * is language-neutral. Something recorded only once is deliberately left alone —
 * `上海仙工一面` could be a position at 一面 or one whole event, and only the user
 * knows which.
 *
 * @param titles `[eventId, title]` pairs, in any order.
 */
export function groupTitlesBySharedPrefix(titles: [string, string][]): ProposedSubject[] {
  /*
   * Sorting by title is what makes shared prefixes adjacent, but it is *not* the
   * order events should be reported in — `events` is oldest-first, and the caller
   * shows the stages as a sequence. The input position travels with each title so
   * chronology can be restored per group.
   *
   * Without this, `TMM 一轮大修返稿` sorts before `TMM 投稿` and the preview reads
   * the revision before the submission. A test caught exactly that.
   */
  const indexed: [number, string, string][] = titles.map(([id, title], position) => [
    position,
    id,
    title,
  ]);
  const sorted = [...indexed].sort((left, right) => left[2].localeCompare(right[2]));
  const groups: ProposedSubject[] = [];
  let index = 0;

  while (index < sorted.length) {
    const current = sorted[index]!;
    const next = sorted[index + 1];
    let prefix = '';

    if (next) {
      const candidate = sharedPrefix(current[2], next[2]);
      if (
        prefixIsBelievable(
          candidate,
          current[2].slice(candidate.length),
          next[2].slice(candidate.length),
        )
      ) {
        prefix = candidate;
      }
    }

    if (!prefix) {
      index += 1;
      continue;
    }

    const members = [current, next!];
    let cursor = index + 2;
    // Extend only while the next title shares the *whole* cluster prefix, which
    // is what stops `2026 AAAI` and `2026 ICML` collapsing into `2026`.
    while (cursor < sorted.length) {
      const candidate = sorted[cursor]!;
      if (!candidate[2].startsWith(prefix)) break;
      if (!candidate[2].slice(prefix.length).trim()) break;
      members.push(candidate);
      cursor += 1;
    }

    // Back into the order the events actually happened in.
    members.sort((left, right) => left[0] - right[0]);

    groups.push({
      title: prefix.trim(),
      events: members.map(([, eventId, title]) => [
        eventId,
        title,
        title.slice(prefix.length).trim(),
      ]),
    });
    index = cursor;
  }

  return groups.sort((left, right) => left.title.localeCompare(right.title));
}

/** A title read as "the thing it is about" plus "the stage it reached". */
export interface TitleSplit {
  /** The thing's name — the whole title when no known stage was found. */
  name: string;
  /** The stage the title ended with, when the register already knows that word. */
  stage: string;
}

/**
 * Read a name and a stage out of one event title, using stages the register
 * already knows.
 *
 * `2026 CVPR 投稿` + a register that knows 投稿 → `{ name: '2026 CVPR', stage: '投稿' }`.
 *
 * **Why this is not the guessing the grouper refuses to do.** `group_by_shared_prefix`
 * declines a title recorded only once, because with no second example there is no
 * evidence of where the name ends — `上海仙工一面` could be a position at a stage or a
 * single event about the whole thing. Here the evidence is different and much
 * stronger: the word is one the register's own vocabulary contains, either because a
 * stage set defines it or because the user has typed it on an earlier entry. Nothing
 * is inferred from the shape of the string.
 *
 * It also does not decide anything. Both halves land in visible, editable fields, so
 * a wrong split costs one correction — which is why this does not contradict
 * "状态不预选": it reads what the user wrote rather than choosing on their behalf.
 *
 * The longest match wins, so a vocabulary containing both `一面` and `HR 一面` splits
 * on the more specific one. Matching is case-insensitive for ASCII, and the boundary
 * is deliberately unchecked: CJK titles run words together (`上海仙工一面`), which is
 * exactly the case a whitespace requirement would miss.
 */
export function splitKnownStageFromTitle(title: string, knownStages: string[]): TitleSplit {
  const trimmedTitle = title.trim();

  const matches = knownStages
    .map((stage) => stage.trim())
    .filter((stage) => stage.length > 0)
    .filter((stage) => trimmedTitle.toLowerCase().endsWith(stage.toLowerCase()))
    // A title that *is* the stage names nothing, so it is left whole.
    .filter((stage) => trimmedTitle.length > stage.length)
    .sort((left, right) => right.length - left.length);

  const longestMatch = matches[0];
  if (!longestMatch) return { name: trimmedTitle, stage: '' };

  const name = trimmedTitle.slice(0, trimmedTitle.length - longestMatch.length).trim();
  // Guard the case where the remainder is only punctuation or a separator.
  if (!name) return { name: trimmedTitle, stage: '' };

  return { name, stage: longestMatch };
}

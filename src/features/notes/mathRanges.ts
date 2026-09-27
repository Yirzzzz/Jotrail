/**
 * Finding maths in a Markdown document.
 *
 * Pure text scanning, deliberately, because the Markdown parser knows nothing
 * about LaTeX: `@codemirror/lang-markdown` has no maths extension registered, and
 * to it `\[` is an ordinary paragraph and `_{\text{ACT}}` is emphasis. So the
 * ranges are found here and the editor is told to leave them alone.
 *
 * **Which delimiters, and why not `$…$`.** The user's own notes use `\(…\)` and
 * `\[…\]` — 31 and 54 of them in one note — so those are supported, plus `$$…$$`
 * because it is the common display form. Single `$…$` is **left out on purpose**:
 * this product expects finance Journeys (`存钱买车` is an example in `AGENTS.md`
 * §1), and a note reading `花了 $300 和 $500` would silently become maths. That is
 * a worse failure than not rendering: it destroys the reading of a sentence the
 * user wrote. Easy to add later if it is wanted.
 */

/** One run of maths found in the text. */
export interface MathRange {
  /** Offset of the opening delimiter. */
  from: number;
  /** Offset just past the closing delimiter. */
  to: number;
  /** The LaTeX between the delimiters, untrimmed. */
  source: string;
  /** `\[…\]` and `$$…$$` are display; `\(…\)` is inline. */
  display: boolean;
}

/**
 * Longest opener first, so `$$` is never mistaken for two inline `$`. Order
 * matters for the same reason in `splitKnownStageFromTitle`.
 */
const DELIMITERS: { open: string; close: string; display: boolean }[] = [
  { open: '\\[', close: '\\]', display: true },
  { open: '$$', close: '$$', display: true },
  { open: '\\(', close: '\\)', display: false },
];

/**
 * Maths runs in `text`, in document order and never overlapping.
 *
 * @param isCode Whether an offset sits inside code. A `\(` in a Python fence is
 *   Python, not maths, and this note has five fenced blocks — so the caller passes
 *   the syntax tree's opinion rather than this function guessing.
 */
export function findMathRanges(text: string, isCode: (offset: number) => boolean): MathRange[] {
  const ranges: MathRange[] = [];
  let index = 0;

  while (index < text.length) {
    let advanced = false;

    for (const { open, close, display } of DELIMITERS) {
      if (!text.startsWith(open, index)) continue;

      /*
       * An escaped backslash is not a delimiter: `\\[` is a literal backslash
       * followed by a bracket. Counting the run keeps `\\\\[` correct too.
       */
      if (open.startsWith('\\')) {
        let backslashes = 0;
        for (let at = index - 1; at >= 0 && text[at] === '\\'; at -= 1) backslashes += 1;
        if (backslashes % 2 === 1) continue;
      }

      const contentFrom = index + open.length;
      const closeAt = text.indexOf(close, contentFrom);
      if (closeAt === -1) continue;

      const content = text.slice(contentFrom, closeAt);

      // Nothing between the delimiters is not maths, it is punctuation.
      if (content.trim().length === 0) continue;

      /*
       * A blank line ends a block in Markdown, so a "run" containing one is an
       * unclosed delimiter that happened to find a later partner — treating it as
       * maths would swallow paragraphs of prose into one unreadable widget.
       */
      if (/\n[ \t]*\n/.test(content)) continue;

      // Inline maths does not wrap; a newline means the `\)` was never reached.
      if (!display && content.includes('\n')) continue;

      if (isCode(index)) {
        index = contentFrom;
        advanced = true;
        break;
      }

      ranges.push({ from: index, to: closeAt + close.length, source: content, display });
      index = closeAt + close.length;
      advanced = true;
      break;
    }

    if (!advanced) index += 1;
  }

  return ranges;
}

/** Whether `offset` falls inside any of `ranges`. */
export function offsetInRanges(offset: number, ranges: MathRange[]): boolean {
  return ranges.some((range) => offset >= range.from && offset < range.to);
}

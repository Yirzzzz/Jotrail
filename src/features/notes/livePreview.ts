/**
 * Typora-style live preview for CodeMirror.
 *
 * The idea: Markdown is always *rendered* — headings are large, bold is bold —
 * and the syntax characters that produce it are hidden, except on the line the
 * cursor is on. Put the cursor in a heading and the `##` reappears so it can be
 * edited; move away and it goes quiet again.
 *
 * Nothing here transforms the text. The document stays plain Markdown, so
 * autosave, the timeline and any future export all keep seeing exactly what the
 * user typed — only its presentation changes.
 */

import { ensureSyntaxTree, syntaxTree, syntaxTreeAvailable } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
import { RangeSetBuilder, StateField } from '@codemirror/state';
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import { EditorView } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import katex from 'katex';

import { findMathRanges, offsetInRanges } from './mathRanges';
import { buildTableDom, readTable, TableWidget } from './tableWidget';

/**
 * How long to let a forced parse run, per rebuild, in milliseconds.
 *
 * `ensureSyntaxTree` parses synchronously up to a position within this budget and
 * returns `null` if it cannot finish. 50ms is comfortably enough for a long note —
 * the 12.7k-character note that exposed this parses in single-digit milliseconds —
 * while staying bounded, so a pathological document degrades to partly-styled text
 * rather than freezing the editor. The parse is incremental and cached, so the cost
 * is paid once and later keystrokes reuse it.
 */
const PARSE_BUDGET_MS = 50;

/**
 * How much of the document to force a parse of, in characters.
 *
 * Parsing only as far as the *viewport* is not enough, which was the subtlety in
 * this bug: the viewport is roughly where the lazy parse already stops, so asking
 * for it changes almost nothing. Decorations are also built from `visibleRanges`,
 * which CodeMirror widens beyond the strict viewport as the user scrolls, and
 * those ranges need a tree too.
 *
 * So the whole document is parsed when it is of a size where that is clearly
 * affordable, and notes are. 200k characters is far beyond any hand-written note —
 * the longest here is 12.7k — and past it the budget above takes over and the tree
 * simply covers less, which degrades to the old behaviour rather than to a stall.
 */
const FULL_PARSE_LIMIT = 200_000;

/** Marker nodes hidden when the cursor is not on their line. */
const HIDDEN_MARKS = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'QuoteMark',
  'LinkMark',
  'URL',
  'CodeInfo',
]);

/** Styling applied to the content itself, so it reads as rendered Markdown. */
const NODE_CLASS: Record<string, string> = {
  ATXHeading1: 'cm-md-h1',
  ATXHeading2: 'cm-md-h2',
  ATXHeading3: 'cm-md-h3',
  ATXHeading4: 'cm-md-h4',
  ATXHeading5: 'cm-md-h5',
  ATXHeading6: 'cm-md-h6',
  SetextHeading1: 'cm-md-h1',
  SetextHeading2: 'cm-md-h2',
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-emphasis',
  Strikethrough: 'cm-md-strikethrough',
  InlineCode: 'cm-md-code',
  FencedCode: 'cm-md-block-code',
  CodeBlock: 'cm-md-block-code',
  Blockquote: 'cm-md-quote',
  Link: 'cm-md-link',
  ListItem: 'cm-md-list-item',
  BulletList: 'cm-md-list',
  OrderedList: 'cm-md-list',
  /*
   * GFM tables. The parser emits these (verified against
   * `@codemirror/lang-markdown` directly), but they were missing here, so a
   * table rendered as raw pipes — the one Markdown construct the fourth
   * reference screen uses that the editor could not show.
   *
   * Unlike headings or emphasis, a table's `|` marks are **not hidden**: they
   * are the column boundaries. Hiding them would leave cells with nothing to
   * separate them and no way to line the columns up while editing. So the marks
   * stay and get quietened instead, and the cells get the weight.
   */
  Table: 'cm-md-table',
  TableHeader: 'cm-md-table-header',
  TableRow: 'cm-md-table-row',
  TableCell: 'cm-md-table-cell',
  TableDelimiter: 'cm-md-table-delimiter',
};

const HEADING_NODES = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
]);

/** A drawn horizontal rule, standing in for `---`. */
class RuleWidget extends WidgetType {
  override toDOM(): HTMLElement {
    const rule = document.createElement('hr');
    rule.className = 'cm-md-rule';
    return rule;
  }

  /** All rules are identical, so never rebuild one needlessly. */
  override eq(): boolean {
    return true;
  }
}

/**
 * Rendered maths, replacing its LaTeX while the cursor is elsewhere.
 *
 * KaTeX rather than MathJax: it is synchronous, which a `WidgetType.toDOM` needs,
 * and it is bundled locally, which keeps `AGENTS.md` §2.8's "no network on the
 * critical path" true.
 *
 * `throwOnError: false` is the important setting. A half-typed formula is the
 * normal state of a formula being written, and an exception here would take the
 * editor down with it; instead KaTeX renders the source in its error colour and
 * the user sees what they typed.
 */
class MathWidget extends WidgetType {
  constructor(
    private readonly latex: string,
    private readonly display: boolean,
  ) {
    super();
  }

  override toDOM(): HTMLElement {
    const host = document.createElement(this.display ? 'div' : 'span');
    host.className = this.display ? 'cm-md-math cm-md-math--display' : 'cm-md-math';
    try {
      katex.render(this.latex, host, {
        displayMode: this.display,
        throwOnError: false,
        output: 'html',
      });
    } catch {
      // Belt and braces: even with `throwOnError` off, never let the editor break.
      host.textContent = this.latex;
      host.classList.add('cm-md-math--failed');
    }
    return host;
  }

  /** Same LaTeX in the same mode renders identically, so never rebuild it. */
  override eq(other: MathWidget): boolean {
    return other.latex === this.latex && other.display === this.display;
  }

  /**
   * The widget is not editable and contains no document text, so CodeMirror must
   * not try to map positions into it or read selections out of it.
   */
  override ignoreEvent(): boolean {
    return false;
  }
}

const HIDE = Decoration.replace({});
const RULE = Decoration.replace({ widget: new RuleWidget() });

/**
 * Lines the cursor or selection touches — markup stays visible on these so it
 * can be edited. A selection spanning several lines reveals all of them.
 */
function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const first = view.state.doc.lineAt(range.from).number;
    const last = view.state.doc.lineAt(range.to).number;
    for (let line = first; line <= last; line += 1) lines.add(line);
  }
  return lines;
}

function buildDecorations(view: EditorView): DecorationSet {
  const active = activeLines(view);
  const marks: Range<Decoration>[] = [];
  const decoratedCodeLines = new Set<number>();
  let leadingHeadingDecorated = false;

  /*
   * The parse has to be *forced*, not merely read.
   *
   * CodeMirror parses lazily and `syntaxTree` returns only what happens to be
   * ready. On the note that exposed this — 12,716 characters, 321 lines — the ready
   * tree covered **26.9%** of the document: 6 of 22 headings, 2 of 5 tables, 2 of 5
   * code fences. Past that point there were no nodes, so no decorations, so the
   * rest rendered as raw Markdown ("md 格式没有很好的编译", D-052).
   *
   * `ensureSyntaxTree` parses on demand up to a position. `null` means the budget
   * ran out, and the ready tree is the honest fallback: part of the note renders,
   * which is strictly better than the editor freezing.
   *
   * Short documents are unaffected — they were already fully parsed, so this hands
   * back the same tree they had before.
   */
  const target = Math.min(view.state.doc.length, FULL_PARSE_LIMIT);
  const tree = ensureSyntaxTree(view.state, target, PARSE_BUDGET_MS) ?? syntaxTree(view.state);

  /*
   * Maths first, because it *overrides* Markdown.
   *
   * The parser has no LaTeX extension, so it reads `\mathcal L_{\text{ACT}}` as
   * emphasis and `A_t = [a_t, …]` as a link — and the old code duly hid those
   * "marks", mangling the formula. So the maths ranges are found first and every
   * Markdown decoration inside one is skipped (D-053).
   *
   * Code is asked of the tree rather than guessed: a `\(` inside a Python fence is
   * Python. This note has five fenced blocks.
   */
  const inCode = (offset: number): boolean => {
    const node = tree.resolveInner(offset, 1);
    for (let cursor: typeof node | null = node; cursor; cursor = cursor.parent) {
      if (
        cursor.name === 'FencedCode' ||
        cursor.name === 'CodeBlock' ||
        cursor.name === 'InlineCode'
      ) {
        return true;
      }
    }
    return false;
  };
  const documentText = view.state.doc.toString();
  const firstContentOffset = documentText.search(/\S/);
  const firstContentLine =
    firstContentOffset >= 0 ? view.state.doc.lineAt(firstContentOffset).number : null;
  const mathRanges = findMathRanges(documentText, inCode);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        // Inside maths, Markdown means nothing. Leave the LaTeX exactly as typed.
        if (offsetInRanges(node.from, mathRanges)) return;

        /*
         * The screen already renders the note title above the document. When the
         * first meaningful Markdown line is the same heading, NoteEditor can hide
         * that visual echo while it is not being edited. The line class is always
         * present; the host modifier decides whether this particular note is a
         * duplicate, so a deliberately different opening heading remains visible.
         */
        if (
          !leadingHeadingDecorated &&
          firstContentLine !== null &&
          HEADING_NODES.has(node.name) &&
          view.state.doc.lineAt(node.from).number === firstContentLine
        ) {
          leadingHeadingDecorated = true;
          marks.push(
            Decoration.line({
              attributes: { class: 'cm-md-leading-title-line' },
            }).range(view.state.doc.line(firstContentLine).from),
          );
        }

        /*
         * A mark decoration cannot style an empty line: there is no character range
         * for it to wrap. That split fenced code at every intentional blank line,
         * leaving a stack of grey strips instead of one code block. Line decorations
         * cover the complete parsed block, including empty lines, while still being
         * presentation-only (the document is untouched).
         */
        if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
          const first = view.state.doc.lineAt(node.from).number;
          const last = view.state.doc.lineAt(Math.max(node.from, node.to - 1)).number;

          for (let lineNumber = first; lineNumber <= last; lineNumber += 1) {
            if (decoratedCodeLines.has(lineNumber)) continue;
            decoratedCodeLines.add(lineNumber);

            const classes = ['cm-md-block-code-line'];
            if (lineNumber === first) classes.push('cm-md-block-code-line--start');
            if (lineNumber === last) classes.push('cm-md-block-code-line--end');

            marks.push(
              Decoration.line({ attributes: { class: classes.join(' ') } }).range(
                view.state.doc.line(lineNumber).from,
              ),
            );
          }
        }

        /*
         * `ListMark` covers both `-` and `1.`. They need different reading shapes:
         * an unordered item becomes a real round bullet while unfocused, whereas an
         * ordered item must keep its number. The source marker returns unchanged on
         * the active line, just like every other live-preview construct.
         */
        const className =
          node.name === 'ListMark'
            ? /^[-+*]$/.test(view.state.doc.sliceString(node.from, node.to).trim())
              ? 'cm-md-list-mark cm-md-bullet-mark'
              : 'cm-md-list-mark cm-md-ordered-mark'
            : NODE_CLASS[node.name];
        if (className && node.to > node.from) {
          marks.push(Decoration.mark({ class: className }).range(node.from, node.to));
        }

        if (node.name === 'HorizontalRule') {
          const line = view.state.doc.lineAt(node.from);
          if (!active.has(line.number)) marks.push(RULE.range(node.from, node.to));
          return;
        }

        if (!HIDDEN_MARKS.has(node.name) || node.to <= node.from) return;

        const line = view.state.doc.lineAt(node.from);
        if (active.has(line.number)) return;

        // `# ` and `> ` swallow their trailing space, so the text sits flush.
        if (node.name === 'HeaderMark' || node.name === 'QuoteMark') {
          const next = view.state.doc.sliceString(node.to, node.to + 1);
          marks.push(HIDE.range(node.from, next === ' ' ? node.to + 1 : node.to));
          return;
        }

        marks.push(HIDE.range(node.from, node.to));
      },
    });
  }

  // Decorations must be added in positional order.
  marks.sort((a, b) => a.from - b.from || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  for (const mark of marks) builder.add(mark.from, mark.to, mark.value);
  return builder.finish();
}

/**
 * Recomputes on document, selection and viewport changes, plus when more of the
 * document finishes parsing — the four things that can alter which markup should
 * be visible.
 */
export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      /*
       * The fourth trigger is the one long documents need: as the background
       * parser finishes more of the note, decorations have to be rebuilt over
       * the newly available tree. Without it, a note that arrives faster than it
       * parses keeps whatever it managed on the first pass.
       */
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTreeAvailable(update.state, update.view.viewport.to) !==
          syntaxTreeAvailable(update.startState, update.view.viewport.to)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/**
 * Maths decorations, as a `StateField` rather than part of the view plugin.
 *
 * **This split is not stylistic.** A display formula spans lines — `\\[`, the LaTeX,
 * `\\]` — so replacing it replaces line breaks, and CodeMirror refuses that from a
 * `ViewPlugin`:
 *
 *     RangeError: Decorations that replace line breaks may not be specified via plugins
 *
 * It throws while the editor is being constructed, so the editor never mounts and the
 * note cannot be opened at all. A `StateField` is the supported way to do it, because
 * the editor can account for the changed line structure up front (D-054).
 *
 * Being state rather than view also means it covers the **whole document**, not just
 * the viewport — which is what a formula below the fold needs anyway.
 */
const blockDecorations = StateField.define<DecorationSet>({
  create(state) {
    return buildBlockDecorations(state);
  },
  update(value, transaction) {
    // The selection decides whether a formula shows its source, so both matter.
    if (!transaction.docChanged && !transaction.selection) return value;
    return buildBlockDecorations(transaction.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * Every formula in the document: rendered, or left as source when the selection
 * touches it.
 *
 * Takes `EditorState` rather than `EditorView` because a `StateField` has no view —
 * which is also why it cannot consult the viewport, and does not need to.
 */
function buildBlockDecorations(state: EditorState): DecorationSet {
  /*
   * The parse is **forced**, exactly as the Markdown pass forces it (D-052).
   *
   * `syntaxTree(state)` returns only what happens to be ready, and on the user's
   * 12.7k-character note that was 3,419 characters — enough to see **2 of its 5
   * tables**. The other three were invisible to this field and so were never drawn:
   * the bug D-052 fixed for headings, reintroduced here for tables (D-056).
   *
   * An earlier comment in this spot claimed forcing the parse "would undo D-052's
   * budget". That was wrong. The parse is incremental and cached, which is the reason
   * D-052's fix is affordable at all; the same budget and limit apply here, and a
   * `null` result falls back to the ready tree rather than stalling.
   */
  const target = Math.min(state.doc.length, FULL_PARSE_LIMIT);
  const tree = ensureSyntaxTree(state, target, PARSE_BUDGET_MS) ?? syntaxTree(state);
  const inCode = (offset: number): boolean => {
    const node = tree.resolveInner(offset, 1);
    for (let cursor: typeof node | null = node; cursor; cursor = cursor.parent) {
      if (
        cursor.name === 'FencedCode' ||
        cursor.name === 'CodeBlock' ||
        cursor.name === 'InlineCode'
      ) {
        return true;
      }
    }
    return false;
  };

  const ranges = findMathRanges(state.doc.toString(), inCode);

  /** Everything this field replaces, gathered before sorting into position order. */
  const collected: Range<Decoration>[] = [];

  /*
   * Tables, drawn as real tables (D-055).
   *
   * Emitted from this field rather than the view plugin for the same reason maths is:
   * a table spans lines, and replacing line breaks from a `ViewPlugin` throws (D-054).
   *
   * A table's range is recorded so the maths pass below can skip anything inside it —
   * the user's note has `\\(q(z|x)\\)` in a table cell, and two overlapping
   * replacements would be an error. Cell maths is rendered by the table itself.
   */
  const tableRanges: { from: number; to: number }[] = [];
  const touchesSelection = (from: number, to: number): boolean =>
    state.selection.ranges.some((selection) => selection.to >= from && selection.from <= to);

  tree.iterate({
    from: 0,
    to: state.doc.length,
    enter: (node) => {
      if (node.name !== 'Table') return;
      tableRanges.push({ from: node.from, to: node.to });

      // Being edited: leave every pipe visible so columns can be lined up.
      if (touchesSelection(node.from, node.to)) return;

      const model = readTable(state, node.node);
      // Unreadable while half-typed: show the source rather than a misleading grid.
      if (!model) return;

      const key = state.doc.sliceString(node.from, node.to);
      collected.push(
        Decoration.replace({
          widget: new TableWidget(key, (host) => buildTableDom(state, tree, model, host)),
          // Whole lines, so a block replacement is correct and legal here.
          block: true,
        }).range(node.from, node.to),
      );
    },
  });

  for (const range of ranges) {
    // Maths inside a table is the table's business; two replacements cannot overlap.
    if (tableRanges.some((table) => range.from >= table.from && range.to <= table.to)) {
      continue;
    }
    /*
     * Revealed when the selection *touches the formula*, not merely its line.
     *
     * Line-based was wrong in the worst direction: the cursor rests at offset 0 when
     * a note opens, so a note whose first line held inline maths never rendered at
     * all. A heading owns its line; inline maths shares one with prose.
     */
    const touched = state.selection.ranges.some(
      (selection) => selection.to >= range.from && selection.from <= range.to,
    );

    if (touched) {
      collected.push(
        Decoration.mark({ class: 'cm-md-math-source' }).range(range.from, range.to),
      );
      continue;
    }

    /*
     * `block: true` only for a formula that occupies whole lines. A block
     * replacement must start at a line start and end at a line end, and inline maths
     * does neither — mislabelling it is another way to get a `RangeError`.
     */
    const startsLine = state.doc.lineAt(range.from).from === range.from;
    const endsLine = state.doc.lineAt(range.to).to === range.to;
    const asBlock = range.display && startsLine && endsLine;

    collected.push(
      Decoration.replace({
        widget: new MathWidget(range.source, range.display),
        block: asBlock,
      }).range(range.from, range.to),
    );
  }

  // A `RangeSetBuilder` requires positional order, and tables and maths interleave.
  collected.sort((left, right) => left.from - right.from || left.to - right.to);

  const builder = new RangeSetBuilder<Decoration>();
  for (const decoration of collected) {
    builder.add(decoration.from, decoration.to, decoration.value);
  }
  return builder.finish();
}

/**
 * The whole live-preview behaviour: Markdown decorations from the view plugin, and
 * maths from the state field. Both are needed, and they must be applied together —
 * see `mathDecorations` for why they cannot be one extension.
 */
export const livePreviewExtension: Extension = [blockDecorations, livePreview];

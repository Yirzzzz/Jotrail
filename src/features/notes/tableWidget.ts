/**
 * Rendering a Markdown table as an actual table.
 *
 * Until now the editor styled a table's *parts* — cells got weight, pipes were
 * quietened — and left the pipes in place, on the reasoning that they are the column
 * boundaries and hiding them would make a table impossible to align while editing.
 *
 * That reasoning was wrong about what a reader wants. The user's verdict on the
 * result: *"这个还不是表格"* — this still isn't a table. Faint pipes are still pipes
 * (D-055).
 *
 * So a table is now replaced by a real `<table>` while the cursor is elsewhere, and
 * reverts to its source the moment the selection touches it — the same contract
 * headings and formulas follow. Alignment is honoured; the document is never touched.
 */

import type { SyntaxNode, Tree } from '@lezer/common';
import { WidgetType } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import katex from 'katex';

import { findMathRanges } from './mathRanges';

/** How a column is aligned, read from the `:---:` row. */
export type ColumnAlign = 'left' | 'center' | 'right' | null;

/** One cell: where its content sits in the document. */
interface CellSpan {
  from: number;
  to: number;
}

/** A table, reduced to what the widget needs to draw it. */
export interface TableModel {
  header: CellSpan[];
  rows: CellSpan[][];
  align: ColumnAlign[];
}

/**
 * Column alignments from the delimiter row.
 *
 * The parser hands the whole row over as one `TableDelimiter`
 * (`| ---------- | :----------: |`), so this splits it rather than walking children.
 * A cell is centred when it has colons at both ends, and so on; plain dashes mean no
 * explicit alignment, which is left `null` so the CSS default applies.
 */
export function readAlignments(delimiterRow: string): ColumnAlign[] {
  return delimiterRow
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => {
      const trimmed = cell.trim();
      const left = trimmed.startsWith(':');
      const right = trimmed.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      if (left) return 'left';
      return null;
    });
}

/**
 * Read a `Table` node into a model, or `null` when it has no rows worth drawing.
 *
 * Deliberately tolerant: a table being typed is malformed most of the time, and the
 * honest response to "I cannot read this yet" is to leave the source alone rather
 * than draw something misleading.
 */
export function readTable(state: EditorState, table: SyntaxNode): TableModel | null {
  const header: CellSpan[] = [];
  const rows: CellSpan[][] = [];
  let align: ColumnAlign[] = [];

  for (let child = table.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableHeader') {
      for (let cell = child.firstChild; cell; cell = cell.nextSibling) {
        if (cell.name === 'TableCell') header.push({ from: cell.from, to: cell.to });
      }
      continue;
    }

    if (child.name === 'TableRow') {
      const cells: CellSpan[] = [];
      for (let cell = child.firstChild; cell; cell = cell.nextSibling) {
        if (cell.name === 'TableCell') cells.push({ from: cell.from, to: cell.to });
      }
      if (cells.length > 0) rows.push(cells);
      continue;
    }

    /*
     * The alignment row is a `TableDelimiter` spanning the whole line, unlike the
     * single-pipe delimiters inside header and body rows. Length is what tells them
     * apart, and it is the only multi-character one.
     */
    if (child.name === 'TableDelimiter' && child.to - child.from > 1) {
      align = readAlignments(state.doc.sliceString(child.from, child.to));
    }
  }

  if (header.length === 0 && rows.length === 0) return null;
  return { header, rows, align };
}

/**
 * Inline Markdown inside a cell, rendered into `target`.
 *
 * Cells carry their own formatting — the user's header row is `| **问题** | …` — and a
 * table that showed literal asterisks would have swapped one raw-syntax complaint for
 * another. Handled: bold, italic, strikethrough, inline code, and **maths**, which is
 * what makes `\(q(z|x)\)` inside a cell work.
 *
 * Anything else renders as its own text, so an unknown construct degrades to exactly
 * what the user typed instead of disappearing.
 */
function renderCellInline(
  state: EditorState,
  tree: Tree,
  from: number,
  to: number,
  target: HTMLElement,
): void {
  const text = state.doc.sliceString(from, to);

  /*
   * Maths first, and by offset, because a formula's own braces and underscores would
   * otherwise be read as Markdown — the same precedence D-053 established.
   */
  const maths = findMathRanges(text, () => false);

  /** Emphasis spans from the tree, in document order, excluding anything in maths. */
  const spans: { from: number; to: number; tag: string }[] = [];
  tree.iterate({
    from,
    to,
    enter: (node) => {
      const tag =
        node.name === 'StrongEmphasis'
          ? 'strong'
          : node.name === 'Emphasis'
            ? 'em'
            : node.name === 'Strikethrough'
              ? 's'
              : node.name === 'InlineCode'
                ? 'code'
                : null;
      if (!tag) return;
      const relativeFrom = node.from - from;
      if (maths.some((math) => relativeFrom >= math.from && relativeFrom < math.to)) return;
      spans.push({ from: relativeFrom, to: node.to - from, tag });
    },
  });

  interface Piece {
    from: number;
    to: number;
    render: (parent: HTMLElement) => void;
  }
  const pieces: Piece[] = [];

  for (const math of maths) {
    pieces.push({
      from: math.from,
      to: math.to,
      render: (parent) => {
        const host = document.createElement('span');
        katex.render(math.source, host, {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
        parent.append(host);
      },
    });
  }

  for (const span of spans) {
    // Nested emphasis would double-render; only outermost spans are drawn.
    if (pieces.some((piece) => span.from >= piece.from && span.to <= piece.to)) continue;
    pieces.push({
      from: span.from,
      to: span.to,
      render: (parent) => {
        const element = document.createElement(span.tag);
        // Marks stripped: the point of rendering is that `**` stops being visible.
        element.textContent = stripMarks(text.slice(span.from, span.to));
        parent.append(element);
      },
    });
  }

  pieces.sort((left, right) => left.from - right.from);

  let cursor = 0;
  for (const piece of pieces) {
    if (piece.from < cursor) continue;
    if (piece.from > cursor) target.append(text.slice(cursor, piece.from));
    piece.render(target);
    cursor = piece.to;
  }
  if (cursor < text.length) target.append(text.slice(cursor));
}

/** Emphasis and code markers, removed for display only. */
function stripMarks(text: string): string {
  return text.replace(/^(\*\*|__|\*|_|~~|`)+/, '').replace(/(\*\*|__|\*|_|~~|`)+$/, '');
}

/**
 * A table, drawn.
 *
 * Replaces the Markdown source while the cursor is elsewhere. Not editable in place:
 * clicking it puts the cursor at its edge, which reveals the source — deliberately
 * the same way a heading gives its `##` back, and far simpler than an editable grid
 * that would have to write Markdown back out.
 */
export class TableWidget extends WidgetType {
  /**
   * @param key The table's source text, used only for equality. Two tables with
   *   identical source render identically, so CodeMirror can skip the rebuild.
   */
  constructor(
    private readonly key: string,
    private readonly build: (host: HTMLElement) => void,
  ) {
    super();
  }

  override toDOM(): HTMLElement {
    const host = document.createElement('div');
    host.className = 'cm-md-table-rendered';
    try {
      this.build(host);
    } catch {
      /*
       * Never take the editor down for a table. Falling back to the source keeps the
       * note readable, which is the lesson of the crash in D-054.
       */
      host.textContent = this.key;
      host.classList.add('cm-md-table-rendered--failed');
    }
    return host;
  }

  override eq(other: TableWidget): boolean {
    return other.key === this.key;
  }

  /** Not interactive: clicks fall through to CodeMirror, which moves the cursor. */
  override ignoreEvent(): boolean {
    return false;
  }
}

/** Build the `<table>` for `model` into `host`. */
export function buildTableDom(
  state: EditorState,
  tree: Tree,
  model: TableModel,
  host: HTMLElement,
): void {
  const table = document.createElement('table');

  const alignOf = (column: number): ColumnAlign => model.align[column] ?? null;
  const applyAlign = (cell: HTMLElement, column: number) => {
    const align = alignOf(column);
    if (align) cell.style.textAlign = align;
  };

  if (model.header.length > 0) {
    const thead = document.createElement('thead');
    const row = document.createElement('tr');
    model.header.forEach((span, column) => {
      const cell = document.createElement('th');
      renderCellInline(state, tree, span.from, span.to, cell);
      applyAlign(cell, column);
      row.append(cell);
    });
    thead.append(row);
    table.append(thead);
  }

  if (model.rows.length > 0) {
    const tbody = document.createElement('tbody');
    for (const cells of model.rows) {
      const row = document.createElement('tr');
      cells.forEach((span, column) => {
        const cell = document.createElement('td');
        renderCellInline(state, tree, span.from, span.to, cell);
        applyAlign(cell, column);
        row.append(cell);
      });
      tbody.append(row);
    }
    table.append(tbody);
  }

  host.append(table);
}

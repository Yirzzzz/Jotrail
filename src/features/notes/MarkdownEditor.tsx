/**
 * The Markdown writing surface.
 *
 * CodeMirror 6 with live preview: Markdown renders as you type and the syntax
 * characters hide themselves unless the cursor is on that line. The document
 * stays plain Markdown throughout — see `livePreview.ts`.
 *
 * The props contract is unchanged from the textarea version it replaces
 * (ARCHITECTURE.md §2), so nothing in the note domain had to move.
 */

import { useEffect, useRef } from 'react';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view';
import { tags } from '@lezer/highlight';

/*
 * KaTeX's own stylesheet, bundled rather than fetched from a CDN — `AGENTS.md` §2.8
 * keeps the network off the critical path, and a formula must render offline.
 */
import 'katex/dist/katex.min.css';

import { livePreviewExtension } from './livePreview';
import { useI18n } from '@/lib/i18n';

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  onBlur?: () => void;
  readOnly?: boolean;
  placeholder?: string;
  /** Focus on mount — used when a new note opens. */
  autoFocus?: boolean;
  /** Visually collapse a leading Markdown heading that repeats the title above. */
  hideLeadingTitleHeading?: boolean;
}

/**
 * Syntax colours. Restrained on purpose: this is a notebook, not an IDE. Only
 * code, links and quotes get a colour; prose stays the reading colour.
 */
const highlightStyle = HighlightStyle.define([
  { tag: tags.link, color: 'var(--pen-1-ink)' },
  { tag: tags.url, color: 'var(--ink-tertiary)' },
  { tag: tags.monospace, color: 'var(--pen-3-ink)' },
  { tag: tags.quote, color: 'var(--ink-secondary)' },
  { tag: tags.meta, color: 'var(--ink-tertiary)' },
]);

/**
 * Editor chrome. Sizes come from the design tokens so the writing surface
 * matches the rest of the app and the reading measure stays comfortable
 * (UX_SPEC.md §8).
 */
const theme = EditorView.theme({
  '&': {
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-body)',
    color: 'var(--ink)',
    backgroundColor: 'transparent',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-sans)',
    lineHeight: '1.75',
    // The page scrolls, not a box inside it.
    overflow: 'visible',
  },
  '.cm-content': {
    padding: '0',
    caretColor: 'var(--ink)',
  },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ink)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--pen-1-wash)',
  },
  '.cm-placeholder': { color: 'var(--ink-tertiary)' },
});

export function MarkdownEditor({
  value,
  onChange,
  onSave,
  onBlur,
  readOnly = false,
  placeholder,
  autoFocus = false,
  hideLeadingTitleHeading = false,
}: MarkdownEditorProps) {
  const { t } = useI18n();
  const placeholderText = placeholder ?? t('Start writing…', '开始书写…');
  const bodyLabel = t('Note body', '笔记正文');
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const chrome = useRef(new Compartment());
  const chromeText = useRef({ placeholderText, bodyLabel });

  // Callbacks live in refs so the editor is created once and never torn down
  // mid-typing when a parent re-renders.
  const callbacks = useRef({ onChange, onSave, onBlur });
  callbacks.current = { onChange, onSave, onBlur };

  useEffect(() => {
    if (!host.current) return;

    const editor = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                callbacks.current.onSave?.();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            // Tab indents rather than leaving the editor mid-thought.
            indentWithTab,
          ]),
          markdown({ base: markdownLanguage, codeLanguages: [] }),
          syntaxHighlighting(highlightStyle),
          livePreviewExtension,
          EditorView.lineWrapping,
          theme,
          // The editable surface is a contenteditable div, so it needs to say
          // what it is for screen readers and for tests.
          chrome.current.of([
            placeholderExt(placeholderText),
            EditorView.contentAttributes.of({
              'aria-label': bodyLabel,
              role: 'textbox',
              'aria-multiline': 'true',
            }),
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              callbacks.current.onChange(update.state.doc.toString());
            }
          }),
          EditorView.domEventHandlers({
            blur: () => {
              callbacks.current.onBlur?.();
              return false;
            },
          }),
          EditorState.readOnly.of(readOnly),
        ],
      }),
      parent: host.current,
    });

    view.current = editor;
    /*
     * Exposed for `check:long-note`, which needs to move the selection to answer
     * whether a construct renders when the cursor is elsewhere. Dev builds only —
     * `import.meta.env.DEV` is statically false in the shipped bundle, so this is
     * removed entirely by the build (D-056).
     */
    if (import.meta.env.DEV) {
      (window as unknown as { __cmViewForCheck?: EditorView }).__cmViewForCheck = editor;
    }
    if (autoFocus) editor.focus();

    return () => {
      editor.destroy();
      view.current = null;
    };
    // Created once per mounted note. `NoteEditor` is keyed by note id, so
    // opening a different note remounts this rather than mutating it, and the
    // callbacks are read through a ref so they never need to rebuild the editor.
  }, []);

  // Language updates only the editor's chrome: never replace the view, document,
  // selection or undo history while a note is being written.
  useEffect(() => {
    if (
      chromeText.current.placeholderText === placeholderText &&
      chromeText.current.bodyLabel === bodyLabel
    )
      return;
    chromeText.current = { placeholderText, bodyLabel };
    view.current?.dispatch({
      effects: chrome.current.reconfigure([
        placeholderExt(placeholderText),
        EditorView.contentAttributes.of({
          'aria-label': bodyLabel,
          role: 'textbox',
          'aria-multiline': 'true',
        }),
      ]),
    });
  }, [placeholderText, bodyLabel]);

  /**
   * Accept an externally changed value — a different note loaded into the same
   * editor, or a reload. Skipped while the text already matches, so typing is
   * never interrupted and the cursor never jumps.
   */
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;

    const current = editor.state.doc.toString();
    if (current === value) return;

    editor.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      // Keep the cursor in range rather than resetting it to the start.
      selection: { anchor: Math.min(editor.state.selection.main.anchor, value.length) },
    });
  }, [value]);

  return (
    <div
      className={[
        'editor__surface',
        hideLeadingTitleHeading ? 'editor__surface--title-echo' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      ref={host}
      data-testid="markdown-editor"
    />
  );
}

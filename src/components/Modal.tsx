/**
 * Transient overlay. Closes on Escape and on backdrop click (UX_SPEC.md §11),
 * moves focus in on open and returns it on close.
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import './Modal.css';

interface Props {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** `command` is wider and top-aligned, for the command palette. */
  variant?: 'dialog' | 'command' | 'image';
}

export function Modal({ title, description, onClose, children, variant = 'dialog' }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<Element | null>(null);

  // An image can open over a subject-history dialog. Only the frontmost panel
  // owns keyboard focus and Escape; the underlying dialog must stay open.
  const isTopmost = () =>
    Array.from(document.querySelectorAll('[data-modal-panel]')).at(-1) === panelRef.current;

  useEffect(() => {
    restoreFocusTo.current = document.activeElement;

    // Focus the first field so the user can type immediately.
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'input:not([hidden]):not([disabled]), textarea, select, button:not([disabled]):not([data-autofocus="false"])',
    );
    focusable?.focus();

    return () => {
      if (restoreFocusTo.current instanceof HTMLElement && restoreFocusTo.current.isConnected) {
        restoreFocusTo.current.focus();
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        onClose();
        return;
      }

      // Keep Tab inside the overlay while it is open.
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled') && !element.hidden);

      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return createPortal(
    <div
      className={`modal modal--${variant}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && isTopmost()) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="modal__panel"
        data-modal-panel
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {variant === 'dialog' ? (
          <header className="modal__header">
            <h2 className="modal__title">{title}</h2>
            {description ? <p className="modal__description">{description}</p> : null}
          </header>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}

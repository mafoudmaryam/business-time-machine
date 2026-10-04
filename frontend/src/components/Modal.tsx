import { useEffect, useId, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** A short label for the close button; "Close" by default. */
  closeLabel?: string;
  /** For dialogs that already have their own Cancel button. Esc still closes. */
  hideClose?: boolean;
}

/** A small dialog that keeps the keyboard inside it: focus moves in when it opens, Tab and Shift+Tab stay inside,
 * Esc closes it, and focus goes back to whatever opened it. */
export function Modal({ title, onClose, children, closeLabel = "Close", hideClose = false }: ModalProps) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = box.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? box.current)?.focus();
    return () => opener?.focus();
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (e.key !== "Tab" || !box.current) return;
    const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === firstItem || document.activeElement === box.current)) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && document.activeElement === lastItem) {
      e.preventDefault();
      firstItem.focus();
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={box}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          {!hideClose && (
            <button type="button" className="link-button" onClick={() => onCloseRef.current()}>
              {closeLabel}
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

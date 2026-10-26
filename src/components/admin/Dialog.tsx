"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IClose } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Render as a <form>; submit calls onSubmit. */
  onSubmit?: () => void;
};

/**
 * Modal built on the native <dialog>: focus is trapped and restored, Escape
 * closes it, and the page behind is inert, all by the browser.
 */
export default function Dialog({ open, onClose, title, description, children, footer, onSubmit }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const body = (
    <>
      <div className="a-dialog-head">
        <div>
          <h2 className="a-dialog-title">{title}</h2>
          {description && <p className="a-muted" style={{ marginTop: 6 }}>{description}</p>}
        </div>
        <button type="button" className="a-btn a-btn--ghost a-btn--sm" onClick={onClose} aria-label="Close">
          <IClose size={16} />
        </button>
      </div>
      {children && <div className="a-dialog-body">{children}</div>}
      {footer && <div className="a-dialog-foot">{footer}</div>}
    </>
  );

  return (
    <dialog
      ref={ref}
      className="a-dialog"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
    >
      {open &&
        (onSubmit ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            {body}
          </form>
        ) : (
          body
        ))}
    </dialog>
  );
}

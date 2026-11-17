"use client";

import type { ReactNode } from "react";
import Dialog from "../Dialog";

/**
 * "Are you sure?" for consequential actions (cancel a booking, remove a room).
 * Built on the admin's native <dialog>, so focus, Escape and inertness come
 * from the browser. The safe choice (Keep) is first in tab order.
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Keep",
  destructive = false,
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      onSubmit={onConfirm}
      footer={
        <>
          <button type="button" className="a-btn" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </button>
          <button type="submit" className={`a-btn ${destructive ? "a-btn--danger" : "a-btn--primary"}`} disabled={pending} aria-busy={pending || undefined}>
            {pending && <span className="a-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}

"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { ActionResult } from "@/app/admin/actions";
import { toast } from "../ui/Toaster";
import Dialog from "./Dialog";

type Confirm = {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Ask for a short reason (e.g. for cancellations); passed to the action. */
  reason?: { label: string; placeholder?: string; required?: boolean };
};

type Props = {
  action: (reason?: string) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  confirm?: Confirm;
  success?: string;
  disabled?: boolean;
  title?: string;
};

/** Runs a server action with a pending state, optional confirmation, and a toast. */
export default function ActionButton({ action, children, className = "a-btn", confirm, success, disabled, title }: Props) {
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const go = (why?: string) =>
    start(async () => {
      const res = await action(why);
      if (res.ok) {
        setAsking(false);
        setReason("");
        setError(null);
        toast(success ?? res.message ?? "Done");
      } else if (asking) {
        setError(res.message);
      } else {
        toast.error(res.message);
      }
    });

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled || pending}
        title={title}
        onClick={() => (confirm ? setAsking(true) : go())}
      >
        {pending && !asking && <span className="a-spin" aria-hidden="true" />}
        {children}
      </button>
      {confirm && (
        <Dialog
          open={asking}
          onClose={() => !pending && setAsking(false)}
          title={confirm.title}
          description={confirm.body}
          onSubmit={() => go(reason)}
          footer={
            <>
              <button type="button" className="a-btn" onClick={() => setAsking(false)} disabled={pending}>
                Keep as is
              </button>
              <button
                type="submit"
                className={`a-btn ${confirm.danger ? "a-btn--danger" : "a-btn--primary"}`}
                disabled={pending || (confirm.reason?.required && !reason.trim())}
              >
                {pending && <span className="a-spin" aria-hidden="true" />}
                {confirm.confirmLabel}
              </button>
            </>
          }
        >
          {(confirm.reason || error) && (
            <>
              {confirm.reason && (
                <label className="a-field">
                  <span className="a-label">{confirm.reason.label}</span>
                  <input
                    className="a-input"
                    value={reason}
                    maxLength={300}
                    placeholder={confirm.reason.placeholder}
                    onChange={(e) => setReason(e.target.value)}
                    autoFocus
                  />
                </label>
              )}
              {error && (
                <p className="a-error" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </Dialog>
      )}
    </>
  );
}

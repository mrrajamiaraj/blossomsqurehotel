"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Close, Info } from "../icons";
import styles from "./Toaster.module.css";

export type ToastTone = "default" | "success" | "error" | "info";
export type ToastOptions = {
  tone?: ToastTone;
  /** Second line, in sentence case. */
  description?: string;
  /** One optional action, e.g. Undo or View. */
  action?: { label: string; onClick: () => void };
  /** ms; errors default to 7s, everything else 4.2s. */
  duration?: number;
};
type ToastItem = ToastOptions & { id: number; message: string };

const EVENT = "bsq:toast";

/**
 * Show a toast from anywhere in client code.
 *   toast("Saved")                       — same call as before (neutral)
 *   toast.success("Booking confirmed")
 *   toast.error("Couldn't save", { description: "Check the connection." })
 */
function emit(message: string, options: ToastOptions = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastItem>(EVENT, { detail: { id: 0, message, ...options } }));
}

export const toast = Object.assign((message: string, options?: ToastOptions) => emit(message, options), {
  success: (message: string, options?: Omit<ToastOptions, "tone">) => emit(message, { ...options, tone: "success" }),
  error: (message: string, options?: Omit<ToastOptions, "tone">) => emit(message, { ...options, tone: "error" }),
  info: (message: string, options?: Omit<ToastOptions, "tone">) => emit(message, { ...options, tone: "info" }),
});

const MAX = 3;

/**
 * Bottom-centre stack, newest last, at most three. Pauses while hovered or
 * focused; every toast can be dismissed. Neutral/success/info announce
 * politely; errors use role="alert" so they're read immediately.
 */
export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastItem | string>).detail;
      // Older callers dispatched a bare string.
      const item = typeof detail === "string" ? { id: 0, message: detail } : detail;
      seq.current += 1;
      setItems((list) => [...list, { ...item, id: seq.current }].slice(-MAX));
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  const polite = items.filter((t) => t.tone !== "error");
  const urgent = items.filter((t) => t.tone === "error");

  return (
    <div className={styles.region}>
      <ol role="status" aria-live="polite" className={styles.stack}>
        {polite.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </ol>
      <ol role="alert" aria-live="assertive" className={styles.stack}>
        {urgent.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </ol>
    </div>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(item.duration ?? (item.tone === "error" ? 7000 : 4200));

  useEffect(() => {
    if (paused || leaving) return;
    const started = Date.now();
    const t = window.setTimeout(() => setLeaving(true), remaining.current);
    return () => {
      window.clearTimeout(t);
      remaining.current -= Date.now() - started;
    };
  }, [paused, leaving]);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => onDismiss(item.id), 260);
    return () => window.clearTimeout(t);
  }, [leaving, item.id, onDismiss]);

  const tone = item.tone ?? "default";
  return (
    <li
      className={styles.toast}
      data-tone={tone}
      data-leaving={leaving || undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={styles.icon} aria-hidden="true">
        {tone === "error" ? <span className={styles.bang}>!</span> : tone === "info" ? <Info size={16} /> : <Check size={16} />}
      </span>
      <span className={styles.text}>
        <span className={styles.message}>{item.message}</span>
        {item.description && <span className={styles.description}>{item.description}</span>}
      </span>
      {item.action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            item.action?.onClick();
            setLeaving(true);
          }}
        >
          {item.action.label}
        </button>
      )}
      <button type="button" className={styles.close} aria-label="Dismiss notification" onClick={() => setLeaving(true)}>
        <Close size={14} />
      </button>
    </li>
  );
}

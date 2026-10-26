"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatShort, nightsBetween, toDate } from "@/lib/dates";
import { guestsLabel, stayQuery, type Stay } from "@/lib/stay";
import { ArrowRight, Calendar, Close, Guests } from "../icons";
import { lockScroll } from "../motion/SmoothScroll";
import DateRangePicker from "./DateRangePicker";
import GuestPicker from "./GuestPicker";
import styles from "./StaySearch.module.css";

type Panel = "dates" | "guests" | null;

type Props = {
  today: string;
  initial: Stay;
  /** Where the search goes, e.g. "/rooms" or "/booking". */
  action: string;
  extraParams?: Record<string, string>;
  submitLabel?: string;
  variant?: "hero" | "bar" | "card";
  /** Open panels above the bar (for bars low in the viewport). */
  placement?: "top" | "bottom";
  onChange?: (stay: Stay) => void;
};

const MOBILE = "(max-width: 720px)";

export default function StaySearch({
  today,
  initial,
  action,
  extraParams,
  submitLabel = "Check availability",
  variant = "hero",
  placement = "bottom",
  onChange,
}: Props) {
  const router = useRouter();
  const [stay, setStay] = useState(initial);
  const [panel, setPanel] = useState<Panel>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [pending, setPending] = useState(false);
  const [side, setSide] = useState<"top" | "bottom">(placement);
  const rootRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const id = useId();

  const update = (patch: Partial<Stay>) => {
    const next = { ...stay, ...patch };
    setStay(next);
    onChange?.(next);
  };

  useEffect(() => {
    const mq = window.matchMedia(MOBILE);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const close = useCallback(() => {
    setPanel(null);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  // Outside click and Escape close the panel; the mobile sheet locks scroll.
  useEffect(() => {
    if (!panel) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      // The phone sheet is portalled to <body>, so check it as well as the bar.
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setPanel(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    if (isMobile) lockScroll(true);
    requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("[tabindex='0'], button:not([disabled])")?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      if (isMobile) lockScroll(false);
    };
  }, [panel, isMobile, close]);

  const toggle = (which: Exclude<Panel, null>, e: React.MouseEvent<HTMLButtonElement>) => {
    triggerRef.current = e.currentTarget;
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      // Open towards the side with room, preferring the requested one.
      const need = which === "dates" ? 600 : 420;
      const above = rect.top - 90;
      const below = window.innerHeight - rect.bottom;
      const preferTop = placement === "top";
      setSide(
        preferTop
          ? above >= need || above > below
            ? "top"
            : "bottom"
          : below >= need || below >= above
            ? "bottom"
            : "top",
      );
    }
    setPanel((p) => (p === which ? null : which));
  };

  // Bring an open panel fully into view on short screens.
  useEffect(() => {
    if (!panel || isMobile) return;
    const frame = requestAnimationFrame(() => {
      const r = panelRef.current?.getBoundingClientRect();
      if (!r) return;
      const topLimit = 96;
      let delta = 0;
      if (r.top < topLimit) delta = r.top - topLimit;
      else if (r.bottom > window.innerHeight - 16) delta = Math.min(r.bottom - window.innerHeight + 16, r.top - topLimit);
      if (!delta) return;
      if (window.__lenis) window.__lenis.scrollTo(window.scrollY + delta, { duration: 0.8 });
      else window.scrollBy({ top: delta, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [panel, side, isMobile]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setPanel(null);
    setPending(true);
    router.push(`${action}?${stayQuery(stay, extraParams)}`);
  };

  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const year = (iso: string) => toDate(iso).getUTCFullYear();

  // On phones the panel becomes a bottom sheet; render it at <body> level so
  // no ancestor's stacking context (e.g. the hero) can put the header above it.
  const portal = (node: React.ReactNode) => (isMobile ? createPortal(node, document.body) : node);

  return (
    <form ref={rootRef} className={`${styles.root} ${styles[variant]}`} onSubmit={submit} aria-label="Plan your stay">
      <div className={styles.fields}>
        <button
          type="button"
          className={`${styles.field} ${styles.dates} ${panel === "dates" ? styles.active : ""}`}
          aria-expanded={panel === "dates"}
          aria-controls={`${id}-panel`}
          onClick={(e) => toggle("dates", e)}
        >
          <span className={styles.label}>
            <Calendar size={15} /> Arrive
          </span>
          <span className={styles.value}>
            {formatShort(stay.checkIn)}
            <span className={styles.year}> {year(stay.checkIn)}</span>
          </span>
        </button>

        <button
          type="button"
          className={`${styles.field} ${styles.dates} ${panel === "dates" ? styles.active : ""}`}
          aria-expanded={panel === "dates"}
          aria-controls={`${id}-panel`}
          onClick={(e) => toggle("dates", e)}
        >
          <span className={styles.label}>
            Depart <em className={styles.nights}>· {nights} {nights === 1 ? "night" : "nights"}</em>
          </span>
          <span className={styles.value}>
            {formatShort(stay.checkOut)}
            <span className={styles.year}> {year(stay.checkOut)}</span>
          </span>
        </button>

        <button
          type="button"
          className={`${styles.field} ${styles.guests} ${panel === "guests" ? styles.active : ""}`}
          aria-expanded={panel === "guests"}
          aria-controls={`${id}-panel`}
          onClick={(e) => toggle("guests", e)}
        >
          <span className={styles.label}>
            <Guests size={15} /> Guests
          </span>
          <span className={styles.value}>{guestsLabel(stay)}</span>
        </button>
      </div>

      <button type="submit" className={`btn ${styles.submit}`} disabled={pending}>
        <span>{pending ? "One moment" : submitLabel}</span>
        <ArrowRight />
      </button>

      {panel &&
        portal(
        <>
          {isMobile && <div className={styles.scrim} onClick={() => setPanel(null)} aria-hidden="true" />}
          <div
            ref={panelRef}
            id={`${id}-panel`}
            className={`${styles.panel} ${styles[`panel-${panel}`]} ${side === "top" ? styles.up : ""}`}
            role="dialog"
            aria-modal={isMobile}
            aria-label={panel === "dates" ? "Choose dates" : "Choose guests"}
            data-lenis-prevent
          >
            <div className={styles.panelHead}>
              <p className={styles.panelTitle}>{panel === "dates" ? "When are you coming?" : "Who's coming?"}</p>
              <button type="button" className={styles.panelClose} onClick={close} aria-label="Close">
                <Close size={20} />
              </button>
            </div>
            <div className={styles.panelBody}>
              {panel === "dates" ? (
                <DateRangePicker
                  today={today}
                  checkIn={stay.checkIn}
                  checkOut={stay.checkOut}
                  months={isMobile ? 1 : 2}
                  onChange={(checkIn, checkOut) => update({ checkIn, checkOut })}
                  onComplete={() => window.setTimeout(() => setPanel("guests"), 380)}
                />
              ) : (
                <GuestPicker value={stay} onChange={(g) => update(g)} />
              )}
            </div>
            <div className={styles.panelFoot}>
              <span className={styles.summary}>
                {formatShort(stay.checkIn)} – {formatShort(stay.checkOut)} · {guestsLabel(stay)}
              </span>
              <button type="button" className="btn btn--sm" onClick={close}>
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </form>
  );
}

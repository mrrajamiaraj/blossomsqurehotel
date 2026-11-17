"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { quickSearch, type QuickResult } from "@/app/admin/actions";
import { stayLine } from "@/lib/admin/format";
import type { Permission } from "@/lib/access";
import { StatusBadge } from "./badges";
import {
  IArrowRight,
  IBookings,
  ICalendar,
  IDownload,
  IExternal,
  IGuests,
  IKey,
  IPlus,
  IReports,
  IRooms,
  ISearch,
  ISettings,
  IToday,
} from "./icons";
import styles from "./CommandPalette.module.css";

type Command = {
  id: string;
  label: string;
  group: "Go to" | "Bookings" | "Actions";
  href: string;
  icon: (p: { size?: number }) => React.ReactNode;
  keys?: string;
  words?: string;
  /** Shown only to staff holding this permission. */
  perm?: Permission;
  external?: boolean;
};

const COMMANDS: Command[] = [
  { id: "today", label: "Today", group: "Go to", href: "/admin", icon: IToday, keys: "G T", words: "home dashboard overview" },
  { id: "bookings", label: "Bookings", group: "Go to", href: "/admin/bookings", icon: IBookings, keys: "G B", words: "reservations" },
  { id: "calendar", label: "Calendar", group: "Go to", href: "/admin/calendar", icon: ICalendar, keys: "G C", words: "availability grid" },
  { id: "rooms", label: "Rooms & rates", group: "Go to", href: "/admin/rooms", icon: IRooms, keys: "G R", words: "housekeeping prices clean dirty" },
  { id: "guests", label: "Guests", group: "Go to", href: "/admin/guests", icon: IGuests, keys: "G G", words: "customers people" },
  { id: "reports", label: "Reports", group: "Go to", href: "/admin/reports", icon: IReports, keys: "G P", words: "analytics revenue occupancy adr revpar performance" },
  { id: "settings", label: "Settings", group: "Go to", href: "/admin/settings", icon: ISettings, words: "team staff policies vat", perm: "settings.manage" },
  { id: "account", label: "My account", group: "Go to", href: "/admin/account", icon: IKey, words: "password profile" },

  { id: "v-requests", label: "To confirm", group: "Bookings", href: "/admin/bookings?view=requests", icon: IBookings, words: "pending requests" },
  { id: "v-arrivals", label: "Arriving today", group: "Bookings", href: "/admin/bookings?view=arrivals", icon: IBookings, words: "check in arrivals" },
  { id: "v-inhouse", label: "In house", group: "Bookings", href: "/admin/bookings?view=in_house", icon: IBookings, words: "staying guests" },
  { id: "v-departures", label: "Leaving today", group: "Bookings", href: "/admin/bookings?view=departures", icon: IBookings, words: "check out departures" },
  { id: "v-upcoming", label: "Upcoming", group: "Bookings", href: "/admin/bookings?view=upcoming", icon: IBookings, words: "future" },
  { id: "v-cancelled", label: "Cancelled", group: "Bookings", href: "/admin/bookings?view=cancelled", icon: IBookings, words: "no-show" },

  { id: "new", label: "New booking", group: "Actions", href: "/admin/bookings/new", icon: IPlus, keys: "N", words: "create add walk-in phone" },
  { id: "r-month", label: "Report: this month", group: "Actions", href: "/admin/reports?period=mtd", icon: IReports, words: "month to date mtd" },
  { id: "r-last", label: "Report: last month", group: "Actions", href: "/admin/reports?period=last_month", icon: IReports, words: "previous month" },
  { id: "r-forward", label: "Report: next 30 days on the books", group: "Actions", href: "/admin/reports?period=next_30", icon: IReports, words: "forecast pace future" },
  { id: "export", label: "Export last 30 days (CSV)", group: "Actions", href: "/admin/reports/export", icon: IDownload, words: "download excel spreadsheet csv", external: true },
  { id: "site", label: "View website", group: "Actions", href: "/", icon: IExternal, words: "public site", external: true },
];

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, " ");

function score(c: Command, q: string): number {
  if (!q) return 1;
  const label = norm(c.label);
  const hay = `${label} ${norm(c.group)} ${c.words ?? ""}`;
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.every((t) => hay.includes(t))) return 0;
  return label.startsWith(terms[0]!) ? 3 : label.includes(terms[0]!) ? 2 : 1;
}

type Item =
  | { kind: "command"; key: string; command: Command }
  | { kind: "booking"; key: string; booking: QuickResult }
  | { kind: "search"; key: string; q: string };

export default function CommandPalette({ permissions }: { permissions: Permission[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<QuickResult[]>([]);
  const [searching, startSearch] = useTransition();
  const lastQuery = useRef("");

  const open = useCallback(() => {
    const d = dialog.current;
    if (!d || d.open) return;
    setQ("");
    setResults([]);
    setActive(0);
    d.showModal();
    requestAnimationFrame(() => input.current?.focus());
  }, []);
  const close = useCallback(() => dialog.current?.close(), []);

  // Global shortcuts: Ctrl/⌘ K opens; "g then x" jumps; "n" starts a booking.
  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialog.current?.open) close();
        else open();
        return;
      }
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(t.tagName) || t.isContentEditable) return;
      if (dialog.current?.open || document.querySelector("dialog[open]")) return;
      const k = e.key.toLowerCase();
      if (Date.now() - pendingG < 1200) {
        pendingG = 0;
        const target = COMMANDS.find((c) => c.keys === `G ${k.toUpperCase()}`);
        if (target && (!target.perm || permissions.includes(target.perm))) {
          e.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (k === "g") pendingG = Date.now();
      else if (k === "n") {
        e.preventDefault();
        router.push("/admin/bookings/new");
      } else if (e.key === "?") {
        e.preventDefault();
        open();
      }
    };
    const onOpen = () => open();
    document.addEventListener("keydown", onKey);
    window.addEventListener("bsq:palette", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("bsq:palette", onOpen);
    };
  }, [open, close, router, permissions]);

  // Live booking search, debounced; stale answers are dropped.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      lastQuery.current = term;
      startSearch(async () => {
        try {
          const rows = await quickSearch(term);
          if (lastQuery.current === term) setResults(rows);
        } catch {
          if (lastQuery.current === term) setResults([]);
        }
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const term = q.trim();
    const cmds = COMMANDS.filter((c) => !c.perm || permissions.includes(c.perm))
      .map((c) => ({ c, s: score(c, term) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => (term ? b.s - a.s : 0))
      .slice(0, term ? 8 : COMMANDS.length)
      .map(({ c }): Item => ({ kind: "command", key: c.id, command: c }));
    const bookings = results.map((b): Item => ({ kind: "booking", key: b.reference, booking: b }));
    const search: Item[] = term.length >= 2 ? [{ kind: "search", key: "search", q: term }] : [];
    return term ? [...bookings, ...cmds, ...search] : cmds;
  }, [q, results, permissions]);

  useEffect(() => setActive(0), [q, results]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (item: Item | undefined) => {
    if (!item) return;
    close();
    if (item.kind === "booking") router.push(`/admin/bookings/${item.booking.reference}`);
    else if (item.kind === "search") router.push(`/admin/bookings?view=all&q=${encodeURIComponent(item.q)}`);
    else if (item.command.id === "export") window.location.href = item.command.href;
    else if (item.command.external) window.open(item.command.href, "_blank", "noopener");
    else router.push(item.command.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (items.length ? (a + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(items[active]);
    }
  };

  // Group headings in display order.
  let lastGroup = "";
  const term = q.trim();

  return (
    <dialog
      ref={dialog}
      className={`a-dialog ${styles.dialog}`}
      aria-label="Command palette"
      onClick={(e) => e.target === dialog.current && close()}
    >
      <div className={styles.box}>
        <div className={styles.field}>
          <ISearch size={18} />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search bookings, or jump to a page or action…"
            className={styles.input}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          {searching && <span className={styles.spin} aria-label="Searching" />}
          <kbd className={styles.esc}>Esc</kbd>
        </div>

        <div ref={list} id={listId} role="listbox" className={styles.list} aria-label="Results">
          {items.length === 0 && (
            <p className={styles.none}>{term.length < 2 ? "Type to search" : searching ? "Searching…" : `Nothing matches “${term}”`}</p>
          )}
          {items.map((item, i) => {
            const group = item.kind === "booking" ? "Matching bookings" : item.kind === "search" ? "Search" : item.command.group;
            const heading = group !== lastGroup ? group : null;
            lastGroup = group;
            return (
              <div key={item.key} role="presentation">
                {heading && (
                  <p className={styles.group} role="presentation">
                    {heading}
                  </p>
                )}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  className={`${styles.item} ${i === active ? styles.itemOn : ""}`}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => run(item)}
                >
                  {item.kind === "command" && (
                    <>
                      <span className={styles.icon}>
                        <item.command.icon size={17} />
                      </span>
                      <span className={styles.label}>{item.command.label}</span>
                      {item.command.keys && <kbd className={styles.keys}>{item.command.keys}</kbd>}
                    </>
                  )}
                  {item.kind === "booking" && (
                    <>
                      <span className={styles.icon}>
                        <IBookings size={17} />
                      </span>
                      <span className={styles.label}>
                        <strong>{item.booking.guest}</strong>
                        <span className={styles.meta}>
                          {item.booking.reference} · {stayLine(item.booking.checkIn, item.booking.checkOut)} · {item.booking.phone}
                        </span>
                      </span>
                      <StatusBadge status={item.booking.status} />
                    </>
                  )}
                  {item.kind === "search" && (
                    <>
                      <span className={styles.icon}>
                        <ISearch size={17} />
                      </span>
                      <span className={styles.label}>
                        Search all bookings for <strong>&ldquo;{item.q}&rdquo;</strong>
                      </span>
                      <IArrowRight size={15} />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.foot}>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>Enter</kbd> open
          </span>
          <span>
            <kbd>Ctrl</kbd>
            <kbd>K</kbd> toggle
          </span>
          <span className={styles.footHint}>
            Shortcuts: <kbd>G</kbd> then a letter · <kbd>N</kbd> new booking · <kbd>/</kbd> search
          </span>
        </div>
      </div>
    </dialog>
  );
}

/** Opens the palette from anywhere (e.g. a button in the top bar). */
export function openCommandPalette() {
  window.dispatchEvent(new Event("bsq:palette"));
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, MONTHS_LONG, nightsBetween, toDate, toISO } from "@/lib/dates";
import { LIMITS } from "@/lib/stay";
import { ChevronLeft, ChevronRight } from "../icons";
import styles from "./DateRangePicker.module.css";

type Props = {
  today: string;
  checkIn: string;
  checkOut: string;
  onChange: (checkIn: string, checkOut: string) => void;
  /** Called once both dates are chosen. */
  onComplete?: () => void;
  months?: 1 | 2;
};

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function addMonths(iso: string, n: number): string {
  const d = toDate(monthStart(iso));
  d.setUTCMonth(d.getUTCMonth() + n);
  return toISO(d);
}

/** Calendar cells for a month, Monday first, with leading blanks. */
function monthCells(first: string): (string | null)[] {
  const d = toDate(first);
  const lead = (d.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(addDays(first, day - 1));
  return cells;
}

export default function DateRangePicker({ today, checkIn, checkOut, onChange, onComplete, months = 2 }: Props) {
  // While picking, the first click sets check-in and waits for check-out.
  const [pendingIn, setPendingIn] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState(() => monthStart(checkIn));
  const [focusDay, setFocusDay] = useState(checkIn);
  const gridRef = useRef<HTMLDivElement>(null);

  const minMonth = monthStart(today);
  const lastDay = addDays(today, LIMITS.bookAheadDays);
  const maxMonth = monthStart(lastDay);
  const lastView = addMonths(maxMonth, -(months - 1));

  const rangeStart = pendingIn ?? checkIn;
  const rangeEnd = pendingIn ? (hover && hover > pendingIn ? hover : null) : checkOut;

  const isDisabled = (iso: string) => {
    if (iso < today || iso > lastDay) return true;
    if (pendingIn) return iso > pendingIn && nightsBetween(pendingIn, iso) > LIMITS.maxNights;
    return false;
  };

  const pick = (iso: string) => {
    if (isDisabled(iso)) return;
    if (!pendingIn || iso <= pendingIn) {
      setPendingIn(iso);
      onChange(iso, addDays(iso, 1));
      return;
    }
    setPendingIn(null);
    setHover(null);
    onChange(pendingIn, iso);
    onComplete?.();
  };

  // Keep keyboard focus on the active day after it moves.
  useEffect(() => {
    const btn = gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`);
    if (btn && gridRef.current?.contains(document.activeElement)) btn.focus();
  }, [focusDay, view]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = addDays(focusDay, step);
    if (next < today || next > lastDay) return;
    setFocusDay(next);
    if (pendingIn) setHover(next);
    const visibleEnd = addMonths(view, months);
    if (next < view) setView(monthStart(next));
    else if (next >= visibleEnd) setView(addMonths(monthStart(next), -(months - 1)));
  };

  const shown = useMemo(() => Array.from({ length: months }, (_, i) => addMonths(view, i)), [view, months]);
  const nights = rangeEnd ? nightsBetween(rangeStart, rangeEnd) : 0;

  return (
    <div className={styles.picker}>
      <div className={styles.nav}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setView(addMonths(view, -1))}
          disabled={view <= minMonth}
          aria-label="Previous month"
        >
          <ChevronLeft />
        </button>
        <p className={styles.hint} aria-live="polite">
          {pendingIn ? "Now choose your check-out" : nights ? `${nights} ${nights === 1 ? "night" : "nights"}` : "Choose your dates"}
        </p>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setView(addMonths(view, 1))}
          disabled={view >= lastView}
          aria-label="Next month"
        >
          <ChevronRight />
        </button>
      </div>

      <div ref={gridRef} className={styles.months} data-months={months} onKeyDown={onKeyDown} onMouseLeave={() => setHover(null)}>
        {shown.map((first) => {
          const d = toDate(first);
          return (
            <div key={first} className={styles.month}>
              <p className={styles.monthTitle}>
                {MONTHS_LONG[d.getUTCMonth()]} <span>{d.getUTCFullYear()}</span>
              </p>
              <div className={styles.grid} role="grid" aria-label={`${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`}>
                {WEEKDAYS.map((w) => (
                  <span key={w} className={styles.weekday} aria-hidden="true">
                    {w}
                  </span>
                ))}
                {monthCells(first).map((iso, i) => {
                  if (!iso) return <span key={`b${i}`} />;
                  const disabled = isDisabled(iso);
                  const isStart = iso === rangeStart;
                  const isEnd = iso === rangeEnd;
                  const inRange = rangeEnd != null && iso > rangeStart && iso < rangeEnd;
                  const cls = [
                    styles.day,
                    isStart && styles.start,
                    isEnd && styles.end,
                    inRange && styles.inRange,
                    isStart && rangeEnd && styles.hasRange,
                    iso === today && styles.today,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <button
                      key={iso}
                      type="button"
                      data-day={iso}
                      className={cls}
                      disabled={disabled}
                      tabIndex={iso === focusDay ? 0 : -1}
                      aria-pressed={isStart || isEnd}
                      aria-label={`${toDate(iso).toUTCString().slice(0, 16)}${isStart ? ", check-in" : ""}${isEnd ? ", check-out" : ""}`}
                      onClick={() => {
                        setFocusDay(iso);
                        pick(iso);
                      }}
                      onMouseEnter={() => pendingIn && setHover(iso)}
                      onFocus={() => pendingIn && setHover(iso)}
                    >
                      <span>{toDate(iso).getUTCDate()}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

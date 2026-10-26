"use client";

import { useState } from "react";
import { ArrowIcon } from "./icons";
import styles from "./AvailabilityForm.module.css";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_ADULTS = 4;

/** ISO yyyy-mm-dd, handled in UTC so the shown day never shifts by timezone. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function DateText({ iso }: { iso: string }) {
  const d = new Date(`${iso}T00:00:00Z`);
  return (
    <span className={styles.value}>
      {DAYS[d.getUTCDay()]}, {d.getUTCDate()} {MONTHS[d.getUTCMonth()]}
      <span className={styles.year}> {d.getUTCFullYear()}</span>
    </span>
  );
}

function openPicker(e: React.MouseEvent<HTMLInputElement>) {
  try {
    e.currentTarget.showPicker?.();
  } catch {
    // Some browsers refuse showPicker outside a direct gesture; native focus still works.
  }
}

type Props = { today: string; defaultCheckIn: string; defaultCheckOut: string };

export default function AvailabilityForm({ today, defaultCheckIn, defaultCheckOut }: Props) {
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [adults, setAdults] = useState(2);

  const onCheckIn = (value: string) => {
    if (!value) return;
    setCheckIn(value);
    if (checkOut <= value) setCheckOut(addDays(value, 1));
  };

  return (
    <form action="/booking" method="get" aria-label="Check availability" className={styles.form}>
      <label className={`${styles.field} ${styles.checkIn}`}>
        <span className={styles.label}>CHECK-IN</span>
        <DateText iso={checkIn} />
        <input
          type="date"
          name="checkIn"
          className={styles.native}
          value={checkIn}
          min={today}
          required
          onChange={(e) => onCheckIn(e.target.value)}
          onClick={openPicker}
        />
      </label>

      <label className={`${styles.field} ${styles.checkOut}`}>
        <span className={styles.label}>CHECK-OUT</span>
        <DateText iso={checkOut} />
        <input
          type="date"
          name="checkOut"
          className={styles.native}
          value={checkOut}
          min={addDays(checkIn, 1)}
          required
          onChange={(e) => e.target.value && setCheckOut(e.target.value)}
          onClick={openPicker}
        />
      </label>

      <label className={`${styles.field} ${styles.guests}`}>
        <span className={styles.label}>GUESTS</span>
        <select
          name="adults"
          className={styles.select}
          value={adults}
          onChange={(e) => setAdults(Number(e.target.value))}
        >
          {Array.from({ length: MAX_ADULTS }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "adult" : "adults"}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" className={styles.submit}>
        CHECK AVAILABILITY
        <ArrowIcon size={18} className={styles.arrow} />
      </button>
    </form>
  );
}

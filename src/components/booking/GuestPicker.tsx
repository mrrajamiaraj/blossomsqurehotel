"use client";

import { LIMITS, type Stay } from "@/lib/stay";
import { Minus, Plus } from "../icons";
import styles from "./GuestPicker.module.css";

type Guests = Pick<Stay, "adults" | "children" | "rooms">;

type Props = { value: Guests; onChange: (value: Guests) => void };

/** Steppers for rooms, adults and children, kept within room capacity. */
export default function GuestPicker({ value, onChange }: Props) {
  const set = (patch: Partial<Guests>) => {
    const next = { ...value, ...patch };
    // Shrinking rooms pulls guests back within what the rooms hold.
    next.adults = Math.min(Math.max(next.adults, 1), next.rooms * LIMITS.adultsPerRoom);
    next.children = Math.min(next.children, next.rooms * LIMITS.childrenPerRoom);
    onChange(next);
  };

  // Adding a guest beyond what the rooms hold adds a room.
  const addAdult = () => {
    if (value.adults < value.rooms * LIMITS.adultsPerRoom) set({ adults: value.adults + 1 });
    else if (value.rooms < LIMITS.maxRooms) set({ adults: value.adults + 1, rooms: value.rooms + 1 });
  };
  const addChild = () => {
    if (value.children < value.rooms * LIMITS.childrenPerRoom) set({ children: value.children + 1 });
    else if (value.rooms < LIMITS.maxRooms) set({ children: value.children + 1, rooms: value.rooms + 1 });
  };

  const rows = [
    {
      key: "adults",
      label: "Adults",
      note: "Ages 13 and over",
      count: value.adults,
      dec: () => set({ adults: value.adults - 1 }),
      inc: addAdult,
      min: 1,
      max: LIMITS.maxRooms * LIMITS.adultsPerRoom,
    },
    {
      key: "children",
      label: "Children",
      note: "Ages 12 and under",
      count: value.children,
      dec: () => set({ children: value.children - 1 }),
      inc: addChild,
      min: 0,
      max: LIMITS.maxRooms * LIMITS.childrenPerRoom,
    },
    {
      key: "rooms",
      label: "Rooms",
      note: "Up to two adults and a child each",
      count: value.rooms,
      dec: () => set({ rooms: value.rooms - 1 }),
      inc: () => set({ rooms: value.rooms + 1 }),
      min: Math.max(1, Math.ceil(value.adults / LIMITS.adultsPerRoom), Math.ceil(value.children / LIMITS.childrenPerRoom)),
      max: LIMITS.maxRooms,
    },
  ];

  return (
    <div className={styles.list}>
      {rows.map((row) => (
        <div key={row.key} className={styles.row}>
          <div className={styles.text}>
            <span className={styles.label} id={`gp-${row.key}`}>
              {row.label}
            </span>
            <span className={styles.note}>{row.note}</span>
          </div>
          <div className={styles.stepper} role="group" aria-labelledby={`gp-${row.key}`}>
            <button
              type="button"
              className={styles.step}
              onClick={row.dec}
              disabled={row.count <= row.min}
              aria-label={`Fewer ${row.label.toLowerCase()}`}
            >
              <Minus />
            </button>
            <output className={styles.count} aria-live="polite">
              {row.count}
            </output>
            <button
              type="button"
              className={styles.step}
              onClick={row.inc}
              disabled={row.count >= row.max}
              aria-label={`More ${row.label.toLowerCase()}`}
            >
              <Plus />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

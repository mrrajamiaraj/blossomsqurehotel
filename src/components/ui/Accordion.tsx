"use client";

import { useId, useState } from "react";
import { Plus } from "../icons";
import styles from "./Accordion.module.css";

type Item = { title: string; body: string };

/** Disclosure list with a smooth height animation (grid-rows 0fr → 1fr). */
export default function Accordion({ items, defaultOpen = 0 }: { items: Item[]; defaultOpen?: number | null }) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  const id = useId();

  return (
    <div className={styles.list}>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.title} className={`${styles.item} ${isOpen ? styles.open : ""}`}>
            <h3 className={styles.heading}>
              <button
                type="button"
                className={styles.trigger}
                aria-expanded={isOpen}
                aria-controls={`${id}-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span>{item.title}</span>
                <span className={styles.icon}>
                  <Plus size={18} />
                </span>
              </button>
            </h3>
            <div id={`${id}-${i}`} className={styles.panel} role="region" aria-label={item.title}>
              <div className={styles.panelInner}>
                <p>{item.body}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

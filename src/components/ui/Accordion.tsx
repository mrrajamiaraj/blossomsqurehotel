"use client";

import { useId, useState } from "react";
import { Plus } from "../icons";
import styles from "./Accordion.module.css";

type Item = { title: string; body: React.ReactNode };

/**
 * Disclosure list with a smooth height animation (grid-rows 0fr → 1fr).
 * Buttons carry aria-expanded/aria-controls; closed panels are `hidden`
 * from assistive tech and the tab order via `inert`.
 */
export default function Accordion({
  items,
  defaultOpen = 0,
  headingLevel: H = "h3",
}: {
  items: Item[];
  defaultOpen?: number | null;
  headingLevel?: "h2" | "h3" | "h4";
}) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  const id = useId();

  return (
    <div className={styles.list}>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.title} className={`${styles.item} ${isOpen ? styles.open : ""}`}>
            <H className={styles.heading}>
              <button
                type="button"
                id={`${id}-${i}-btn`}
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
            </H>
            <div id={`${id}-${i}`} className={styles.panel} role="region" aria-labelledby={`${id}-${i}-btn`} inert={!isOpen}>
              <div className={styles.panelInner}>{typeof item.body === "string" ? <p>{item.body}</p> : item.body}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

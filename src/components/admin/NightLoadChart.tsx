"use client";

import { useState } from "react";
import type { NightLoad } from "@/lib/admin/metrics";
import { toDate } from "@/lib/dates";
import styles from "./NightLoadChart.module.css";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Rooms sold (solid) and requested (hatched) for each coming night, against
 * the rooms in service. Stacked columns, one baseline, one axis.
 */
export default function NightLoadChart({ nights }: { nights: NightLoad[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const cap = Math.max(1, ...nights.map((n) => n.sellable), ...nights.map((n) => n.sold + n.pending));

  return (
    <figure className={styles.figure}>
      <div className={styles.legend} aria-hidden="true">
        <span>
          <i className={styles.keySold} /> Sold
        </span>
        <span>
          <i className={styles.keyPending} /> Awaiting confirmation
        </span>
        <span>
          <i className={styles.keyCap} /> Rooms in service
        </span>
      </div>

      <div className={styles.plot} onMouseLeave={() => setHover(null)}>
        <div className={styles.axis} aria-hidden="true">
          <span>{cap}</span>
          <span>0</span>
        </div>
        <div className={styles.cols} role="list" aria-label="Rooms sold per night">
          <span className={styles.capLayer} aria-hidden="true">
            <span className={styles.capLine} style={{ bottom: `${((nights[0]?.sellable ?? 0) / cap) * 100}%` }} />
          </span>
          {nights.map((n, i) => {
            const d = toDate(n.date);
            const weekend = d.getUTCDay() === 5 || d.getUTCDay() === 6; // Fri–Sat: Bangladesh weekend
            const label = `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}: ${n.sold} of ${n.sellable} rooms sold${n.pending ? `, ${n.pending} awaiting confirmation` : ""}`;
            return (
              <div
                key={n.date}
                role="listitem"
                tabIndex={0}
                aria-label={label}
                className={`${styles.col} ${weekend ? styles.weekend : ""} ${hover === i ? styles.colOn : ""}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                <div className={styles.stack}>
                  {n.pending > 0 && <span className={styles.pending} style={{ height: `${(n.pending / cap) * 100}%` }} />}
                  {n.sold > 0 && <span className={styles.sold} style={{ height: `${(n.sold / cap) * 100}%` }} />}
                </div>
                <span className={styles.day}>
                  <span>{DOW[d.getUTCDay()].slice(0, 2)}</span>
                  {d.getUTCDate()}
                </span>
                {hover === i && (
                  <span className={styles.tip} role="presentation">
                    <strong>
                      {DOW[d.getUTCDay()]} {d.getUTCDate()} {MON[d.getUTCMonth()]}
                    </strong>
                    <span>
                      <i className={styles.keySold} /> Sold <b>{n.sold}</b>
                    </span>
                    <span>
                      <i className={styles.keyPending} /> Awaiting <b>{n.pending}</b>
                    </span>
                    <span className={styles.tipMuted}>
                      {Math.round((n.sold / Math.max(1, n.sellable)) * 100)}% of {n.sellable} rooms
                    </span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <details className={styles.table}>
        <summary>View as table</summary>
        <table className="a-table">
          <thead>
            <tr>
              <th>Night</th>
              <th className="a-right">Sold</th>
              <th className="a-right">Awaiting</th>
              <th className="a-right">In service</th>
            </tr>
          </thead>
          <tbody>
            {nights.map((n) => {
              const d = toDate(n.date);
              return (
                <tr key={n.date}>
                  <td>
                    {DOW[d.getUTCDay()]} {d.getUTCDate()} {MON[d.getUTCMonth()]}
                  </td>
                  <td className="a-right a-num">{n.sold}</td>
                  <td className="a-right a-num">{n.pending}</td>
                  <td className="a-right a-num">{n.sellable}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

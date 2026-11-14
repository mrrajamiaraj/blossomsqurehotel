"use client";

import { useMemo, useState } from "react";
import type { DayPoint } from "@/lib/admin/reports";
import { toDate } from "@/lib/dates";
import { formatTaka } from "@/lib/format";
import styles from "./TrendChart.module.css";

type Metric = "revenue" | "occupancy" | "adr" | "roomsSold";

const METRICS: { id: Metric; label: string }[] = [
  { id: "revenue", label: "Room revenue" },
  { id: "occupancy", label: "Occupancy" },
  { id: "adr", label: "ADR" },
  { id: "roomsSold", label: "Rooms sold" },
];

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (iso: string) => {
  const d = toDate(iso);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
};
const shortLabel = (iso: string) => {
  const d = toDate(iso);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
};

const valueOf = (d: DayPoint | undefined, m: Metric): number | null => {
  if (!d) return null;
  if (m === "occupancy") return d.occupancy;
  if (m === "adr") return d.adr;
  return d[m];
};

const fmt = (v: number | null, m: Metric) => {
  if (v == null) return "—";
  if (m === "occupancy") return `${Math.round(v * 100)}%`;
  if (m === "roomsSold") return String(v);
  return formatTaka(Math.round(v));
};

const fmtAxis = (v: number, m: Metric) => {
  if (m === "occupancy") return `${Math.round(v * 100)}%`;
  if (m === "roomsSold") return String(Math.round(v));
  if (v >= 100_000) return `৳${Math.round(v / 1000)}k`;
  if (v >= 10_000) return `৳${(v / 1000).toFixed(0)}k`;
  if (v >= 1000) return `৳${(v / 1000).toFixed(1)}k`;
  return `৳${Math.round(v)}`;
};

/** A "nice" ceiling for the y axis: 1, 2, 2.5 or 5 × a power of ten. */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

const W = 1000;
const H = 280;

export default function TrendChart({ days, previous, sellable }: { days: DayPoint[]; previous: DayPoint[]; sellable: number }) {
  const [metric, setMetric] = useState<Metric>("revenue");
  const [compare, setCompare] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const n = days.length;

  const { max, cur, prev } = useMemo(() => {
    const cur = days.map((d) => valueOf(d, metric));
    const prev = days.map((_, i) => valueOf(previous[i], metric));
    const top = Math.max(0, ...cur.map((v) => v ?? 0), ...(compare ? prev.map((v) => v ?? 0) : []));
    const max = metric === "occupancy" ? 1 : metric === "roomsSold" ? Math.max(1, sellable, top) : niceMax(top * 1.08);
    return { max, cur, prev };
  }, [days, previous, metric, compare, sellable]);

  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const y = (v: number) => H - (v / max) * H;

  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const curPath = path(cur);
  const area = n > 1 && metric !== "adr" ? `${path(cur.map((v) => v ?? 0))}L${W},${H}L0,${H}Z` : "";

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelEvery = Math.max(1, Math.ceil(n / 7));
  const showWeekends = n <= 45;

  const at = hover ?? null;
  const leftPct = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setHover(Math.round(t * (n - 1)));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    setHover((h) => {
      const cur = h ?? (e.key === "ArrowLeft" ? n : -1);
      if (e.key === "Home") return 0;
      if (e.key === "End") return n - 1;
      return Math.min(n - 1, Math.max(0, cur + (e.key === "ArrowRight" ? 1 : -1)));
    });
  };

  const total = (vals: (number | null)[]) => vals.reduce<number>((s, v) => s + (v ?? 0), 0);

  return (
    <figure className={styles.figure}>
      <div className={styles.controls}>
        <div className="a-seg" role="group" aria-label="Measure">
          {METRICS.map((m) => (
            <button key={m.id} type="button" aria-pressed={metric === m.id} onClick={() => setMetric(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <label className="a-check">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
          Compare with previous period
        </label>
      </div>

      <div className={styles.legend} aria-hidden="true">
        <span>
          <i className={styles.keyCur} /> This period
        </span>
        {compare && (
          <span>
            <i className={styles.keyPrev} /> Previous period
          </span>
        )}
      </div>

      <div className={styles.plotWrap}>
        <div className={styles.yAxis} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ top: `${(1 - t / max) * 100}%` }}>
              {fmtAxis(t, metric)}
            </span>
          ))}
        </div>

        <div
          className={styles.plot}
          tabIndex={0}
          role="img"
          aria-label={`${METRICS.find((m) => m.id === metric)!.label} per night. Use the arrow keys to step through nights.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          {showWeekends &&
            days.map((d, i) => {
              const dow = toDate(d.date).getUTCDay();
              if (dow !== 5 && dow !== 6) return null;
              const w = n > 1 ? 100 / (n - 1) : 100;
              return <span key={d.date} className={styles.weekend} style={{ left: `${leftPct(i) - w / 2}%`, width: `${w}%` }} />;
            })}
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={styles.svg} aria-hidden="true">
            {ticks.map((t) => (
              <line key={t} x1={0} x2={W} y1={y(t)} y2={y(t)} className={t === 0 ? styles.base : styles.grid} />
            ))}
            {area && <path d={area} className={styles.area} />}
            {compare && <path d={path(prev)} className={styles.prev} />}
            <path d={curPath} className={styles.cur} />
          </svg>

          {n === 1 && cur[0] != null && <span className={styles.dot} style={{ left: "50%", top: `${(y(cur[0]) / H) * 100}%` }} />}

          {at != null && (
            <>
              <span className={styles.cross} style={{ left: `${leftPct(at)}%` }} />
              {compare && prev[at] != null && (
                <span className={`${styles.dot} ${styles.dotPrev}`} style={{ left: `${leftPct(at)}%`, top: `${(y(prev[at]!) / H) * 100}%` }} />
              )}
              {cur[at] != null && <span className={styles.dot} style={{ left: `${leftPct(at)}%`, top: `${(y(cur[at]!) / H) * 100}%` }} />}
              <span
                className={styles.tip}
                style={{ left: `${leftPct(at)}%`, transform: `translateX(${leftPct(at) > 70 ? "calc(-100% - 12px)" : "12px"})` }}
                role="status"
              >
                <strong>{dayLabel(days[at]!.date)}</strong>
                <span>
                  <i className={styles.keyCur} /> {fmt(cur[at] ?? null, metric)}
                </span>
                {compare && previous[at] && (
                  <span className={styles.tipMuted}>
                    <i className={styles.keyPrev} /> {fmt(prev[at] ?? null, metric)} on {shortLabel(previous[at]!.date)}
                  </span>
                )}
                <span className={styles.tipMuted}>
                  {days[at]!.roomsSold} of {sellable} rooms sold
                  {days[at]!.pendingRooms ? ` · ${days[at]!.pendingRooms} pending` : ""}
                </span>
              </span>
            </>
          )}
        </div>

        <div className={styles.xAxis} aria-hidden="true">
          {days.map((d, i) =>
            (i % labelEvery === 0 && (n - 1 - i >= labelEvery / 2 || i === 0)) || (i === n - 1 && n > 1) ? (
              <span key={d.date} style={{ left: `${leftPct(i)}%` }} className={i === n - 1 ? styles.xLast : ""}>
                {shortLabel(d.date)}
              </span>
            ) : null,
          )}
        </div>
      </div>

      {(metric === "revenue" || metric === "roomsSold") && (
        <p className={styles.summary}>
          Total {fmt(total(cur), metric)}
          {compare && total(prev) > 0 && (
            <span>
              {" "}
              · previous {fmt(total(prev), metric)}
            </span>
          )}
        </p>
      )}

      <details className={styles.table}>
        <summary>View as table</summary>
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>Night</th>
                <th className="a-right">Rooms sold</th>
                <th className="a-right">Occupancy</th>
                <th className="a-right">ADR</th>
                <th className="a-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <td>{dayLabel(d.date)}</td>
                  <td className="a-right a-num">{d.roomsSold}</td>
                  <td className="a-right a-num">{Math.round(d.occupancy * 100)}%</td>
                  <td className="a-right a-num">{d.adr == null ? "—" : formatTaka(d.adr)}</td>
                  <td className="a-right a-num">{formatTaka(d.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

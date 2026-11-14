import type { Metadata } from "next";
import Link from "next/link";
import { IDown, IDownload, IUp } from "@/components/admin/icons";
import PrintButton from "@/components/admin/PrintButton";
import TrendChart from "@/components/admin/TrendChart";
import { pct } from "@/lib/admin/format";
import { buildReport, change, PERIOD_PRESETS, resolvePeriod, type Slice } from "@/lib/admin/reports";
import { requireAdmin } from "@/lib/admin/session";
import { addDays, formatRange, hotelToday } from "@/lib/dates";
import { formatTaka } from "@/lib/format";
import styles from "./reports.module.css";

export const metadata: Metadata = { title: "Reports" };

type Params = { period?: string; from?: string; to?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { repo } = await requireAdmin();
  const params = await searchParams;
  const today = hotelToday();
  const period = resolvePeriod(params, today);

  const [rooms, types, window] = await Promise.all([
    repo.listRooms(),
    repo.listRoomTypes({ includeUnpublished: true }),
    repo.bookingsBetween(period.prevFrom, addDays(period.through, 1)),
  ]);

  const typeList = types.map((t) => ({ id: t.id, name: t.name }));
  const now = buildReport(window, rooms, typeList, period.from, period.through);
  const before = buildReport(window, rooms, typeList, period.prevFrom, period.prevThrough);

  const exportHref = `/admin/reports/export?from=${period.from}&to=${period.through}`;
  const future = period.through > today;

  const kpis: Kpi[] = [
    { label: "Room revenue", value: formatTaka(now.revenue), delta: change(now.revenue, before.revenue), hint: "On the books, before VAT and service charge" },
    { label: "Occupancy", value: pct(now.occupancy), delta: change(now.occupancy, before.occupancy), hint: "Room-nights sold ÷ room-nights available" },
    { label: "ADR", value: now.adr == null ? "—" : formatTaka(now.adr), delta: change(now.adr, before.adr), hint: "Average daily rate: revenue ÷ room-nights sold" },
    { label: "RevPAR", value: now.revpar == null ? "—" : formatTaka(now.revpar), delta: change(now.revpar, before.revpar), hint: "Revenue per available room-night" },
    { label: "Room-nights sold", value: String(now.roomNightsSold), sub: `of ${now.roomNightsAvailable}`, delta: change(now.roomNightsSold, before.roomNightsSold) },
    {
      label: "Cancelled or no-show",
      value: pct(now.cancelRate),
      sub: `${now.cancelled + now.noShows} of ${now.arrivals}`,
      delta: change(now.cancelRate, before.cancelRate),
      lowerIsBetter: true,
      hint: "Share of bookings due to arrive in the period",
    },
  ];

  const maxTypeRevenue = Math.max(1, ...now.byRoomType.map((t) => t.revenue));

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className="a-eyebrow">Performance</p>
          <h1 className="a-title">Reports</h1>
        </div>
        <div className={styles.headActions}>
          <PrintButton />
          <a href={exportHref} className="a-btn" download>
            <IDownload size={16} /> Export bookings (CSV)
          </a>
        </div>
      </header>

      {/* Period picker: presets are plain links, custom is a GET form, so every view has a shareable URL. */}
      <section className={`a-panel ${styles.filters}`} aria-label="Period">
        <nav className={styles.presets} aria-label="Preset periods">
          {PERIOD_PRESETS.map((p) => (
            <Link
              key={p.key}
              href={`/admin/reports?period=${p.key}`}
              className={`${styles.preset} ${period.key === p.key ? styles.presetOn : ""}`}
              aria-current={period.key === p.key ? "page" : undefined}
              scroll={false}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <form action="/admin/reports" method="get" className={styles.custom}>
          <input type="hidden" name="period" value="custom" />
          <label className={styles.dateField}>
            <span>From</span>
            <input type="date" name="from" defaultValue={period.from} className="a-input" required />
          </label>
          <label className={styles.dateField}>
            <span>To</span>
            <input type="date" name="to" defaultValue={period.through} className="a-input" required />
          </label>
          <button type="submit" className={`a-btn ${period.key === "custom" ? "a-btn--primary" : ""}`}>
            Apply
          </button>
        </form>
      </section>

      <p className={styles.range}>
        <strong>{formatRange(period.from, period.through)}</strong> · {now.nights} {now.nights === 1 ? "night" : "nights"} · {now.sellable} rooms in
        service
        <span>
          {" "}
          · compared with {formatRange(period.prevFrom, period.prevThrough)}
        </span>
        {future && <span className={styles.forward}> · includes future nights already on the books</span>}
      </p>

      <section aria-label="Key figures" className={styles.kpis}>
        {kpis.map((k) => (
          <KpiTile key={k.label} {...k} />
        ))}
      </section>

      <section className="a-panel" aria-labelledby="trend-h">
        <div className="a-panel-head">
          <h2 id="trend-h" className="a-h2">
            Night by night
          </h2>
          <span className="a-muted" style={{ fontSize: "0.76rem" }}>
            Hover or use arrow keys for details · Fri & Sat shaded
          </span>
        </div>
        <div className="a-panel-body">
          <TrendChart days={now.days} previous={before.days} sellable={now.sellable} />
        </div>
      </section>

      <div className={styles.two}>
        <section className="a-panel" aria-labelledby="types-h">
          <div className="a-panel-head">
            <h2 id="types-h" className="a-h2">
              Room types
            </h2>
            <Link href="/admin/rooms" className="a-link">
              Rooms & rates
            </Link>
          </div>
          <div className="a-table-wrap">
            <table className="a-table a-table--stack">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Occupancy</th>
                  <th className="a-right">Nights</th>
                  <th className="a-right">ADR</th>
                  <th className="a-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {now.byRoomType.map((t) => (
                  <tr key={t.id}>
                    <td data-label="">
                      <span className="a-primary-cell">
                        <strong>{t.name}</strong>
                        <span>
                          {t.units} {t.units === 1 ? "room" : "rooms"}
                        </span>
                      </span>
                    </td>
                    <td data-label="Occupancy">
                      <span className={styles.meterCell}>
                        <span className={styles.meter} aria-hidden="true">
                          <span style={{ width: pct(t.occupancy) }} />
                        </span>
                        <span className="a-num">{pct(t.occupancy)}</span>
                      </span>
                    </td>
                    <td data-label="Nights" className="a-right a-num">
                      {t.roomNights}
                    </td>
                    <td data-label="ADR" className="a-right a-num">
                      {t.adr == null ? "—" : formatTaka(t.adr)}
                    </td>
                    <td data-label="Revenue" className="a-right a-num">
                      <span className={styles.revCell}>
                        {formatTaka(t.revenue)}
                        <span className={styles.revBar} aria-hidden="true">
                          <span style={{ width: `${(t.revenue / maxTypeRevenue) * 100}%` }} />
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="a-panel" aria-labelledby="src-h">
          <div className="a-panel-head">
            <h2 id="src-h" className="a-h2">
              Where revenue comes from
            </h2>
          </div>
          <div className="a-panel-body">
            <BarList items={now.bySource} format={(s) => formatTaka(s.value)} empty="No sold stays in this period" />
          </div>
        </section>
      </div>

      <div className={styles.three}>
        <section className="a-panel" aria-labelledby="dow-h">
          <div className="a-panel-head">
            <h2 id="dow-h" className="a-h2">
              Occupancy by weekday
            </h2>
          </div>
          <div className="a-panel-body">
            <div className={styles.dow} role="list" aria-label="Average occupancy by night of the week">
              {now.byWeekday.map((d) => (
                <div
                  key={d.dow}
                  role="listitem"
                  tabIndex={0}
                  className={styles.dowCol}
                  aria-label={`${d.label} nights: ${pct(d.occupancy)} average occupancy over ${d.nights} nights`}
                  data-tip={`${pct(d.occupancy)} · ${d.nights} ${d.nights === 1 ? "night" : "nights"}`}
                >
                  <span className={styles.dowTrack}>
                    <span className={styles.dowBar} style={{ height: `${Math.max(d.occupancy * 100, d.occupancy ? 2 : 0)}%` }} />
                  </span>
                  <span className={styles.dowVal}>{pct(d.occupancy)}</span>
                  <span className={styles.dowLabel}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="a-panel" aria-labelledby="lead-h">
          <div className="a-panel-head">
            <h2 id="lead-h" className="a-h2">
              How far ahead guests book
            </h2>
            {now.avgLead != null && <span className={styles.headStat}>avg {now.avgLead.toFixed(1)} days</span>}
          </div>
          <div className="a-panel-body">
            <BarList items={now.leadTime} format={(s) => `${s.value}`} empty="No arrivals in this period" />
          </div>
        </section>

        <section className="a-panel" aria-labelledby="los-h">
          <div className="a-panel-head">
            <h2 id="los-h" className="a-h2">
              Length of stay
            </h2>
            {now.avgStay != null && <span className={styles.headStat}>avg {now.avgStay.toFixed(1)} nights</span>}
          </div>
          <div className="a-panel-body">
            <BarList items={now.stayLength} format={(s) => `${s.value}`} empty="No arrivals in this period" />
          </div>
        </section>
      </div>

      <div className={styles.two}>
        <section className="a-panel" aria-labelledby="guests-h">
          <div className="a-panel-head">
            <h2 id="guests-h" className="a-h2">
              Top guests by revenue
            </h2>
            <Link href="/admin/guests" className="a-link">
              All guests
            </Link>
          </div>
          {now.topGuests.length ? (
            <div className="a-table-wrap">
              <table className="a-table a-table--stack">
                <thead>
                  <tr>
                    <th>Guest</th>
                    <th className="a-right">Stays</th>
                    <th className="a-right">Nights</th>
                    <th className="a-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {now.topGuests.map((g) => (
                    <tr key={g.key}>
                      <td data-label="">
                        <Link href={`/admin/guests?q=${encodeURIComponent(g.phone)}`} className="a-rowlink a-primary-cell">
                          <strong>{g.name}</strong>
                          <span>{g.phone}</span>
                        </Link>
                      </td>
                      <td data-label="Stays" className="a-right a-num">
                        {g.stays}
                      </td>
                      <td data-label="Nights" className="a-right a-num">
                        {g.nights}
                      </td>
                      <td data-label="Revenue" className="a-right a-num">
                        {formatTaka(g.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="a-empty">
              <strong>No sold stays yet</strong>
            </div>
          )}
        </section>

        <div className={styles.stackCol}>
          <section className="a-panel" aria-labelledby="pay-h">
            <div className="a-panel-head">
              <h2 id="pay-h" className="a-h2">
                Payments
              </h2>
              <span className="a-muted" style={{ fontSize: "0.76rem" }}>
                stays arriving in the period
              </span>
            </div>
            <div className="a-panel-body">
              <div className={styles.payBar} aria-hidden="true">
                <span style={{ width: `${now.billed ? (now.collected / now.billed) * 100 : 0}%` }} />
              </div>
              <dl className={styles.pay}>
                <div>
                  <dt>Billed</dt>
                  <dd>{formatTaka(now.billed)}</dd>
                </div>
                <div>
                  <dt>
                    <i className={styles.keyPaid} /> Collected
                  </dt>
                  <dd>{formatTaka(now.collected)}</dd>
                </div>
                <div>
                  <dt>
                    <i className={styles.keyDue} /> Outstanding
                  </dt>
                  <dd className={now.outstanding > 0 ? styles.due : ""}>{formatTaka(now.outstanding)}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="a-panel" aria-labelledby="status-h">
            <div className="a-panel-head">
              <h2 id="status-h" className="a-h2">
                Arrivals by outcome
              </h2>
              <span className={styles.headStat}>{now.arrivals} bookings</span>
            </div>
            <div className="a-panel-body">
              <BarList items={now.statusMix} format={(s) => `${s.value}`} empty="No arrivals in this period" />
            </div>
          </section>
        </div>
      </div>

      <p className={styles.footnote}>
        Revenue is room revenue at the agreed nightly rate, before VAT and service charge. &ldquo;Sold&rdquo; means confirmed,
        in-house or checked-out stays; requests awaiting confirmation and cancellations aren&apos;t counted. Mix, lead time and
        payments use bookings due to arrive in the period. The address bar keeps the period, so a report can be bookmarked or
        shared with a colleague.
      </p>
    </div>
  );
}

/* ---------- Pieces ---------- */

type Kpi = { label: string; value: string; sub?: string; delta: number | null; lowerIsBetter?: boolean; hint?: string };

function KpiTile({ label, value, sub, delta, lowerIsBetter, hint }: Kpi) {
  const flat = delta == null || Math.abs(delta) < 0.005;
  const good = !flat && (lowerIsBetter ? delta! < 0 : delta! > 0);
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel} title={hint}>
        {label}
      </span>
      <span className={styles.kpiValue}>
        {value}
        {sub && <span className={styles.kpiSub}> {sub}</span>}
      </span>
      <span className={`${styles.delta} ${flat ? "" : good ? styles.deltaGood : styles.deltaBad}`}>
        {delta == null ? (
          "no earlier data"
        ) : flat ? (
          "no change"
        ) : (
          <>
            {delta > 0 ? <IUp size={14} /> : <IDown size={14} />}
            {Math.abs(Math.round(delta * 100))}% vs previous
          </>
        )}
      </span>
    </div>
  );
}

function BarList({ items, format, empty }: { items: Slice[]; format: (s: Slice) => string; empty: string }) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (!max) return <p className={styles.emptySmall}>{empty}</p>;
  return (
    <ul role="list" className={styles.bars}>
      {items.map((s) => (
        <li key={s.key} className={styles.barRow} tabIndex={0} aria-label={`${s.label}: ${format(s)}, ${pct(s.share)}${s.extra ? `, ${s.extra}` : ""}`}>
          <span className={styles.barLabel}>{s.label}</span>
          <span className={styles.barTrack} aria-hidden="true">
            <span className={styles.barFill} style={{ width: `${(s.value / max) * 100}%` }} />
          </span>
          <span className={styles.barValue}>
            {format(s)}
            <span>
              {pct(s.share)}
              {s.extra ? ` · ${s.extra}` : ""}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

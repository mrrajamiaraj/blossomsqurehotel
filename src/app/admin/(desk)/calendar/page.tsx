import type { Metadata } from "next";
import Link from "next/link";
import { IChevronLeft, IChevronRight } from "@/components/admin/icons";
import { requireAdmin } from "@/lib/admin/session";
import { STATUS_LABEL } from "@/lib/data/rules";
import type { Booking } from "@/lib/data/types";
import { addDays, hotelToday, isISODate, MONTHS_LONG, nightsBetween, toDate } from "@/lib/dates";
import styles from "./calendar.module.css";

export const metadata: Metadata = { title: "Calendar" };

const DAYS = 14;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Bar = { b: Booking; start: number; span: number; clipStart: boolean; clipEnd: boolean };

function toBar(b: Booking, from: string): Bar | null {
  const start = nightsBetween(from, b.check_in);
  const end = nightsBetween(from, b.check_out);
  const s = Math.max(0, start);
  const e = Math.min(DAYS, end);
  if (e <= s) return null;
  return { b, start: s, span: e - s, clipStart: start < 0, clipEnd: end > DAYS };
}

/** Greedy lane packing so overlapping unassigned stays don't sit on top of each other. */
function lanes(bars: Bar[]): Bar[][] {
  const out: Bar[][] = [];
  for (const bar of [...bars].sort((x, y) => x.start - y.start)) {
    const lane = out.find((l) => l.every((o) => o.start + o.span <= bar.start || bar.start + bar.span <= o.start));
    if (lane) lane.push(bar);
    else out.push([bar]);
  }
  return out;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { repo } = await requireAdmin();
  const today = hotelToday();
  const q = (await searchParams).from;
  const from = isISODate(q) ? q : addDays(today, -1);
  const to = addDays(from, DAYS);

  const [rooms, types, bookings] = await Promise.all([
    repo.listRooms(),
    repo.listRoomTypes({ includeUnpublished: true }),
    repo.bookingsBetween(from, to),
  ]);
  const shown = bookings.filter((b) => b.status !== "cancelled" && b.status !== "no_show");
  const days = Array.from({ length: DAYS }, (_, i) => addDays(from, i));
  const first = toDate(from);
  const last = toDate(addDays(from, DAYS - 1));
  const title =
    first.getUTCMonth() === last.getUTCMonth()
      ? `${MONTHS_LONG[first.getUTCMonth()]} ${first.getUTCFullYear()}`
      : `${MONTHS_LONG[first.getUTCMonth()].slice(0, 3)} – ${MONTHS_LONG[last.getUTCMonth()].slice(0, 3)} ${last.getUTCFullYear()}`;

  const Row = ({ label, sub, bars, dim }: { label: string; sub?: string; bars: Bar[]; dim?: boolean }) => (
    <div className={`${styles.row} ${dim ? styles.rowDim : ""}`}>
      <div className={styles.rowHead}>
        <span className={styles.rowLabel}>{label}</span>
        {sub && <span className={styles.rowSub}>{sub}</span>}
      </div>
      <div className={styles.track}>
        {days.map((d) => (
          <span key={d} className={`${styles.cell} ${d === today ? styles.cellToday : ""}`} aria-hidden="true" />
        ))}
        {bars.map(({ b, start, span, clipStart, clipEnd }) => (
          <Link
            key={b.id}
            href={`/admin/bookings/${b.reference}`}
            className={`${styles.bar} ${clipStart ? styles.clipStart : ""} ${clipEnd ? styles.clipEnd : ""}`}
            data-s={b.status}
            style={{ gridColumn: `${start + 1} / span ${span}` }}
            title={`${b.guest_name} · ${STATUS_LABEL[b.status]} · ${b.check_in} → ${b.check_out}`}
          >
            <span className={styles.barText}>
              {b.guest_name}
              {b.rooms > 1 ? ` ×${b.rooms}` : ""}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className="a-eyebrow">Availability</p>
          <h1 className="a-title">{title}</h1>
        </div>
        <div className={styles.controls}>
          <Link href={`/admin/calendar?from=${addDays(from, -7)}`} className="a-btn a-btn--sm" aria-label="Previous week">
            <IChevronLeft size={15} />
          </Link>
          <Link href="/admin/calendar" className="a-btn a-btn--sm">
            Today
          </Link>
          <Link href={`/admin/calendar?from=${addDays(from, 7)}`} className="a-btn a-btn--sm" aria-label="Next week">
            <IChevronRight size={15} />
          </Link>
        </div>
      </header>

      <div className={styles.legend} aria-label="Legend">
        {(["pending", "confirmed", "checked_in", "checked_out"] as const).map((s) => (
          <span key={s}>
            <i className={styles.key} data-s={s} /> {STATUS_LABEL[s]}
          </span>
        ))}
      </div>

      <section className={`a-panel ${styles.board}`} aria-label="Room timeline">
        <div className={styles.scroller}>
          <div className={styles.grid}>
            <div className={`${styles.row} ${styles.dayRow}`}>
              <div className={styles.rowHead} />
              <div className={styles.track}>
                {days.map((d) => {
                  const dt = toDate(d);
                  const weekend = dt.getUTCDay() === 5 || dt.getUTCDay() === 6;
                  return (
                    <span key={d} className={`${styles.day} ${d === today ? styles.dayToday : ""} ${weekend ? styles.weekend : ""}`}>
                      <span>{DOW[dt.getUTCDay()]}</span>
                      <strong>{dt.getUTCDate()}</strong>
                    </span>
                  );
                })}
              </div>
            </div>

            {types.map((t) => {
              const typeRooms = rooms.filter((r) => r.room_type_id === t.id);
              const ofType = shown.filter((b) => b.room_type_id === t.id);
              const unassigned = lanes(ofType.filter((b) => !b.room_id).map((b) => toBar(b, from)).filter(Boolean) as Bar[]);
              return (
                <div key={t.id} className={styles.group}>
                  <div className={styles.groupHead}>
                    {t.name}
                    <span>
                      {typeRooms.filter((r) => !r.out_of_service).length} in service
                      {!t.is_published && " · hidden online"}
                    </span>
                  </div>
                  {typeRooms.map((r) => (
                    <Row
                      key={r.id}
                      label={r.number}
                      sub={r.out_of_service ? "Out of service" : r.housekeeping === "dirty" ? "Needs cleaning" : undefined}
                      dim={r.out_of_service}
                      bars={ofType.filter((b) => b.room_id === r.id).map((b) => toBar(b, from)).filter(Boolean) as Bar[]}
                    />
                  ))}
                  {unassigned.map((lane, i) => (
                    <Row key={`u${i}`} label={i === 0 ? "No room yet" : ""} sub={i === 0 ? "assign from the booking" : undefined} bars={lane} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

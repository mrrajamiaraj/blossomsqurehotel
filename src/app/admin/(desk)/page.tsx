import type { Metadata } from "next";
import Link from "next/link";
import AssignRoom from "@/components/admin/AssignRoom";
import { PaymentBadge, SOURCE_LABEL, StatusBadge } from "@/components/admin/badges";
import HousekeepingList from "@/components/admin/HousekeepingList";
import { IAlert, IArrowRight } from "@/components/admin/icons";
import NightLoadChart from "@/components/admin/NightLoadChart";
import StatusActions from "@/components/admin/StatusActions";
import { describeEvent } from "@/lib/admin/events";
import { ago, greeting, longDate, pct, stayLine } from "@/lib/admin/format";
import { cancellationFigures, nightlyLoad, periodFigures, todayFigures } from "@/lib/admin/metrics";
import { roomOptions } from "@/lib/admin/rooms";
import { requireAdmin } from "@/lib/admin/session";
import { addDays, hotelToday } from "@/lib/dates";
import { formatTaka } from "@/lib/format";
import styles from "./today.module.css";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { repo, staff } = await requireAdmin();
  const { error } = await searchParams;
  const today = hotelToday();
  const monthStart = `${today.slice(0, 8)}01`;
  const from = monthStart < addDays(today, -1) ? monthStart : addDays(today, -1);

  const [rooms, types, window, received, requests, activity] = await Promise.all([
    repo.listRooms(),
    repo.listRoomTypes({ includeUnpublished: true }),
    repo.bookingsBetween(from, addDays(today, 15)),
    repo.bookingsReceivedSince(addDays(today, -30)),
    repo.listBookings({ view: "requests", today, pageSize: 8 }),
    repo.recentActivity(8),
  ]);

  const sellable = rooms.filter((r) => !r.out_of_service).length;
  const day = todayFigures(window, sellable, today);
  day.requests = { count: requests.total, oldest: requests.rows[0]?.created_at ?? null };
  const mtd = periodFigures(window, sellable, monthStart, today);
  const load = nightlyLoad(window, sellable, today, 14);
  const cancels = cancellationFigures(received, addDays(today, -30));

  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const roomNo = new Map(rooms.map((r) => [r.id, r.number]));
  const arrivals = window.filter((b) => b.check_in === today && ["pending", "confirmed", "checked_in"].includes(b.status));
  const departures = window.filter((b) => b.check_out === today && (b.status === "checked_in" || b.status === "checked_out"));
  const firstName = staff.name.split(" ")[0];

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className="a-eyebrow">{longDate(today)}</p>
          <h1 className="a-title">
            {greeting()}, <em>{firstName}</em>
          </h1>
        </div>
        {error === "manager_only" && (
          <p className={styles.notice} role="alert">
            <IAlert size={16} /> That page is for managers only.
          </p>
        )}
      </header>

      {/* The day sheet: what the desk needs to know at a glance */}
      <section aria-label="Today at a glance" className={styles.sheet}>
        <Link href="/admin/bookings?view=arrivals" className={styles.stat}>
          <span className={styles.statLabel}>Arrivals</span>
          <span className={styles.statValue}>{day.arrivals.total}</span>
          <span className={styles.statSub}>
            {day.arrivals.checkedIn} checked in
            {day.arrivals.awaiting ? ` · ${day.arrivals.awaiting} unconfirmed` : ""}
          </span>
        </Link>
        <Link href="/admin/bookings?view=departures" className={styles.stat}>
          <span className={styles.statLabel}>Departures</span>
          <span className={styles.statValue}>{day.departures.total}</span>
          <span className={styles.statSub}>
            {day.departures.checkedOut} gone · check-out by 12:00
          </span>
        </Link>
        <Link href="/admin/bookings?view=in_house" className={styles.stat}>
          <span className={styles.statLabel}>In house</span>
          <span className={styles.statValue}>{day.inHouse}</span>
          <span className={styles.statSub}>guest stays right now</span>
        </Link>
        <Link href="/admin/calendar" className={styles.stat}>
          <span className={styles.statLabel}>Occupancy tonight</span>
          <span className={styles.statValue}>{pct(day.occupancy.pct)}</span>
          <span className={styles.statSub}>
            {day.occupancy.occupied} of {day.occupancy.sellable} rooms
            {day.occupancy.pendingRooms ? ` · +${day.occupancy.pendingRooms} pending` : ""}
          </span>
          <span className={styles.meter} aria-hidden="true">
            <span style={{ width: pct(day.occupancy.pct) }} />
          </span>
        </Link>
        <Link href="/admin/bookings?view=requests" className={`${styles.stat} ${day.requests.count ? styles.statAlert : ""}`}>
          <span className={styles.statLabel}>To confirm</span>
          <span className={styles.statValue}>{day.requests.count}</span>
          <span className={styles.statSub}>{day.requests.oldest ? `oldest ${ago(day.requests.oldest)}` : "all caught up"}</span>
        </Link>
      </section>

      <div className={styles.grid}>
        <div className={styles.mainCol}>
          {/* Requests */}
          <section className="a-panel" aria-labelledby="req-h">
            <div className="a-panel-head">
              <h2 id="req-h" className="a-h2">
                Booking requests to confirm<span className="a-count">{requests.total}</span>
              </h2>
              <Link href="/admin/bookings?view=requests" className="a-link">
                View all
              </Link>
            </div>
            {requests.rows.length ? (
              <div className="a-table-wrap">
                <table className="a-table a-table--stack">
                  <thead>
                    <tr>
                      <th>Guest</th>
                      <th>Stay</th>
                      <th>Received</th>
                      <th className="a-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.rows.map((b) => (
                      <tr key={b.id}>
                        <td data-label="">
                          <Link href={`/admin/bookings/${b.reference}`} className={`a-rowlink a-primary-cell`}>
                            <strong>{b.guest_name}</strong>
                            <span>
                              {b.phone} · {b.reference}
                            </span>
                          </Link>
                        </td>
                        <td data-label="Stay">
                          <span className="a-primary-cell">
                            <strong>{typeName.get(b.room_type_id)}{b.rooms > 1 ? ` × ${b.rooms}` : ""}</strong>
                            <span>{stayLine(b.check_in, b.check_out)}</span>
                          </span>
                        </td>
                        <td data-label="Received" className="a-muted">
                          {ago(b.created_at)} · {SOURCE_LABEL[b.source]}
                        </td>
                        <td data-label="" className="a-right">
                          <StatusActions id={b.id} status={b.status} guest={b.guest_name} balance={0} compact />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="a-empty">
                <strong>No requests waiting</strong>
                <span>New website bookings appear here for confirmation.</span>
              </div>
            )}
          </section>

          {/* Arrivals & departures */}
          <div className={styles.pair}>
            <section className="a-panel" aria-labelledby="arr-h">
              <div className="a-panel-head">
                <h2 id="arr-h" className="a-h2">
                  Arriving today<span className="a-count">{arrivals.length}</span>
                </h2>
              </div>
              {arrivals.length ? (
                <ul role="list" className={styles.list}>
                  {arrivals.map((b) => (
                    <li key={b.id} className={styles.item}>
                      <Link href={`/admin/bookings/${b.reference}`} className={`a-rowlink a-primary-cell ${styles.who}`}>
                        <strong>{b.guest_name}</strong>
                        <span>
                          {typeName.get(b.room_type_id)} · {b.adults + b.children} guests
                          {b.arrival_window ? ` · ${b.arrival_window}` : ""}
                        </span>
                      </Link>
                      <div className={styles.itemActions}>
                        {b.status === "checked_in" ? (
                          <StatusBadge status={b.status} />
                        ) : (
                          <>
                            {b.rooms === 1 && b.status === "confirmed" && (
                              <AssignRoom compact bookingId={b.id} value={b.room_id} options={roomOptions(b, rooms, window)} />
                            )}
                            <StatusActions
                              id={b.id}
                              status={b.status}
                              guest={b.guest_name}
                              balance={b.total_bdt - b.amount_paid_bdt}
                              compact
                              needsRoom={b.rooms === 1 && !b.room_id}
                            />
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="a-empty">
                  <strong>No arrivals today</strong>
                </div>
              )}
            </section>

            <section className="a-panel" aria-labelledby="dep-h">
              <div className="a-panel-head">
                <h2 id="dep-h" className="a-h2">
                  Leaving today<span className="a-count">{departures.length}</span>
                </h2>
              </div>
              {departures.length ? (
                <ul role="list" className={styles.list}>
                  {departures.map((b) => {
                    const balance = b.total_bdt - b.amount_paid_bdt;
                    return (
                      <li key={b.id} className={styles.item}>
                        <Link href={`/admin/bookings/${b.reference}`} className={`a-rowlink a-primary-cell ${styles.who}`}>
                          <strong>{b.guest_name}</strong>
                          <span>
                            Room {b.room_id ? roomNo.get(b.room_id) : "—"} ·{" "}
                            {balance > 0 ? <span className={styles.due}>{formatTaka(balance)} due</span> : <PaymentBadge status={b.payment_status} />}
                          </span>
                        </Link>
                        <div className={styles.itemActions}>
                          {b.status === "checked_out" ? (
                            <StatusBadge status={b.status} />
                          ) : (
                            <StatusActions id={b.id} status={b.status} guest={b.guest_name} balance={balance} compact />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="a-empty">
                  <strong>No departures today</strong>
                </div>
              )}
            </section>
          </div>

          {/* Forward look */}
          <section className="a-panel" aria-labelledby="load-h">
            <div className="a-panel-head">
              <h2 id="load-h" className="a-h2">
                The next 14 nights
              </h2>
              <Link href="/admin/calendar" className="a-link">
                Open calendar
              </Link>
            </div>
            <div className="a-panel-body">
              <NightLoadChart nights={load} />
            </div>
          </section>
        </div>

        <aside className={styles.sideCol}>
          {/* Month to date */}
          <section className="a-panel" aria-labelledby="mtd-h">
            <div className="a-panel-head">
              <h2 id="mtd-h" className="a-h2">
                Month to date
              </h2>
              <Link href="/admin/reports?period=mtd" className="a-link">
                Full report
              </Link>
            </div>
            <dl className={styles.ledger}>
              <div>
                <dt>Room revenue</dt>
                <dd>{formatTaka(mtd.roomRevenue)}</dd>
              </div>
              <div>
                <dt title="Room-nights sold ÷ room-nights available">Occupancy</dt>
                <dd>{pct(mtd.occupancy)}</dd>
              </div>
              <div>
                <dt title="Average daily rate: room revenue ÷ room-nights sold">ADR</dt>
                <dd>{mtd.adr == null ? "—" : formatTaka(mtd.adr)}</dd>
              </div>
              <div>
                <dt title="Revenue per available room: room revenue ÷ room-nights available">RevPAR</dt>
                <dd>{mtd.revpar == null ? "—" : formatTaka(mtd.revpar)}</dd>
              </div>
              <div>
                <dt>Room-nights sold</dt>
                <dd>
                  {mtd.roomNightsSold}
                  <span> / {mtd.roomNightsAvailable}</span>
                </dd>
              </div>
              <div>
                <dt>Cancelled or no-show</dt>
                <dd>
                  {pct(cancels.rate)}
                  <span>
                    {" "}
                    {cancels.cancelled + cancels.noShows} of {cancels.received}, 30 days
                  </span>
                </dd>
              </div>
            </dl>
            <p className={styles.footnote}>Room revenue on the books, before VAT and service charge.</p>
          </section>

          <section className="a-panel" aria-labelledby="hk-h">
            <div className="a-panel-head">
              <h2 id="hk-h" className="a-h2">
                Housekeeping
              </h2>
              <Link href="/admin/rooms" className="a-link">
                All rooms
              </Link>
            </div>
            <HousekeepingList
              rooms={rooms.map((r) => ({
                id: r.id,
                number: r.number,
                type: typeName.get(r.room_type_id) ?? "",
                housekeeping: r.housekeeping,
                outOfService: r.out_of_service,
                note: r.service_note,
              }))}
            />
          </section>

          <section className="a-panel" aria-labelledby="act-h">
            <div className="a-panel-head">
              <h2 id="act-h" className="a-h2">
                Recent activity
              </h2>
            </div>
            {activity.length ? (
              <ol role="list" className={styles.feed}>
                {activity.map((e) => (
                  <li key={e.id}>
                    <Link href={`/admin/bookings/${e.reference}`} className={styles.feedLink}>
                      <span className={styles.feedWhat}>
                        <strong>{e.guest_name}</strong> · {describeEvent(e)}
                      </span>
                      <span className={styles.feedMeta}>
                        {e.actor_name} · {ago(e.created_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="a-empty">
                <strong>Quiet so far</strong>
              </div>
            )}
            <Link href="/admin/bookings?view=all" className={styles.panelFootLink}>
              All bookings <IArrowRight size={15} />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AssignRoom from "@/components/admin/AssignRoom";
import { PaymentBadge, SOURCE_LABEL, StatusBadge } from "@/components/admin/badges";
import { ChangeStay, EditGuest, PrintButton, RecordPayment } from "@/components/admin/BookingDialogs";
import StatusActions from "@/components/admin/StatusActions";
import { describeEvent } from "@/lib/admin/events";
import { ago, dateTime, longDate } from "@/lib/admin/format";
import { roomOptions } from "@/lib/admin/rooms";
import { requireAdmin } from "@/lib/admin/session";
import { isLive } from "@/lib/data/rules";
import { hotelToday, nightsBetween } from "@/lib/dates";
import { formatTaka } from "@/lib/format";
import { HOTEL } from "@/lib/hotel";
import { priceBreakdown } from "@/lib/pricing";
import styles from "./booking.module.css";

type Props = { params: Promise<{ reference: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).reference };
}

export default async function BookingPage({ params }: Props) {
  const { repo } = await requireAdmin();
  const { reference } = await params;
  const booking = await repo.getBooking(decodeURIComponent(reference));
  if (!booking) notFound();

  const [types, rooms, events, nearby, settings] = await Promise.all([
    repo.listRoomTypes({ includeUnpublished: true }),
    repo.listRooms(),
    repo.bookingEvents(booking.id),
    repo.bookingsBetween(booking.check_in, booking.check_out),
    repo.getSettings(),
  ]);

  const today = hotelToday();
  const b = booking;
  const type = types.find((t) => t.id === b.room_type_id);
  const room = rooms.find((r) => r.id === b.room_id);
  const nights = nightsBetween(b.check_in, b.check_out);
  const balance = Math.max(0, b.total_bdt - b.amount_paid_bdt);
  const bill = priceBreakdown(b.total_bdt, settings);
  const live = isLive(b.status);

  return (
    <div className={styles.page}>
      <nav aria-label="Breadcrumb" className={styles.crumbs}>
        <Link href="/admin/bookings">Bookings</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{b.reference}</span>
      </nav>

      <header className={styles.head}>
        <div className={styles.headText}>
          <div className={styles.badges}>
            <StatusBadge status={b.status} />
            <PaymentBadge status={b.payment_status} />
          </div>
          <h1 className="a-title">{b.guest_name}</h1>
          <p className="a-muted">
            {b.reference} · {SOURCE_LABEL[b.source]} · received {ago(b.created_at)}
            {b.cancel_reason ? ` · “${b.cancel_reason}”` : ""}
          </p>
        </div>
        <div className={styles.headActions}>
          <StatusActions
            id={b.id}
            status={b.status}
            guest={b.guest_name}
            balance={balance}
            needsRoom={b.rooms === 1 && !b.room_id}
            arrivalFuture={b.check_in > today}
          />
          <PrintButton />
        </div>
      </header>

      <div className={styles.grid}>
        <div className={styles.col}>
          <section className="a-panel" aria-labelledby="stay-h">
            <div className="a-panel-head">
              <h2 id="stay-h" className="a-h2">
                Stay
              </h2>
              <ChangeStay
                id={b.id}
                locked={!live}
                inHouse={b.status === "checked_in"}
                current={{
                  typeId: b.room_type_id,
                  rate: b.nightly_rate_bdt,
                  checkIn: b.check_in,
                  checkOut: b.check_out,
                  rooms: b.rooms,
                  adults: b.adults,
                  children: b.children,
                }}
                types={types.map((t) => ({ slug: t.slug, id: t.id, name: t.name, price: t.price_bdt, sleeps: t.sleeps }))}
              />
            </div>
            <div className={`a-panel-body ${styles.stay}`}>
              <div className={styles.dates}>
                <div>
                  <span className="a-eyebrow">Arrive</span>
                  <strong>{longDate(b.check_in)}</strong>
                  <span className="a-muted">from {HOTEL.checkIn}</span>
                </div>
                <span className={styles.nights}>
                  {nights} {nights === 1 ? "night" : "nights"}
                </span>
                <div>
                  <span className="a-eyebrow">Depart</span>
                  <strong>{longDate(b.check_out)}</strong>
                  <span className="a-muted">by {HOTEL.checkOut}</span>
                </div>
              </div>
              <dl className="a-dl">
                <dt>Room type</dt>
                <dd>
                  {type?.name}
                  {b.rooms > 1 ? ` × ${b.rooms} rooms` : ""}
                </dd>
                <dt>Room</dt>
                <dd>
                  {b.rooms === 1 && live ? (
                    <AssignRoom compact bookingId={b.id} value={b.room_id} options={roomOptions(b, rooms, nearby)} />
                  ) : room ? (
                    room.number
                  ) : (
                    <span className="a-muted">{b.rooms > 1 ? "Assign at the desk" : "—"}</span>
                  )}
                </dd>
                <dt>Party</dt>
                <dd>
                  {b.adults} {b.adults === 1 ? "adult" : "adults"}
                  {b.children ? `, ${b.children} ${b.children === 1 ? "child" : "children"}` : ""}
                </dd>
                <dt>Arriving</dt>
                <dd>{b.arrival_window ?? <span className="a-muted">Not given</span>}</dd>
                <dt>Airport pickup</dt>
                <dd>{b.airport_pickup ? "Requested — arrange and confirm the charge" : "No"}</dd>
              </dl>
            </div>
          </section>

          <section className="a-panel" aria-labelledby="guest-h">
            <div className="a-panel-head">
              <h2 id="guest-h" className="a-h2">
                Guest
              </h2>
              <EditGuest
                id={b.id}
                initial={{
                  name: b.guest_name,
                  email: b.email,
                  phone: b.phone,
                  arrival: b.arrival_window,
                  requests: b.special_requests,
                  notes: b.internal_notes,
                  airportPickup: b.airport_pickup,
                }}
              />
            </div>
            <div className="a-panel-body">
              <dl className="a-dl">
                <dt>Phone</dt>
                <dd>
                  <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`} className="a-link">
                    {b.phone}
                  </a>
                </dd>
                <dt>Email</dt>
                <dd>
                  {b.email ? (
                    <a href={`mailto:${b.email}`} className="a-link">
                      {b.email}
                    </a>
                  ) : (
                    <span className="a-muted">—</span>
                  )}
                </dd>
                <dt>Country</dt>
                <dd>{b.country ?? <span className="a-muted">—</span>}</dd>
                <dt>Requests</dt>
                <dd className={styles.prewrap}>{b.special_requests ?? <span className="a-muted">None</span>}</dd>
              </dl>
              <div className={styles.notes}>
                <span className="a-eyebrow">Internal notes</span>
                <p className={styles.prewrap}>{b.internal_notes ?? <span className="a-muted">No notes yet.</span>}</p>
              </div>
            </div>
          </section>
        </div>

        <div className={styles.col}>
          <section className="a-panel" aria-labelledby="pay-h">
            <div className="a-panel-head">
              <h2 id="pay-h" className="a-h2">
                Folio
              </h2>
              <RecordPayment id={b.id} balance={balance} disabled={b.status === "cancelled" || b.status === "no_show"} />
            </div>
            <div className="a-panel-body">
              <dl className={styles.folio}>
                <div>
                  <dt>
                    Room · {formatTaka(b.nightly_rate_bdt)} × {nights} {nights === 1 ? "night" : "nights"}
                    {b.rooms > 1 ? ` × ${b.rooms}` : ""}
                  </dt>
                  <dd>{formatTaka(b.total_bdt)}</dd>
                </div>
                {bill.service != null && (
                  <div>
                    <dt>Service charge ({settings.service_charge_percent}%)</dt>
                    <dd>{formatTaka(bill.service)}</dd>
                  </div>
                )}
                {bill.vat != null && (
                  <div>
                    <dt>VAT ({settings.vat_percent}%)</dt>
                    <dd>{formatTaka(bill.vat)}</dd>
                  </div>
                )}
                <div className={styles.folioTotal}>
                  <dt>{bill.taxesKnown ? "Total" : "Room total"}</dt>
                  <dd>{formatTaka(bill.total)}</dd>
                </div>
                <div>
                  <dt>Received</dt>
                  <dd>{formatTaka(b.amount_paid_bdt)}</dd>
                </div>
                <div className={styles.folioDue}>
                  <dt>Balance on room</dt>
                  <dd>{formatTaka(balance)}</dd>
                </div>
              </dl>
              {!bill.taxesKnown && (
                <p className="a-hint" style={{ marginTop: 10 }}>
                  VAT and service charge rates aren&apos;t set yet — add them in Settings to show full totals.
                </p>
              )}
            </div>
          </section>

          <section className="a-panel" aria-labelledby="hist-h">
            <div className="a-panel-head">
              <h2 id="hist-h" className="a-h2">
                History
              </h2>
            </div>
            <ol role="list" className={styles.history}>
              {events.map((e) => (
                <li key={e.id}>
                  <span className={styles.dot} data-kind={e.kind} aria-hidden="true" />
                  <span className={styles.histText}>
                    {describeEvent(e)}
                    <span className={styles.histMeta}>
                      {e.actor_name} · {dateTime(e.created_at)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AssignRoom, { AutoAssign } from "@/components/admin/AssignRoom";
import BookingRequests from "@/components/admin/BookingRequests";
import { PaymentBadge, SOURCE_LABEL, StatusBadge } from "@/components/admin/badges";
import { ChangeStay, EditGuest, PrintButton, RecordPayment } from "@/components/admin/BookingDialogs";
import LedgerPanel from "@/components/admin/LedgerPanel";
import MessageList from "@/components/admin/MessageList";
import StatusActions from "@/components/admin/StatusActions";
import { can } from "@/lib/access";
import { PaymentsRepo, type LedgerRow, type MessageRow, type RefundRow } from "@/lib/data/payments";
import { getSessionClient } from "@/lib/supabase";
import { describeEvent } from "@/lib/admin/events";
import { ago, dateTime, longDate } from "@/lib/admin/format";
import { roomOptions } from "@/lib/admin/rooms";
import { requireAdmin } from "@/lib/admin/session";
import { isLive } from "@/lib/data/rules";
import { hotelToday, nightsBetween } from "@/lib/dates";
import { formatTaka } from "@/lib/format";
import { getHotelInfo } from "@/lib/cms/content";
import styles from "./booking.module.css";

type Props = { params: Promise<{ reference: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).reference };
}

export default async function BookingPage({ params }: Props) {
  const { repo, mode, access, staff } = await requireAdmin();
  const HOTEL = await getHotelInfo();
  const { reference } = await params;
  const booking = await repo.getBooking(decodeURIComponent(reference));
  if (!booking) notFound();

  const [types, rooms, events, nearby, lines, requests] = await Promise.all([
    repo.listRoomTypes({ includeUnpublished: true }),
    repo.listRooms(),
    repo.bookingEvents(booking.id),
    repo.bookingsBetween(booking.check_in, booking.check_out),
    repo.linesBetween(booking.check_in, booking.check_out),
    repo.bookingRequests(booking.id),
  ]);

  // Ledger and guest messages (live only; RLS limits each to who may see it).
  let ledger: { payments: LedgerRow[]; refunds: RefundRow[] } = { payments: [], refunds: [] };
  let messages: MessageRow[] = [];
  if (mode === "live") {
    const pay = new PaymentsRepo(await getSessionClient());
    [ledger, messages] = await Promise.all([
      can(access, "payments.read") ? pay.ledger(booking.id).catch(() => ledger) : ledger,
      pay.messages({ bookingId: booking.id, limit: 30 }).catch(() => []),
    ]);
  }

  const today = hotelToday();
  const b = booking;
  const type = types.find((t) => t.id === b.room_type_id);
  const room = rooms.find((r) => r.id === b.room_id);
  const nights = nightsBetween(b.check_in, b.check_out);
  const balance = Math.max(0, b.total_bdt - b.amount_paid_bdt);
  const live = isLive(b.status);
  // The booking's own price breakdown, stored when the engine priced it.
  // total_bdt already includes service and VAT when the hotel had set them.
  const subtotal = b.subtotal_bdt ?? b.total_bdt;
  const discount = b.discount_bdt ?? 0;
  const taxesPending = b.price_detail?.taxes_pending ?? true;
  const myLines = lines.filter((l) => l.booking_id === b.id).sort((x, y) => (x.line_no ?? 0) - (y.line_no ?? 0));
  const unassigned = myLines.some((l) => !l.room_id);
  const multi = myLines.length > 1 || myLines.some((l) => l.room_type_id !== b.room_type_id);
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? "Room";
  const advanceOwed = b.payment_option === "advance" && (b.advance_due_bdt ?? 0) > b.amount_paid_bdt;

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
            needsRoom={myLines.length ? unassigned : b.rooms === 1 && !b.room_id}
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
                  total: b.total_bdt,
                  checkIn: b.check_in,
                  checkOut: b.check_out,
                  rooms: b.rooms,
                  adults: b.adults,
                  children: b.children,
                }}
                types={types.map((t) => ({ slug: t.slug, id: t.id, name: t.name, price: t.price_bdt, weekend: t.weekend_price_bdt, sleeps: t.sleeps }))}
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
                {!multi ? (
                  <>
                    <dt>Room type</dt>
                    <dd>{type?.name}</dd>
                    <dt>Room</dt>
                    <dd>
                      {live ? (
                        <AssignRoom compact bookingId={b.id} value={b.room_id} options={roomOptions(b, rooms, nearby, { lines })} />
                      ) : room ? (
                        room.number
                      ) : (
                        <span className="a-muted">—</span>
                      )}
                    </dd>
                  </>
                ) : (
                  <>
                    <dt>Rooms</dt>
                    <dd>
                      <ol role="list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {myLines.map((l, i) => (
                          <li key={l.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                            <span style={{ minWidth: 150 }}>
                              {i + 1}. {typeName(l.room_type_id)}
                            </span>
                            {live ? (
                              <AssignRoom
                                compact
                                bookingId={b.id}
                                lineId={l.id}
                                label={`Room for line ${i + 1}`}
                                value={l.room_id}
                                options={roomOptions(b, rooms, nearby, { typeId: l.room_type_id, lineId: l.id, lines })}
                              />
                            ) : (
                              <span className="a-muted">{rooms.find((r) => r.id === l.room_id)?.number ?? "—"}</span>
                            )}
                          </li>
                        ))}
                      </ol>
                      {live && unassigned && (
                        <div style={{ marginTop: 10 }}>
                          <AutoAssign bookingId={b.id} />
                        </div>
                      )}
                    </dd>
                  </>
                )}
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
          <BookingRequests requests={requests} />
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
                    Room · {nights} {nights === 1 ? "night" : "nights"}
                    {b.rooms > 1 ? ` × ${b.rooms} rooms` : ""} · avg {formatTaka(b.nightly_rate_bdt)} / night
                  </dt>
                  <dd>{formatTaka(subtotal)}</dd>
                </div>
                {discount > 0 && (
                  <div>
                    <dt>Promotion{b.price_detail?.promotion ? ` ${b.price_detail.promotion.code}` : ""}</dt>
                    <dd>−{formatTaka(discount)}</dd>
                  </div>
                )}
                {b.price_detail?.service_charge_percent != null && (
                  <div>
                    <dt>Service charge ({b.price_detail.service_charge_percent}%)</dt>
                    <dd>{formatTaka(b.service_charge_bdt ?? 0)}</dd>
                  </div>
                )}
                {b.price_detail?.vat_percent != null && (
                  <div>
                    <dt>VAT ({b.price_detail.vat_percent}%)</dt>
                    <dd>{formatTaka(b.vat_bdt ?? 0)}</dd>
                  </div>
                )}
                <div className={styles.folioTotal}>
                  <dt>{taxesPending ? "Room total" : "Total"}</dt>
                  <dd>{formatTaka(b.total_bdt)}</dd>
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
              {taxesPending && (
                <p className="a-hint" style={{ marginTop: 10 }}>
                  VAT and service charge weren&apos;t set when this booking was priced; add them to the bill at check-in.
                </p>
              )}
              {b.payment_option === "advance" && (
                <p className="a-hint" style={{ marginTop: 10 }}>
                  Guest chose to pay a {formatTaka(b.advance_due_bdt ?? 0)} advance
                  {advanceOwed && b.payment_due_at ? `, due by ${dateTime(b.payment_due_at)}; the booking is released automatically if nothing is received` : ""}.
                </p>
              )}
            </div>
          </section>

          {can(access, "payments.read") && (
            <LedgerPanel
              bookingId={b.id}
              reference={b.reference}
              payments={ledger.payments}
              refunds={ledger.refunds}
              paid={b.amount_paid_bdt}
              live={mode === "live"}
              me={staff.id}
              perms={{
                record: can(access, "payments.record"),
                void: can(access, "payments.void"),
                refundRequest: can(access, "refunds.request"),
                refundApprove: can(access, "refunds.approve"),
              }}
            />
          )}

          <section className="a-panel" aria-labelledby="msg-h">
            <div className="a-panel-head">
              <h2 id="msg-h" className="a-h2">
                Guest messages<span className="a-count">{messages.length}</span>
              </h2>
              <Link href="/admin/messages" className="a-btn a-btn--sm a-btn--ghost">
                All messages
              </Link>
            </div>
            <MessageList messages={messages} canResend={can(access, "bookings.write")} live={mode === "live"} />
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

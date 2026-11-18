import type { HotelInfo } from "@/lib/cms/hotel-info";
import type { InvoiceDoc, ReceiptDoc } from "@/lib/data/payments";
import { formatTaka } from "@/lib/format";
import { LEDGER_LABEL } from "@/lib/payments/methods";
import styles from "./documents.module.css";

const day = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
const stamp = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" }) : "";

function Letterhead({ hotel, kind, number, date }: { hotel: HotelInfo; kind: string; number: string; date: string }) {
  return (
    <div className={styles.head}>
      <div>
        <div className={styles.brand}>{hotel.fullName}</div>
        <div className={styles.small}>{hotel.address}</div>
        <div className={styles.small}>
          {hotel.phones.map((p) => p.display).join(" · ")} · {hotel.email}
        </div>
      </div>
      <div className={styles.title}>
        <h1>{kind}</h1>
        <div>
          <strong>{number}</strong>
        </div>
        <div className={styles.small}>{date}</div>
      </div>
    </div>
  );
}

/** A booking's invoice: itemised nights, discounts, taxes, payments and balance. */
export function InvoiceView({ doc, hotel }: { doc: InvoiceDoc; hotel: HotelInfo }) {
  const settled = doc.balance === 0 && doc.total > 0;
  return (
    <article className={styles.doc} aria-label={`Invoice ${doc.number}`}>
      <Letterhead hotel={hotel} kind="Invoice" number={doc.number} date={`Issued ${stamp(doc.issued_at)}`} />

      <div className={styles.meta}>
        <div>
          <span className={styles.label}>Billed to</span>
          <strong>{doc.guest.name}</strong>
          {doc.guest.phone && <div>{doc.guest.phone}</div>}
          {doc.guest.email && <div>{doc.guest.email}</div>}
          {doc.guest.country && <div className={styles.small}>{doc.guest.country}</div>}
        </div>
        <div>
          <span className={styles.label}>Booking</span>
          <strong>{doc.reference}</strong>
          <div>
            {day(doc.stay.check_in)} – {day(doc.stay.check_out)}
          </div>
          <div className={styles.small}>
            {doc.stay.nights} night{doc.stay.nights === 1 ? "" : "s"} · {doc.stay.adults} adult{doc.stay.adults === 1 ? "" : "s"}
            {doc.stay.children ? `, ${doc.stay.children} child${doc.stay.children === 1 ? "" : "ren"}` : ""}
          </div>
          {doc.status === "cancelled" && <span className={styles.stamp}>Cancelled</span>}
          {settled && doc.status !== "cancelled" && <span className={styles.stamp}>Paid in full</span>}
        </div>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Description</th>
            <th scope="col" className={`${styles.num} ${styles.hideNarrow}`}>
              Nights
            </th>
            <th scope="col" className={styles.num}>
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l, i) => {
            const nights = l.nights ?? [];
            const rates = [...new Set(nights.map((n) => n.rate))];
            return (
              <tr key={i}>
                <td>
                  <strong>{l.room_type}</strong>
                  {l.rate_plan ? <span className={styles.small}> · {l.rate_plan}</span> : null}
                  {nights.length > 0 && (
                    <div className={styles.small}>
                      {rates.length === 1
                        ? `${nights.length} × ${formatTaka(rates[0])}`
                        : nights.map((n) => `${day(n.night)} ${formatTaka(n.rate)}${n.season ? ` (${n.season})` : ""}`).join(" · ")}
                    </div>
                  )}
                </td>
                <td className={`${styles.num} ${styles.hideNarrow}`}>{nights.length || doc.stay.nights}</td>
                <td className={styles.num}>{formatTaka(l.subtotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <table className={styles.totals}>
        <tbody>
          <tr>
            <td>Room charges</td>
            <td className={styles.num}>{formatTaka(doc.subtotal)}</td>
          </tr>
          {doc.promotions.length > 0
            ? doc.promotions.map((p) => (
                <tr key={p.name}>
                  <td>
                    {p.name}
                    {p.code ? ` (${p.code})` : ""}
                  </td>
                  <td className={styles.num}>−{formatTaka(p.discount)}</td>
                </tr>
              ))
            : doc.discount > 0 && (
                <tr>
                  <td>Discount</td>
                  <td className={styles.num}>−{formatTaka(doc.discount)}</td>
                </tr>
              )}
          {doc.service_charge_percent != null && (
            <tr>
              <td>Service charge ({doc.service_charge_percent}%)</td>
              <td className={styles.num}>{formatTaka(doc.service_charge)}</td>
            </tr>
          )}
          {doc.vat_percent != null && (
            <tr>
              <td>VAT ({doc.vat_percent}%)</td>
              <td className={styles.num}>{formatTaka(doc.vat)}</td>
            </tr>
          )}
          <tr className={styles.grand}>
            <td>Total</td>
            <td className={styles.num}>{formatTaka(doc.total)}</td>
          </tr>
          <tr>
            <td>Paid</td>
            <td className={styles.num}>−{formatTaka(doc.paid)}</td>
          </tr>
          {doc.refunded > 0 && (
            <tr>
              <td>Refunded</td>
              <td className={styles.num}>{formatTaka(doc.refunded)}</td>
            </tr>
          )}
          <tr className={styles.due}>
            <td>{doc.credit > 0 ? "In credit" : "Balance due"}</td>
            <td className={styles.num}>{formatTaka(doc.credit > 0 ? doc.credit : doc.balance)}</td>
          </tr>
        </tbody>
      </table>
      {doc.taxes_pending && <p className={styles.small}>VAT and service charge, where they apply, are added at check-in.</p>}

      {(doc.payments.length > 0 || doc.refunds.length > 0) && (
        <>
          <h2 className={styles.section}>Payments</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Method</th>
                <th scope="col" className={styles.hideNarrow}>
                  Receipt / reference
                </th>
                <th scope="col" className={styles.num}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {doc.payments.map((p) => (
                <tr key={p.id}>
                  <td>{stamp(p.received_at)}</td>
                  <td>
                    {LEDGER_LABEL[p.method] ?? p.method}
                    {p.status === "pending" && <div className={styles.pending}>Being checked — not yet counted</div>}
                  </td>
                  <td className={styles.hideNarrow}>{[p.receipt_no, p.reference].filter(Boolean).join(" · ")}</td>
                  <td className={styles.num}>{formatTaka(p.amount)}</td>
                </tr>
              ))}
              {doc.refunds.map((r, i) => (
                <tr key={`r${i}`}>
                  <td>{stamp(r.completed_at)}</td>
                  <td>Refund · {LEDGER_LABEL[r.method] ?? r.method}</td>
                  <td className={styles.hideNarrow}>{r.reference ?? ""}</td>
                  <td className={styles.num}>−{formatTaka(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p className={styles.foot}>
        All amounts in Bangladeshi taka (BDT). Check-in from {hotel.checkIn}, check-out by {hotel.checkOut}. Generated {stamp(doc.generated_at)}. Thank you for
        staying with us.
      </p>
    </article>
  );
}

/** A payment receipt. */
export function ReceiptView({ doc, hotel }: { doc: ReceiptDoc; hotel: HotelInfo }) {
  return (
    <article className={styles.doc} aria-label={`Receipt ${doc.receipt_no}`}>
      <Letterhead hotel={hotel} kind="Receipt" number={doc.receipt_no} date={stamp(doc.received_at)} />
      <div className={styles.meta}>
        <div>
          <span className={styles.label}>Received from</span>
          <strong>{doc.guest.name}</strong>
          {doc.guest.phone && <div>{doc.guest.phone}</div>}
          {doc.guest.email && <div>{doc.guest.email}</div>}
        </div>
        <div>
          <span className={styles.label}>For booking</span>
          <strong>{doc.booking.reference}</strong>
          <div>
            {day(doc.booking.check_in)} – {day(doc.booking.check_out)}
          </div>
        </div>
      </div>
      <table className={styles.totals} style={{ marginLeft: 0, width: "100%" }}>
        <tbody>
          <tr className={styles.grand}>
            <td>Amount received</td>
            <td className={styles.num}>{formatTaka(doc.amount)}</td>
          </tr>
          <tr>
            <td>Method</td>
            <td className={styles.num}>{LEDGER_LABEL[doc.method] ?? doc.method}</td>
          </tr>
          {doc.reference && (
            <tr>
              <td>Transaction reference</td>
              <td className={styles.num}>{doc.reference}</td>
            </tr>
          )}
          <tr>
            <td>Booking total</td>
            <td className={styles.num}>{formatTaka(doc.booking.total)}</td>
          </tr>
          <tr>
            <td>Paid to date</td>
            <td className={styles.num}>{formatTaka(doc.booking.paid)}</td>
          </tr>
          <tr className={styles.due}>
            <td>Balance</td>
            <td className={styles.num}>{formatTaka(doc.booking.balance)}</td>
          </tr>
        </tbody>
      </table>
      <p className={styles.foot}>
        {doc.recorded_by ? `Recorded by ${doc.recorded_by}. ` : ""}This receipt confirms payment received by {hotel.fullName}. All amounts in Bangladeshi taka (BDT).
      </p>
    </article>
  );
}

export { styles as documentStyles };

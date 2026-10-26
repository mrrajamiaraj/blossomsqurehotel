"use client";

import { useState } from "react";
import type { HotelSettings } from "@/lib/data/types";
import { nightsBetween } from "@/lib/dates";
import { formatTaka, plural } from "@/lib/format";
import { RESERVATIONS } from "@/lib/hotel";
import { priceBreakdown } from "@/lib/pricing";
import type { Stay } from "@/lib/stay";
import StaySearch from "../booking/StaySearch";
import { Check, Phone } from "../icons";
import styles from "./RoomBookingCard.module.css";

type Props = {
  today: string;
  initial: Stay;
  slug: string;
  name: string;
  price: number;
  /** Units free for the initial dates, or null when availability isn't live. */
  available: number | null;
  rates: Pick<HotelSettings, "vat_percent" | "service_charge_percent">;
};

/** Sticky reservation card; the price breakdown follows the chosen dates. */
export default function RoomBookingCard({ today, initial, slug, name, price, available, rates }: Props) {
  const [stay, setStay] = useState(initial);
  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const subtotal = price * nights * stay.rooms;
  const bill = priceBreakdown(subtotal, rates);
  const datesChanged = stay.checkIn !== initial.checkIn || stay.checkOut !== initial.checkOut || stay.rooms !== initial.rooms;
  const soldOut = available !== null && !datesChanged && available < stay.rooms;

  return (
    <aside className={styles.card} aria-label={`Reserve the ${name}`}>
      <div className={styles.head}>
        <span className={styles.price}>
          {formatTaka(price)} <span>/ night</span>
        </span>
        {available !== null && !datesChanged && (
          <span className={`${styles.badge} ${soldOut ? styles.badgeOff : ""}`}>
            {soldOut ? (
              "Fully booked"
            ) : (
              <>
                <Check size={14} />
                {available === 1 ? "Last one left" : "Available"}
              </>
            )}
          </span>
        )}
      </div>

      <div className={styles.form}>
        <StaySearch
          today={today}
          initial={initial}
          action="/booking"
          extraParams={{ room: slug }}
          variant="card"
          submitLabel={soldOut ? "Check other dates" : `Reserve this ${name.includes("Suite") ? "suite" : "room"}`}
          onChange={setStay}
        />
      </div>

      <dl className={styles.breakdown}>
        <div>
          <dt>
            {formatTaka(price)} × {plural(nights, "night")}
            {stay.rooms > 1 ? ` × ${stay.rooms} rooms` : ""}
          </dt>
          <dd key={subtotal} className={styles.tick}>
            {formatTaka(subtotal)}
          </dd>
        </div>
        <div>
          <dt>Breakfast for {stay.adults + stay.children}</dt>
          <dd className={styles.included}>Included</dd>
        </div>
        {bill.service != null && (
          <div>
            <dt>Service charge ({rates.service_charge_percent}%)</dt>
            <dd>{formatTaka(bill.service)}</dd>
          </div>
        )}
        {bill.vat != null && (
          <div>
            <dt>VAT ({rates.vat_percent}%)</dt>
            <dd>{formatTaka(bill.vat)}</dd>
          </div>
        )}
        {!bill.taxesKnown && (
          <div>
            <dt>{bill.vat == null && bill.service == null ? "VAT & service charge" : "Other charges"}</dt>
            <dd className={styles.muted}>At check-in</dd>
          </div>
        )}
        <div className={styles.total}>
          <dt>{bill.taxesKnown ? "Total" : "Room total"}</dt>
          <dd key={`t${bill.total}`} className={styles.tick}>
            {formatTaka(bill.total)}
          </dd>
        </div>
      </dl>
      <p className={styles.note}>Nothing is charged online. You pay at the hotel.</p>

      <a href={RESERVATIONS.href} className={styles.call}>
        <Phone size={18} />
        <span>
          Prefer to talk? <strong>{RESERVATIONS.display}</strong>
        </span>
      </a>
    </aside>
  );
}

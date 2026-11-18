"use client";

import { useState } from "react";
import type { HotelSettings } from "@/lib/data/types";
import { formatTaka } from "@/lib/format";
import { useHotelInfo } from "@/components/cms/HotelInfo";
import { nightsLabel, priceBreakdown, stayCost, type RoomRates } from "@/lib/pricing";
import type { Stay } from "@/lib/stay";
import StaySearch from "../booking/StaySearch";
import { Check, Phone } from "../icons";
import { WasPrice, WeekendNote } from "../ui/Rate";
import styles from "./RoomBookingCard.module.css";

type Props = {
  today: string;
  initial: Stay;
  slug: string;
  name: string;
  price: RoomRates;
  /** Units free for the initial dates, or null when availability isn't live. */
  available: number | null;
  rates: Pick<HotelSettings, "vat_percent" | "service_charge_percent">;
};

/** Sticky reservation card; the price breakdown follows the chosen dates. */
export default function RoomBookingCard({ today, initial, slug, name, price, available, rates }: Props) {
  const RESERVATIONS = useHotelInfo().phones[0] ?? { href: "/contact", display: "the front desk" };
  const [stay, setStay] = useState(initial);
  const cost = stayCost(price, stay.checkIn, stay.checkOut, stay.rooms);
  const subtotal = cost.total;
  const bill = priceBreakdown(subtotal, rates);
  const datesChanged = stay.checkIn !== initial.checkIn || stay.checkOut !== initial.checkOut || stay.rooms !== initial.rooms;
  const soldOut = available !== null && !datesChanged && available < stay.rooms;

  return (
    <aside className={styles.card} aria-label={`Reserve the ${name}`}>
      <div className={styles.head}>
        <span className={styles.price}>
          <WasPrice rates={price} />
          {formatTaka(price.price_bdt)} <span>/ night</span>
          <WeekendNote rates={price} />
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
        {cost.lines.map((l) => (
          <div key={l.kind}>
            <dt>
              {formatTaka(l.rate)} × {nightsLabel(l)}
              {stay.rooms > 1 ? ` × ${stay.rooms} rooms` : ""}
            </dt>
            <dd key={l.rate * l.nights * stay.rooms} className={styles.tick}>
              {formatTaka(l.rate * l.nights * stay.rooms)}
            </dd>
          </div>
        ))}
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
      <p className={styles.note}>Nothing is charged online. Pay at the hotel, or send an advance by bKash, Nagad or bank transfer.</p>

      <a href={RESERVATIONS.href} className={styles.call}>
        <Phone size={18} />
        <span>
          Prefer to talk? <strong>{RESERVATIONS.display}</strong>
        </span>
      </a>
    </aside>
  );
}

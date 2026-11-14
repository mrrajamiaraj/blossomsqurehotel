import { addDays, nightsBetween, toDate } from "./dates";
import type { HotelSettings, RoomTypeRecord } from "./data/types";

/* ---------- Nightly rates ---------- */

export type RoomRates = Pick<RoomTypeRecord, "price_bdt" | "weekend_price_bdt"> &
  Partial<Pick<RoomTypeRecord, "rack_price_bdt">>;

/**
 * Nights charged at the weekend rate, by the weekday the night starts on.
 * Bangladesh's weekend is Friday–Saturday, so Thursday and Friday nights are
 * the busy ones. Keep in step with public._is_weekend_night in the database.
 */
export const WEEKEND_NIGHTS = [4, 5];
export const WEEKEND_LABEL = "Thursday & Friday nights";

export function isWeekendNight(iso: string): boolean {
  return WEEKEND_NIGHTS.includes(toDate(iso).getUTCDay());
}

export function nightRate(r: RoomRates, iso: string): number {
  return isWeekendNight(iso) && r.weekend_price_bdt ? r.weekend_price_bdt : r.price_bdt;
}

export type StayCost = {
  /** All rooms, all nights. */
  total: number;
  /** Average nightly rate per room, rounded; what a booking records as its rate. */
  average: number;
  /** Charge lines, e.g. [{ rate: 2500, nights: 2, kind: "weekday" }, { rate: 3500, nights: 1, kind: "weekend" }]. */
  lines: { rate: number; nights: number; kind: "weekday" | "weekend" | "night" }[];
};

export function stayCost(r: RoomRates, checkIn: string, checkOut: string, rooms = 1): StayCost {
  const nights = Math.max(0, nightsBetween(checkIn, checkOut));
  let weekday = 0;
  let weekend = 0;
  for (let i = 0; i < nights; i++) {
    if (isWeekendNight(addDays(checkIn, i)) && r.weekend_price_bdt) weekend++;
    else weekday++;
  }
  const perRoom = weekday * r.price_bdt + weekend * (r.weekend_price_bdt ?? 0);
  const split = weekday > 0 && weekend > 0;
  const lines: StayCost["lines"] = [];
  if (weekday) lines.push({ rate: r.price_bdt, nights: weekday, kind: split ? "weekday" : "night" });
  if (weekend) lines.push({ rate: r.weekend_price_bdt!, nights: weekend, kind: split ? "weekend" : "night" });
  return {
    total: perRoom * rooms,
    average: nights ? Math.round(perRoom / nights) : r.price_bdt,
    lines,
  };
}

/** "2 weekday nights", "1 weekend night", "3 nights". */
export function nightsLabel(line: StayCost["lines"][number]): string {
  const noun = line.kind === "night" ? "night" : `${line.kind} night`;
  return `${line.nights} ${line.nights === 1 ? noun : `${noun}s`}`;
}

/* ---------- Taxes ---------- */

export type PriceBreakdown = {
  room: number;
  service: number | null;
  vat: number | null;
  /** Room + service + VAT when both rates are set; otherwise the room total. */
  total: number;
  /** True when the hotel has set its rates, so the total is final. */
  taxesKnown: boolean;
};

type TaxRates = Pick<HotelSettings, "vat_percent" | "service_charge_percent">;

/** One line describing how taxes are handled, for policies and summaries. */
export function taxNote(rates: TaxRates): string {
  const parts = [
    rates.service_charge_percent != null ? `${rates.service_charge_percent}% service charge` : null,
    rates.vat_percent != null ? `${rates.vat_percent}% VAT` : null,
  ].filter(Boolean);
  if (!parts.length) return "VAT and service charge are added at check-in.";
  return `Prices include room rates only; ${parts.join(" and ")} are added to your bill.`;
}

/**
 * Service charge applies to the room total; VAT applies to room + service,
 * as is usual for hotels in Bangladesh. Rounded to whole taka.
 */
export function priceBreakdown(room: number, rates: TaxRates): PriceBreakdown {
  const svcRate = rates.service_charge_percent;
  const vatRate = rates.vat_percent;
  const service = svcRate == null ? null : Math.round((room * svcRate) / 100);
  const vat = vatRate == null ? null : Math.round(((room + (service ?? 0)) * vatRate) / 100);
  const taxesKnown = svcRate != null && vatRate != null;
  return { room, service, vat, total: room + (service ?? 0) + (vat ?? 0), taxesKnown };
}

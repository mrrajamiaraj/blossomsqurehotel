import type { HotelSettings } from "./data/types";

export type PriceBreakdown = {
  room: number;
  service: number | null;
  vat: number | null;
  /** Room + service + VAT when both rates are set; otherwise the room total. */
  total: number;
  /** True when the hotel has set its rates, so the total is final. */
  taxesKnown: boolean;
};

type Rates = Pick<HotelSettings, "vat_percent" | "service_charge_percent">;

/** One line describing how taxes are handled, for policies and summaries. */
export function taxNote(rates: Rates): string {
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
export function priceBreakdown(room: number, rates: Rates): PriceBreakdown {
  const svcRate = rates.service_charge_percent;
  const vatRate = rates.vat_percent;
  const service = svcRate == null ? null : Math.round((room * svcRate) / 100);
  const vat = vatRate == null ? null : Math.round(((room + (service ?? 0)) * vatRate) / 100);
  const taxesKnown = svcRate != null && vatRate != null;
  return { room, service, vat, total: room + (service ?? 0) + (vat ?? 0), taxesKnown };
}

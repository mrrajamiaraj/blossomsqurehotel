import type { RoomTypeRecord } from "../data/types";
import { WEEKEND_LABEL } from "../pricing";

/**
 * Offers & packages.
 *
 * Two kinds:
 *  - Rate offers derived live from the room rates in Supabase (the direct
 *    rate against the published rate, and weekday against weekend nights).
 *    Nothing here holds a price; every number comes from `room_types`.
 *  - Packages the hotel publishes (honeymoon, family, corporate…). None are
 *    published yet. Contract for the next phase: an `offers` table managed
 *    from Admin, read through `OfferSource`.
 */
export type Offer = {
  id: string;
  /** Small label above the title, e.g. "Every day" or "Code SEA10". */
  badge?: string;
  title: string;
  /** Accent phrase, set in italic. */
  accent?: string;
  summary: string;
  /** Lines such as "Save up to ৳4,000 a night on the Executive Family Suite". */
  highlights: string[];
  /** Where the call to action goes. */
  href: string;
  cta: string;
  terms?: string;
  /** ISO dates, inclusive; null = no end date. */
  validFrom?: string | null;
  validTo?: string | null;
};

export interface OfferSource {
  getPackages(): Promise<Offer[]>;
}

export const noPackagesYet: OfferSource = {
  async getPackages() {
    return [];
  },
};

type Rates = Pick<RoomTypeRecord, "slug" | "name" | "price_bdt" | "weekend_price_bdt" | "rack_price_bdt">;

const taka = (n: number) => `৳${n.toLocaleString("en-US")}`;

/** Offers that follow from the live rates. Returns nothing if rates don't support them. */
export function rateOffers(rooms: Rates[]): Offer[] {
  const offers: Offer[] = [];

  const direct = rooms
    .filter((r) => r.rack_price_bdt && r.rack_price_bdt > r.price_bdt)
    .map((r) => ({ r, save: r.rack_price_bdt! - r.price_bdt, pct: Math.round(((r.rack_price_bdt! - r.price_bdt) / r.rack_price_bdt!) * 100) }))
    .sort((a, b) => b.save - a.save);
  if (direct.length) {
    const maxPct = Math.max(...direct.map((d) => d.pct));
    offers.push({
      id: "direct",
      title: "Book direct,",
      accent: `save up to ${maxPct}%`,
      summary:
        "Our direct weekday rates sit below the hotel's published rates on every room type. Book on this website or by phone and the lower rate is the one you pay.",
      highlights: direct.slice(0, 3).map(({ r, save }) => `${r.name}: ${taka(r.price_bdt)} instead of ${taka(r.rack_price_bdt!)}, ${taka(save)} less a night`),
      href: "/rooms",
      cta: "See all rooms",
      terms: "Published rate shown for comparison. Weekend nights are charged at the weekend rate.",
    });
  }

  const midweek = rooms
    .filter((r) => r.weekend_price_bdt && r.weekend_price_bdt > r.price_bdt)
    .map((r) => ({ r, save: r.weekend_price_bdt! - r.price_bdt }))
    .sort((a, b) => b.save - a.save);
  if (midweek.length) {
    offers.push({
      id: "midweek",
      title: "Midweek by the sea,",
      accent: "for less",
      summary: `Stay Sunday to Wednesday nights and pay the weekday rate. ${WEEKEND_LABEL} are charged at the weekend rate.`,
      highlights: midweek.slice(0, 3).map(({ r, save }) => `${r.name}: ${taka(save)} less a night than at weekends`),
      href: "/booking",
      cta: "Plan a midweek stay",
    });
  }

  return offers;
}

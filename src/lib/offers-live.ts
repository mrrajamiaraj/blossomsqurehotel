import "server-only";
import type { OffersContent } from "./cms/sections";
import type { Offer } from "./content/offers";
import { formatLong, hotelToday } from "./dates";
import { getPublicClient } from "./supabase";

type Row = {
  id: string;
  code: string | null;
  name: string;
  description: string;
  discount_type: "percent" | "amount";
  discount_value: number;
  starts_on: string;
  ends_on: string;
  min_nights: number;
  room_type_ids: string[];
  stackable: boolean;
  max_discount_bdt: number | null;
  bookable_until: string | null;
};

const taka = (n: number) => `৳${n.toLocaleString("en-US")}`;
const lastNight = (endExclusive: string) => {
  const d = new Date(`${endExclusive}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Public, switched-on offers from Admin → Offers (RLS lets visitors see only
 * those), described from their own rules — the same rules the booking engine
 * applies, so the page never promises a discount the guest won't get.
 */
export async function liveOffers(roomNames: Map<string, string>): Promise<Offer[]> {
  const db = getPublicClient();
  if (!db) return [];
  const today = hotelToday();
  const { data, error } = await db
    .from("promotions")
    .select("id, code, name, description, discount_type, discount_value, starts_on, ends_on, min_nights, room_type_ids, stackable, max_discount_bdt, bookable_until")
    .order("starts_on");
  if (error) {
    console.error("Offers unavailable:", error.message);
    return [];
  }
  return ((data ?? []) as Row[])
    .filter((p) => p.ends_on > today && (!p.bookable_until || p.bookable_until >= today))
    .map((p) => {
      const amount = p.discount_type === "percent" ? `${p.discount_value}% off` : `${taka(p.discount_value)} off your stay`;
      const rooms = p.room_type_ids.map((id) => roomNames.get(id)).filter(Boolean) as string[];
      return {
        id: `promo-${p.id}`,
        badge: p.code ? `Code ${p.code}` : "Applied automatically",
        title: p.name,
        summary: p.description || (p.code ? `Enter ${p.code} when you book.` : "Taken off automatically when you book qualifying dates on this website."),
        highlights: [
          `${amount}${p.max_discount_bdt ? `, up to ${taka(p.max_discount_bdt)}` : ""}`,
          `Nights from ${formatLong(p.starts_on)} to ${formatLong(lastNight(p.ends_on))}${p.min_nights > 1 ? `, ${p.min_nights} nights or more` : ""}`,
          rooms.length ? `For the ${rooms.join(", ")}` : "On every room type",
          ...(p.bookable_until ? [`Book by ${formatLong(p.bookable_until)}`] : []),
        ],
        href: "/booking",
        cta: "Book with this offer",
        terms: p.stackable ? "Can be combined with other combinable offers." : "Can't be combined with other offers; you always get the better deal.",
      } satisfies Offer;
    });
}

/** Packages written in Website content → Offers & packages. */
export function packageOffers(c: OffersContent): Offer[] {
  return c.packages
    .filter((p) => p.title)
    .map((p, i) => ({
      id: `package-${i}`,
      badge: p.badge || "Package",
      title: p.title,
      accent: p.accent || undefined,
      summary: p.summary,
      highlights: p.highlights,
      href: p.href || "/booking",
      cta: p.cta || "Enquire",
      terms: p.terms || undefined,
    }));
}

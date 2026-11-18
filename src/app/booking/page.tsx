import type { Metadata } from "next";
import BookingFlow, { type BookRoom } from "@/components/booking/BookingFlow";
import { getEngine } from "@/lib/data/engine";
import type { SearchOption } from "@/lib/data/engine-types";
import { errorCode } from "@/lib/data/errors";
import { hotelToday, nightsBetween } from "@/lib/dates";
import { priceBreakdown, stayCost } from "@/lib/pricing";
import { getRooms, getSettings } from "@/lib/rooms";
import { parseStay } from "@/lib/stay";

export const metadata: Metadata = {
  title: "Book your stay",
  robots: { index: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BookingPage({ searchParams }: Props) {
  const params = await searchParams;
  const today = hotelToday();
  const stay = parseStay(params, today);
  const [rooms, settings] = await Promise.all([getRooms(), getSettings()]);
  const requested = typeof params.room === "string" ? params.room : null;

  // Live prices and availability, both from the database's booking engine.
  let options: SearchOption[] | null = null;
  const engine = getEngine();
  if (engine) {
    try {
      options = await engine.search({ checkIn: stay.checkIn, checkOut: stay.checkOut, adults: stay.adults, children: stay.children });
    } catch (err) {
      console.error("Availability search failed:", errorCode(err));
    }
  }
  const live = options !== null;
  const nights = nightsBetween(stay.checkIn, stay.checkOut);

  const bookRooms: BookRoom[] = rooms.flatMap((r) => {
    const o = options?.find((x) => x.roomType === r.slug);
    if (live && !o) return []; // not bookable online
    // Offline (booking disabled): show the published rates for reference only.
    const offline = o ? null : priceBreakdown(stayCost(r, stay.checkIn, stay.checkOut).total, settings);
    return [
      {
        slug: r.slug,
        name: r.name,
        tag: r.tag,
        meta: [r.bed, `Sleeps ${r.sleeps}`, ...r.features.filter((f) => f.includes("bathroom") || f === "Balcony")].join(" · "),
        sleeps: r.sleeps,
        cover: r.gallery[0],
        available: o?.available ?? 0,
        total: o?.total ?? offline!.total,
        subtotal: o?.subtotal ?? offline!.room,
        perNight: Math.round((o?.subtotal ?? offline!.room) / nights),
      },
    ];
  });

  return (
    <BookingFlow
      today={today}
      stay={stay}
      live={live}
      settings={settings}
      initialRoom={bookRooms.some((r) => r.slug === requested) ? requested : null}
      rooms={bookRooms}
    />
  );
}

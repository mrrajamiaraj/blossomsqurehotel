import type { Metadata } from "next";
import BookingFlow from "@/components/booking/BookingFlow";
import { getAvailability } from "@/lib/availability";
import { hotelToday } from "@/lib/dates";
import { getRooms, getSettings, ratesOf } from "@/lib/rooms";
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
  const availability = await getAvailability(rooms, stay.checkIn, stay.checkOut);
  const requested = typeof params.room === "string" ? params.room : null;

  return (
    <BookingFlow
      today={today}
      stay={stay}
      live={availability.live}
      settings={settings}
      initialRoom={rooms.some((r) => r.slug === requested) ? requested : null}
      rooms={rooms.map((r) => ({
        slug: r.slug,
        name: r.name,
        tag: r.tag,
        meta: [r.bed, `Sleeps ${r.sleeps}`, ...r.features.filter((f) => f.includes("bathroom") || f === "Balcony")].join(" · "),
        rates: ratesOf(r),
        cover: r.gallery[0],
        available: availability.bySlug[r.slug] ?? 0,
      }))}
    />
  );
}

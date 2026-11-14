import type { Metadata } from "next";
import StaySearch from "@/components/booking/StaySearch";
import SplitWords from "@/components/motion/SplitWords";
import RoomsList from "@/components/rooms/RoomsList";
import { getAvailability } from "@/lib/availability";
import { formatRange, hotelToday, nightsBetween } from "@/lib/dates";
import { HOTEL } from "@/lib/hotel";
import { getRooms, getSettings, ratesOf } from "@/lib/rooms";
import { parseStay } from "@/lib/stay";
import styles from "./rooms.module.css";

export const metadata: Metadata = {
  title: "Rooms & Suites",
  description:
    "Seven ways to stay at Blossom Square in Kolatoli, Cox's Bazar, from a couple's room to a family suite, with weekday rates from ৳2,500.",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function RoomsPage({ searchParams }: Props) {
  const today = hotelToday();
  const stay = parseStay(await searchParams, today);
  const [rooms, settings] = await Promise.all([getRooms(), getSettings()]);
  const availability = await getAvailability(rooms, stay.checkIn, stay.checkOut);
  const nights = nightsBetween(stay.checkIn, stay.checkOut);

  return (
    <>
      <section className={styles.intro} aria-labelledby="page-h">
        <div className={`wrap ${styles.introGrid}`}>
          <p className="caps eyebrow" data-reveal="up">
            Accommodations
          </p>
          <h1 id="page-h" className={`h1 ${styles.title}`} data-reveal="words">
            <SplitWords text="Rooms *& Suites*" />
          </h1>
          <p className={`lede ${styles.lede}`} data-reveal="up" style={{ "--d": "300ms" } as React.CSSProperties}>
            {rooms.length} ways to stay, from a room for two to a family suite. Every room has a private bathroom, AC, TV,
            Wi-Fi and hot water. Weekday rates run Sunday to Wednesday nights; Thursday and Friday nights are charged at the
            weekend rate.
          </p>
        </div>
      </section>

      <div className={styles.searchBar}>
        <div className="wrap">
          <StaySearch
            key={`${stay.checkIn}${stay.checkOut}${stay.adults}${stay.children}${stay.rooms}`}
            today={today}
            initial={stay}
            action="/rooms"
            variant="bar"
            submitLabel="Update"
          />
        </div>
      </div>

      <section className={`wrap ${styles.results}`} aria-label="Available rooms">
        <RoomsList
          stay={stay}
          nights={nights}
          live={availability.live}
          rangeLabel={`${formatRange(stay.checkIn, stay.checkOut)} · ${nights} ${nights === 1 ? "night" : "nights"}`}
          rooms={rooms.map((r) => ({
            slug: r.slug,
            name: r.name,
            tag: r.tag,
            bed: r.bed,
            floor: r.floor,
            size: r.size_sqft ? `${r.size_sqft} sq ft` : "",
            sleeps: r.sleeps,
            blurb: r.blurb,
            features: r.features,
            rates: ratesOf(r),
            gallery: r.gallery,
            available: availability.bySlug[r.slug] ?? 0,
          }))}
        />
      </section>

      <section className={`wrap ${styles.policies}`} aria-labelledby="pol-h">
        <div className={styles.policyCard} data-reveal="up">
          <h2 id="pol-h" className={`h3 ${styles.policyTitle}`}>
            Good to know <em>before you book</em>
          </h2>
          <dl className={styles.policyList}>
            <div>
              <dt>Check-in / out</dt>
              <dd>
                From {HOTEL.checkIn} / until {HOTEL.checkOut}. Early or late on request.
              </dd>
            </div>
            <div>
              <dt>Cancellation</dt>
              <dd>{settings.cancellation_policy}</dd>
            </div>
            <div>
              <dt>House rules</dt>
              <dd>No pets. Airport transfers on request, at an extra charge.</dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}

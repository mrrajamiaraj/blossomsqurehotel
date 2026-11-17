import Link from "next/link";
import StaySearch from "@/components/booking/StaySearch";
import RoomsExplorer from "@/components/rooms/RoomsExplorer";
import CtaBand from "@/components/site/CtaBand";
import PageHero from "@/components/site/PageHero";
import { getAvailability } from "@/lib/availability";
import { formatRange, hotelToday, nightsBetween } from "@/lib/dates";
import { HOTEL } from "@/lib/hotel";
import { WEEKEND_LABEL } from "@/lib/pricing";
import { parseFilters } from "@/lib/room-filters";
import { getRooms, getSettings, ratesOf } from "@/lib/rooms";
import { pageMetadata } from "@/lib/seo";
import { parseStay } from "@/lib/stay";
import styles from "./rooms.module.css";

export const metadata = pageMetadata({
  title: "Rooms & Suites",
  description: "Seven ways to stay at Blossom Square in Kolatoli, Cox's Bazar, from a couple's room to a family suite. Live availability and direct rates.",
  path: "/rooms",
});

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function RoomsPage({ searchParams }: Props) {
  const params = await searchParams;
  const today = hotelToday();
  const stay = parseStay(params, today);
  const [rooms, settings] = await Promise.all([getRooms(), getSettings()]);
  const availability = await getAvailability(rooms, stay.checkIn, stay.checkOut);
  const nights = nightsBetween(stay.checkIn, stay.checkOut);

  return (
    <>
      <PageHero
        eyebrow="Accommodation"
        title={
          <>
            Rooms <em>&amp; Suites</em>
          </>
        }
        lede={`${rooms.length} ways to stay, from a room for two to a family suite. Every room has a private bathroom, air conditioning, TV, Wi-Fi and hot water, and breakfast is included.`}
        crumbs={[{ label: "Rooms & Suites" }]}
      />

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

      <section className={`wrap ${styles.results}`} aria-label="Rooms">
        <RoomsExplorer
          key={`${stay.checkIn}${stay.checkOut}${stay.adults}${stay.children}${stay.rooms}`}
          stay={stay}
          nights={nights}
          live={availability.live}
          initial={parseFilters(params)}
          rangeLabel={`${formatRange(stay.checkIn, stay.checkOut)} · ${nights} ${nights === 1 ? "night" : "nights"}`}
          rooms={rooms.map((r) => ({
            slug: r.slug,
            name: r.name,
            tag: r.tag,
            bed: r.bed,
            sleeps: r.sleeps,
            size: r.size_sqft ? `${r.size_sqft} sq ft` : "",
            blurb: r.blurb,
            features: r.features,
            rates: ratesOf(r),
            cover: r.gallery[0],
            photoCount: r.gallery.filter((p) => p.src).length,
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
              <dt>Rates</dt>
              <dd>Weekday rates Sunday to Wednesday nights; {WEEKEND_LABEL.toLowerCase()} at the weekend rate.</dd>
            </div>
            <div>
              <dt>{settings.cancellation_policy ? "Cancellation" : "House rules"}</dt>
              <dd>
                {settings.cancellation_policy || "No pets. Airport transfers on request, at an extra charge."}{" "}
                <Link href="/terms" className="text-link">
                  Booking terms
                </Link>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <CtaBand
        eyebrow="Not sure which room?"
        title={<>Tell us who&apos;s coming, <em>we&apos;ll suggest one.</em></>}
        body="Families, friends travelling together, a honeymoon: our front desk knows every room and can advise on the best fit."
        bookHref="/contact"
        bookLabel="Ask the front desk"
        message="Hello, which room would suit us best?"
      />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, PathIcon } from "@/components/icons";
import { Button } from "@/components/primitives/button";
import RoomBookingCard from "@/components/rooms/RoomBookingCard";
import Breadcrumbs from "@/components/site/Breadcrumbs";
import ContactActions from "@/components/site/ContactActions";
import Gallery from "@/components/system/Gallery";
import RoomCard from "@/components/system/RoomCard";
import Accordion from "@/components/ui/Accordion";
import { featureIcon, ICONS } from "@/lib/amenities";
import { getAvailability } from "@/lib/availability";
import { hotelToday } from "@/lib/dates";
import { formatTaka, roomKind } from "@/lib/format";
import { HOTEL } from "@/lib/hotel";
import { taxNote, WEEKEND_LABEL } from "@/lib/pricing";
import { getRoom, getRooms, getSettings, ratesOf } from "@/lib/rooms";
import { JsonLd, SITE_URL } from "@/lib/seo";
import { parseStay, stayQuery } from "@/lib/stay";
import styles from "./room.module.css";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateStaticParams() {
  const rooms = await getRooms();
  return rooms.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const room = await getRoom((await params).slug);
  if (!room) return {};
  const cover = room.gallery.find((p) => p.src)?.src;
  return {
    title: room.name,
    description: room.blurb,
    alternates: { canonical: `/rooms/${room.slug}` },
    openGraph: { title: `${room.name} · ${HOTEL.fullName}`, description: room.blurb, url: `/rooms/${room.slug}`, ...(cover ? { images: [{ url: cover }] } : {}) },
  };
}

const INCLUDED = [
  { name: "Breakfast buffet", icon: ICONS.breakfast },
  { name: "Swimming pool", icon: ICONS.pool },
  { name: "Free Wi-Fi", icon: ICONS.wifi },
  { name: "Free parking", icon: ICONS.parking },
];

export default async function RoomPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const room = await getRoom(slug);
  if (!room) notFound();

  const today = hotelToday();
  const stay = parseStay(query, today);
  const [rooms, settings] = await Promise.all([getRooms(), getSettings()]);
  const availability = await getAvailability(rooms, stay.checkIn, stay.checkOut);
  // Closest in price first: the natural alternatives to this room.
  const others = rooms
    .filter((r) => r.slug !== room.slug)
    .sort((a, b) => Math.abs(a.price_bdt - room.price_bdt) - Math.abs(b.price_bdt - room.price_bdt))
    .slice(0, 3);
  const photos = room.gallery.filter((p) => p.src).length ? room.gallery.filter((p) => p.src) : room.gallery;

  const specs = [
    ["Beds", room.bed],
    room.size_sqft ? ["Size", `${room.size_sqft} sq ft`] : null,
    ["Sleeps", `${room.sleeps} guests`],
    room.view ? ["View", room.view] : ["Breakfast", "Included"],
  ].filter((s): s is string[] => s !== null);

  const roomLd = {
    "@context": "https://schema.org",
    "@type": "HotelRoom",
    name: room.name,
    description: room.description || room.blurb,
    url: `${SITE_URL}/rooms/${room.slug}`,
    bed: room.bed,
    occupancy: { "@type": "QuantitativeValue", maxValue: room.sleeps, unitText: "guests" },
    ...(photos[0]?.src ? { image: photos.filter((p) => p.src).map((p) => `${SITE_URL}${p.src}`) } : {}),
    containedInPlace: { "@type": "Hotel", name: HOTEL.fullName, url: SITE_URL },
    offers: {
      "@type": "Offer",
      priceCurrency: "BDT",
      price: room.price_bdt,
      priceSpecification: { "@type": "UnitPriceSpecification", price: room.price_bdt, priceCurrency: "BDT", unitText: "night" },
      url: `${SITE_URL}/booking?room=${room.slug}`,
    },
  };

  return (
    <>
      <div className={`wrap ${styles.top}`}>
        <Breadcrumbs items={[{ label: "Rooms & Suites", href: `/rooms?${stayQuery(stay)}` }, { label: room.name }]} className="mb-6" />
        <Gallery photos={photos} title={room.name} max={5} />
      </div>

      <div className={`wrap ${styles.layout}`}>
        <div className={styles.main}>
          <header className={styles.intro}>
            <p className="caps eyebrow" data-reveal="up">
              {[roomKind(room.tag), room.floor].filter(Boolean).join(" · ")}
            </p>
            <h1 className={`h1 ${styles.name}`} data-reveal="up">
              {room.name}
            </h1>
            <p className="lede" data-reveal="up" style={{ "--d": "200ms" } as React.CSSProperties}>
              {room.description || room.blurb}
            </p>
          </header>

          <dl className={styles.specs} data-reveal="up">
            {specs.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>

          <section aria-labelledby="in-room">
            <h2 id="in-room" className={`h3 ${styles.subhead}`} data-reveal="up">
              In the room
            </h2>
            <ul role="list" className={styles.amenities}>
              {room.features.map((f, i) => (
                <li key={f} data-reveal="up" style={{ "--d": `${i * 50}ms` } as React.CSSProperties}>
                  <span className={styles.amenIcon}>
                    <PathIcon d={featureIcon(f)} size={22} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="included">
            <h2 id="included" className={`h3 ${styles.subhead}`} data-reveal="up">
              Included with your stay
            </h2>
            <ul role="list" className={styles.amenities}>
              {INCLUDED.map((f) => (
                <li key={f.name} data-reveal="up">
                  <span className={styles.amenIcon}>
                    <PathIcon d={f.icon} size={22} />
                  </span>
                  {f.name}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-ink-soft">
              Room service around the clock, and airport transfers on request at an extra charge.{" "}
              <Link href="/facilities" className="text-link">
                All facilities
              </Link>
            </p>
          </section>

          <section aria-labelledby="policies">
            <h2 id="policies" className={`h3 ${styles.subhead}`} data-reveal="up">
              Policies
            </h2>
            <div data-reveal="up">
              <Accordion
                items={[
                  { title: "Check-in", body: `From ${HOTEL.checkIn}. Early check-in on request, subject to availability.` },
                  { title: "Check-out", body: `Until ${HOTEL.checkOut}. Late check-out on request.` },
                  { title: "Cancellation", body: settings.cancellation_policy },
                  { title: "Children & extra beds", body: settings.children_policy },
                  {
                    title: "Rates",
                    body:
                      room.weekend_price_bdt && room.weekend_price_bdt !== room.price_bdt
                        ? `${formatTaka(room.price_bdt)} a night Sunday to Wednesday, ${formatTaka(room.weekend_price_bdt)} on ${WEEKEND_LABEL.toLowerCase()}.${room.rack_price_bdt ? ` Published rate ${formatTaka(room.rack_price_bdt)}.` : ""}`
                        : `${formatTaka(room.price_bdt)} a night.`,
                  },
                  { title: "Taxes", body: taxNote(settings) },
                  { title: "Pets", body: "We're unable to accommodate pets." },
                ].filter((item) => item.body)}
              />
            </div>
          </section>

          <section aria-labelledby="questions" className="border-t border-line pt-10">
            <h2 id="questions" className="h4">
              Questions about this room?
            </h2>
            <p className="mt-2 text-ink-soft">Our front desk can tell you about views, floors and connecting rooms.</p>
            <ContactActions className="mt-5" size="sm" email={false} message={`Hello, I have a question about the ${room.name}.`} />
          </section>
        </div>

        <div className={styles.side}>
          <RoomBookingCard
            today={today}
            initial={stay}
            slug={room.slug}
            name={room.name}
            price={ratesOf(room)}
            available={availability.live ? (availability.bySlug[room.slug] ?? 0) : null}
            rates={{ vat_percent: settings.vat_percent, service_charge_percent: settings.service_charge_percent }}
          />
        </div>
      </div>

      <section className={`section ${styles.others}`} aria-labelledby="other-h">
        <div className="wrap">
          <div className="mb-[clamp(36px,5vw,64px)] flex flex-wrap items-end justify-between gap-6">
            <h2 id="other-h" className={`h2 ${styles.othersTitle} !mb-0`}>
              Other ways <em>to stay</em>
            </h2>
            <Button asChild variant="link">
              <Link href={`/rooms?${stayQuery(stay)}`}>
                Compare all {rooms.length} rooms <ArrowRight />
              </Link>
            </Button>
          </div>
          <ul role="list" className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {others.map((r) => (
              <li key={r.slug} data-reveal="up">
                <RoomCard
                  href={`/rooms/${r.slug}?${stayQuery(stay)}`}
                  name={r.name}
                  kind={roomKind(r.tag)}
                  photo={r.gallery[0]}
                  facts={[r.bed, `Sleeps ${r.sleeps}`]}
                  priceBdt={r.price_bdt}
                  wasBdt={r.rack_price_bdt}
                  className="h-full"
                />
              </li>
            ))}
          </ul>
        </div>
      </section>
      <JsonLd data={roomLd} />
    </>
  );
}

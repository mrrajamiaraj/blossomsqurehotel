import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, PathIcon } from "@/components/icons";
import SplitWords from "@/components/motion/SplitWords";
import RoomBookingCard from "@/components/rooms/RoomBookingCard";
import RoomGallery from "@/components/rooms/RoomGallery";
import Accordion from "@/components/ui/Accordion";
import PhotoFrame from "@/components/ui/PhotoFrame";
import { featureIcon } from "@/lib/amenities";
import { getAvailability } from "@/lib/availability";
import { hotelToday } from "@/lib/dates";
import { formatTaka, roomKind } from "@/lib/format";
import { HOTEL } from "@/lib/hotel";
import { taxNote, WEEKEND_LABEL } from "@/lib/pricing";
import { getRoom, getRooms, getSettings, ratesOf } from "@/lib/rooms";
import { WasPrice } from "@/components/ui/Rate";
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
  return room ? { title: room.name, description: room.blurb } : {};
}

export default async function RoomPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const room = await getRoom(slug);
  if (!room) notFound();

  const today = hotelToday();
  const stay = parseStay(query, today);
  const [rooms, settings] = await Promise.all([getRooms(), getSettings()]);
  const availability = await getAvailability(rooms, stay.checkIn, stay.checkOut);
  const others = rooms.filter((r) => r.slug !== room.slug);

  const specs = [
    ["Beds", room.bed],
    room.size_sqft ? ["Size", `${room.size_sqft} sq ft`] : null,
    ["Sleeps", `${room.sleeps} guests`],
    room.view ? ["View", room.view] : null,
  ].filter((s): s is string[] => s !== null);

  return (
    <>
      <div className={`wrap ${styles.top}`}>
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/rooms?${stayQuery(stay)}`}>Rooms &amp; Suites</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{room.name}</span>
        </nav>
        <RoomGallery photos={room.gallery} title={room.name} />
      </div>

      <div className={`wrap ${styles.layout}`}>
        <div className={styles.main}>
          <header className={styles.intro}>
            <p className="caps eyebrow" data-reveal="up">
              {[roomKind(room.tag), room.floor].filter(Boolean).join(" · ")}
            </p>
            <h1 className={`h1 ${styles.name}`} data-reveal="words">
              <SplitWords text={room.name} />
            </h1>
            <p className="lede" data-reveal="up" style={{ "--d": "250ms" } as React.CSSProperties}>
              {room.description}
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
                ]}
              />
            </div>
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
          <h2 id="other-h" className={`h2 ${styles.othersTitle}`} data-reveal="words">
            <SplitWords text="Other ways *to stay*" />
          </h2>
          <div className={styles.otherGrid}>
            {others.map((r, i) => (
              <Link
                key={r.slug}
                href={`/rooms/${r.slug}?${stayQuery(stay)}`}
                className={`${styles.other} hover-zoom`}
                data-reveal="up"
                style={{ "--d": `${i * 120}ms` } as React.CSSProperties}
              >
                <PhotoFrame photo={r.gallery[0]} zoom className={styles.otherPhoto} sizes="(max-width: 900px) 100vw, 25vw" />
                <span className={styles.otherBody}>
                  <span className="caps">{roomKind(r.tag)}</span>
                  <span className={styles.otherName}>{r.name}</span>
                  <span className={styles.otherPrice}>
                    <WasPrice rates={r} />
                    From {formatTaka(r.price_bdt)} / night
                  </span>
                  <span className={styles.otherCta}>
                    View room <ArrowRight />
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

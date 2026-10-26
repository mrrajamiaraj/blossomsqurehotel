import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, PathIcon } from "@/components/icons";
import SplitWords from "@/components/motion/SplitWords";
import RoomBookingCard from "@/components/rooms/RoomBookingCard";
import RoomGallery from "@/components/rooms/RoomGallery";
import Accordion from "@/components/ui/Accordion";
import PhotoFrame from "@/components/ui/PhotoFrame";
import { ROOM_AMENITIES } from "@/lib/amenities";
import { getAvailability } from "@/lib/availability";
import { hotelToday } from "@/lib/dates";
import { formatTaka } from "@/lib/format";
import { HOTEL } from "@/lib/hotel";
import { taxNote } from "@/lib/pricing";
import { getRoom, getRooms, getSettings } from "@/lib/rooms";
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
    ["Bed", room.bed.replace(" bed", "")],
    ["Size", room.size_sqft ? `${room.size_sqft} sq ft` : "[SIZE] sq ft"],
    ["Sleeps", `${room.sleeps} guests`],
    ["View", room.view],
  ];

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
              {room.tag === "SUITE" ? "Suite" : "Deluxe"} · {room.floor}
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
              {ROOM_AMENITIES.map((a, i) => (
                <li key={a.name} data-reveal="up" style={{ "--d": `${i * 50}ms` } as React.CSSProperties}>
                  <span className={styles.amenIcon}>
                    <PathIcon d={a.icon} size={22} />
                  </span>
                  {a.name}
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
            price={room.price_bdt}
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
                  <span className="caps">{r.tag === "SUITE" ? "Suite" : "Deluxe"}</span>
                  <span className={styles.otherName}>{r.name}</span>
                  <span className={styles.otherPrice}>From {formatTaka(r.price_bdt)} / night</span>
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

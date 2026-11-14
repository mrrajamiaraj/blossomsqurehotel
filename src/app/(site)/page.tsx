import Image from "next/image";
import Link from "next/link";
import StaySearch from "@/components/booking/StaySearch";
import MapEmbed from "@/components/home/MapEmbed";
import RoomShowcase from "@/components/home/RoomShowcase";
import StickyBook from "@/components/home/StickyBook";
import StoryTabs, { type Story } from "@/components/home/StoryTabs";
import { ArrowRight, PathIcon } from "@/components/icons";
import Parallax from "@/components/motion/Parallax";
import SplitWords from "@/components/motion/SplitWords";
import CopyButton from "@/components/ui/CopyButton";
import PhotoFrame from "@/components/ui/PhotoFrame";
import { HOTEL_AMENITIES } from "@/lib/amenities";
import { hotelToday } from "@/lib/dates";
import { HOTEL, RESERVATIONS, WHATSAPP } from "@/lib/hotel";
import { photo } from "@/lib/photos";
import { getRooms } from "@/lib/rooms";
import { defaultStay } from "@/lib/stay";
import styles from "./home.module.css";

// Re-read rooms and rates from Supabase every few minutes.
export const revalidate = 300;

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

// Kept to places and directions; no distances until the hotel confirms them.
const NEARBY: [string, string][] = [
  ["Kolatoli beach", "A few minutes on foot"],
  ["Laboni Point & Burmese Market", "North, in town"],
  ["Himchari & Marine Drive", "South along the coast"],
  ["Inani Beach", "Further south on Marine Drive"],
];

const STORIES: Story[] = [
  {
    id: "dining",
    tab: "Dining",
    eyebrow: "Restaurant & café",
    title: "Seafood from these shores, *breakfast on us.*",
    body: "The restaurant and café serve Bangladeshi and international dishes, with fish from Cox's Bazar's own catch. The lounge stays open for evening coffee.",
    points: [
      "Breakfast buffet, included with every room",
      "Bangladeshi & international kitchen",
      "Fish from the morning's local catch",
      "Twenty-four-hour room service",
    ],
    cta: { label: "Call to reserve a table", href: RESERVATIONS.href },
    photo: photo("RESTAURANT", "The restaurant and café", "dusk"),
  },
  {
    id: "events",
    tab: "Meetings & Events",
    eyebrow: "Banquet & conference",
    title: "From board meetings to *wedding receptions.*",
    body: "A conference room with high-speed Wi-Fi and a banquet hall with full catering. Our events team looks after the setup, décor and menus.",
    points: [
      "Conference room with high-speed Wi-Fi",
      "Banquet hall with full catering",
      "Setup, décor and menus arranged for you",
    ],
    cta: { label: "Enquire about an event", href: RESERVATIONS.href },
    photo: photo("BANQUET", "The banquet hall", "forest"),
  },
];

export default async function HomePage() {
  const rooms = await getRooms();
  const today = hotelToday();
  const fromPrice = Math.min(...rooms.map((r) => r.price_bdt));

  const hero = photo("DSC5566", "The Connecting King Suite in the evening, lamps lit above the bed", "dusk");
  const lobby = photo("DSC5562", "The upstairs corridor, with original artwork on the walls", "sand");
  const pool = photo("DSC5552", "Turn-down in a Deluxe Couple room", "sea");
  const bay = photo("DSC5579", "A Standard Couple room, curtains drawn", "sea");

  return (
    <>
      {/* ---------------------------------------------------------- Hero */}
      <section className={styles.hero} aria-label="Welcome">
        <div className={styles.heroMedia}>
          <Parallax speed={-0.1} className={styles.heroDrift}>
            <PhotoFrame photo={hero} priority className={styles.heroPhoto} />
          </Parallax>
          <div className={styles.heroShade} />
        </div>

        <div className={`wrap ${styles.heroInner}`}>
          <div className={styles.heroMeta} data-reveal="fade" style={d(200)}>
            <span className="caps">Kolatoli · Cox&apos;s Bazar</span>
            <span className={`caps ${styles.coords}`}>21°25′ N — 91°59′ E</span>
          </div>

          <h1 className={`display ${styles.heroTitle}`} data-reveal="words" style={d(150)}>
            <SplitWords text="A short walk from the *world's longest* sea beach." />
          </h1>

          <div className={styles.heroFoot}>
            <p className={styles.heroLede} data-reveal="up" style={d(700)}>
              Sea-view suites with private balconies, a pool to come back to, and breakfast with every room.
            </p>
            <div className={styles.scrollCue} aria-hidden="true" data-reveal="fade" style={d(1100)}>
              <span className="caps">Scroll</span>
              <span className={styles.scrollLine} />
            </div>
          </div>
        </div>

        <div className={`wrap ${styles.searchWrap}`} data-reveal="up" style={d(900)}>
          <StaySearch today={today} initial={defaultStay(today)} action="/rooms" placement="top" />
        </div>
      </section>

      {/* ---------------------------------------------------------- The hotel */}
      <section className={`section ${styles.about}`} aria-labelledby="about-h">
        <div className={`wrap ${styles.aboutGrid}`}>
          <p className={`caps eyebrow ${styles.aboutEyebrow}`} data-reveal="up">
            The hotel
          </p>
          <h2 id="about-h" className={`h2 ${styles.aboutTitle}`} data-reveal="words">
            <SplitWords text="Quiet rooms on Light House Road, *the sea at the end of the street.*" />
          </h2>

          <div className={styles.aboutCopy}>
            <p className={`lede ${styles.dropcap}`} data-reveal="up">
              Blossom Square sits in Kolatoli, Cox&apos;s Bazar&apos;s hotel quarter, a few minutes on foot from the sand.
              Come for the beach, stay in for the pool, the restaurant and round-the-clock room service, whether
              you&apos;re here on holiday or on business.
            </p>
            <dl className={styles.facts}>
              {[
                ["Steps", "to the sea beach"],
                ["Included", "breakfast, every room"],
                ["24 hours", "room service"],
              ].map(([value, label], i) => (
                <div key={value} className={styles.fact} data-reveal="up" style={d(120 * i)}>
                  <dt className={styles.factLabel}>{label}</dt>
                  <dd className={styles.factValue}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className={styles.collage}>
            <div className={styles.collageA}>
              <div data-reveal="mask">
                <PhotoFrame photo={lobby} sizes="(max-width: 900px) 80vw, 40vw" />
              </div>
            </div>
            <div className={styles.collageB}>
              <div data-reveal="mask" style={d(250)}>
                <PhotoFrame photo={pool} sizes="(max-width: 900px) 60vw, 28vw" />
              </div>
            </div>
            <p className={styles.caption} data-reveal="fade" style={d(400)}>
              Upstairs, and a Deluxe Couple room at turn-down.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Rooms */}
      <section className={`section ${styles.rooms}`} aria-labelledby="rooms-h">
        <div className="wrap">
          <div className={styles.head}>
            <div>
              <p className="caps eyebrow" data-reveal="up">
                Rooms &amp; Suites
              </p>
              <h2 id="rooms-h" className={`h2 ${styles.headTitle}`} data-reveal="words">
                <SplitWords text="A room *for every trip.*" />
              </h2>
            </div>
            <Link href="/rooms" className="link-line" data-reveal="fade">
              Compare all rooms
              <ArrowRight />
            </Link>
          </div>
          <div data-reveal="up" style={d(150)}>
            <RoomShowcase
              rooms={rooms.map((r) => ({
                slug: r.slug,
                name: r.name,
                tag: r.tag,
                blurb: r.blurb,
                features: r.features.filter((f) => f.toLowerCase().includes("bed") || f.includes("bathroom") || f === "Balcony"),
                price: r.price_bdt,
                cover: r.gallery[0],
              }))}
            />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Amenities */}
      <section id="amenities" className={`section ${styles.amenities}`} aria-labelledby="amen-h">
        <div className={`wrap ${styles.amenGrid}`}>
          <div className={styles.amenIntro}>
            <p className="caps eyebrow" data-reveal="up">
              With every stay
            </p>
            <h2 id="amen-h" className="h2" data-reveal="words">
              <SplitWords text="Nothing to add *at checkout.*" />
            </h2>
            <p className={styles.amenLede} data-reveal="up" style={d(200)}>
              Breakfast, parking, Wi-Fi and the pool are part of the room rate. Airport pickup and drop-off can be
              arranged for an extra charge.
            </p>
          </div>
          <ul role="list" className={styles.amenList}>
            {HOTEL_AMENITIES.map((a, i) => (
              <li key={a.name} className={styles.amenity} data-reveal="up" style={d((i % 2) * 90 + Math.floor(i / 2) * 60)}>
                <span className={styles.amenIcon}>
                  <PathIcon d={a.icon} size={30} strokeWidth={1.1} />
                </span>
                <span className={styles.amenName}>{a.name}</span>
                <span className={styles.amenNote}>{a.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------- The bay */}
      <section className={styles.bay} aria-label="The view">
        <div className={styles.bayMedia}>
          <Parallax speed={-0.12} className={styles.bayDrift}>
            <PhotoFrame photo={bay} className={styles.bayPhoto} />
          </Parallax>
          <div className={styles.bayShade} />
        </div>
        <div className={`wrap on-dark ${styles.bayInner}`}>
          <p className="caps eyebrow" data-reveal="up">
            From your balcony
          </p>
          <p className={`h1 ${styles.bayLine}`} data-reveal="words">
            <SplitWords text="The Bay of Bengal, *every morning.*" />
          </p>
          <div className={styles.bayActions} data-reveal="up" style={d(300)}>
            <Link href="/booking" className="btn btn--light">
              Reserve your stay
              <ArrowRight />
            </Link>
            <a href={RESERVATIONS.href} className="btn btn--ghost-light">
              Call to book
            </a>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Dining & events */}
      <section className={`section on-dark ${styles.stories}`} aria-labelledby="stories-h">
        <div className="wrap">
          <div className={styles.head}>
            <h2 id="stories-h" className="h2" data-reveal="words">
              <SplitWords text="At the table, *and beyond it.*" />
            </h2>
          </div>
          <div data-reveal="up" style={d(150)}>
            <StoryTabs stories={STORIES} />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Location */}
      <section id="location" className={`section ${styles.location}`} aria-labelledby="loc-h">
        <div className={`wrap ${styles.locGrid}`}>
          <div>
            <p className="caps eyebrow" data-reveal="up">
              Find us
            </p>
            <h2 id="loc-h" className="h2" data-reveal="words">
              <SplitWords text="In the heart *of Kolatoli.*" />
            </h2>
            <dl className={styles.details}>
              <div className={styles.detail} data-reveal="up">
                <dt>Address</dt>
                <dd>
                  <span>{HOTEL.address}</span>
                  <CopyButton text={HOTEL.address} label="Address" className={styles.copy} />
                </dd>
              </div>
              <div className={styles.detail} data-reveal="up" style={d(80)}>
                <dt>Call</dt>
                <dd className={styles.stack}>
                  {HOTEL.phones.map((p) => (
                    <a key={p.href} href={p.href} className="text-link">
                      {p.display}
                    </a>
                  ))}
                </dd>
              </div>
              <div className={styles.detail} data-reveal="up" style={d(120)}>
                <dt>WhatsApp</dt>
                <dd className={styles.whatsapp}>
                  <a href={WHATSAPP.href} target="_blank" rel="noopener noreferrer" className="text-link">
                    {WHATSAPP.display}
                  </a>
                  <Image
                    src={WHATSAPP.qr}
                    alt="QR code: scan to chat with Blossom Square on WhatsApp"
                    width={120}
                    height={120}
                    className={styles.qr}
                  />
                </dd>
              </div>
              <div className={styles.detail} data-reveal="up" style={d(160)}>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${HOTEL.email}`} className="text-link">
                    {HOTEL.email}
                  </a>
                </dd>
              </div>
              <div className={styles.detail} data-reveal="up" style={d(240)}>
                <dt>Arriving</dt>
                <dd>Airport pickup and drop-off on request, at an extra charge.</dd>
              </div>
            </dl>
            <div className={styles.nearby} data-reveal="up">
              <p className={styles.nearbyTitle}>Nearby</p>
              <ul role="list">
                {NEARBY.map(([place, note]) => (
                  <li key={place}>
                    <span>{place}</span>
                    <span className={styles.nearbyNote}>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div data-reveal="up" style={d(200)}>
            <MapEmbed />
          </div>
        </div>
      </section>

      <StickyBook fromPrice={fromPrice} />
    </>
  );
}

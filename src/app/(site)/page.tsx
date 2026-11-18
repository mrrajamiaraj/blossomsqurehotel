import Image from "next/image";
import Link from "next/link";
import StaySearch from "@/components/booking/StaySearch";
import MapEmbed from "@/components/home/MapEmbed";
import StickyBook from "@/components/home/StickyBook";
import StoryTabs, { type Story } from "@/components/home/StoryTabs";
import { ArrowRight, ArrowUpRight, PathIcon } from "@/components/icons";
import Gallery from "@/components/system/Gallery";
import RoomCard from "@/components/system/RoomCard";
import TestimonialCard from "@/components/system/TestimonialCard";
import { getHotelInfo, getSection } from "@/lib/cms/content";
import type { ImageValue } from "@/lib/cms/fields";
import { iconPath } from "@/lib/cms/sections";
import { seoMetadata } from "@/lib/cms/seo";
import { galleryItems } from "@/lib/content/gallery";
import { rateOffers } from "@/lib/content/offers";
import { getReviews, REVIEWS_URL } from "@/lib/content/reviews";
import { roomKind } from "@/lib/format";
import { hotelJsonLd, JsonLd } from "@/lib/seo";
import Parallax from "@/components/motion/Parallax";
import SplitWords from "@/components/motion/SplitWords";
import CopyButton from "@/components/ui/CopyButton";
import PhotoFrame from "@/components/ui/PhotoFrame";
import { hotelToday } from "@/lib/dates";
import { photo, type Tone } from "@/lib/photos";
import { getRooms } from "@/lib/rooms";
import { defaultStay } from "@/lib/stay";
import styles from "./home.module.css";

// Re-read rooms and rates from Supabase every few minutes.
export const revalidate = 300;

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export async function generateMetadata() {
  return seoMetadata("home", "/photos/DSC5566.jpg");
}

/** A CMS photo slot as the site's Photo (empty slots show the tonal plate). */
const pic = (img: ImageValue | null, fallbackAlt: string, tone: Tone) => (img ? photo(img.src, img.alt || fallbackAlt, tone) : photo("", fallbackAlt, tone));

/** Three rooms that span the range: the first by price, the middle, and the top suite. */
function pickFeatured<T extends { price_bdt: number; gallery: { src: string | null }[] }>(rooms: T[]): T[] {
  const byPrice = [...rooms].sort((a, b) => a.price_bdt - b.price_bdt);
  const picks = [byPrice[0], byPrice[Math.floor(byPrice.length / 2)], byPrice[byPrice.length - 1]].filter(Boolean);
  return [...new Set(picks)];
}

export default async function HomePage() {
  const [rooms, reviews, c, HOTEL] = await Promise.all([getRooms(), getReviews({ limit: 2 }), getSection("home"), getHotelInfo()]);
  const WHATSAPP = HOTEL.whatsapp;
  const today = hotelToday();
  const fromPrice = Math.min(...rooms.map((r) => r.price_bdt));
  const featured = pickFeatured(rooms);
  const offer = rateOffers(rooms)[0] ?? null;
  const gallery = galleryItems();

  const hero = pic(c.hero_photo, "Blossom Square Hotel & Suites", "dusk");
  const lobby = pic(c.intro_photo_a, "Inside the hotel", "sand");
  const pool = pic(c.intro_photo_b, "A room at the hotel", "sea");
  const bay = pic(c.bay_photo, "The view", "sea");
  const STORIES: Story[] = [
    {
      id: "dining",
      tab: c.dining_tab || "Dining",
      eyebrow: c.dining_eyebrow,
      title: c.dining_title,
      body: c.dining_body,
      points: c.dining_points,
      cta: { label: "Dining at Blossom Square", href: "/dining" },
      photo: pic(c.dining_photo, "The restaurant and café", "dusk"),
    },
    {
      id: "events",
      tab: c.events_tab || "Meetings & Events",
      eyebrow: c.events_eyebrow,
      title: c.events_title,
      body: c.events_body,
      points: c.events_points,
      cta: { label: "Plan an event", href: "/meetings-events" },
      photo: pic(c.events_photo, "The banquet hall", "forest"),
    },
  ];

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
            <span className="caps">{c.hero_eyebrow}</span>
            <span className={`caps ${styles.coords}`}>21°25′ N — 91°59′ E</span>
          </div>

          <h1 className={`display ${styles.heroTitle}`} data-reveal="words" style={d(150)}>
            <SplitWords text={c.hero_title} />
          </h1>

          <div className={styles.heroFoot}>
            <p className={styles.heroLede} data-reveal="up" style={d(700)}>
              {c.hero_lede}
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
            {c.intro_eyebrow}
          </p>
          <h2 id="about-h" className={`h2 ${styles.aboutTitle}`} data-reveal="words">
            <SplitWords text={c.intro_title} />
          </h2>

          <div className={styles.aboutCopy}>
            <p className={`lede ${styles.dropcap}`} data-reveal="up">
              {c.intro_body}
            </p>
            <dl className={styles.facts}>
              {c.intro_facts.map(({ value, label }, i) => (
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
            {c.intro_caption && (
              <p className={styles.caption} data-reveal="fade" style={d(400)}>
                {c.intro_caption}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Rooms */}
      <section className={`section ${styles.rooms}`} aria-labelledby="rooms-h">
        <div className="wrap">
          <div className={styles.head}>
            <div>
              <p className="caps eyebrow" data-reveal="up">
                {c.rooms_eyebrow}
              </p>
              <h2 id="rooms-h" className={`h2 ${styles.headTitle}`} data-reveal="words">
                <SplitWords text={c.rooms_title} />
              </h2>
            </div>
            <Link href="/rooms" className="link-line" data-reveal="fade">
              Compare all {rooms.length} rooms
              <ArrowRight />
            </Link>
          </div>
          <ul role="list" className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {featured.map((r, i) => (
              <li key={r.slug} data-reveal="up" style={d(i * 120)} className={i === 0 ? "md:col-span-2 lg:col-span-1" : undefined}>
                <RoomCard
                  href={`/rooms/${r.slug}`}
                  name={r.name}
                  kind={roomKind(r.tag)}
                  photo={r.gallery[0]}
                  facts={[r.bed, `Sleeps ${r.sleeps}`]}
                  blurb={r.blurb}
                  priceBdt={r.price_bdt}
                  wasBdt={r.rack_price_bdt}
                  bookHref={`/booking?room=${r.slug}`}
                  className="h-full"
                />
              </li>
            ))}
          </ul>
          <p className={styles.roomsNote} data-reveal="fade">
            Also: {rooms.filter((r) => !featured.includes(r)).map((r, i, all) => (
              <span key={r.slug}>
                <Link href={`/rooms/${r.slug}`} className="text-link">
                  {r.name}
                </Link>
                {i < all.length - 1 ? ", " : "."}
              </span>
            ))}
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------- Amenities */}
      <section id="amenities" className={`section ${styles.amenities}`} aria-labelledby="amen-h">
        <div className={`wrap ${styles.amenGrid}`}>
          <div className={styles.amenIntro}>
            <p className="caps eyebrow" data-reveal="up">
              {c.amenities_eyebrow}
            </p>
            <h2 id="amen-h" className="h2" data-reveal="words">
              <SplitWords text={c.amenities_title} />
            </h2>
            <p className={styles.amenLede} data-reveal="up" style={d(200)}>
              {c.amenities_lede}
            </p>
            <Link href="/facilities" className="link-line" data-reveal="fade">
              All facilities
              <ArrowRight />
            </Link>
          </div>
          <ul role="list" className={styles.amenList}>
            {c.amenities.map((a, i) => (
              <li key={`${a.name}-${i}`} className={styles.amenity} data-reveal="up" style={d((i % 2) * 90 + Math.floor(i / 2) * 60)}>
                <span className={styles.amenIcon}>
                  <PathIcon d={iconPath(a.icon)} size={30} strokeWidth={1.1} />
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
            {c.bay_eyebrow}
          </p>
          <p className={`h1 ${styles.bayLine}`} data-reveal="words">
            <SplitWords text={c.bay_title} />
          </p>
          <div className={styles.bayActions} data-reveal="up" style={d(300)}>
            <Link href="/booking" className="btn btn--light">
              Reserve your stay
              <ArrowRight />
            </Link>
            {HOTEL.phones[0] && (
              <a href={HOTEL.phones[0].href} className="btn btn--ghost-light">
                Call to book
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Dining & events */}
      <section className={`section on-dark ${styles.stories}`} aria-labelledby="stories-h">
        <div className="wrap">
          <div className={styles.head}>
            <h2 id="stories-h" className="h2" data-reveal="words">
              <SplitWords text={c.stories_title} />
            </h2>
          </div>
          <div data-reveal="up" style={d(150)}>
            <StoryTabs stories={STORIES} />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Gallery */}
      <section className="section" aria-labelledby="gallery-h">
        <div className="wrap">
          <div className={styles.head}>
            <div>
              <p className="caps eyebrow" data-reveal="up">
                {c.gallery_eyebrow}
              </p>
              <h2 id="gallery-h" className={`h2 ${styles.headTitle}`} data-reveal="words">
                <SplitWords text={c.gallery_title} />
              </h2>
            </div>
            <Link href="/gallery" className="link-line" data-reveal="fade">
              See every photograph
              <ArrowRight />
            </Link>
          </div>
          <div data-reveal="up">
            <Gallery photos={gallery} title="Blossom Square" max={5} />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Offers & reviews */}
      <section className={`section ${styles.proof}`} aria-label="Offers and reviews">
        <div className={`wrap ${styles.proofGrid}`}>
          {offer && (
            <article className={styles.offer} data-reveal="up" aria-labelledby="offer-h">
              <p className="caps eyebrow">Offers</p>
              <h2 id="offer-h" className="h2">
                {offer.title} {offer.accent && <em>{offer.accent}</em>}
              </h2>
              <p className={styles.offerBody}>{offer.summary}</p>
              <Link href="/offers" className="link-line">
                See offers
                <ArrowRight />
              </Link>
            </article>
          )}
          <div className={styles.reviews} data-reveal="up" style={d(150)}>
            <p className="caps eyebrow">Guest reviews</p>
            {reviews.length ? (
              <div className={styles.reviewList}>
                {reviews.map((t) => (
                  <TestimonialCard key={t.author + t.quote.slice(0, 16)} t={t} variant="feature" />
                ))}
              </div>
            ) : (
              <>
                <p className={`h3 ${styles.reviewsLine}`}>
                  Read what guests say, <em>in their own words.</em>
                </p>
                <p className={styles.offerBody}>We only share reviews guests have published themselves. You&apos;ll find them, and can leave your own, on our Google listing.</p>
                <a href={REVIEWS_URL} target="_blank" rel="noopener noreferrer" className="link-line">
                  Reviews on Google
                  <ArrowUpRight />
                </a>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Location */}
      <section id="location" className={`section ${styles.location}`} aria-labelledby="loc-h">
        <div className={`wrap ${styles.locGrid}`}>
          <div>
            <p className="caps eyebrow" data-reveal="up">
              {c.location_eyebrow}
            </p>
            <h2 id="loc-h" className="h2" data-reveal="words">
              <SplitWords text={c.location_title} />
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
                  {WHATSAPP.qr && (
                    <Image
                      src={WHATSAPP.qr}
                      alt="QR code: scan to chat with Blossom Square on WhatsApp"
                      width={120}
                      height={120}
                      className={styles.qr}
                    />
                  )}
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
                <dd>{HOTEL.arriving}</dd>
              </div>
            </dl>
            <div className={styles.nearby} data-reveal="up">
              <p className={styles.nearbyTitle}>Nearby</p>
              <ul role="list">
                {c.nearby.map(({ place, note }) => (
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
      <JsonLd data={hotelJsonLd({ image: hero.src ?? "/photos/DSC5566.jpg", priceRange: `৳${fromPrice.toLocaleString("en-US")}+ per night`, hotel: HOTEL })} />
    </>
  );
}

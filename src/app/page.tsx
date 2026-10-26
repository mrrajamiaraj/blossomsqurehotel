import Link from "next/link";
import AvailabilityForm from "@/components/AvailabilityForm";
import RoomCarousel from "@/components/RoomCarousel";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { ArrowIcon, BedIcon, GuestIcon, PathIcon, PinIcon, SizeIcon } from "@/components/icons";
import { HOME_AMENITIES, HOME_AMENITIES_MOBILE } from "@/lib/amenities";
import { HOTEL, RESERVATIONS } from "@/lib/hotel";
import { formatTaka, getRoomTypes } from "@/lib/rooms";
import styles from "./page.module.css";

// Re-read room rates from Supabase every few minutes.
export const revalidate = 300;

function hotelToday(): string {
  // en-CA formats as yyyy-mm-dd; the hotel runs on Dhaka time.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
}

function plusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function HomePage() {
  const rooms = await getRoomTypes();
  const fromPrice = Math.min(...rooms.map((r) => r.price_bdt));
  const today = hotelToday();

  return (
    <>
      <SiteHeader overlayOnMobile />

      <main>
        {/* Hero + availability */}
        <section aria-label="Welcome" className={styles.heroSection}>
          <div className={`ph ${styles.hero}`}>
            <div className={styles.heroShade} />
            <div className={styles.heroPhotoRef}>
              PHOTO · <span className="desktop-only">HOTEL EXTERIOR AT DUSK · </span>DSC5562
            </div>
            <div className={styles.heroContent}>
              <p className={styles.heroKicker}>KOLATOLI · COX&apos;S BAZAR</p>
              <h1 className={styles.heroTitle}>
                A short walk from the <em>world&apos;s longest</em> sea beach.
              </h1>
              <p className={styles.heroLead}>
                Sea-view suites with private balconies, a pool to come back to, and breakfast included with
                every room.
              </p>
            </div>
          </div>
          <div className={styles.formWrap}>
            <AvailabilityForm today={today} defaultCheckIn={plusDays(today, 1)} defaultCheckOut={plusDays(today, 4)} />
          </div>
        </section>

        {/* About */}
        <section aria-labelledby="about-h" className={`desktop-only ${styles.about}`}>
          <div className={styles.collage}>
            <div className={`ph-l ${styles.collageBack}`}>
              <span className={styles.photoRefDark}>PHOTO · LOBBY · DSC5575</span>
            </div>
            <div className={`ph ${styles.collageFront}`}>
              <span className={styles.photoRef}>PHOTO · POOL · DSC5555</span>
            </div>
          </div>
          <div>
            <p className={styles.eyebrow}>THE HOTEL</p>
            <h2 id="about-h" className={styles.h2}>
              Quiet rooms on Light House Road, the sea at the end of the street.
            </h2>
            <p className={styles.aboutLead}>
              Blossom Square sits in Kolatoli, Cox&apos;s Bazar&apos;s hotel quarter, a few minutes on foot from
              the sand. Come for the beach, stay in for the pool, the restaurant and 24-hour room service,
              whether you&apos;re here on holiday or on business.
            </p>
            <div className={styles.facts}>
              <div className={styles.fact}>
                <span className={styles.factValue}>Steps</span>
                <span className={styles.factLabel}>to the sea beach</span>
              </div>
              <div className={styles.fact}>
                <span className={styles.factValue}>Included</span>
                <span className={styles.factLabel}>breakfast buffet, every room</span>
              </div>
              <div className={styles.fact}>
                <span className={styles.factValue}>24 hours</span>
                <span className={styles.factLabel}>room service</span>
              </div>
            </div>
          </div>
        </section>

        {/* Rooms */}
        <section aria-labelledby="rooms-h" className={styles.rooms}>
          <div className={styles.roomsInner}>
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.eyebrow}>ROOMS &amp; SUITES</p>
                <h2 id="rooms-h" className={styles.h2}>
                  Every room faces the sea.
                </h2>
              </div>
              <Link href="/rooms" className={`desktop-only ${styles.textLink}`}>
                COMPARE ALL ROOMS
                <ArrowIcon size={16} />
              </Link>
            </div>

            <div className={`desktop-only ${styles.roomGrid}`}>
              {rooms.map((room) => (
                <article key={room.slug} className={styles.roomCard}>
                  <div className={`ph ${styles.roomPhoto}`}>
                    <span className={styles.roomTag}>{room.tag}</span>
                    <span className={styles.photoRef}>PHOTO · {room.photo_ref}</span>
                  </div>
                  <div className={styles.roomBody}>
                    <h3 className={styles.roomName}>{room.name}</h3>
                    <div className={styles.roomMeta}>
                      <span>
                        <BedIcon size={17} />
                        {room.bed}
                      </span>
                      <span>
                        <SizeIcon size={17} />
                        {room.size_sqft ?? "[SIZE]"} sq ft
                      </span>
                      <span>
                        <GuestIcon size={17} />
                        Sleeps {room.sleeps}
                      </span>
                    </div>
                    <p className={styles.roomBlurb}>{room.blurb}</p>
                    <div className={styles.roomFoot}>
                      <div className={styles.priceBlock}>
                        <span className={styles.from}>FROM</span>
                        <span className={styles.price}>
                          {formatTaka(room.price_bdt)}
                          <span className={styles.perNight}> / night</span>
                        </span>
                      </div>
                      <Link href={`/rooms/${room.slug}`} className={styles.outlineBtn}>
                        VIEW ROOM
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="mobile-only">
            <RoomCarousel rooms={rooms} />
          </div>
        </section>

        {/* Amenities */}
        <section id="amenities" aria-labelledby="amen-h" className={styles.amenities}>
          <div>
            <p className={styles.eyebrow}>WITH EVERY STAY</p>
            <h2 id="amen-h" className={`${styles.h2} ${styles.amenTitle}`}>
              Nothing to add at checkout.
            </h2>
            <p className={`desktop-only ${styles.amenLead}`}>
              Breakfast, parking, Wi-Fi and the pool are part of the room rate. Airport pickup and drop-off can
              be arranged for an extra charge.
            </p>
          </div>
          <ul className={`desktop-only ${styles.amenGrid}`}>
            {HOME_AMENITIES.map((a) => (
              <li key={a.name} className={styles.amenItem}>
                <span className={styles.amenIcon}>
                  <PathIcon d={a.icon} size={22} />
                </span>
                <span className={styles.amenText}>
                  <span className={styles.amenName}>{a.name}</span>
                  <span className={styles.amenNote}>{a.note}</span>
                </span>
              </li>
            ))}
          </ul>
          <ul className={`mobile-only ${styles.amenGridMobile}`}>
            {HOME_AMENITIES_MOBILE.map((a) => (
              <li key={a.name} className={styles.amenItem}>
                <PathIcon d={a.icon} size={22} stroke="#0F3B2E" />
                <span className={styles.amenText}>
                  <span className={styles.amenName}>{a.name}</span>
                  <span className={styles.amenNote}>{a.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Dining & events */}
        <section aria-label="Dining and events" className={styles.dark}>
          <div className={styles.darkInner}>
            <article id="dining" className={styles.feature}>
              <div className={`ph ${styles.featurePhoto}`}>
                <span className={styles.photoRef}>
                  PHOTO · RESTAURANT<span className="desktop-only"> &amp; CAFÉ</span>
                </span>
              </div>
              <div className={styles.featureText}>
                <p className={styles.eyebrowGold}>DINING</p>
                <h2 className={styles.featureTitle}>Seafood from these shores, breakfast on us.</h2>
                <p className={`desktop-only ${styles.featureLead}`}>
                  The on-site restaurant and café serves Bangladeshi and international dishes, with fish from
                  Cox&apos;s Bazar&apos;s own catch. The lounge stays open for evening coffee.
                </p>
                <p className={`mobile-only ${styles.featureLead}`}>
                  Bangladeshi and international dishes, fish from the local catch, and a lounge for evening
                  coffee.
                </p>
                <a href="#dining" className={styles.lightLink}>
                  SEE DINING
                  <ArrowIcon size={16} />
                </a>
              </div>
            </article>
            <article id="events" className={`desktop-only ${styles.feature} ${styles.featureOffset}`}>
              <div className={`ph ${styles.featurePhoto}`}>
                <span className={styles.photoRef}>PHOTO · BANQUET HALL</span>
              </div>
              <div className={styles.featureText}>
                <p className={styles.eyebrowGold}>MEETINGS &amp; EVENTS</p>
                <h2 className={styles.featureTitle}>From board meetings to wedding receptions.</h2>
                <p className={styles.featureLead}>
                  A conference room with high-speed Wi-Fi and a banquet hall with full catering. Our events team
                  handles setup, décor and menus.
                </p>
                <a href={RESERVATIONS.href} className={styles.lightLink}>
                  ENQUIRE ABOUT AN EVENT
                  <ArrowIcon size={16} />
                </a>
              </div>
            </article>
          </div>
        </section>

        {/* Location */}
        <section id="location" aria-labelledby="loc-h" className={styles.location}>
          <div>
            <p className={styles.eyebrow}>FIND US</p>
            <h2 id="loc-h" className={`${styles.h2} ${styles.locTitle}`}>
              In the heart of Kolatoli.
            </h2>
            <dl className={`desktop-only ${styles.details}`}>
              <div className={styles.detailRow}>
                <dt>ADDRESS</dt>
                <dd>{HOTEL.address}</dd>
              </div>
              <div className={styles.detailRow}>
                <dt>CALL</dt>
                <dd className={styles.stack}>
                  {HOTEL.phones.map((p) => (
                    <a key={p.href} href={p.href}>
                      {p.display}
                    </a>
                  ))}
                </dd>
              </div>
              <div className={styles.detailRow}>
                <dt>EMAIL</dt>
                <dd>
                  <a href={`mailto:${HOTEL.email}`}>{HOTEL.email}</a>
                </dd>
              </div>
              <div className={styles.detailRow}>
                <dt>ARRIVING</dt>
                <dd>Airport pickup and drop-off on request, extra charge applies.</dd>
              </div>
            </dl>
            <div className="mobile-only">
              <p className={styles.locAddress}>{HOTEL.address}</p>
              <div className={styles.locButtons}>
                <a href={RESERVATIONS.href} className={styles.locBtn}>
                  CALL
                </a>
                <a href={HOTEL.directionsUrl} target="_blank" rel="noopener noreferrer" className={styles.locBtn}>
                  DIRECTIONS
                </a>
              </div>
            </div>
          </div>
          <div className={`desktop-only ph-l ${styles.map}`}>
            <span className={styles.mapLabel}>GOOGLE MAP EMBED</span>
            <a href={HOTEL.directionsUrl} target="_blank" rel="noopener noreferrer" className={styles.mapPin}>
              <span className={styles.mapPinIcon}>
                <PinIcon size={26} strokeWidth={1.5} />
              </span>
              <span className={styles.mapPinLabel}>Blossom Square</span>
            </a>
          </div>
        </section>

        {/* Closing call to action */}
        <section aria-label="Book" className={`desktop-only ${styles.cta}`}>
          <div className={styles.ctaInner}>
            <h2 className={styles.ctaTitle}>
              Your balcony over the Bay of Bengal is <em>waiting.</em>
            </h2>
            <div className={styles.ctaButtons}>
              <Link href="/booking" className={styles.solidBtn}>
                BOOK YOUR STAY
              </Link>
              <a href={RESERVATIONS.href} className={styles.ctaOutline}>
                CALL TO BOOK
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />

      {/* Mobile: sticky booking bar, plus room under the footer so it never covers it */}
      <div className={styles.stickySpacer} aria-hidden="true" />
      <div className={`mobile-only ${styles.stickyBar}`}>
        <div className={styles.priceBlock}>
          <span className={styles.stickyFrom}>FROM</span>
          <span className={styles.stickyPrice}>
            {formatTaka(fromPrice)}
            <span className={styles.stickyPer}> / night</span>
          </span>
        </div>
        <Link href="/booking" className={styles.stickyBtn}>
          BOOK NOW
        </Link>
      </div>
    </>
  );
}

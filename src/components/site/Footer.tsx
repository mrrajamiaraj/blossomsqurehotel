import Image from "next/image";
import Link from "next/link";
import { HOTEL, NAV_LINKS, directionsUrl } from "@/lib/hotel";
import { getSettings } from "@/lib/rooms";
import { ArrowRight, ArrowUpRight, Monogram } from "../icons";
import BackToTop from "./BackToTop";
import styles from "./Footer.module.css";

export default async function Footer() {
  const settings = await getSettings();
  return (
    <footer className={`${styles.footer} on-dark`}>
      <div className={`wrap ${styles.top}`}>
        <div className={styles.lead}>
        <div className={styles.invite}>
          <p className="caps eyebrow" data-reveal="up">
            Reservations
          </p>
          <p className={`h2 ${styles.inviteLine}`} data-reveal="up" style={{ "--d": "100ms" } as React.CSSProperties}>
            The sea is <em>a short walk</em> from your door.
          </p>
          <Link href="/booking" className="btn btn--light" data-reveal="up" style={{ "--d": "200ms" } as React.CSSProperties}>
            Reserve your stay
            <ArrowRight />
          </Link>
        </div>
        <Image
          src="/brand/crest.png"
          alt="Blossom Square Hotel & Suites — Experience the bloom of luxury"
          width={220}
          height={220}
          className={styles.crest}
          data-reveal="fade"
        />
        </div>

        <div className={styles.cols}>
          <div className={styles.col}>
            <p className={styles.heading}>Visit</p>
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className={styles.address}>
              {HOTEL.address}
              <ArrowUpRight />
            </a>
            <p className={styles.muted}>
              Check-in from {HOTEL.checkIn}
              <br />
              Check-out until {HOTEL.checkOut}
            </p>
          </div>
          <div className={styles.col}>
            <p className={styles.heading}>Speak to us</p>
            {HOTEL.phones.map((p) => (
              <a key={p.href} href={p.href} className={styles.link}>
                {p.display}
              </a>
            ))}
            <a href={`mailto:${HOTEL.email}`} className={styles.link}>
              {HOTEL.email}
            </a>
          </div>
          <nav className={styles.col} aria-label="Footer">
            <p className={styles.heading}>Explore</p>
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={styles.link}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className={styles.col}>
            <p className={styles.heading}>Follow</p>
            {HOTEL.social.map((s) => (
              <a key={s.label} href={s.href} className={styles.link}>
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className={`wrap ${styles.mark}`} aria-hidden="true">
        <span className={styles.wordmark}>Blossom Square</span>
      </div>

      <div className={`wrap ${styles.bottom}`}>
        <span className={styles.legal}>
          <Monogram size={22} className={styles.mono} />© {new Date().getFullYear()} {HOTEL.fullName}
        </span>
        <span className={styles.legal}>No pets · Cancellation: {settings.cancellation_policy}</span>
        <BackToTop className={styles.backTop} />
      </div>
    </footer>
  );
}

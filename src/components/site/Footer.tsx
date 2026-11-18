import Image from "next/image";
import Link from "next/link";
import { getHotelInfo, getSection } from "@/lib/cms/content";
import { NAV_LINKS, PAYMENT_METHODS, SERVICE_LINKS } from "@/lib/hotel";
import { getSettings } from "@/lib/rooms";
import Accent from "../cms/Accent";
import { ArrowRight, ArrowUpRight, Monogram } from "../icons";
import BackToTop from "./BackToTop";
import styles from "./Footer.module.css";

export default async function Footer() {
  const [settings, HOTEL, f] = await Promise.all([getSettings(), getHotelInfo(), getSection("footer")]);
  const WHATSAPP = HOTEL.whatsapp;
  const directionsUrl = HOTEL.mapUrl;
  return (
    <footer className={`${styles.footer} on-dark`}>
      <div className={`wrap ${styles.top}`}>
        <div className={styles.lead}>
        <div className={styles.invite}>
          {f.invite_eyebrow && (
            <p className="caps eyebrow" data-reveal="up">
              {f.invite_eyebrow}
            </p>
          )}
          <p className={`h2 ${styles.inviteLine}`} data-reveal="up" style={{ "--d": "100ms" } as React.CSSProperties}>
            <Accent text={f.invite_line} />
          </p>
          <Link href="/booking" className="btn btn--light" data-reveal="up" style={{ "--d": "200ms" } as React.CSSProperties}>
            {f.button || "Reserve your stay"}
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
            <a href={WHATSAPP.href} target="_blank" rel="noopener noreferrer" className={styles.link}>
              WhatsApp {WHATSAPP.display}
            </a>
            <a href={`mailto:${HOTEL.email}`} className={styles.link}>
              {HOTEL.email}
            </a>
            <p className={styles.muted}>
              We accept {PAYMENT_METHODS.map((m) => ({ bkash: "bKash", nagad: "Nagad", bank: "bank transfer" })[m.id]).join(", ")} and cash at the hotel.
            </p>
          </div>
          <nav className={styles.col} aria-label="Footer">
            <p className={styles.heading}>Explore</p>
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={styles.link}>
                {l.label}
              </Link>
            ))}
          </nav>
          <nav className={styles.col} aria-label="Guest services">
            <p className={styles.heading}>Guest services</p>
            {SERVICE_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={styles.link}>
                {l.label}
              </Link>
            ))}
            <p className={`${styles.heading} ${styles.headingGap}`}>Follow</p>
            {HOTEL.social.map((s) => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className={styles.link}>
                {s.label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <div className={`wrap ${styles.mark}`} aria-hidden="true">
        <span className={styles.wordmark}>Blossom Square</span>
      </div>

      <div className={`wrap ${styles.bottom}`}>
        <span className={styles.legal}>
          <Monogram size={22} className={styles.mono} />© {new Date().getFullYear()} {HOTEL.fullName}
        </span>
        <span className={styles.legal}>
          {[f.legal_note, settings.cancellation_policy ? `Cancellation: ${settings.cancellation_policy}` : ""].filter(Boolean).join(" · ")}
        </span>
        <Link href="/admin/login" className={styles.staff} prefetch={false}>
          Staff login
        </Link>
        <BackToTop className={styles.backTop} />
      </div>
    </footer>
  );
}

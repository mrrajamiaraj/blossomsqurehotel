import Link from "next/link";
import { HOTEL, NAV_LINKS, RESERVATIONS } from "@/lib/hotel";
import { PhoneIcon, PinIcon } from "./icons";
import MobileMenu from "./MobileMenu";
import styles from "./SiteHeader.module.css";

type Props = {
  /** On phones, float a transparent header over the page's hero photo. */
  overlayOnMobile?: boolean;
};

export default function SiteHeader({ overlayOnMobile = false }: Props) {
  return (
    <>
      <div className={styles.topBar}>
        <div className={styles.topBarInner}>
          <div className={styles.topBarItem}>
            <PinIcon size={15} />
            <span>{HOTEL.address}</span>
          </div>
          <div className={styles.topBarRight}>
            <span className="desktop-only">
              Check-in {HOTEL.checkIn} · Check-out {HOTEL.checkOut}
            </span>
            <a href={RESERVATIONS.href} className={styles.topBarPhone}>
              <PhoneIcon size={15} />
              Reservations {RESERVATIONS.display}
            </a>
          </div>
        </div>
      </div>

      <header className={`${styles.header} ${overlayOnMobile ? styles.overlay : ""}`}>
        <div className={styles.inner}>
          <Link href="/" className={styles.logo}>
            <span className={styles.logoName}>{HOTEL.name}</span>
            <span className={styles.logoSub}>
              HOTEL &amp; SUITES<span className={styles.logoCity}> · COX&apos;S BAZAR</span>
            </span>
          </Link>

          <nav aria-label="Main" className={styles.nav}>
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={styles.navLink}>
                {l.label}
              </Link>
            ))}
          </nav>

          <div className={styles.actions}>
            <Link href="/booking" className={styles.bookBtn}>
              BOOK A STAY
            </Link>
            <a href={RESERVATIONS.href} aria-label="Call reservations" className={styles.callBtn}>
              <PhoneIcon size={20} />
            </a>
            <MobileMenu buttonClassName={styles.menuBtn} />
          </div>
        </div>
      </header>
    </>
  );
}

import Link from "next/link";
import { HOTEL } from "@/lib/hotel";
import styles from "./SiteFooter.module.css";

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.grid}>
        <div className={styles.brand}>
          <span className={styles.brandName}>{HOTEL.name}</span>
          <span className={styles.brandSub}>HOTEL &amp; SUITES · COX&apos;S BAZAR</span>
        </div>
        <nav aria-label="Stay" className={styles.col}>
          <span className={styles.heading}>STAY</span>
          <Link href="/rooms">Rooms &amp; Suites</Link>
          <Link href="/#dining">Dining</Link>
          <Link href="/#events">Meetings &amp; Events</Link>
        </nav>
        <div className={styles.col}>
          <span className={styles.heading}>POLICIES</span>
          <span>Check-in from {HOTEL.checkIn}</span>
          <span>Check-out until {HOTEL.checkOut}</span>
          <span>No pets</span>
          <span>Cancellation: {HOTEL.cancellationPolicy}</span>
        </div>
        <div className={styles.col}>
          <span className={styles.heading}>FOLLOW</span>
          {HOTEL.social.map((s) => (
            <a key={s.label} href={s.href}>
              {s.label}
            </a>
          ))}
        </div>
      </div>
      <div className={styles.bottom}>
        <span>© {new Date().getFullYear()} {HOTEL.fullName}</span>
        <span>{HOTEL.shortAddress}</span>
      </div>
    </footer>
  );
}

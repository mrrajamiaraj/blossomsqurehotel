import Link from "next/link";
import { Lock, Monogram, Phone } from "@/components/icons";
import SmoothScroll from "@/components/motion/SmoothScroll";
import ThemeToggle from "@/components/site/ThemeToggle";
import { HOTEL, RESERVATIONS } from "@/lib/hotel";
import styles from "./booking.module.css";

/** Checkout keeps its own quiet chrome: no menu, nothing to wander off to. */
export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className={styles.header}>
        <div className={`wrap ${styles.headerInner}`}>
          <Link href="/" className={styles.logo} aria-label="Blossom Square, home">
            <Monogram size={28} className={styles.mark} />
            <span className={styles.logoText}>
              <span className={styles.logoName}>{HOTEL.name}</span>
              <span className={styles.logoSub}>Hotel &amp; Suites</span>
            </span>
          </Link>
          <div className={styles.meta}>
            <ThemeToggle />
            <span className={styles.secure}>
              <Lock /> Secure booking
            </span>
            <a href={RESERVATIONS.href} className={styles.help}>
              <Phone size={16} />
              <span>Help {RESERVATIONS.display}</span>
            </a>
          </div>
        </div>
      </header>
      <main id="main" className={styles.main}>
        {children}
      </main>
      <SmoothScroll />
      <footer className={styles.footer}>
        <div className={`wrap ${styles.footerInner}`}>
          <span>© {new Date().getFullYear()} {HOTEL.fullName}</span>
          <span>{HOTEL.shortAddress}</span>
        </div>
      </footer>
    </>
  );
}

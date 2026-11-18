import Link from "next/link";
import { HotelInfoProvider } from "@/components/cms/HotelInfo";
import { Lock, Monogram, Phone } from "@/components/icons";
import SmoothScroll from "@/components/motion/SmoothScroll";
import ThemeToggle from "@/components/site/ThemeToggle";
import { getHotelInfo } from "@/lib/cms/content";
import styles from "./booking.module.css";

/** Checkout keeps its own quiet chrome: no menu, nothing to wander off to. */
export default async function BookingLayout({ children }: { children: React.ReactNode }) {
  const hotel = await getHotelInfo();
  const phone = hotel.phones[0];
  return (
    <HotelInfoProvider value={hotel}>
      <header className={styles.header}>
        <div className={`wrap ${styles.headerInner}`}>
          <Link href="/" className={styles.logo} aria-label="Blossom Square, home">
            <Monogram size={28} className={styles.mark} />
            <span className={styles.logoText}>
              <span className={styles.logoName}>{hotel.name}</span>
              <span className={styles.logoSub}>Hotel &amp; Suites</span>
            </span>
          </Link>
          <div className={styles.meta}>
            <ThemeToggle />
            <span className={styles.secure}>
              <Lock /> Secure booking
            </span>
            {phone && (
              <a href={phone.href} className={styles.help}>
                <Phone size={16} />
                <span>Help {phone.display}</span>
              </a>
            )}
          </div>
        </div>
      </header>
      <main id="main" className={styles.main}>
        {children}
      </main>
      <SmoothScroll />
      <footer className={styles.footer}>
        <div className={`wrap ${styles.footerInner}`}>
          <span>
            © {new Date().getFullYear()} {hotel.fullName}
          </span>
          <nav aria-label="Booking help" className={styles.footLinks}>
            <Link href="/booking/lookup">Find my booking</Link>
            <Link href="/faq">Questions</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </div>
      </footer>
    </HotelInfoProvider>
  );
}

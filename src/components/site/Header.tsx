"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { RESERVATIONS } from "@/lib/hotel";
import type { Photo } from "@/lib/photos";
import { Monogram, Phone } from "../icons";
import MenuOverlay from "./MenuOverlay";
import ThemeToggle from "./ThemeToggle";
import styles from "./Header.module.css";

/** Pages that open on a full-bleed dark image get a transparent header. */
const OVER_IMAGE = new Set(["/"]);

export default function Header({ menuPhotos }: { menuPhotos: Photo[] }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > 40);
      // Hide while reading downwards, return on any upward scroll.
      if (Math.abs(y - lastY) > 6) setHidden(y > lastY && y > 420);
      lastY = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  // Lets sticky bars elsewhere sit under the header only while it's showing.
  useEffect(() => {
    document.documentElement.dataset.header = hidden && !menuOpen ? "hidden" : "shown";
  }, [hidden, menuOpen]);

  const overImage = OVER_IMAGE.has(pathname) && !scrolled;
  const cls = [
    styles.header,
    overImage ? styles.clear : styles.solid,
    hidden && !menuOpen ? styles.hidden : "",
    menuOpen ? styles.menuOpen : "",
  ].join(" ");

  return (
    <>
      <header className={cls}>
        <div className={styles.inner}>
          <div className={styles.left}>
            <button
              type="button"
              className={styles.menuBtn}
              aria-expanded={menuOpen}
              aria-controls="site-menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span className={styles.burger} aria-hidden="true">
                <span />
                <span />
              </span>
              <span className={styles.menuLabel}>{menuOpen ? "Close" : "Menu"}</span>
            </button>
            <nav aria-label="Primary" className={styles.quick}>
              <Link href="/rooms" className={`${styles.quickLink} ${pathname.startsWith("/rooms") ? styles.current : ""}`}>
                Rooms &amp; Suites
              </Link>
              <Link href="/#dining" className={styles.quickLink}>
                Dining
              </Link>
            </nav>
          </div>

          <Link href="/" className={styles.logo} aria-label="Blossom Square, home">
            <Monogram size={30} className={styles.logoMark} />
            <span className={styles.logoText}>
              <span className={styles.logoName}>Blossom Square</span>
              <span className={styles.logoSub}>Hotel &amp; Suites</span>
            </span>
          </Link>

          <div className={styles.right}>
            <ThemeToggle />
            <a href={RESERVATIONS.href} className={styles.call}>
              <Phone size={16} />
              <span className={styles.callText}>{RESERVATIONS.display}</span>
            </a>
            <Link href="/booking" className={`btn btn--sm ${styles.book}`}>
              <span>
                Book<span className={styles.bookMore}> a stay</span>
              </span>
            </Link>
          </div>
        </div>
      </header>
      <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} photos={menuPhotos} />
    </>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useHotelInfo } from "@/components/cms/HotelInfo";
import { NAV_LINKS, SERVICE_LINKS } from "@/lib/hotel";
import type { Photo } from "@/lib/photos";
import { ArrowRight, ArrowUpRight, Close, Monogram, Phone } from "../icons";
import { lockScroll } from "../motion/SmoothScroll";
import styles from "./MenuOverlay.module.css";

type Props = { open: boolean; onClose: () => void; photos: Photo[] };

/**
 * Site menu: a drawer from the left (where the Menu button lives), with the
 * page still visible behind a scrim. Esc, the scrim and the close button all
 * close it; focus stays inside while open and returns to the trigger after.
 */
export default function MenuOverlay({ open, onClose, photos }: Props) {
  const HOTEL = useHotelInfo();
  const RESERVATIONS = HOTEL.phones[0] ?? { href: "/contact", display: "the front desk" };
  const WHATSAPP = HOTEL.whatsapp;
  const directionsUrl = HOTEL.mapUrl;
  const pathname = usePathname();
  const [hovered, setHovered] = useState(0);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    lockScroll(true);
    const t = window.setTimeout(() => panel?.querySelector<HTMLElement>("nav a")?.focus({ preventScroll: true }), 120);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>("a, button")];
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
      e.preventDefault();
      items[next]?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      lockScroll(false);
      trigger?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  // Swipe left to close (touch). The panel follows the finger, then either
  // completes the close or springs back. Vertical scrolling is left alone.
  const drag = useRef<{ x: number; y: number; dx: number; horizontal: boolean | null } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, horizontal: null };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    const panel = panelRef.current;
    if (!d || !panel) return;
    const dx = e.touches[0].clientX - d.x;
    const dy = e.touches[0].clientY - d.y;
    if (d.horizontal === null && Math.abs(dx) + Math.abs(dy) > 8) d.horizontal = Math.abs(dx) > Math.abs(dy);
    if (!d.horizontal) return;
    d.dx = Math.min(0, dx);
    panel.style.transition = "none";
    panel.style.transform = `translateX(${d.dx}px)`;
  };
  const onTouchEnd = () => {
    const d = drag.current;
    const panel = panelRef.current;
    drag.current = null;
    if (!d || !panel || !d.horizontal) return;
    panel.style.transition = "";
    panel.style.transform = "";
    if (d.dx < -Math.min(110, panel.offsetWidth * 0.28)) onClose();
  };

  const isCurrent = (href: string) => (href.includes("#") ? false : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className={`${styles.root} ${open ? styles.open : ""}`} aria-hidden={!open} inert={!open}>
      <div className={styles.scrim} onClick={onClose} />

      <aside
        ref={panelRef}
        id="site-menu"
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        data-lenis-prevent
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className={styles.head}>
          <Link href="/" className={styles.brand} onClick={onClose}>
            <Monogram size={22} className={styles.mark} />
            Blossom Square
          </Link>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close menu">
            <Close size={18} />
          </button>
        </div>

        <div className={styles.preview} aria-hidden="true">
          {photos.map((p, i) => (
            <div key={p.ref + i} className={`${styles.frame} ${i === hovered ? styles.frameOn : ""}`}>
              {p.src ? <Image src={p.src} alt="" fill sizes="440px" /> : <div className="photo-plate" data-tone={p.tone} />}
            </div>
          ))}
          <span key={hovered} className={styles.caption}>
            {NAV_LINKS[hovered]?.note}
          </span>
        </div>

        <nav aria-label="Site" className={styles.nav}>
          <ol role="list" className={styles.list}>
            {NAV_LINKS.map((link, i) => {
              const current = isCurrent(link.href);
              return (
                <li key={link.href} style={{ "--i": i } as React.CSSProperties}>
                  <Link
                    href={link.href}
                    className={`${styles.link} ${current ? styles.current : ""}`}
                    aria-current={current ? "page" : undefined}
                    onClick={onClose}
                    onMouseEnter={() => setHovered(i)}
                    onFocus={() => setHovered(i)}
                  >
                    <span className={styles.idx}>{String(i + 1).padStart(2, "0")}</span>
                    <span className={styles.text}>
                      <span className={styles.label}>{link.label}</span>
                      <span className={styles.note}>{link.note}</span>
                    </span>
                    <ArrowRight className={styles.go} />
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className={styles.actions}>
          <Link href="/booking" className="btn btn--block" onClick={onClose}>
            Reserve your stay
          </Link>
          <div className={styles.contactRow}>
            <a href={RESERVATIONS.href} className={styles.call}>
              <Phone size={16} />
              <span>
                Call <strong>{RESERVATIONS.display}</strong>
              </span>
            </a>
            <a href={WHATSAPP.href} target="_blank" rel="noopener noreferrer" className={styles.call}>
              <ArrowUpRight size={16} />
              <span>
                <strong>WhatsApp</strong>
              </span>
            </a>
          </div>
        </div>

        <nav aria-label="Guest services" className={styles.services}>
          {SERVICE_LINKS.slice(1, 3).map((l) => (
            <Link key={l.href} href={l.href} onClick={onClose} aria-current={isCurrent(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className={styles.foot}>
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className={styles.address}>
            <span>{HOTEL.address}</span>
            <ArrowUpRight size={14} />
          </a>
          <div className={styles.meta}>
            <a href={`mailto:${HOTEL.email}`}>{HOTEL.email}</a>
            <span>
              Check-in {HOTEL.checkIn} · Check-out {HOTEL.checkOut}
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}

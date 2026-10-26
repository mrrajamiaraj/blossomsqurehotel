"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HOTEL, NAV_LINKS, directionsUrl } from "@/lib/hotel";
import type { Photo } from "@/lib/photos";
import { ArrowUpRight } from "../icons";
import { lockScroll } from "../motion/SmoothScroll";
import styles from "./MenuOverlay.module.css";

const NUMERALS = ["i", "ii", "iii", "iv", "v", "vi"];

type Props = { open: boolean; onClose: () => void; photos: Photo[] };

export default function MenuOverlay({ open, onClose, photos }: Props) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    lockScroll(true);
    const panel = ref.current;
    const first = panel?.querySelector<HTMLElement>("a");
    window.setTimeout(() => first?.focus({ preventScroll: true }), 350);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel) return;
      // Keep tabbing inside the menu (and the header's close button).
      const focusables = [
        ...document.querySelectorAll<HTMLElement>("header button[aria-controls='site-menu']"),
        ...panel.querySelectorAll<HTMLElement>("a, button"),
      ];
      const i = focusables.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? focusables.length - 1 : i - 1) : (i + 1) % focusables.length;
      e.preventDefault();
      focusables[next]?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      lockScroll(false);
    };
  }, [open, onClose]);

  return (
    <div
      ref={ref}
      id="site-menu"
      className={`${styles.overlay} ${open ? styles.open : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      aria-hidden={!open}
      inert={!open}
    >
      <div className={styles.inner}>
        <nav aria-label="Site" className={styles.nav}>
          <ol role="list" className={styles.list}>
            {NAV_LINKS.map((link, i) => (
              <li key={link.href} style={{ "--i": i } as React.CSSProperties}>
                <Link
                  href={link.href}
                  className={styles.link}
                  onClick={onClose}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                >
                  <span className={styles.num}>{NUMERALS[i]}.</span>
                  <span className={styles.label}>{link.label}</span>
                  <span className={styles.note}>{link.note}</span>
                </Link>
              </li>
            ))}
          </ol>
          <Link href="/booking" className={`btn btn--light ${styles.cta}`} onClick={onClose}>
            Reserve your stay
          </Link>
        </nav>

        <aside className={styles.aside}>
          <div className={styles.frames}>
            {photos.map((p, i) => (
              <div key={p.ref + i} className={`${styles.frame} ${i === active ? styles.frameOn : ""}`}>
                {p.src ? (
                  <Image src={p.src} alt="" fill sizes="(max-width: 960px) 0px, 38vw" />
                ) : (
                  <div className="photo-plate" data-tone={p.tone} />
                )}
              </div>
            ))}
          </div>
          <dl className={styles.contact}>
            <div>
              <dt>Reservations</dt>
              <dd>
                {HOTEL.phones.map((p) => (
                  <a key={p.href} href={p.href} className="text-link">
                    {p.display}
                  </a>
                ))}
              </dd>
            </div>
            <div>
              <dt>Write to us</dt>
              <dd>
                <a href={`mailto:${HOTEL.email}`} className="text-link">
                  {HOTEL.email}
                </a>
              </dd>
            </div>
            <div>
              <dt>Visit</dt>
              <dd>
                <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className={styles.directions}>
                  {HOTEL.address}
                  <ArrowUpRight />
                </a>
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

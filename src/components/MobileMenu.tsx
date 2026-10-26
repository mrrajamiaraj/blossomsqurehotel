"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NAV_LINKS, RESERVATIONS } from "@/lib/hotel";
import { CloseIcon, MenuIcon } from "./icons";
import styles from "./MobileMenu.module.css";

export default function MobileMenu({ buttonClassName }: { buttonClassName: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        className={buttonClassName}
        onClick={() => setOpen(true)}
      >
        <MenuIcon size={22} />
      </button>

      {open && (
        <div id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" className={styles.panel}>
          <div className={styles.top}>
            <span className={styles.label}>MENU</span>
            <button type="button" aria-label="Close menu" className={styles.close} onClick={close}>
              <CloseIcon size={22} />
            </button>
          </div>
          <nav aria-label="Mobile" className={styles.nav}>
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={styles.link} onClick={close}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className={styles.actions}>
            <Link href="/booking" className={styles.primary} onClick={close}>
              BOOK A STAY
            </Link>
            <a href={RESERVATIONS.href} className={styles.secondary}>
              CALL {RESERVATIONS.display}
            </a>
          </div>
        </div>
      )}
    </>
  );
}

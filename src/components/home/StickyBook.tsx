"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatTaka } from "@/lib/format";
import styles from "./StickyBook.module.css";

/** Phones: a booking bar that rises once the hero is passed, and steps aside at the footer. */
export default function StickyBook({ fromPrice }: { fromPrice: number }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const footer = document.querySelector("footer");
      const nearFooter = footer ? footer.getBoundingClientRect().top < window.innerHeight : false;
      setShown(window.scrollY > window.innerHeight * 0.8 && !nearFooter);
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

  return (
    <div className={`${styles.bar} ${shown ? styles.shown : ""}`} aria-hidden={!shown} inert={!shown}>
      <div className={styles.price}>
        <span className={styles.from}>Rooms from</span>
        <span className={styles.amount}>
          {formatTaka(fromPrice)} <span>/ night</span>
        </span>
      </div>
      <Link href="/booking" className="btn btn--sm">
        Book now
      </Link>
    </div>
  );
}

"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "./Intro.module.css";

/**
 * A short curtain on the first page of a visit, carrying the hotel's crest.
 * Whether it shows is decided before paint by the inline script in the root
 * layout (html.intro).
 */
export default function Intro() {
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");

  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("intro")) {
      setPhase("gone");
      return;
    }
    const lift = window.setTimeout(() => {
      setPhase("out");
      window.dispatchEvent(new Event("bsq:intro-done"));
    }, 1900);
    const done = window.setTimeout(() => {
      setPhase("gone");
      root.classList.remove("intro");
      try {
        sessionStorage.setItem("bsq-intro", "1");
      } catch {}
    }, 3000);
    return () => {
      window.clearTimeout(lift);
      window.clearTimeout(done);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div className={`${styles.curtain} ${phase === "out" ? styles.out : ""}`} aria-hidden="true">
      <div className={styles.inner}>
        <Image src="/brand/crest.png" alt="" width={260} height={260} priority className={styles.crest} />
      </div>
    </div>
  );
}

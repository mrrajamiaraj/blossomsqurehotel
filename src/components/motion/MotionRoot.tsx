"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SELECTOR = "[data-reveal]:not([data-in])";

/**
 * Sets data-in on [data-reveal] elements as they scroll into view. An
 * attribute rather than a class, so React re-rendering className never
 * undoes it. Watches the DOM so content that appears later animates too.
 */
export default function MotionRoot() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const reveal = (el: Element) => el.setAttribute("data-in", "");

    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(SELECTOR).forEach(reveal);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target);
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    const watch = () => document.querySelectorAll(SELECTOR).forEach((el) => io.observe(el));

    let mo: MutationObserver | null = null;
    let timer = 0;
    const start = () => {
      watch();
      mo = new MutationObserver(watch);
      mo.observe(document.body, { childList: true, subtree: true });
    };
    // This effect can run before the page segment below it has hydrated;
    // marking those elements now would make React report a mismatch. A short
    // pause lets hydration finish (imperceptible next to the reveal itself).
    const startSoon = () => {
      timer = window.setTimeout(start, 60);
    };

    // Hold the first reveals until the intro curtain has lifted.
    if (root.classList.contains("intro")) {
      window.addEventListener("bsq:intro-done", start, { once: true });
    } else {
      startSoon();
    }

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("bsq:intro-done", start);
      io.disconnect();
      mo?.disconnect();
    };
  }, [pathname]);

  return null;
}

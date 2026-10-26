"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}

/** Weighted wheel scrolling on desktop. Touch keeps native momentum. */
export default function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      lerp: 0.085,
      wheelMultiplier: 0.95,
      anchors: { offset: -72 },
      prevent: (node) => node.closest?.("[data-lenis-prevent]") != null,
    });
    window.__lenis = lenis;

    let frame = requestAnimationFrame(function raf(time) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    });

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      if (window.__lenis === lenis) delete window.__lenis;
    };
  }, []);

  // Land at the top of each new page (or on its #hash).
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const target = document.querySelector(hash);
      if (target) {
        window.__lenis?.scrollTo(target as HTMLElement, { offset: -72, immediate: true });
        return;
      }
    }
    window.__lenis?.scrollTo(0, { immediate: true });
  }, [pathname]);

  return null;
}

/** Pause page scrolling while an overlay is open. */
export function lockScroll(locked: boolean) {
  const lenis = window.__lenis;
  if (locked) {
    lenis?.stop();
    document.documentElement.style.overflow = "hidden";
  } else {
    lenis?.start();
    document.documentElement.style.overflow = "";
  }
}

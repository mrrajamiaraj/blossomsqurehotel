"use client";

import { useEffect, useId, useState } from "react";
import { flushSync } from "react-dom";
import styles from "./ThemeToggle.module.css";

type Theme = "light" | "dark";
const KEY = "bsq-theme";

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Day / night switch. The first visit follows the device setting; a click
 * remembers the choice. Where the browser supports view transitions, the
 * new theme spreads from the button in a circle.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);
  const maskId = `moon-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const root = document.documentElement;
    setTheme(root.dataset.theme === "dark" ? "dark" : "light");
    // Follow the device until the guest picks a theme themselves.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      if (stored()) return;
      const next: Theme = mq.matches ? "dark" : "light";
      root.dataset.theme = next;
      setTheme(next);
    };
    mq.addEventListener("change", onSystem);
    return () => mq.removeEventListener("change", onSystem);
  }, []);

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    const apply = () => {
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduce) {
      apply();
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(() => flushSync(apply));
    transition.ready
      .then(() =>
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 750, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" },
        ),
      )
      .catch(() => {});
  };

  const dark = theme === "dark";
  const label = dark ? "Switch to day theme" : "Switch to night theme";

  return (
    <button
      type="button"
      className={`${styles.toggle} ${dark ? styles.dark : ""} ${className}`}
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={dark}
      // Unknown until mounted; avoids announcing the wrong state during hydration.
      data-ready={theme !== null}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className={styles.icon}>
        <mask id={maskId}>
          <rect width="24" height="24" fill="#fff" />
          <circle className={styles.cut} cx="24" cy="2" r="7" fill="#000" />
        </mask>
        <circle className={styles.body} cx="12" cy="12" r="5" fill="currentColor" mask={`url(#${maskId})`} />
        <g className={styles.rays} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M12 1.5v2.2M12 20.3v2.2M1.5 12h2.2M20.3 12h2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
        </g>
      </svg>
    </button>
  );
}

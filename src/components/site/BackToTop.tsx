"use client";

import { ArrowUp } from "../icons";

export default function BackToTop({ className }: { className?: string }) {
  const toTop = () => {
    if (window.__lenis) window.__lenis.scrollTo(0, { duration: 1.6 });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <button type="button" className={className} onClick={toTop}>
      Back to top
      <ArrowUp size={16} />
    </button>
  );
}

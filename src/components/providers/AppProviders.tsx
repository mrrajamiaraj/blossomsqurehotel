"use client";

import { MotionConfig } from "motion/react";

/**
 * Global client providers, mounted once in the root layout.
 *
 * - MotionConfig: every Motion animation honours the visitor's
 *   "reduce motion" setting (the CSS reveal system already does).
 *
 * Add future app-wide providers here (e.g. a Realtime context for the front
 * desk belongs in the admin layout instead, so public pages stay light).
 */
export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.9 }}>
      {children}
    </MotionConfig>
  );
}

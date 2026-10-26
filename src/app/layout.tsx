import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const jost = Jost({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jost",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Blossom Square Hotel & Suites · Cox's Bazar",
    template: "%s — Blossom Square Hotel & Suites",
  },
  description:
    "Sea-view suites with private balconies in Kolatoli, Cox's Bazar, a short walk from the world's longest sea beach. Pool, 24-hour room service and breakfast included.",
};

export const viewport: Viewport = {
  themeColor: "#0F3B2E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${jost.variable}`}>
      <body>{children}</body>
    </html>
  );
}

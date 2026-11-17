import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import Script from "next/script";
import MotionRoot from "@/components/motion/MotionRoot";
import AppProviders from "@/components/providers/AppProviders";
import Toaster from "@/components/ui/Toaster";
import "./globals.css";

// Type system
// · Cormorant Garamond — guest-site headlines and the wordmark. Light weights
//   plus italic for the accent phrase. Only the weights used are loaded.
// · Inter — body, navigation, buttons, forms and the whole admin. Variable, so
//   one file per style covers every weight.
const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://blossomsquare.online"),
  title: {
    default: "Blossom Square Hotel & Suites · Cox's Bazar",
    template: "%s · Blossom Square, Cox's Bazar",
  },
  description:
    "Sea-view suites with private balconies in Kolatoli, Cox's Bazar, a short walk from the world's longest sea beach. Pool, 24-hour room service and breakfast included.",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a2a21",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs before paint: enables motion styles, applies the saved (or device)
// theme so there's no flash, and decides whether the first-visit curtain
// plays (home page only, once per session).
const BOOT = `(function(){var d=document.documentElement;d.classList.add('js');try{var t=localStorage.getItem('bsq-theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.dataset.theme=t}catch(e){d.dataset.theme='light'}try{if(location.pathname==='/'&&!sessionStorage.getItem('bsq-intro')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)d.classList.add('intro')}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${serif.variable}`}
      suppressHydrationWarning
    >
      {/* Browser extensions (e.g. Grammarly) add attributes to <body> before hydration. */}
      <body suppressHydrationWarning>
        <Script id="boot" strategy="beforeInteractive">
          {BOOT}
        </Script>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <AppProviders>{children}</AppProviders>
        <Toaster />
        <MotionRoot />
      </body>
    </html>
  );
}

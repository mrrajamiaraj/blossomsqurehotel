import Intro from "@/components/motion/Intro";
import SmoothScroll from "@/components/motion/SmoothScroll";
import Footer from "@/components/site/Footer";
import Header from "@/components/site/Header";
import { photo } from "@/lib/photos";

// One image per menu entry, shown as each link is hovered.
const MENU_PHOTOS = [
  photo("DSC5565", "Connecting King Suite", "forest"),
  photo("RESTAURANT", "Restaurant & café", "dusk"),
  photo("BANQUET", "Banquet hall", "forest"),
  photo("DSC5550", "Deluxe Couple room", "sea"),
  photo("DSC5562", "Upstairs corridor", "dusk"),
];

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Intro />
      <Header menuPhotos={MENU_PHOTOS} />
      <main id="main">{children}</main>
      <Footer />
      <SmoothScroll />
    </>
  );
}

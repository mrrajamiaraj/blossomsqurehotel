import Intro from "@/components/motion/Intro";
import SmoothScroll from "@/components/motion/SmoothScroll";
import Footer from "@/components/site/Footer";
import Header from "@/components/site/Header";
import { photo } from "@/lib/photos";

// One image per menu entry (NAV_LINKS order), shown as each link is hovered.
// Spaces not yet photographed fall back to the tonal plate, never stock imagery.
const MENU_PHOTOS = [
  photo("DSC5565", "Suite bedroom", "forest"),
  photo("RESTAURANT", "Restaurant & café", "dusk"),
  photo("POOL", "Swimming pool", "sea"),
  photo("BANQUET", "Banquet hall", "forest"),
  photo("DSC5551", "Couple's room at turn-down", "sand"),
  photo("DSC5575", "Premium Twin", "sea"),
  photo("DSC5562", "Upstairs corridor", "dusk"),
  photo("DSC5555", "Couple's room", "forest"),
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

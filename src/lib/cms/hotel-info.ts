// The hotel's contact details as the site uses them, built from the
// "Contact details" section (Admin → Website content). Shared by server and
// client code; client components read it from <HotelInfoProvider>.

import { sectionDef, type ContactContent } from "./sections";

export type HotelInfo = {
  name: string;
  fullName: string;
  address: string;
  shortAddress: string;
  checkIn: string;
  checkOut: string;
  phones: { display: string; href: string }[];
  email: string;
  mapQuery: string;
  mapUrl: string;
  social: { label: string; href: string }[];
  whatsapp: { display: string; href: string; qr: string | null };
  arriving: string;
};

const DEFAULT_WHATSAPP_DIGITS = "8801805006900";

/** "+880 1805-006900" → "+8801805006900". Local numbers (01…) get Bangladesh's +880. */
export function dialable(display: string): string {
  const digits = display.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("880")) return `+${digits}`;
  if (digits.startsWith("0")) return `+880${digits.slice(1)}`;
  return `+${digits}`;
}

export function toHotelInfo(c: ContactContent): HotelInfo {
  const wa = dialable(c.whatsapp).replace("+", "");
  return {
    name: c.full_name.replace(/\s+Hotel\s*&\s*Suites$/i, "") || c.full_name,
    fullName: c.full_name,
    address: c.address,
    shortAddress: c.short_address,
    checkIn: c.check_in,
    checkOut: c.check_out,
    phones: c.phones.filter((p) => p.display).map((p) => ({ display: p.display, href: `tel:${dialable(p.display)}` })),
    email: c.email,
    mapQuery: c.map_query || c.address,
    mapUrl: c.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.map_query || c.address)}`,
    social: c.social.filter((s) => s.label && s.href),
    // The printed QR code only matches the original number.
    whatsapp: { display: c.whatsapp, href: `https://wa.me/${wa}`, qr: wa === DEFAULT_WHATSAPP_DIGITS ? "/brand/whatsapp-qr.png" : null },
    arriving: c.arriving,
  };
}

export const DEFAULT_HOTEL_INFO: HotelInfo = toHotelInfo(sectionDef("contact")!.defaults as unknown as ContactContent);

export const mapEmbedUrlFor = (info: HotelInfo) => `https://www.google.com/maps?q=${encodeURIComponent(info.mapQuery)}&z=16&output=embed`;

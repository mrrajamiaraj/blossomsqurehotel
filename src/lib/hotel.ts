// Fixed hotel details shared across pages. Policies and tax rates are edited
// by managers in Admin → Settings (see getSettings in lib/rooms.ts).
export const HOTEL = {
  name: "Blossom Square",
  fullName: "Blossom Square Hotel & Suites",
  address: "House 85, Block A, Light House Road, PWD R/A (Hotel Motel Zone), Kolatoli, Cox's Bazar",
  shortAddress: "Light House Road, Kolatoli, Cox's Bazar",
  checkIn: "1:00 PM",
  checkOut: "11:00 AM",
  phones: [
    { display: "+880 1805-006900", href: "tel:+8801805006900" },
    { display: "+880 1805-006902", href: "tel:+8801805006902" },
  ],
  email: "blossomsquare0@gmail.com",
  mapQuery: "Blossom Square Hotel & Suites, Light House Road, Kolatoli Rd, Cox's Bazar 4700",
  // The hotel's own Google Maps listing.
  mapUrl: "https://maps.app.goo.gl/HMQz4T5vC9o5hy1A7",
  social: [
    { label: "Facebook", href: "https://www.facebook.com/share/1KuAPqa9NA/" },
    { label: "WhatsApp", href: "https://wa.me/8801805006900" },
  ],
} as const;

export const RESERVATIONS = HOTEL.phones[0];

export const WHATSAPP = { display: "+880 1805-006900", href: "https://wa.me/8801805006900", qr: "/brand/whatsapp-qr.png" };

/** Ways a guest can send an advance. Shown on the booking pages. */
export const PAYMENT_METHODS = [
  {
    id: "bkash",
    name: "bKash or any bank app",
    note: "Scan our Bangla QR at the desk, or pay this number from your app.",
    fields: [{ label: "Number", value: "01805-006900", copy: "01805006900" }],
  },
  {
    id: "nagad",
    name: "Nagad",
    note: "Pay to our Nagad merchant number.",
    fields: [{ label: "Number", value: "01805-006909", copy: "01805006909" }],
  },
  {
    id: "bank",
    name: "Bank transfer",
    note: "Eastern Bank PLC · payable at any branch in Bangladesh.",
    fields: [
      { label: "Account name", value: "Blossom Square Hotel and Suites", copy: "BLOSSOM SQUARE HOTEL AND SUITES" },
      { label: "Account no.", value: "0091350000386", copy: "0091350000386" },
      { label: "Routing no.", value: "095220253", copy: "095220253" },
    ],
  },
] as const;

export const directionsUrl = HOTEL.mapUrl;
export const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(HOTEL.mapQuery)}&z=16&output=embed`;

/** Primary site sections, in menu order. */
export const NAV_LINKS = [
  { label: "Rooms & Suites", href: "/rooms", note: "Seven ways to stay" },
  { label: "Dining", href: "/dining", note: "Seafood & breakfast" },
  { label: "Facilities", href: "/facilities", note: "Pool, Wi-Fi, parking" },
  { label: "Meetings & Events", href: "/meetings-events", note: "Banquet & conference" },
  { label: "Offers", href: "/offers", note: "Direct & midweek rates" },
  { label: "Gallery", href: "/gallery", note: "The hotel in photographs" },
  { label: "About", href: "/about", note: "Kolatoli, Cox's Bazar" },
  { label: "Contact", href: "/contact", note: "Call, WhatsApp, find us" },
] as const;

/** Guest services, shown in the footer and on help pages. */
export const SERVICE_LINKS = [
  { label: "Book a stay", href: "/booking" },
  { label: "Find my booking", href: "/booking/lookup" },
  { label: "Questions & answers", href: "/faq" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
] as const;

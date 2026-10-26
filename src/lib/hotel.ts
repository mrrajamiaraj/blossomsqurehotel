// Fixed hotel details shared across pages. Policies and tax rates are edited
// by managers in Admin → Settings (see getSettings in lib/rooms.ts).
export const HOTEL = {
  name: "Blossom Square",
  fullName: "Blossom Square Hotel & Suites",
  address: "House 85, Block A, Light House Road, Kolatoli, Cox's Bazar",
  shortAddress: "Light House Road, Kolatoli, Cox's Bazar",
  checkIn: "2:00 PM",
  checkOut: "12:00 PM",
  phones: [
    { display: "+880 1792-450562", href: "tel:+8801792450562" },
    { display: "+880 1818-116387", href: "tel:+8801818116387" },
  ],
  email: "helalibabu87@gmail.com",
  mapQuery: "Blossom Square Hotel, Light House Road, Kolatoli, Cox's Bazar",
  social: [
    { label: "Facebook", href: "#" },
    { label: "Instagram", href: "#" },
    { label: "WhatsApp", href: "#" },
  ],
} as const;

export const RESERVATIONS = HOTEL.phones[0];

export const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(HOTEL.mapQuery)}`;
export const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(HOTEL.mapQuery)}&z=16&output=embed`;

export const NAV_LINKS = [
  { label: "Rooms & Suites", href: "/rooms", note: "Three ways to stay" },
  { label: "Dining", href: "/#dining", note: "Seafood & breakfast" },
  { label: "Meetings & Events", href: "/#events", note: "Banquet & conference" },
  { label: "Amenities", href: "/#amenities", note: "Included with every stay" },
  { label: "Find us", href: "/#location", note: "Kolatoli, Cox's Bazar" },
] as const;

// Hotel details shared across pages. Bracketed values are placeholders
// carried over from the approved design, still to be supplied by the hotel.
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
  directionsUrl:
    "https://www.google.com/maps/search/?api=1&query=Blossom+Square+Hotel+Light+House+Road+Kolatoli+Cox's+Bazar",
  cancellationPolicy: "[YOUR POLICY]",
  social: [
    { label: "Facebook [LINK]", href: "#" },
    { label: "Instagram [LINK]", href: "#" },
    { label: "WhatsApp [NUMBER]", href: "#" },
  ],
} as const;

export const RESERVATIONS = HOTEL.phones[0];

export const NAV_LINKS = [
  { label: "Rooms & Suites", href: "/rooms" },
  { label: "Dining", href: "/#dining" },
  { label: "Meetings & Events", href: "/#events" },
  { label: "Amenities", href: "/#amenities" },
  { label: "Contact", href: "/#location" },
] as const;

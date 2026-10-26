export type Amenity = { name: string; note: string; icon: string };

export const ICONS = {
  seaView:
    "M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M9 8a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  breakfast: "M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3",
  pool: "M2 18c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M8 14V5a2 2 0 0 1 4 0M12 14V5a2 2 0 0 1 4 0M8 9h8",
  roomService: "M4 17h16M6 17a6 6 0 0 1 12 0M12 9V7M10 7h4M3 20h18",
  wifi: "M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01",
  parking: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 17V7h4a3 3 0 0 1 0 6H9",
  balcony: "M3 11h18M5 21V11M19 21V11M9 11v10M15 11v10M6 11V8a6 6 0 0 1 12 0v3",
  minibar: "M7 3h10l-1 8a4 4 0 0 1-8 0zM12 15v6M9 21h6",
  airport: "M2 16l20-6-2-3-6 2-6-5-2 1 4 5-5 2-2-2-1 1z",
  ac: "M12 2v20M4.9 6.5l14.2 11M4.9 17.5l14.2-11",
  tv: "M4.5 5h15A1.5 1.5 0 0 1 21 6.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5v-9A1.5 1.5 0 0 1 4.5 5zM8 21h8",
};

export const HOTEL_AMENITIES: Amenity[] = [
  { name: "Sea view", note: "From every room", icon: ICONS.seaView },
  { name: "Breakfast", note: "Buffet, included", icon: ICONS.breakfast },
  { name: "Swimming pool", note: "Open daily", icon: ICONS.pool },
  { name: "Room service", note: "Twenty-four hours", icon: ICONS.roomService },
  { name: "Wi-Fi", note: "High-speed, free", icon: ICONS.wifi },
  { name: "Parking", note: "Free, on site", icon: ICONS.parking },
  { name: "Private balcony", note: "In every room", icon: ICONS.balcony },
  { name: "Airport transfers", note: "On request, extra charge", icon: ICONS.airport },
];

export const ROOM_AMENITIES: Amenity[] = [
  { name: "Sea view", note: "", icon: ICONS.seaView },
  { name: "Private balcony", note: "", icon: ICONS.balcony },
  { name: "Breakfast included", note: "", icon: ICONS.breakfast },
  { name: "Pool access", note: "", icon: ICONS.pool },
  { name: "Mini bar", note: "", icon: ICONS.minibar },
  { name: "Air conditioning", note: "", icon: ICONS.ac },
  { name: "Smart TV", note: "", icon: ICONS.tv },
  { name: "High-speed Wi-Fi", note: "", icon: ICONS.wifi },
];

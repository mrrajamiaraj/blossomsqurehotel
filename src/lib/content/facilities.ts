import { ICONS } from "../amenities";

/**
 * Hotel facilities, written only from what the hotel publishes today
 * (previous website, rooms data and the owner's brief). Opening hours,
 * capacities and sizes are left out until the hotel confirms them.
 */
export type Facility = {
  id: string;
  name: string;
  /** One line for cards. */
  summary: string;
  /** Short paragraph for the facilities page. */
  detail: string;
  icon: string;
  /** Included in the room rate, or on request. */
  terms: "included" | "on-request" | "charged";
  /** Photo ref in public/photos; null until the hotel supplies one. */
  photoRef: string | null;
};

export const FACILITIES: Facility[] = [
  {
    id: "pool",
    name: "Swimming pool",
    summary: "Open daily for hotel guests",
    detail: "Come back from the beach to a swim at the hotel. The pool is open every day and is free for staying guests.",
    icon: ICONS.pool,
    terms: "included",
    photoRef: "POOL",
  },
  {
    id: "restaurant",
    name: "Restaurant & café",
    summary: "Bangladeshi and international dishes",
    detail: "Bangladeshi and international dishes, with fish from Cox's Bazar's own catch. The lounge stays open for evening coffee.",
    icon: ICONS.breakfast,
    terms: "charged",
    photoRef: "RESTAURANT",
  },
  {
    id: "breakfast",
    name: "Breakfast",
    summary: "Buffet, included with every room",
    detail: "A breakfast buffet is part of every room rate, for every guest on the booking.",
    icon: ICONS.breakfast,
    terms: "included",
    photoRef: null,
  },
  {
    id: "room-service",
    name: "Room service",
    summary: "Twenty-four hours",
    detail: "Meals and snacks brought to your room at any hour of the day or night.",
    icon: ICONS.roomService,
    terms: "charged",
    photoRef: null,
  },
  {
    id: "wifi",
    name: "Wi-Fi",
    summary: "High-speed, free throughout",
    detail: "Free high-speed internet in every room and across the hotel, around the clock.",
    icon: ICONS.wifi,
    terms: "included",
    photoRef: null,
  },
  {
    id: "parking",
    name: "Parking",
    summary: "Free and on site",
    detail: "Safe on-site parking for guests, available at any time.",
    icon: ICONS.parking,
    terms: "included",
    photoRef: null,
  },
  {
    id: "conference",
    name: "Conference room",
    summary: "Meetings with high-speed Wi-Fi",
    detail: "A private room for meetings, trainings and presentations, with high-speed Wi-Fi. Ask us about refreshments.",
    icon: ICONS.desk,
    terms: "on-request",
    photoRef: null,
  },
  {
    id: "banquet",
    name: "Banquet hall",
    summary: "Celebrations with full catering",
    detail: "For receptions, family celebrations and company dinners. Our events team arranges setup, décor and menus.",
    icon: ICONS.roomService,
    terms: "on-request",
    photoRef: "BANQUET",
  },
  {
    id: "airport",
    name: "Airport transfers",
    summary: "Pickup and drop-off on request",
    detail: "We can meet you at Cox's Bazar airport and take you back at the end of your stay, for an extra charge. Ask when you book.",
    icon: ICONS.airport,
    terms: "charged",
    photoRef: null,
  },
];

/** What every room has, from the room types' feature lists. */
export const IN_EVERY_ROOM = [
  { name: "Private bathroom", icon: ICONS.bath },
  { name: "Air conditioning", icon: ICONS.ac },
  { name: "Hot water", icon: ICONS.hotWater },
  { name: "TV", icon: ICONS.tv },
  { name: "Work desk", icon: ICONS.desk },
  { name: "Free Wi-Fi", icon: ICONS.wifi },
];

export const TERMS_LABEL: Record<Facility["terms"], string> = {
  included: "Included",
  "on-request": "On request",
  charged: "Extra charge",
};

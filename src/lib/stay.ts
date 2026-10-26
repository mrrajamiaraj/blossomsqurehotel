import { addDays, hotelToday, isISODate, nightsBetween } from "./dates";

/** What a guest is searching for. Carried between pages in the URL. */
export type Stay = {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
};

export const LIMITS = {
  maxNights: 30,
  maxRooms: 5,
  adultsPerRoom: 2,
  childrenPerRoom: 1,
  bookAheadDays: 365,
} as const;

type Params = Record<string, string | string[] | undefined>;

function int(value: string | string[] | undefined, fallback: number, min: number, max: number): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function defaultStay(today = hotelToday()): Stay {
  return { checkIn: addDays(today, 1), checkOut: addDays(today, 4), adults: 2, children: 0, rooms: 1 };
}

/** Reads a stay from search params, repairing anything out of range. */
export function parseStay(params: Params, today = hotelToday()): Stay {
  const fallback = defaultStay(today);
  const rawIn = params.checkIn;
  const rawOut = params.checkOut;
  let checkIn = isISODate(rawIn) ? rawIn : fallback.checkIn;
  if (checkIn < today) checkIn = fallback.checkIn;
  let checkOut = isISODate(rawOut) ? rawOut : addDays(checkIn, 3);
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1 || nights > LIMITS.maxNights) checkOut = addDays(checkIn, Math.min(3, LIMITS.maxNights));

  const rooms = int(params.rooms, 1, 1, LIMITS.maxRooms);
  const adults = int(params.adults, Math.min(2, rooms * LIMITS.adultsPerRoom), 1, rooms * LIMITS.adultsPerRoom);
  const children = int(params.children, 0, 0, rooms * LIMITS.childrenPerRoom);
  return { checkIn, checkOut, adults, children, rooms };
}

export function stayQuery(stay: Stay, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    adults: String(stay.adults),
    children: String(stay.children),
    rooms: String(stay.rooms),
    ...extra,
  });
  return q.toString();
}

export function guestsLabel(stay: Pick<Stay, "adults" | "children" | "rooms">): string {
  const parts = [`${stay.adults} ${stay.adults === 1 ? "adult" : "adults"}`];
  if (stay.children) parts.push(`${stay.children} ${stay.children === 1 ? "child" : "children"}`);
  if (stay.rooms > 1) parts.push(`${stay.rooms} rooms`);
  return parts.join(", ");
}

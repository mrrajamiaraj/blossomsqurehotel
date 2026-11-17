// Room filtering and sorting for the Rooms & Suites page. Pure, so the same
// rules can be unit-tested and reused (e.g. by a future search API).

import { stayCost, type RoomRates } from "./pricing";
import type { Stay } from "./stay";

export type FilterRoom = {
  slug: string;
  tag: string;
  sleeps: number;
  features: string[];
  rates: RoomRates;
  /** Free units for the searched dates. */
  available: number;
};

export type RoomType = "all" | "room" | "suite";
export type RoomSort = "recommended" | "price-asc" | "price-desc" | "space";

export type RoomFilters = {
  type: RoomType;
  /** Only room types that can take the whole party in the rooms asked for. */
  fitsParty: boolean;
  balcony: boolean;
  /** Only types with enough free rooms (ignored when availability isn't live). */
  availableOnly: boolean;
  sort: RoomSort;
};

export const DEFAULT_FILTERS: RoomFilters = { type: "all", fitsParty: true, balcony: false, availableOnly: false, sort: "recommended" };

/** Mirrors the database rule: up to `sleeps` adults per room, plus one child per room. */
export function fitsParty(room: Pick<FilterRoom, "sleeps">, stay: Pick<Stay, "adults" | "children" | "rooms">): boolean {
  return stay.adults <= room.sleeps * stay.rooms && stay.adults + stay.children <= (room.sleeps + 1) * stay.rooms;
}

export function hasBalcony(room: Pick<FilterRoom, "features">): boolean {
  return room.features.some((f) => f.toLowerCase().includes("balcony"));
}

export function filterRooms<T extends FilterRoom>(rooms: T[], f: RoomFilters, stay: Stay, live: boolean): T[] {
  const list = rooms.filter(
    (r) =>
      (f.type === "all" || (f.type === "suite") === (r.tag === "SUITE")) &&
      (!f.fitsParty || fitsParty(r, stay)) &&
      (!f.balcony || hasBalcony(r)) &&
      (!f.availableOnly || !live || r.available >= stay.rooms),
  );
  const total = (r: T) => stayCost(r.rates, stay.checkIn, stay.checkOut, stay.rooms).total;
  if (f.sort === "price-asc") list.sort((a, b) => total(a) - total(b));
  if (f.sort === "price-desc") list.sort((a, b) => total(b) - total(a));
  if (f.sort === "space") list.sort((a, b) => b.sleeps - a.sleeps || total(a) - total(b));
  return list;
}

/** Reads filters from URL params, ignoring anything unexpected. */
export function parseFilters(params: Record<string, string | string[] | undefined>): RoomFilters {
  const one = (k: string) => (Array.isArray(params[k]) ? params[k]![0] : params[k]) as string | undefined;
  const type = one("type");
  const sort = one("sort");
  return {
    type: type === "room" || type === "suite" ? type : "all",
    fitsParty: one("fits") !== "0",
    balcony: one("balcony") === "1",
    availableOnly: one("open") === "1",
    sort: sort === "price-asc" || sort === "price-desc" || sort === "space" ? sort : "recommended",
  };
}

/** Filter params for the URL; defaults are left out. */
export function filterParams(f: RoomFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.type !== "all") p.type = f.type;
  if (!f.fitsParty) p.fits = "0";
  if (f.balcony) p.balcony = "1";
  if (f.availableOnly) p.open = "1";
  if (f.sort !== "recommended") p.sort = f.sort;
  return p;
}

// Hotel operating figures, computed from bookings with standard definitions:
//   Occupancy = room-nights sold ÷ room-nights available
//   ADR       = room revenue ÷ room-nights sold
//   RevPAR    = room revenue ÷ room-nights available  (= ADR × occupancy)
// "Sold" means confirmed, in-house or checked-out stays; pending requests and
// cancellations don't count. Revenue is room revenue at the agreed nightly
// rate, before VAT and service charge. Available room-nights use the rooms
// currently in service.

import { addDays, nightsBetween } from "../dates";
import { SOLD_STATUSES } from "../data/rules";
import type { Booking } from "../data/types";

const sold = (b: Booking) => SOLD_STATUSES.includes(b.status);

/** True if the stay includes the night that starts on `date`. */
const staysNight = (b: Booking, date: string) => b.check_in <= date && date < b.check_out;

export type TodayFigures = {
  arrivals: { total: number; checkedIn: number; awaiting: number };
  departures: { total: number; checkedOut: number };
  inHouse: number;
  occupancy: { occupied: number; sellable: number; pct: number; pendingRooms: number };
  requests: { count: number; oldest: string | null };
};

export function todayFigures(bookings: Booking[], sellableRooms: number, today: string): TodayFigures {
  const arriving = bookings.filter((b) => b.check_in === today && ["pending", "confirmed", "checked_in"].includes(b.status));
  const departing = bookings.filter((b) => b.check_out === today && (b.status === "checked_in" || b.status === "checked_out"));
  const tonight = bookings.filter((b) => staysNight(b, today));
  const occupied = tonight.filter((b) => b.status === "confirmed" || b.status === "checked_in").reduce((n, b) => n + b.rooms, 0);
  const pendingRooms = tonight.filter((b) => b.status === "pending").reduce((n, b) => n + b.rooms, 0);
  const requests = bookings.filter((b) => b.status === "pending");
  const oldest = requests.map((b) => b.created_at).sort()[0] ?? null;

  return {
    arrivals: {
      total: arriving.length,
      checkedIn: arriving.filter((b) => b.status === "checked_in").length,
      awaiting: arriving.filter((b) => b.status === "pending").length,
    },
    departures: {
      total: departing.length,
      checkedOut: departing.filter((b) => b.status === "checked_out").length,
    },
    inHouse: bookings.filter((b) => b.status === "checked_in").length,
    occupancy: { occupied, sellable: sellableRooms, pct: sellableRooms ? occupied / sellableRooms : 0, pendingRooms },
    requests: { count: requests.length, oldest },
  };
}

export type PeriodFigures = {
  nights: number;
  roomNightsSold: number;
  roomNightsAvailable: number;
  roomRevenue: number;
  occupancy: number;
  adr: number | null;
  revpar: number | null;
};

/** Figures for the nights from `from` up to and including `through`. */
export function periodFigures(bookings: Booking[], sellableRooms: number, from: string, through: string): PeriodFigures {
  const nights = Math.max(0, nightsBetween(from, through) + 1);
  let roomNightsSold = 0;
  let roomRevenue = 0;
  for (const b of bookings) {
    if (!sold(b)) continue;
    const start = b.check_in > from ? b.check_in : from;
    const endExclusive = b.check_out < addDays(through, 1) ? b.check_out : addDays(through, 1);
    const n = nightsBetween(start, endExclusive);
    if (n <= 0) continue;
    roomNightsSold += n * b.rooms;
    roomRevenue += n * b.rooms * b.nightly_rate_bdt;
  }
  const roomNightsAvailable = sellableRooms * nights;
  return {
    nights,
    roomNightsSold,
    roomNightsAvailable,
    roomRevenue,
    occupancy: roomNightsAvailable ? roomNightsSold / roomNightsAvailable : 0,
    adr: roomNightsSold ? Math.round(roomRevenue / roomNightsSold) : null,
    revpar: roomNightsAvailable ? Math.round(roomRevenue / roomNightsAvailable) : null,
  };
}

export type NightLoad = { date: string; sold: number; pending: number; sellable: number };

/** Rooms sold and requested for each of the next `days` nights. */
export function nightlyLoad(bookings: Booking[], sellableRooms: number, from: string, days: number): NightLoad[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const on = bookings.filter((b) => staysNight(b, date));
    return {
      date,
      sold: on.filter((b) => b.status === "confirmed" || b.status === "checked_in").reduce((n, b) => n + b.rooms, 0),
      pending: on.filter((b) => b.status === "pending").reduce((n, b) => n + b.rooms, 0),
      sellable: sellableRooms,
    };
  });
}

export type CancellationFigures = { cancelled: number; noShows: number; received: number; rate: number };

/** Of bookings received since `since`, how many were cancelled or didn't show. */
export function cancellationFigures(bookings: Booking[], since: string): CancellationFigures {
  const received = bookings.filter((b) => b.created_at.slice(0, 10) >= since);
  const cancelled = received.filter((b) => b.status === "cancelled").length;
  const noShows = received.filter((b) => b.status === "no_show").length;
  return { cancelled, noShows, received: received.length, rate: received.length ? (cancelled + noShows) / received.length : 0 };
}

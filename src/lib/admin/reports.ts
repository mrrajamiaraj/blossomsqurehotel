// Reports: figures for any run of nights, using the same definitions as
// metrics.ts (occupancy, ADR, RevPAR on sold stays, room revenue before VAT
// and service charge). Everything here is pure so it can be unit-tested.

import { addDays, nightsBetween, toDate } from "../dates";
import { SOLD_STATUSES } from "../data/rules";
import type { Booking, BookingSource, BookingStatus, RoomUnit } from "../data/types";

const sold = (b: Booking) => SOLD_STATUSES.includes(b.status);

/* ---------- Periods ---------- */

export type PeriodKey = "7d" | "30d" | "90d" | "mtd" | "last_month" | "ytd" | "next_30" | "custom";

export type Period = {
  key: PeriodKey;
  label: string;
  /** First night, inclusive. */
  from: string;
  /** Last night, inclusive. */
  through: string;
  prevFrom: string;
  prevThrough: string;
};

export const PERIOD_PRESETS: { key: Exclude<PeriodKey, "custom">; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "mtd", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "ytd", label: "Year to date" },
  { key: "next_30", label: "Next 30 days" },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NIGHTS = 400;

/** Turns ?period=…&from=…&to=… into a concrete run of nights plus the run before it. */
export function resolvePeriod(params: { period?: string; from?: string; to?: string }, today: string): Period {
  let key = (PERIOD_PRESETS.some((p) => p.key === params.period) ? params.period : "30d") as PeriodKey;
  let from: string;
  let through = today;

  if (params.period === "custom" && params.from && params.to && ISO.test(params.from) && ISO.test(params.to)) {
    key = "custom";
    [from, through] = params.from <= params.to ? [params.from, params.to] : [params.to, params.from];
    if (nightsBetween(from, through) >= MAX_NIGHTS) from = addDays(through, -(MAX_NIGHTS - 1));
  } else if (key === "7d") from = addDays(today, -6);
  else if (key === "90d") from = addDays(today, -89);
  else if (key === "mtd") from = `${today.slice(0, 8)}01`;
  else if (key === "last_month") {
    from = `${addDays(`${today.slice(0, 8)}01`, -1).slice(0, 8)}01`;
    through = addDays(`${today.slice(0, 8)}01`, -1);
  } else if (key === "ytd") from = `${today.slice(0, 4)}-01-01`;
  else if (key === "next_30") {
    from = today;
    through = addDays(today, 29);
  } else from = addDays(today, -29);

  const nights = nightsBetween(from, through) + 1;
  const prevThrough = addDays(from, -1);
  const prevFrom = addDays(prevThrough, -(nights - 1));
  const label = key === "custom" ? "Custom range" : PERIOD_PRESETS.find((p) => p.key === key)!.label;
  return { key, label, from, through, prevFrom, prevThrough };
}

/* ---------- The report ---------- */

export type DayPoint = {
  date: string;
  roomsSold: number;
  pendingRooms: number;
  revenue: number;
  occupancy: number;
  adr: number | null;
};

export type Slice = { key: string; label: string; value: number; share: number; extra?: string };

export type Report = {
  nights: number;
  sellable: number;
  roomNightsSold: number;
  roomNightsAvailable: number;
  revenue: number;
  occupancy: number;
  adr: number | null;
  revpar: number | null;
  /** Bookings arriving in the period (any status). */
  arrivals: number;
  cancelled: number;
  noShows: number;
  cancelRate: number;
  avgStay: number | null;
  avgLead: number | null;
  /** For sold stays arriving in the period. */
  billed: number;
  collected: number;
  outstanding: number;
  days: DayPoint[];
  byRoomType: { id: string; name: string; units: number; roomNights: number; revenue: number; occupancy: number; adr: number | null }[];
  bySource: Slice[];
  byWeekday: { dow: number; label: string; occupancy: number; nights: number }[];
  leadTime: Slice[];
  stayLength: Slice[];
  statusMix: Slice[];
  topGuests: { key: string; name: string; phone: string; stays: number; nights: number; revenue: number; lastReference: string }[];
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SOURCE: Record<BookingSource, string> = { website: "Website", phone: "Phone", walk_in: "Walk-in", other: "Other" };
const STATUS: Record<BookingStatus, string> = {
  pending: "Awaiting confirmation",
  confirmed: "Confirmed",
  checked_in: "In house",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};

function slices(entries: [string, string, number][]): Slice[] {
  const total = entries.reduce((n, [, , v]) => n + v, 0);
  return entries.map(([key, label, value]) => ({ key, label, value, share: total ? value / total : 0 }));
}

export function buildReport(
  bookings: Booking[],
  rooms: RoomUnit[],
  types: { id: string; name: string }[],
  from: string,
  through: string,
): Report {
  const inService = rooms.filter((r) => !r.out_of_service);
  const sellable = inService.length;
  const nights = Math.max(0, nightsBetween(from, through) + 1);
  const end = addDays(through, 1);

  const days: DayPoint[] = Array.from({ length: nights }, (_, i) => ({
    date: addDays(from, i),
    roomsSold: 0,
    pendingRooms: 0,
    revenue: 0,
    occupancy: 0,
    adr: null,
  }));
  const dayIndex = new Map(days.map((d, i) => [d.date, i]));

  const typeStats = new Map(types.map((t) => [t.id, { roomNights: 0, revenue: 0 }]));
  const sourceRevenue = new Map<BookingSource, number>();
  const guests = new Map<string, Report["topGuests"][number]>();

  for (const b of bookings) {
    const isSold = sold(b);
    if (!isSold && b.status !== "pending") continue;
    const start = b.check_in > from ? b.check_in : from;
    const stop = b.check_out < end ? b.check_out : end;
    const n = nightsBetween(start, stop);
    if (n <= 0) continue;

    for (let i = 0; i < n; i++) {
      const idx = dayIndex.get(addDays(start, i));
      if (idx == null) continue;
      if (isSold) {
        days[idx]!.roomsSold += b.rooms;
        days[idx]!.revenue += b.rooms * b.nightly_rate_bdt;
      } else days[idx]!.pendingRooms += b.rooms;
    }
    if (!isSold) continue;

    const revenue = n * b.rooms * b.nightly_rate_bdt;
    const t = typeStats.get(b.room_type_id);
    if (t) {
      t.roomNights += n * b.rooms;
      t.revenue += revenue;
    }
    sourceRevenue.set(b.source, (sourceRevenue.get(b.source) ?? 0) + revenue);

    const key = b.email?.toLowerCase() || b.phone;
    const g = guests.get(key) ?? { key, name: b.guest_name, phone: b.phone, stays: 0, nights: 0, revenue: 0, lastReference: b.reference };
    g.stays += 1;
    g.nights += n * b.rooms;
    g.revenue += revenue;
    g.lastReference = b.reference;
    guests.set(key, g);
  }

  for (const d of days) {
    d.occupancy = sellable ? d.roomsSold / sellable : 0;
    d.adr = d.roomsSold ? Math.round(d.revenue / d.roomsSold) : null;
  }

  const roomNightsSold = days.reduce((n, d) => n + d.roomsSold, 0);
  const revenue = days.reduce((n, d) => n + d.revenue, 0);
  const roomNightsAvailable = sellable * nights;

  // Bookings arriving in the period: the basis for mix, pace and cancellations.
  const arriving = bookings.filter((b) => b.check_in >= from && b.check_in <= through);
  const arrivingSold = arriving.filter(sold);
  const cancelled = arriving.filter((b) => b.status === "cancelled").length;
  const noShows = arriving.filter((b) => b.status === "no_show").length;
  const leadOf = (b: Booking) => Math.max(0, nightsBetween(b.created_at.slice(0, 10), b.check_in));
  const stayOf = (b: Booking) => nightsBetween(b.check_in, b.check_out);

  const leadBuckets: [string, string, (d: number) => boolean][] = [
    ["0", "Same day", (d) => d === 0],
    ["1-3", "1–3 days", (d) => d >= 1 && d <= 3],
    ["4-7", "4–7 days", (d) => d >= 4 && d <= 7],
    ["8-14", "1–2 weeks", (d) => d >= 8 && d <= 14],
    ["15-30", "2–4 weeks", (d) => d >= 15 && d <= 30],
    ["31+", "Over a month", (d) => d > 30],
  ];
  const stayBuckets: [string, string, (n: number) => boolean][] = [
    ["1", "1 night", (n) => n === 1],
    ["2", "2 nights", (n) => n === 2],
    ["3", "3 nights", (n) => n === 3],
    ["4", "4 nights", (n) => n === 4],
    ["5+", "5+ nights", (n) => n >= 5],
  ];

  const weekday = DOW.map((label, dow) => {
    const on = days.filter((d) => toDate(d.date).getUTCDay() === dow);
    const occ = on.length ? on.reduce((n, d) => n + d.occupancy, 0) / on.length : 0;
    return { dow, label, occupancy: occ, nights: on.length };
  });
  // Saturday-first week, as the hotel's week runs.
  const byWeekday = [6, 0, 1, 2, 3, 4, 5].map((i) => weekday[i]!);

  const billed = arrivingSold.reduce((n, b) => n + b.total_bdt, 0);
  const collected = arrivingSold.reduce((n, b) => n + Math.min(b.amount_paid_bdt, b.total_bdt), 0);

  return {
    nights,
    sellable,
    roomNightsSold,
    roomNightsAvailable,
    revenue,
    occupancy: roomNightsAvailable ? roomNightsSold / roomNightsAvailable : 0,
    adr: roomNightsSold ? Math.round(revenue / roomNightsSold) : null,
    revpar: roomNightsAvailable ? Math.round(revenue / roomNightsAvailable) : null,
    arrivals: arriving.length,
    cancelled,
    noShows,
    cancelRate: arriving.length ? (cancelled + noShows) / arriving.length : 0,
    avgStay: arrivingSold.length ? arrivingSold.reduce((n, b) => n + stayOf(b), 0) / arrivingSold.length : null,
    avgLead: arrivingSold.length ? arrivingSold.reduce((n, b) => n + leadOf(b), 0) / arrivingSold.length : null,
    billed,
    collected,
    outstanding: billed - collected,
    days,
    byRoomType: types.map((t) => {
      const s = typeStats.get(t.id)!;
      const units = inService.filter((r) => r.room_type_id === t.id).length;
      return {
        id: t.id,
        name: t.name,
        units,
        roomNights: s.roomNights,
        revenue: s.revenue,
        occupancy: units * nights ? s.roomNights / (units * nights) : 0,
        adr: s.roomNights ? Math.round(s.revenue / s.roomNights) : null,
      };
    }),
    bySource: slices(
      (Object.keys(SOURCE) as BookingSource[]).map((s) => [s, SOURCE[s], sourceRevenue.get(s) ?? 0]),
    ).map((x) => ({ ...x, extra: `${arrivingSold.filter((b) => b.source === x.key).length} stays` })),
    byWeekday,
    leadTime: slices(leadBuckets.map(([k, l, test]) => [k, l, arrivingSold.filter((b) => test(leadOf(b))).length])),
    stayLength: slices(stayBuckets.map(([k, l, test]) => [k, l, arrivingSold.filter((b) => test(stayOf(b))).length])),
    statusMix: slices(
      (Object.keys(STATUS) as BookingStatus[]).map((s) => [s, STATUS[s], arriving.filter((b) => b.status === s).length]),
    ).filter((s) => s.value > 0),
    topGuests: [...guests.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
  };
}

/** Relative change, or null when there's nothing to compare against. */
export function change(now: number | null, before: number | null): number | null {
  if (now == null || before == null || before === 0) return null;
  return (now - before) / Math.abs(before);
}

/* ---------- CSV ---------- */

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formulas (but leave phone numbers like +880… alone).
  const formula = /^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s));
  const safe = formula ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function bookingsCsv(rows: Booking[], typeName: Map<string, string>, roomNo: Map<string, string>): string {
  const head = [
    "Reference", "Status", "Source", "Guest", "Phone", "Email", "Country", "Room type", "Room", "Rooms",
    "Check-in", "Check-out", "Nights", "Adults", "Children", "Nightly rate (BDT)", "Total (BDT)", "Paid (BDT)",
    "Balance (BDT)", "Payment", "Received", "Cancel reason",
  ];
  const lines = rows.map((b) =>
    [
      b.reference, STATUS[b.status], SOURCE[b.source], b.guest_name, b.phone, b.email, b.country,
      typeName.get(b.room_type_id) ?? "", b.room_id ? (roomNo.get(b.room_id) ?? "") : "", b.rooms,
      b.check_in, b.check_out, nightsBetween(b.check_in, b.check_out), b.adults, b.children,
      b.nightly_rate_bdt, b.total_bdt, b.amount_paid_bdt, b.total_bdt - b.amount_paid_bdt, b.payment_status,
      b.created_at, b.cancel_reason,
    ]
      .map(csvCell)
      .join(","),
  );
  // Byte-order mark so Excel reads the file as UTF-8.
  return `﻿${[head.join(","), ...lines].join("\r\n")}\r\n`;
}

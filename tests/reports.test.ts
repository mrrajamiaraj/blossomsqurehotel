import { describe, expect, it } from "vitest";
import { bookingsCsv, buildReport, change, resolvePeriod } from "@/lib/admin/reports";
import type { Booking, BookingSource, BookingStatus, RoomUnit } from "@/lib/data/types";

function booking(
  id: string,
  status: BookingStatus,
  checkIn: string,
  checkOut: string,
  opts: Partial<Pick<Booking, "nightly_rate_bdt" | "rooms" | "room_type_id" | "created_at" | "total_bdt" | "amount_paid_bdt" | "phone" | "email">> & { source?: BookingSource } = {},
): Booking {
  const created = opts.created_at ?? "2026-10-01T08:00:00Z";
  return {
    id,
    reference: id,
    room_type_id: opts.room_type_id ?? "king",
    room_id: null,
    rooms: opts.rooms ?? 1,
    check_in: checkIn,
    check_out: checkOut,
    adults: 2,
    children: 0,
    guest_name: id,
    email: opts.email ?? null,
    phone: opts.phone ?? id,
    country: null,
    arrival_window: null,
    special_requests: null,
    internal_notes: null,
    airport_pickup: false,
    source: opts.source ?? "website",
    nightly_rate_bdt: opts.nightly_rate_bdt ?? 10000,
    total_bdt: opts.total_bdt ?? 0,
    amount_paid_bdt: opts.amount_paid_bdt ?? 0,
    payment_status: "unpaid",
    status,
    cancel_reason: null,
    confirmed_at: null,
    checked_in_at: null,
    checked_out_at: null,
    cancelled_at: null,
    created_at: created,
    updated_at: created,
  };
}

const room = (id: string, type: string, outOfService = false): RoomUnit => ({
  id,
  number: id,
  room_type_id: type,
  floor: null,
  housekeeping: "clean",
  out_of_service: outOfService,
  service_note: null,
});

const rooms = [room("201", "king"), room("202", "king"), room("101", "deluxe"), room("102", "deluxe", true)];
const types = [
  { id: "king", name: "King Suite" },
  { id: "deluxe", name: "Deluxe Couple" },
];

describe("resolvePeriod", () => {
  const today = "2026-11-14";

  it("defaults to the last 30 nights, compared with the 30 before", () => {
    expect(resolvePeriod({}, today)).toMatchObject({ key: "30d", from: "2026-10-16", through: today, prevFrom: "2026-09-16", prevThrough: "2026-10-15" });
  });

  it("handles month presets across a year boundary", () => {
    expect(resolvePeriod({ period: "last_month" }, "2027-01-09")).toMatchObject({ from: "2026-12-01", through: "2026-12-31" });
    expect(resolvePeriod({ period: "mtd" }, today)).toMatchObject({ from: "2026-11-01", through: today, prevFrom: "2026-10-18", prevThrough: "2026-10-31" });
  });

  it("accepts custom ranges in either order and ignores bad ones", () => {
    expect(resolvePeriod({ period: "custom", from: "2026-11-10", to: "2026-11-01" }, today)).toMatchObject({ key: "custom", from: "2026-11-01", through: "2026-11-10" });
    expect(resolvePeriod({ period: "custom", from: "nope", to: "2026-11-01" }, today).key).toBe("30d");
  });

  it("looks forward for the on-the-books preset", () => {
    expect(resolvePeriod({ period: "next_30" }, today)).toMatchObject({ from: today, through: "2026-12-13" });
  });
});

describe("buildReport", () => {
  const list = [
    // 3 nights, 2 inside the period (10th and 11th).
    booking("a", "checked_out", "2026-11-09", "2026-11-12", { total_bdt: 30000, amount_paid_bdt: 30000 }),
    // 2 rooms × 1 night at 8,000, booked 5 days ahead by phone.
    booking("b", "confirmed", "2026-11-10", "2026-11-11", { rooms: 2, room_type_id: "deluxe", nightly_rate_bdt: 8000, source: "phone", created_at: "2026-11-05T09:00:00Z", total_bdt: 16000, amount_paid_bdt: 6000 }),
    booking("pending", "pending", "2026-11-11", "2026-11-12"),
    booking("cancelled", "cancelled", "2026-11-11", "2026-11-13"),
    booking("noshow", "no_show", "2026-11-10", "2026-11-11"),
  ];
  const r = buildReport(list, rooms, types, "2026-11-10", "2026-11-11");

  it("counts sold room-nights and revenue inside the period only", () => {
    expect(r.nights).toBe(2);
    expect(r.sellable).toBe(3); // 102 is out of service
    expect(r.roomNightsSold).toBe(4); // a: 2, b: 2 rooms × 1
    expect(r.revenue).toBe(2 * 10000 + 2 * 8000);
    expect(r.roomNightsAvailable).toBe(6);
    expect(r.occupancy).toBeCloseTo(4 / 6);
    expect(r.adr).toBe(9000);
    expect(r.revpar).toBe(6000);
  });

  it("builds a night-by-night series with pending rooms kept apart", () => {
    expect(r.days.map((d) => [d.date, d.roomsSold, d.pendingRooms, d.revenue])).toEqual([
      ["2026-11-10", 3, 0, 26000],
      ["2026-11-11", 1, 1, 10000],
    ]);
  });

  it("splits by room type and source", () => {
    expect(r.byRoomType.find((t) => t.id === "deluxe")).toMatchObject({ units: 1, roomNights: 2, revenue: 16000, occupancy: 1 });
    expect(r.bySource.find((s) => s.key === "phone")).toMatchObject({ value: 16000 });
  });

  it("measures cancellations, lead time and payments on arrivals in the period", () => {
    // Arriving 10th–11th: b, pending, cancelled, noshow (a arrived on the 9th).
    expect(r.arrivals).toBe(4);
    expect(r.cancelRate).toBe(0.5);
    expect(r.leadTime.find((s) => s.key === "4-7")?.value).toBe(1);
    expect(r).toMatchObject({ billed: 16000, collected: 6000, outstanding: 10000 });
  });

  it("orders the week from Saturday", () => {
    expect(r.byWeekday.map((d) => d.label)).toEqual(["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]);
  });
});

describe("change", () => {
  it("is relative, and null without a baseline", () => {
    expect(change(120, 100)).toBeCloseTo(0.2);
    expect(change(5, 0)).toBeNull();
    expect(change(null, 3)).toBeNull();
  });
});

describe("bookingsCsv", () => {
  it("quotes, keeps phone numbers and neutralises formulas", () => {
    const csv = bookingsCsv(
      [booking('Guest, "Q"', "confirmed", "2026-11-10", "2026-11-12", { phone: "+880 1711-000000", email: "=HYPERLINK(1)" })],
      new Map([["king", "King Suite"]]),
      new Map(),
    );
    expect(csv.startsWith("﻿Reference,")).toBe(true);
    expect(csv).toContain('"Guest, ""Q"""');
    expect(csv).toContain(",+880 1711-000000,");
    expect(csv).toContain(",'=HYPERLINK(1),");
  });
});

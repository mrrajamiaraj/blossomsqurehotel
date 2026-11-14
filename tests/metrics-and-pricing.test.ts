import { describe, expect, it } from "vitest";
import { cancellationFigures, nightlyLoad, periodFigures, todayFigures } from "@/lib/admin/metrics";
import type { Booking, BookingStatus } from "@/lib/data/types";
import { isWeekendNight, nightsLabel, priceBreakdown, stayCost, taxNote } from "@/lib/pricing";

describe("weekday / weekend rates", () => {
  const standard = { price_bdt: 2500, weekend_price_bdt: 3500 };

  it("treats Thursday and Friday nights as the weekend", () => {
    // 15 Nov 2026 is a Sunday.
    expect(["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"].map(isWeekendNight)).toEqual([
      false, false, false, false, true, true, false,
    ]);
  });

  it("prices each night at its own rate", () => {
    // Wed, Thu, Fri nights.
    const c = stayCost(standard, "2026-11-18", "2026-11-21");
    expect(c.total).toBe(2500 + 3500 + 3500);
    expect(c.average).toBe(3167);
    expect(c.lines.map(nightsLabel)).toEqual(["1 weekday night", "2 weekend nights"]);
    expect(stayCost(standard, "2026-11-18", "2026-11-21", 2).total).toBe(19000);
  });

  it("uses one line when every night costs the same", () => {
    expect(stayCost(standard, "2026-11-15", "2026-11-17").lines.map(nightsLabel)).toEqual(["2 nights"]);
    // No weekend rate: weekday rate every night.
    expect(stayCost({ price_bdt: 5000, weekend_price_bdt: null }, "2026-11-19", "2026-11-21").total).toBe(10000);
  });
});

function booking(id: string, status: BookingStatus, checkIn: string, checkOut: string, rate = 10000, rooms = 1, created = "2026-11-01T08:00:00Z"): Booking {
  return {
    id,
    reference: id,
    room_type_id: "t",
    room_id: null,
    rooms,
    check_in: checkIn,
    check_out: checkOut,
    adults: 2,
    children: 0,
    guest_name: id,
    email: null,
    phone: "0",
    country: null,
    arrival_window: null,
    special_requests: null,
    internal_notes: null,
    airport_pickup: false,
    source: "website",
    nightly_rate_bdt: rate,
    total_bdt: 0,
    amount_paid_bdt: 0,
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

describe("todayFigures", () => {
  const today = "2026-11-10";
  const list = [
    booking("in-house", "checked_in", "2026-11-08", "2026-11-12"),
    booking("arriving", "confirmed", today, "2026-11-12"),
    booking("arrived", "checked_in", today, "2026-11-11"),
    booking("request", "pending", today, "2026-11-11"),
    booking("leaving", "checked_in", "2026-11-07", today),
    booking("left", "checked_out", "2026-11-08", today),
    booking("cancelled", "cancelled", today, "2026-11-12"),
  ];

  it("counts arrivals, departures and occupancy tonight", () => {
    const f = todayFigures(list, 7, today);
    expect(f.arrivals).toEqual({ total: 3, checkedIn: 1, awaiting: 1 });
    expect(f.departures).toEqual({ total: 2, checkedOut: 1 });
    // Tonight: in-house, arriving, arrived are sold; the request is pending; departures don't stay tonight.
    expect(f.occupancy).toMatchObject({ occupied: 3, sellable: 7, pendingRooms: 1 });
    expect(f.occupancy.pct).toBeCloseTo(3 / 7);
    expect(f.requests.count).toBe(1);
  });
});

describe("periodFigures", () => {
  it("computes occupancy, ADR and RevPAR with standard definitions", () => {
    // 10 nights × 2 rooms = 20 available room-nights.
    const list = [
      booking("a", "checked_out", "2026-10-29", "2026-11-03", 8000), // 2 nights inside the period (1st, 2nd)
      booking("b", "confirmed", "2026-11-05", "2026-11-08", 12000), // 3 nights
      booking("c", "pending", "2026-11-05", "2026-11-08", 12000), // not sold
      booking("d", "cancelled", "2026-11-02", "2026-11-04", 12000), // not sold
    ];
    const f = periodFigures(list, 2, "2026-11-01", "2026-11-10");
    expect(f.nights).toBe(10);
    expect(f.roomNightsAvailable).toBe(20);
    expect(f.roomNightsSold).toBe(5);
    expect(f.roomRevenue).toBe(2 * 8000 + 3 * 12000);
    expect(f.occupancy).toBeCloseTo(0.25);
    expect(f.adr).toBe(Math.round(52000 / 5));
    expect(f.revpar).toBe(Math.round(52000 / 20));
  });

  it("returns no ADR when nothing is sold", () => {
    expect(periodFigures([], 7, "2026-11-01", "2026-11-01").adr).toBeNull();
  });
});

describe("nightlyLoad and cancellations", () => {
  it("separates sold from requested rooms per night", () => {
    const list = [booking("a", "confirmed", "2026-11-10", "2026-11-12", 1, 2), booking("b", "pending", "2026-11-11", "2026-11-12")];
    expect(nightlyLoad(list, 7, "2026-11-10", 3).map((n) => [n.sold, n.pending])).toEqual([
      [2, 0],
      [2, 1],
      [0, 0],
    ]);
  });

  it("rates cancellations and no-shows among bookings received", () => {
    const list = [
      booking("a", "cancelled", "2026-11-10", "2026-11-12", 1, 1, "2026-11-02T00:00:00Z"),
      booking("b", "no_show", "2026-11-10", "2026-11-12", 1, 1, "2026-11-03T00:00:00Z"),
      booking("c", "confirmed", "2026-11-10", "2026-11-12", 1, 1, "2026-11-04T00:00:00Z"),
      booking("d", "confirmed", "2026-11-10", "2026-11-12", 1, 1, "2026-11-05T00:00:00Z"),
      booking("old", "cancelled", "2026-11-10", "2026-11-12", 1, 1, "2026-09-01T00:00:00Z"),
    ];
    expect(cancellationFigures(list, "2026-11-01")).toEqual({ cancelled: 1, noShows: 1, received: 4, rate: 0.5 });
  });
});

describe("priceBreakdown", () => {
  it("adds service charge, then VAT on room + service", () => {
    expect(priceBreakdown(10000, { service_charge_percent: 10, vat_percent: 15 })).toEqual({
      room: 10000,
      service: 1000,
      vat: 1650,
      total: 12650,
      taxesKnown: true,
    });
  });

  it("leaves taxes open when the hotel hasn't set them", () => {
    const b = priceBreakdown(10000, { service_charge_percent: null, vat_percent: null });
    expect(b).toMatchObject({ total: 10000, taxesKnown: false, vat: null, service: null });
    expect(taxNote({ service_charge_percent: null, vat_percent: null })).toMatch(/at check-in/);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { addDays, hotelToday, toDate } from "@/lib/dates";
import { PreviewRepo } from "@/lib/data/preview-repo";
import { PREVIEW_ROOM_TYPES } from "@/lib/data/preview-seed";
import { canTransition, guestsFit, overlaps } from "@/lib/data/rules";
import type { WebsiteBookingInput } from "@/lib/data/types";
import { stayCost } from "@/lib/pricing";

const today = hotelToday();
const type = (slug: string) => PREVIEW_ROOM_TYPES.find((t) => t.slug === slug)!;
/** The first Sunday on or after `from`, so a 3-night stay is all weekday nights. */
const sunday = (from: string) => addDays(from, (7 - toDate(from).getUTCDay()) % 7);
const farSunday = sunday(addDays(today, 40));
const desk = () => new PreviewRepo({ name: "Test Desk", role: "receptionist" });
const manager = () => new PreviewRepo({ name: "Test Manager", role: "manager" });
const guest = () => new PreviewRepo();

function request(overrides: Partial<WebsiteBookingInput> = {}): WebsiteBookingInput {
  return {
    room: "connecting-king-suite",
    checkIn: farSunday,
    checkOut: addDays(farSunday, 3),
    rooms: 1,
    adults: 2,
    children: 0,
    name: "Test Guest",
    email: `guest${Math.random()}@example.test`,
    phone: `+880 17${Math.floor(Math.random() * 1e8)}`,
    country: "Bangladesh",
    arrival: "",
    requests: "",
    airportPickup: false,
    ...overrides,
  };
}

beforeEach(() => {
  // Fresh preview hotel for every test.
  delete (globalThis as { __bsqPreview?: unknown }).__bsqPreview;
});

describe("pure rules", () => {
  it("treats stays as half-open ranges", () => {
    expect(overlaps("2026-11-10", "2026-11-12", "2026-11-12", "2026-11-14")).toBe(false); // back-to-back
    expect(overlaps("2026-11-10", "2026-11-13", "2026-11-12", "2026-11-14")).toBe(true);
  });

  it("allows two adults and a child per room", () => {
    expect(guestsFit(2, 1, 2, 1)).toBe(true);
    expect(guestsFit(2, 1, 3, 0)).toBe(false);
    expect(guestsFit(2, 1, 2, 2)).toBe(false);
    expect(guestsFit(2, 2, 4, 2)).toBe(true);
  });

  it("only allows the lifecycle's transitions", () => {
    expect(canTransition("pending", "confirmed")).toBe(true);
    expect(canTransition("pending", "checked_in")).toBe(false);
    expect(canTransition("checked_out", "checked_in")).toBe(false);
  });
});

describe("booking integrity (preview store, same rules as the database)", () => {
  it("prices from the room type, not the caller, and starts pending", async () => {
    const ref = await guest().createWebsiteBooking(request()); // Sun–Tue: weekday nights only
    const b = await desk().getBooking(ref);
    expect(b).toMatchObject({ status: "pending", nightly_rate_bdt: 6000, total_bdt: 18000, payment_status: "unpaid" });
  });

  it("charges Thursday and Friday nights at the weekend rate", async () => {
    // Wed → Sat: Wednesday (weekday), Thursday and Friday (weekend).
    const wed = addDays(farSunday, 3);
    const ref = await guest().createWebsiteBooking(request({ checkIn: wed, checkOut: addDays(wed, 3), rooms: 2 }));
    const b = await desk().getBooking(ref);
    expect(b).toMatchObject({ total_bdt: (6000 + 8500 * 2) * 2, nightly_rate_bdt: Math.round((6000 + 8500 * 2) / 3) });
  });

  it("refuses to oversell a room type", async () => {
    // Two Connecting King Suites exist; a third overlapping request must fail.
    await guest().createWebsiteBooking(request());
    await guest().createWebsiteBooking(request());
    await expect(guest().createWebsiteBooking(request())).rejects.toMatchObject({ code: "SOLD_OUT" });
    // Back-to-back is fine.
    await expect(guest().createWebsiteBooking(request({ checkIn: addDays(farSunday, 3), checkOut: addDays(farSunday, 5) }))).resolves.toMatch(/^BSQ-/);
  });

  it("frees the units of a cancelled booking", async () => {
    const a = await guest().createWebsiteBooking(request());
    await guest().createWebsiteBooking(request());
    const booking = (await desk().getBooking(a))!;
    await desk().setStatus(booking.id, "cancelled", "Guest called");
    await expect(guest().createWebsiteBooking(request())).resolves.toMatch(/^BSQ-/);
  });

  it("rejects parties the rooms can't sleep", async () => {
    await expect(guest().createWebsiteBooking(request({ adults: 5 }))).rejects.toMatchObject({ code: "TOO_MANY_GUESTS" });
    await expect(guest().createWebsiteBooking(request({ room: "standard-couple", adults: 3 }))).rejects.toMatchObject({ code: "TOO_MANY_GUESTS" });
  });

  it("rejects past dates and long stays", async () => {
    await expect(guest().createWebsiteBooking(request({ checkIn: addDays(today, -1), checkOut: addDays(today, 1) }))).rejects.toMatchObject({ code: "PAST_DATE" });
    await expect(guest().createWebsiteBooking(request({ checkOut: addDays(today, 80) }))).rejects.toMatchObject({ code: "BAD_DATES" });
  });

  it("throttles repeated website requests from the same contact", async () => {
    const phone = "+880 1700-111222";
    for (let i = 0; i < 3; i++) {
      await guest().createWebsiteBooking(request({ phone, room: "deluxe-couple", checkIn: addDays(today, 50 + i * 3), checkOut: addDays(today, 51 + i * 3) }));
    }
    await expect(guest().createWebsiteBooking(request({ phone, room: "deluxe-couple", checkIn: addDays(today, 70), checkOut: addDays(today, 71) }))).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("keeps guests away from front-desk data", async () => {
    await expect(guest().listBookings({ today })).rejects.toMatchObject({ code: "NOT_STAFF" });
  });

  it("restricts rates and settings to managers", async () => {
    await expect(desk().updateRoomType("rt-king", { price_bdt: 1 })).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    await expect(manager().updateRoomType("rt-king", { price_bdt: 6500, weekend_price_bdt: 9000 })).resolves.toBeUndefined();
  });
});

describe("front-desk lifecycle", () => {
  async function arrivingToday() {
    const ref = await desk().createStaffBooking({
      ...request({ checkIn: today, checkOut: addDays(today, 2), room: "deluxe-couple" }),
      notes: "",
      source: "phone",
      status: "confirmed",
    });
    return (await desk().getBooking(ref))!;
  }

  it("needs a room before check-in, then marks it dirty after check-out", async () => {
    const b = await arrivingToday();
    await expect(desk().setStatus(b.id, "checked_in")).rejects.toMatchObject({ code: "ASSIGN_ROOM" });

    const rooms = await desk().listRooms();
    // 101's previous guest left this morning; 103 is taken from tomorrow.
    await expect(desk().assignRoom(b.id, "room-103")).rejects.toMatchObject({ code: "ROOM_TAKEN" });
    const free = rooms.find((r) => r.room_type_id === b.room_type_id && r.number === "101")!;
    await desk().assignRoom(b.id, free.id);
    await desk().setStatus(b.id, "checked_in");
    await desk().setStatus(b.id, "checked_out");

    expect((await desk().listRooms()).find((r) => r.id === free.id)?.housekeeping).toBe("dirty");
    const events = await desk().bookingEvents(b.id);
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(["created", "room", "status"]));
  });

  it("won't give one room to two overlapping stays", async () => {
    const b = await arrivingToday();
    // Room 102 is occupied today in the preview seed.
    await expect(desk().assignRoom(b.id, "room-102")).rejects.toMatchObject({ code: "ROOM_TAKEN" });
  });

  it("won't assign a room of another type", async () => {
    const b = await arrivingToday();
    await expect(desk().assignRoom(b.id, "room-201")).rejects.toMatchObject({ code: "WRONG_ROOM_TYPE" });
  });

  it("refuses illegal status jumps", async () => {
    const ref = await guest().createWebsiteBooking(request());
    const b = (await desk().getBooking(ref))!;
    await expect(desk().setStatus(b.id, "checked_out")).rejects.toMatchObject({ code: "BAD_TRANSITION" });
    await expect(desk().setStatus(b.id, "no_show")).rejects.toMatchObject({ code: "BAD_TRANSITION" });
  });

  it("tracks payments against the total", async () => {
    const b = await arrivingToday(); // 2 Deluxe Couple nights: ৳7,000–9,000
    await desk().recordPayment(b.id, 5000, "cash", "");
    expect((await desk().getBooking(b.reference))?.payment_status).toBe("partial");
    await desk().recordPayment(b.id, 10600, "bkash", "TrxID 123");
    expect((await desk().getBooking(b.reference))?.payment_status).toBe("paid");
    await expect(desk().recordPayment(b.id, 0, "cash", "")).rejects.toMatchObject({ code: "BAD_AMOUNT" });
  });

  it("re-prices modifications and re-checks availability", async () => {
    const b = await arrivingToday();
    // New dates are re-priced night by night.
    await desk().modifyBooking(b.id, { room: "deluxe-couple", checkIn: today, checkOut: addDays(today, 3), rooms: 1, adults: 2, children: 0 });
    expect((await desk().getBooking(b.reference))?.total_bdt).toBe(stayCost(type("deluxe-couple"), today, addDays(today, 3)).total);
    // Switching type takes the new type's rates.
    const sun = sunday(addDays(today, 20));
    await desk().modifyBooking(b.id, { room: "connecting-queen-suite", checkIn: sun, checkOut: addDays(sun, 2), rooms: 1, adults: 2, children: 0 });
    expect(await desk().getBooking(b.reference)).toMatchObject({ nightly_rate_bdt: 5500, total_bdt: 11000, room_id: null });
  });

  it("keeps the agreed rate when only the party or room count changes", async () => {
    const b = (await desk().getBooking(await guest().createWebsiteBooking(request())))!;
    await manager().updateRoomType("rt-king", { price_bdt: 9000 }); // a later rate change doesn't touch it
    await desk().modifyBooking(b.id, { room: "connecting-king-suite", checkIn: b.check_in, checkOut: b.check_out, rooms: 2, adults: 5, children: 0 });
    expect(await desk().getBooking(b.reference)).toMatchObject({ nightly_rate_bdt: 6000, total_bdt: 36000 });
  });
});

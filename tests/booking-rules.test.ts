import { beforeEach, describe, expect, it } from "vitest";
import { addDays, hotelToday } from "@/lib/dates";
import { PreviewRepo } from "@/lib/data/preview-repo";
import { canTransition, guestsFit, overlaps } from "@/lib/data/rules";
import type { WebsiteBookingInput } from "@/lib/data/types";

const today = hotelToday();
const desk = () => new PreviewRepo({ name: "Test Desk", role: "front_desk" });
const manager = () => new PreviewRepo({ name: "Test Manager", role: "manager" });
const guest = () => new PreviewRepo();

function request(overrides: Partial<WebsiteBookingInput> = {}): WebsiteBookingInput {
  return {
    room: "king-suite",
    checkIn: addDays(today, 40),
    checkOut: addDays(today, 43),
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
    const ref = await guest().createWebsiteBooking(request());
    const b = await desk().getBooking(ref);
    expect(b).toMatchObject({ status: "pending", nightly_rate_bdt: 12500, total_bdt: 37500, payment_status: "unpaid" });
  });

  it("refuses to oversell a room type", async () => {
    // Two King Suites exist; a third overlapping request must fail.
    await guest().createWebsiteBooking(request());
    await guest().createWebsiteBooking(request());
    await expect(guest().createWebsiteBooking(request())).rejects.toMatchObject({ code: "SOLD_OUT" });
    // Back-to-back is fine.
    await expect(guest().createWebsiteBooking(request({ checkIn: addDays(today, 43), checkOut: addDays(today, 45) }))).resolves.toMatch(/^BSQ-/);
  });

  it("frees the units of a cancelled booking", async () => {
    const a = await guest().createWebsiteBooking(request());
    await guest().createWebsiteBooking(request());
    const booking = (await desk().getBooking(a))!;
    await desk().setStatus(booking.id, "cancelled", "Guest called");
    await expect(guest().createWebsiteBooking(request())).resolves.toMatch(/^BSQ-/);
  });

  it("rejects parties the rooms can't sleep", async () => {
    await expect(guest().createWebsiteBooking(request({ adults: 3 }))).rejects.toMatchObject({ code: "TOO_MANY_GUESTS" });
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
    await expect(desk().updateRoomType("rt-king", { price_bdt: 1 })).rejects.toMatchObject({ code: "NOT_MANAGER" });
    await expect(manager().updateRoomType("rt-king", { price_bdt: 13000 })).resolves.toBeUndefined();
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
    const b = await arrivingToday(); // 2 nights × 7,800
    await desk().recordPayment(b.id, 5000, "cash", "");
    expect((await desk().getBooking(b.reference))?.payment_status).toBe("partial");
    await desk().recordPayment(b.id, 10600, "bkash", "TrxID 123");
    expect((await desk().getBooking(b.reference))?.payment_status).toBe("paid");
    await expect(desk().recordPayment(b.id, 0, "cash", "")).rejects.toMatchObject({ code: "BAD_AMOUNT" });
  });

  it("re-prices modifications and re-checks availability", async () => {
    const b = await arrivingToday();
    await desk().modifyBooking(b.id, { room: "deluxe-couple", checkIn: today, checkOut: addDays(today, 3), rooms: 1, adults: 2, children: 0 });
    expect((await desk().getBooking(b.reference))?.total_bdt).toBe(3 * 7800);
    // Switching type takes the new type's rate.
    await desk().modifyBooking(b.id, { room: "business-queen-suite", checkIn: addDays(today, 20), checkOut: addDays(today, 22), rooms: 1, adults: 2, children: 0 });
    expect((await desk().getBooking(b.reference))).toMatchObject({ nightly_rate_bdt: 10500, total_bdt: 21000, room_id: null });
  });
});

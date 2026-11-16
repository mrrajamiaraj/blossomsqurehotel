import { beforeEach, describe, expect, it } from "vitest";
import { addDays, hotelToday, toDate } from "@/lib/dates";
import { PreviewRepo } from "@/lib/data/preview-repo";
import { PREVIEW_ROOM_TYPES } from "@/lib/data/preview-seed";

// Mirrors the rules in supabase/migrations/20261116000100_room_admin_and_photos.sql.

const today = hotelToday();
const sunday = (from: string) => addDays(from, (7 - toDate(from).getUTCDay()) % 7);
const far = sunday(addDays(today, 60));
const typeId = (slug: string) => PREVIEW_ROOM_TYPES.find((t) => t.slug === slug)!.id;
const manager = () => new PreviewRepo({ name: "Test Manager", role: "manager" });
const desk = () => new PreviewRepo({ name: "Test Desk", role: "front_desk" });
const guest = () => new PreviewRepo();

async function unitsOf(slug: string) {
  return (await manager().listRooms()).filter((r) => r.room_type_id === typeId(slug));
}

async function bookAll(slug: string) {
  const n = (await unitsOf(slug)).length;
  for (let i = 0; i < n; i++) {
    await guest().createWebsiteBooking({
      room: slug,
      checkIn: far,
      checkOut: addDays(far, 2),
      rooms: 1,
      adults: 1,
      children: 0,
      name: "Full House",
      email: `full${i}@example.test`,
      phone: `+880 1800000${i}`,
      country: "",
      arrival: "",
      requests: "",
      airportPickup: false,
    });
  }
}

beforeEach(() => {
  delete (globalThis as { __bsqPreview?: unknown }).__bsqPreview;
});

describe("room setup", () => {
  it("adds a room that is sold online straight away", async () => {
    const before = (await manager().availability(far, addDays(far, 1)))["premium-twin"];
    await manager().addRoom({ number: " 108 ", room_type_id: typeId("premium-twin"), floor: "1st" });
    const after = (await manager().availability(far, addDays(far, 1)))["premium-twin"];
    expect(after).toBe(before + 1);
    expect((await unitsOf("premium-twin")).some((r) => r.number === "108")).toBe(true);
  });

  it("rejects duplicate and malformed room numbers", async () => {
    await expect(manager().addRoom({ number: "101", room_type_id: typeId("deluxe-couple"), floor: null })).rejects.toThrow(
      "ROOM_EXISTS",
    );
    await expect(manager().addRoom({ number: "1 01!", room_type_id: typeId("deluxe-couple"), floor: null })).rejects.toThrow(
      "BAD_ROOM_NUMBER",
    );
  });

  it("only lets managers change room setup", async () => {
    await expect(desk().addRoom({ number: "999", room_type_id: typeId("deluxe-couple"), floor: null })).rejects.toThrow(
      "NOT_MANAGER",
    );
  });

  it("renames a room", async () => {
    const [room] = await unitsOf("honeymoon-couple");
    await manager().editRoom(room.id, { number: "h1", room_type_id: room.room_type_id, floor: "1st" });
    expect((await unitsOf("honeymoon-couple"))[0].number).toBe("H1");
  });

  it("won't remove a room that existing bookings need", async () => {
    // A fresh room has no booking history, so only the inventory rule applies.
    const added = await manager().addRoom({ number: "H2", room_type_id: typeId("honeymoon-couple"), floor: null });
    await bookAll("honeymoon-couple");
    await expect(manager().deleteRoom(added)).rejects.toThrow("ROOM_NEEDED");
    await expect(
      manager().editRoom(added, { number: "H2", room_type_id: typeId("deluxe-couple"), floor: null }),
    ).rejects.toThrow("ROOM_NEEDED");
  });

  it("keeps rooms with booking history", async () => {
    const history = (await manager().bookingsBetween(addDays(today, -60), addDays(today, 60))).find((b) => b.room_id);
    expect(history).toBeDefined();
    await expect(manager().deleteRoom(history!.room_id!)).rejects.toThrow("ROOM_IN_USE");
  });

  it("removes a spare room", async () => {
    const added = await manager().addRoom({ number: "500", room_type_id: typeId("premium-twin"), floor: null });
    await manager().deleteRoom(added);
    expect((await unitsOf("premium-twin")).some((r) => r.id === added)).toBe(false);
  });
});

describe("room photos", () => {
  it("reorders and removes gallery entries", async () => {
    const t = PREVIEW_ROOM_TYPES.find((x) => x.slug === "deluxe-couple")!;
    const [a, b, c] = t.gallery;
    await manager().updateRoomType(t.id, { gallery: [c, a] });
    const saved = (await manager().listRoomTypes({ includeUnpublished: true })).find((x) => x.id === t.id)!;
    expect(saved.gallery).toEqual([c, a]);
    expect(saved.gallery).not.toContain(b);
  });
});

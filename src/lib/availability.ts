import "server-only";
import { getPublicRepo } from "./data";
import type { Room } from "./rooms";

export type Availability = {
  /** False when there's no database to ask; nothing is shown as sold out then. */
  live: boolean;
  bySlug: Record<string, number>;
};

export async function getAvailability(rooms: Room[], checkIn: string, checkOut: string): Promise<Availability> {
  const unknown = { live: false, bySlug: Object.fromEntries(rooms.map((r) => [r.slug, 1])) };
  const repo = getPublicRepo();
  if (!repo) return unknown;
  try {
    return { live: true, bySlug: await repo.availability(checkIn, checkOut) };
  } catch (err) {
    console.error("Availability check failed:", err);
    return unknown;
  }
}

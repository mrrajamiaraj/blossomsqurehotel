import "server-only";
import { getPublicRepo } from "./data";
import { DEFAULT_SETTINGS } from "./data/repo";
import { PREVIEW_ROOM_TYPES } from "./data/preview-seed";
import type { HotelSettings, RoomTypeRecord } from "./data/types";
import { photo, type Photo, type Tone } from "./photos";

export type Room = Omit<RoomTypeRecord, "gallery"> & { gallery: Photo[] };

const TONES: Tone[] = ["forest", "sea", "dusk"];

// Offsetting tones per room keeps placeholder covers distinct from each other.
function withPhotos(row: RoomTypeRecord, index: number): Room {
  return {
    ...row,
    gallery: row.gallery.map((ref, i) =>
      photo(ref, i === 0 ? `${row.name} bedroom` : `${row.name}, view ${i + 1}`, TONES[(i + index) % TONES.length]),
    ),
  };
}

/**
 * Published room types, in the hotel's chosen order. Falls back to the
 * built-in room list when no database is available, so the site still renders.
 */
export async function getRooms(): Promise<Room[]> {
  const repo = getPublicRepo();
  let rows: RoomTypeRecord[] = [];
  if (repo) {
    try {
      rows = await repo.listRoomTypes();
    } catch (err) {
      console.error("Failed to load room types:", err);
    }
  }
  return (rows.length ? rows : PREVIEW_ROOM_TYPES).map(withPhotos);
}

export async function getRoom(slug: string): Promise<Room | null> {
  return (await getRooms()).find((r) => r.slug === slug) ?? null;
}

export async function getSettings(): Promise<HotelSettings> {
  const repo = getPublicRepo();
  if (!repo) return DEFAULT_SETTINGS;
  try {
    return await repo.getSettings();
  } catch {
    return DEFAULT_SETTINGS;
  }
}

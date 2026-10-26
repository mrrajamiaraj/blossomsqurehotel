import "server-only";
import { addDays, nightsBetween } from "../dates";
import { paymentStatus } from "./rules";
import type { Booking, BookingEvent, BookingSource, BookingStatus, RoomTypeRecord, RoomUnit, StaffMember } from "./types";

// Sample data for the development-only preview. Never used when Supabase is
// configured, and never in production builds. Mirrors the migration seeds.

export const PREVIEW_ROOM_TYPES: RoomTypeRecord[] = [
  {
    id: "rt-king",
    slug: "king-suite",
    name: "King Suite",
    tag: "SUITE",
    bed: "Double bed",
    size_sqft: null,
    sleeps: 2,
    floor: "Second floor",
    view: "Sea",
    price_bdt: 12500,
    blurb: "Our largest room, with a private balcony looking straight out over the Bay of Bengal.",
    description:
      "Our largest room. Wake up to the bay from bed, take coffee on the private balcony, and walk to the beach in minutes. Breakfast for two and pool access are included.",
    features: ["Double bed", "Balcony", "Sea view"],
    gallery: ["DSC5566", "DSC5565", "WA0013"],
    sort_order: 1,
    is_published: true,
  },
  {
    id: "rt-queen",
    slug: "business-queen-suite",
    name: "Business Queen Suite",
    tag: "SUITE",
    bed: "Queen bed",
    size_sqft: null,
    sleeps: 2,
    floor: "Second floor",
    view: "Sea",
    price_bdt: 10500,
    blurb: "A calm suite with room to work, for trips that mix meetings with an evening by the sea.",
    description:
      "A quiet second-floor suite with a proper work desk and fast Wi-Fi, for trips that mix meetings with an evening by the sea. Breakfast for two and pool access are included.",
    features: ["Queen bed", "Work desk", "Sea view"],
    gallery: ["DSC5579", "DSC5578", "WA0018"],
    sort_order: 2,
    is_published: true,
  },
  {
    id: "rt-deluxe",
    slug: "deluxe-couple",
    name: "Deluxe Couple",
    tag: "DELUXE",
    bed: "Double bed",
    size_sqft: null,
    sleeps: 2,
    floor: "Sea-facing",
    view: "Sea",
    price_bdt: 7800,
    blurb:
      "Everything you need for two: a sea view from bed, a balcony for sunset, a mini bar and breakfast downstairs.",
    description:
      "Everything you need for two: a sea view from bed, a balcony for sunset, a mini bar, and breakfast downstairs every morning. Pool access is included.",
    features: ["Double bed", "Balcony", "Sea view"],
    gallery: ["DSC5550", "DSC5551", "DSC5552"],
    sort_order: 3,
    is_published: true,
  },
];

export const PREVIEW_ROOMS: RoomUnit[] = [
  ["201", "rt-king", "2nd"],
  ["202", "rt-king", "2nd"],
  ["203", "rt-queen", "2nd"],
  ["204", "rt-queen", "2nd"],
  ["101", "rt-deluxe", "1st"],
  ["102", "rt-deluxe", "1st"],
  ["103", "rt-deluxe", "1st"],
].map(([number, type, floor]) => ({
  id: `room-${number}`,
  number,
  room_type_id: type,
  floor,
  housekeeping: "clean",
  out_of_service: false,
  service_note: null,
}));

export const PREVIEW_STAFF: StaffMember[] = [
  { user_id: "preview-manager", full_name: "Preview Manager", role: "manager", active: true, email: "manager@preview.local" },
  { user_id: "preview-desk", full_name: "Front Desk (preview)", role: "front_desk", active: true, email: "desk@preview.local" },
];

type SeedRow = {
  name: string;
  phone: string;
  email: string | null;
  type: string;
  room: string | null;
  in: number;
  out: number;
  status: BookingStatus;
  source: BookingSource;
  createdHoursAgo: number;
  paid?: number;
  adults?: number;
  children?: number;
  requests?: string;
  reason?: string;
};

const ROWS: SeedRow[] = [
  { name: "Sadia Karim", phone: "+880 1711-204118", email: "sadia.karim@example.com", type: "rt-king", room: "201", in: -2, out: 1, status: "checked_in", source: "website", createdHoursAgo: 240, paid: 12500 },
  { name: "Tanvir Islam", phone: "+880 1819-552031", email: "tanvir.islam@example.com", type: "rt-queen", room: "203", in: -1, out: 0, status: "checked_in", source: "phone", createdHoursAgo: 72, paid: 10500 },
  { name: "Farzana Begum", phone: "+880 1552-781902", email: "farzana.b@example.com", type: "rt-deluxe", room: "101", in: -3, out: 0, status: "checked_out", source: "website", createdHoursAgo: 300, paid: 23400 },
  { name: "Jahid Sarkar", phone: "+880 1713-660245", email: "jahid.sarkar@example.com", type: "rt-deluxe", room: "102", in: 0, out: 3, status: "confirmed", source: "website", createdHoursAgo: 120, requests: "Late arrival, around 10 PM." },
  { name: "Mahmud Rahman", phone: "+880 1918-034477", email: null, type: "rt-king", room: null, in: 0, out: 2, status: "confirmed", source: "phone", createdHoursAgo: 30, adults: 2, children: 1 },
  { name: "Nabila Ali", phone: "+880 1730-118842", email: "nabila.ali@example.com", type: "rt-queen", room: null, in: 0, out: 2, status: "pending", source: "website", createdHoursAgo: 0.7 },
  { name: "Nusrat Jahan", phone: "+880 1712-904563", email: "nusrat.jahan@example.com", type: "rt-king", room: null, in: 4, out: 7, status: "pending", source: "website", createdHoursAgo: 2, requests: "Honeymoon trip, flowers in the room if possible." },
  { name: "Farhana Akter", phone: "+880 1556-230981", email: "farhana.akter@example.com", type: "rt-deluxe", room: null, in: 7, out: 10, status: "pending", source: "website", createdHoursAgo: 0.2 },
  { name: "Rahim & Co. (A. Rahim)", phone: "+880 1817-445600", email: "travel@rahimco.example.com", type: "rt-queen", room: "204", in: 2, out: 6, status: "confirmed", source: "phone", createdHoursAgo: 80, paid: 20000 },
  { name: "Dipankar Roy", phone: "+880 1611-772310", email: "d.roy@example.com", type: "rt-deluxe", room: "103", in: 1, out: 4, status: "confirmed", source: "website", createdHoursAgo: 50 },
  { name: "Ayesha Chowdhury", phone: "+880 1755-019284", email: "ayesha.c@example.com", type: "rt-king", room: "202", in: -9, out: -6, status: "checked_out", source: "website", createdHoursAgo: 500, paid: 37500 },
  { name: "Kamal Hasan", phone: "+880 1915-660372", email: null, type: "rt-deluxe", room: "103", in: -12, out: -8, status: "checked_out", source: "walk_in", createdHoursAgo: 290, paid: 31200 },
  { name: "Imran Hossain", phone: "+880 1720-338104", email: "imran.h@example.com", type: "rt-queen", room: null, in: 3, out: 5, status: "cancelled", source: "website", createdHoursAgo: 96, reason: "Change of travel plans" },
  { name: "Shakil Haque", phone: "+880 1630-902457", email: "shakil.haque@example.com", type: "rt-deluxe", room: null, in: -4, out: -2, status: "no_show", source: "website", createdHoursAgo: 170 },
  { name: "Rafiq Uddin", phone: "+880 1714-288910", email: "rafiq.uddin@example.com", type: "rt-queen", room: "204", in: -6, out: -3, status: "checked_out", source: "website", createdHoursAgo: 260, paid: 31500 },
  { name: "Tania Akter", phone: "+880 1876-553201", email: "tania.akter@example.com", type: "rt-deluxe", room: "102", in: -7, out: -4, status: "checked_out", source: "phone", createdHoursAgo: 210, paid: 23400 },
];

export function buildPreviewBookings(today: string): { bookings: Booking[]; events: BookingEvent[] } {
  const now = Date.now();
  const bookings: Booking[] = [];
  const events: BookingEvent[] = [];
  let eventId = 1;

  ROWS.forEach((row, i) => {
    const type = PREVIEW_ROOM_TYPES.find((t) => t.id === row.type)!;
    const checkIn = addDays(today, row.in);
    const checkOut = addDays(today, row.out);
    const nights = nightsBetween(checkIn, checkOut);
    const total = type.price_bdt * nights;
    const created = new Date(now - row.createdHoursAgo * 3_600_000).toISOString();
    const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
    const confirmed = row.status !== "pending" && row.status !== "cancelled" ? at(row.createdHoursAgo * 0.8) : null;
    const id = `bk-${i + 1}`;
    const paid = row.paid ?? 0;

    bookings.push({
      id,
      reference: `BSQ-${String(24800 + i * 7).padStart(5, "0")}`,
      room_type_id: type.id,
      room_id: row.room ? `room-${row.room}` : null,
      rooms: 1,
      check_in: checkIn,
      check_out: checkOut,
      adults: row.adults ?? 2,
      children: row.children ?? 0,
      guest_name: row.name,
      email: row.email,
      phone: row.phone,
      country: "Bangladesh",
      arrival_window: row.source === "website" ? "2 PM – 4 PM" : null,
      special_requests: row.requests ?? null,
      internal_notes: null,
      airport_pickup: i === 3,
      source: row.source,
      nightly_rate_bdt: type.price_bdt,
      total_bdt: total,
      amount_paid_bdt: paid,
      payment_status: paymentStatus(paid, total),
      status: row.status,
      cancel_reason: row.reason ?? null,
      confirmed_at: confirmed,
      checked_in_at: row.status === "checked_in" || row.status === "checked_out" ? at(Math.max(1, -row.in * 24 - 14)) : null,
      checked_out_at: row.status === "checked_out" ? at(Math.max(0.5, -row.out * 24 - 11)) : null,
      cancelled_at: row.status === "cancelled" || row.status === "no_show" ? at(row.createdHoursAgo / 2) : null,
      created_at: created,
      updated_at: created,
    });

    const actor = row.source === "website" ? "Guest (website)" : "Front Desk (preview)";
    events.push({ id: eventId++, booking_id: id, kind: "created", detail: { source: row.source, status: "pending" }, actor_name: actor, created_at: created });
    if (confirmed) {
      events.push({ id: eventId++, booking_id: id, kind: "status", detail: { from: "pending", to: "confirmed" }, actor_name: "Preview Manager", created_at: confirmed });
    }
    if (paid) {
      events.push({ id: eventId++, booking_id: id, kind: "payment", detail: { amount: paid, method: i % 2 ? "bkash" : "cash", note: "" }, actor_name: "Front Desk (preview)", created_at: confirmed ?? created });
    }
    if (row.status === "cancelled" || row.status === "no_show") {
      events.push({ id: eventId++, booking_id: id, kind: "status", detail: { from: "confirmed", to: row.status, reason: row.reason ?? null }, actor_name: "Preview Manager", created_at: at(row.createdHoursAgo / 2) });
    }
  });

  return { bookings, events };
}

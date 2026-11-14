import "server-only";
import { addDays } from "../dates";
import { stayCost } from "../pricing";
import { paymentStatus } from "./rules";
import type { Booking, BookingEvent, BookingSource, BookingStatus, RoomTypeRecord, RoomUnit, StaffMember } from "./types";

// Sample data for the development-only preview. Never used when Supabase is
// configured, and never in production builds. Mirrors the migration seeds.

// The hotel's room lineup and tariff (published rate, then weekday / weekend
// discounted rates). Keep in step with
// supabase/migrations/20261114000000_rates_and_room_lineup.sql.
const ROOM_BASICS = ["Private bathroom", "Wi-Fi", "TV", "Air conditioning", "Geyser (hot water)", "Work desk"];

type Lineup = Omit<RoomTypeRecord, "size_sqft" | "floor" | "view" | "is_published">;

const LINEUP: Lineup[] = [
  {
    id: "rt-standard",
    slug: "standard-couple",
    name: "Standard Couple",
    tag: "DELUXE",
    bed: "Queen-size bed",
    sleeps: 2,
    rack_price_bdt: 3500,
    price_bdt: 2500,
    weekend_price_bdt: 3500,
    blurb: "A comfortable room for two with a queen-size bed, private bathroom and everything you need for a beach break.",
    description:
      "A comfortable room for two: a queen-size bed, a private bathroom with hot water, air conditioning, TV, Wi-Fi and a work desk. Kolatoli beach is a short walk away.",
    features: ["Queen-size bed", ...ROOM_BASICS],
    gallery: ["DSC5579", "DSC5578"],
    sort_order: 1,
  },
  {
    id: "rt-deluxe",
    slug: "deluxe-couple",
    name: "Deluxe Couple",
    tag: "DELUXE",
    bed: "Queen-size bed",
    sleeps: 2,
    rack_price_bdt: 5000,
    price_bdt: 3500,
    weekend_price_bdt: 4500,
    blurb: "A roomier couple's room with a queen-size bed, soft lighting and a private bathroom.",
    description:
      "A roomier couple's room with a queen-size bed, a private bathroom with hot water, air conditioning, TV, Wi-Fi and a work desk.",
    features: ["Queen-size bed", ...ROOM_BASICS],
    gallery: ["DSC5551", "DSC5552", "DSC5555"],
    sort_order: 2,
  },
  {
    id: "rt-honeymoon",
    slug: "honeymoon-couple",
    name: "Honeymoon Couple",
    tag: "DELUXE",
    bed: "Queen-size bed",
    sleeps: 2,
    rack_price_bdt: 6000,
    price_bdt: 4000,
    weekend_price_bdt: 5500,
    blurb: "Our room for celebrations: a queen-size bed, warm lighting and a little extra care for the two of you.",
    description:
      "Our room for honeymoons and anniversaries: a queen-size bed, a private bathroom with hot water, air conditioning, TV, Wi-Fi and a work desk. Tell us what you're celebrating when you book.",
    features: ["Queen-size bed", ...ROOM_BASICS],
    gallery: ["DSC5550", "DSC5555"],
    sort_order: 3,
  },
  {
    id: "rt-family",
    slug: "executive-family-suite",
    name: "Executive Family Suite",
    tag: "SUITE",
    bed: "Two queen-size beds + one single bed",
    sleeps: 5,
    rack_price_bdt: 12000,
    price_bdt: 7000,
    weekend_price_bdt: 10000,
    blurb: "Space for the whole family: two queen-size beds, a single bed, two private bathrooms and a balcony.",
    description:
      "Our largest suite, made for families: two queen-size beds and a single bed, two private bathrooms with hot water, a balcony, air conditioning, TV, Wi-Fi and a work desk.",
    features: ["Two queen-size beds", "One single bed", "Two private bathrooms", "Balcony", "Wi-Fi", "TV", "Air conditioning", "Geyser (hot water)", "Work desk"],
    gallery: ["DSC5565", "DSC5575"],
    sort_order: 4,
  },
  {
    id: "rt-king",
    slug: "connecting-king-suite",
    name: "Connecting King Suite",
    tag: "SUITE",
    bed: "Two king-size beds",
    sleeps: 4,
    rack_price_bdt: 10000,
    price_bdt: 6000,
    weekend_price_bdt: 8500,
    blurb: "Two king-size beds and a balcony, for families or friends travelling together.",
    description:
      "Two king-size beds, a private bathroom with hot water and a balcony, with air conditioning, TV, Wi-Fi and a work desk. Ideal for families or friends travelling together.",
    features: ["Two king-size beds", "Private bathroom", "Balcony", "Wi-Fi", "TV", "Air conditioning", "Geyser (hot water)", "Work desk"],
    gallery: ["DSC5566", "DSC5565", "WA0013"],
    sort_order: 5,
  },
  {
    id: "rt-queen",
    slug: "connecting-queen-suite",
    name: "Connecting Queen Suite",
    tag: "SUITE",
    bed: "Two queen-size beds",
    sleeps: 4,
    rack_price_bdt: 9000,
    price_bdt: 5500,
    weekend_price_bdt: 7500,
    blurb: "Two queen-size beds and a balcony: room for four without booking two rooms.",
    description:
      "Two queen-size beds, a private bathroom with hot water and a balcony, with air conditioning, TV, Wi-Fi and a work desk. Room for four without booking two rooms.",
    features: ["Two queen-size beds", "Private bathroom", "Balcony", "Wi-Fi", "TV", "Air conditioning", "Geyser (hot water)", "Work desk"],
    gallery: ["WA0018", "DSC5578"],
    sort_order: 6,
  },
  {
    id: "rt-twin",
    slug: "premium-twin",
    name: "Premium Twin",
    tag: "DELUXE",
    bed: "One queen-size bed + one single bed",
    sleeps: 3,
    rack_price_bdt: 7000,
    price_bdt: 5000,
    weekend_price_bdt: 6000,
    blurb: "A queen-size bed plus a single, for friends, a parent and child, or a small family.",
    description:
      "One queen-size bed and one single bed, a private bathroom with hot water, air conditioning, TV, Wi-Fi and a work desk. Good for friends, a parent and child, or a small family.",
    features: ["One queen-size bed", "One single bed", ...ROOM_BASICS],
    gallery: ["DSC5575", "DSC5562"],
    sort_order: 7,
  },
];

export const PREVIEW_ROOM_TYPES: RoomTypeRecord[] = LINEUP.map((t) => ({
  ...t,
  size_sqft: null,
  floor: "",
  view: "",
  is_published: true,
}));

// Sample unit numbers for the preview; the real inventory lives in the database.
export const PREVIEW_ROOMS: RoomUnit[] = [
  ["101", "rt-deluxe", "1st"],
  ["102", "rt-deluxe", "1st"],
  ["103", "rt-deluxe", "1st"],
  ["104", "rt-standard", "1st"],
  ["105", "rt-standard", "1st"],
  ["106", "rt-honeymoon", "1st"],
  ["107", "rt-twin", "1st"],
  ["201", "rt-king", "2nd"],
  ["202", "rt-king", "2nd"],
  ["203", "rt-queen", "2nd"],
  ["204", "rt-queen", "2nd"],
  ["301", "rt-family", "3rd"],
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
    const cost = stayCost(type, checkIn, checkOut);
    const total = cost.total;
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
      nightly_rate_bdt: cost.average,
      total_bdt: total,
      amount_paid_bdt: Math.min(paid, total),
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

  const history = buildHistory(today, eventId);
  bookings.push(...history.bookings);
  events.push(...history.events);

  return { bookings, events };
}

/* ---------- Five months of past stays, so Reports has something to show ---------- */

const HISTORY_GUESTS: [string, string, string | null][] = [
  ["Arif Mahmud", "+880 1711-300101", "arif.m@example.com"],
  ["Shirin Sultana", "+880 1812-300202", "shirin.s@example.com"],
  ["Mehedi Hasan", "+880 1913-300303", null],
  ["Rumana Ahmed", "+880 1714-300404", "rumana.a@example.com"],
  ["Sabbir Khan", "+880 1615-300505", "sabbir.khan@example.com"],
  ["Lamia Rahman", "+880 1716-300606", "lamia.r@example.com"],
  ["Habib Ullah", "+880 1817-300707", null],
  ["Tasnim Ferdous", "+880 1518-300808", "tasnim.f@example.com"],
  ["Rezaul Karim", "+880 1719-300909", "rezaul.k@example.com"],
  ["Moushumi Das", "+880 1820-301010", "moushumi.d@example.com"],
  ["Anwar Hossain", "+880 1921-301111", null],
  ["Priya Saha", "+880 1722-301212", "priya.saha@example.com"],
  ["Zahid Hasan", "+880 1623-301313", "zahid.h@example.com"],
  ["Nadia Islam", "+880 1724-301414", "nadia.islam@example.com"],
  ["Kazi Faisal", "+880 1825-301515", "kazi.faisal@example.com"],
  ["Sharmin Akhter", "+880 1526-301616", null],
  ["Omar Faruk", "+880 1727-301717", "omar.faruk@example.com"],
  ["Jannatul Ferdous", "+880 1828-301818", "jannatul.f@example.com"],
  ["Rakib Hasan", "+880 1929-301919", "rakib.h@example.com"],
  ["Sumaiya Khatun", "+880 1730-302020", "sumaiya.k@example.com"],
  ["Corporate: Delta Pharma", "+880 1711-302121", "travel@deltapharma.example.com"],
  ["Corporate: Bay Telecom", "+880 1811-302222", "admin@baytelecom.example.com"],
];

/** Small deterministic PRNG so the preview looks the same on every restart. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildHistory(today: string, firstEventId: number): { bookings: Booking[]; events: BookingEvent[] } {
  const rand = mulberry32(20261027);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
  const start = addDays(today, -150);
  // The hand-written rows above use the last 12 days; history stops before them.
  const lastNight = addDays(today, -14);
  const made: Omit<Booking, "id" | "reference">[] = [];

  for (const room of PREVIEW_ROOMS) {
    const type = PREVIEW_ROOM_TYPES.find((t) => t.id === room.room_type_id)!;
    let d = lastNight;
    while (d >= start) {
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      // Thu, Fri and Sat nights fill best at a beach hotel in Bangladesh.
      const p = dow === 4 || dow === 5 || dow === 6 ? 0.78 : 0.42;
      if (rand() >= p) {
        d = addDays(d, -1);
        continue;
      }
      const len = 1 + Math.floor(rand() * rand() * 5);
      const checkOut = addDays(d, 1);
      const checkIn = addDays(d, -(len - 1));
      if (checkIn < start) break;
      d = addDays(checkIn, -1);

      const r = rand();
      const source: BookingSource = r < 0.56 ? "website" : r < 0.84 ? "phone" : r < 0.95 ? "walk_in" : "other";
      const lead = source === "walk_in" ? 0 : Math.floor(rand() * rand() * 45);
      const created = new Date(`${addDays(checkIn, -lead)}T${String(3 + Math.floor(rand() * 12)).padStart(2, "0")}:15:00Z`).toISOString();
      const [name, phone, email] = pick(HISTORY_GUESTS);
      const fate = rand();
      const status: BookingStatus = source !== "walk_in" && fate < 0.07 ? "cancelled" : source !== "walk_in" && fate < 0.11 ? "no_show" : "checked_out";
      const sold = status === "checked_out";
      const listed = stayCost(type, checkIn, checkOut);
      const rate = listed.average - (rand() < 0.2 ? Math.round(listed.average * 0.1) : 0);
      const total = rate * len;
      const isoAt = (day: string, h: number) => `${day}T${String(h).padStart(2, "0")}:00:00.000Z`;

      made.push({
        room_type_id: type.id,
        room_id: sold ? room.id : null,
        rooms: 1,
        check_in: checkIn,
        check_out: checkOut,
        adults: 2,
        children: rand() < 0.2 ? 1 : 0,
        guest_name: name,
        email,
        phone,
        country: "Bangladesh",
        arrival_window: source === "website" ? "2 PM – 4 PM" : null,
        special_requests: null,
        internal_notes: null,
        airport_pickup: rand() < 0.15,
        source,
        nightly_rate_bdt: rate,
        total_bdt: total,
        amount_paid_bdt: sold ? total : 0,
        payment_status: paymentStatus(sold ? total : 0, total),
        status,
        cancel_reason: status === "cancelled" ? pick(["Change of travel plans", "Booked elsewhere", "Family emergency"]) : null,
        confirmed_at: status === "cancelled" && fate < 0.03 ? null : created,
        checked_in_at: sold ? isoAt(checkIn, 8) : null,
        checked_out_at: sold ? isoAt(checkOut, 5) : null,
        cancelled_at: sold ? null : isoAt(addDays(checkIn, status === "no_show" ? 1 : -1), 6),
        created_at: created,
        updated_at: created,
      });
    }
  }

  made.sort((a, b) => a.check_in.localeCompare(b.check_in));
  const bookings: Booking[] = made.map((b, i) => ({ ...b, id: `bk-h${i + 1}`, reference: `BSQ-${20000 + i * 3}` }));
  let eventId = firstEventId;
  const events: BookingEvent[] = [];
  for (const b of bookings) {
    events.push({ id: eventId++, booking_id: b.id, kind: "created", detail: { source: b.source, status: "pending" }, actor_name: b.source === "website" ? "Guest (website)" : "Front Desk (preview)", created_at: b.created_at });
    if (b.status !== "checked_out") {
      events.push({ id: eventId++, booking_id: b.id, kind: "status", detail: { from: "confirmed", to: b.status, reason: b.cancel_reason }, actor_name: "Preview Manager", created_at: b.cancelled_at! });
    } else {
      events.push({ id: eventId++, booking_id: b.id, kind: "payment", detail: { amount: b.total_bdt, method: "cash", note: "" }, actor_name: "Front Desk (preview)", created_at: b.checked_out_at! });
    }
  }
  return { bookings, events };
}

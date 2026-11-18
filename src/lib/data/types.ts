// Domain records, mirroring the tables in supabase/migrations.

export type BookingStatus = "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
export type PaymentStatus = "unpaid" | "partial" | "paid";
export type BookingSource = "website" | "phone" | "walk_in" | "other";
/** Set by staff. "Occupied" and "Out of service" are derived (a checked-in guest / the room's service flag). */
export type Housekeeping = "dirty" | "cleaning" | "clean" | "inspected";
export type { StaffRole } from "../access";
import type { StaffRole } from "../access";
export type PaymentMethod = "cash" | "bkash" | "nagad" | "card" | "bank" | "other";

export type RoomTypeRecord = {
  id: string;
  slug: string;
  name: string;
  tag: "SUITE" | "DELUXE";
  bed: string;
  size_sqft: number | null;
  sleeps: number;
  floor: string;
  view: string;
  /** Weekday (Sun–Wed night) rate. */
  price_bdt: number;
  /** Thursday and Friday night rate; null means the weekday rate applies every night. */
  weekend_price_bdt: number | null;
  /** Published ("rack") rate, shown crossed out next to the discounted price. */
  rack_price_bdt: number | null;
  blurb: string;
  description: string;
  features: string[];
  gallery: string[];
  sort_order: number;
  is_published: boolean;
};

export type RoomUnit = {
  id: string;
  number: string;
  room_type_id: string;
  floor: string | null;
  housekeeping: Housekeeping;
  out_of_service: boolean;
  service_note: string | null;
};

export type Booking = {
  id: string;
  reference: string;
  room_type_id: string;
  room_id: string | null;
  rooms: number;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  guest_name: string;
  email: string | null;
  phone: string;
  country: string | null;
  arrival_window: string | null;
  special_requests: string | null;
  internal_notes: string | null;
  airport_pickup: boolean;
  source: BookingSource;
  nightly_rate_bdt: number;
  total_bdt: number;
  amount_paid_bdt: number;
  payment_status: PaymentStatus;
  status: BookingStatus;
  cancel_reason: string | null;
  confirmed_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  /* Booking engine (20261118120000). Optional: the preview store omits them. */
  /** Room charges before discount and taxes. */
  subtotal_bdt?: number | null;
  discount_bdt?: number;
  service_charge_bdt?: number;
  vat_bdt?: number;
  payment_option?: "pay_at_hotel" | "advance" | "online";
  advance_due_bdt?: number;
  payment_due_at?: string | null;
  /** The quote the total came from (night-by-night rates, promotion, tax rates). */
  price_detail?: { taxes_pending?: boolean; service_charge_percent?: number | null; vat_percent?: number | null; promotion?: { code: string; name: string } | null } | null;
};

/** One reserved room of a booking (booking_rooms). */
export type BookingLine = {
  id: string;
  booking_id: string;
  line_no: number | null;
  room_type_id: string;
  room_id: string | null;
  check_in: string;
  check_out: string;
  active: boolean;
  subtotal_bdt: number | null;
};

/** A guest's cancellation or date-change request from the website. */
export type BookingRequest = {
  id: string;
  booking_id: string;
  kind: "cancel" | "change";
  status: "open" | "done" | "declined";
  detail: { reason?: string; check_in?: string; check_out?: string; note?: string; available_when_requested?: boolean };
  created_at: string;
  handled_at: string | null;
};

export type BookingEvent = {
  id: number;
  booking_id: string;
  kind: "created" | "status" | "room" | "modified" | "payment" | "details" | "message" | "consent";
  detail: Record<string, unknown>;
  actor_name: string;
  created_at: string;
};

export type ActivityItem = BookingEvent & { reference: string; guest_name: string };

export type HotelSettings = {
  cancellation_policy: string;
  children_policy: string;
  confirm_call_within: string;
  vat_percent: number | null;
  service_charge_percent: number | null;
  /** Share of the total asked as an advance (null = guests only pay at the hotel). */
  advance_percent?: number | null;
  /** Most that offers together may take off the room charges, in percent. */
  max_discount_percent?: number;
};

export type StaffMember = {
  user_id: string;
  full_name: string;
  role: StaffRole;
  active: boolean;
  email?: string | null;
};

export type GuestSummary = {
  key: string;
  guest_name: string;
  email: string | null;
  phone: string;
  stays: number;
  nights: number;
  spend_bdt: number;
  last_check_in: string;
  upcoming: boolean;
};

/** What a guest sees when they look up their own booking. No notes, no full contact details. */
export type GuestBookingView = {
  reference: string;
  status: BookingStatus;
  room_name: string;
  check_in: string;
  check_out: string;
  rooms: number;
  adults: number;
  children: number;
  total_bdt: number;
  amount_paid_bdt: number;
  payment_status: PaymentStatus;
  /** First name only. */
  guest_name: string;
  created_at: string;
};

export type InquiryKind = "general" | "booking" | "dining" | "event" | "group" | "other";
export type InquiryStatus = "new" | "handled" | "spam";

export type Inquiry = {
  id: string;
  reference: string;
  kind: InquiryKind;
  name: string;
  email: string | null;
  phone: string | null;
  message: string;
  event_date: string | null;
  guests: number | null;
  status: InquiryStatus;
  handled_at: string | null;
  created_at: string;
};

/* ---------- Inputs ---------- */

export type InquiryInput = {
  kind: InquiryKind;
  name: string;
  email: string | null;
  phone: string | null;
  message: string;
  eventDate: string | null;
  guests: number | null;
};

export type WebsiteBookingInput = {
  room: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
  name: string;
  email: string;
  phone: string;
  country: string;
  arrival: string;
  requests: string;
  airportPickup: boolean;
};

export type StaffBookingInput = Omit<WebsiteBookingInput, "email" | "arrival"> & {
  email: string | null;
  notes: string;
  source: Exclude<BookingSource, "website">;
  status: "pending" | "confirmed";
};

export type BookingChange = {
  room: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
};

export type GuestDetails = {
  name: string;
  email: string | null;
  phone: string;
  arrival: string | null;
  requests: string | null;
  notes: string | null;
  airportPickup: boolean;
};

export type BookingFilter = {
  q?: string;
  view?: BookingView;
  page?: number;
  pageSize?: number;
  today: string;
};

export type BookingView = "active" | "requests" | "arrivals" | "in_house" | "departures" | "upcoming" | "past" | "cancelled" | "all";

export type RoomTypePatch = Partial<
  Pick<
    RoomTypeRecord,
    | "price_bdt" | "weekend_price_bdt" | "rack_price_bdt" | "is_published" | "blurb" | "description" | "size_sqft" | "gallery"
    | "name" | "bed" | "sleeps" | "tag" | "features" | "view" | "floor" | "sort_order"
  >
>;
/** A room's identity: its number, type and floor. */
export type RoomUnitInput = { number: string; room_type_id: string; floor: string | null };
export type RoomPatch = Partial<Pick<RoomUnit, "housekeeping" | "out_of_service" | "service_note">>;

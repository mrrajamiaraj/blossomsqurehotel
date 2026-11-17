// Domain records, mirroring the tables in supabase/migrations.

export type BookingStatus = "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
export type PaymentStatus = "unpaid" | "partial" | "paid";
export type BookingSource = "website" | "phone" | "walk_in" | "other";
export type Housekeeping = "clean" | "dirty" | "inspected";
export type StaffRole = "manager" | "front_desk";
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
};

export type BookingEvent = {
  id: number;
  booking_id: string;
  kind: "created" | "status" | "room" | "modified" | "payment" | "details";
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
    "price_bdt" | "weekend_price_bdt" | "rack_price_bdt" | "is_published" | "blurb" | "description" | "size_sqft" | "gallery"
  >
>;
/** A room's identity: its number, type and floor. */
export type RoomUnitInput = { number: string; room_type_id: string; floor: string | null };
export type RoomPatch = Partial<Pick<RoomUnit, "housekeeping" | "out_of_service" | "service_note">>;

// Shapes returned by the booking engine (supabase/migrations/20261118120000_booking_engine.sql).
// Every price here is computed by the database; the browser only displays it.
import type { BookingStatus, PaymentStatus } from "./types";

export type NightPrice = { night: string; rate: number; kind: "weekday" | "weekend" | "season"; season?: string; weekend: boolean };

export type QuoteLine = {
  line: number;
  room_type: string;
  name: string;
  sleeps: number;
  rate_plan: string | null;
  rate_plan_name: string | null;
  nights: NightPrice[];
  subtotal: number;
};

export type Quote = {
  currency: "BDT";
  check_in: string;
  check_out: string;
  nights: number;
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  promotion: { code: string; name: string } | null;
  service_charge_percent: number | null;
  service_charge: number;
  vat_percent: number | null;
  vat: number;
  /** True while the hotel hasn't set its VAT and service rates (added at check-in). */
  taxes_pending: boolean;
  total: number;
  advance_percent: number | null;
  advance_due: number;
};

export type SearchOption = {
  roomType: string;
  name: string;
  tag: string;
  sleeps: number;
  available: number;
  nights: number;
  /** One room, all nights, taxes included when set. */
  total: number;
  subtotal: number;
  discount: number;
  quote: Quote;
};

export type StayQuery = { checkIn: string; checkOut: string; adults: number; children: number };

export type HoldRequest = StayQuery & { lines: string[]; promo?: string | null };

export type Hold = { token: string; expiresAt: string; quote: Quote };

export type HoldView = {
  status: "active" | "converted" | "expired" | "released";
  expires_at: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  promo_code: string | null;
  quote: Quote;
  reference: string | null;
};

export type PaymentOption = "pay_at_hotel" | "advance";

export type GuestInput = {
  name: string;
  email: string;
  phone: string;
  country: string;
  arrival: string;
  requests: string;
  airportPickup: boolean;
};

export type ConfirmResult = {
  reference: string;
  status: BookingStatus;
  total: number;
  advance_due: number;
  payment_due_at: string | null;
  payment_option: PaymentOption | "online";
  manage_token: string;
  manage_expires_at: string;
  replayed: boolean;
};

export type AccessToken = { token: string; expires_at: string };

/** A guest's own booking as `guest_booking(token)` returns it: contact details masked. */
export type ManageView = {
  reference: string;
  status: BookingStatus;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  guest_first_name: string;
  email: string | null;
  phone: string | null;
  rooms: { room_type: string; subtotal: number | null; nights: NightPrice[] | null }[];
  subtotal: number;
  discount: number;
  service_charge: number;
  vat: number;
  total: number;
  paid: number;
  payment_status: PaymentStatus;
  payment_option: PaymentOption | "online";
  advance_due: number;
  payment_due_at: string | null;
  taxes_pending: boolean;
  open_requests: { kind: "cancel" | "change"; created_at: string }[];
  can_cancel: boolean;
  cancels_instantly: boolean;
  can_request_change: boolean;
};

export interface BookingEngine {
  readonly mode: "live" | "preview";
  search(q: StayQuery, promo?: string | null): Promise<SearchOption[]>;
  hold(req: HoldRequest): Promise<Hold>;
  getHold(token: string): Promise<HoldView>;
  applyPromo(token: string, promo: string | null): Promise<Quote>;
  release(token: string): Promise<void>;
  confirm(token: string, idempotencyKey: string, guest: GuestInput, option: PaymentOption, quotedTotal: number): Promise<ConfirmResult>;
  /** Reference + the booking's phone or email → a 30-minute token, or null when they don't match. */
  verifyAccess(reference: string, contact: string): Promise<AccessToken | null>;
  view(token: string): Promise<ManageView>;
  cancel(token: string, reason: string): Promise<"cancelled" | "requested">;
  requestChange(token: string, checkIn: string, checkOut: string, note: string): Promise<{ available: boolean }>;
}

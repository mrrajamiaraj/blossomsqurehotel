// Booking rules shared by the preview repository, the admin UI (to decide
// which actions to offer) and tests. The database enforces the same rules in
// supabase/migrations/20261027000300_booking_functions.sql.

import type { Booking, BookingStatus, BookingView, PaymentStatus } from "./types";

export const LIVE_STATUSES: BookingStatus[] = ["pending", "confirmed", "checked_in"];
/** Stays that count as sold for occupancy and revenue. */
export const SOLD_STATUSES: BookingStatus[] = ["confirmed", "checked_in", "checked_out"];

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["checked_out"],
  checked_out: [],
  cancelled: [],
  no_show: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: BookingStatus): BookingStatus[] {
  return TRANSITIONS[from];
}

export function isLive(status: BookingStatus): boolean {
  return LIVE_STATUSES.includes(status);
}

/** Half-open date ranges [aIn, aOut) and [bIn, bOut) share at least one night. */
export function overlaps(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && aOut > bIn;
}

/** Each room takes up to `sleeps` adults plus one child. */
export function guestsFit(sleeps: number, rooms: number, adults: number, children: number): boolean {
  return (
    rooms >= 1 &&
    rooms <= 5 &&
    adults >= 1 &&
    children >= 0 &&
    adults <= sleeps * rooms &&
    adults + children <= (sleeps + 1) * rooms
  );
}

export function paymentStatus(paid: number, total: number): PaymentStatus {
  if (paid <= 0) return "unpaid";
  return paid >= total ? "paid" : "partial";
}

/** How each tab of the bookings list filters and orders, for both repositories. */
export type ViewSpec = {
  statuses?: BookingStatus[];
  checkIn?: { eq?: string; gt?: string };
  checkOut?: { eq?: string };
  order: { column: "check_in" | "created_at"; ascending: boolean };
};

export function viewSpec(view: BookingView, today: string): ViewSpec {
  switch (view) {
    case "requests":
      return { statuses: ["pending"], order: { column: "created_at", ascending: true } };
    case "arrivals":
      return { statuses: ["pending", "confirmed", "checked_in"], checkIn: { eq: today }, order: { column: "check_in", ascending: true } };
    case "in_house":
      return { statuses: ["checked_in"], order: { column: "check_in", ascending: true } };
    case "departures":
      return { statuses: ["checked_in", "checked_out"], checkOut: { eq: today }, order: { column: "check_in", ascending: true } };
    case "upcoming":
      return { statuses: ["pending", "confirmed"], checkIn: { gt: today }, order: { column: "check_in", ascending: true } };
    case "past":
      return { statuses: ["checked_out", "no_show"], order: { column: "check_in", ascending: false } };
    case "cancelled":
      return { statuses: ["cancelled"], order: { column: "check_in", ascending: false } };
    case "all":
      return { order: { column: "created_at", ascending: false } };
    case "active":
    default:
      return { statuses: LIVE_STATUSES, order: { column: "check_in", ascending: true } };
  }
}

export function matchesView(b: Booking, spec: ViewSpec): boolean {
  if (spec.statuses && !spec.statuses.includes(b.status)) return false;
  if (spec.checkIn?.eq && b.check_in !== spec.checkIn.eq) return false;
  if (spec.checkIn?.gt && !(b.check_in > spec.checkIn.gt)) return false;
  if (spec.checkOut?.eq && b.check_out !== spec.checkOut.eq) return false;
  return true;
}

/** Keeps only characters that are safe inside a PostgREST filter. */
export function cleanSearch(q: string | undefined): string {
  return (q ?? "").replace(/[^\p{L}\p{N}@.+\- ]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "Awaiting confirmation",
  confirmed: "Confirmed",
  checked_in: "In house",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const ACTION_LABEL: Record<BookingStatus, string> = {
  pending: "Mark pending",
  confirmed: "Confirm",
  checked_in: "Check in",
  checked_out: "Check out",
  cancelled: "Cancel",
  no_show: "Mark no-show",
};

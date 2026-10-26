"use server";

import { headers } from "next/headers";
import { getPublicRepo } from "@/lib/data";
import { errorCode, errorMessage } from "@/lib/data/errors";
import { hotelToday, isISODate, nightsBetween } from "@/lib/dates";
import { allow } from "@/lib/rate-limit";
import { LIMITS } from "@/lib/stay";

export type BookingInput = {
  room: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
  name: string;
  email: string;
  phone: string;
  country: string;
  arrival: string;
  requests: string;
  airportPickup: boolean;
  agree: boolean;
};

export type BookingResult =
  | { ok: true; reference: string; preview: boolean }
  | { ok: false; message: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Server-side validation; the database re-checks prices, capacity and availability. */
function invalid(input: BookingInput): string | null {
  if (!input || typeof input !== "object") return errorMessage("UNKNOWN");
  if (typeof input.room !== "string" || !/^[a-z0-9-]{1,60}$/.test(input.room)) return errorMessage("NO_ROOM");
  if (!isISODate(input.checkIn) || !isISODate(input.checkOut)) return errorMessage("BAD_DATES");
  if (input.checkIn < hotelToday()) return errorMessage("PAST_DATE");
  const nights = nightsBetween(input.checkIn, input.checkOut);
  if (nights < 1 || nights > LIMITS.maxNights) return errorMessage("BAD_DATES");

  const counts = [input.adults, input.children, input.rooms];
  if (!counts.every((n) => Number.isInteger(n) && n >= 0)) return errorMessage("TOO_MANY_GUESTS");
  if (input.rooms < 1 || input.rooms > LIMITS.maxRooms || input.adults < 1) return errorMessage("TOO_MANY_GUESTS");
  if (input.adults > input.rooms * LIMITS.adultsPerRoom || input.children > input.rooms * LIMITS.childrenPerRoom)
    return errorMessage("TOO_MANY_GUESTS");

  const name = String(input.name ?? "").trim();
  if (name.length < 2 || name.length > 120) return "Please enter the guest's full name.";
  if (!EMAIL_RE.test(String(input.email ?? "").trim())) return errorMessage("BAD_EMAIL");
  const digits = String(input.phone ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "Please enter a valid mobile number.";
  if (String(input.requests ?? "").length > 1000) return "Special requests can be up to 1,000 characters.";
  if (input.agree !== true) return "Please agree to the cancellation policy and house rules.";
  return null;
}

export async function createBooking(input: BookingInput): Promise<BookingResult> {
  const problem = invalid(input);
  if (problem) return { ok: false, message: problem };

  // Best-effort per-IP throttle; the database also limits repeats per contact.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(`booking:${ip}`, 5, 10 * 60_000)) return { ok: false, message: errorMessage("RATE_LIMITED") };

  const repo = getPublicRepo();
  if (!repo) return { ok: false, message: errorMessage("OFFLINE") };

  try {
    const reference = await repo.createWebsiteBooking({
      room: input.room,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      rooms: input.rooms,
      adults: input.adults,
      children: input.children,
      name: input.name.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      country: String(input.country ?? "").slice(0, 60),
      arrival: String(input.arrival ?? "").slice(0, 60),
      requests: String(input.requests ?? "").trim(),
      airportPickup: Boolean(input.airportPickup),
    });
    return { ok: true, reference, preview: repo.mode === "preview" };
  } catch (err) {
    return { ok: false, message: errorMessage(errorCode(err)) };
  }
}

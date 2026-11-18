"use server";

import { headers } from "next/headers";
import { clearHoldToken, readHoldToken, setHoldToken, setReceipt } from "@/lib/booking-receipt";
import { getEngine } from "@/lib/data/engine";
import type { PaymentOption, Quote } from "@/lib/data/engine-types";
import { errorCode, errorMessage } from "@/lib/data/errors";
import { hotelToday, isISODate, nightsBetween } from "@/lib/dates";
import { kickOutbox } from "@/lib/messaging/worker";
import { allow } from "@/lib/rate-limit";
import { LIMITS } from "@/lib/stay";

/*
 * Website checkout. The browser sends only choices (dates, guests, room
 * types, guest details); every price, availability check and room count is
 * decided by the database. Tokens live in httpOnly cookies.
 */

export type ActionError = { ok: false; code: string; message: string; quote?: Quote };

const fail = (code: string, message = errorMessage(code)): ActionError => ({ ok: false, code, message });
const SLUG = /^[a-z0-9-]{1,60}$/;
const KEY = /^[A-Za-z0-9_-]{8,80}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function ip(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/* ---------------------------------------------------------------- Hold */

export type HoldInput = { checkIn: string; checkOut: string; adults: number; children: number; rooms: Record<string, number>; promo?: string };
export type HoldResult = { ok: true; quote: Quote; expiresAt: string } | ActionError;

export async function holdRooms(input: HoldInput): Promise<HoldResult> {
  if (!input || typeof input !== "object") return fail("UNKNOWN");
  if (!isISODate(input.checkIn) || !isISODate(input.checkOut)) return fail("BAD_DATES");
  if (input.checkIn < hotelToday()) return fail("PAST_DATE");
  const nights = nightsBetween(input.checkIn, input.checkOut);
  if (nights < 1 || nights > LIMITS.maxNights) return fail("BAD_DATES");
  if (![input.adults, input.children].every((n) => Number.isInteger(n) && n >= 0) || input.adults < 1) return fail("TOO_MANY_GUESTS");

  const lines: string[] = [];
  for (const [slug, n] of Object.entries(input.rooms ?? {})) {
    if (!SLUG.test(slug) || !Number.isInteger(n) || n < 0 || n > LIMITS.maxRooms) return fail("NO_ROOM");
    for (let i = 0; i < n; i++) lines.push(slug);
  }
  if (!lines.length) return fail("NO_ROOM", "Please choose at least one room.");
  if (lines.length > LIMITS.maxRooms) return fail("TOO_MANY_ROOMS");
  const promo = String(input.promo ?? "").trim().slice(0, 20) || null;

  if (!allow(`hold:${await ip()}`, 20, 10 * 60_000)) return fail("RATE_LIMITED", "Too many attempts. Please wait a few minutes, or call us.");
  const engine = getEngine();
  if (!engine) return fail("OFFLINE");

  try {
    // One hold per visitor: let go of the previous selection first.
    const previous = await readHoldToken();
    if (previous) await engine.release(previous).catch(() => undefined);
    const hold = await engine.hold({ checkIn: input.checkIn, checkOut: input.checkOut, adults: input.adults, children: input.children, lines, promo });
    await setHoldToken(hold.token);
    return { ok: true, quote: hold.quote, expiresAt: hold.expiresAt };
  } catch (err) {
    return fail(errorCode(err));
  }
}

export async function releaseRooms(): Promise<void> {
  const token = await readHoldToken();
  const engine = getEngine();
  if (token && engine) await engine.release(token).catch(() => undefined);
  await clearHoldToken();
}

/* --------------------------------------------------------------- Promo */

export type QuoteResult = { ok: true; quote: Quote } | ActionError;

export async function applyPromo(code: string): Promise<QuoteResult> {
  const promo = String(code ?? "").trim().slice(0, 20);
  if (!allow(`promo:${await ip()}`, 15, 10 * 60_000)) return fail("RATE_LIMITED", "Too many attempts. Please wait a few minutes.");
  const token = await readHoldToken();
  const engine = getEngine();
  if (!token) return fail("HOLD_NOT_FOUND");
  if (!engine) return fail("OFFLINE");
  try {
    return { ok: true, quote: await engine.applyPromo(token, promo || null) };
  } catch (err) {
    return fail(errorCode(err));
  }
}

/* ------------------------------------------------------------- Confirm */

export type ConfirmInput = {
  idempotencyKey: string;
  quotedTotal: number;
  paymentOption: PaymentOption;
  name: string;
  email: string;
  phone: string;
  country: string;
  arrival: string;
  requests: string;
  airportPickup: boolean;
  agree: boolean;
};

export type ConfirmActionResult = { ok: true; reference: string } | ActionError;

export async function confirmBooking(input: ConfirmInput): Promise<ConfirmActionResult> {
  if (!input || typeof input !== "object") return fail("UNKNOWN");
  if (!KEY.test(String(input.idempotencyKey ?? ""))) return fail("BAD_IDEMPOTENCY_KEY");
  if (!Number.isInteger(input.quotedTotal) || input.quotedTotal < 0) return fail("PRICE_CHANGED");
  if (input.paymentOption !== "pay_at_hotel" && input.paymentOption !== "advance") return fail("BAD_PAYMENT_OPTION");
  const name = String(input.name ?? "").trim();
  if (name.length < 2 || name.length > 120) return fail("BAD_GUEST", "Please enter the guest's full name.");
  if (!EMAIL_RE.test(String(input.email ?? "").trim())) return fail("BAD_EMAIL");
  const digits = String(input.phone ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return fail("BAD_GUEST", "Please enter a valid mobile number.");
  if (String(input.requests ?? "").length > 1000) return fail("BAD_GUEST", "Special requests can be up to 1,000 characters.");
  if (input.agree !== true) return fail("BAD_GUEST", "Please agree to the cancellation policy and house rules.");

  if (!allow(`booking:${await ip()}`, 10, 10 * 60_000)) return fail("RATE_LIMITED");
  const token = await readHoldToken();
  const engine = getEngine();
  if (!token) return fail("HOLD_NOT_FOUND");
  if (!engine) return fail("OFFLINE");

  try {
    const res = await engine.confirm(
      token,
      input.idempotencyKey,
      {
        name,
        email: String(input.email).trim(),
        phone: String(input.phone).trim(),
        country: String(input.country ?? "").slice(0, 60),
        arrival: String(input.arrival ?? "").slice(0, 60),
        requests: String(input.requests ?? "").trim(),
        airportPickup: Boolean(input.airportPickup),
      },
      input.paymentOption,
      input.quotedTotal,
    );
    await setReceipt({ reference: res.reference, token: res.manage_token, firstName: name.split(/\s+/)[0] ?? "", preview: engine.mode === "preview" });
    await clearHoldToken();
    if (engine.mode === "live") kickOutbox(); // "We've received your booking" email
    return { ok: true, reference: res.reference };
  } catch (err) {
    const code = errorCode(err);
    if (code === "PRICE_CHANGED") {
      // Show the guest the new price; the hold still has their rooms.
      const hold = await engine.getHold(token).catch(() => null);
      return { ...fail(code), quote: hold?.quote };
    }
    return fail(code);
  }
}

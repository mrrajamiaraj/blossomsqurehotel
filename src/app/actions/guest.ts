"use server";

import { headers } from "next/headers";
import { setManageToken } from "@/lib/booking-receipt";
import { getPublicRepo } from "@/lib/data";
import { getEngine } from "@/lib/data/engine";
import { errorCode, errorMessage } from "@/lib/data/errors";
import { hotelToday } from "@/lib/dates";
import { normaliseReference, toInquiryInput, validateInquiry, validContact, type InquiryErrors, type InquiryForm } from "@/lib/guest-services";
import { kickOutbox } from "@/lib/messaging/worker";
import { allow } from "@/lib/rate-limit";

async function clientIp(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/* ------------------------------------------------------------------ Enquiries */

export type InquiryResult =
  | { ok: true; reference: string; preview: boolean }
  | { ok: false; message: string; errors?: InquiryErrors; /** True when the guest should send it by WhatsApp/email instead. */ offline?: boolean };

export async function submitInquiry(form: InquiryForm): Promise<InquiryResult> {
  if (!form || typeof form !== "object") return { ok: false, message: errorMessage("BAD_INQUIRY") };
  const f: InquiryForm = {
    kind: String(form.kind ?? ""),
    name: String(form.name ?? "").slice(0, 200),
    email: String(form.email ?? "").slice(0, 200),
    phone: String(form.phone ?? "").slice(0, 40),
    message: String(form.message ?? "").slice(0, 2500),
    eventDate: form.eventDate ? String(form.eventDate) : "",
    guests: form.guests ? String(form.guests) : "",
    website: String(form.website ?? ""),
  };

  // Bots fill every field. Pretend success, store nothing.
  if (f.website) return { ok: true, reference: "ENQ-000000", preview: false };

  const errors = validateInquiry(f, hotelToday());
  if (Object.keys(errors).length) return { ok: false, message: "Please check the highlighted fields.", errors };

  if (!allow(`inquiry:${await clientIp()}`, 5, 10 * 60_000)) return { ok: false, message: errorMessage("RATE_LIMITED") };

  const repo = getPublicRepo();
  if (!repo) return { ok: false, message: errorMessage("UNAVAILABLE"), offline: true };
  try {
    const reference = await repo.submitInquiry(toInquiryInput(f));
    if (repo.mode === "live") kickOutbox(); // acknowledgment email
    return { ok: true, reference, preview: repo.mode === "preview" };
  } catch (err) {
    const code = errorCode(err);
    return { ok: false, message: errorMessage(code), offline: code === "UNAVAILABLE" || code === "UNKNOWN" };
  }
}

/* ------------------------------------------------------------- Booking lookup */

export type LookupResult = { ok: true } | { ok: false; message: string; unavailable?: boolean };

const NOT_MATCHED =
  "We couldn't find a booking with that reference and contact. Check both match your confirmation, or call us and we'll look it up.";

/**
 * Reference + the phone or email on the booking → a private, 30-minute
 * token (httpOnly cookie) that opens /booking/manage. A mismatch never
 * reveals whether the reference exists, and failed guesses are throttled
 * per reference in the database.
 */
export async function lookupBooking(rawReference: string, rawContact: string): Promise<LookupResult> {
  const reference = normaliseReference(String(rawReference ?? ""));
  const contact = String(rawContact ?? "").slice(0, 200);
  if (!reference) return { ok: false, message: "Booking references look like BSQ-12345." };
  if (!validContact(contact)) return { ok: false, message: "Enter the phone number or email you booked with." };

  if (!allow(`lookup:${await clientIp()}`, 10, 10 * 60_000)) return { ok: false, message: "Too many attempts. Please wait a few minutes, or call us." };

  const engine = getEngine();
  if (!engine) return { ok: false, message: errorMessage("UNAVAILABLE"), unavailable: true };
  try {
    const access = await engine.verifyAccess(reference, contact);
    if (!access) return { ok: false, message: NOT_MATCHED };
    await setManageToken(access.token);
    return { ok: true };
  } catch (err) {
    const code = errorCode(err);
    if (code === "RATE_LIMITED") return { ok: false, message: "Too many attempts for this booking. Please try again in an hour, or call us." };
    return { ok: false, message: errorMessage(code === "UNKNOWN" ? "UNAVAILABLE" : code), unavailable: code === "UNAVAILABLE" };
  }
}
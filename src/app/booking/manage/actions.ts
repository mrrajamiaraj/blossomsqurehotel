"use server";

import { headers } from "next/headers";
import { readManageToken, readReceipt } from "@/lib/booking-receipt";
import { getEngine } from "@/lib/data/engine";
import { errorCode, errorMessage } from "@/lib/data/errors";
import { hotelToday, isISODate, nightsBetween } from "@/lib/dates";
import { kickOutbox } from "@/lib/messaging/worker";
import { isMethodId, methodInfo, normaliseTxnId, TXN_ID_RE } from "@/lib/payments/methods";
import { guestReportTransfer, guestSetWhatsApp } from "@/lib/payments/guest";
import { startGatewayPayment } from "@/lib/payments/service";
import { allow } from "@/lib/rate-limit";

/** The private token from "Find my booking", or the fresh receipt after booking. */
async function token(): Promise<string | null> {
  return (await readManageToken()) ?? (await readReceipt())?.token ?? null;
}

async function limited(kind: string) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return !allow(`${kind}:${ip}`, 6, 10 * 60_000);
}

export type ManageResult = { ok: true; outcome: string } | { ok: false; code: string; message: string };

export async function cancelMyBooking(reason: string): Promise<ManageResult> {
  if (await limited("cancel")) return { ok: false, code: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes, or call us." };
  const t = await token();
  const engine = getEngine();
  if (!t) return { ok: false, code: "ACCESS_EXPIRED", message: errorMessage("ACCESS_EXPIRED") };
  if (!engine) return { ok: false, code: "OFFLINE", message: errorMessage("OFFLINE") };
  try {
    const outcome = await engine.cancel(t, String(reason ?? "").slice(0, 300));
    if (engine.mode === "live") kickOutbox();
    return { ok: true, outcome };
  } catch (err) {
    const code = errorCode(err);
    return { ok: false, code, message: code === "NOT_ALLOWED" ? "This booking can't be cancelled online. Please call us." : errorMessage(code) };
  }
}

export async function requestDateChange(checkIn: string, checkOut: string, note: string): Promise<ManageResult> {
  if (!isISODate(checkIn) || !isISODate(checkOut) || nightsBetween(checkIn, checkOut) < 1 || nightsBetween(checkIn, checkOut) > 30)
    return { ok: false, code: "BAD_DATES", message: errorMessage("BAD_DATES") };
  if (checkIn < hotelToday()) return { ok: false, code: "PAST_DATE", message: errorMessage("PAST_DATE") };
  if (await limited("change")) return { ok: false, code: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes, or call us." };
  const t = await token();
  const engine = getEngine();
  if (!t) return { ok: false, code: "ACCESS_EXPIRED", message: errorMessage("ACCESS_EXPIRED") };
  if (!engine) return { ok: false, code: "OFFLINE", message: errorMessage("OFFLINE") };
  try {
    const r = await engine.requestChange(t, checkIn, checkOut, String(note ?? "").slice(0, 500));
    return { ok: true, outcome: r.available ? "available" : "unavailable" };
  } catch (err) {
    const code = errorCode(err);
    return { ok: false, code, message: code === "NOT_ALLOWED" ? "This booking can't be changed online. Please call us." : errorMessage(code) };
  }
}

/* ---------------------------------------------------------------- payments */

export type PayResult = { ok: true; message: string; redirect?: string } | { ok: false; code: string; message: string };

const fail = (code: string, message = errorMessage(code)): PayResult => ({ ok: false, code, message });

/** The guest reports a bank / bKash / Nagad transfer. Pending until staff verify it. */
export async function reportTransfer(method: string, amount: number, txnId: string, sender: string): Promise<PayResult> {
  const m = methodInfo(String(method));
  if (!m || m.kind !== "transfer") return fail("BAD_PAYMENT_OPTION");
  const ref = normaliseTxnId(String(txnId ?? ""));
  if (!TXN_ID_RE.test(ref)) return fail("BAD_REFERENCE");
  const amt = Math.round(Number(amount));
  if (!Number.isInteger(amt) || amt < 1) return fail("BAD_AMOUNT", "Enter the amount you sent, in taka.");
  if (await limited("pay")) return fail("RATE_LIMITED", "Too many attempts. Please wait a few minutes, or call us.");
  const t = await token();
  if (!t) return fail("ACCESS_EXPIRED");
  try {
    await guestReportTransfer(t, m.id, amt, ref, String(sender ?? "").slice(0, 60));
    return { ok: true, message: `Thank you — we'll check ${m.short} transaction ${ref} and confirm it, usually within a few hours.` };
  } catch (err) {
    const code = errorCode(err);
    return fail(code, code === "BAD_AMOUNT" ? "That's more than the balance still to pay (counting payments we're already checking)." : errorMessage(code));
  }
}

/** Starts an online payment through an approved gateway; returns where to send the guest. */
export async function startOnlinePayment(method: string, amount: number, idempotencyKey: string): Promise<PayResult> {
  if (!isMethodId(method) || methodInfo(method)?.kind !== "gateway") return fail("BAD_PAYMENT_OPTION");
  if (await limited("pay")) return fail("RATE_LIMITED", "Too many attempts. Please wait a few minutes, or call us.");
  const t = await token();
  if (!t) return fail("ACCESS_EXPIRED");
  try {
    const r = await startGatewayPayment(t, method, Math.round(Number(amount)), String(idempotencyKey ?? ""));
    return { ok: true, message: "Taking you to the secure payment page…", redirect: r.redirectUrl };
  } catch (err) {
    return fail(errorCode(err));
  }
}

/** The guest's choice about booking updates on WhatsApp. */
export async function setWhatsAppUpdates(on: boolean): Promise<PayResult> {
  const t = await token();
  if (!t) return fail("ACCESS_EXPIRED");
  try {
    const now = await guestSetWhatsApp(t, Boolean(on));
    return { ok: true, message: now ? "We'll send booking updates to your WhatsApp too." : "WhatsApp updates are off. We'll still email you." };
  } catch (err) {
    const code = errorCode(err);
    return fail(code, code === "NO_RECIPIENT" ? "The phone number on your booking isn't a mobile number we can message. Call us to update it." : errorMessage(code));
  }
}

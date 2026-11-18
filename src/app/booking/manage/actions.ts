"use server";

import { headers } from "next/headers";
import { readManageToken, readReceipt } from "@/lib/booking-receipt";
import { getEngine } from "@/lib/data/engine";
import { errorCode, errorMessage } from "@/lib/data/errors";
import { hotelToday, isISODate, nightsBetween } from "@/lib/dates";
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
    return { ok: true, outcome: await engine.cancel(t, String(reason ?? "").slice(0, 300)) };
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

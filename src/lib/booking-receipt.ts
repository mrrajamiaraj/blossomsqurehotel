import "server-only";
import { cookies } from "next/headers";
import { isISODate } from "./dates";

/**
 * After a website booking succeeds, the server sets a short-lived, httpOnly
 * cookie so /booking/confirmation can show *that* booking — looked up from
 * the database with the reference and phone — without putting either in the
 * URL. The snapshot is only what the database already accepted; it is used
 * as a fallback when the lookup function isn't available yet.
 */
export const RECEIPT_COOKIE = "bsq_booking";
const MAX_AGE = 2 * 60 * 60;

export type Receipt = {
  reference: string;
  phone: string;
  firstName: string;
  room: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
  preview: boolean;
};

export async function setReceipt(r: Receipt) {
  (await cookies()).set(RECEIPT_COOKIE, Buffer.from(JSON.stringify(r)).toString("base64url"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/booking",
    maxAge: MAX_AGE,
  });
}

export async function readReceipt(): Promise<Receipt | null> {
  const raw = (await cookies()).get(RECEIPT_COOKIE)?.value;
  if (!raw) return null;
  try {
    const r = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Receipt;
    const ok =
      /^BSQ-\d{5}$/.test(r.reference) &&
      typeof r.phone === "string" &&
      typeof r.room === "string" &&
      isISODate(r.checkIn) &&
      isISODate(r.checkOut) &&
      [r.adults, r.children, r.rooms].every((n) => Number.isInteger(n) && n >= 0 && n < 100);
    return ok ? { ...r, firstName: String(r.firstName ?? "").slice(0, 60), preview: Boolean(r.preview) } : null;
  } catch {
    return null;
  }
}

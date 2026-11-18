import "server-only";
import { cookies } from "next/headers";

/**
 * Booking cookies. All are httpOnly (page scripts can't read them), scoped to
 * /booking, and carry only random tokens the database hashes and checks:
 *
 *  - bsq_hold    the rooms held while the guest checks out (15 minutes).
 *  - bsq_booking the receipt after confirming: reference + a private token
 *                that lets /booking/confirmation read the booking back (2 h).
 *  - bsq_manage  set after "Find my booking" verifies reference + contact
 *                (30 minutes, matching the token's life in the database).
 *
 * A booking reference alone never opens anything.
 */
export const RECEIPT_COOKIE = "bsq_booking";
const HOLD_COOKIE = "bsq_hold";
const MANAGE_COOKIE = "bsq_manage";

const TOKEN_RE = /^[0-9a-f]{64}$/;

const base = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/booking",
  maxAge,
});

export type Receipt = { reference: string; firstName: string; token: string; preview: boolean };

export async function setReceipt(r: Receipt) {
  (await cookies()).set(RECEIPT_COOKIE, Buffer.from(JSON.stringify(r)).toString("base64url"), base(2 * 60 * 60));
}

export async function readReceipt(): Promise<Receipt | null> {
  const raw = (await cookies()).get(RECEIPT_COOKIE)?.value;
  if (!raw) return null;
  try {
    const r = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Receipt;
    if (!/^BSQ-\d{5}$/.test(r.reference) || !TOKEN_RE.test(r.token)) return null;
    return { reference: r.reference, token: r.token, firstName: String(r.firstName ?? "").slice(0, 60), preview: Boolean(r.preview) };
  } catch {
    return null;
  }
}

async function readToken(name: string): Promise<string | null> {
  const v = (await cookies()).get(name)?.value ?? "";
  return TOKEN_RE.test(v) ? v : null;
}

export const readHoldToken = () => readToken(HOLD_COOKIE);
export async function setHoldToken(token: string) {
  (await cookies()).set(HOLD_COOKIE, token, base(60 * 60));
}
export async function clearHoldToken() {
  (await cookies()).delete({ name: HOLD_COOKIE, path: "/booking" });
}

export const readManageToken = () => readToken(MANAGE_COOKIE);
export async function setManageToken(token: string) {
  (await cookies()).set(MANAGE_COOKIE, token, base(30 * 60));
}
export async function clearManageToken() {
  (await cookies()).delete({ name: MANAGE_COOKIE, path: "/booking" });
}

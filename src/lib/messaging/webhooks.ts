// Signature checks for delivery webhooks. Pure (node:crypto only) so they're
// unit-tested; the route handlers call them before reading anything else.

import { createHmac, timingSafeEqual } from "node:crypto";

const eq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Resend signs webhooks the Svix way: HMAC-SHA256 over "id.timestamp.body"
 * with the base64 key after "whsec_"; the header holds one or more
 * "v1,<base64>" signatures. Timestamps older or newer than 5 minutes are
 * refused (replay protection on top of the event-id check in the database).
 */
export function verifySvix(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now = Date.now(),
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${body}`).digest("base64");
  return headers.signature
    .split(" ")
    .map((s) => s.split(",")[1] ?? "")
    .some((sig) => sig && eq(sig, expected));
}

/** Meta (WhatsApp Cloud API) signs the raw body: "sha256=" + hex HMAC with the app secret. */
export function verifyMeta(appSecret: string, header: string | null, body: string): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(body, "utf8").digest("hex");
  return eq(header.slice(7).toLowerCase(), expected);
}

/** Resend event type → our delivery status (null = not tracked). */
export function resendStatus(type: string): "delivered" | "opened" | "bounced" | "complained" | "failed" | null {
  switch (type) {
    case "email.delivered":
      return "delivered";
    case "email.opened":
      return "opened";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.failed":
      return "failed";
    default:
      return null;
  }
}

/** WhatsApp status → our delivery status ("read" counts as opened). */
export function whatsappStatus(s: string): "delivered" | "opened" | "failed" | null {
  return s === "delivered" ? "delivered" : s === "read" ? "opened" : s === "failed" ? "failed" : null;
}

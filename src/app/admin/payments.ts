"use server";

// Staff actions for payments and guest messages. Each requires the
// permission here (and MFA for privileged roles), then calls a SQL function
// that checks it again.

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/admin/session";
import { errorCode, errorMessage } from "@/lib/data/errors";
import { PaymentsRepo } from "@/lib/data/payments";
import { kickOutbox, processOutbox } from "@/lib/messaging/worker";
import { isMethodId } from "@/lib/payments/methods";
import { getSessionClient } from "@/lib/supabase";

export type PayActionResult = { ok: true; message: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEEDS_DB: PayActionResult = { ok: false, message: "This needs Supabase. Connect it to manage payments and messages." };

async function repo(permission: Parameters<typeof requirePermission>[0]) {
  const { mode } = await requirePermission(permission);
  if (mode === "preview") return null;
  return new PaymentsRepo(await getSessionClient());
}

function done(message: string): PayActionResult {
  revalidatePath("/admin", "layout");
  kickOutbox();
  return { ok: true, message };
}

const fail = (err: unknown): PayActionResult => ({ ok: false, message: errorMessage(errorCode(err)) });

/** Confirm a reported transfer arrived (accept) or that it didn't (reject, with a reason the guest sees). */
export async function verifyPayment(paymentId: string, accept: boolean, note: string): Promise<PayActionResult> {
  if (!UUID.test(paymentId)) return { ok: false, message: errorMessage("NOT_FOUND") };
  const n = String(note ?? "").trim().slice(0, 200);
  if (!accept && n.length < 3) return { ok: false, message: "Say why it couldn't be confirmed (the guest sees this), e.g. “Not in today's bank statement”." };
  const r = await repo("payments.record");
  if (!r) return NEEDS_DB;
  try {
    await r.verify(paymentId, Boolean(accept), n);
    return done(accept ? "Payment confirmed — receipt issued and the guest has been told" : "Marked as not received — the guest has been told");
  } catch (err) {
    return fail(err);
  }
}

export async function resendMessage(messageId: string): Promise<PayActionResult> {
  if (!UUID.test(messageId)) return { ok: false, message: errorMessage("NOT_FOUND") };
  // The SQL function picks bookings.write or inquiries.manage per message.
  const { mode } = await requirePermission("bookings.read");
  if (mode === "preview") return NEEDS_DB;
  try {
    await new PaymentsRepo(await getSessionClient()).resend(messageId);
    return done("Queued again — it goes out within a minute");
  } catch (err) {
    return fail(err);
  }
}

/** Sends whatever is due now (same work as the scheduled sweep). */
export async function runMessageQueue(): Promise<PayActionResult> {
  const { mode } = await requirePermission("bookings.write");
  if (mode === "preview") return NEEDS_DB;
  try {
    const s = await processOutbox(25);
    if (!s) return { ok: false, message: "Add SUPABASE_SECRET_KEY on the server to send messages." };
    revalidatePath("/admin/messages");
    if (!s.claimed) return { ok: true, message: "Nothing waiting to be sent" };
    const parts = [s.sent && `${s.sent} sent`, s.retry && `${s.retry} will retry`, s.failed && `${s.failed} failed`, s.unconfigured && `${s.unconfigured} not set up`].filter(Boolean);
    return { ok: true, message: parts.join(", ") };
  } catch (err) {
    console.error("Run queue:", (err as Error).message);
    return { ok: false, message: "The queue couldn't run just now. Try again in a minute." };
  }
}

export async function setPaymentMethods(methods: string[]): Promise<PayActionResult> {
  const list = Array.isArray(methods) ? [...new Set(methods.filter(isMethodId))] : [];
  if (!list.length) return { ok: false, message: "Keep at least one way to pay switched on." };
  const r = await repo("settings.manage");
  if (!r) return NEEDS_DB;
  try {
    await r.setMethods(list);
    revalidatePath("/admin/settings");
    revalidatePath("/booking", "layout");
    return { ok: true, message: "Payment methods saved — guests see the change now" };
  } catch (err) {
    return fail(err);
  }
}

"use server";

// Server actions for payments, refunds, maintenance blocks, housekeeping and
// notifications. Each one: (1) requires the permission (and so MFA for
// privileged roles), (2) validates and clamps input, (3) calls a SQL function
// that checks the permission again and does the work in one transaction.

import { revalidatePath } from "next/cache";
import type { Permission } from "@/lib/access";
import { requireAdmin, requirePermission } from "@/lib/admin/session";
import { errorCode, errorMessage } from "@/lib/data/errors";
import { OperationsRepo, type TaskKind, type TaskStatus } from "@/lib/data/operations";
import type { PaymentMethod } from "@/lib/data/types";
import { isISODate } from "@/lib/dates";
import { getSessionClient } from "@/lib/supabase";

export type OpResult = { ok: true; message?: string; id?: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS: PaymentMethod[] = ["cash", "bkash", "nagad", "card", "bank", "other"];
const KINDS: TaskKind[] = ["clean", "inspect", "turndown", "maintenance", "other"];
const STATUSES: TaskStatus[] = ["open", "in_progress", "done", "cancelled"];
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

async function op(permission: Permission, fn: (ops: OperationsRepo) => Promise<unknown>, message: string): Promise<OpResult> {
  const { mode } = await requirePermission(permission);
  if (mode === "preview") return { ok: false, message: "This needs Supabase. Connect it to use payments, refunds and tasks." };
  try {
    const value = await fn(new OperationsRepo(await getSessionClient()));
    revalidatePath("/admin", "layout");
    return { ok: true, message, id: typeof value === "string" ? value : undefined };
  } catch (err) {
    return { ok: false, message: errorMessage(errorCode(err)) };
  }
}

const bad = (message: string): OpResult => ({ ok: false, message });

export async function voidPayment(paymentId: string, reason: string): Promise<OpResult> {
  if (!UUID.test(paymentId) || text(reason, 200).length < 3) return bad("Give a reason (at least 3 characters).");
  return op("payments.void", (o) => o.voidPayment(paymentId, text(reason, 200)), "Payment voided");
}

export async function requestRefund(bookingId: string, amount: number, method: PaymentMethod, reason: string, paymentId?: string): Promise<OpResult> {
  if (!UUID.test(bookingId) || (paymentId && !UUID.test(paymentId))) return bad(errorMessage("NOT_FOUND"));
  if (!Number.isInteger(amount) || amount <= 0 || !METHODS.includes(method)) return bad(errorMessage("BAD_AMOUNT"));
  if (text(reason, 300).length < 3) return bad("Give a reason for the refund.");
  return op("refunds.request", (o) => o.requestRefund({ bookingId, amount, method, reason: text(reason, 300), paymentId }), "Refund requested — finance will approve it");
}

export async function decideRefund(refundId: string, approve: boolean): Promise<OpResult> {
  if (!UUID.test(refundId)) return bad(errorMessage("NOT_FOUND"));
  return op("refunds.approve", (o) => o.decideRefund(refundId, Boolean(approve)), approve ? "Refund approved" : "Refund rejected");
}

export async function completeRefund(refundId: string, reference: string): Promise<OpResult> {
  if (!UUID.test(refundId)) return bad(errorMessage("NOT_FOUND"));
  return op("refunds.approve", (o) => o.completeRefund(refundId, text(reference, 80)), "Refund marked as paid out");
}

export async function blockRoom(roomId: string, from: string, to: string, reason: string): Promise<OpResult> {
  if (!UUID.test(roomId)) return bad(errorMessage("NOT_FOUND"));
  if (!isISODate(from) || !isISODate(to) || to <= from) return bad(errorMessage("BAD_DATES"));
  if (text(reason, 200).length < 3) return bad("Say why the room is blocked.");
  return op("maintenance.manage", (o) => o.blockRoom(roomId, from, to, text(reason, 200)), "Room blocked — it won't be sold for those dates");
}

export async function releaseBlock(blockId: string): Promise<OpResult> {
  if (!UUID.test(blockId)) return bad(errorMessage("NOT_FOUND"));
  return op("maintenance.manage", (o) => o.releaseBlock(blockId), "Block released — the room is on sale again");
}

export async function createTask(roomId: string, kind: TaskKind, due: string | null, assignedTo: string | null, notes: string, priority: 1 | 2 | 3 = 2): Promise<OpResult> {
  if (!UUID.test(roomId) || (assignedTo && !UUID.test(assignedTo))) return bad(errorMessage("NOT_FOUND"));
  if (!KINDS.includes(kind) || ![1, 2, 3].includes(priority) || (due && !isISODate(due))) return bad(errorMessage("BAD_TASK"));
  return op("housekeeping.write", (o) => o.createTask({ roomId, kind, due, assignedTo, notes: text(notes, 500), priority }), "Task added");
}

export async function updateTask(taskId: string, status: TaskStatus, notes?: string): Promise<OpResult> {
  if (!UUID.test(taskId) || !STATUSES.includes(status)) return bad(errorMessage("BAD_TASK"));
  return op("housekeeping.write", (o) => o.updateTask(taskId, status, text(notes, 500)), status === "done" ? "Done" : "Task updated");
}

export async function markNotificationsRead(ids?: string[]): Promise<OpResult> {
  const clean = ids?.filter((i) => UUID.test(i)).slice(0, 100);
  // Any signed-in staff member; the function only touches the caller's own inbox.
  const { mode } = await requireAdmin();
  if (mode === "preview") return { ok: true };
  try {
    await new OperationsRepo(await getSessionClient()).markRead(clean);
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, message: errorMessage(errorCode(err)) };
  }
}

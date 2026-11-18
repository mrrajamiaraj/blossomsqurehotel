"use server";

// Server actions for payments, refunds, maintenance blocks, housekeeping and
// notifications. Each one: (1) requires the permission (and so MFA for
// privileged roles), (2) validates and clamps input, (3) calls a SQL function
// that checks the permission again and does the work in one transaction.

import { revalidatePath } from "next/cache";
import type { Permission } from "@/lib/access";
import { requireAdmin, requirePermission } from "@/lib/admin/session";
import { errorCode, errorMessage } from "@/lib/data/errors";
import { OperationsRepo, type PromotionInput, type TaskKind, type TaskStatus } from "@/lib/data/operations";
import type { PaymentMethod } from "@/lib/data/types";
import { isISODate } from "@/lib/dates";
import { kickOutbox } from "@/lib/messaging/worker";
import { getSessionClient } from "@/lib/supabase";

export type OpResult = { ok: true; message?: string; id?: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS: PaymentMethod[] = ["cash", "bkash", "nagad", "card", "bank", "other"];
const KINDS: TaskKind[] = ["clean", "inspect", "turndown", "maintenance", "other"];
const STATUSES: TaskStatus[] = ["open", "in_progress", "done", "cancelled"];
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

async function op(permission: Permission, fn: (ops: OperationsRepo) => Promise<unknown>, message: string): Promise<OpResult> {
  const { mode } = await requirePermission(permission);
  if (mode === "preview") return { ok: false, message: "This needs Supabase. Connect it to save changes here." };
  try {
    const value = await fn(new OperationsRepo(await getSessionClient()));
    revalidatePath("/admin", "layout");
    // Rates, offers and room setup show on the public site too.
    revalidatePath("/", "layout");
    kickOutbox();
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

export async function assignTask(taskId: string, userId: string | null): Promise<OpResult> {
  if (!UUID.test(taskId) || (userId && !UUID.test(userId))) return bad("That task or colleague no longer exists. Refresh the page.");
  return op("housekeeping.write", (o) => o.assignTask(taskId, userId || null), userId ? "Task assigned" : "Task unassigned");
}

export async function reportIssue(roomId: string, summary: string, urgent: boolean): Promise<OpResult> {
  if (!UUID.test(roomId)) return bad("Choose the room.");
  if (text(summary, 500).length < 3) return bad("Describe the problem in a few words, e.g. “Shower is leaking”.");
  return op("housekeeping.write", (o) => o.reportIssue(roomId, text(summary, 500), Boolean(urgent)), urgent ? "Urgent repair reported — maintenance has been told" : "Repair reported — maintenance has been told");
}

/* ---------------------------------------------------------- room setup */

const money = (n: unknown) => (n === null || n === undefined || n === "" ? null : Math.round(Number(n)));
const rateOk = (n: number | null) => n !== null && Number.isInteger(n) && n >= 500 && n <= 1_000_000;

export async function createRoomType(i: { name: string; tag: string; bed: string; sleeps: number; price: number; weekendPrice: number | null; blurb: string; description: string }): Promise<OpResult> {
  const name = text(i.name, 60);
  const bed = text(i.bed, 80);
  const sleeps = Math.round(Number(i.sleeps));
  const price = money(i.price);
  const weekend = money(i.weekendPrice);
  if (name.length < 3) return bad("Give the room type a name of at least 3 characters.");
  if (i.tag !== "SUITE" && i.tag !== "DELUXE") return bad("Choose Suite or Deluxe.");
  if (bed.length < 2) return bad("Describe the beds, e.g. “Queen-size bed”.");
  if (!Number.isInteger(sleeps) || sleeps < 1 || sleeps > 10) return bad("A room can sleep 1 to 10 guests.");
  if (!rateOk(price)) return bad("Enter a weekday rate between ৳500 and ৳1,000,000.");
  if (weekend !== null && !rateOk(weekend)) return bad("Enter a weekend rate between ৳500 and ৳1,000,000, or leave it empty.");
  return op(
    "rooms.manage",
    (o) => o.createRoomType({ name, tag: i.tag as "SUITE" | "DELUXE", bed, sleeps, price: price!, weekendPrice: weekend, blurb: text(i.blurb, 240), description: text(i.description, 1500) }),
    `${name} created — add rooms and photos, then switch on "Bookable online"`,
  );
}

export async function setRoomTypeAmenities(typeId: string, amenityIds: string[]): Promise<OpResult> {
  if (!UUID.test(typeId) || !Array.isArray(amenityIds) || !amenityIds.every((a) => UUID.test(a))) return bad("Refresh the page and try again.");
  return op("rooms.manage", (o) => o.setRoomTypeAmenities(typeId, [...new Set(amenityIds)].slice(0, 40)), "Amenities saved");
}

export async function addAmenity(name: string, note: string, category: string): Promise<OpResult> {
  const n = text(name, 60);
  if (n.length < 2) return bad("Give the amenity a name.");
  const cat = ["room", "hotel", "dining", "events"].includes(category) ? category : "room";
  const code = n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) + "_" + Math.random().toString(36).slice(2, 6);
  return op("rooms.manage", (o) => o.addAmenity({ code, name: n, note: text(note, 120) || null, category: cat, sort_order: 100 }), `${n} added`);
}

export async function setAmenityActive(id: string, active: boolean): Promise<OpResult> {
  if (!UUID.test(id)) return bad("Refresh the page and try again.");
  return op("rooms.manage", (o) => o.updateAmenity(id, { is_active: Boolean(active) }), active ? "Amenity shown again" : "Amenity hidden");
}

export async function saveSeason(s: { id?: string | null; room_type_id: string; name: string; starts_on: string; ends_on: string; price_bdt: number; weekend_price_bdt: number | null; is_active: boolean }): Promise<OpResult> {
  if (!UUID.test(s.room_type_id) || (s.id && !UUID.test(s.id))) return bad("Choose a room type.");
  if (text(s.name, 80).length < 2) return bad("Name the season, e.g. “Eid holidays”.");
  if (!isISODate(s.starts_on) || !isISODate(s.ends_on) || s.ends_on <= s.starts_on) return bad("The last night must be on or after the first night.");
  const price = money(s.price_bdt);
  const weekend = money(s.weekend_price_bdt);
  if (!rateOk(price)) return bad("Enter a nightly rate between ৳500 and ৳1,000,000.");
  if (weekend !== null && !rateOk(weekend)) return bad("Enter a weekend rate between ৳500 and ৳1,000,000, or leave it empty.");
  return op(
    "rates.manage",
    (o) => o.saveSeason({ ...s, name: text(s.name, 80), price_bdt: price!, weekend_price_bdt: weekend, is_active: Boolean(s.is_active) }),
    s.id ? "Season saved — new bookings use it" : "Season added — new bookings for those nights use this rate",
  );
}

export async function deleteSeason(id: string): Promise<OpResult> {
  if (!UUID.test(id)) return bad("That season no longer exists.");
  return op("rates.manage", (o) => o.deleteSeason(id), "Season removed");
}

/* ---------------------------------------------------------- promotions */

const PCT_OR_AMOUNT = ["percent", "amount"] as const;

export async function savePromotion(id: string | null, p: PromotionInput): Promise<OpResult> {
  if (id && !UUID.test(id)) return bad("That offer no longer exists.");
  const name = text(p.name, 80);
  const code = text(p.code, 20).toUpperCase();
  const value = Math.round(Number(p.discount_value));
  if (name.length < 2) return bad("Give the offer a name guests will understand, e.g. “Midweek 10% off”.");
  if (code && !/^[A-Z0-9]{3,20}$/.test(code)) return bad("A code is 3–20 letters or numbers, no spaces (or leave it empty for an automatic offer).");
  if (!PCT_OR_AMOUNT.includes(p.discount_type)) return bad("Choose a percentage or a fixed amount.");
  if (!Number.isInteger(value) || value < 1 || (p.discount_type === "percent" ? value > 90 : value > 10_000_000)) {
    return bad(p.discount_type === "percent" ? "A percentage discount is between 1% and 90%." : "Enter the amount off in taka.");
  }
  if (!isISODate(p.starts_on) || !isISODate(p.ends_on) || p.ends_on <= p.starts_on) return bad("The offer must end after it starts.");
  if ((p.bookable_from && !isISODate(p.bookable_from)) || (p.bookable_until && !isISODate(p.bookable_until))) return bad("Check the booking window dates.");
  if (p.bookable_from && p.bookable_until && p.bookable_until < p.bookable_from) return bad("The booking window must end after it starts.");
  const nights = Math.round(Number(p.min_nights || 1));
  if (!Number.isInteger(nights) || nights < 1 || nights > 30) return bad("Minimum nights is between 1 and 30.");
  const ids = Array.isArray(p.room_type_ids) ? p.room_type_ids.filter((x) => UUID.test(x)) : [];
  const limit = money(p.max_redemptions);
  const cap = money(p.max_discount_bdt);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) return bad("The number of uses must be at least 1, or empty for no limit.");
  if (cap !== null && (!Number.isInteger(cap) || cap < 1)) return bad("The maximum discount must be at least ৳1, or empty for no cap.");
  const clean: PromotionInput = {
    code: code || null, name, description: text(p.description, 500), discount_type: p.discount_type, discount_value: value,
    starts_on: p.starts_on, ends_on: p.ends_on, min_nights: nights, room_type_ids: ids, is_public: Boolean(p.is_public), is_active: Boolean(p.is_active),
    stackable: Boolean(p.stackable), max_redemptions: limit, max_discount_bdt: cap, bookable_from: p.bookable_from || null, bookable_until: p.bookable_until || null,
  };
  return op("promotions.manage", (o) => o.savePromotion(id, clean), id ? "Offer saved" : clean.is_active ? "Offer created and switched on" : "Offer created — switch it on when you're ready");
}

export async function setPromotionActive(id: string, active: boolean): Promise<OpResult> {
  if (!UUID.test(id)) return bad("That offer no longer exists.");
  return op("promotions.manage", (o) => o.setPromotionActive(id, Boolean(active)), active ? "Offer switched on — guests get it from now" : "Offer switched off");
}

export async function deletePromotion(id: string): Promise<OpResult> {
  if (!UUID.test(id)) return bad("That offer no longer exists.");
  return op("promotions.manage", (o) => o.deletePromotion(id), "Offer deleted");
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

"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PREVIEW_ROLE_COOKIE, requireAdmin, requireManager } from "@/lib/admin/session";
import { previewEnabled } from "@/lib/data";
import { errorCode, errorMessage } from "@/lib/data/errors";
import type { AdminRepo } from "@/lib/data/repo";
import type {
  BookingChange,
  BookingStatus,
  GuestDetails,
  HotelSettings,
  Housekeeping,
  PaymentMethod,
  StaffBookingInput,
  StaffRole,
} from "@/lib/data/types";
import { hotelToday, isISODate } from "@/lib/dates";
import { allow } from "@/lib/rate-limit";
import { getServiceClient, getSessionClient, isSupabaseConfigured } from "@/lib/supabase";

export type ActionResult = { ok: true; message?: string; reference?: string } | { ok: false; message: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STATUSES: BookingStatus[] = ["pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"];
const METHODS: PaymentMethod[] = ["cash", "bkash", "nagad", "card", "bank", "other"];
const HOUSEKEEPING: Housekeeping[] = ["clean", "dirty", "inspected"];

/** Runs a repository change, refreshes admin and public pages, maps errors. */
async function run(fn: () => Promise<unknown>, message?: string): Promise<ActionResult> {
  try {
    const value = await fn();
    revalidatePath("/admin", "layout");
    revalidatePath("/", "layout");
    return { ok: true, message, reference: typeof value === "string" ? value : undefined };
  } catch (err) {
    return { ok: false, message: errorMessage(errorCode(err)) };
  }
}

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/* ---------------------------------------------------------- Bookings */

export async function setBookingStatus(id: string, status: BookingStatus, reason?: string): Promise<ActionResult> {
  const { repo } = await requireAdmin();
  if (!STATUSES.includes(status)) return { ok: false, message: errorMessage("BAD_TRANSITION") };
  return run(() => repo.setStatus(id, status, text(reason, 300) || undefined));
}

export async function assignRoom(id: string, roomId: string | null): Promise<ActionResult> {
  const { repo } = await requireAdmin();
  return run(() => repo.assignRoom(id, roomId || null), roomId ? "Room assigned" : "Room unassigned");
}

export async function modifyBooking(id: string, change: BookingChange): Promise<ActionResult> {
  const { repo } = await requireAdmin();
  if (!isISODate(change.checkIn) || !isISODate(change.checkOut)) return { ok: false, message: errorMessage("BAD_DATES") };
  const counts = [change.rooms, change.adults, change.children];
  if (!counts.every((n) => Number.isInteger(n) && n >= 0)) return { ok: false, message: errorMessage("TOO_MANY_GUESTS") };
  return run(() => repo.modifyBooking(id, change), "Booking updated");
}

export async function recordPayment(id: string, amount: number, method: PaymentMethod, note: string): Promise<ActionResult> {
  const { repo } = await requireAdmin();
  if (!Number.isInteger(amount) || amount <= 0 || !METHODS.includes(method)) {
    return { ok: false, message: errorMessage("BAD_AMOUNT") };
  }
  return run(() => repo.recordPayment(id, amount, method, text(note, 200)), "Payment recorded");
}

export async function updateGuestDetails(id: string, d: GuestDetails): Promise<ActionResult> {
  const { repo } = await requireAdmin();
  const name = text(d.name, 120);
  const email = text(d.email, 160);
  if (name.length < 2) return { ok: false, message: "Enter the guest's name." };
  if (email && !EMAIL_RE.test(email)) return { ok: false, message: errorMessage("BAD_EMAIL") };
  if (text(d.phone, 30).replace(/\D/g, "").length < 6) return { ok: false, message: "Enter a phone number." };
  return run(
    () =>
      repo.updateGuestDetails(id, {
        name,
        email: email || null,
        phone: text(d.phone, 30),
        arrival: text(d.arrival, 60) || null,
        requests: text(d.requests, 1000) || null,
        notes: text(d.notes, 2000) || null,
        airportPickup: Boolean(d.airportPickup),
      }),
    "Details saved",
  );
}

export async function createStaffBooking(input: StaffBookingInput): Promise<ActionResult> {
  const { repo } = await requireAdmin();
  const name = text(input.name, 120);
  const email = text(input.email, 160);
  if (name.length < 2) return { ok: false, message: "Enter the guest's name." };
  if (email && !EMAIL_RE.test(email)) return { ok: false, message: errorMessage("BAD_EMAIL") };
  if (text(input.phone, 30).replace(/\D/g, "").length < 6) return { ok: false, message: "Enter a phone number." };
  if (!isISODate(input.checkIn) || !isISODate(input.checkOut)) return { ok: false, message: errorMessage("BAD_DATES") };
  if (!["phone", "walk_in", "other"].includes(input.source) || !["pending", "confirmed"].includes(input.status)) {
    return { ok: false, message: errorMessage("BAD_TRANSITION") };
  }
  return run(
    () =>
      repo.createStaffBooking({
        ...input,
        name,
        email: email || null,
        phone: text(input.phone, 30),
        country: text(input.country, 60),
        requests: text(input.requests, 1000),
        notes: text(input.notes, 2000),
      }),
    "Booking created",
  );
}

/** Live availability for the new-booking form. */
export async function checkAvailability(checkIn: string, checkOut: string): Promise<Record<string, number> | null> {
  const { repo } = await requireAdmin();
  if (!isISODate(checkIn) || !isISODate(checkOut) || checkOut <= checkIn) return null;
  try {
    return await repo.availability(checkIn, checkOut);
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------- Rooms & rates */

export async function updateRoomType(
  id: string,
  patch: {
    price_bdt?: number;
    weekend_price_bdt?: number | null;
    rack_price_bdt?: number | null;
    is_published?: boolean;
    size_sqft?: number | null;
    blurb?: string;
    description?: string;
  },
): Promise<ActionResult> {
  const { repo } = await requireManager();
  const clean: typeof patch = {};
  const validRate = (n: number) => Number.isInteger(n) && n >= 500 && n <= 1_000_000;
  if (patch.price_bdt !== undefined) {
    if (!validRate(patch.price_bdt)) return { ok: false, message: "Enter a weekday rate between ৳500 and ৳1,000,000." };
    clean.price_bdt = patch.price_bdt;
  }
  if (patch.weekend_price_bdt !== undefined) {
    if (patch.weekend_price_bdt !== null && !validRate(patch.weekend_price_bdt)) {
      return { ok: false, message: "Enter a weekend rate between ৳500 and ৳1,000,000, or leave it empty." };
    }
    clean.weekend_price_bdt = patch.weekend_price_bdt;
  }
  if (patch.rack_price_bdt !== undefined) {
    if (patch.rack_price_bdt !== null && !validRate(patch.rack_price_bdt)) {
      return { ok: false, message: "Enter a published rate between ৳500 and ৳1,000,000, or leave it empty." };
    }
    clean.rack_price_bdt = patch.rack_price_bdt;
  }
  if (patch.is_published !== undefined) clean.is_published = Boolean(patch.is_published);
  if (patch.size_sqft !== undefined) {
    if (patch.size_sqft !== null && (!Number.isInteger(patch.size_sqft) || patch.size_sqft < 50 || patch.size_sqft > 5000)) {
      return { ok: false, message: "Enter a room size between 50 and 5,000 sq ft, or leave it empty." };
    }
    clean.size_sqft = patch.size_sqft;
  }
  if (patch.blurb !== undefined) clean.blurb = text(patch.blurb, 240);
  if (patch.description !== undefined) clean.description = text(patch.description, 800);
  return run(() => repo.updateRoomType(id, clean), "Saved — the website shows the change now");
}

export async function updateRoom(
  id: string,
  patch: { housekeeping?: Housekeeping; out_of_service?: boolean; service_note?: string | null },
): Promise<ActionResult> {
  const { repo, staff } = await requireAdmin();
  if (patch.housekeeping && !HOUSEKEEPING.includes(patch.housekeeping)) return { ok: false, message: "Unknown status." };
  if (patch.out_of_service !== undefined && staff.role !== "manager") {
    return { ok: false, message: errorMessage("NOT_MANAGER") };
  }
  return run(() =>
    repo.updateRoom(id, {
      ...(patch.housekeeping ? { housekeeping: patch.housekeeping } : {}),
      ...(patch.out_of_service !== undefined ? { out_of_service: Boolean(patch.out_of_service) } : {}),
      ...(patch.service_note !== undefined ? { service_note: text(patch.service_note, 300) || null } : {}),
    }),
  );
}

/* ---------------------------------------------------------- Room setup (managers) */

const unitInput = (input: { number: string; room_type_id: string; floor: string | null }) => ({
  number: text(input.number, 10),
  room_type_id: text(input.room_type_id, 64),
  floor: text(input.floor, 20) || null,
});

export async function addRoom(input: { number: string; room_type_id: string; floor: string | null }): Promise<ActionResult> {
  const { repo } = await requireManager();
  const clean = unitInput(input);
  return run(() => repo.addRoom(clean).then(() => undefined), `Room ${clean.number.toUpperCase()} added — it's on sale now`);
}

export async function editRoom(
  id: string,
  input: { number: string; room_type_id: string; floor: string | null },
): Promise<ActionResult> {
  const { repo } = await requireManager();
  const clean = unitInput(input);
  return run(() => repo.editRoom(id, clean), `Room ${clean.number.toUpperCase()} saved`);
}

export async function deleteRoom(id: string): Promise<ActionResult> {
  const { repo } = await requireManager();
  return run(() => repo.deleteRoom(id), "Room removed");
}

/* ---------------------------------------------------------- Room photos (managers) */

const PHOTO_BUCKET = "room-photos";
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 12;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public URL prefix of the photo bucket; uploaded gallery entries start with it. */
function photoUrlPrefix(): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/`;
}

async function findRoomType(repo: AdminRepo, id: string) {
  return (await repo.listRoomTypes({ includeUnpublished: true })).find((t) => t.id === id) ?? null;
}

export async function uploadRoomPhoto(roomTypeId: string, form: FormData): Promise<ActionResult> {
  const { mode, repo } = await requireManager();
  if (mode === "preview") return { ok: false, message: "Photo uploads need Supabase. Connect it to add real photos." };
  if (!UUID_RE.test(roomTypeId)) return { ok: false, message: errorMessage("NO_ROOM") };
  const file = form.get("photo");
  if (!(file instanceof File) || !PHOTO_TYPES[file.type] || file.size === 0 || file.size > MAX_PHOTO_BYTES) {
    return { ok: false, message: errorMessage("BAD_PHOTO") };
  }
  const type = await findRoomType(repo, roomTypeId);
  if (!type) return { ok: false, message: errorMessage("NO_ROOM") };
  if (type.gallery.length >= MAX_PHOTOS) return { ok: false, message: errorMessage("PHOTO_LIMIT") };

  const db = await getSessionClient();
  const path = `${roomTypeId}/${crypto.randomUUID()}.${PHOTO_TYPES[file.type]}`;
  const bucket = db.storage.from(PHOTO_BUCKET);
  const { error } = await bucket.upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) {
    console.error("Photo upload:", error.message);
    return { ok: false, message: "The photo couldn't be uploaded. Try again." };
  }
  const url = bucket.getPublicUrl(path).data.publicUrl;
  const result = await run(() => repo.updateRoomType(roomTypeId, { gallery: [...type.gallery, url] }), "Photo added");
  if (!result.ok) await bucket.remove([path]);
  return result;
}

/**
 * Reorders or removes photos (the first is the cover). Only photos already in
 * the gallery are accepted; removed uploads are deleted from storage.
 */
export async function setRoomGallery(roomTypeId: string, gallery: string[]): Promise<ActionResult> {
  const { mode, repo } = await requireManager();
  const type = await findRoomType(repo, roomTypeId);
  if (!type) return { ok: false, message: errorMessage("NO_ROOM") };
  const next = [...new Set(gallery.map((g) => String(g)))];
  if (!next.every((g) => type.gallery.includes(g))) return { ok: false, message: "Refresh the page and try again." };

  const result = await run(() => repo.updateRoomType(roomTypeId, { gallery: next }), "Photos saved");
  if (result.ok && mode === "live") {
    const prefix = photoUrlPrefix();
    const removed = type.gallery.filter((g) => !next.includes(g) && g.startsWith(prefix)).map((g) => g.slice(prefix.length));
    if (removed.length) {
      const { error } = await (await getSessionClient()).storage.from(PHOTO_BUCKET).remove(removed);
      if (error) console.error("Photo cleanup:", error.message);
    }
  }
  return result;
}

/* ---------------------------------------------------------- Settings & team */

export async function updateSettings(patch: Partial<HotelSettings>): Promise<ActionResult> {
  const { repo } = await requireManager();
  const pct = (v: unknown) => {
    if (v === null || v === "" || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 50 ? Math.round(n * 100) / 100 : NaN;
  };
  const vat = pct(patch.vat_percent);
  const svc = pct(patch.service_charge_percent);
  if (Number.isNaN(vat) || Number.isNaN(svc)) return { ok: false, message: "Rates must be between 0 and 50%." };
  return run(
    () =>
      repo.updateSettings({
        cancellation_policy: text(patch.cancellation_policy, 600),
        children_policy: text(patch.children_policy, 600),
        confirm_call_within: text(patch.confirm_call_within, 40),
        vat_percent: vat,
        service_charge_percent: svc,
      }),
    "Policies saved — the website shows them now",
  );
}

export async function inviteStaff(email: string, fullName: string, role: StaffRole): Promise<ActionResult> {
  const { mode } = await requireManager();
  if (mode === "preview") return { ok: false, message: "Invitations need Supabase. Connect it to add real staff." };
  const service = getServiceClient();
  if (!service) return { ok: false, message: "Add SUPABASE_SERVICE_ROLE_KEY on the server to invite staff." };
  const addr = text(email, 160).toLowerCase();
  const name = text(fullName, 80);
  if (!EMAIL_RE.test(addr) || name.length < 2 || !["manager", "front_desk"].includes(role)) {
    return { ok: false, message: "Enter a name, a valid email and a role." };
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const { data, error } = await service.auth.admin.inviteUserByEmail(addr, {
    redirectTo: `${site}/admin/auth/confirm?next=/admin/account`,
  });
  if (error || !data.user) return { ok: false, message: error?.message ?? "The invitation couldn't be sent." };
  const { error: insertError } = await service
    .from("staff")
    .upsert({ user_id: data.user.id, full_name: name, role, active: true });
  if (insertError) return { ok: false, message: "Invited, but the staff record couldn't be saved. Try again." };
  revalidatePath("/admin/settings");
  return { ok: true, message: `Invitation sent to ${addr}` };
}

export async function updateStaffMember(userId: string, patch: { role?: StaffRole; active?: boolean }): Promise<ActionResult> {
  const { mode, staff } = await requireManager();
  if (mode === "preview") return { ok: false, message: "Team changes need Supabase." };
  if (userId === staff.id) return { ok: false, message: "You can't change your own role or access." };
  const service = getServiceClient();
  if (!service) return { ok: false, message: "Add SUPABASE_SERVICE_ROLE_KEY on the server to manage staff." };
  const update: { role?: StaffRole; active?: boolean } = {};
  if (patch.role && ["manager", "front_desk"].includes(patch.role)) update.role = patch.role;
  if (patch.active !== undefined) update.active = Boolean(patch.active);
  const { error } = await service.from("staff").update(update).eq("user_id", userId);
  if (error) return { ok: false, message: "That change couldn't be saved." };
  revalidatePath("/admin/settings");
  return { ok: true, message: "Team updated" };
}

/* ---------------------------------------------------------- Auth */

export async function signIn(_: unknown, form: FormData): Promise<{ error: string } | undefined> {
  if (!isSupabaseConfigured()) redirect(previewEnabled() ? "/admin" : "/admin/setup");
  const email = text(form.get("email"), 160).toLowerCase();
  const password = String(form.get("password") ?? "");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(`signin:${ip}`, 8, 15 * 60_000) || !allow(`signin:${email}`, 8, 15 * 60_000)) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }
  if (!EMAIL_RE.test(email) || !password) return { error: "Enter your email and password." };

  const db = await getSessionClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  // One message for both cases, so the form doesn't reveal which emails have accounts.
  if (error) return { error: "That email and password don't match." };
  redirect("/admin");
}

export async function sendPasswordReset(_: unknown, form: FormData): Promise<{ error?: string; sent?: boolean }> {
  if (!isSupabaseConfigured()) return { error: "Supabase isn't connected yet." };
  const email = text(form.get("email"), 160).toLowerCase();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(`reset:${ip}`, 5, 15 * 60_000)) return { error: "Too many requests. Try again later." };
  if (!EMAIL_RE.test(email)) return { error: "Enter your email address." };
  const db = await getSessionClient();
  await db.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/auth/confirm?next=/admin/account`,
  });
  // Same response whether or not the account exists.
  return { sent: true };
}

export async function updatePassword(_: unknown, form: FormData): Promise<{ error?: string; done?: boolean }> {
  await requireAdmin();
  if (!isSupabaseConfigured()) return { error: "Passwords are managed in Supabase. Connect it first." };
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < 10) return { error: "Use at least 10 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };
  const db = await getSessionClient();
  const { error } = await db.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { done: true };
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const db = await getSessionClient();
    await db.auth.signOut();
  }
  redirect(isSupabaseConfigured() ? "/admin/login" : "/");
}

export type QuickResult = {
  reference: string;
  guest: string;
  phone: string;
  status: BookingStatus;
  checkIn: string;
  checkOut: string;
};

/** Command palette: the best few booking matches for a name, phone, email or reference. */
export async function quickSearch(q: string): Promise<QuickResult[]> {
  const { repo } = await requireAdmin();
  const term = text(q, 60);
  if (term.length < 2) return [];
  const { rows } = await repo.listBookings({ view: "all", q: term, page: 1, pageSize: 6, today: hotelToday() });
  return rows.map((b) => ({
    reference: b.reference,
    guest: b.guest_name,
    phone: b.phone,
    status: b.status,
    checkIn: b.check_in,
    checkOut: b.check_out,
  }));
}

/** Preview only: look at the desk as a manager or as front-desk staff. */
export async function setPreviewRole(role: StaffRole): Promise<void> {
  if (!previewEnabled()) return;
  (await cookies()).set(PREVIEW_ROLE_COOKIE, role === "front_desk" ? "front_desk" : "manager", {
    httpOnly: true,
    sameSite: "lax",
    path: "/admin",
  });
  revalidatePath("/admin", "layout");
}

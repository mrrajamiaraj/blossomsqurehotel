"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PREVIEW_ROLE_COOKIE, requireAdmin, requirePermission } from "@/lib/admin/session";
import { assignableRoles, isStaffRole } from "@/lib/access";
import { CmsRepo } from "@/lib/cms/repo";
import { previewEnabled } from "@/lib/data";
import { errorCode, errorMessage } from "@/lib/data/errors";
import type { AdminRepo } from "@/lib/data/repo";
import type {
  BookingChange,
  BookingStatus,
  GuestDetails,
  HotelSettings,
  Housekeeping,
  InquiryStatus,
  PaymentMethod,
  StaffBookingInput,
  StaffRole,
} from "@/lib/data/types";
import { hotelToday, isISODate } from "@/lib/dates";
import { kickOutbox } from "@/lib/messaging/worker";
import { allow } from "@/lib/rate-limit";
import { getServiceClient, getSessionClient, isSupabaseConfigured } from "@/lib/supabase";

export type ActionResult = { ok: true; message?: string; reference?: string } | { ok: false; message: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STATUSES: BookingStatus[] = ["pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"];
const METHODS: PaymentMethod[] = ["cash", "bkash", "nagad", "card", "bank", "other"];
const HOUSEKEEPING: Housekeeping[] = ["dirty", "cleaning", "clean", "inspected"];

/** Runs a repository change, refreshes admin and public pages, maps errors. */
async function run(fn: () => Promise<unknown>, message?: string): Promise<ActionResult> {
  try {
    const value = await fn();
    revalidatePath("/admin", "layout");
    revalidatePath("/", "layout");
    kickOutbox(); // status changes, payments and edits may have queued guest messages
    return { ok: true, message, reference: typeof value === "string" ? value : undefined };
  } catch (err) {
    return { ok: false, message: errorMessage(errorCode(err)) };
  }
}

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/* ---------------------------------------------------------- Enquiries */

const INQUIRY_STATUSES: InquiryStatus[] = ["new", "handled", "spam"];

export async function setInquiryStatus(id: string, status: InquiryStatus): Promise<ActionResult> {
  const { repo } = await requireAdmin();
  if (!INQUIRY_STATUSES.includes(status)) return { ok: false, message: errorMessage("BAD_INQUIRY") };
  return run(() => repo.setInquiryStatus(String(id).slice(0, 60), status), status === "handled" ? "Marked as handled" : status === "spam" ? "Marked as spam" : "Moved back to new");
}

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

const UUID = /^[0-9a-f-]{36}(:\d+)?$/i;

export async function assignRoomLine(lineId: string, roomId: string | null): Promise<ActionResult> {
  const { repo } = await requireAdmin();
  if (!UUID.test(String(lineId)) || (roomId && !UUID.test(roomId))) return { ok: false, message: errorMessage("NOT_FOUND") };
  return run(() => repo.assignRoomLine(lineId, roomId || null), roomId ? "Room assigned" : "Room unassigned");
}

export async function autoAssignRooms(id: string): Promise<ActionResult> {
  const { repo } = await requireAdmin();
  try {
    const n = await repo.autoAssign(id);
    revalidatePath("/admin", "layout");
    return { ok: true, message: n ? `${n} ${n === 1 ? "room" : "rooms"} assigned` : "Every room is already assigned" };
  } catch (err) {
    return { ok: false, message: errorMessage(errorCode(err)) };
  }
}

export async function resolveBookingRequest(requestId: string, status: "done" | "declined"): Promise<ActionResult> {
  const { repo } = await requireAdmin();
  if (status !== "done" && status !== "declined") return { ok: false, message: errorMessage("BAD_TRANSITION") };
  return run(() => repo.resolveRequest(requestId, status), status === "done" ? "Marked as done" : "Request declined");
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
  const { repo } = await requirePermission("rates.manage");
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

/** Name, beds, occupancy and descriptions of a room type (room setup, not prices). */
export async function updateRoomTypeDetails(
  id: string,
  d: { name: string; tag: string; bed: string; sleeps: number; view: string; size_sqft: number | null; blurb: string; description: string; features: string[] },
): Promise<ActionResult> {
  const { repo } = await requirePermission("rooms.manage");
  if (!UUID_RE.test(id)) return { ok: false, message: errorMessage("NO_ROOM") };
  const name = text(d.name, 60);
  const bed = text(d.bed, 80);
  const sleeps = Math.round(Number(d.sleeps));
  if (name.length < 3) return { ok: false, message: "Give the room type a name of at least 3 characters." };
  if (d.tag !== "SUITE" && d.tag !== "DELUXE") return { ok: false, message: "Choose Suite or Deluxe." };
  if (bed.length < 2) return { ok: false, message: "Describe the beds, e.g. “Queen-size bed”." };
  if (!Number.isInteger(sleeps) || sleeps < 1 || sleeps > 10) return { ok: false, message: "A room can sleep 1 to 10 guests." };
  const size = d.size_sqft === null || (d.size_sqft as unknown) === "" ? null : Math.round(Number(d.size_sqft));
  if (size !== null && (!Number.isInteger(size) || size < 50 || size > 5000)) return { ok: false, message: "Enter a room size between 50 and 5,000 sq ft, or leave it empty." };
  const features = (Array.isArray(d.features) ? d.features : []).map((f) => text(f, 60)).filter(Boolean).slice(0, 16);
  return run(
    () =>
      repo.updateRoomType(id, {
        name, tag: d.tag as "SUITE" | "DELUXE", bed, sleeps, view: text(d.view, 40), size_sqft: size,
        blurb: text(d.blurb, 240), description: text(d.description, 1500), features,
      }),
    "Room details saved — the website shows them now",
  );
}

export async function updateRoom(
  id: string,
  patch: { housekeeping?: Housekeeping; out_of_service?: boolean; service_note?: string | null },
): Promise<ActionResult> {
  const { repo, access } = await requireAdmin();
  if (patch.housekeeping && !HOUSEKEEPING.includes(patch.housekeeping)) return { ok: false, message: "Unknown status." };
  if (patch.out_of_service !== undefined && !access.permissions.includes("maintenance.manage")) {
    return { ok: false, message: errorMessage("NOT_ALLOWED") };
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
  const { repo } = await requirePermission("rooms.manage");
  const clean = unitInput(input);
  return run(() => repo.addRoom(clean).then(() => undefined), `Room ${clean.number.toUpperCase()} added — it's on sale now`);
}

export async function editRoom(
  id: string,
  input: { number: string; room_type_id: string; floor: string | null },
): Promise<ActionResult> {
  const { repo } = await requirePermission("rooms.manage");
  const clean = unitInput(input);
  return run(() => repo.editRoom(id, clean), `Room ${clean.number.toUpperCase()} saved`);
}

export async function deleteRoom(id: string): Promise<ActionResult> {
  const { repo } = await requirePermission("rooms.manage");
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

/** Room wording and photos: managers (rooms.manage) and content editors (content.manage). */
async function requireRoomCopy() {
  const ctx = await requireAdmin();
  if (!ctx.access.permissions.includes("rooms.manage") && !ctx.access.permissions.includes("content.manage")) return null;
  return ctx;
}

/** Writes a gallery through the database function that checks every entry. */
async function saveGallery(repo: AdminRepo, mode: string, roomTypeId: string, gallery: string[]) {
  if (mode === "preview") return repo.updateRoomType(roomTypeId, { gallery });
  const db = await getSessionClient();
  const { error } = await db.rpc("admin_set_room_gallery", { p_type: roomTypeId, p_gallery: gallery });
  if (error) throw new Error(error.message);
}

/** How a room type is described: one-liner, description, features, view. Not its name, beds, occupancy or price. */
export async function updateRoomCopy(id: string, d: { blurb: string; description: string; features: string[]; view: string }): Promise<ActionResult> {
  const ctx = await requireRoomCopy();
  if (!ctx) return { ok: false, message: errorMessage("NOT_ALLOWED") };
  if (!UUID_RE.test(id)) return { ok: false, message: errorMessage("NO_ROOM") };
  const features = (Array.isArray(d.features) ? d.features : []).map((f) => text(f, 60)).filter(Boolean).slice(0, 16);
  const copy = { blurb: text(d.blurb, 240), description: text(d.description, 1500), features, view: text(d.view, 40) };
  if (ctx.mode === "preview") return run(() => ctx.repo.updateRoomType(id, copy), "Room wording saved");
  return run(async () => {
    const db = await getSessionClient();
    const { error } = await db.rpc("admin_update_room_copy", { p_type: id, p_blurb: copy.blurb, p_description: copy.description, p_features: copy.features, p_view: copy.view });
    if (error) throw new Error(error.message);
  }, "Room wording saved — the website shows it now");
}

export async function uploadRoomPhoto(roomTypeId: string, form: FormData): Promise<ActionResult> {
  const ctx = await requireRoomCopy();
  if (!ctx) return { ok: false, message: errorMessage("NOT_ALLOWED") };
  const { mode, repo } = ctx;
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
  const result = await run(() => saveGallery(repo, mode, roomTypeId, [...type.gallery, url]), "Photo added");
  if (!result.ok) {
    await bucket.remove([path]);
    return result;
  }
  // Listed in the photo library too (so it can be described, found and replaced).
  const dims = (k: string) => {
    const n = Math.round(Number(form.get(k)));
    return Number.isFinite(n) && n >= 1 && n <= 12000 ? n : null;
  };
  await new CmsRepo(db)
    .registerMedia({ bucket: PHOTO_BUCKET, path, url, alt: `${type.name} photo`, folder: "rooms", width: dims("width"), height: dims("height"), bytes: file.size, mime: file.type })
    .catch((err) => console.error("Photo library:", err));
  return result;
}

/**
 * Reorders or removes photos (the first is the cover). Only photos already in
 * the gallery are accepted; removed uploads are deleted from storage.
 */
export async function setRoomGallery(roomTypeId: string, gallery: string[]): Promise<ActionResult> {
  const ctx = await requireRoomCopy();
  if (!ctx) return { ok: false, message: errorMessage("NOT_ALLOWED") };
  const { mode, repo } = ctx;
  const type = await findRoomType(repo, roomTypeId);
  if (!type) return { ok: false, message: errorMessage("NO_ROOM") };
  const next = [...new Set(gallery.map((g) => String(g)))];
  if (!next.every((g) => type.gallery.includes(g))) return { ok: false, message: "Refresh the page and try again." };

  const result = await run(() => saveGallery(repo, mode, roomTypeId, next), "Photos saved");
  if (result.ok && mode === "live") {
    const prefix = photoUrlPrefix();
    const removed = type.gallery.filter((g) => !next.includes(g) && g.startsWith(prefix));
    if (removed.length) {
      const db = await getSessionClient();
      const cms = new CmsRepo(db);
      const library = await cms.media().catch(() => []);
      const keep: string[] = [];
      for (const url of removed) {
        const asset = library.find((m) => m.url === url);
        // Still used elsewhere (another room or a page)? Then keep the file.
        if (asset) await cms.deleteMedia(asset.id).catch(() => keep.push(url));
      }
      const paths = removed.filter((u) => !keep.includes(u)).map((g) => g.slice(prefix.length));
      if (paths.length) {
        const { error } = await db.storage.from(PHOTO_BUCKET).remove(paths);
        if (error) console.error("Photo cleanup:", error.message);
      }
    }
  }
  return result;
}

/* ---------------------------------------------------------- Settings & team */

export async function updateSettings(patch: Partial<HotelSettings>): Promise<ActionResult> {
  const { repo } = await requirePermission("settings.manage");
  const pct = (v: unknown) => {
    if (v === null || v === "" || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 50 ? Math.round(n * 100) / 100 : NaN;
  };
  const vat = pct(patch.vat_percent);
  const svc = pct(patch.service_charge_percent);
  if (Number.isNaN(vat) || Number.isNaN(svc)) return { ok: false, message: "Rates must be between 0 and 50%." };
  const share = (v: unknown, max: number) => {
    if (v === null || v === "" || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : NaN;
  };
  const advance = share(patch.advance_percent, 100);
  const maxDiscount = patch.max_discount_percent === undefined ? undefined : share(patch.max_discount_percent, 90);
  if (Number.isNaN(advance)) return { ok: false, message: "The advance is between 0 and 100% (or empty for pay at the hotel only)." };
  if (maxDiscount !== undefined && (maxDiscount === null || Number.isNaN(maxDiscount))) return { ok: false, message: "The maximum total discount is between 0 and 90%." };
  return run(
    () =>
      repo.updateSettings({
        cancellation_policy: text(patch.cancellation_policy, 600),
        children_policy: text(patch.children_policy, 600),
        confirm_call_within: text(patch.confirm_call_within, 40),
        vat_percent: vat,
        service_charge_percent: svc,
        ...(patch.advance_percent !== undefined ? { advance_percent: advance } : {}),
        ...(maxDiscount !== undefined ? { max_discount_percent: maxDiscount as number } : {}),
      }),
    "Policies saved — the website shows them now",
  );
}

/**
 * Invites a colleague. The secret key is used only to create the Auth user
 * and send the email; the staff row is written by admin_upsert_staff() as the
 * signed-in manager, so the database applies the rank rules (you can only
 * appoint below yourself) and the audit log records who did it.
 */
export async function inviteStaff(email: string, fullName: string, role: StaffRole): Promise<ActionResult> {
  const { mode, staff } = await requirePermission("staff.manage");
  if (mode === "preview") return { ok: false, message: "Invitations need Supabase. Connect it to add real staff." };
  const addr = text(email, 160).toLowerCase();
  const name = text(fullName, 80);
  if (!EMAIL_RE.test(addr) || name.length < 2 || !isStaffRole(role)) {
    return { ok: false, message: "Enter a name, a valid email and a role." };
  }
  if (!assignableRoles(staff.role).includes(role)) return { ok: false, message: errorMessage("RANK") };
  const service = getServiceClient();
  if (!service) return { ok: false, message: "Add SUPABASE_SECRET_KEY on the server to invite staff." };

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const { data, error } = await service.auth.admin.inviteUserByEmail(addr, {
    redirectTo: `${site}/admin/auth/confirm?next=/admin/account`,
  });
  if (error || !data.user) return { ok: false, message: error?.message ?? "The invitation couldn't be sent." };

  const db = await getSessionClient();
  const { error: staffError } = await db.rpc("admin_upsert_staff", { p_user: data.user.id, p_full_name: name, p_role: role });
  if (staffError) {
    // Don't leave a half-made account behind.
    await service.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    return { ok: false, message: errorMessage(errorCode(new Error(staffError.message))) };
  }
  revalidatePath("/admin/team");
  return { ok: true, message: `Invitation sent to ${addr}` };
}

/** Role and access changes run as the signed-in manager; the database enforces rank, self-change and last-owner rules. */
export async function updateStaffMember(userId: string, patch: { role?: StaffRole; active?: boolean }): Promise<ActionResult> {
  const { mode, staff } = await requirePermission("staff.manage");
  if (mode === "preview") return { ok: false, message: "Team changes need Supabase." };
  if (userId === staff.id) return { ok: false, message: errorMessage("SELF_CHANGE") };
  if (!UUID_RE.test(userId)) return { ok: false, message: errorMessage("NOT_FOUND") };
  const db = await getSessionClient();
  if (patch.role !== undefined) {
    if (!isStaffRole(patch.role)) return { ok: false, message: errorMessage("BAD_ROLE") };
    const { error } = await db.rpc("admin_set_staff_role", { p_user: userId, p_role: patch.role });
    if (error) return { ok: false, message: errorMessage(errorCode(new Error(error.message))) };
  }
  if (patch.active !== undefined) {
    const { error } = await db.rpc("admin_set_staff_active", { p_user: userId, p_active: Boolean(patch.active) });
    if (error) return { ok: false, message: errorMessage(errorCode(new Error(error.message))) };
    // The database already refuses everything to an inactive account; also end
    // their sign-in so open sessions stop at once (and allow it again on restore).
    const service = getServiceClient();
    if (service) {
      const { error: banError } = await service.auth.admin.updateUserById(userId, { ban_duration: patch.active ? "none" : "876000h" });
      if (banError) console.error("Sign-in ban:", banError.message);
    }
  }
  revalidatePath("/admin/team");
  revalidatePath("/admin/settings");
  return { ok: true, message: patch.active === false ? "Access removed — they've been signed out" : patch.active ? "Access restored" : "Role changed" };
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
  (await cookies()).set(PREVIEW_ROLE_COOKIE, isStaffRole(role) ? role : "manager", {
    httpOnly: true,
    sameSite: "lax",
    path: "/admin",
  });
  revalidatePath("/admin", "layout");
}

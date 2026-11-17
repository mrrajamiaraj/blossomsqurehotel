import "server-only";
import { addDays, hotelToday, nightsBetween } from "../dates";
import { stayCost } from "../pricing";
import { ROLE_PERMISSIONS, type Permission, type StaffRole } from "../access";
import { RepoError } from "./errors";
import { buildPreviewBookings, PREVIEW_ROOM_TYPES, PREVIEW_ROOMS, PREVIEW_STAFF } from "./preview-seed";
import { DEFAULT_SETTINGS, type AdminRepo } from "./repo";
import { canTransition, cleanSearch, guestsFit, isLive, matchesView, overlaps, paymentStatus, SOLD_STATUSES, viewSpec } from "./rules";
import type {
  ActivityItem,
  Booking,
  BookingChange,
  BookingEvent,
  BookingFilter,
  BookingStatus,
  GuestBookingView,
  GuestDetails,
  GuestSummary,
  HotelSettings,
  Inquiry,
  InquiryInput,
  InquiryStatus,
  PaymentMethod,
  RoomPatch,
  RoomTypePatch,
  RoomTypeRecord,
  RoomUnit,
  RoomUnitInput,
  StaffBookingInput,
  StaffMember,
  WebsiteBookingInput,
} from "./types";

/**
 * Development-only, in-memory hotel used while Supabase isn't connected, so
 * the admin can be explored end to end. It applies the same rules as the SQL
 * functions. State lives for the life of the dev server.
 */

type Store = {
  roomTypes: RoomTypeRecord[];
  rooms: RoomUnit[];
  bookings: Booking[];
  events: BookingEvent[];
  settings: HotelSettings;
  nextEvent: number;
  inquiries?: Inquiry[];
};

const g = globalThis as unknown as { __bsqPreview?: Store };

function store(): Store {
  if (!g.__bsqPreview) {
    const today = hotelToday();
    const { bookings, events } = buildPreviewBookings(today);
    const rooms = structuredClone(PREVIEW_ROOMS);
    // Rooms vacated today still need cleaning.
    for (const b of bookings) {
      if (b.status === "checked_out" && b.check_out === today && b.room_id) {
        const r = rooms.find((x) => x.id === b.room_id);
        if (r) r.housekeeping = "dirty";
      }
    }
    g.__bsqPreview = {
      roomTypes: structuredClone(PREVIEW_ROOM_TYPES),
      rooms,
      bookings,
      events,
      settings: { ...DEFAULT_SETTINGS },
      nextEvent: events.length + 1,
    };
  }
  return g.__bsqPreview;
}

export type PreviewActor = { name: string; role: StaffRole | "guest" };

export class PreviewRepo implements AdminRepo {
  readonly mode = "preview" as const;

  constructor(private actor: PreviewActor = { name: "Guest (website)", role: "guest" }) {}

  private requireStaff() {
    if (this.actor.role === "guest") throw new RepoError("NOT_STAFF");
  }

  /** Mirrors the database: staff, then the specific permission (writes). */
  private requirePermission(p: Permission) {
    this.requireStaff();
    if (this.actor.role === "guest" || !ROLE_PERMISSIONS[this.actor.role].includes(p)) throw new RepoError("NOT_ALLOWED");
  }

  private log(bookingId: string, kind: BookingEvent["kind"], detail: Record<string, unknown>) {
    const s = store();
    s.events.push({
      id: s.nextEvent++,
      booking_id: bookingId,
      kind,
      detail,
      actor_name: this.actor.name,
      created_at: new Date().toISOString(),
    });
  }

  private find(id: string): Booking {
    const b = store().bookings.find((x) => x.id === id);
    if (!b) throw new RepoError("NOT_FOUND");
    return b;
  }

  private touch(b: Booking) {
    b.updated_at = new Date().toISOString();
  }

  private freeUnits(typeId: string, checkIn: string, checkOut: string, exclude?: string): number {
    const s = store();
    const sellable = s.rooms.filter((r) => r.room_type_id === typeId && !r.out_of_service).length;
    const taken = s.bookings
      .filter((b) => b.room_type_id === typeId && isLive(b.status) && b.id !== exclude)
      .filter((b) => overlaps(b.check_in, b.check_out, checkIn, checkOut))
      .reduce((n, b) => n + b.rooms, 0);
    return sellable - taken;
  }

  /** Mirrors the no_overlapping_room exclusion constraint. */
  private roomClash(roomId: string, checkIn: string, checkOut: string, exclude: string): boolean {
    return store().bookings.some(
      (b) => b.room_id === roomId && b.id !== exclude && isLive(b.status) && overlaps(b.check_in, b.check_out, checkIn, checkOut),
    );
  }

  private insert(
    input: Omit<StaffBookingInput, "source" | "status" | "email"> & {
      email: string | null;
      arrival: string | null;
      source: Booking["source"];
      status: "pending" | "confirmed";
    },
  ): string {
    const s = store();
    const today = hotelToday();
    if (input.checkIn < today) throw new RepoError("PAST_DATE");
    const nights = nightsBetween(input.checkIn, input.checkOut);
    if (nights < 1 || nights > 30) throw new RepoError("BAD_DATES");
    const type = s.roomTypes.find((t) => t.slug === input.room);
    if (!type || (input.source === "website" && !type.is_published)) throw new RepoError("NO_ROOM");
    if (!guestsFit(type.sleeps, input.rooms, input.adults, input.children)) throw new RepoError("TOO_MANY_GUESTS");
    if (this.freeUnits(type.id, input.checkIn, input.checkOut) < input.rooms) throw new RepoError("SOLD_OUT");

    let reference: string;
    do reference = `BSQ-${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`;
    while (s.bookings.some((b) => b.reference === reference));

    const cost = stayCost(type, input.checkIn, input.checkOut, input.rooms);
    const now = new Date().toISOString();
    const booking: Booking = {
      id: crypto.randomUUID(),
      reference,
      room_type_id: type.id,
      room_id: null,
      rooms: input.rooms,
      check_in: input.checkIn,
      check_out: input.checkOut,
      adults: input.adults,
      children: input.children,
      guest_name: input.name.trim(),
      email: input.email?.trim().toLowerCase() || null,
      phone: input.phone.trim(),
      country: input.country?.trim() || null,
      arrival_window: input.arrival?.trim() || null,
      special_requests: input.requests?.trim() || null,
      internal_notes: input.notes?.trim() || null,
      airport_pickup: input.airportPickup,
      source: input.source,
      nightly_rate_bdt: cost.average,
      total_bdt: cost.total,
      amount_paid_bdt: 0,
      payment_status: "unpaid",
      status: input.status,
      cancel_reason: null,
      confirmed_at: input.status === "confirmed" ? now : null,
      checked_in_at: null,
      checked_out_at: null,
      cancelled_at: null,
      created_at: now,
      updated_at: now,
    };
    s.bookings.push(booking);
    this.log(booking.id, "created", { source: input.source, status: input.status });
    return reference;
  }

  /* ---------- Public ---------- */

  async listRoomTypes(opts: { includeUnpublished?: boolean } = {}) {
    return store()
      .roomTypes.filter((t) => opts.includeUnpublished || t.is_published)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((t) => ({ ...t }));
  }

  async availability(checkIn: string, checkOut: string) {
    return Object.fromEntries(
      store()
        .roomTypes.filter((t) => t.is_published)
        .map((t) => [t.slug, Math.max(0, this.freeUnits(t.id, checkIn, checkOut))]),
    );
  }

  async getSettings() {
    return { ...store().settings };
  }

  async createWebsiteBooking(input: WebsiteBookingInput) {
    const s = store();
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const recent = s.bookings.filter(
      (b) =>
        b.source === "website" &&
        b.created_at > hourAgo &&
        (b.phone === input.phone.trim() || b.email === input.email.trim().toLowerCase()),
    ).length;
    if (recent >= 3) throw new RepoError("RATE_LIMITED");
    return this.insert({ ...input, notes: "", source: "website", status: "pending" });
  }

  async lookupBooking(reference: string, contact: string): Promise<GuestBookingView | null> {
    const ref = reference.trim().toUpperCase();
    const email = contact.trim().toLowerCase();
    const digits = contact.replace(/\D/g, "").slice(-10);
    const s = store();
    const b = s.bookings.find(
      (x) =>
        x.reference === ref &&
        ((x.email !== null && x.email.toLowerCase() === email) ||
          (digits.length >= 8 && x.phone.replace(/\D/g, "").slice(-10) === digits)),
    );
    if (!b) return null;
    return {
      reference: b.reference,
      status: b.status,
      room_name: s.roomTypes.find((t) => t.id === b.room_type_id)?.name ?? "Room",
      check_in: b.check_in,
      check_out: b.check_out,
      rooms: b.rooms,
      adults: b.adults,
      children: b.children,
      total_bdt: b.total_bdt,
      amount_paid_bdt: b.amount_paid_bdt,
      payment_status: b.payment_status,
      guest_name: b.guest_name.split(" ")[0],
      created_at: b.created_at,
    };
  }

  async submitInquiry(input: InquiryInput): Promise<string> {
    const s = store();
    s.inquiries ??= [];
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const recent = s.inquiries.filter(
      (q) => q.created_at > hourAgo && ((input.email && q.email === input.email.toLowerCase()) || (input.phone && q.phone === input.phone)),
    ).length;
    if (recent >= 3) throw new RepoError("RATE_LIMITED");
    const reference = `ENQ-${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
    s.inquiries.unshift({
      id: crypto.randomUUID(),
      reference,
      kind: input.kind,
      name: input.name,
      email: input.email?.toLowerCase() ?? null,
      phone: input.phone,
      message: input.message,
      event_date: input.eventDate,
      guests: input.guests,
      status: "new",
      handled_at: null,
      created_at: new Date().toISOString(),
    });
    return reference;
  }

  async listInquiries(opts: { status?: InquiryStatus | "all"; limit?: number }): Promise<Inquiry[]> {
    this.requireStaff();
    return (store().inquiries ?? [])
      .filter((q) => !opts.status || opts.status === "all" || q.status === opts.status)
      .slice(0, opts.limit ?? 100)
      .map((q) => ({ ...q }));
  }

  async setInquiryStatus(id: string, status: InquiryStatus): Promise<void> {
    this.requirePermission("inquiries.manage");
    const q = (store().inquiries ?? []).find((x) => x.id === id);
    if (!q) throw new RepoError("NOT_FOUND");
    q.status = status;
    q.handled_at = status === "new" ? null : new Date().toISOString();
  }

  /* ---------- Reads ---------- */

  async listRooms() {
    this.requireStaff();
    return [...store().rooms].sort((a, b) => a.number.localeCompare(b.number)).map((r) => ({ ...r }));
  }

  async listBookings(filter: BookingFilter) {
    this.requireStaff();
    const spec = viewSpec(filter.view ?? "active", filter.today);
    const q = cleanSearch(filter.q).toLowerCase();
    const rows = store()
      .bookings.filter((b) => matchesView(b, spec))
      .filter(
        (b) =>
          !q ||
          [b.guest_name, b.phone, b.reference, b.email ?? ""].some((v) => v.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        const col = spec.order.column;
        const cmp = a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0;
        return spec.order.ascending ? cmp : -cmp;
      });
    const page = Math.max(1, filter.page ?? 1);
    const size = filter.pageSize ?? 25;
    return { rows: rows.slice((page - 1) * size, page * size).map((b) => ({ ...b })), total: rows.length };
  }

  async bookingsBetween(from: string, to: string) {
    this.requireStaff();
    return store()
      .bookings.filter((b) => overlaps(b.check_in, b.check_out, from, to))
      .sort((a, b) => a.check_in.localeCompare(b.check_in))
      .map((b) => ({ ...b }));
  }

  async bookingsReceivedSince(since: string) {
    this.requireStaff();
    return store()
      .bookings.filter((b) => b.created_at.slice(0, 10) >= since)
      .map((b) => ({ ...b }));
  }

  async countPending() {
    this.requireStaff();
    return store().bookings.filter((b) => b.status === "pending").length;
  }

  async getBooking(reference: string) {
    this.requireStaff();
    const b = store().bookings.find((x) => x.reference === reference);
    return b ? { ...b } : null;
  }

  async bookingEvents(bookingId: string) {
    this.requireStaff();
    return store()
      .events.filter((e) => e.booking_id === bookingId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async recentActivity(limit: number): Promise<ActivityItem[]> {
    this.requireStaff();
    const s = store();
    return [...s.events]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((e) => {
        const b = s.bookings.find((x) => x.id === e.booking_id);
        return { ...e, reference: b?.reference ?? "", guest_name: b?.guest_name ?? "" };
      });
  }

  async guests(q: string, page: number, pageSize: number) {
    this.requireStaff();
    const today = hotelToday();
    const map = new Map<string, Booking[]>();
    for (const b of store().bookings) {
      const key = b.email?.toLowerCase() ?? b.phone;
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    const term = cleanSearch(q).toLowerCase();
    const rows: GuestSummary[] = [...map.entries()]
      .map(([key, list]) => {
        const latest = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        const sold = list.filter((b) => SOLD_STATUSES.includes(b.status));
        return {
          key,
          guest_name: latest.guest_name,
          email: list.find((b) => b.email)?.email ?? null,
          phone: latest.phone,
          stays: sold.length,
          nights: sold.reduce((n, b) => n + nightsBetween(b.check_in, b.check_out) * b.rooms, 0),
          spend_bdt: list
            .filter((b) => b.status === "checked_in" || b.status === "checked_out")
            .reduce((n, b) => n + b.total_bdt, 0),
          last_check_in: list.map((b) => b.check_in).sort().at(-1)!,
          upcoming: list.some((b) => (b.status === "pending" || b.status === "confirmed") && b.check_in >= today),
        };
      })
      .filter((gs) => !term || [gs.guest_name, gs.phone, gs.email ?? ""].some((v) => v.toLowerCase().includes(term)))
      .sort((a, b) => b.last_check_in.localeCompare(a.last_check_in));
    return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length };
  }

  async bookingsForGuest(key: string) {
    this.requireStaff();
    const k = key.trim().toLowerCase();
    return store()
      .bookings.filter((b) => (k.includes("@") ? b.email === k : b.phone.toLowerCase() === k && !b.email))
      .sort((a, b) => b.check_in.localeCompare(a.check_in))
      .map((b) => ({ ...b }));
  }

  /* ---------- Writes ---------- */

  async createStaffBooking(input: StaffBookingInput) {
    this.requirePermission("bookings.write");
    return this.insert({ ...input, arrival: null });
  }

  async setStatus(id: string, status: BookingStatus, reason?: string) {
    this.requirePermission("bookings.write");
    const b = this.find(id);
    const today = hotelToday();
    if (!canTransition(b.status, status)) throw new RepoError("BAD_TRANSITION");
    if (status === "checked_in") {
      if (b.check_in > today) throw new RepoError("TOO_EARLY");
      if (b.rooms === 1 && !b.room_id) throw new RepoError("ASSIGN_ROOM");
    }
    if (status === "no_show" && b.check_in > today) throw new RepoError("TOO_EARLY");

    const from = b.status;
    const now = new Date().toISOString();
    b.status = status;
    if (status === "confirmed") b.confirmed_at = now;
    if (status === "checked_in") b.checked_in_at = now;
    if (status === "checked_out") {
      b.checked_out_at = now;
      const room = store().rooms.find((r) => r.id === b.room_id);
      if (room) room.housekeeping = "dirty";
    }
    if (status === "cancelled" || status === "no_show") {
      b.cancelled_at = now;
      b.cancel_reason = reason?.trim() || null;
    }
    this.touch(b);
    this.log(b.id, "status", { from, to: status, reason: reason ?? null });
  }

  async assignRoom(id: string, roomId: string | null) {
    this.requirePermission("bookings.write");
    const b = this.find(id);
    if (!isLive(b.status) || b.rooms !== 1) throw new RepoError("LOCKED");
    const rooms = store().rooms;
    const target = roomId ? rooms.find((r) => r.id === roomId) : null;
    if (roomId) {
      if (!target) throw new RepoError("NOT_FOUND");
      if (target.room_type_id !== b.room_type_id) throw new RepoError("WRONG_ROOM_TYPE");
      if (target.out_of_service) throw new RepoError("ROOM_OUT_OF_SERVICE");
      if (this.roomClash(roomId, b.check_in, b.check_out, b.id)) throw new RepoError("ROOM_TAKEN");
    }
    const from = rooms.find((r) => r.id === b.room_id)?.number ?? null;
    b.room_id = roomId;
    this.touch(b);
    this.log(b.id, "room", { from, to: target?.number ?? null });
  }

  async modifyBooking(id: string, c: BookingChange) {
    this.requirePermission("bookings.write");
    const s = store();
    const b = this.find(id);
    if (!isLive(b.status)) throw new RepoError("LOCKED");
    const type = s.roomTypes.find((t) => t.slug === c.room);
    if (!type) throw new RepoError("NO_ROOM");
    if (b.status === "checked_in" && (c.checkIn !== b.check_in || type.id !== b.room_type_id)) throw new RepoError("LOCKED");
    const nights = nightsBetween(c.checkIn, c.checkOut);
    if (nights < 1 || nights > 30) throw new RepoError("BAD_DATES");
    if (b.status !== "checked_in" && c.checkIn < hotelToday() && c.checkIn !== b.check_in) throw new RepoError("PAST_DATE");
    if (!guestsFit(type.sleeps, c.rooms, c.adults, c.children)) throw new RepoError("TOO_MANY_GUESTS");
    if (this.freeUnits(type.id, c.checkIn, c.checkOut, b.id) < c.rooms) throw new RepoError("SOLD_OUT");

    // Same room type and dates: keep the agreed rate. Otherwise re-price night by night.
    const keepRate = type.id === b.room_type_id && c.checkIn === b.check_in && c.checkOut === b.check_out;
    const cost = stayCost(type, c.checkIn, c.checkOut, c.rooms);
    const rate = keepRate ? b.nightly_rate_bdt : cost.average;
    const total = keepRate ? Math.round((b.total_bdt / b.rooms) * c.rooms) : cost.total;
    const roomId = type.id === b.room_type_id && c.rooms === 1 ? b.room_id : null;
    if (roomId && this.roomClash(roomId, c.checkIn, c.checkOut, b.id)) throw new RepoError("ROOM_TAKEN");

    const before = { check_in: b.check_in, check_out: b.check_out, rooms: b.rooms, adults: b.adults, children: b.children, total: b.total_bdt };
    Object.assign(b, {
      room_type_id: type.id,
      room_id: roomId,
      check_in: c.checkIn,
      check_out: c.checkOut,
      rooms: c.rooms,
      adults: c.adults,
      children: c.children,
      nightly_rate_bdt: rate,
      total_bdt: total,
    });
    b.payment_status = paymentStatus(b.amount_paid_bdt, b.total_bdt);
    this.touch(b);
    this.log(b.id, "modified", {
      from: before,
      to: { check_in: c.checkIn, check_out: c.checkOut, rooms: c.rooms, adults: c.adults, children: c.children, room_type: c.room, total: b.total_bdt },
    });
  }

  async recordPayment(id: string, amount: number, method: PaymentMethod, note: string) {
    this.requirePermission("payments.record");
    const b = this.find(id);
    if (b.status === "cancelled" || b.status === "no_show") throw new RepoError("LOCKED");
    if (!Number.isInteger(amount) || amount <= 0 || amount > 10_000_000) throw new RepoError("BAD_AMOUNT");
    b.amount_paid_bdt += amount;
    b.payment_status = paymentStatus(b.amount_paid_bdt, b.total_bdt);
    this.touch(b);
    this.log(b.id, "payment", { amount, method, note: note.slice(0, 200) });
  }

  async updateGuestDetails(id: string, d: GuestDetails) {
    this.requirePermission("guests.write");
    const b = this.find(id);
    Object.assign(b, {
      guest_name: d.name.trim(),
      email: d.email?.trim().toLowerCase() || null,
      phone: d.phone.trim(),
      arrival_window: d.arrival?.trim() || null,
      special_requests: d.requests?.trim() || null,
      internal_notes: d.notes?.trim() || null,
      airport_pickup: d.airportPickup,
    });
    this.touch(b);
    this.log(b.id, "details", {});
  }

  async updateRoomType(id: string, patch: RoomTypePatch) {
    this.requirePermission("rates.manage");
    const t = store().roomTypes.find((x) => x.id === id);
    if (!t) throw new RepoError("NOT_FOUND");
    Object.assign(t, patch);
  }

  async updateRoom(id: string, patch: RoomPatch) {
    if (patch.out_of_service !== undefined) this.requirePermission("maintenance.manage");
    if (patch.housekeeping !== undefined) this.requirePermission("housekeeping.write");
    this.requireStaff();
    const r = store().rooms.find((x) => x.id === id);
    if (!r) throw new RepoError("NOT_FOUND");
    Object.assign(r, patch);
  }

  /** Mirrors _clean_room_number in SQL. */
  private cleanNumber(n: string): string {
    const v = n.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{0,9}$/.test(v)) throw new RepoError("BAD_ROOM_NUMBER");
    return v;
  }

  /** Mirrors _type_still_fits: every future night keeps enough rooms. */
  private typeStillFits(typeId: string, fewer: number): boolean {
    const s = store();
    const today = hotelToday();
    const live = s.bookings.filter((b) => b.room_type_id === typeId && isLive(b.status));
    const last = live.map((b) => b.check_out).sort().at(-1);
    if (!last) return true;
    for (let d = today; d < last; d = addDays(d, 1)) {
      if (this.freeUnits(typeId, d, addDays(d, 1)) - fewer < 0) return false;
    }
    return true;
  }

  async addRoom(input: RoomUnitInput) {
    this.requirePermission("rooms.manage");
    const s = store();
    if (!s.roomTypes.some((t) => t.id === input.room_type_id)) throw new RepoError("NO_ROOM");
    const number = this.cleanNumber(input.number);
    if (s.rooms.some((r) => r.number === number)) throw new RepoError("ROOM_EXISTS");
    const id = crypto.randomUUID();
    s.rooms.push({
      id,
      number,
      room_type_id: input.room_type_id,
      floor: input.floor?.trim().slice(0, 20) || null,
      housekeeping: "clean",
      out_of_service: false,
      service_note: null,
    });
    return id;
  }

  async editRoom(id: string, input: RoomUnitInput) {
    this.requirePermission("rooms.manage");
    const s = store();
    const r = s.rooms.find((x) => x.id === id);
    if (!r) throw new RepoError("NOT_FOUND");
    if (!s.roomTypes.some((t) => t.id === input.room_type_id)) throw new RepoError("NO_ROOM");
    const number = this.cleanNumber(input.number);
    if (s.rooms.some((x) => x.number === number && x.id !== id)) throw new RepoError("ROOM_EXISTS");
    if (input.room_type_id !== r.room_type_id) {
      if (s.bookings.some((b) => b.room_id === id && isLive(b.status))) throw new RepoError("ROOM_IN_USE");
      if (!r.out_of_service && !this.typeStillFits(r.room_type_id, 1)) throw new RepoError("ROOM_NEEDED");
    }
    Object.assign(r, { number, room_type_id: input.room_type_id, floor: input.floor?.trim().slice(0, 20) || null });
  }

  async deleteRoom(id: string) {
    this.requirePermission("rooms.manage");
    const s = store();
    const r = s.rooms.find((x) => x.id === id);
    if (!r) throw new RepoError("NOT_FOUND");
    if (s.bookings.some((b) => b.room_id === id)) throw new RepoError("ROOM_IN_USE");
    if (!r.out_of_service && !this.typeStillFits(r.room_type_id, 1)) throw new RepoError("ROOM_NEEDED");
    s.rooms = s.rooms.filter((x) => x.id !== id);
  }

  async updateSettings(patch: Partial<HotelSettings>) {
    this.requirePermission("settings.manage");
    Object.assign(store().settings, patch);
  }

  async listStaff(): Promise<StaffMember[]> {
    this.requirePermission("staff.read");
    return PREVIEW_STAFF;
  }
}

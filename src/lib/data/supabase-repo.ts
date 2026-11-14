import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorCode, RepoError } from "./errors";
import { DEFAULT_SETTINGS, type AdminRepo } from "./repo";
import { cleanSearch, viewSpec } from "./rules";
import type {
  ActivityItem,
  Booking,
  BookingChange,
  BookingEvent,
  BookingFilter,
  BookingStatus,
  GuestDetails,
  GuestSummary,
  HotelSettings,
  PaymentMethod,
  RoomPatch,
  RoomTypePatch,
  RoomTypeRecord,
  RoomUnit,
  StaffBookingInput,
  StaffMember,
  WebsiteBookingInput,
} from "./types";

const ROOM_TYPE_COLUMNS =
  "id, slug, name, tag, bed, size_sqft, sleeps, floor, view, price_bdt, weekend_price_bdt, rack_price_bdt, blurb, description, features, gallery, sort_order, is_published";

/** Throws a RepoError carrying the database's error code, if any. */
function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) {
    const code = errorCode(new Error(res.error.message));
    if (code === "UNKNOWN") console.error("Supabase:", res.error.message);
    throw new RepoError(code);
  }
  return res.data;
}

/**
 * Supabase-backed repository. With the anonymous client it serves the public
 * site; with a staff session client RLS and the admin_* functions grant the
 * front-desk operations.
 */
export class SupabaseRepo implements AdminRepo {
  readonly mode = "live" as const;

  constructor(private db: SupabaseClient) {}

  /* ---------- Public ---------- */

  async listRoomTypes(opts: { includeUnpublished?: boolean } = {}): Promise<RoomTypeRecord[]> {
    let query = this.db.from("room_types").select(ROOM_TYPE_COLUMNS).order("sort_order");
    if (!opts.includeUnpublished) query = query.eq("is_published", true);
    return check(await query) as RoomTypeRecord[];
  }

  async availability(checkIn: string, checkOut: string): Promise<Record<string, number>> {
    const rows = check(await this.db.rpc("room_availability", { p_check_in: checkIn, p_check_out: checkOut })) as {
      slug: string;
      available: number;
    }[];
    return Object.fromEntries(rows.map((r) => [r.slug, r.available]));
  }

  async getSettings(): Promise<HotelSettings> {
    const res = await this.db
      .from("hotel_settings")
      .select("cancellation_policy, children_policy, confirm_call_within, vat_percent, service_charge_percent")
      .eq("id", 1)
      .maybeSingle();
    if (res.error || !res.data) return DEFAULT_SETTINGS;
    const s = res.data;
    return {
      ...s,
      vat_percent: s.vat_percent == null ? null : Number(s.vat_percent),
      service_charge_percent: s.service_charge_percent == null ? null : Number(s.service_charge_percent),
    };
  }

  async createWebsiteBooking(input: WebsiteBookingInput): Promise<string> {
    return String(
      check(
        await this.db.rpc("create_booking", {
          p_room_slug: input.room,
          p_check_in: input.checkIn,
          p_check_out: input.checkOut,
          p_rooms: input.rooms,
          p_adults: input.adults,
          p_children: input.children,
          p_guest_name: input.name,
          p_email: input.email,
          p_phone: input.phone,
          p_country: input.country,
          p_arrival_window: input.arrival,
          p_special_requests: input.requests,
          p_airport_pickup: input.airportPickup,
        }),
      ),
    );
  }

  /* ---------- Reads ---------- */

  async listRooms(): Promise<RoomUnit[]> {
    return check(
      await this.db
        .from("rooms")
        .select("id, number, room_type_id, floor, housekeeping, out_of_service, service_note")
        .order("number"),
    ) as RoomUnit[];
  }

  async listBookings(filter: BookingFilter): Promise<{ rows: Booking[]; total: number }> {
    const spec = viewSpec(filter.view ?? "active", filter.today);
    const page = Math.max(1, filter.page ?? 1);
    const size = filter.pageSize ?? 25;
    let query = this.db.from("bookings").select("*", { count: "exact" });
    if (spec.statuses) query = query.in("status", spec.statuses);
    if (spec.checkIn?.eq) query = query.eq("check_in", spec.checkIn.eq);
    if (spec.checkIn?.gt) query = query.gt("check_in", spec.checkIn.gt);
    if (spec.checkOut?.eq) query = query.eq("check_out", spec.checkOut.eq);
    const q = cleanSearch(filter.q);
    if (q) {
      const like = `%${q}%`;
      query = query.or(`guest_name.ilike.${like},phone.ilike.${like},reference.ilike.${like},email.ilike.${like}`);
    }
    const res = await query
      .order(spec.order.column, { ascending: spec.order.ascending })
      .order("created_at", { ascending: false })
      .range((page - 1) * size, page * size - 1);
    const rows = check(res) as Booking[];
    return { rows, total: res.count ?? rows.length };
  }

  async bookingsBetween(from: string, to: string): Promise<Booking[]> {
    return check(
      await this.db.from("bookings").select("*").lt("check_in", to).gt("check_out", from).order("check_in").limit(2000),
    ) as Booking[];
  }

  async bookingsReceivedSince(since: string): Promise<Booking[]> {
    return check(
      await this.db.from("bookings").select("*").gte("created_at", since).order("created_at").limit(5000),
    ) as Booking[];
  }

  async countPending(): Promise<number> {
    const res = await this.db.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending");
    check(res);
    return res.count ?? 0;
  }

  async getBooking(reference: string): Promise<Booking | null> {
    return check(await this.db.from("bookings").select("*").eq("reference", reference).maybeSingle()) as Booking | null;
  }

  async bookingEvents(bookingId: string): Promise<BookingEvent[]> {
    return check(
      await this.db
        .from("booking_events")
        .select("id, booking_id, kind, detail, actor_name, created_at")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false }),
    ) as BookingEvent[];
  }

  async recentActivity(limit: number): Promise<ActivityItem[]> {
    const rows = check(
      await this.db
        .from("booking_events")
        .select("id, booking_id, kind, detail, actor_name, created_at, bookings(reference, guest_name)")
        .order("created_at", { ascending: false })
        .limit(limit),
    ) as unknown as (BookingEvent & { bookings: { reference: string; guest_name: string } | null })[];
    return rows.map(({ bookings, ...e }) => ({
      ...e,
      reference: bookings?.reference ?? "",
      guest_name: bookings?.guest_name ?? "",
    }));
  }

  async guests(q: string, page: number, pageSize: number): Promise<{ rows: GuestSummary[]; total: number }> {
    let query = this.db.from("guest_summary").select("*", { count: "exact" });
    const term = cleanSearch(q);
    if (term) {
      const like = `%${term}%`;
      query = query.or(`guest_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`);
    }
    const res = await query.order("last_check_in", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
    const rows = check(res) as GuestSummary[];
    return { rows, total: res.count ?? rows.length };
  }

  async bookingsForGuest(key: string): Promise<Booking[]> {
    const k = key.trim();
    const query = k.includes("@")
      ? this.db.from("bookings").select("*").ilike("email", k)
      : this.db.from("bookings").select("*").eq("phone", k).is("email", null);
    return check(await query.order("check_in", { ascending: false }).limit(100)) as Booking[];
  }

  /* ---------- Front-desk writes (all via permission-checked SQL functions) ---------- */

  async createStaffBooking(input: StaffBookingInput): Promise<string> {
    return String(
      check(
        await this.db.rpc("admin_create_booking", {
          p_room_slug: input.room,
          p_check_in: input.checkIn,
          p_check_out: input.checkOut,
          p_rooms: input.rooms,
          p_adults: input.adults,
          p_children: input.children,
          p_guest_name: input.name,
          p_email: input.email,
          p_phone: input.phone,
          p_country: input.country,
          p_special_requests: input.requests,
          p_internal_notes: input.notes,
          p_airport_pickup: input.airportPickup,
          p_source: input.source,
          p_status: input.status,
        }),
      ),
    );
  }

  async setStatus(id: string, status: BookingStatus, reason?: string): Promise<void> {
    check(await this.db.rpc("admin_set_status", { p_booking: id, p_status: status, p_reason: reason ?? null }));
  }

  async assignRoom(id: string, roomId: string | null): Promise<void> {
    check(await this.db.rpc("admin_assign_room", { p_booking: id, p_room: roomId }));
  }

  async modifyBooking(id: string, c: BookingChange): Promise<void> {
    check(
      await this.db.rpc("admin_modify_booking", {
        p_booking: id,
        p_room_slug: c.room,
        p_check_in: c.checkIn,
        p_check_out: c.checkOut,
        p_rooms: c.rooms,
        p_adults: c.adults,
        p_children: c.children,
      }),
    );
  }

  async recordPayment(id: string, amount: number, method: PaymentMethod, note: string): Promise<void> {
    check(await this.db.rpc("admin_record_payment", { p_booking: id, p_amount: amount, p_method: method, p_note: note }));
  }

  async updateGuestDetails(id: string, d: GuestDetails): Promise<void> {
    check(
      await this.db.rpc("admin_update_guest_details", {
        p_booking: id,
        p_guest_name: d.name,
        p_email: d.email,
        p_phone: d.phone,
        p_arrival_window: d.arrival,
        p_special_requests: d.requests,
        p_internal_notes: d.notes,
        p_airport_pickup: d.airportPickup,
      }),
    );
  }

  async updateRoomType(id: string, patch: RoomTypePatch): Promise<void> {
    const res = await this.db.from("room_types").update(patch).eq("id", id).select("id");
    if (!check(res)?.length) throw new RepoError("NOT_MANAGER");
  }

  async updateRoom(id: string, patch: RoomPatch): Promise<void> {
    const res = await this.db.from("rooms").update(patch).eq("id", id).select("id");
    if (!check(res)?.length) throw new RepoError("NOT_STAFF");
  }

  async updateSettings(patch: Partial<HotelSettings>): Promise<void> {
    const res = await this.db.from("hotel_settings").update(patch).eq("id", 1).select("id");
    if (!check(res)?.length) throw new RepoError("NOT_MANAGER");
  }

  async listStaff(): Promise<StaffMember[]> {
    return check(
      await this.db.from("staff").select("user_id, full_name, role, active").order("full_name"),
    ) as StaffMember[];
  }
}

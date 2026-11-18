import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { addDays, hotelToday, nightsBetween } from "../dates";
import { nightRate, isWeekendNight } from "../pricing";
import { getPublicClient } from "../supabase";
import type { TypedClient } from "../supabase/server";
import type {
  AccessToken,
  BookingEngine,
  ConfirmResult,
  GuestInput,
  Hold,
  HoldRequest,
  HoldView,
  ManageView,
  PaymentOption,
  Quote,
  SearchOption,
  StayQuery,
} from "./engine-types";
import { errorCode, RepoError } from "./errors";
import { previewEnabled } from "./index";
import { PreviewRepo } from "./preview-repo";

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) {
    const code = errorCode(new Error(res.error.message));
    if (code === "UNKNOWN") console.error("Supabase:", res.error.message);
    throw new RepoError(code);
  }
  return res.data;
}

/** The database's booking engine, called with the public (anon) client. */
class SupabaseEngine implements BookingEngine {
  readonly mode = "live" as const;
  constructor(private db: TypedClient) {}

  async search(q: StayQuery, promo?: string | null): Promise<SearchOption[]> {
    const rows = check(
      await this.db.rpc("search_availability", {
        p_check_in: q.checkIn,
        p_check_out: q.checkOut,
        p_adults: q.adults,
        p_children: q.children,
        p_promo: promo ?? undefined,
      }),
    ) as { room_type: string; name: string; tag: string; sleeps: number; available: number; nights: number; subtotal: number; discount: number; total: number; quote: unknown }[];
    return rows.map((r) => ({
      roomType: r.room_type,
      name: r.name,
      tag: r.tag,
      sleeps: r.sleeps,
      available: r.available,
      nights: r.nights,
      subtotal: r.subtotal,
      discount: r.discount,
      total: r.total,
      quote: r.quote as Quote,
    }));
  }

  async hold(req: HoldRequest): Promise<Hold> {
    const h = check(
      await this.db.rpc("create_hold", {
        p_check_in: req.checkIn,
        p_check_out: req.checkOut,
        p_adults: req.adults,
        p_children: req.children,
        p_lines: req.lines.map((room_type) => ({ room_type })),
        p_promo: req.promo || undefined,
      }),
    ) as { token: string; expires_at: string; quote: Quote };
    return { token: h.token, expiresAt: h.expires_at, quote: h.quote };
  }

  async getHold(token: string): Promise<HoldView> {
    return check(await this.db.rpc("get_hold", { p_token: token })) as unknown as HoldView;
  }

  async applyPromo(token: string, promo: string | null): Promise<Quote> {
    return check(await this.db.rpc("hold_apply_promo", { p_token: token, p_promo: promo as string })) as unknown as Quote;
  }

  async release(token: string): Promise<void> {
    check(await this.db.rpc("release_hold", { p_token: token }));
  }

  async confirm(token: string, key: string, g: GuestInput, option: PaymentOption, quotedTotal: number): Promise<ConfirmResult> {
    return check(
      await this.db.rpc("confirm_hold", {
        p_token: token,
        p_idempotency_key: key,
        p_guest_name: g.name,
        p_email: g.email,
        p_phone: g.phone,
        p_country: g.country,
        p_arrival: g.arrival,
        p_requests: g.requests,
        p_airport_pickup: g.airportPickup,
        p_payment_option: option,
        p_quoted_total: quotedTotal,
      }),
    ) as unknown as ConfirmResult;
  }

  async verifyAccess(reference: string, contact: string): Promise<AccessToken | null> {
    return (check(await this.db.rpc("verify_booking_access", { p_reference: reference, p_contact: contact })) as unknown as AccessToken | null) ?? null;
  }

  async view(token: string): Promise<ManageView> {
    return check(await this.db.rpc("guest_booking", { p_token: token })) as unknown as ManageView;
  }

  async cancel(token: string, reason: string): Promise<"cancelled" | "requested"> {
    return check(await this.db.rpc("guest_cancel", { p_token: token, p_reason: reason })) as "cancelled" | "requested";
  }

  async requestChange(token: string, checkIn: string, checkOut: string, note: string): Promise<{ available: boolean }> {
    return check(
      await this.db.rpc("guest_request_change", { p_token: token, p_check_in: checkIn, p_check_out: checkOut, p_note: note }),
    ) as unknown as { available: boolean };
  }
}

/* ------------------------------------------------------------------ Preview */

type PreviewHold = HoldView & { id: string; lines: string[]; key?: string };
type PreviewToken = { reference: string; expires: number };

const pg = globalThis as unknown as { __bsqEngine?: { holds: Map<string, PreviewHold>; tokens: Map<string, PreviewToken> } };
const pstore = () => (pg.__bsqEngine ??= { holds: new Map(), tokens: new Map() });
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const newToken = () => randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");

/**
 * Development-only engine over the in-memory preview hotel (no Supabase).
 * Same rules in simplified form; one room type per booking.
 */
class PreviewEngine implements BookingEngine {
  readonly mode = "preview" as const;
  private repo = new PreviewRepo();

  private async quote(lines: string[], checkIn: string, checkOut: string): Promise<Quote> {
    const [types, settings] = await Promise.all([this.repo.listRoomTypes({ includeUnpublished: true }), this.repo.getSettings()]);
    const n = nightsBetween(checkIn, checkOut);
    const qLines = lines.map((slug, i) => {
      const t = types.find((x) => x.slug === slug);
      if (!t) throw new RepoError("NO_ROOM");
      const nights = Array.from({ length: n }, (_, k) => {
        const night = addDays(checkIn, k);
        const weekend = isWeekendNight(night);
        return { night, rate: nightRate(t, night), kind: (weekend && t.weekend_price_bdt ? "weekend" : "weekday") as "weekend" | "weekday", weekend };
      });
      return { line: i + 1, room_type: t.slug, name: t.name, sleeps: t.sleeps, rate_plan: "STANDARD", rate_plan_name: "Standard", nights, subtotal: nights.reduce((s, x) => s + x.rate, 0) };
    });
    const subtotal = qLines.reduce((s: number, l: { subtotal: number }) => s + l.subtotal, 0);
    const svc = settings.service_charge_percent == null ? 0 : Math.round((subtotal * settings.service_charge_percent) / 100);
    const vat = settings.vat_percent == null ? 0 : Math.round(((subtotal + svc) * settings.vat_percent) / 100);
    return {
      currency: "BDT", check_in: checkIn, check_out: checkOut, nights: n, lines: qLines, subtotal, discount: 0, promotion: null,
      service_charge_percent: settings.service_charge_percent, service_charge: svc, vat_percent: settings.vat_percent, vat,
      taxes_pending: settings.service_charge_percent == null || settings.vat_percent == null,
      total: subtotal + svc + vat, advance_percent: null, advance_due: 0,
    };
  }

  private held(slug: string, checkIn: string, checkOut: string, except?: string): number {
    let n = 0;
    for (const h of pstore().holds.values())
      if (h.id !== except && h.status === "active" && Date.parse(h.expires_at) > Date.now() && h.check_in < checkOut && h.check_out > checkIn)
        n += h.lines.filter((l: string) => l === slug).length;
    return n;
  }

  private validate(q: StayQuery) {
    const n = nightsBetween(q.checkIn, q.checkOut);
    if (q.checkIn < hotelToday()) throw new RepoError("PAST_DATE");
    if (n < 1 || n > 30) throw new RepoError("BAD_DATES");
  }

  async search(q: StayQuery): Promise<SearchOption[]> {
    this.validate(q);
    const [types, avail] = await Promise.all([this.repo.listRoomTypes(), this.repo.availability(q.checkIn, q.checkOut)]);
    return Promise.all(
      types.map(async (t) => {
        const quote = await this.quote([t.slug], q.checkIn, q.checkOut);
        return {
          roomType: t.slug, name: t.name, tag: t.tag, sleeps: t.sleeps,
          available: Math.max(0, (avail[t.slug] ?? 0) - this.held(t.slug, q.checkIn, q.checkOut)),
          nights: quote.nights, total: quote.total, subtotal: quote.subtotal, discount: 0, quote,
        };
      }),
    );
  }

  async hold(req: HoldRequest): Promise<Hold> {
    this.validate(req);
    if (req.promo) throw new RepoError("PROMO_INVALID");
    if (!req.lines.length) throw new RepoError("NO_ROOM");
    if (new Set(req.lines).size > 1) throw new RepoError("UNAVAILABLE");
    const avail = await this.repo.availability(req.checkIn, req.checkOut);
    if ((avail[req.lines[0]] ?? 0) - this.held(req.lines[0], req.checkIn, req.checkOut) < req.lines.length) throw new RepoError("SOLD_OUT");
    const quote = await this.quote(req.lines, req.checkIn, req.checkOut);
    const token = newToken();
    const expires_at = new Date(Date.now() + 15 * 60_000).toISOString();
    pstore().holds.set(hash(token), {
      id: randomUUID(), lines: req.lines, status: "active", expires_at, check_in: req.checkIn, check_out: req.checkOut,
      adults: req.adults, children: req.children, promo_code: null, quote, reference: null,
    });
    return { token, expiresAt: expires_at, quote };
  }

  private find(token: string): PreviewHold {
    const h = pstore().holds.get(hash(token));
    if (!h) throw new RepoError("HOLD_NOT_FOUND");
    return h;
  }

  async getHold(token: string): Promise<HoldView> {
    const h = this.find(token);
    return { ...h, status: h.status === "active" && Date.parse(h.expires_at) <= Date.now() ? "expired" : h.status };
  }

  async applyPromo(token: string, promo: string | null): Promise<Quote> {
    const h = this.find(token);
    if (promo) throw new RepoError("PROMO_INVALID");
    return h.quote;
  }

  async release(token: string) {
    const h = pstore().holds.get(hash(token));
    if (h?.status === "active") h.status = "released";
  }

  async confirm(token: string, key: string, g: GuestInput, option: PaymentOption, quotedTotal: number): Promise<ConfirmResult> {
    const h = this.find(token);
    if (h.status === "converted") {
      if (h.key !== key) throw new RepoError("IDEMPOTENCY_CONFLICT");
    } else {
      if (h.status !== "active") throw new RepoError("HOLD_EXPIRED");
      const quote = await this.quote(h.lines, h.check_in, h.check_out);
      if (quote.total !== quotedTotal) throw new RepoError("PRICE_CHANGED");
      h.status = "released"; // stop counting it before the booking takes its place
      try {
        h.reference = await this.repo.createWebsiteBooking({
          room: h.lines[0], rooms: h.lines.length, checkIn: h.check_in, checkOut: h.check_out, adults: h.adults, children: h.children, ...g,
        });
      } catch (err) {
        h.status = "active";
        throw err;
      }
      h.status = "converted";
      h.key = key;
    }
    const manage = newToken();
    pstore().tokens.set(hash(manage), { reference: h.reference!, expires: Date.now() + 24 * 3_600_000 });
    return {
      reference: h.reference!, status: "pending", total: h.quote.total, advance_due: 0, payment_due_at: null, payment_option: option,
      manage_token: manage, manage_expires_at: new Date(Date.now() + 24 * 3_600_000).toISOString(), replayed: h.key === key && h.status === "converted",
    };
  }

  async verifyAccess(reference: string, contact: string): Promise<AccessToken | null> {
    const b = await this.repo.lookupBooking(reference, contact);
    if (!b) return null;
    const token = newToken();
    pstore().tokens.set(hash(token), { reference: b.reference, expires: Date.now() + 30 * 60_000 });
    return { token, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() };
  }

  private async booking(token: string) {
    const t = pstore().tokens.get(hash(token));
    if (!t || t.expires < Date.now()) throw new RepoError("ACCESS_EXPIRED");
    const admin = new PreviewRepo({ name: "Guest (website)", role: "owner" });
    const b = await admin.getBooking(t.reference);
    if (!b) throw new RepoError("ACCESS_EXPIRED");
    return { b, admin };
  }

  async view(token: string): Promise<ManageView> {
    const { b } = await this.booking(token);
    const types = await this.repo.listRoomTypes({ includeUnpublished: true });
    const name = types.find((t) => t.id === b.room_type_id)?.name ?? "Room";
    const open = b.status === "pending" || b.status === "confirmed";
    return {
      reference: b.reference, status: b.status, check_in: b.check_in, check_out: b.check_out, nights: nightsBetween(b.check_in, b.check_out),
      adults: b.adults, children: b.children, guest_first_name: b.guest_name.split(" ")[0],
      email: b.email ? `${b.email[0]}•••@${b.email.split("@")[1]}` : null, phone: `•••• ${b.phone.replace(/\D/g, "").slice(-3)}`,
      rooms: Array.from({ length: b.rooms }, () => ({ room_type: name, subtotal: Math.round(b.total_bdt / b.rooms), nights: null })),
      subtotal: b.total_bdt, discount: 0, service_charge: 0, vat: 0, total: b.total_bdt, paid: b.amount_paid_bdt, payment_status: b.payment_status,
      payment_option: "pay_at_hotel", advance_due: 0, payment_due_at: null, taxes_pending: true, open_requests: [],
      can_cancel: open && b.check_in >= hotelToday(), cancels_instantly: b.status === "pending" && b.amount_paid_bdt === 0,
      can_request_change: open && b.check_in >= hotelToday(),
    };
  }

  async cancel(token: string, reason: string): Promise<"cancelled" | "requested"> {
    const { b, admin } = await this.booking(token);
    if (b.status === "pending" && b.amount_paid_bdt === 0) {
      await admin.setStatus(b.id, "cancelled", reason || "Cancelled by guest");
      return "cancelled";
    }
    return "requested";
  }

  async requestChange(token: string, checkIn: string, checkOut: string): Promise<{ available: boolean }> {
    await this.booking(token);
    this.validate({ checkIn, checkOut, adults: 1, children: 0 });
    return { available: true };
  }
}

/** The booking engine for public pages, or null in production without Supabase. */
export function getEngine(): BookingEngine | null {
  const client = getPublicClient();
  if (client) return new SupabaseEngine(client);
  if (previewEnabled()) return new PreviewEngine();
  return null;
}

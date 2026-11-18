import "server-only";
import type { TypedClient } from "../supabase/server";
import { errorCode, RepoError } from "./errors";

// Payments, invoices and guest messages for the admin, through the signed-in
// staff member's session (RLS and the SQL functions check permissions).

export type LedgerRow = {
  id: string;
  booking_id: string;
  amount_bdt: number;
  method: string;
  status: "pending" | "confirmed" | "failed" | "void";
  source: "desk" | "guest" | "gateway";
  reference: string | null;
  sender: string | null;
  note: string | null;
  review_note: string | null;
  receipt_no: string | null;
  received_at: string;
  created_at: string;
  void_reason: string | null;
  verified_at: string | null;
};

export type RefundRow = {
  id: string;
  booking_id: string;
  payment_id: string | null;
  amount_bdt: number;
  method: string;
  reason: string;
  status: "requested" | "approved" | "rejected" | "completed";
  reference: string | null;
  requested_by: string | null;
  decided_by: string | null;
  created_at: string;
  completed_at: string | null;
};

export type MessageRow = {
  id: string;
  channel: "email" | "whatsapp";
  template: string;
  booking_id: string | null;
  inquiry_id: string | null;
  recipient: string | null;
  status: "queued" | "sending" | "sent" | "delivered" | "failed" | "skipped" | "unconfigured" | "cancelled";
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  resent_from: string | null;
  data: { reference?: string; guest_name?: string; name?: string };
};

export type GatewayEventRow = {
  id: number;
  provider: string;
  event_id: string;
  intent_id: string | null;
  status: string | null;
  amount_bdt: number | null;
  signature_ok: boolean;
  verified: boolean;
  outcome: string;
  received_at: string;
};

export type Reconciliation = {
  from: string;
  to: string;
  by_method: { method: string; received: number; count: number; pending: number; refunded: number }[];
  exceptions: { kind: string; reference: string | null; amount: number | null; at: string; detail: string; payment_id?: string }[];
};

export type InvoiceDoc = {
  number: string;
  issued_at: string;
  generated_at: string;
  reference: string;
  status: string;
  guest: { name: string; email: string | null; phone: string | null; country: string | null };
  stay: { check_in: string; check_out: string; nights: number; adults: number; children: number; rooms: number };
  lines: { room_type: string; rate_plan: string | null; nights: { night: string; rate: number; kind?: string; season?: string }[] | null; subtotal: number }[];
  subtotal: number;
  discount: number;
  promotions: { name: string; code: string | null; discount: number }[];
  service_charge_percent: number | null;
  service_charge: number;
  vat_percent: number | null;
  vat: number;
  taxes_pending: boolean;
  total: number;
  payments: { id: string; receipt_no: string | null; received_at: string; method: string; reference: string | null; amount: number; status: string }[];
  refunds: { completed_at: string; method: string; reference: string | null; amount: number }[];
  paid: number;
  refunded: number;
  pending: number;
  balance: number;
  credit: number;
};

export type ReceiptDoc = {
  receipt_no: string;
  received_at: string;
  amount: number;
  method: string;
  reference: string | null;
  source: string;
  booking: { reference: string; check_in: string; check_out: string; total: number; paid: number; balance: number };
  guest: { name: string; email: string | null; phone: string | null };
  recorded_by: string | null;
};

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) {
    const code = errorCode(new Error(res.error.message));
    if (code === "UNKNOWN") console.error("Supabase:", res.error.message);
    throw new RepoError(code);
  }
  return res.data;
}

const LEDGER_COLS = "id, booking_id, amount_bdt, method, status, source, reference, sender, note, review_note, receipt_no, received_at, created_at, void_reason, verified_at";
const MESSAGE_COLS = "id, channel, template, booking_id, inquiry_id, recipient, status, attempts, max_attempts, last_error, next_attempt_at, created_at, sent_at, delivered_at, resent_from, data";

export class PaymentsRepo {
  constructor(private db: TypedClient) {}

  async ledger(bookingId: string): Promise<{ payments: LedgerRow[]; refunds: RefundRow[] }> {
    const [p, r] = await Promise.all([
      this.db.from("payments").select(LEDGER_COLS).eq("booking_id", bookingId).order("created_at"),
      this.db.from("refunds").select("id, booking_id, payment_id, amount_bdt, method, reason, status, reference, requested_by, decided_by, created_at, completed_at").eq("booking_id", bookingId).order("created_at"),
    ]);
    return { payments: check(p) as unknown as LedgerRow[], refunds: check(r) as unknown as RefundRow[] };
  }

  /** Reported transfers waiting for a check, oldest first, with their booking reference. */
  async pendingTransfers(): Promise<(LedgerRow & { booking: { reference: string; guest_name: string } | null })[]> {
    return check(
      await this.db.from("payments").select(`${LEDGER_COLS}, booking:bookings(reference, guest_name)`).eq("status", "pending").order("created_at").limit(100),
    ) as unknown as (LedgerRow & { booking: { reference: string; guest_name: string } | null })[];
  }

  async recentPayments(limit = 50): Promise<(LedgerRow & { booking: { reference: string; guest_name: string } | null })[]> {
    return check(
      await this.db.from("payments").select(`${LEDGER_COLS}, booking:bookings(reference, guest_name)`).order("created_at", { ascending: false }).limit(limit),
    ) as unknown as (LedgerRow & { booking: { reference: string; guest_name: string } | null })[];
  }

  async verify(paymentId: string, accept: boolean, note: string) {
    check(await this.db.rpc("admin_verify_payment", { p_payment: paymentId, p_accept: accept, p_note: note }));
  }

  async invoice(bookingId: string): Promise<InvoiceDoc> {
    return check(await this.db.rpc("admin_invoice", { p_booking: bookingId })) as unknown as InvoiceDoc;
  }

  async receipt(paymentId: string): Promise<ReceiptDoc> {
    return check(await this.db.rpc("admin_payment_receipt", { p_payment: paymentId })) as unknown as ReceiptDoc;
  }

  async reconciliation(from: string, to: string): Promise<Reconciliation> {
    return check(await this.db.rpc("admin_payment_reconciliation", { p_from: from, p_to: to })) as unknown as Reconciliation;
  }

  async gatewayEvents(limit = 30): Promise<GatewayEventRow[]> {
    return check(
      await this.db.from("payment_gateway_events").select("id, provider, event_id, intent_id, status, amount_bdt, signature_ok, verified, outcome, received_at").order("received_at", { ascending: false }).limit(limit),
    ) as unknown as GatewayEventRow[];
  }

  async messages(opts: { status?: MessageRow["status"] | "problems"; bookingId?: string; limit?: number } = {}): Promise<MessageRow[]> {
    let q = this.db.from("message_outbox").select(MESSAGE_COLS).order("created_at", { ascending: false }).limit(opts.limit ?? 100);
    if (opts.bookingId) q = q.eq("booking_id", opts.bookingId);
    if (opts.status === "problems") q = q.in("status", ["failed", "unconfigured", "skipped"]);
    else if (opts.status) q = q.eq("status", opts.status);
    return check(await q) as unknown as MessageRow[];
  }

  async messageCounts(): Promise<Record<string, number>> {
    const rows = check(await this.db.from("message_outbox").select("status").gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).limit(5000)) as { status: string }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
    return out;
  }

  async messageEvents(messageId: string): Promise<{ kind: string; detail: Record<string, unknown>; created_at: string }[]> {
    return check(await this.db.from("message_events").select("kind, detail, created_at").eq("message_id", messageId).order("created_at")) as unknown as {
      kind: string;
      detail: Record<string, unknown>;
      created_at: string;
    }[];
  }

  async resend(messageId: string): Promise<string> {
    return String(check(await this.db.rpc("admin_resend_message", { p_id: messageId })));
  }

  async setMethods(methods: string[]): Promise<string[]> {
    return check(await this.db.rpc("admin_set_payment_methods", { p_methods: methods })) as unknown as string[];
  }

  async offeredMethods(): Promise<string[]> {
    const r = check(await this.db.from("hotel_settings").select("payment_methods").eq("id", 1).maybeSingle()) as { payment_methods: string[] } | null;
    return r?.payment_methods ?? ["pay_at_hotel"];
  }
}

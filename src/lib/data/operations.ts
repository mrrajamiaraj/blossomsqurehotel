import "server-only";
import type { Permission, StaffRole } from "../access";
import type { TypedClient } from "../supabase/server";
import { errorCode, RepoError } from "./errors";
import type { PaymentMethod } from "./types";

/* ------------------------------------------------------------------ Types */

export type LedgerPayment = {
  id: string;
  booking_id: string;
  amount_bdt: number;
  method: PaymentMethod;
  status: "pending" | "confirmed" | "failed" | "void";
  reference: string | null;
  note: string | null;
  received_at: string;
  void_reason: string | null;
};

export type RefundStatus = "requested" | "approved" | "rejected" | "completed";
export type Refund = {
  id: string;
  booking_id: string;
  payment_id: string | null;
  amount_bdt: number;
  method: PaymentMethod;
  reason: string;
  status: RefundStatus;
  reference: string | null;
  requested_by: string | null;
  decided_by: string | null;
  created_at: string;
};

export type RoomBlock = { id: string; room_id: string; starts_on: string; ends_on: string; reason: string; released_at: string | null };

export type TaskKind = "clean" | "inspect" | "turndown" | "maintenance" | "other";
export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";
export type HousekeepingTask = {
  id: string;
  room_id: string;
  booking_id: string | null;
  kind: TaskKind;
  status: TaskStatus;
  priority: 1 | 2 | 3;
  due_on: string;
  assigned_to: string | null;
  notes: string | null;
  completed_at: string | null;
};

export type Notification = { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

export type AuditEntry = {
  at: string;
  actor: string | null;
  actor_name: string | null;
  actor_role: StaffRole | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  table_name: string;
  record_id: string | null;
  changed_fields: string[] | null;
};

export type MyAccess =
  | { staff: false }
  | { staff: true; role: StaffRole; role_name: string; rank: number; requires_mfa: boolean; mfa_ok: boolean; permissions: Permission[] };

/* ----------------------------------------------------------------- Access */

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) {
    const code = errorCode(new Error(res.error.message));
    if (code === "UNKNOWN") console.error("Supabase:", res.error.message);
    throw new RepoError(code);
  }
  return res.data;
}

/**
 * Typed access to the staff operations added by the access-architecture
 * migrations. Every write is a SQL function that checks the caller's
 * permission (and MFA) itself; reads go through RLS. Use with the session
 * client of the signed-in staff member — never the secret key.
 */
export class OperationsRepo {
  constructor(private db: TypedClient) {}

  async myAccess(): Promise<MyAccess> {
    return check(await this.db.rpc("my_access")) as unknown as MyAccess;
  }

  /* Payments & refunds */
  async payments(bookingId: string): Promise<LedgerPayment[]> {
    return check(
      await this.db.from("payments").select("id, booking_id, amount_bdt, method, status, reference, note, received_at, void_reason").eq("booking_id", bookingId).order("received_at"),
    ) as LedgerPayment[];
  }
  async refunds(opts: { bookingId?: string; status?: RefundStatus } = {}): Promise<Refund[]> {
    let q = this.db.from("refunds").select("id, booking_id, payment_id, amount_bdt, method, reason, status, reference, requested_by, decided_by, created_at").order("created_at", { ascending: false });
    if (opts.bookingId) q = q.eq("booking_id", opts.bookingId);
    if (opts.status) q = q.eq("status", opts.status);
    return check(await q) as Refund[];
  }
  async voidPayment(paymentId: string, reason: string) {
    check(await this.db.rpc("admin_void_payment", { p_payment: paymentId, p_reason: reason }));
  }
  async requestRefund(i: { bookingId: string; amount: number; method: PaymentMethod; reason: string; paymentId?: string | null }): Promise<string> {
    return String(
      check(await this.db.rpc("admin_request_refund", { p_booking: i.bookingId, p_amount: i.amount, p_method: i.method, p_reason: i.reason, p_payment: i.paymentId ?? undefined })),
    );
  }
  async decideRefund(refundId: string, approve: boolean) {
    check(await this.db.rpc("admin_decide_refund", { p_refund: refundId, p_approve: approve }));
  }
  async completeRefund(refundId: string, reference: string) {
    check(await this.db.rpc("admin_complete_refund", { p_refund: refundId, p_reference: reference }));
  }

  /* Maintenance */
  async blocks(roomId?: string): Promise<RoomBlock[]> {
    let q = this.db.from("room_blocks").select("id, room_id, starts_on, ends_on, reason, released_at").is("released_at", null).order("starts_on");
    if (roomId) q = q.eq("room_id", roomId);
    return check(await q) as RoomBlock[];
  }
  async blockRoom(roomId: string, from: string, to: string, reason: string): Promise<string> {
    return String(check(await this.db.rpc("admin_block_room", { p_room: roomId, p_from: from, p_to: to, p_reason: reason })));
  }
  async releaseBlock(blockId: string) {
    check(await this.db.rpc("admin_release_block", { p_block: blockId }));
  }

  /* Housekeeping */
  async tasks(opts: { open?: boolean; assignedTo?: string } = {}): Promise<HousekeepingTask[]> {
    let q = this.db.from("housekeeping_tasks").select("id, room_id, booking_id, kind, status, priority, due_on, assigned_to, notes, completed_at").order("due_on").order("priority");
    if (opts.open) q = q.in("status", ["open", "in_progress"]);
    if (opts.assignedTo) q = q.eq("assigned_to", opts.assignedTo);
    return check(await q) as HousekeepingTask[];
  }
  async createTask(i: { roomId: string; kind: TaskKind; due?: string | null; assignedTo?: string | null; notes?: string; priority?: 1 | 2 | 3 }): Promise<string> {
    return String(
      check(
        await this.db.rpc("admin_create_task", {
          p_room: i.roomId,
          p_kind: i.kind,
          p_due: i.due as string,
          p_assigned: i.assignedTo as string,
          p_notes: i.notes ?? "",
          p_priority: i.priority ?? 2,
        }),
      ),
    );
  }
  async updateTask(taskId: string, status: TaskStatus, notes?: string) {
    check(await this.db.rpc("admin_update_task", { p_task: taskId, p_status: status, p_notes: notes ?? "" }));
  }

  /* Notifications & audit */
  async notifications(limit = 30): Promise<Notification[]> {
    return check(await this.db.from("notifications").select("id, kind, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(limit)) as Notification[];
  }
  async markRead(ids?: string[]): Promise<number> {
    return Number(check(await this.db.rpc("mark_notifications_read", { p_ids: ids as string[] })));
  }
  async auditLog(opts: { table?: string; record?: string; limit?: number } = {}): Promise<AuditEntry[]> {
    return check(
      await this.db.rpc("admin_audit_log", { p_table: opts.table as string, p_record: opts.record as string, p_limit: opts.limit ?? 100 }),
    ) as unknown as AuditEntry[];
  }
}

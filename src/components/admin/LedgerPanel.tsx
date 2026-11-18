"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeRefund, decideRefund, requestRefund, voidPayment } from "@/app/admin/operations";
import { verifyPayment } from "@/app/admin/payments";
import type { LedgerRow, RefundRow } from "@/lib/data/payments";
import type { PaymentMethod } from "@/lib/data/types";
import { formatTaka } from "@/lib/format";
import { LEDGER_LABEL } from "@/lib/payments/methods";
import { toast } from "../ui/Toaster";
import Dialog from "./Dialog";

type Perms = { record: boolean; void: boolean; refundRequest: boolean; refundApprove: boolean };

const STATUS: Record<LedgerRow["status"], { label: string; badge: string }> = {
  pending: { label: "To verify", badge: "pending" },
  confirmed: { label: "Received", badge: "confirmed" },
  failed: { label: "Not received", badge: "cancelled" },
  void: { label: "Void", badge: "checked_out" },
};
const REFUND: Record<RefundRow["status"], { label: string; badge: string }> = {
  requested: { label: "Awaiting approval", badge: "pending" },
  approved: { label: "Approved — pay out", badge: "checked_in" },
  rejected: { label: "Rejected", badge: "checked_out" },
  completed: { label: "Refunded", badge: "confirmed" },
};
const SOURCE: Record<LedgerRow["source"], string> = { desk: "Desk", guest: "Reported by guest", gateway: "Online" };
const METHODS: PaymentMethod[] = ["cash", "bkash", "nagad", "card", "bank", "other"];

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" });

type Pending =
  | { kind: "verify"; p: LedgerRow; accept: boolean }
  | { kind: "void"; p: LedgerRow }
  | { kind: "refund"; p: LedgerRow | null }
  | { kind: "complete"; r: RefundRow }
  | null;

export default function LedgerPanel({
  bookingId,
  reference,
  payments,
  refunds,
  paid,
  perms,
  live,
  me,
}: {
  bookingId: string;
  reference: string;
  payments: LedgerRow[];
  refunds: RefundRow[];
  paid: number;
  perms: Perms;
  live: boolean;
  me: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<Pending>(null);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");

  const open = (d: Exclude<Pending, null>) => {
    setNote("");
    if (d.kind === "refund") {
      setAmount(String(d.p ? Math.min(d.p.amount_bdt, paid) : paid));
      setMethod((d.p?.method as PaymentMethod) && METHODS.includes(d.p?.method as PaymentMethod) ? (d.p!.method as PaymentMethod) : "cash");
    }
    setDialog(d);
  };

  const act = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        setDialog(null);
        router.refresh();
      } else toast.error(r.message ?? "Something went wrong");
    });

  const submit = () => {
    if (!dialog) return;
    if (dialog.kind === "verify") act(() => verifyPayment(dialog.p.id, dialog.accept, note));
    else if (dialog.kind === "void") act(() => voidPayment(dialog.p.id, note));
    else if (dialog.kind === "refund") act(() => requestRefund(bookingId, Math.round(Number(amount)), method, note, dialog.p?.id));
    else if (dialog.kind === "complete") act(() => completeRefund(dialog.r.id, note));
  };

  const toVerify = payments.filter((p) => p.status === "pending");

  return (
    <section className="a-panel" aria-labelledby="ledger-h">
      <div className="a-panel-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <h2 id="ledger-h" className="a-h2">
          Payments<span className="a-count">{payments.length}</span>
        </h2>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link className="a-btn a-btn--sm" href={`/admin/bookings/${reference}/invoice`}>
            Invoice
          </Link>
          {perms.refundRequest && paid > 0 && (
            <button type="button" className="a-btn a-btn--sm" disabled={!live || pending} onClick={() => open({ kind: "refund", p: null })}>
              Request refund
            </button>
          )}
        </span>
      </div>

      {toVerify.length > 0 && (
        <p className="a-hint" role="status" style={{ padding: "10px 20px 0", margin: 0 }}>
          <strong>
            {toVerify.length} reported payment{toVerify.length > 1 ? "s" : ""} to check.
          </strong>{" "}
          Confirm only after you see the money in the bank statement or bKash / Nagad merchant app.
        </p>
      )}

      {payments.length === 0 ? (
        <div className="a-empty">
          <strong>No payments yet</strong>
          <span>Record money taken at the desk with “Record payment”. Guests can report transfers from their booking page.</span>
        </div>
      ) : (
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {payments.map((p) => (
            <li key={p.id} style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", alignItems: "center", padding: "12px 20px", borderTop: "1px solid var(--a-line)" }}>
              <span style={{ flex: "1 1 220px", minWidth: 0 }}>
                <strong>{formatTaka(p.amount_bdt)}</strong> · {LEDGER_LABEL[p.method] ?? p.method}{" "}
                <span className="a-badge" data-s={STATUS[p.status].badge}>
                  {STATUS[p.status].label}
                </span>
                <span className="a-hint" style={{ display: "block" }}>
                  {SOURCE[p.source]} · {when(p.status === "pending" ? p.created_at : p.received_at)}
                  {p.reference ? ` · Ref ${p.reference}` : ""}
                  {p.sender ? ` · from ${p.sender}` : ""}
                  {p.receipt_no ? ` · ${p.receipt_no}` : ""}
                  {p.review_note ? ` · “${p.review_note}”` : ""}
                  {p.void_reason ? ` · void: ${p.void_reason}` : ""}
                </span>
              </span>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {p.status === "pending" && perms.record && p.source === "guest" && (
                  <>
                    <button type="button" className="a-btn a-btn--sm a-btn--primary" disabled={!live || pending} onClick={() => open({ kind: "verify", p, accept: true })}>
                      Confirm received
                    </button>
                    <button type="button" className="a-btn a-btn--sm" disabled={!live || pending} onClick={() => open({ kind: "verify", p, accept: false })}>
                      Not received
                    </button>
                  </>
                )}
                {p.status === "confirmed" && (
                  <Link className="a-btn a-btn--sm a-btn--ghost" href={`/admin/receipts/${p.id}`}>
                    Receipt
                  </Link>
                )}
                {p.status === "confirmed" && perms.refundRequest && (
                  <button type="button" className="a-btn a-btn--sm a-btn--ghost" disabled={!live || pending} onClick={() => open({ kind: "refund", p })}>
                    Refund
                  </button>
                )}
                {p.status === "confirmed" && perms.void && p.source !== "gateway" && (
                  <button type="button" className="a-btn a-btn--sm a-btn--ghost" disabled={!live || pending} onClick={() => open({ kind: "void", p })}>
                    Void
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {refunds.length > 0 && (
        <>
          <h3 className="a-eyebrow" style={{ padding: "14px 20px 4px", margin: 0, borderTop: "1px solid var(--a-line)" }}>
            Refunds
          </h3>
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {refunds.map((r) => (
              <li key={r.id} style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", alignItems: "center", padding: "10px 20px", borderTop: "1px solid var(--a-line)" }}>
                <span style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <strong>{formatTaka(r.amount_bdt)}</strong> · {LEDGER_LABEL[r.method] ?? r.method}{" "}
                  <span className="a-badge" data-s={REFUND[r.status].badge}>
                    {REFUND[r.status].label}
                  </span>
                  <span className="a-hint" style={{ display: "block" }}>
                    {when(r.created_at)} · “{r.reason}”{r.reference ? ` · Ref ${r.reference}` : ""}
                  </span>
                </span>
                <span style={{ display: "flex", gap: 6 }}>
                  {r.status === "requested" && perms.refundApprove && r.requested_by !== me && (
                    <>
                      <button type="button" className="a-btn a-btn--sm a-btn--primary" disabled={!live || pending} onClick={() => act(() => decideRefund(r.id, true))}>
                        Approve
                      </button>
                      <button type="button" className="a-btn a-btn--sm" disabled={!live || pending} onClick={() => act(() => decideRefund(r.id, false))}>
                        Reject
                      </button>
                    </>
                  )}
                  {r.status === "requested" && r.requested_by === me && <span className="a-hint">Another colleague approves it</span>}
                  {r.status === "approved" && perms.refundApprove && (
                    <button type="button" className="a-btn a-btn--sm a-btn--primary" disabled={!live || pending} onClick={() => open({ kind: "complete", r })}>
                      Mark paid out
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog
        open={Boolean(dialog)}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        title={
          dialog?.kind === "verify"
            ? dialog.accept
              ? `Confirm ${formatTaka(dialog.p.amount_bdt)} was received?`
              : "Mark as not received?"
            : dialog?.kind === "void"
              ? "Void this payment?"
              : dialog?.kind === "refund"
                ? "Request a refund"
                : "Mark refund as paid out"
        }
        description={
          dialog?.kind === "verify"
            ? dialog.accept
              ? `Check ${LEDGER_LABEL[dialog.p.method]} transaction ${dialog.p.reference} is in the statement first. The guest gets a receipt.`
              : "The guest is told the payment couldn't be confirmed, with your reason."
            : dialog?.kind === "void"
              ? "Only for a payment recorded by mistake. It stops counting towards the booking."
              : dialog?.kind === "refund"
                ? "Finance (or another manager) approves it, then marks it paid out."
                : "Add the bKash / bank reference of the refund, if any."
        }
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setDialog(null)} disabled={pending}>
              Cancel
            </button>
            <button
              type="submit"
              className={`a-btn ${dialog?.kind === "void" || (dialog?.kind === "verify" && !dialog.accept) ? "a-btn--danger" : "a-btn--primary"}`}
              disabled={pending || ((dialog?.kind === "void" || dialog?.kind === "refund" || (dialog?.kind === "verify" && !dialog.accept)) && note.trim().length < 3)}
            >
              {pending && <span className="a-spin" aria-hidden="true" />}
              {dialog?.kind === "verify" ? (dialog.accept ? "Confirm received" : "Not received") : dialog?.kind === "void" ? "Void payment" : dialog?.kind === "refund" ? "Request refund" : "Mark paid out"}
            </button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {dialog?.kind === "refund" && (
            <div className="a-grid-2">
              <label className="a-field">
                <span className="a-label">Amount (৳)</span>
                <input className="a-input a-num" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} required />
                <span className="a-hint">Up to {formatTaka(paid)} (what's been paid).</span>
              </label>
              <label className="a-field">
                <span className="a-label">Refund by</span>
                <select className="a-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {LEDGER_LABEL[m]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <label className="a-field">
            <span className="a-label">
              {dialog?.kind === "complete" ? "Refund reference (optional)" : dialog?.kind === "verify" && dialog.accept ? "Note (optional)" : "Reason"}
            </span>
            <input
              className="a-input"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                dialog?.kind === "verify" && !dialog.accept
                  ? "e.g. Not in today's EBL statement"
                  : dialog?.kind === "refund"
                    ? "e.g. Cancelled 10 days before arrival"
                    : dialog?.kind === "void"
                      ? "e.g. Entered twice"
                      : ""
              }
            />
          </label>
        </div>
      </Dialog>
    </section>
  );
}

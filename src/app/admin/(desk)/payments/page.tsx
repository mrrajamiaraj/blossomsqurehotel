import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit";
import { can } from "@/lib/access";
import { requirePermission } from "@/lib/admin/session";
import { hotelToday, addDays, isISODate } from "@/lib/dates";
import { PaymentsRepo, type GatewayEventRow, type LedgerRow, type Reconciliation } from "@/lib/data/payments";
import { formatTaka } from "@/lib/format";
import { integrationStatus } from "@/lib/integrations";
import { LEDGER_LABEL, METHODS } from "@/lib/payments/methods";
import { getSessionClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Payments" };

const EXCEPTION: Record<string, string> = {
  unverified_transfer: "Reported transfer not checked for over a day",
  amount_mismatch: "Gateway paid a different amount",
  missing_ledger_entry: "Gateway success without a ledger entry",
  gateway_bad_signature: "Notification with an invalid signature",
  gateway_unverified: "Notification the gateway didn't confirm",
  gateway_rejected: "Notification that couldn't be applied",
  gateway_mismatch: "Notification with a different amount",
  overpaid: "Paid more than the booking total",
  refund_owed: "Cancelled with money held, no refund started",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" });
type WithBooking = LedgerRow & { booking: { reference: string; guest_name: string } | null };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { mode, access } = await requirePermission("payments.read");
  const sp = await searchParams;
  const today = hotelToday();
  const to = sp.to && isISODate(sp.to) ? sp.to : today;
  const from = sp.from && isISODate(sp.from) && sp.from <= to ? sp.from : addDays(to, -6);
  const status = integrationStatus();

  let pending: WithBooking[] = [];
  let recent: WithBooking[] = [];
  let rec: Reconciliation | null = null;
  let events: GatewayEventRow[] = [];
  let offered: string[] = [];
  let failed = false;
  if (mode === "live") {
    const repo = new PaymentsRepo(await getSessionClient());
    try {
      [pending, recent, rec, events, offered] = await Promise.all([repo.pendingTransfers(), repo.recentPayments(40), repo.reconciliation(from, to), repo.gatewayEvents(20), repo.offeredMethods()]);
    } catch (err) {
      console.error("Payments page:", err);
      failed = true;
    }
  }
  const total = rec?.by_method.reduce((s, m) => s + m.received - m.refunded, 0) ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1180 }}>
      <PageHeader
        eyebrow="Revenue"
        title="Payments"
        description="Transfers waiting to be checked, takings by method, and anything that doesn't add up. Open a booking to confirm a transfer, refund or print a receipt."
        actions={
          can(access, "settings.manage") ? (
            <Link href="/admin/settings#payments" className="a-btn">
              Payment methods
            </Link>
          ) : undefined
        }
      />
      {mode === "preview" && <p className="a-hint">Payments need Supabase.</p>}
      {failed && (
        <p className="a-error" role="alert">
          Couldn&apos;t load payments. Refresh to try again.
        </p>
      )}

      <section className="a-panel" aria-labelledby="verify-h">
        <div className="a-panel-head">
          <h2 id="verify-h" className="a-h2">
            To verify<span className="a-count">{pending.length}</span>
          </h2>
          <span className="a-hint">Confirm only once the money shows in the bank statement or merchant app.</span>
        </div>
        {pending.length === 0 ? (
          <div className="a-empty">
            <strong>Nothing to check</strong>
            <span>When a guest reports a bank, bKash or Nagad transfer, it appears here.</span>
          </div>
        ) : (
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {pending.map((p) => (
              <li key={p.id} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "12px 20px", borderTop: "1px solid var(--a-line)" }}>
                <span style={{ flex: "1 1 240px" }}>
                  <strong>{formatTaka(p.amount_bdt)}</strong> · {LEDGER_LABEL[p.method]} · Ref <code>{p.reference}</code>
                  <span className="a-hint" style={{ display: "block" }}>
                    {p.booking?.guest_name} · {p.booking?.reference} · reported {when(p.created_at)}
                    {p.sender ? ` · from ${p.sender}` : ""}
                  </span>
                </span>
                {p.booking && (
                  <Link className="a-btn a-btn--sm a-btn--primary" href={`/admin/bookings/${p.booking.reference}#ledger-h`}>
                    Check
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="a-panel" aria-labelledby="rec-h">
        <div className="a-panel-head" style={{ flexWrap: "wrap", gap: 10 }}>
          <h2 id="rec-h" className="a-h2">
            Reconciliation
          </h2>
          <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            <label className="a-field">
              <span className="a-label">From</span>
              <input className="a-input" type="date" name="from" defaultValue={from} max={today} />
            </label>
            <label className="a-field">
              <span className="a-label">To</span>
              <input className="a-input" type="date" name="to" defaultValue={to} max={today} />
            </label>
            <button className="a-btn a-btn--sm" type="submit">
              Show
            </button>
          </form>
        </div>
        <div className="a-table-wrap">
          <table className="a-table a-table--stack">
            <thead>
              <tr>
                <th>Method</th>
                <th className="a-num">Received</th>
                <th className="a-num">Payments</th>
                <th className="a-num">Refunded</th>
                <th className="a-num">Net</th>
                <th className="a-num">Waiting to verify</th>
              </tr>
            </thead>
            <tbody>
              {(rec?.by_method ?? []).map((m) => (
                <tr key={m.method}>
                  <td data-label="">{LEDGER_LABEL[m.method] ?? m.method}</td>
                  <td data-label="Received" className="a-num">
                    {formatTaka(m.received)}
                  </td>
                  <td data-label="Payments" className="a-num">
                    {m.count}
                  </td>
                  <td data-label="Refunded" className="a-num">
                    {m.refunded ? `−${formatTaka(m.refunded)}` : "—"}
                  </td>
                  <td data-label="Net" className="a-num">
                    <strong>{formatTaka(m.received - m.refunded)}</strong>
                  </td>
                  <td data-label="Waiting" className="a-num">
                    {m.pending ? formatTaka(m.pending) : "—"}
                  </td>
                </tr>
              ))}
              <tr>
                <td data-label="">
                  <strong>Total</strong>
                </td>
                <td colSpan={3} />
                <td data-label="Net" className="a-num">
                  <strong>{formatTaka(total)}</strong>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="a-hint" style={{ padding: "8px 20px" }}>
          Compare each method&apos;s “Received” with the bank statement, bKash / Nagad merchant statement and the cash drawer for the same dates (Asia/Dhaka).
        </p>
        <h3 className="a-eyebrow" style={{ padding: "8px 20px 0", margin: 0 }}>
          To look into<span className="a-count">{rec?.exceptions.length ?? 0}</span>
        </h3>
        {rec && rec.exceptions.length > 0 ? (
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rec.exceptions.map((e, i) => (
              <li key={i} style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "10px 20px", borderTop: "1px solid var(--a-line)" }}>
                <span style={{ flex: "1 1 260px" }}>
                  <strong>{EXCEPTION[e.kind] ?? e.kind}</strong>
                  <span className="a-hint" style={{ display: "block" }}>
                    {e.reference ? (
                      <Link className="a-link" href={`/admin/bookings/${e.reference}`}>
                        {e.reference}
                      </Link>
                    ) : (
                      "No booking"
                    )}{" "}
                    · {when(e.at)} · {e.detail}
                  </span>
                </span>
                {e.amount != null && <span className="a-num">{formatTaka(e.amount)}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a-hint" style={{ padding: "6px 20px 16px" }}>
            Nothing unusual for these dates.
          </p>
        )}
      </section>

      <section className="a-panel" aria-labelledby="hist-h">
        <div className="a-panel-head">
          <h2 id="hist-h" className="a-h2">
            Recent payments
          </h2>
        </div>
        <div className="a-table-wrap">
          <table className="a-table a-table--stack">
            <thead>
              <tr>
                <th>When</th>
                <th>Booking</th>
                <th>Method</th>
                <th>Status</th>
                <th className="a-num">Amount</th>
                <th>
                  <span className="sr-only">Receipt</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.id}>
                  <td data-label="When">{when(p.status === "pending" ? p.created_at : p.received_at)}</td>
                  <td data-label="Booking">
                    {p.booking ? (
                      <Link className="a-link" href={`/admin/bookings/${p.booking.reference}`}>
                        {p.booking.reference}
                      </Link>
                    ) : (
                      "—"
                    )}
                    <span className="a-hint" style={{ display: "block" }}>
                      {p.booking?.guest_name}
                    </span>
                  </td>
                  <td data-label="Method">
                    {LEDGER_LABEL[p.method] ?? p.method}
                    {p.reference ? <span className="a-hint" style={{ display: "block" }}>{p.reference}</span> : null}
                  </td>
                  <td data-label="Status">
                    <span className="a-badge" data-s={p.status === "confirmed" ? "confirmed" : p.status === "pending" ? "pending" : p.status === "failed" ? "cancelled" : "checked_out"}>
                      {p.status === "confirmed" ? "Received" : p.status === "pending" ? "To verify" : p.status === "failed" ? "Not received" : "Void"}
                    </span>
                  </td>
                  <td data-label="Amount" className="a-num">
                    {formatTaka(p.amount_bdt)}
                  </td>
                  <td data-label="">
                    {p.status === "confirmed" && (
                      <Link className="a-btn a-btn--sm a-btn--ghost" href={`/admin/receipts/${p.id}`}>
                        {p.receipt_no ?? "Receipt"}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="a-panel" aria-labelledby="gw-h">
        <div className="a-panel-head">
          <h2 id="gw-h" className="a-h2">
            Online payments
          </h2>
        </div>
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {status.gateways.map((g) => {
            const on = offered.includes(g.id);
            return (
              <li key={g.id} style={{ padding: "12px 20px", borderTop: "1px solid var(--a-line)" }}>
                <strong>{METHODS.find((m) => m.id === g.id)?.label}</strong>{" "}
                <span className="a-badge" data-s={g.configured && on ? "confirmed" : g.configured ? "pending" : "checked_out"}>
                  {g.configured ? (on ? "Live" : "Connected, switched off") : "Not set up"}
                </span>
                <span className="a-hint" style={{ display: "block" }}>
                  {g.configured
                    ? "Payments are confirmed only by the gateway's server-to-server answer; the guest's browser is never trusted."
                    : g.id === "nagad"
                      ? "Needs Nagad merchant onboarding (keys and API pack). Guests can pay to the Nagad merchant number and report it meanwhile."
                      : `Needs merchant approval and ${g.missing.join(", ")} on the server.`}
                </span>
              </li>
            );
          })}
        </ul>
        {events.length > 0 && (
          <div className="a-table-wrap">
            <table className="a-table a-table--stack">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Gateway</th>
                  <th>Result</th>
                  <th>Checks</th>
                  <th className="a-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td data-label="Received">{when(e.received_at)}</td>
                    <td data-label="Gateway">{e.provider}</td>
                    <td data-label="Result">
                      {e.outcome}
                      {e.status ? ` (${e.status})` : ""}
                    </td>
                    <td data-label="Checks">
                      {e.signature_ok ? "signature ✓" : "signature ✗"} · {e.verified ? "confirmed with gateway ✓" : "not confirmed"}
                    </td>
                    <td data-label="Amount" className="a-num">
                      {e.amount_bdt != null ? formatTaka(e.amount_bdt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

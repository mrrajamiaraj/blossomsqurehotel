"use client";

import { useTransition } from "react";
import { resolveBookingRequest } from "@/app/admin/actions";
import { ago, longDate } from "@/lib/admin/format";
import type { BookingRequest } from "@/lib/data/types";
import { toast } from "../ui/Toaster";

/**
 * Requests guests sent from their booking page. Staff act with the normal
 * tools (Change stay, Cancel) — which re-check availability and prices —
 * then mark the request done or declined.
 */
export default function BookingRequests({ requests }: { requests: BookingRequest[] }) {
  const [pending, start] = useTransition();
  const open = requests.filter((r) => r.status === "open");
  if (!open.length) return null;

  const resolve = (id: string, status: "done" | "declined") =>
    start(async () => {
      const res = await resolveBookingRequest(id, status);
      if (res.ok) toast.success(res.message ?? "Saved");
      else toast.error(res.message);
    });

  return (
    <section className="a-panel" aria-labelledby="req-h">
      <div className="a-panel-head">
        <h2 id="req-h" className="a-h2">
          Guest requests
        </h2>
      </div>
      <ul role="list" className="a-panel-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {open.map((r) => (
          <li key={r.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <strong>{r.kind === "cancel" ? "Cancellation request" : "Date change request"}</strong>
            {r.kind === "change" && r.detail.check_in && r.detail.check_out && (
              <span>
                New dates: {longDate(r.detail.check_in)} → {longDate(r.detail.check_out)}
                {r.detail.available_when_requested === false ? " (not available when asked)" : " (available when asked)"}
              </span>
            )}
            {(r.detail.reason || r.detail.note) && <span className="a-muted">“{r.detail.reason || r.detail.note}”</span>}
            <span className="a-hint">
              {ago(r.created_at)} ·{" "}
              {r.kind === "cancel" ? "Cancel the booking (and refund under the policy), then mark done." : "Use Change stay to apply the dates, then mark done."}
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              <button type="button" className="a-btn a-btn--sm a-btn--primary" disabled={pending} onClick={() => resolve(r.id, "done")}>
                Mark done
              </button>
              <button type="button" className="a-btn a-btn--sm a-btn--ghost" disabled={pending} onClick={() => resolve(r.id, "declined")}>
                Decline
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

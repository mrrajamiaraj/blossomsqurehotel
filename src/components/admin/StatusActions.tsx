"use client";

import { setBookingStatus } from "@/app/admin/actions";
import { formatTaka } from "@/lib/format";
import { nextStatuses } from "@/lib/data/rules";
import type { BookingStatus } from "@/lib/data/types";
import ActionButton from "./ActionButton";

type Props = {
  id: string;
  status: BookingStatus;
  guest: string;
  balance: number;
  /** Hide no-show/cancel for compact rows (they stay on the booking page). */
  compact?: boolean;
  /** Pre-flight hint, e.g. check-in needs a room first. */
  needsRoom?: boolean;
  arrivalFuture?: boolean;
};

/** The lifecycle buttons that make sense from the booking's current status. */
export default function StatusActions({ id, status, guest, balance, compact, needsRoom, arrivalFuture }: Props) {
  const next = nextStatuses(status).filter((s) => !compact || (s !== "no_show" && !(s === "cancelled" && status !== "pending")));
  const first = guest.split(" ")[0];

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: compact ? "flex-end" : "flex-start" }}>
      {next.map((to) => {
        const run = (reason?: string) => setBookingStatus(id, to, reason);
        switch (to) {
          case "confirmed":
            return (
              <ActionButton key={to} action={run} className="a-btn a-btn--primary a-btn--sm" success={`Confirmed — call ${first} to let them know`}>
                Confirm
              </ActionButton>
            );
          case "checked_in":
            return (
              <ActionButton
                key={to}
                action={run}
                className="a-btn a-btn--primary a-btn--sm"
                success={`${first} is checked in`}
                disabled={needsRoom || arrivalFuture}
                title={needsRoom ? "Assign a room first" : arrivalFuture ? "Available on the arrival date" : undefined}
              >
                Check in
              </ActionButton>
            );
          case "checked_out":
            return (
              <ActionButton
                key={to}
                action={run}
                className="a-btn a-btn--primary a-btn--sm"
                success={`${first} has checked out — room marked for cleaning`}
                confirm={
                  balance > 0
                    ? {
                        title: "Balance still due",
                        body: (
                          <>
                            {guest} has <strong>{formatTaka(balance)}</strong> outstanding on the room. Record the
                            payment first, or check out anyway if it&apos;s been settled elsewhere.
                          </>
                        ),
                        confirmLabel: "Check out anyway",
                        danger: true,
                      }
                    : undefined
                }
              >
                Check out
              </ActionButton>
            );
          case "cancelled":
            return (
              <ActionButton
                key={to}
                action={run}
                className="a-btn a-btn--danger a-btn--sm"
                success="Booking cancelled — the room is released"
                confirm={{
                  title: status === "pending" ? "Decline this request?" : "Cancel this booking?",
                  body: `The room is released for these dates. This can't be undone.`,
                  confirmLabel: status === "pending" ? "Decline request" : "Cancel booking",
                  danger: true,
                  reason: { label: "Reason (kept on the booking)", placeholder: "e.g. Guest called to cancel", required: status !== "pending" },
                }}
              >
                {status === "pending" ? "Decline" : "Cancel"}
              </ActionButton>
            );
          case "no_show":
            return (
              <ActionButton
                key={to}
                action={run}
                className="a-btn a-btn--danger a-btn--sm"
                success="Marked as no-show — the room is released"
                disabled={arrivalFuture}
                confirm={{
                  title: "Mark as no-show?",
                  body: `Use this when ${first} didn't arrive. The room is released for the remaining nights.`,
                  confirmLabel: "Mark no-show",
                  danger: true,
                  reason: { label: "Note (optional)", placeholder: "e.g. No answer on phone" },
                }}
              >
                No-show
              </ActionButton>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

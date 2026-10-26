"use client";

import { useTransition } from "react";
import { updateRoom } from "@/app/admin/actions";
import type { Housekeeping } from "@/lib/data/types";
import { toast } from "../ui/Toaster";

type Row = { id: string; number: string; type: string; housekeeping: Housekeeping; outOfService: boolean; note: string | null };

/** Rooms that need attention, with one-tap status changes. */
export default function HousekeepingList({ rooms }: { rooms: Row[] }) {
  const [pending, start] = useTransition();
  const attention = rooms.filter((r) => r.housekeeping !== "inspected" || r.outOfService);
  const set = (id: string, housekeeping: Housekeeping, number: string) =>
    start(async () => {
      const res = await updateRoom(id, { housekeeping });
      toast(res.ok ? `Room ${number}: ${housekeeping === "clean" ? "cleaned" : housekeeping}` : res.message);
    });

  if (!attention.length) {
    return (
      <div className="a-empty">
        <strong>Every room inspected</strong>
        <span>Nothing waiting on housekeeping.</span>
      </div>
    );
  }

  return (
    <ul role="list" style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {attention.map((r) => (
        <li
          key={r.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 20px",
            borderTop: "1px solid var(--a-line)",
          }}
        >
          <span style={{ fontWeight: 600, minWidth: 34 }} className="a-num">
            {r.number}
          </span>
          <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
            <span style={{ display: "block", fontSize: "0.8rem" }}>{r.type}</span>
            <span style={{ fontSize: "0.74rem", color: r.outOfService ? "var(--s-cancel-fg)" : "var(--a-muted)" }}>
              {r.outOfService ? `Out of service${r.note ? ` — ${r.note}` : ""}` : r.housekeeping === "dirty" ? "Needs cleaning" : "Clean, not inspected"}
            </span>
          </span>
          {!r.outOfService && r.housekeeping === "dirty" && (
            <button type="button" className="a-btn a-btn--sm" disabled={pending} onClick={() => set(r.id, "clean", r.number)}>
              Mark clean
            </button>
          )}
          {!r.outOfService && r.housekeeping === "clean" && (
            <button type="button" className="a-btn a-btn--sm" disabled={pending} onClick={() => set(r.id, "inspected", r.number)}>
              Inspected
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

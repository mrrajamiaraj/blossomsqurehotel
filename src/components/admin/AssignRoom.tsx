"use client";

import { useTransition } from "react";
import { assignRoom } from "@/app/admin/actions";
import { toast } from "../ui/Toaster";

export type RoomOption = { id: string; number: string; note?: string; disabled?: boolean };

/** Inline room picker; saves as soon as a room is chosen. */
export default function AssignRoom({
  bookingId,
  value,
  options,
  compact,
}: {
  bookingId: string;
  value: string | null;
  options: RoomOption[];
  compact?: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <label className="a-field" style={{ minWidth: compact ? 130 : 180 }}>
      {!compact && <span className="a-label">Room</span>}
      <select
        className="a-input"
        aria-label="Assign room"
        value={value ?? ""}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const res = await assignRoom(bookingId, e.target.value || null);
            if (res.ok) toast.success((res.message ?? "Saved")); else toast.error(res.message);
          })
        }
        style={compact ? { minHeight: 32, paddingTop: 4, paddingBottom: 4 } : undefined}
      >
        <option value="">{value ? "Unassign" : "Choose room…"}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={o.disabled}>
            {o.number}
            {o.note ? ` — ${o.note}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

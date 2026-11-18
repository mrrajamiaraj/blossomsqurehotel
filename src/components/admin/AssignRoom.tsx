"use client";

import { useTransition } from "react";
import { assignRoom, assignRoomLine, autoAssignRooms } from "@/app/admin/actions";
import { toast } from "../ui/Toaster";

export type RoomOption = { id: string; number: string; note?: string; disabled?: boolean };

/**
 * Inline room picker; saves as soon as a room is chosen. With `lineId` it
 * assigns one room of a multi-room booking. The database refuses a room
 * that is taken, blocked, out of service or of another type.
 */
export default function AssignRoom({
  bookingId,
  lineId,
  value,
  options,
  compact,
  label = "Assign room",
}: {
  bookingId: string;
  lineId?: string;
  value: string | null;
  options: RoomOption[];
  compact?: boolean;
  label?: string;
}) {
  const [pending, start] = useTransition();

  return (
    <label className="a-field" style={{ minWidth: compact ? 130 : 180 }}>
      {!compact && <span className="a-label">Room</span>}
      <select
        className="a-input"
        aria-label={label}
        value={value ?? ""}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const room = e.target.value || null;
            const res = lineId ? await assignRoomLine(lineId, room) : await assignRoom(bookingId, room);
            if (res.ok) toast.success(res.message ?? "Saved");
            else toast.error(res.message);
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

/** Gives every unassigned room of the booking a free room of its type (clean rooms first). */
export function AutoAssign({ bookingId }: { bookingId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="a-btn a-btn--sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await autoAssignRooms(bookingId);
          if (res.ok) toast.success(res.message ?? "Saved");
          else toast.error(res.message);
        })
      }
    >
      {pending ? "Assigning…" : "Auto-assign rooms"}
    </button>
  );
}

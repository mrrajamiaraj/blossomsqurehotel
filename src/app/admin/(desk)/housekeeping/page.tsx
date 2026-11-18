import type { Metadata } from "next";
import HousekeepingBoard from "@/components/admin/HousekeepingBoard";
import { PageHeader } from "@/components/admin/kit";
import { can } from "@/lib/access";
import { requirePermission } from "@/lib/admin/session";
import { hotelToday } from "@/lib/dates";
import { OperationsRepo, type BoardRoom, type HousekeepingTask } from "@/lib/data/operations";
import { getSessionClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Housekeeping" };

export default async function HousekeepingPage() {
  const { mode, access, staff: me } = await requirePermission("housekeeping.read");
  const today = hotelToday();
  let rooms: BoardRoom[] = [];
  let tasks: HousekeepingTask[] = [];
  let staff: { user_id: string; full_name: string }[] = [];
  let failed = false;
  if (mode === "live") {
    const ops = new OperationsRepo(await getSessionClient());
    try {
      [rooms, tasks, staff] = await Promise.all([ops.board(today), ops.tasks({ open: true }), ops.housekeepingStaff()]);
    } catch (err) {
      console.error("Housekeeping:", err);
      failed = true;
    }
  }
  const canAssign = can(access, "housekeeping.write") && (can(access, "bookings.write") || can(access, "maintenance.manage"));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        eyebrow="Operations"
        title="Housekeeping"
        description="Every room's status, today's tasks, and repairs. Occupied and out-of-service are set automatically from check-ins and maintenance."
      />
      {failed && (
        <p className="a-error" role="alert">
          Couldn&apos;t load housekeeping. Refresh to try again.
        </p>
      )}
      <HousekeepingBoard
        rooms={rooms}
        tasks={tasks}
        staff={staff}
        me={me.id}
        canAssign={canAssign}
        canWrite={can(access, "housekeeping.write")}
        live={mode === "live"}
        today={today}
      />
    </div>
  );
}

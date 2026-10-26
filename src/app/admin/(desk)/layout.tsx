import AdminShell from "@/components/admin/AdminShell";
import { requireAdmin } from "@/lib/admin/session";

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const { repo, staff, mode } = await requireAdmin();
  const [pending, rooms] = await Promise.all([repo.countPending(), repo.listRooms()]);
  const dirty = rooms.filter((r) => r.housekeeping === "dirty" && !r.out_of_service).length;

  return (
    <AdminShell staff={staff} mode={mode} pending={pending} dirtyRooms={dirty}>
      {children}
    </AdminShell>
  );
}

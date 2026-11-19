import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit";
import { TeamPanel } from "@/components/admin/SettingsForms";
import { can, ROLES, ROLE_PERMISSIONS } from "@/lib/access";
import { requirePermission } from "@/lib/admin/session";
import type { StaffMember } from "@/lib/data/types";
import { getServiceClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Team" };

const PLAIN: Record<string, string> = {
  owner: "Everything, including appointing other owners",
  super_admin: "Everything below the owner",
  manager: "Runs the hotel: bookings, rooms, rates, offers, website, team (not refund approval)",
  finance: "Payments, refunds (request and approve) and reports",
  receptionist: "Bookings, guests, desk payments, housekeeping and enquiries",
  content_editor: "Website content, photos and reviews",
  housekeeping: "Housekeeping tasks, room status and repair reports",
};

export default async function TeamPage() {
  const { repo, staff, mode, access } = await requirePermission("staff.read");
  const team = await repo.listStaff();
  let withEmail: StaffMember[] = team;
  const service = mode === "live" ? getServiceClient() : null;
  if (service) {
    const { data } = await service.auth.admin.listUsers({ perPage: 200 });
    const emails = new Map(data?.users.map((u) => [u.id, u.email ?? null]) ?? []);
    withEmail = team.map((m) => ({ ...m, email: emails.get(m.user_id) ?? m.email ?? null }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1040 }}>
      <PageHeader
        eyebrow="People"
        title="Team"
        description="Invite colleagues, choose what they can do, and remove access when they leave. Nobody can change their own role."
        actions={
          can(access, "audit.read") ? (
            <Link href="/admin/activity" className="a-btn">
              Activity log
            </Link>
          ) : undefined
        }
      />
      <TeamPanel staff={withEmail} selfId={staff.id} myRole={staff.role} live={mode === "live" && Boolean(service) && can(access, "staff.manage")} />
      <section className="a-panel" aria-labelledby="roles-h">
        <div className="a-panel-head">
          <h2 id="roles-h" className="a-h2">
            What each role can do
          </h2>
          <span className="a-hint">An authenticator-app code is optional for every role; each person can turn it on from My account.</span>
        </div>
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {ROLES.map((r) => (
            <li key={r.code} style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "12px 20px", borderTop: "1px solid var(--a-line)" }}>
              <strong style={{ minWidth: 150 }}>{r.name}</strong>
              <span className="a-muted" style={{ flex: "1 1 320px" }}>
                {PLAIN[r.code]} <span className="a-hint">({ROLE_PERMISSIONS[r.code].length} permissions)</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

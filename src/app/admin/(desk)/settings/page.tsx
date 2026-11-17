import type { Metadata } from "next";
import { PoliciesForm, TeamPanel } from "@/components/admin/SettingsForms";
import { can } from "@/lib/access";
import { requirePermission } from "@/lib/admin/session";
import type { StaffMember } from "@/lib/data/types";
import { getServiceClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { repo, staff, mode, access } = await requirePermission("settings.manage");
  const showTeam = can(access, "staff.read");
  const [settings, team] = await Promise.all([repo.getSettings(), showTeam ? repo.listStaff() : Promise.resolve([])]);

  // Emails live in Supabase Auth; the service client (server-only) can read them.
  let withEmail: StaffMember[] = team;
  const service = mode === "live" ? getServiceClient() : null;
  if (service && showTeam) {
    const { data } = await service.auth.admin.listUsers({ perPage: 200 });
    const emails = new Map(data?.users.map((u) => [u.id, u.email ?? null]) ?? []);
    withEmail = team.map((m) => ({ ...m, email: emails.get(m.user_id) ?? m.email ?? null }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1040 }}>
      <header>
        <p className="a-eyebrow">Hotel</p>
        <h1 className="a-title">Settings</h1>
      </header>
      <PoliciesForm initial={settings} />
      {showTeam && (
        <TeamPanel
          staff={withEmail}
          selfId={staff.id}
          myRole={staff.role}
          live={mode === "live" && Boolean(service) && can(access, "staff.manage")}
        />
      )}
    </div>
  );
}

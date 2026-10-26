import type { Metadata } from "next";
import { PoliciesForm, TeamPanel } from "@/components/admin/SettingsForms";
import { requireManager } from "@/lib/admin/session";
import type { StaffMember } from "@/lib/data/types";
import { getServiceClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { repo, staff, mode } = await requireManager();
  const [settings, team] = await Promise.all([repo.getSettings(), repo.listStaff()]);

  // Emails live in Supabase Auth; the service client (server-only) can read them.
  let withEmail: StaffMember[] = team;
  const service = mode === "live" ? getServiceClient() : null;
  if (service) {
    const { data } = await service.auth.admin.listUsers({ perPage: 200 });
    const emails = new Map(data?.users.map((u) => [u.id, u.email ?? null]) ?? []);
    withEmail = team.map((m) => ({ ...m, email: emails.get(m.user_id) ?? null }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1040 }}>
      <header>
        <p className="a-eyebrow">Manager</p>
        <h1 className="a-title">Settings</h1>
      </header>
      <PoliciesForm initial={settings} />
      <TeamPanel staff={withEmail} selfId={staff.id} live={mode === "live" && Boolean(service)} />
    </div>
  );
}

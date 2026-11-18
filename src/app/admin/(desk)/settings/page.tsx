import type { Metadata } from "next";
import Link from "next/link";
import { PoliciesForm } from "@/components/admin/SettingsForms";
import { can } from "@/lib/access";
import { requirePermission } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { repo, access } = await requirePermission("settings.manage");
  const settings = await repo.getSettings();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1040 }}>
      <header>
        <p className="a-eyebrow">Hotel</p>
        <h1 className="a-title">Settings</h1>
      </header>
      <PoliciesForm initial={settings} />
      {can(access, "staff.read") && (
        <p className="a-hint">
          The team (invitations, roles and access) is now on its own page:{" "}
          <Link href="/admin/team" className="text-link">
            Team
          </Link>
          .
        </p>
      )}
    </div>
  );
}

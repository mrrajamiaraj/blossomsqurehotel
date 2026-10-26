import type { Metadata } from "next";
import { PasswordForm } from "@/components/admin/SettingsForms";
import { requireAdmin } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const { staff, mode } = await requireAdmin();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header>
        <p className="a-eyebrow">{staff.role === "manager" ? "Manager" : "Front desk"}</p>
        <h1 className="a-title">{staff.name}</h1>
        {staff.email && <p className="a-muted">{staff.email}</p>}
      </header>
      <PasswordForm live={mode === "live"} />
    </div>
  );
}

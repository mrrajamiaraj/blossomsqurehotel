import type { Metadata } from "next";
import Link from "next/link";
import { PasswordForm } from "@/components/admin/SettingsForms";
import { roleName } from "@/lib/access";
import { requireAdmin } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const { staff, mode, access } = await requireAdmin();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header>
        <p className="a-eyebrow">{roleName(staff.role)}</p>
        <h1 className="a-title">{staff.name}</h1>
        {staff.email && <p className="a-muted">{staff.email}</p>}
      </header>
      <section className="a-panel" aria-labelledby="mfa-h">
        <div className="a-panel-head">
          <h2 className="a-h2" id="mfa-h">
            Two-step sign-in
          </h2>
        </div>
        <div className="a-panel-body" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <p className="a-muted" style={{ margin: 0 }}>
            {access.requiresMfa
              ? "Required for your role: every sign-in asks for a code from your authenticator app."
              : "Optional for your role. Recommended: it protects guest details if your password is ever guessed."}
          </p>
          {mode === "live" && (
            <Link href="/admin/mfa" className="a-btn">
              Manage
            </Link>
          )}
        </div>
      </section>
      <PasswordForm live={mode === "live"} />
    </div>
  );
}

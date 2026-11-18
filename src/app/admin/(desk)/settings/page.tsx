import type { Metadata } from "next";
import Link from "next/link";
import PaymentMethodsForm from "@/components/admin/PaymentMethodsForm";
import { PoliciesForm } from "@/components/admin/SettingsForms";
import { can } from "@/lib/access";
import { requirePermission } from "@/lib/admin/session";
import { PaymentsRepo } from "@/lib/data/payments";
import { configuredGateways } from "@/lib/payments/gateways";
import { getSessionClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { repo, access, mode } = await requirePermission("settings.manage");
  const settings = await repo.getSettings();
  const offered = mode === "live" ? await new PaymentsRepo(await getSessionClient()).offeredMethods().catch(() => ["pay_at_hotel"]) : ["pay_at_hotel"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1040 }}>
      <header>
        <p className="a-eyebrow">Hotel</p>
        <h1 className="a-title">Settings</h1>
      </header>
      <PoliciesForm initial={settings} />
      <PaymentMethodsForm initial={offered} configured={configuredGateways()} live={mode === "live"} />
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

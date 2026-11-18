import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit";
import PromotionsManager from "@/components/admin/PromotionsManager";
import { requirePermission } from "@/lib/admin/session";
import { hotelToday } from "@/lib/dates";
import { OperationsRepo, type Promotion, type PromotionUsage } from "@/lib/data/operations";
import { getSessionClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Offers" };

export default async function PromotionsPage() {
  const { mode, repo } = await requirePermission("promotions.manage");
  let promotions: Promotion[] = [];
  let usage: PromotionUsage[] = [];
  let failed = false;
  const [types, settings] = await Promise.all([repo.listRoomTypes({ includeUnpublished: true }), repo.getSettings()]);
  if (mode === "live") {
    const ops = new OperationsRepo(await getSessionClient());
    try {
      [promotions, usage] = await Promise.all([ops.promotions(), ops.promotionUsage()]);
    } catch (err) {
      console.error("Offers:", err);
      failed = true;
    }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1180 }}>
      <PageHeader eyebrow="Revenue" title="Offers" description="Discounts the booking engine applies by itself: percentage or fixed amount, for chosen rooms and dates, with or without a code." />
      {mode === "preview" && <p className="a-hint">Offers need Supabase. Connect it to create them.</p>}
      {failed && (
        <p className="a-error" role="alert">
          Couldn&apos;t load offers. Refresh to try again.
        </p>
      )}
      <PromotionsManager
        promotions={promotions}
        usage={usage}
        types={types.map((t) => ({ id: t.id, name: t.name }))}
        today={hotelToday()}
        maxPercent={settings.max_discount_percent ?? 50}
        live={mode === "live"}
      />
    </div>
  );
}

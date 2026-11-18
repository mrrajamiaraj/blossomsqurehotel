import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit";
import { roleName, isStaffRole } from "@/lib/access";
import { requirePermission } from "@/lib/admin/session";
import { OperationsRepo, type AuditEntry } from "@/lib/data/operations";
import { getSessionClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Activity log" };

const AREAS: Record<string, string> = {
  staff: "Team",
  bookings: "Bookings",
  payments: "Payments",
  refunds: "Refunds",
  guests: "Guests",
  room_types: "Room types",
  rooms: "Rooms",
  room_blocks: "Maintenance blocks",
  rate_plans: "Rate plans",
  seasonal_rates: "Seasonal rates",
  promotions: "Offers",
  hotel_settings: "Settings",
  site_content: "Website content",
  reviews: "Reviews",
  room_images: "Room images",
  media_assets: "Photo library",
  amenities: "Amenities",
  room_type_amenities: "Room amenities",
};
const ACTION: Record<string, string> = { INSERT: "Added", UPDATE: "Changed", DELETE: "Removed" };
const HIDDEN = new Set(["updated_at", "updated_by", "created_at", "draft_updated_at", "draft_updated_by"]);

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const { mode } = await requirePermission("audit.read");
  const { area } = await searchParams;
  const table = area && area in AREAS ? area : undefined;
  let rows: AuditEntry[] = [];
  let failed = false;
  if (mode === "live") {
    try {
      rows = await new OperationsRepo(await getSessionClient()).auditLog({ table, limit: 200 });
    } catch {
      failed = true;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1180 }}>
      <PageHeader
        eyebrow="People"
        title="Activity log"
        description="Every change to the team, bookings, payments, prices, rooms and website, with who made it. Entries can't be edited or deleted by anyone."
      />
      <form method="get" className="a-panel" style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
        <label className="a-field" style={{ minWidth: 220 }}>
          <span className="a-label">Show changes to</span>
          <select className="a-input" name="area" defaultValue={table ?? ""}>
            <option value="">Everything</option>
            {Object.entries(AREAS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="a-btn">
          Show
        </button>
      </form>
      {mode === "preview" && <p className="a-hint">The activity log needs Supabase.</p>}
      {failed && (
        <p className="a-error" role="alert">
          Couldn&apos;t load the activity log. Refresh to try again.
        </p>
      )}
      {rows.length === 0 && !failed ? (
        <div className="a-empty">
          <strong>Nothing recorded yet</strong>
        </div>
      ) : (
        <div className="a-table-wrap">
          <table className="a-table a-table--stack">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const fields = (r.changed_fields ?? []).filter((f) => !HIDDEN.has(f));
                return (
                  <tr key={`${r.at}-${i}`}>
                    <td data-label="When" className="a-num">
                      {new Date(r.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" })}
                    </td>
                    <td data-label="Who">
                      {r.actor_name ?? (r.actor ? "Former staff" : "System")}
                      {r.actor_role && isStaffRole(r.actor_role) && (
                        <span className="a-hint" style={{ display: "block" }}>
                          {roleName(r.actor_role)}
                        </span>
                      )}
                    </td>
                    <td data-label="What">
                      {ACTION[r.action] ?? r.action}: {AREAS[r.table_name] ?? r.table_name}
                    </td>
                    <td data-label="Details" className="a-muted" style={{ fontSize: "0.8rem" }}>
                      {r.record_id && r.table_name === "site_content" ? `Section ${r.record_id}` : null}
                      {fields.length > 0 && <span style={{ display: "block" }}>Changed: {fields.slice(0, 8).join(", ").replace(/_/g, " ")}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

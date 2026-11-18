import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit";
import { requirePermission } from "@/lib/admin/session";
import { CmsRepo, type ContentRow } from "@/lib/cms/repo";
import { SECTIONS } from "@/lib/cms/sections";
import { getSessionClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Website content" };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

export default async function ContentPage() {
  const { mode } = await requirePermission("content.manage");
  let rows: ContentRow[] = [];
  let failed = false;
  if (mode === "live") {
    try {
      rows = await new CmsRepo(await getSessionClient()).list();
    } catch {
      failed = true;
    }
  }
  const byKey = new Map(rows.filter((r) => r.locale === "en").map((r) => [r.key, r]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1040 }}>
      <PageHeader
        eyebrow="Website"
        title="Website content"
        description="Change the words and photos on the public website. Save a draft, preview it, then publish — visitors only see published changes."
        actions={
          <Link href="/admin/media" className="a-btn">
            Photo library
          </Link>
        }
      />
      {mode === "preview" && <p className="a-hint">Connect Supabase to edit content. The sections below show what can be changed.</p>}
      {failed && (
        <p className="a-error" role="alert">
          Couldn&apos;t load the content status. Refresh to try again.
        </p>
      )}
      <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 12 }}>
        {SECTIONS.map((s) => {
          const row = byKey.get(s.key);
          const hasDraft = Boolean(row?.draft_body);
          const live = row?.status === "published";
          return (
            <li key={s.key}>
              <Link href={`/admin/content/${s.key}`} className="a-panel" style={{ display: "flex", flexDirection: "column", gap: 8, padding: 18, height: "100%", textDecoration: "none", color: "inherit" }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <strong style={{ fontSize: "1.02rem", color: "var(--a-pine)" }}>{s.label}</strong>
                  <span className="a-badge" data-s={hasDraft ? "pending" : live ? "confirmed" : "checked_out"}>
                    {hasDraft ? "Unpublished changes" : live ? "Edited" : "Built-in text"}
                  </span>
                </span>
                <span className="a-muted" style={{ fontSize: "0.86rem" }}>
                  {s.description}
                </span>
                <span className="a-hint" style={{ marginTop: "auto" }}>
                  {hasDraft
                    ? `Draft by ${row?.draft_updated_by ?? "a colleague"}, ${when(row?.draft_updated_at ?? null)}`
                    : live
                      ? `Published ${when(row?.published_at ?? null)} · version ${row?.version}`
                      : "Not changed yet"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

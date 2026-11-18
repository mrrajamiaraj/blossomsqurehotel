import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SectionEditor from "@/components/admin/cms/SectionEditor";
import { PageHeader } from "@/components/admin/kit";
import { requirePermission } from "@/lib/admin/session";
import { getHotelInfo } from "@/lib/cms/content";
import { mergeDefaults } from "@/lib/cms/fields";
import { CmsRepo, type ContentRow } from "@/lib/cms/repo";
import { sectionDef } from "@/lib/cms/sections";
import { buildFaqs } from "@/lib/content/faq";
import { localPhotos } from "@/lib/photos";
import { getSettings } from "@/lib/rooms";
import { getSessionClient } from "@/lib/supabase";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const def = sectionDef((await params).key);
  return { title: def ? `${def.label} · Website content` : "Website content" };
}

export default async function ContentEditorPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const def = sectionDef(key);
  if (!def) notFound();
  const { mode } = await requirePermission("content.manage");

  let row: ContentRow | null = null;
  if (mode === "live") row = await new CmsRepo(await getSessionClient()).get(key);

  let defaults = def.defaults;
  if (def.dynamic && key === "faq") {
    const settings = await getSettings();
    defaults = { ...defaults, groups: buildFaqs(settings, await getHotelInfo()).map((g) => ({ title: g.title, items: g.items.map((i) => ({ q: i.q, a: i.a })) })) };
  }
  const start = row?.draft_body ?? (row?.status === "published" ? row.body : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <PageHeader eyebrow="Website content" title={def.label} description={def.description} />
      <SectionEditor
        sectionKey={def.key}
        label={def.label}
        description={def.description}
        path={def.path}
        groups={def.groups}
        initial={mergeDefaults(defaults, start)}
        base={row?.draft_updated_at ?? null}
        status={row?.draft_body ? "draft" : row?.status === "published" ? "live" : "builtin"}
        publishedAt={row?.status === "published" ? row.published_at : null}
        draftBy={row?.draft_updated_by ?? null}
        draftAt={row?.draft_updated_at ?? null}
        local={localPhotos()}
        live={mode === "live"}
      />
    </div>
  );
}

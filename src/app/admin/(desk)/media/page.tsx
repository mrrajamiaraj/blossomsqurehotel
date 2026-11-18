import type { Metadata } from "next";
import MediaLibrary from "@/components/admin/cms/MediaLibrary";
import { PageHeader } from "@/components/admin/kit";
import { can } from "@/lib/access";
import { requireAdmin } from "@/lib/admin/session";
import { CmsRepo, type MediaAsset } from "@/lib/cms/repo";
import { getSessionClient } from "@/lib/supabase";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Photo library" };

export default async function MediaPage() {
  const { mode, access } = await requireAdmin();
  if (!can(access, "content.manage") && !can(access, "rooms.manage")) redirect("/admin?error=not_allowed");
  let items: MediaAsset[] = [];
  let failed = false;
  if (mode === "live") {
    try {
      items = await new CmsRepo(await getSessionClient()).media();
    } catch {
      failed = true;
    }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        eyebrow="Website"
        title="Photo library"
        description="Every image uploaded for the website. An image that's in use can be replaced everywhere at once, but not deleted."
      />
      {mode === "preview" && <p className="a-hint">Uploads need Supabase. Connect it to build the photo library.</p>}
      {failed && (
        <p className="a-error" role="alert">
          Couldn&apos;t load the images. Refresh to try again.
        </p>
      )}
      <MediaLibrary initial={items} canUpload={mode === "live" && can(access, "content.manage")} />
    </div>
  );
}

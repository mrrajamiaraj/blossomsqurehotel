import "server-only";
import { errorCode, RepoError } from "../data/errors";
import type { TypedClient } from "../supabase/server";

export type ContentRow = {
  key: string;
  locale: string;
  title: string | null;
  body: Record<string, unknown>;
  status: "draft" | "published";
  version: number;
  published_at: string | null;
  draft_title: string | null;
  draft_body: Record<string, unknown> | null;
  draft_updated_at: string | null;
  draft_updated_by: string | null;
  updated_at: string;
};

export type ContentVersion = { version: number; title: string | null; body: Record<string, unknown>; published_by: string | null; published_at: string };

export type MediaAsset = {
  id: string;
  bucket: "site-media" | "room-photos";
  path: string;
  url: string;
  alt: string;
  folder: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  mime: string;
  created_at: string;
};

export type MediaUsage = { kind: "content" | "room_type"; ref: string; label: string };

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) {
    const code = errorCode(new Error(res.error.message));
    if (code === "UNKNOWN") console.error("Supabase:", res.error.message);
    throw new RepoError(code);
  }
  return res.data;
}

/**
 * Website content and the media library, as the signed-in editor. Every write
 * is a database function that checks content.manage (or rooms.manage for room
 * photos) itself.
 */
export class CmsRepo {
  constructor(private db: TypedClient) {}

  async list(): Promise<ContentRow[]> {
    return check(await this.db.rpc("admin_list_content")) as unknown as ContentRow[];
  }
  async get(key: string): Promise<ContentRow | null> {
    return (await this.list()).find((r) => r.key === key && r.locale === "en") ?? null;
  }
  async saveDraft(key: string, body: Record<string, unknown>, base: string | null): Promise<string> {
    return String(
      check(await this.db.rpc("admin_save_content_draft", { p_key: key, p_locale: "en", p_title: "", p_body: body as never, p_base: base as string })),
    );
  }
  async publish(key: string, base: string | null): Promise<number> {
    return Number(check(await this.db.rpc("admin_publish_content", { p_key: key, p_locale: "en", p_base: base as string })));
  }
  async discard(key: string): Promise<void> {
    check(await this.db.rpc("admin_discard_content_draft", { p_key: key, p_locale: "en" }));
  }
  async versions(key: string): Promise<ContentVersion[]> {
    return check(await this.db.rpc("admin_content_versions", { p_key: key, p_locale: "en" })) as unknown as ContentVersion[];
  }
  async restore(key: string, version: number): Promise<string> {
    return String(check(await this.db.rpc("admin_restore_content_version", { p_key: key, p_locale: "en", p_version: version })));
  }

  /* Media */
  async media(opts: { folder?: string } = {}): Promise<MediaAsset[]> {
    let q = this.db.from("media_assets").select("id, bucket, path, url, alt, folder, width, height, bytes, mime, created_at").order("created_at", { ascending: false }).limit(500);
    if (opts.folder) q = q.eq("folder", opts.folder);
    return check(await q) as MediaAsset[];
  }
  async registerMedia(m: { bucket: MediaAsset["bucket"]; path: string; url: string; alt: string; folder: string; width: number | null; height: number | null; bytes: number; mime: string }): Promise<string> {
    return String(
      check(
        await this.db.rpc("admin_register_media", {
          p_bucket: m.bucket, p_path: m.path, p_url: m.url, p_alt: m.alt, p_folder: m.folder,
          p_width: m.width as number, p_height: m.height as number, p_bytes: m.bytes, p_mime: m.mime,
        }),
      ),
    );
  }
  async updateMedia(id: string, alt: string, folder: string): Promise<void> {
    check(await this.db.rpc("admin_update_media", { p_id: id, p_alt: alt, p_folder: folder }));
  }
  async usage(id: string): Promise<MediaUsage[]> {
    return check(await this.db.rpc("admin_media_usage", { p_id: id })) as unknown as MediaUsage[];
  }
  /** Returns the storage path to remove. */
  async deleteMedia(id: string): Promise<string> {
    return String(check(await this.db.rpc("admin_delete_media", { p_id: id })));
  }
  /** Returns the old storage path to remove. */
  async replaceMedia(oldId: string, newId: string): Promise<string> {
    return String(check(await this.db.rpc("admin_replace_media", { p_old: oldId, p_new: newId })));
  }
}

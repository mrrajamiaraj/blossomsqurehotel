"use server";

// Website content and the media library. Each action requires content.manage
// (room-photo uploads also accept rooms.manage), validates input against the
// section's fields, and calls a database function that checks permission
// again and keeps drafts private until they're published.

import { revalidatePath } from "next/cache";
import type { Permission } from "@/lib/access";
import { requireAdmin } from "@/lib/admin/session";
import { allFields, validate, type FieldError } from "@/lib/cms/fields";
import { CmsRepo, type ContentVersion, type MediaAsset, type MediaUsage } from "@/lib/cms/repo";
import { sectionDef } from "@/lib/cms/sections";
import { errorCode, errorMessage } from "@/lib/data/errors";
import { getSessionClient } from "@/lib/supabase";
import { SUPABASE_URL } from "@/lib/supabase/config";

export type CmsResult<T = undefined> = ({ ok: true; message?: string } & (T extends undefined ? object : { data: T })) | { ok: false; message: string; errors?: FieldError[] };

const NEEDS_DB = "Website content needs Supabase. Connect it to edit and publish.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function editor(permission: Permission | Permission[] = "content.manage"): Promise<{ repo: CmsRepo } | { error: string }> {
  const { mode, access } = await requireAdmin();
  const perms = Array.isArray(permission) ? permission : [permission];
  if (!perms.some((p) => access.permissions.includes(p))) return { error: errorMessage("NOT_ALLOWED") };
  if (mode === "preview") return { error: NEEDS_DB };
  return { repo: new CmsRepo(await getSessionClient()) };
}

const fail = (err: unknown) => ({ ok: false as const, message: errorMessage(errorCode(err)) });

/* ---------------------------------------------------------------- content */

export async function saveSectionDraft(key: string, values: unknown, base: string | null): Promise<CmsResult<{ base: string }>> {
  const def = sectionDef(key);
  if (!def) return { ok: false, message: "That section doesn't exist." };
  const ctx = await editor();
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { value, errors } = validate(allFields(def.groups), values, SUPABASE_URL ?? null);
  if (errors.length) return { ok: false, message: errors.length === 1 ? errors[0].message : `Fix ${errors.length} fields before saving.`, errors };
  try {
    const stamp = await ctx.repo.saveDraft(key, value, base);
    revalidatePath("/admin/content", "layout");
    return { ok: true, message: "Draft saved — visitors still see the published version", data: { base: stamp } };
  } catch (err) {
    return fail(err);
  }
}

export async function publishSection(key: string, base: string | null): Promise<CmsResult> {
  if (!sectionDef(key)) return { ok: false, message: "That section doesn't exist." };
  const ctx = await editor();
  if ("error" in ctx) return { ok: false, message: ctx.error };
  try {
    await ctx.repo.publish(key, base);
    revalidatePath("/", "layout");
    return { ok: true, message: "Published — the website shows it now" };
  } catch (err) {
    return fail(err);
  }
}

export async function discardSectionDraft(key: string): Promise<CmsResult> {
  if (!sectionDef(key)) return { ok: false, message: "That section doesn't exist." };
  const ctx = await editor();
  if ("error" in ctx) return { ok: false, message: ctx.error };
  try {
    await ctx.repo.discard(key);
    revalidatePath("/admin/content", "layout");
    return { ok: true, message: "Unpublished changes discarded" };
  } catch (err) {
    return fail(err);
  }
}

export async function sectionVersions(key: string): Promise<CmsResult<ContentVersion[]>> {
  const ctx = await editor();
  if ("error" in ctx) return { ok: false, message: ctx.error };
  try {
    return { ok: true, data: await ctx.repo.versions(key) };
  } catch (err) {
    return fail(err);
  }
}

export async function restoreSectionVersion(key: string, version: number): Promise<CmsResult> {
  if (!sectionDef(key) || !Number.isInteger(version) || version < 1) return { ok: false, message: "That version doesn't exist." };
  const ctx = await editor();
  if ("error" in ctx) return { ok: false, message: ctx.error };
  try {
    await ctx.repo.restore(key, version);
    revalidatePath("/admin/content", "layout");
    return { ok: true, message: `Version ${version} copied into the draft — publish to make it live` };
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ media */

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
const MAX_BYTES = 8 * 1024 * 1024;
const MEDIA_ROLES: Permission[] = ["content.manage", "rooms.manage"];

const folderOf = (v: unknown) => {
  const f = String(v ?? "general").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return f.length >= 2 ? f : "general";
};
const dim = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 12000 ? n : null;
};

/** Uploads one (browser-optimised) image to the site-media bucket and records it. */
async function storeUpload(repo: CmsRepo, form: FormData): Promise<MediaAsset> {
  const file = form.get("file");
  if (!(file instanceof File) || !TYPES[file.type] || file.size === 0 || file.size > MAX_BYTES) throw new Error("BAD_MEDIA");
  const folder = folderOf(form.get("folder"));
  const alt = String(form.get("alt") ?? "").trim().slice(0, 200);
  const path = `${folder}/${crypto.randomUUID()}.${TYPES[file.type]}`;
  const db = await getSessionClient();
  const bucket = db.storage.from("site-media");
  const { error } = await bucket.upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) {
    console.error("Media upload:", error.message);
    throw new Error(/row-level security|not allowed|unauthori/i.test(error.message) ? "NOT_ALLOWED" : "UPLOAD_FAILED");
  }
  const url = bucket.getPublicUrl(path).data.publicUrl;
  try {
    const id = await repo.registerMedia({ bucket: "site-media", path, url, alt, folder, width: dim(form.get("width")), height: dim(form.get("height")), bytes: file.size, mime: file.type });
    return { id, bucket: "site-media", path, url, alt, folder, width: dim(form.get("width")), height: dim(form.get("height")), bytes: file.size, mime: file.type, created_at: new Date().toISOString() };
  } catch (err) {
    await bucket.remove([path]);
    throw err;
  }
}

const uploadError = (err: unknown) =>
  err instanceof Error && err.message === "UPLOAD_FAILED" ? "The image couldn't be uploaded. Check your connection and try again." : errorMessage(errorCode(err));

export async function uploadMedia(form: FormData): Promise<CmsResult<MediaAsset>> {
  const ctx = await editor("content.manage");
  if ("error" in ctx) return { ok: false, message: ctx.error };
  try {
    const asset = await storeUpload(ctx.repo, form);
    revalidatePath("/admin/media");
    return { ok: true, message: "Image uploaded", data: asset };
  } catch (err) {
    return { ok: false, message: uploadError(err) };
  }
}

export async function listMedia(): Promise<CmsResult<MediaAsset[]>> {
  const ctx = await editor(MEDIA_ROLES);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  try {
    return { ok: true, data: await ctx.repo.media() };
  } catch (err) {
    return fail(err);
  }
}

export async function updateMediaDetails(id: string, alt: string, folder: string): Promise<CmsResult> {
  if (!UUID.test(id)) return { ok: false, message: "That image no longer exists." };
  const ctx = await editor(MEDIA_ROLES);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  try {
    await ctx.repo.updateMedia(id, String(alt ?? "").trim().slice(0, 200), folderOf(folder));
    revalidatePath("/admin/media");
    return { ok: true, message: "Image details saved" };
  } catch (err) {
    return fail(err);
  }
}

export async function mediaUsage(id: string): Promise<CmsResult<MediaUsage[]>> {
  if (!UUID.test(id)) return { ok: false, message: "That image no longer exists." };
  const ctx = await editor(MEDIA_ROLES);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  try {
    return { ok: true, data: await ctx.repo.usage(id) };
  } catch (err) {
    return fail(err);
  }
}

async function removeObject(bucket: string, path: string) {
  const { error } = await (await getSessionClient()).storage.from(bucket).remove([path]);
  if (error) console.error("Media cleanup:", error.message);
}

export async function deleteMedia(id: string): Promise<CmsResult> {
  if (!UUID.test(id)) return { ok: false, message: "That image no longer exists." };
  const ctx = await editor(MEDIA_ROLES);
  if ("error" in ctx) return { ok: false, message: ctx.error };
  try {
    const asset = (await ctx.repo.media()).find((m) => m.id === id);
    const path = await ctx.repo.deleteMedia(id);
    await removeObject(asset?.bucket ?? "site-media", path);
    revalidatePath("/admin/media");
    return { ok: true, message: "Image deleted" };
  } catch (err) {
    return fail(err);
  }
}

/** Uploads a new file and swaps it in everywhere the old one is used. */
export async function replaceMedia(oldId: string, form: FormData): Promise<CmsResult<MediaAsset>> {
  if (!UUID.test(oldId)) return { ok: false, message: "That image no longer exists." };
  const ctx = await editor("content.manage");
  if ("error" in ctx) return { ok: false, message: ctx.error };
  let fresh: MediaAsset;
  try {
    const old = (await ctx.repo.media()).find((m) => m.id === oldId);
    if (!old) return { ok: false, message: "That image no longer exists." };
    form.set("folder", old.folder);
    if (!String(form.get("alt") ?? "").trim()) form.set("alt", old.alt);
    fresh = await storeUpload(ctx.repo, form);
    const oldPath = await ctx.repo.replaceMedia(oldId, fresh.id);
    await removeObject(old.bucket, oldPath);
  } catch (err) {
    return { ok: false, message: uploadError(err) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Image replaced everywhere it's used", data: fresh };
}

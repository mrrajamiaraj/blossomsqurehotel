"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { deleteMedia, mediaUsage, replaceMedia, updateMediaDetails, uploadMedia } from "@/app/admin/cms";
import { formatBytes, optimiseImage } from "@/lib/cms/optimize";
import type { MediaAsset, MediaUsage } from "@/lib/cms/repo";
import ConfirmDialog from "../kit/ConfirmDialog";
import Dialog from "../Dialog";
import { toast } from "../../ui/Toaster";

async function toForm(original: File, folder: string, alt = "") {
  const { file, width, height } = await optimiseImage(original);
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);
  form.append("alt", alt);
  if (width) form.append("width", String(width));
  if (height) form.append("height", String(height));
  return form;
}

const usageLabel = (u: MediaUsage) => (u.kind === "room_type" ? `Room photos: ${u.label}` : `Website content: ${u.label}`);

/** Upload, describe, find, replace and delete the website's images. */
export default function MediaLibrary({ initial, canUpload }: { initial: MediaAsset[]; canUpload: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [folder, setFolder] = useState("all");
  const [uploadFolder, setUploadFolder] = useState("general");
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState("");
  const [open, setOpen] = useState<MediaAsset | null>(null);
  const [alt, setAlt] = useState("");
  const [usage, setUsage] = useState<MediaUsage[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const folders = useMemo(() => ["all", ...new Set(items.map((i) => i.folder))], [items]);
  const shown = folder === "all" ? items : items.filter((i) => i.folder === folder);

  const upload = (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    start(async () => {
      let added = 0;
      for (const [i, f] of list.entries()) {
        setProgress(`Optimising and uploading ${i + 1} of ${list.length}…`);
        const res = await uploadMedia(await toForm(f, uploadFolder));
        if (!res.ok) {
          toast.error(res.message);
          break;
        }
        added++;
        setItems((cur) => [res.data, ...cur]);
      }
      setProgress("");
      if (added) toast.success(added === 1 ? "Image uploaded — add a description so everyone can understand it" : `${added} images uploaded`);
    });
  };

  const show = (m: MediaAsset) => {
    setOpen(m);
    setAlt(m.alt);
    setUsage(null);
    start(async () => {
      const res = await mediaUsage(m.id);
      setUsage(res.ok ? res.data : []);
    });
  };

  const saveAlt = () =>
    open &&
    start(async () => {
      const res = await updateMediaDetails(open.id, alt, open.folder);
      if (!res.ok) return void toast.error(res.message);
      setItems((cur) => cur.map((i) => (i.id === open.id ? { ...i, alt } : i)));
      toast.success(res.message ?? "Saved");
    });

  const replace = (files: FileList | null) => {
    const f = files?.[0];
    if (!f || !open) return;
    start(async () => {
      setProgress("Uploading the new image…");
      const res = await replaceMedia(open.id, await toForm(f, open.folder, alt));
      setProgress("");
      if (!res.ok) return void toast.error(res.message);
      setItems((cur) => [res.data, ...cur.filter((i) => i.id !== open.id)]);
      setOpen(null);
      toast.success(res.message ?? "Replaced");
      router.refresh();
    });
  };

  const remove = () =>
    open &&
    start(async () => {
      const res = await deleteMedia(open.id);
      setConfirmDelete(false);
      if (!res.ok) return void toast.error(res.message);
      setItems((cur) => cur.filter((i) => i.id !== open.id));
      setOpen(null);
      toast.success(res.message ?? "Deleted");
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="a-panel" style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", justifyContent: "space-between" }}>
        <label className="a-field" style={{ minWidth: 180 }}>
          <span className="a-label">Show</span>
          <select className="a-input" value={folder} onChange={(e) => setFolder(e.target.value)}>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f === "all" ? `All images (${items.length})` : f}
              </option>
            ))}
          </select>
        </label>
        {canUpload && (
          <span style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
            <label className="a-field" style={{ minWidth: 160 }}>
              <span className="a-label">Upload into folder</span>
              <input className="a-input" value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)} maxLength={40} />
            </label>
            <label className="a-btn a-btn--primary" style={{ position: "relative", cursor: pending ? "progress" : "pointer" }}>
              {pending && progress && <span className="a-spin" aria-hidden="true" />}
              {progress || "Upload images"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                disabled={pending}
                onChange={(e) => {
                  upload(e.target.files);
                  e.target.value = "";
                }}
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}
              />
            </label>
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="a-empty">
          <strong>No images here yet</strong>
          <span>Upload photos of the hotel. They&apos;re resized and compressed in your browser first, so even large phone photos upload quickly.</span>
        </div>
      ) : (
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(170px, 100%), 1fr))", gap: 12 }}>
          {shown.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => show(m)}
                className="a-panel"
                style={{ display: "flex", flexDirection: "column", width: "100%", padding: 0, overflow: "hidden", cursor: "pointer", textAlign: "left" }}
                aria-label={`Image details: ${m.alt || m.path}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", background: "var(--a-line)" }} />
                <span style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.alt || <em className="a-muted">No description</em>}</span>
                  <span className="a-hint">
                    {m.folder} · {formatBytes(m.bytes)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(open)} onClose={() => setOpen(null)} title="Image details">
        {open && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: "min(560px, 86vw)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={open.url} alt="" style={{ width: "100%", maxHeight: 320, objectFit: "contain", background: "var(--a-line)", borderRadius: 8 }} />
            <p className="a-hint">
              {open.width && open.height ? `${open.width} × ${open.height} px · ` : ""}
              {formatBytes(open.bytes)} · {open.mime.replace("image/", "").toUpperCase()} · uploaded {new Date(open.created_at).toLocaleDateString("en-GB")}
            </p>
            <label className="a-field">
              <span className="a-label">Description</span>
              <input className="a-input" value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} placeholder="e.g. The pool at sunset" />
              <span className="a-hint">Read aloud by screen readers and used by search engines. Pages use it unless they set their own.</span>
            </label>
            <div>
              <span className="a-label">Where it&apos;s used</span>
              {usage === null ? (
                <p className="a-hint">Checking…</p>
              ) : usage.length === 0 ? (
                <p className="a-hint">Not used on the website.</p>
              ) : (
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {usage.map((u) => (
                    <li key={u.kind + u.ref}>{usageLabel(u)}</li>
                  ))}
                </ul>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="a-btn a-btn--primary a-btn--sm" disabled={pending || alt === open.alt} onClick={saveAlt}>
                  Save description
                </button>
                {canUpload && open.bucket === "site-media" && (
                  <label className="a-btn a-btn--sm" style={{ position: "relative", cursor: "pointer" }}>
                    {progress || "Replace with another file"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      disabled={pending}
                      onChange={(e) => {
                        replace(e.target.files);
                        e.target.value = "";
                      }}
                      style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}
                    />
                  </label>
                )}
              </span>
              <button
                type="button"
                className="a-btn a-btn--danger a-btn--sm"
                disabled={pending || Boolean(usage?.length)}
                title={usage?.length ? "Used on the website — replace it, or remove it from those pages first" : undefined}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        pending={pending}
        destructive
        title="Delete this image?"
        description="The file is removed from storage and can't be recovered."
        confirmLabel="Delete image"
      />
    </div>
  );
}

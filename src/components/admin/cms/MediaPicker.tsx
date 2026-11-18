"use client";

import { useEffect, useState, useTransition } from "react";
import { listMedia, uploadMedia } from "@/app/admin/cms";
import type { ImageValue } from "@/lib/cms/fields";
import { optimiseImage } from "@/lib/cms/optimize";
import type { MediaAsset } from "@/lib/cms/repo";
import Dialog from "../Dialog";
import { toast } from "../../ui/Toaster";

export type LocalPhoto = { ref: string; src: string };

/** Where to show an image value in the admin: uploads by URL, built-in photos by ref. */
export function previewSrc(src: string, local: LocalPhoto[]): string | null {
  if (!src) return null;
  if (/^https:\/\//.test(src) || src.startsWith("/")) return src;
  return local.find((p) => p.ref === src)?.src ?? null;
}

/**
 * Choose an image: from uploads in the media library, from the hotel's own
 * photographs already on the site, or upload a new one (optimised in the
 * browser first).
 */
export default function MediaPicker({
  open,
  onClose,
  onPick,
  local,
  folder = "general",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (img: ImageValue) => void;
  local: LocalPhoto[];
  folder?: string;
}) {
  const [tab, setTab] = useState<"library" | "hotel">("library");
  const [items, setItems] = useState<MediaAsset[] | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState("");

  useEffect(() => {
    if (!open || items) return;
    start(async () => {
      const res = await listMedia();
      if (res.ok) setItems(res.data);
      else setError(res.message);
    });
  }, [open, items]);

  const upload = (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    start(async () => {
      let last: MediaAsset | null = null;
      for (const [i, original] of list.entries()) {
        setProgress(`Optimising and uploading ${i + 1} of ${list.length}…`);
        const { file, width, height } = await optimiseImage(original);
        const form = new FormData();
        form.append("file", file);
        form.append("folder", folder);
        if (width) form.append("width", String(width));
        if (height) form.append("height", String(height));
        const res = await uploadMedia(form);
        if (!res.ok) {
          toast.error(res.message);
          break;
        }
        last = res.data;
        setItems((cur) => [res.data, ...(cur ?? [])]);
      }
      setProgress("");
      if (last && list.length === 1) {
        onPick({ src: last.url, alt: last.alt });
        onClose();
      } else if (last) toast.success(`${list.length} images uploaded — choose one`);
    });
  };

  const choose = (img: ImageValue) => {
    onPick(img);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Choose an image" description="Pick a photo, or upload one. Large photos are resized before upload so pages stay fast.">
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: "min(720px, 86vw)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div className="a-seg" role="tablist" aria-label="Image source">
            <button type="button" role="tab" aria-selected={tab === "library"} aria-pressed={tab === "library"} onClick={() => setTab("library")}>
              Uploaded images
            </button>
            <button type="button" role="tab" aria-selected={tab === "hotel"} aria-pressed={tab === "hotel"} onClick={() => setTab("hotel")}>
              Hotel photographs
            </button>
          </div>
          <label className="a-btn a-btn--primary a-btn--sm" style={{ position: "relative", cursor: pending ? "progress" : "pointer" }}>
            {pending && progress && <span className="a-spin" aria-hidden="true" />}
            {progress || "Upload new"}
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
        </div>

        {error && (
          <p className="a-error" role="alert">
            {error}
          </p>
        )}

        <ul
          role="list"
          style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))", gap: 10, maxHeight: "52vh", overflowY: "auto" }}
        >
          {tab === "library" &&
            (items ?? []).map((m) => (
              <li key={m.id}>
                <Tile src={m.url} label={m.alt || m.path.split("/").pop()!} onClick={() => choose({ src: m.url, alt: m.alt })} />
              </li>
            ))}
          {tab === "hotel" &&
            local.map((p) => (
              <li key={p.ref}>
                <Tile src={p.src} label={p.ref} onClick={() => choose({ src: p.ref, alt: "" })} />
              </li>
            ))}
        </ul>
        {tab === "library" && items && items.length === 0 && <p className="a-hint">No uploads yet. Use “Upload new”, or pick from the hotel photographs.</p>}
        {tab === "library" && !items && !error && <p className="a-hint">Loading…</p>}
      </div>
    </Dialog>
  );
}

function Tile({ src, label, onClick }: { src: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", padding: 0, border: "1px solid var(--a-line)", borderRadius: 8, background: "#fff", cursor: "pointer", overflow: "hidden", textAlign: "left" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block", background: "var(--a-line)" }} />
      <span className="a-hint" style={{ padding: "0 8px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
    </button>
  );
}

"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { addRoom, deleteRoom, editRoom, setRoomGallery, updateRoom, updateRoomType, uploadRoomPhoto } from "@/app/admin/actions";
import type { Housekeeping } from "@/lib/data/types";
import { formatTaka } from "@/lib/format";
import { WEEKEND_LABEL } from "@/lib/pricing";
import { toast } from "../ui/Toaster";

/* ---------------------------------------------------------- Room type */

type TypeProps = {
  id: string;
  name: string;
  units: number;
  price: number;
  weekendPrice: number | null;
  rackPrice: number | null;
  published: boolean;
  size: number | null;
  blurb: string;
  canEdit: boolean;
  /** Extra sections rendered inside the card, e.g. the photo manager. */
  children?: React.ReactNode;
};

const str = (n: number | null) => (n ? String(n) : "");
const num = (s: string) => (s ? Math.round(Number(s)) : null);
const digits = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value.replace(/[^\d]/g, ""));

export function RoomTypeEditor(p: TypeProps) {
  const [price, setPrice] = useState(String(p.price));
  const [weekend, setWeekend] = useState(str(p.weekendPrice));
  const [rack, setRack] = useState(str(p.rackPrice));
  const [size, setSize] = useState(str(p.size));
  const [blurb, setBlurb] = useState(p.blurb);
  const [published, setPublished] = useState(p.published);
  const [pending, start] = useTransition();
  const dirty =
    price !== String(p.price) ||
    weekend !== str(p.weekendPrice) ||
    rack !== str(p.rackPrice) ||
    size !== str(p.size) ||
    blurb !== p.blurb ||
    published !== p.published;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await updateRoomType(p.id, {
        price_bdt: Math.round(Number(price)),
        weekend_price_bdt: num(weekend),
        rack_price_bdt: num(rack),
        size_sqft: num(size),
        blurb,
        is_published: published,
      });
      if (res.ok) toast.success((res.message ?? "Saved")); else toast.error(res.message);
    });
  };

  return (
    <form onSubmit={save} className="a-panel" style={{ display: "flex", flexDirection: "column" }}>
      <div className="a-panel-head">
        <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--a-pine)" }}>{p.name}</h3>
        <span className="a-muted" style={{ fontSize: "0.76rem" }}>
          {p.units} {p.units === 1 ? "room" : "rooms"}
        </span>
      </div>
      <fieldset disabled={!p.canEdit || pending} className="a-panel-body" style={{ border: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
        <div className="a-grid-2">
          <label className="a-field">
            <span className="a-label">Weekday rate (৳)</span>
            <input className="a-input a-num" inputMode="numeric" value={price} onChange={digits(setPrice)} required />
            <span className="a-hint">Sun – Wed nights</span>
          </label>
          <label className="a-field">
            <span className="a-label">Weekend rate (৳)</span>
            <input className="a-input a-num" inputMode="numeric" value={weekend} onChange={digits(setWeekend)} placeholder="Same as weekday" />
            <span className="a-hint">{WEEKEND_LABEL}</span>
          </label>
          <label className="a-field">
            <span className="a-label">Published rate (৳)</span>
            <input className="a-input a-num" inputMode="numeric" value={rack} onChange={digits(setRack)} placeholder="None" />
            <span className="a-hint">Shown crossed out</span>
          </label>
          <label className="a-field">
            <span className="a-label">Size (sq ft)</span>
            <input className="a-input a-num" inputMode="numeric" value={size} onChange={digits(setSize)} placeholder="Not shown yet" />
          </label>
        </div>
        <label className="a-field">
          <span className="a-label">One-line description</span>
          <textarea className="a-input" rows={3} maxLength={240} value={blurb} onChange={(e) => setBlurb(e.target.value)} />
          <span className="a-hint">{blurb.length}/240 · shown on the room cards</span>
        </label>
        <label className="a-check">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Bookable online
        </label>
      </fieldset>
      {p.children}
      {p.canEdit && (
        <div className="a-dialog-foot" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="a-hint">
            {dirty
              ? "Unsaved changes"
              : `Guests see ${formatTaka(p.price)}${p.weekendPrice && p.weekendPrice !== p.price ? ` · ${formatTaka(p.weekendPrice)} weekends` : ""}`}
          </span>
          <button type="submit" className="a-btn a-btn--primary a-btn--sm" disabled={!dirty || pending}>
            {pending && <span className="a-spin" aria-hidden="true" />}
            Save
          </button>
        </div>
      )}
    </form>
  );
}

/* ---------------------------------------------------------- Room photos */

type PhotoItem = { ref: string; src: string | null };

/**
 * Resizes a phone photo in the browser (longest side 2000px, JPEG) so uploads
 * are fast and small. Falls back to the original file if the browser can't.
 */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (blob) return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    // Unsupported format or browser: send the original and let the server check it.
  }
  return file;
}

export function RoomPhotos({ typeId, name, photos, canEdit }: { typeId: string; name: string; photos: PhotoItem[]; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const refs = photos.map((p) => p.ref);

  const saveOrder = (next: string[], done?: string) =>
    start(async () => {
      const res = await setRoomGallery(typeId, next);
      if (res.ok) toast.success((done ?? res.message ?? "Saved")); else toast.error(res.message);
      setConfirming(null);
    });

  const upload = (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    start(async () => {
      let added = 0;
      for (const [i, original] of list.entries()) {
        setProgress(`Uploading ${i + 1} of ${list.length}…`);
        const form = new FormData();
        form.append("photo", await shrink(original));
        const res = await uploadRoomPhoto(typeId, form);
        if (!res.ok) {
          toast(res.message);
          break;
        }
        added++;
      }
      setProgress("");
      if (added) toast(added === 1 ? "Photo added" : `${added} photos added`);
    });
  };

  return (
    <div className="a-panel-body" style={{ borderTop: "1px solid var(--a-line)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span className="a-label">Photos</span>
        <span className="a-hint">{photos.length ? "The first photo is the cover" : "No photos yet"}</span>
      </div>
      {photos.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 8 }}>
          {photos.map((p, i) => (
            <li key={p.ref} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ position: "relative", aspectRatio: "4 / 3", borderRadius: 6, overflow: "hidden", background: "var(--a-line)" }}>
                {p.src ? (
                  <Image src={p.src} alt={`${name}, photo ${i + 1}`} fill sizes="120px" style={{ objectFit: "cover" }} />
                ) : (
                  <span className="a-hint" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                    Missing
                  </span>
                )}
                {i === 0 && (
                  <span className="a-badge" data-s="confirmed" style={{ position: "absolute", left: 4, top: 4 }}>
                    Cover
                  </span>
                )}
              </div>
              {canEdit && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {i > 0 && (
                    <button
                      type="button"
                      className="a-btn a-btn--sm"
                      disabled={pending}
                      onClick={() => saveOrder([p.ref, ...refs.filter((r) => r !== p.ref)], "Cover photo changed")}
                    >
                      Cover
                    </button>
                  )}
                  <button
                    type="button"
                    className="a-btn a-btn--sm a-btn--danger"
                    disabled={pending}
                    onClick={() =>
                      confirming === p.ref ? saveOrder(refs.filter((r) => r !== p.ref), "Photo removed") : setConfirming(p.ref)
                    }
                    aria-label={confirming === p.ref ? `Confirm removing photo ${i + 1}` : `Remove photo ${i + 1}`}
                  >
                    {confirming === p.ref ? "Sure?" : "Remove"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <label className="a-btn a-btn--sm" style={{ position: "relative", alignSelf: "flex-start", cursor: pending ? "progress" : "pointer" }}>
          {pending && <span className="a-spin" aria-hidden="true" />}
          {progress || "Upload photos"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={pending}
            onChange={(e) => {
              upload(e.target.files);
              e.target.value = "";
            }}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}
          />
        </label>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- Add a room */

type TypeOption = { id: string; name: string };

export function AddRoomForm({ types }: { types: TypeOption[] }) {
  const [number, setNumber] = useState("");
  const [type, setType] = useState(types[0]?.id ?? "");
  const [floor, setFloor] = useState("");
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await addRoom({ number, room_type_id: type, floor: floor || null });
      if (res.ok) toast.success((res.message ?? "Room added")); else toast.error(res.message);
      if (res.ok) {
        setNumber("");
        setFloor("");
      }
    });
  };

  return (
    <form onSubmit={submit} className="a-panel">
      <fieldset
        disabled={pending}
        className="a-panel-body"
        style={{ border: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))", gap: 12, alignItems: "end" }}
      >
        <label className="a-field">
          <span className="a-label">Room number</span>
          <input className="a-input" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={10} placeholder="e.g. 305" required />
        </label>
        <label className="a-field">
          <span className="a-label">Room type</span>
          <select className="a-input" value={type} onChange={(e) => setType(e.target.value)} required>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="a-field">
          <span className="a-label">Floor</span>
          <input className="a-input" value={floor} onChange={(e) => setFloor(e.target.value)} maxLength={20} placeholder="e.g. 3rd" />
        </label>
        <button type="submit" className="a-btn a-btn--primary">
          {pending && <span className="a-spin" aria-hidden="true" />}
          Add room
        </button>
      </fieldset>
    </form>
  );
}

/* ---------------------------------------------------------- Physical room */

type RoomProps = {
  id: string;
  number: string;
  type: string;
  typeId: string;
  floor: string | null;
  types: TypeOption[];
  housekeeping: Housekeeping;
  outOfService: boolean;
  note: string | null;
  occupant: string | null;
  canManage: boolean;
};

function RoomSetup(p: RoomProps) {
  const [number, setNumber] = useState(p.number);
  const [type, setType] = useState(p.typeId);
  const [floor, setFloor] = useState(p.floor ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const dirty = number !== p.number || type !== p.typeId || floor !== (p.floor ?? "");

  const save = () =>
    start(async () => {
      const res = await editRoom(p.id, { number, room_type_id: type, floor: floor || null });
      if (res.ok) toast.success((res.message ?? "Saved")); else toast.error(res.message);
    });

  const remove = () =>
    start(async () => {
      const res = await deleteRoom(p.id);
      if (res.ok) toast.success(`Room ${p.number} removed`); else toast.error(res.message);
      setConfirmDelete(false);
    });

  return (
    <details>
      <summary style={{ cursor: "pointer", fontSize: "0.78rem", color: "var(--a-pine)", fontWeight: 500 }}>Edit room</summary>
      <fieldset disabled={pending} style={{ border: 0, margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <label className="a-field">
          <span className="a-label">Number</span>
          <input className="a-input" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={10} />
        </label>
        <label className="a-field">
          <span className="a-label">Type</span>
          <select className="a-input" value={type} onChange={(e) => setType(e.target.value)}>
            {p.types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="a-field">
          <span className="a-label">Floor</span>
          <input className="a-input" value={floor} onChange={(e) => setFloor(e.target.value)} maxLength={20} />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="a-btn a-btn--sm a-btn--primary" disabled={!dirty || pending} onClick={save}>
            Save
          </button>
          <button
            type="button"
            className="a-btn a-btn--sm a-btn--danger"
            disabled={pending}
            onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}
          >
            {confirmDelete ? `Remove room ${p.number}?` : "Remove room"}
          </button>
        </div>
      </fieldset>
    </details>
  );
}

const HK: { id: Housekeeping; label: string }[] = [
  { id: "dirty", label: "Dirty" },
  { id: "clean", label: "Clean" },
  { id: "inspected", label: "Inspected" },
];

export function RoomTile(p: RoomProps) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState(p.note ?? "");

  const save = (patch: Parameters<typeof updateRoom>[1], done: string) =>
    start(async () => {
      const res = await updateRoom(p.id, patch);
      if (res.ok) toast.success(done); else toast.error(res.message);
    });

  return (
    <article
      className="a-panel"
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderColor: p.outOfService ? "#e3c2b6" : undefined,
        background: p.outOfService ? "repeating-linear-gradient(135deg, #fff 0 8px, #fdf6f3 8px 16px)" : undefined,
      }}
      aria-label={`Room ${p.number}`}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div>
          <div style={{ fontSize: "1.35rem", fontWeight: 600, letterSpacing: "-0.02em" }}>{p.number}</div>
          <div className="a-muted" style={{ fontSize: "0.74rem" }}>
            {p.type}
          </div>
        </div>
        <span
          className="a-badge"
          data-s={p.outOfService ? "cancelled" : p.occupant ? "checked_in" : "checked_out"}
          title={p.occupant ? `Tonight: ${p.occupant}` : undefined}
        >
          {p.outOfService ? "Out of service" : p.occupant ? "Occupied" : "Vacant"}
        </span>
      </div>
      {p.occupant && !p.outOfService && (
        <div style={{ fontSize: "0.78rem" }}>
          Tonight: <strong style={{ fontWeight: 500 }}>{p.occupant}</strong>
        </div>
      )}
      <div className="a-seg" role="group" aria-label={`Housekeeping for room ${p.number}`}>
        {HK.map((h) => (
          <button
            key={h.id}
            type="button"
            aria-pressed={p.housekeeping === h.id}
            disabled={pending}
            onClick={() => p.housekeeping !== h.id && save({ housekeeping: h.id }, `Room ${p.number}: ${h.label.toLowerCase()}`)}
          >
            {h.label}
          </button>
        ))}
      </div>
      {p.canManage && (
        <details>
          <summary style={{ cursor: "pointer", fontSize: "0.78rem", color: "var(--a-pine)", fontWeight: 500 }}>
            {p.outOfService ? "Return to service" : "Take out of service"}
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {!p.outOfService && (
              <input
                className="a-input"
                placeholder="Reason, e.g. AC repair"
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-label="Reason"
              />
            )}
            <button
              type="button"
              className={`a-btn a-btn--sm ${p.outOfService ? "" : "a-btn--danger"}`}
              disabled={pending}
              onClick={() =>
                save(
                  p.outOfService ? { out_of_service: false, service_note: null } : { out_of_service: true, service_note: note },
                  p.outOfService ? `Room ${p.number} is back in service` : `Room ${p.number} taken out of service — no longer sold`,
                )
              }
            >
              {p.outOfService ? "Return to service" : "Take out of service"}
            </button>
          </div>
        </details>
      )}
      {p.canManage && <RoomSetup {...p} />}
    </article>
  );
}

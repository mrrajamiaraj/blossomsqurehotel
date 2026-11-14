"use client";

import { useState, useTransition } from "react";
import { updateRoom, updateRoomType } from "@/app/admin/actions";
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
      toast(res.ok ? (res.message ?? "Saved") : res.message);
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

/* ---------------------------------------------------------- Physical room */

type RoomProps = {
  id: string;
  number: string;
  type: string;
  housekeeping: Housekeeping;
  outOfService: boolean;
  note: string | null;
  occupant: string | null;
  canManage: boolean;
};

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
      toast(res.ok ? done : res.message);
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
    </article>
  );
}

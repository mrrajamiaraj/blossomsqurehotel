"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateRoomTypeDetails } from "@/app/admin/actions";
import { addAmenity, blockRoom, createRoomType, deleteSeason, releaseBlock, saveSeason, setAmenityActive, setRoomTypeAmenities } from "@/app/admin/operations";
import type { AmenityRow, RoomBlock, SeasonalRate } from "@/lib/data/operations";
import { formatTaka } from "@/lib/format";
import ConfirmDialog from "./kit/ConfirmDialog";
import Dialog from "./Dialog";
import { toast } from "../ui/Toaster";

const digits = (s: string) => s.replace(/\D/g, "");
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/* ------------------------------------------------------- new room type */

export function NewRoomType() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ name: "", tag: "DELUXE", bed: "", sleeps: "2", price: "", weekend: "", blurb: "" });
  const save = () =>
    start(async () => {
      const res = await createRoomType({ name: f.name, tag: f.tag, bed: f.bed, sleeps: Number(f.sleeps), price: Number(f.price), weekendPrice: f.weekend ? Number(f.weekend) : null, blurb: f.blurb, description: "" });
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message ?? "Created");
      setOpen(false);
      setF({ name: "", tag: "DELUXE", bed: "", sleeps: "2", price: "", weekend: "", blurb: "" });
      router.refresh();
    });
  return (
    <>
      <button type="button" className="a-btn a-btn--primary" onClick={() => setOpen(true)}>
        + New room type
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New room type"
        description="It starts hidden from the website. Add rooms and photos, then tick “Bookable online”."
        onSubmit={save}
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="a-btn a-btn--primary" disabled={pending}>
              {pending && <span className="a-spin" aria-hidden="true" />}
              Create room type
            </button>
          </>
        }
      >
        <div className="a-grid-2" style={{ minWidth: "min(560px, 86vw)" }}>
          <label className="a-field a-span-2">
            <span className="a-label">Name</span>
            <input className="a-input" value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Garden Twin" required />
          </label>
          <label className="a-field">
            <span className="a-label">Category</span>
            <select className="a-input" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })}>
              <option value="DELUXE">Room</option>
              <option value="SUITE">Suite</option>
            </select>
          </label>
          <label className="a-field">
            <span className="a-label">Sleeps (adults)</span>
            <input className="a-input a-num" inputMode="numeric" value={f.sleeps} onChange={(e) => setF({ ...f, sleeps: digits(e.target.value) })} required />
            <span className="a-hint">Each room also takes one child.</span>
          </label>
          <label className="a-field a-span-2">
            <span className="a-label">Beds</span>
            <input className="a-input" value={f.bed} maxLength={80} onChange={(e) => setF({ ...f, bed: e.target.value })} placeholder="e.g. Two single beds" required />
          </label>
          <label className="a-field">
            <span className="a-label">Weekday rate (৳)</span>
            <input className="a-input a-num" inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: digits(e.target.value) })} required />
          </label>
          <label className="a-field">
            <span className="a-label">Weekend rate (৳)</span>
            <input className="a-input a-num" inputMode="numeric" value={f.weekend} onChange={(e) => setF({ ...f, weekend: digits(e.target.value) })} placeholder="Same as weekday" />
          </label>
          <label className="a-field a-span-2">
            <span className="a-label">One-line description</span>
            <input className="a-input" value={f.blurb} maxLength={240} onChange={(e) => setF({ ...f, blurb: e.target.value })} />
          </label>
        </div>
      </Dialog>
    </>
  );
}

/* --------------------------------------------------------- details form */

export type TypeDetails = { id: string; name: string; tag: "SUITE" | "DELUXE"; bed: string; sleeps: number; view: string; size_sqft: number | null; blurb: string; description: string; features: string[] };

export function RoomTypeDetailsForm({ initial, canEdit }: { initial: TypeDetails; canEdit: boolean }) {
  const router = useRouter();
  const [d, setD] = useState({ ...initial, size: initial.size_sqft ? String(initial.size_sqft) : "", sleepsText: String(initial.sleeps) });
  const [pending, start] = useTransition();
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await updateRoomTypeDetails(initial.id, {
        name: d.name, tag: d.tag, bed: d.bed, sleeps: Number(d.sleepsText), view: d.view, size_sqft: d.size ? Number(d.size) : null,
        blurb: d.blurb, description: d.description, features: d.features,
      });
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message ?? "Saved");
      router.refresh();
    });
  };
  return (
    <form onSubmit={save} className="a-panel">
      <div className="a-panel-head">
        <h2 className="a-h2">Details</h2>
        <span className="a-hint">Shown on the room page and room cards</span>
      </div>
      <fieldset disabled={!canEdit || pending} className="a-panel-body a-grid-2" style={{ border: 0, margin: 0 }}>
        <label className="a-field a-span-2">
          <span className="a-label">Name</span>
          <input className="a-input" value={d.name} maxLength={60} onChange={(e) => setD({ ...d, name: e.target.value })} required />
        </label>
        <label className="a-field">
          <span className="a-label">Category</span>
          <select className="a-input" value={d.tag} onChange={(e) => setD({ ...d, tag: e.target.value as "SUITE" | "DELUXE" })}>
            <option value="DELUXE">Room</option>
            <option value="SUITE">Suite</option>
          </select>
        </label>
        <label className="a-field">
          <span className="a-label">Sleeps (adults)</span>
          <input className="a-input a-num" inputMode="numeric" value={d.sleepsText} onChange={(e) => setD({ ...d, sleepsText: digits(e.target.value) })} required />
          <span className="a-hint">Occupancy limit used by the booking engine (plus one child per room).</span>
        </label>
        <label className="a-field">
          <span className="a-label">Beds</span>
          <input className="a-input" value={d.bed} maxLength={80} onChange={(e) => setD({ ...d, bed: e.target.value })} required />
        </label>
        <label className="a-field">
          <span className="a-label">View</span>
          <input className="a-input" value={d.view} maxLength={40} onChange={(e) => setD({ ...d, view: e.target.value })} placeholder="e.g. Garden" />
        </label>
        <label className="a-field">
          <span className="a-label">Size (sq ft)</span>
          <input className="a-input a-num" inputMode="numeric" value={d.size} onChange={(e) => setD({ ...d, size: digits(e.target.value) })} placeholder="Not shown" />
        </label>
        <label className="a-field a-span-2">
          <span className="a-label">One-line description</span>
          <input className="a-input" value={d.blurb} maxLength={240} onChange={(e) => setD({ ...d, blurb: e.target.value })} />
        </label>
        <label className="a-field a-span-2">
          <span className="a-label">Full description</span>
          <textarea className="a-input" rows={5} maxLength={1500} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
        </label>
        <fieldset className="a-field a-span-2" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="a-label">Room features</legend>
          <span className="a-hint">The list on the room page, e.g. “Queen-size bed”, “Balcony”.</span>
          <ul role="list" style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {d.features.map((x, i) => (
              <li key={i} style={{ display: "flex", gap: 6 }}>
                <input className="a-input" value={x} maxLength={60} aria-label={`Feature ${i + 1}`} onChange={(e) => setD({ ...d, features: d.features.map((y, j) => (j === i ? e.target.value : y)) })} />
                <button type="button" className="a-btn a-btn--sm a-btn--ghost" aria-label={`Move feature ${i + 1} up`} disabled={i === 0} onClick={() => setD({ ...d, features: swap(d.features, i, i - 1) })}>
                  ↑
                </button>
                <button type="button" className="a-btn a-btn--sm a-btn--ghost" aria-label={`Remove feature ${i + 1}`} onClick={() => setD({ ...d, features: d.features.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {d.features.length < 16 && (
            <button type="button" className="a-btn a-btn--sm" style={{ alignSelf: "flex-start", marginTop: 6 }} onClick={() => setD({ ...d, features: [...d.features, ""] })}>
              + Add feature
            </button>
          )}
        </fieldset>
      </fieldset>
      {canEdit && (
        <div className="a-dialog-foot">
          <button type="submit" className="a-btn a-btn--primary" disabled={pending}>
            {pending && <span className="a-spin" aria-hidden="true" />}
            Save details
          </button>
        </div>
      )}
    </form>
  );
}

function swap<T>(list: T[], a: number, b: number): T[] {
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/* ------------------------------------------------------------ amenities */

export function AmenitiesPicker({ typeId, amenities, selected, canEdit }: { typeId: string; amenities: AmenityRow[]; selected: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [chosen, setChosen] = useState(selected);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const dirty = [...chosen].sort().join() !== [...selected].sort().join();
  const save = () =>
    start(async () => {
      const res = await setRoomTypeAmenities(typeId, chosen);
      if (res.ok) toast.success(res.message ?? "Saved");
      else toast.error(res.message);
      router.refresh();
    });
  const add = () =>
    start(async () => {
      const res = await addAmenity(name, "", "room");
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message ?? "Added");
      setName("");
      router.refresh();
    });
  const toggleHidden = (a: AmenityRow) =>
    start(async () => {
      const res = await setAmenityActive(a.id, !a.is_active);
      if (res.ok) toast.success(res.message ?? "Saved");
      else toast.error(res.message);
      router.refresh();
    });
  return (
    <section className="a-panel" aria-labelledby="amen-h">
      <div className="a-panel-head">
        <h2 id="amen-h" className="a-h2">
          Amenities
        </h2>
        <span className="a-hint">Tick what this room type offers</span>
      </div>
      <div className="a-panel-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
          {amenities.map((a) => (
            <li key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, opacity: a.is_active ? 1 : 0.55 }}>
              <label className="a-check" style={{ flex: 1 }}>
                <input type="checkbox" disabled={!canEdit || pending} checked={chosen.includes(a.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, a.id] : chosen.filter((x) => x !== a.id))} />
                {a.name}
                {!a.is_active && " (hidden)"}
              </label>
              {canEdit && (
                <button type="button" className="a-btn a-btn--sm a-btn--ghost" disabled={pending} onClick={() => toggleHidden(a)} title={a.is_active ? "Hide this amenity everywhere" : "Show it again"}>
                  {a.is_active ? "Hide" : "Show"}
                </button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "end" }}>
            <span style={{ display: "flex", gap: 8, alignItems: "end" }}>
              <label className="a-field">
                <span className="a-label">New amenity</span>
                <input className="a-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bathtub" />
              </label>
              <button type="button" className="a-btn a-btn--sm" disabled={pending || name.trim().length < 2} onClick={add}>
                Add
              </button>
            </span>
            <button type="button" className="a-btn a-btn--primary a-btn--sm" disabled={!dirty || pending} onClick={save}>
              Save amenities
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------- seasonal rates */

type SeasonForm = { id: string | null; name: string; first: string; last: string; price: string; weekend: string; active: boolean };

export function SeasonsPanel({ typeId, seasons, today, canEdit, basePrice }: { typeId: string; seasons: SeasonalRate[]; today: string; canEdit: boolean; basePrice: number }) {
  const router = useRouter();
  const [form, setForm] = useState<SeasonForm | null>(null);
  const [removing, setRemoving] = useState<SeasonalRate | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    form &&
    start(async () => {
      const res = await saveSeason({
        id: form.id, room_type_id: typeId, name: form.name, starts_on: form.first, ends_on: form.last ? addDays(form.last, 1) : "",
        price_bdt: Number(form.price), weekend_price_bdt: form.weekend ? Number(form.weekend) : null, is_active: form.active,
      });
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message ?? "Saved");
      setForm(null);
      router.refresh();
    });
  const remove = () =>
    removing &&
    start(async () => {
      const res = await deleteSeason(removing.id);
      setRemoving(null);
      if (res.ok) toast.success(res.message ?? "Removed");
      else toast.error(res.message);
      router.refresh();
    });
  const upcoming = seasons.filter((s) => s.ends_on > today);
  return (
    <section className="a-panel" aria-labelledby="season-h">
      <div className="a-panel-head">
        <h2 id="season-h" className="a-h2">
          Seasonal rates
        </h2>
        {canEdit && (
          <button type="button" className="a-btn a-btn--sm a-btn--primary" onClick={() => setForm({ id: null, name: "", first: today, last: addDays(today, 6), price: String(basePrice), weekend: "", active: true })}>
            + Add season
          </button>
        )}
      </div>
      {upcoming.length === 0 ? (
        <div className="a-empty">
          <strong>No seasons</strong>
          <span>The weekday and weekend rates apply all year. Add a season for holidays or peak months.</span>
        </div>
      ) : (
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {upcoming.map((s) => (
            <li key={s.id} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "12px 20px", borderTop: "1px solid var(--a-line)", opacity: s.is_active ? 1 : 0.6 }}>
              <span style={{ flex: "1 1 220px" }}>
                <strong>{s.name}</strong>
                {!s.is_active && <span className="a-hint"> (off)</span>}
                <span className="a-hint" style={{ display: "block" }}>
                  Nights {nice(s.starts_on)} – {nice(addDays(s.ends_on, -1))} · {formatTaka(s.price_bdt)}
                  {s.weekend_price_bdt ? ` · weekends ${formatTaka(s.weekend_price_bdt)}` : ""}
                </span>
              </span>
              {canEdit && (
                <span style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="a-btn a-btn--sm"
                    onClick={() => setForm({ id: s.id, name: s.name, first: s.starts_on, last: addDays(s.ends_on, -1), price: String(s.price_bdt), weekend: s.weekend_price_bdt ? String(s.weekend_price_bdt) : "", active: s.is_active })}
                  >
                    Edit
                  </button>
                  <button type="button" className="a-btn a-btn--sm a-btn--ghost" onClick={() => setRemoving(s)}>
                    Remove
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit season" : "Add a season"}
        description="New bookings for these nights use this rate instead of the weekday/weekend rate. Existing bookings keep their price."
        onSubmit={save}
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setForm(null)} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="a-btn a-btn--primary" disabled={pending}>
              {pending && <span className="a-spin" aria-hidden="true" />}
              Save season
            </button>
          </>
        }
      >
        {form && (
          <div className="a-grid-2">
            <label className="a-field a-span-2">
              <span className="a-label">Name</span>
              <input className="a-input" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Eid holidays" required />
            </label>
            <label className="a-field">
              <span className="a-label">First night</span>
              <input className="a-input" type="date" value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} required />
            </label>
            <label className="a-field">
              <span className="a-label">Last night</span>
              <input className="a-input" type="date" min={form.first} value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} required />
            </label>
            <label className="a-field">
              <span className="a-label">Nightly rate (৳)</span>
              <input className="a-input a-num" inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: digits(e.target.value) })} required />
            </label>
            <label className="a-field">
              <span className="a-label">Weekend rate (৳)</span>
              <input className="a-input a-num" inputMode="numeric" value={form.weekend} onChange={(e) => setForm({ ...form, weekend: digits(e.target.value) })} placeholder="Same every night" />
            </label>
            <label className="a-check a-span-2">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Switched on
            </label>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        pending={pending}
        destructive
        title={`Remove “${removing?.name ?? ""}”?`}
        description="New bookings for those nights go back to the normal rates. Existing bookings keep their price."
        confirmLabel="Remove season"
      />
    </section>
  );
}

/* ---------------------------------------------------- maintenance blocks */

export function MaintenanceBlocks({ roomId, number, blocks, today }: { roomId: string; number: string; blocks: RoomBlock[]; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [first, setFirst] = useState(today);
  const [last, setLast] = useState(today);
  const [reason, setReason] = useState("");
  const block = () =>
    start(async () => {
      const res = await blockRoom(roomId, first, addDays(last, 1), reason);
      if (!res.ok) return void toast.error(res.message);
      toast.success(`Room ${number}: ${res.message ?? "blocked"}`);
      setReason("");
      router.refresh();
    });
  const release = (id: string) =>
    start(async () => {
      const res = await releaseBlock(id);
      if (res.ok) toast.success(`Room ${number}: ${res.message ?? "released"}`);
      else toast.error(res.message);
      router.refresh();
    });
  return (
    <details>
      <summary style={{ cursor: "pointer", fontSize: "0.78rem", color: "var(--a-pine)", fontWeight: 500 }}>
        Maintenance block{blocks.length ? ` (${blocks.length})` : ""}
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {blocks.map((b) => (
          <div key={b.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", fontSize: "0.78rem" }}>
            <span>
              {nice(b.starts_on)} – {nice(addDays(b.ends_on, -1))}: {b.reason}
            </span>
            <button type="button" className="a-btn a-btn--sm" disabled={pending} onClick={() => release(b.id)}>
              Release
            </button>
          </div>
        ))}
        <div className="a-grid-2" style={{ gap: 8 }}>
          <label className="a-field">
            <span className="a-label">First night</span>
            <input className="a-input" type="date" min={today} value={first} onChange={(e) => setFirst(e.target.value)} />
          </label>
          <label className="a-field">
            <span className="a-label">Last night</span>
            <input className="a-input" type="date" min={first} value={last} onChange={(e) => setLast(e.target.value)} />
          </label>
        </div>
        <input className="a-input" placeholder="Reason, e.g. Repainting" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for the block" />
        <button type="button" className="a-btn a-btn--sm a-btn--danger" disabled={pending || reason.trim().length < 3} onClick={block}>
          Block these dates
        </button>
        <span className="a-hint">The room isn&apos;t sold for those nights. Refused if a guest already has it.</span>
      </div>
    </details>
  );
}

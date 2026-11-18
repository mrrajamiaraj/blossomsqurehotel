"use client";

import { useState, useTransition } from "react";
import { deletePromotion, savePromotion, setPromotionActive } from "@/app/admin/operations";
import type { Promotion, PromotionInput, PromotionUsage } from "@/lib/data/operations";
import { formatTaka } from "@/lib/format";
import ConfirmDialog from "./kit/ConfirmDialog";
import Dialog from "./Dialog";
import { toast } from "../ui/Toaster";

type TypeOption = { id: string; name: string };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function state(p: Promotion, today: string): { label: string; badge: string } {
  if (!p.is_active) return { label: "Off", badge: "checked_out" };
  if (p.ends_on <= today || (p.bookable_until && p.bookable_until < today)) return { label: "Ended", badge: "checked_out" };
  if (p.bookable_from && p.bookable_from > today) return { label: "Scheduled", badge: "pending" };
  return { label: "On", badge: "confirmed" };
}

const blank = (today: string): PromotionInput & { last_night: string } => ({
  code: "", name: "", description: "", discount_type: "percent", discount_value: 10, starts_on: today, ends_on: addDays(today, 31), last_night: addDays(today, 30),
  min_nights: 1, room_type_ids: [], is_public: true, is_active: false, stackable: false, max_redemptions: null, max_discount_bdt: null, bookable_from: null, bookable_until: null,
});

/** Percentage and fixed-amount offers, codes or automatic, with stacking rules. */
export default function PromotionsManager({ promotions, usage, types, today, maxPercent, live }: { promotions: Promotion[]; usage: PromotionUsage[]; types: TypeOption[]; today: string; maxPercent: number; live: boolean }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<{ id: string | null; form: ReturnType<typeof blank> } | null>(null);
  const [removing, setRemoving] = useState<Promotion | null>(null);
  const used = (id: string) => usage.find((u) => u.promotion_id === id);
  const typeNames = (ids: string[]) => (ids.length ? ids.map((i) => types.find((t) => t.id === i)?.name ?? "?").join(", ") : "All room types");

  const open = (p?: Promotion) =>
    setEditing(
      p
        ? { id: p.id, form: { ...p, code: p.code ?? "", last_night: addDays(p.ends_on, -1) } }
        : { id: null, form: blank(today) },
    );

  const f = editing?.form;
  const set = (patch: Partial<ReturnType<typeof blank>>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });

  const save = () =>
    editing &&
    start(async () => {
      const { last_night, ...rest } = editing.form;
      const res = await savePromotion(editing.id, { ...rest, ends_on: addDays(last_night, 1) });
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message ?? "Saved");
      setEditing(null);
    });

  const toggle = (p: Promotion) =>
    start(async () => {
      const res = await setPromotionActive(p.id, !p.is_active);
      if (res.ok) toast.success(res.message ?? "Saved");
      else toast.error(res.message);
    });

  const remove = () =>
    removing &&
    start(async () => {
      const res = await deletePromotion(removing.id);
      setRemoving(null);
      if (res.ok) toast.success(res.message ?? "Deleted");
      else toast.error(res.message);
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="a-panel" style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
        <p className="a-hint" style={{ margin: 0, maxWidth: 680 }}>
          <strong>How offers combine:</strong> guests get the best deal allowed. Offers marked <em>combinable</em> add up; any other offer stands alone, and whichever
          saves the guest more wins. Together, offers never take more than {maxPercent}% off the room charges (change this in Settings).
        </p>
        <button type="button" className="a-btn a-btn--primary" onClick={() => open()} disabled={!live}>
          + New offer
        </button>
      </div>

      {promotions.length === 0 ? (
        <div className="a-empty">
          <strong>No offers yet</strong>
          <span>Create a percentage or fixed-amount discount, for all rooms or some, for set dates. Leave the code empty to apply it automatically.</span>
        </div>
      ) : (
        <div className="a-table-wrap">
          <table className="a-table a-table--stack">
            <thead>
              <tr>
                <th>Offer</th>
                <th>Discount</th>
                <th>Stays</th>
                <th>Used</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {promotions.map((p) => {
                const s = state(p, today);
                const u = used(p.id);
                return (
                  <tr key={p.id}>
                    <td data-label="">
                      <span className="a-primary-cell">
                        <strong>
                          {p.name}{" "}
                          <span className="a-badge" data-s={s.badge}>
                            {s.label}
                          </span>
                        </strong>
                        <span>
                          {p.code ? `Code ${p.code}` : "Automatic"} · {p.stackable ? "Combinable" : "Stands alone"} · {typeNames(p.room_type_ids)}
                          {!p.is_public ? " · Private" : ""}
                        </span>
                      </span>
                    </td>
                    <td data-label="Discount">
                      {p.discount_type === "percent" ? `${p.discount_value}%` : formatTaka(p.discount_value)}
                      {p.max_discount_bdt ? <span className="a-hint" style={{ display: "block" }}>up to {formatTaka(p.max_discount_bdt)}</span> : null}
                    </td>
                    <td data-label="Stays">
                      {nice(p.starts_on)} – {nice(addDays(p.ends_on, -1))}
                      <span className="a-hint" style={{ display: "block" }}>
                        {p.min_nights > 1 ? `${p.min_nights}+ nights` : "Any length"}
                        {p.bookable_from || p.bookable_until ? ` · book ${p.bookable_from ? `from ${nice(p.bookable_from)}` : ""}${p.bookable_until ? ` until ${nice(p.bookable_until)}` : ""}` : ""}
                      </span>
                    </td>
                    <td data-label="Used">
                      {u?.bookings ?? 0}
                      {p.max_redemptions ? ` of ${p.max_redemptions}` : ""}
                      {u?.discount_bdt ? <span className="a-hint" style={{ display: "block" }}>{formatTaka(u.discount_bdt)} given</span> : null}
                    </td>
                    <td data-label="">
                      <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button type="button" className="a-btn a-btn--sm" disabled={pending || !live} onClick={() => toggle(p)}>
                          {p.is_active ? "Switch off" : "Switch on"}
                        </button>
                        <button type="button" className="a-btn a-btn--sm" disabled={pending || !live} onClick={() => open(p)}>
                          Edit
                        </button>
                        <button type="button" className="a-btn a-btn--sm a-btn--ghost" disabled={pending || !live || Boolean(u?.bookings)} title={u?.bookings ? "Already used — switch it off instead" : undefined} onClick={() => setRemoving(p)}>
                          Delete
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit offer" : "New offer"}
        onSubmit={save}
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="a-btn a-btn--primary" disabled={pending}>
              {pending && <span className="a-spin" aria-hidden="true" />}
              Save offer
            </button>
          </>
        }
      >
        {f && (
          <div className="a-grid-2" style={{ minWidth: "min(620px, 86vw)" }}>
            <label className="a-field a-span-2">
              <span className="a-label">Name guests see</span>
              <input className="a-input" value={f.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Midweek escape" required />
            </label>
            <label className="a-field">
              <span className="a-label">Discount type</span>
              <select className="a-input" value={f.discount_type} onChange={(e) => set({ discount_type: e.target.value as "percent" | "amount" })}>
                <option value="percent">Percentage off</option>
                <option value="amount">Fixed amount off (per stay)</option>
              </select>
            </label>
            <label className="a-field">
              <span className="a-label">{f.discount_type === "percent" ? "Percent off" : "Taka off"}</span>
              <input className="a-input a-num" inputMode="numeric" value={f.discount_value || ""} onChange={(e) => set({ discount_value: Number(e.target.value.replace(/\D/g, "")) })} required />
              <span className="a-hint">{f.discount_type === "percent" ? "1–90%" : "Taken once off the whole stay"}</span>
            </label>
            <label className="a-field">
              <span className="a-label">Promo code</span>
              <input className="a-input" value={f.code ?? ""} maxLength={20} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="Leave empty = automatic" />
              <span className="a-hint">{f.code ? "Guests type this code when booking." : "Applies automatically to every booking that qualifies."}</span>
            </label>
            <label className="a-field">
              <span className="a-label">Minimum nights</span>
              <input className="a-input a-num" inputMode="numeric" value={f.min_nights} onChange={(e) => set({ min_nights: Number(e.target.value.replace(/\D/g, "")) || 1 })} />
            </label>
            <label className="a-field">
              <span className="a-label">First night</span>
              <input className="a-input" type="date" value={f.starts_on} onChange={(e) => set({ starts_on: e.target.value })} required />
            </label>
            <label className="a-field">
              <span className="a-label">Last night</span>
              <input className="a-input" type="date" value={f.last_night} min={f.starts_on} onChange={(e) => set({ last_night: e.target.value })} required />
              <span className="a-hint">Only nights in this range are discounted.</span>
            </label>
            <label className="a-field">
              <span className="a-label">Can be booked from</span>
              <input className="a-input" type="date" value={f.bookable_from ?? ""} onChange={(e) => set({ bookable_from: e.target.value || null })} />
              <span className="a-hint">Optional, e.g. an early-bird window.</span>
            </label>
            <label className="a-field">
              <span className="a-label">Can be booked until</span>
              <input className="a-input" type="date" value={f.bookable_until ?? ""} onChange={(e) => set({ bookable_until: e.target.value || null })} />
            </label>
            <fieldset className="a-field a-span-2" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="a-label">Room types</legend>
              <span className="a-hint">None ticked = every room type.</span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 6 }}>
                {types.map((t) => (
                  <label key={t.id} className="a-check">
                    <input
                      type="checkbox"
                      checked={f.room_type_ids.includes(t.id)}
                      onChange={(e) => set({ room_type_ids: e.target.checked ? [...f.room_type_ids, t.id] : f.room_type_ids.filter((x) => x !== t.id) })}
                    />
                    {t.name}
                  </label>
                ))}
              </span>
            </fieldset>
            <label className="a-field">
              <span className="a-label">Maximum uses</span>
              <input className="a-input a-num" inputMode="numeric" value={f.max_redemptions ?? ""} onChange={(e) => set({ max_redemptions: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })} placeholder="No limit" />
              <span className="a-hint">Counts bookings that aren&apos;t cancelled.</span>
            </label>
            <label className="a-field">
              <span className="a-label">Maximum discount (৳)</span>
              <input className="a-input a-num" inputMode="numeric" value={f.max_discount_bdt ?? ""} onChange={(e) => set({ max_discount_bdt: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })} placeholder="No cap" />
            </label>
            <label className="a-field a-span-2">
              <span className="a-label">Description</span>
              <textarea className="a-input" rows={2} maxLength={500} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Shown on the offers page, e.g. what's included" />
            </label>
            <div className="a-span-2" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="a-check">
                <input type="checkbox" checked={f.stackable} onChange={(e) => set({ stackable: e.target.checked })} />
                Combinable with other combinable offers
              </label>
              <label className="a-check">
                <input type="checkbox" checked={f.is_public} onChange={(e) => set({ is_public: e.target.checked })} />
                Show on the offers page {f.code ? "(untick for a private code you give out yourself)" : ""}
              </label>
              <label className="a-check">
                <input type="checkbox" checked={f.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
                Switched on
              </label>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        pending={pending}
        destructive
        title={`Delete “${removing?.name ?? ""}”?`}
        description="It hasn't been used by any booking. This can't be undone; to keep it for later, switch it off instead."
        confirmLabel="Delete offer"
      />
    </div>
  );
}

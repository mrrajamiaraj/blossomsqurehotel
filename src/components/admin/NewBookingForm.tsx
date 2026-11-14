"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { checkAvailability, createStaffBooking } from "@/app/admin/actions";
import { addDays, nightsBetween } from "@/lib/dates";
import { formatTaka } from "@/lib/format";
import { stayCost } from "@/lib/pricing";
import { toast } from "../ui/Toaster";

type TypeOption = { slug: string; name: string; price: number; weekend: number | null; sleeps: number; published: boolean };

export default function NewBookingForm({ today, types }: { today: string; types: TypeOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [free, setFree] = useState<Record<string, number> | null>(null);
  const [form, setForm] = useState({
    room: types[0]?.slug ?? "",
    checkIn: today,
    checkOut: addDays(today, 1),
    rooms: 1,
    adults: 2,
    children: 0,
    name: "",
    phone: "",
    email: "",
    country: "Bangladesh",
    requests: "",
    notes: "",
    airportPickup: false,
    source: "phone" as "phone" | "walk_in" | "other",
    confirm: true,
  });

  const nights = form.checkOut > form.checkIn ? nightsBetween(form.checkIn, form.checkOut) : 0;
  const type = types.find((t) => t.slug === form.room);

  // Live availability for the chosen dates.
  useEffect(() => {
    if (!nights) return setFree(null);
    let cancelled = false;
    checkAvailability(form.checkIn, form.checkOut).then((res) => !cancelled && setFree(res));
    return () => {
      cancelled = true;
    };
  }, [form.checkIn, form.checkOut, nights]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createStaffBooking({
        room: form.room,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        rooms: form.rooms,
        adults: form.adults,
        children: form.children,
        name: form.name,
        email: form.email || null,
        phone: form.phone,
        country: form.country,
        requests: form.requests,
        notes: form.notes,
        airportPickup: form.airportPickup,
        source: form.source,
        status: form.confirm ? "confirmed" : "pending",
      });
      if (res.ok && res.reference) {
        toast(`Booking ${res.reference} created`);
        router.push(`/admin/bookings/${res.reference}`);
      } else if (!res.ok) {
        setError(res.message);
      }
    });
  };

  const left = free?.[form.room];

  return (
    <form onSubmit={submit} className="a-panel" style={{ maxWidth: 880 }}>
      <div className="a-panel-head">
        <h2 className="a-h2">Stay</h2>
      </div>
      <div className="a-panel-body a-grid-2">
        <label className="a-field">
          <span className="a-label">Arrive</span>
          <input
            type="date"
            className="a-input"
            min={today}
            value={form.checkIn}
            onChange={(e) => {
              const v = e.target.value;
              setForm((f) => ({ ...f, checkIn: v, checkOut: f.checkOut > v ? f.checkOut : addDays(v, 1) }));
            }}
            required
          />
        </label>
        <label className="a-field">
          <span className="a-label">Depart</span>
          <input type="date" className="a-input" min={addDays(form.checkIn, 1)} value={form.checkOut} onChange={(e) => set("checkOut", e.target.value)} required />
          <span className="a-hint">{nights ? `${nights} ${nights === 1 ? "night" : "nights"}` : "Choose a later date"}</span>
        </label>

        <fieldset className="a-span-2" style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="a-label" style={{ marginBottom: 8 }}>
            Room type
          </legend>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {types.map((t) => {
              const n = free?.[t.slug];
              const full = n !== undefined && n < form.rooms;
              const on = form.room === t.slug;
              return (
                <label
                  key={t.slug}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    padding: "12px 14px",
                    border: `1px solid ${on ? "var(--a-pine)" : "var(--a-line-strong)"}`,
                    boxShadow: on ? "inset 0 0 0 1px var(--a-pine)" : "none",
                    borderRadius: 3,
                    cursor: full ? "not-allowed" : "pointer",
                    opacity: full ? 0.5 : 1,
                    background: "var(--a-surface)",
                  }}
                >
                  <input type="radio" name="room" value={t.slug} checked={on} disabled={full} onChange={() => set("room", t.slug)} className="sr-only" />
                  <strong style={{ fontWeight: 600 }}>{t.name}</strong>
                  <span className="a-muted" style={{ fontSize: "0.78rem" }}>
                    {formatTaka(t.price)}
                    {t.weekend && t.weekend !== t.price ? ` · ${formatTaka(t.weekend)} Thu/Fri` : ""} / night
                    {!t.published && " · hidden online"}
                  </span>
                  <span style={{ fontSize: "0.76rem", color: full ? "var(--s-cancel-fg)" : "var(--a-ink-2)" }}>
                    {n === undefined
                      ? free
                        ? "Hidden online — check the calendar"
                        : "Checking…"
                      : full
                        ? "Not enough rooms free"
                        : `${n} free for these dates`}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="a-span-2" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          {(["rooms", "adults", "children"] as const).map((k) => (
            <label key={k} className="a-field">
              <span className="a-label">{k[0].toUpperCase() + k.slice(1)}</span>
              <input
                type="number"
                className="a-input"
                min={k === "children" ? 0 : 1}
                max={k === "rooms" ? 5 : 10}
                value={form[k]}
                onChange={(e) => set(k, Math.max(k === "children" ? 0 : 1, Number(e.target.value) || 0))}
              />
            </label>
          ))}
        </div>
        {type && nights > 0 && (
          <p className="a-span-2 a-hint" aria-live="polite">
            Room total <strong style={{ color: "var(--a-ink)" }}>{formatTaka(stayCost({ price_bdt: type.price, weekend_price_bdt: type.weekend }, form.checkIn, form.checkOut, form.rooms).total)}</strong> ·{" "}
            {left !== undefined ? `${left} of this type free` : ""}
          </p>
        )}
      </div>

      <div className="a-panel-head" style={{ borderTop: "1px solid var(--a-line)" }}>
        <h2 className="a-h2">Guest</h2>
      </div>
      <div className="a-panel-body a-grid-2">
        <label className="a-field a-span-2">
          <span className="a-label">Full name</span>
          <input className="a-input" required minLength={2} maxLength={120} value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" />
        </label>
        <label className="a-field">
          <span className="a-label">Phone</span>
          <input className="a-input" type="tel" required value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+880 17XX-XXXXXX" />
        </label>
        <label className="a-field">
          <span className="a-label">Email (optional)</span>
          <input className="a-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </label>
        <label className="a-field">
          <span className="a-label">Booked by</span>
          <select className="a-input" value={form.source} onChange={(e) => set("source", e.target.value as typeof form.source)}>
            <option value="phone">Phone</option>
            <option value="walk_in">Walk-in</option>
            <option value="other">Other (agent, email…)</option>
          </select>
        </label>
        <label className="a-field">
          <span className="a-label">Country</span>
          <input className="a-input" value={form.country} onChange={(e) => set("country", e.target.value)} maxLength={60} />
        </label>
        <label className="a-field a-span-2">
          <span className="a-label">Guest&apos;s requests</span>
          <textarea className="a-input" maxLength={1000} value={form.requests} onChange={(e) => set("requests", e.target.value)} />
        </label>
        <label className="a-field a-span-2">
          <span className="a-label">Internal notes</span>
          <textarea className="a-input" maxLength={2000} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Only staff see these" />
        </label>
        <label className="a-check">
          <input type="checkbox" checked={form.airportPickup} onChange={(e) => set("airportPickup", e.target.checked)} />
          Airport pickup
        </label>
        <label className="a-check">
          <input type="checkbox" checked={form.confirm} onChange={(e) => set("confirm", e.target.checked)} />
          Confirm now (guest already agreed)
        </label>
      </div>

      <div className="a-dialog-foot" style={{ justifyContent: "space-between", alignItems: "center" }}>
        {error ? (
          <p className="a-error" role="alert">
            {error}
          </p>
        ) : (
          <span className="a-hint">Prices come from Rooms &amp; rates; availability is re-checked on save.</span>
        )}
        <button type="submit" className="a-btn a-btn--primary" disabled={pending || !nights}>
          {pending && <span className="a-spin" aria-hidden="true" />}
          Create booking
        </button>
      </div>
    </form>
  );
}

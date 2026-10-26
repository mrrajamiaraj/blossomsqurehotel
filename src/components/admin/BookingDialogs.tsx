"use client";

import { useState, useTransition } from "react";
import { modifyBooking, recordPayment, updateGuestDetails } from "@/app/admin/actions";
import type { PaymentMethod } from "@/lib/data/types";
import { nightsBetween } from "@/lib/dates";
import { formatTaka } from "@/lib/format";
import { toast } from "../ui/Toaster";
import Dialog from "./Dialog";

type TypeOption = { slug: string; id: string; name: string; price: number; sleeps: number };

/* ---------------------------------------------------------- Change stay */

export function ChangeStay(props: {
  id: string;
  locked: boolean;
  inHouse: boolean;
  current: { typeId: string; rate: number; checkIn: string; checkOut: string; rooms: number; adults: number; children: number };
  types: TypeOption[];
}) {
  const { id, current, types, inHouse } = props;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const initialSlug = types.find((t) => t.id === current.typeId)?.slug ?? types[0]?.slug;
  const [form, setForm] = useState({ ...current, room: initialSlug });

  const type = types.find((t) => t.slug === form.room);
  const sameType = type?.id === current.typeId;
  const rate = sameType ? current.rate : (type?.price ?? 0);
  const nights = form.checkOut > form.checkIn ? nightsBetween(form.checkIn, form.checkOut) : 0;
  const total = rate * nights * form.rooms;

  const save = () =>
    start(async () => {
      const res = await modifyBooking(id, {
        room: form.room!,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        rooms: form.rooms,
        adults: form.adults,
        children: form.children,
      });
      if (res.ok) {
        toast(res.message ?? "Saved");
        setOpen(false);
      } else setError(res.message);
    });

  const num = (k: "rooms" | "adults" | "children") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: Math.max(k === "children" ? 0 : 1, Number(e.target.value) || 0) });

  return (
    <>
      <button type="button" className="a-btn a-btn--sm" onClick={() => setOpen(true)} disabled={props.locked}>
        Change stay
      </button>
      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Change stay"
        description={
          inHouse
            ? "The guest is in house: only the departure date and party can change."
            : "Availability is re-checked when you save. The agreed rate is kept unless the room type changes."
        }
        onSubmit={save}
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setOpen(false)} disabled={pending}>
              Keep as is
            </button>
            <button type="submit" className="a-btn a-btn--primary" disabled={pending || !nights}>
              {pending && <span className="a-spin" aria-hidden="true" />}
              Save changes
            </button>
          </>
        }
      >
        <div className="a-grid-2">
          <label className="a-field a-span-2">
            <span className="a-label">Room type</span>
            <select className="a-input" value={form.room} disabled={inHouse} onChange={(e) => setForm({ ...form, room: e.target.value })}>
              {types.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name} — {formatTaka(t.price)}/night
                </option>
              ))}
            </select>
          </label>
          <label className="a-field">
            <span className="a-label">Arrive</span>
            <input type="date" className="a-input" value={form.checkIn} disabled={inHouse} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} required />
          </label>
          <label className="a-field">
            <span className="a-label">Depart</span>
            <input type="date" className="a-input" value={form.checkOut} min={form.checkIn} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} required />
          </label>
          <label className="a-field">
            <span className="a-label">Rooms</span>
            <input type="number" className="a-input" min={1} max={5} value={form.rooms} onChange={num("rooms")} disabled={inHouse} />
          </label>
          <div className="a-grid-2" style={{ gap: 12 }}>
            <label className="a-field">
              <span className="a-label">Adults</span>
              <input type="number" className="a-input" min={1} max={10} value={form.adults} onChange={num("adults")} />
            </label>
            <label className="a-field">
              <span className="a-label">Children</span>
              <input type="number" className="a-input" min={0} max={5} value={form.children} onChange={num("children")} />
            </label>
          </div>
        </div>
        <p className="a-hint" aria-live="polite">
          {nights ? (
            <>
              New room total <strong style={{ color: "var(--a-ink)" }}>{formatTaka(total)}</strong> · {formatTaka(rate)} × {nights}{" "}
              {nights === 1 ? "night" : "nights"}
              {form.rooms > 1 ? ` × ${form.rooms} rooms` : ""}
            </>
          ) : (
            "Departure must be after arrival."
          )}
        </p>
        {error && (
          <p className="a-error" role="alert">
            {error}
          </p>
        )}
      </Dialog>
    </>
  );
}

/* ---------------------------------------------------------- Payment */

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "bkash", label: "bKash" },
  { id: "nagad", label: "Nagad" },
  { id: "card", label: "Card (terminal)" },
  { id: "bank", label: "Bank transfer" },
  { id: "other", label: "Other" },
];

export function RecordPayment({ id, balance, disabled }: { id: string; balance: number; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(Math.max(0, balance)));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const res = await recordPayment(id, Math.round(Number(amount)), method, note);
      if (res.ok) {
        toast(res.message ?? "Saved");
        setOpen(false);
        setNote("");
      } else setError(res.message);
    });

  return (
    <>
      <button
        type="button"
        className="a-btn a-btn--primary a-btn--sm"
        onClick={() => {
          setAmount(String(Math.max(0, balance)));
          setError(null);
          setOpen(true);
        }}
        disabled={disabled}
      >
        Record payment
      </button>
      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Record payment"
        description="Money received at the desk. Card numbers are never stored — note the terminal slip or transaction ID instead."
        onSubmit={save}
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="a-btn a-btn--primary" disabled={pending || !(Number(amount) > 0)}>
              {pending && <span className="a-spin" aria-hidden="true" />}
              Record {Number(amount) > 0 ? formatTaka(Math.round(Number(amount))) : ""}
            </button>
          </>
        }
      >
        <div className="a-grid-2">
          <label className="a-field">
            <span className="a-label">Amount (৳)</span>
            <input className="a-input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} autoFocus />
            {balance > 0 && <span className="a-hint">Balance due {formatTaka(balance)}</span>}
          </label>
          <label className="a-field">
            <span className="a-label">Method</span>
            <select className="a-input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="a-field a-span-2">
            <span className="a-label">Reference (optional)</span>
            <input className="a-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. bKash TrxID 9A7K2…" />
          </label>
        </div>
        {error && (
          <p className="a-error" role="alert">
            {error}
          </p>
        )}
      </Dialog>
    </>
  );
}

/* ---------------------------------------------------------- Guest details */

type Details = {
  name: string;
  email: string | null;
  phone: string;
  arrival: string | null;
  requests: string | null;
  notes: string | null;
  airportPickup: boolean;
};

export function EditGuest({ id, initial, label = "Edit" }: { id: string; initial: Details; label?: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const res = await updateGuestDetails(id, form);
      if (res.ok) {
        toast(res.message ?? "Saved");
        setOpen(false);
      } else setError(res.message);
    });

  const field = (k: keyof Details) => ({
    value: (form[k] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  return (
    <>
      <button
        type="button"
        className="a-btn a-btn--sm"
        onClick={() => {
          setForm(initial);
          setError(null);
          setOpen(true);
        }}
      >
        {label}
      </button>
      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Guest details"
        onSubmit={save}
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="a-btn a-btn--primary" disabled={pending}>
              {pending && <span className="a-spin" aria-hidden="true" />}
              Save
            </button>
          </>
        }
      >
        <div className="a-grid-2">
          <label className="a-field a-span-2">
            <span className="a-label">Full name</span>
            <input className="a-input" required minLength={2} maxLength={120} {...field("name")} />
          </label>
          <label className="a-field">
            <span className="a-label">Phone</span>
            <input className="a-input" type="tel" required {...field("phone")} />
          </label>
          <label className="a-field">
            <span className="a-label">Email</span>
            <input className="a-input" type="email" {...field("email")} />
          </label>
          <label className="a-field a-span-2">
            <span className="a-label">Expected arrival</span>
            <input className="a-input" maxLength={60} {...field("arrival")} placeholder="e.g. 4 PM – 6 PM" />
          </label>
          <label className="a-field a-span-2">
            <span className="a-label">Guest&apos;s requests</span>
            <textarea className="a-input" maxLength={1000} {...field("requests")} />
          </label>
          <label className="a-field a-span-2">
            <span className="a-label">Internal notes</span>
            <textarea className="a-input" maxLength={2000} {...field("notes")} placeholder="Only staff see these" />
          </label>
          <label className="a-check a-span-2">
            <input type="checkbox" checked={form.airportPickup} onChange={(e) => setForm({ ...form, airportPickup: e.target.checked })} />
            Airport pickup requested
          </label>
        </div>
        {error && (
          <p className="a-error" role="alert">
            {error}
          </p>
        )}
      </Dialog>
    </>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="a-btn a-btn--sm" onClick={() => window.print()}>
      Print folio
    </button>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { applyPromo, confirmBooking, holdRooms } from "@/app/booking/actions";
import type { PaymentOption, Quote } from "@/lib/data/engine-types";
import type { HotelSettings } from "@/lib/data/types";
import { formatLong, formatRange, nightsBetween } from "@/lib/dates";
import { formatTaka, plural, roomKind } from "@/lib/format";
import { useHotelInfo } from "@/components/cms/HotelInfo";
import type { Photo } from "@/lib/photos";
import { LIMITS, guestsLabel, type Stay } from "@/lib/stay";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Info } from "../icons";
import PaymentDetails from "./PaymentDetails";
import StaySearch from "./StaySearch";
import styles from "./BookingFlow.module.css";

/** One room type as the database priced it for this search (one room, whole stay). */
export type BookRoom = {
  slug: string;
  name: string;
  tag: string;
  meta: string;
  sleeps: number;
  cover: Photo;
  available: number;
  /** Server-computed: one room for the whole stay, taxes included when set. */
  total: number;
  subtotal: number;
  /** Server-computed average per night (one room, before taxes). */
  perNight: number;
};

type Guest = {
  name: string;
  email: string;
  phone: string;
  country: string;
  arrival: string;
  requests: string;
  airportPickup: boolean;
};

type Errors = Partial<Record<keyof Guest | "room" | "agree" | "form" | "promo", string>>;

const STEPS = ["Rooms", "Guest details", "Review & pay", "Reserved"];

const COUNTRIES = [
  "Bangladesh", "India", "Nepal", "Bhutan", "Sri Lanka", "Myanmar", "Malaysia", "Singapore",
  "United Arab Emirates", "Saudi Arabia", "Qatar", "United Kingdom", "United States", "Other",
];

const ARRIVALS = ["Before 1 PM (early check-in)", "1 PM – 4 PM", "4 PM – 6 PM", "6 PM – 9 PM", "After 9 PM"];

const EMPTY_GUEST: Guest = { name: "", email: "", phone: "", country: "Bangladesh", arrival: "1 PM – 4 PM", requests: "", airportPickup: false };

const DRAFT_KEY = "bsq-guest-draft";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Codes that mean the rooms must be chosen again. */
const RESTART = new Set(["HOLD_EXPIRED", "HOLD_NOT_FOUND", "SOLD_OUT", "CAPACITY_BREACH", "IDEMPOTENCY_CONFLICT"]);

function validateGuest(g: Guest): Errors {
  const e: Errors = {};
  if (g.name.trim().length < 2) e.name = "Please enter the guest's full name.";
  if (!EMAIL_RE.test(g.email.trim())) e.email = "Please enter a valid email, e.g. name@example.com.";
  const digits = g.phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) e.phone = "Please enter a mobile number we can call, e.g. +880 17XX-XXXXXX.";
  if (g.requests.length > 1000) e.requests = "Please keep requests under 1,000 characters.";
  return e;
}

/** Mirrors the database: each room takes up to `sleeps` adults plus one child. */
function partyProblem(rooms: BookRoom[], sel: Record<string, number>, stay: Stay): string | null {
  const chosen = rooms.flatMap((r) => Array<number>(sel[r.slug] ?? 0).fill(r.sleeps));
  if (!chosen.length) return "Please choose at least one room.";
  const sleeps = chosen.reduce((s, n) => s + n, 0);
  if (stay.adults > sleeps || stay.adults + stay.children > sleeps + chosen.length)
    return `The rooms chosen sleep up to ${plural(sleeps, "adult")} and ${plural(chosen.length, "child", "children")}. Add a room, or choose a larger one, for ${guestsLabel({ ...stay, rooms: 1 })}.`;
  return null;
}

function Cover({ photo, sizes }: { photo: Photo; sizes: string }) {
  return photo.src ? (
    <Image src={photo.src} alt={photo.alt} fill sizes={sizes} />
  ) : (
    <>
      <div className="photo-plate" data-tone={photo.tone} role="img" aria-label={photo.alt} />
      <span className="photo-ref">Photograph to come</span>
    </>
  );
}

function useCountdown(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return null;
  const left = Math.max(0, Math.floor((Date.parse(until) - now) / 1000));
  return { left, label: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` };
}

type Props = {
  today: string;
  stay: Stay;
  rooms: BookRoom[];
  initialRoom: string | null;
  live: boolean;
  settings: HotelSettings;
};

export default function BookingFlow({ today, stay, rooms, initialRoom, live, settings }: Props) {
  const HOTEL = useHotelInfo();
  const RESERVATIONS = HOTEL.phones[0] ?? { href: "/contact", display: "the front desk" };
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<1 | -1>(1);
  const [sel, setSel] = useState<Record<string, number>>(() => {
    const r = rooms.find((x) => x.slug === initialRoom && x.available > 0);
    return r ? { [r.slug]: Math.min(stay.rooms, r.available) } : {};
  });
  const [guest, setGuest] = useState<Guest>(EMPTY_GUEST);
  const [errors, setErrors] = useState<Errors>({});
  const [agree, setAgree] = useState(false);
  const [option, setOption] = useState<PaymentOption>("pay_at_hotel");
  const [promo, setPromo] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [heldAt, setHeldAt] = useState<{ key: string; expiresAt: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const idempotency = useRef<string>("");
  const router = useRouter();
  const topRef = useRef<HTMLDivElement>(null);
  const countdown = useCountdown(heldAt?.expiresAt ?? null);

  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const selKey = JSON.stringify([stay, Object.entries(sel).filter(([, n]) => n > 0).sort()]);
  const roomCount = Object.values(sel).reduce((s, n) => s + n, 0);
  const chosen = rooms.filter((r) => (sel[r.slug] ?? 0) > 0);
  const estimate = chosen.reduce((s, r) => s + r.total * sel[r.slug], 0);
  const held = heldAt?.key === selKey && quote;
  const canAdvance = Boolean(quote?.advance_percent && quote.advance_due > 0);

  // Guest details survive a refresh within the session.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) setGuest({ ...EMPTY_GUEST, ...JSON.parse(saved) });
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(guest));
    } catch {}
  }, [guest]);

  // New dates or availability: keep only what can still be booked.
  useEffect(() => {
    setSel((s) => Object.fromEntries(Object.entries(s).map(([k, n]) => [k, Math.min(n, rooms.find((r) => r.slug === k)?.available ?? 0)])));
  }, [rooms]);

  const goTo = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
    setSummaryOpen(false);
    requestAnimationFrame(() => {
      const el = topRef.current;
      if (!el) return;
      if (window.__lenis) window.__lenis.scrollTo(el, { offset: -24 });
      else el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const focusFirstError = () => requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());

  const setQty = (slug: string, n: number) => {
    setSel((s) => ({ ...s, [slug]: n }));
    setErrors({});
    setNotice(null);
  };

  /** Step 1 → 2: hold the rooms in the database (or keep the current hold). */
  const nextFromRoom = () => {
    const problem = partyProblem(rooms, sel, stay);
    if (problem) {
      setErrors({ room: problem });
      return;
    }
    if (held && countdown && countdown.left > 0) return goTo(2);
    startTransition(async () => {
      const res = await holdRooms({
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        adults: stay.adults,
        children: stay.children,
        rooms: Object.fromEntries(Object.entries(sel).filter(([, n]) => n > 0)),
      });
      if (!res.ok) {
        setErrors({ room: res.message });
        if (res.code === "SOLD_OUT") router.refresh();
        return;
      }
      setQuote(res.quote);
      setHeldAt({ key: selKey, expiresAt: res.expiresAt });
      setPromo(res.quote.promotion?.code ?? "");
      idempotency.current = crypto.randomUUID();
      setErrors({});
      goTo(2);
    });
  };

  const nextFromGuest = () => {
    const e = validateGuest(guest);
    setErrors(e);
    if (Object.keys(e).length) return focusFirstError();
    goTo(3);
  };

  const restart = (message: string) => {
    setQuote(null);
    setHeldAt(null);
    setNotice(message);
    router.refresh();
    goTo(1);
  };

  const submitPromo = (code: string) =>
    startTransition(async () => {
      const res = await applyPromo(code);
      if (res.ok) {
        setQuote(res.quote);
        setPromo(res.quote.promotion?.code ?? "");
        setErrors((e) => ({ ...e, promo: undefined }));
      } else if (RESTART.has(res.code)) restart(res.message);
      else setErrors((e) => ({ ...e, promo: res.message }));
    });

  const confirm = () => {
    if (!agree) {
      setErrors({ agree: "Please agree to the cancellation policy and house rules." });
      return focusFirstError();
    }
    if (!quote) return goTo(1);
    setErrors({});
    startTransition(async () => {
      const res = await confirmBooking({
        ...guest,
        idempotencyKey: idempotency.current,
        quotedTotal: quote.total,
        paymentOption: canAdvance ? option : "pay_at_hotel",
        agree,
      });
      if (res.ok) {
        try {
          sessionStorage.removeItem(DRAFT_KEY);
        } catch {}
        router.replace("/booking/confirmation");
        return;
      }
      if (res.code === "PRICE_CHANGED" && res.quote) {
        setQuote(res.quote);
        setErrors({ form: `${res.message} New total: ${formatTaka(res.quote.total)}.` });
      } else if (RESTART.has(res.code)) restart(res.message);
      else setErrors({ form: res.message });
    });
  };

  const field = (key: keyof Guest) => ({
    id: `g-${key}`,
    value: guest[key] as string,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `g-${key}-err` : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setGuest((g) => ({ ...g, [key]: e.target.value }));
      if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
    },
  });

  const err = (key: keyof Errors) =>
    errors[key] ? (
      <span id={`g-${key}-err`} className="field-error" role="alert">
        {errors[key]}
      </span>
    ) : null;

  /* ---------------------------------------------------------- Summary */

  const lineGroups = useMemo(() => {
    if (!quote) return [];
    const groups = new Map<string, { name: string; count: number; subtotal: number; seasons: Set<string>; weekend: number }>();
    for (const l of quote.lines) {
      const g = groups.get(l.room_type) ?? { name: l.name, count: 0, subtotal: 0, seasons: new Set<string>(), weekend: 0 };
      g.count++;
      g.subtotal += l.subtotal;
      for (const n of l.nights) {
        if (n.kind === "season" && n.season) g.seasons.add(n.season);
        if (n.kind === "weekend" && g.count === 1) g.weekend++;
      }
      groups.set(l.room_type, g);
    }
    return [...groups.values()];
  }, [quote]);

  const summary = chosen.length > 0 && (
    <div className={styles.summaryBody}>
      <div className={`photo ${styles.summaryPhoto}`}>
        <Cover photo={chosen[0].cover} sizes="400px" />
      </div>
      <div className={styles.summaryText}>
        <p className="caps eyebrow">Your stay</p>
        <p className={styles.summaryName}>{chosen.length === 1 ? chosen[0].name : plural(roomCount, "room")}</p>
        <dl className={styles.lines}>
          <div>
            <dt>Dates</dt>
            <dd>{formatRange(stay.checkIn, stay.checkOut)}</dd>
          </div>
          <div>
            <dt>Guests</dt>
            <dd>{guestsLabel({ ...stay, rooms: roomCount })}</dd>
          </div>
          {held ? (
            <>
              {lineGroups.map((g, i) => (
                <div key={g.name} className={i === 0 ? styles.sep : undefined}>
                  <dt>
                    {g.name}
                    {g.count > 1 ? ` × ${g.count}` : ""}, {plural(nights, "night")}
                    {g.weekend > 0 && <span className="block text-[0.85em]">incl. {plural(g.weekend, "weekend night")}</span>}
                    {g.seasons.size > 0 && <span className="block text-[0.85em]">{[...g.seasons].join(", ")} rate</span>}
                  </dt>
                  <dd>{formatTaka(g.subtotal)}</dd>
                </div>
              ))}
              {quote.discount > 0 && (
                <div>
                  <dt>Promo {quote.promotion?.code}</dt>
                  <dd className={styles.discount}>−{formatTaka(quote.discount)}</dd>
                </div>
              )}
              <div>
                <dt>Breakfast</dt>
                <dd className={styles.included}>Included</dd>
              </div>
              {quote.service_charge_percent != null && (
                <div>
                  <dt>Service charge ({quote.service_charge_percent}%)</dt>
                  <dd>{formatTaka(quote.service_charge)}</dd>
                </div>
              )}
              {quote.vat_percent != null && (
                <div>
                  <dt>VAT ({quote.vat_percent}%)</dt>
                  <dd>{formatTaka(quote.vat)}</dd>
                </div>
              )}
              {quote.taxes_pending && (
                <div>
                  <dt>{quote.vat_percent == null && quote.service_charge_percent == null ? "VAT & service" : "Other charges"}</dt>
                  <dd className={styles.mutedDd}>At check-in</dd>
                </div>
              )}
              <div className={styles.totalLine}>
                <dt>{quote.taxes_pending ? "Room total" : "Total"}</dt>
                <dd key={quote.total}>{formatTaka(quote.total)}</dd>
              </div>
            </>
          ) : (
            <>
              {chosen.map((r, i) => (
                <div key={r.slug} className={i === 0 ? styles.sep : undefined}>
                  <dt>
                    {r.name}
                    {sel[r.slug] > 1 ? ` × ${sel[r.slug]}` : ""}
                  </dt>
                  <dd>{formatTaka(r.total * sel[r.slug])}</dd>
                </div>
              ))}
              <div className={styles.totalLine}>
                <dt>{settings.vat_percent != null && settings.service_charge_percent != null ? "Total" : "Room total"}</dt>
                <dd key={estimate}>{formatTaka(estimate)}</dd>
              </div>
            </>
          )}
        </dl>
        {held && countdown && (
          <p className={`${styles.holdNote} ${countdown.left < 120 ? styles.holdLate : ""}`} aria-live="off">
            {countdown.left > 0 ? (
              <>Rooms held for you · {countdown.label}</>
            ) : (
              <>Hold time is up. We&apos;ll re-check the rooms when you confirm.</>
            )}
          </p>
        )}
        <p className={styles.small}>
          Check-in from {HOTEL.checkIn} · Check-out until {HOTEL.checkOut}
        </p>
      </div>
    </div>
  );

  /* ---------------------------------------------------------- Render */

  return (
    <div ref={topRef}>
      <nav aria-label="Booking steps" className={styles.stepsNav}>
        <ol className={`wrap ${styles.steps}`}>
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const current = n === step;
            return (
              <li key={label} className={`${styles.stepItem} ${done ? styles.stepDone : ""} ${current ? styles.stepCurrent : ""}`}>
                <button type="button" className={styles.stepBtn} onClick={() => done && goTo(n)} disabled={!done} aria-current={current ? "step" : undefined}>
                  <span className={styles.stepDot}>{done ? <Check size={14} /> : n}</span>
                  <span className={styles.stepLabel}>{label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className={`wrap ${styles.layout}`}>
        <div className={styles.main}>
          {chosen.length > 0 && (
            <div className={styles.mobileSummary}>
              <button type="button" className={styles.mobileToggle} aria-expanded={summaryOpen} onClick={() => setSummaryOpen((o) => !o)}>
                <span>
                  {plural(roomCount, "room")} · {plural(nights, "night")}
                </span>
                <span className={styles.mobileTotal}>
                  {formatTaka(held ? quote.total : estimate)} <ChevronDown />
                </span>
              </button>
              <div className={`${styles.mobilePanel} ${summaryOpen ? styles.mobilePanelOpen : ""}`}>
                <div>{summary}</div>
              </div>
            </div>
          )}

          <div key={step} className={styles.stepBody} data-dir={dir}>
            {step === 1 && (
              <section aria-labelledby="s1">
                <p className="caps eyebrow">Step one</p>
                <h1 id="s1" className={`h2 ${styles.stepTitle}`}>
                  Choose your <em>rooms</em>
                </h1>

                <div className={styles.stayRow}>
                  <StaySearch
                    key={`${stay.checkIn}${stay.checkOut}${stay.adults}${stay.children}${stay.rooms}`}
                    today={today}
                    initial={stay}
                    action="/booking"
                    extraParams={chosen[0] ? { room: chosen[0].slug } : undefined}
                    variant="card"
                    submitLabel="Update dates & guests"
                  />
                </div>

                {notice && (
                  <p className={styles.formError} role="alert">
                    {notice}
                  </p>
                )}

                <div role="group" aria-label="Rooms" className={styles.roomList} aria-describedby={errors.room ? "room-err" : undefined}>
                  {rooms.map((r) => {
                    const n = sel[r.slug] ?? 0;
                    const max = Math.min(r.available, LIMITS.maxRooms - roomCount + n);
                    const soldOut = live && r.available < 1;
                    return (
                      <div key={r.slug} className={`${styles.roomOpt} ${styles.roomMulti} ${n > 0 ? styles.roomOn : ""} ${soldOut ? styles.roomOff : ""}`}>
                        <span className={`photo ${styles.roomPhoto}`}>
                          <Cover photo={r.cover} sizes="220px" />
                        </span>
                        <span className={styles.roomInfo}>
                          <span className={styles.roomTag}>{roomKind(r.tag)}</span>
                          <span className={styles.roomName}>{r.name}</span>
                          <span className={styles.roomMeta}>{r.meta}</span>
                          {live && !soldOut && r.available <= 2 && (
                            <span className={styles.few}>{r.available === 1 ? "Only one left for these dates" : "Two left for these dates"}</span>
                          )}
                          {soldOut && <span className={styles.few}>Fully booked for these dates</span>}
                        </span>
                        <span className={styles.roomPrice}>
                          <span className={styles.roomRate}>{formatTaka(r.perNight)}</span>
                          <span className={styles.roomPer}>avg. per night</span>
                          <span className={styles.roomTotal}>
                            {formatTaka(r.total)} for {plural(nights, "night")}
                          </span>
                        </span>
                        <span className={styles.qty}>
                          <button type="button" className={styles.qtyBtn} disabled={n < 1 || pending} onClick={() => setQty(r.slug, n - 1)} aria-label={`One fewer ${r.name}`}>
                            −
                          </button>
                          <span className={styles.qtyCount} aria-live="polite" aria-label={`${n} ${r.name} selected`}>
                            {n}
                          </span>
                          <button type="button" className={styles.qtyBtn} disabled={n >= max || pending} onClick={() => setQty(r.slug, n + 1)} aria-label={`Add a ${r.name}`}>
                            +
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
                {errors.room && (
                  <p id="room-err" className="field-error" role="alert">
                    {errors.room}
                  </p>
                )}

                <div className={styles.navRow}>
                  <Link href={chosen[0] ? `/rooms/${chosen[0].slug}` : "/rooms"} className="link-line">
                    <ArrowLeft /> Back to rooms
                  </Link>
                  <button type="button" className="btn" onClick={nextFromRoom} disabled={pending || !live}>
                    {pending ? "Checking availability…" : "Hold rooms & continue"}
                    {!pending && <ArrowRight />}
                  </button>
                </div>
                {!live && (
                  <p className={styles.small}>
                    Online booking is paused. Please call{" "}
                    <a href={RESERVATIONS.href} className="text-link">
                      {RESERVATIONS.display}
                    </a>
                    .
                  </p>
                )}
              </section>
            )}

            {step === 2 && (
              <section aria-labelledby="s2">
                <p className="caps eyebrow">Step two</p>
                <h1 id="s2" className={`h2 ${styles.stepTitle}`}>
                  Who&apos;s <em>staying?</em>
                </h1>
                <form
                  className={styles.form}
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    nextFromGuest();
                  }}
                >
                  <label className={`field ${styles.full}`}>
                    <span className="field-label">Full name *</span>
                    <input className="input" type="text" autoComplete="name" placeholder="As on your ID" {...field("name")} />
                    {err("name")}
                  </label>
                  <label className="field">
                    <span className="field-label">Email *</span>
                    <input className="input" type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" {...field("email")} />
                    {err("email")}
                  </label>
                  <label className="field">
                    <span className="field-label">Mobile *</span>
                    <input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="+880 17XX-XXXXXX" {...field("phone")} />
                    {err("phone")}
                  </label>
                  <label className="field">
                    <span className="field-label">Country</span>
                    <select className="input" autoComplete="country-name" {...field("country")}>
                      {COUNTRIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Expected arrival</span>
                    <select className="input" {...field("arrival")}>
                      {ARRIVALS.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </label>
                  <label className={`field ${styles.full}`}>
                    <span className={styles.labelRow}>
                      <span className="field-label">Special requests</span>
                      <span className={styles.counter}>{guest.requests.length} / 1000</span>
                    </span>
                    <textarea className="input" rows={4} maxLength={1000} placeholder="A celebration, a dietary need, a quiet room…" {...field("requests")} />
                    {err("requests")}
                  </label>
                  <label className={`check ${styles.full}`}>
                    <input type="checkbox" checked={guest.airportPickup} onChange={(e) => setGuest((g) => ({ ...g, airportPickup: e.target.checked }))} />
                    <span>I&apos;d like an airport pickup (extra charge — we&apos;ll call to arrange it)</span>
                  </label>

                  <div className={`${styles.navRow} ${styles.full}`}>
                    <button type="button" className="link-line" onClick={() => goTo(1)}>
                      <ArrowLeft /> Back
                    </button>
                    <button type="submit" className="btn">
                      Review booking
                      <ArrowRight />
                    </button>
                  </div>
                </form>
              </section>
            )}

            {step === 3 && quote && (
              <section aria-labelledby="s3">
                <p className="caps eyebrow">Step three</p>
                <h1 id="s3" className={`h2 ${styles.stepTitle}`}>
                  Review &amp; <em>confirm</em>
                </h1>

                <div className={styles.review}>
                  <div className={styles.reviewBlock}>
                    <div className={styles.reviewHead}>
                      <h2 className={styles.reviewTitle}>Your stay</h2>
                      <button type="button" className={styles.edit} onClick={() => goTo(1)}>
                        Edit
                      </button>
                    </div>
                    <dl className={styles.reviewList}>
                      <div>
                        <dt>{lineGroups.length > 1 || roomCount > 1 ? "Rooms" : "Room"}</dt>
                        <dd>
                          {lineGroups.map((g) => (
                            <span key={g.name} className="block">
                              {g.name}
                              {g.count > 1 ? ` × ${g.count}` : ""}
                            </span>
                          ))}
                        </dd>
                      </div>
                      <div>
                        <dt>Arrive</dt>
                        <dd>
                          {formatLong(stay.checkIn)}, from {HOTEL.checkIn}
                        </dd>
                      </div>
                      <div>
                        <dt>Depart</dt>
                        <dd>
                          {formatLong(stay.checkOut)}, by {HOTEL.checkOut}
                        </dd>
                      </div>
                      <div>
                        <dt>Guests</dt>
                        <dd>{guestsLabel({ ...stay, rooms: roomCount })}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className={styles.reviewBlock}>
                    <div className={styles.reviewHead}>
                      <h2 className={styles.reviewTitle}>Guest</h2>
                      <button type="button" className={styles.edit} onClick={() => goTo(2)}>
                        Edit
                      </button>
                    </div>
                    <dl className={styles.reviewList}>
                      <div>
                        <dt>Name</dt>
                        <dd>{guest.name}</dd>
                      </div>
                      <div>
                        <dt>Contact</dt>
                        <dd>
                          {guest.email}
                          <br />
                          {guest.phone}
                        </dd>
                      </div>
                      <div>
                        <dt>Arriving</dt>
                        <dd>{guest.arrival}</dd>
                      </div>
                      {guest.airportPickup && (
                        <div>
                          <dt>Pickup</dt>
                          <dd>Airport pickup requested</dd>
                        </div>
                      )}
                      {guest.requests.trim() && (
                        <div>
                          <dt>Requests</dt>
                          <dd className={styles.requests}>{guest.requests}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>

                <form
                  className={styles.promoRow}
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitPromo(promo);
                  }}
                >
                  <label className="field">
                    <span className="field-label">Promo code</span>
                    <input
                      className="input"
                      value={promo}
                      maxLength={20}
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={errors.promo ? true : undefined}
                      onChange={(e) => setPromo(e.target.value)}
                    />
                  </label>
                  <button type="submit" className="btn btn-ghost" disabled={pending || !promo.trim()}>
                    Apply
                  </button>
                  {quote.promotion && (
                    <button type="button" className="link-line" disabled={pending} onClick={() => submitPromo("")}>
                      Remove
                    </button>
                  )}
                </form>
                {err("promo")}
                {quote.promotion && (
                  <p className={styles.small}>
                    {quote.promotion.name}: you save {formatTaka(quote.discount)}.
                  </p>
                )}

                <h2 className={`h3 ${styles.payTitle}`}>How would you like to pay?</h2>
                <div className={styles.pays} role="radiogroup" aria-label="Payment">
                  <button type="button" role="radio" aria-checked={option === "pay_at_hotel" || !canAdvance} className={`${styles.pay} ${option === "pay_at_hotel" || !canAdvance ? styles.payOn : ""}`} onClick={() => setOption("pay_at_hotel")}>
                    <span className={styles.radio} aria-hidden="true" />
                    <span className={styles.payText}>
                      <span className={styles.payName}>Pay at the hotel</span>
                      <span className={styles.payNote}>
                        Nothing to pay now. Our front desk calls {settings.confirm_call_within ? `within ${settings.confirm_call_within}` : "shortly"} to confirm.
                      </span>
                    </span>
                  </button>
                  {canAdvance && (
                    <button type="button" role="radio" aria-checked={option === "advance"} className={`${styles.pay} ${option === "advance" ? styles.payOn : ""}`} onClick={() => setOption("advance")}>
                      <span className={styles.radio} aria-hidden="true" />
                      <span className={styles.payText}>
                        <span className={styles.payName}>
                          Pay a {quote.advance_percent}% advance: {formatTaka(quote.advance_due)}
                        </span>
                        <span className={styles.payNote}>By bKash, Nagad or bank transfer within 24 hours to secure the rooms; the rest at the hotel.</span>
                      </span>
                    </button>
                  )}
                </div>
                {(option === "advance" && canAdvance) ? (
                  <div className="mt-6">
                    <PaymentDetails />
                  </div>
                ) : (
                  <p className={styles.notice}>
                    <Info />
                    <span>
                      Nothing is charged online.{" "}
                      {quote.taxes_pending ? "VAT and service charge are added at check-in." : "The total above includes VAT and service charge."}
                    </span>
                  </p>
                )}

                <label className="check mt-6">
                  <input
                    type="checkbox"
                    checked={agree}
                    aria-invalid={errors.agree ? true : undefined}
                    onChange={(e) => {
                      setAgree(e.target.checked);
                      if (errors.agree) setErrors({});
                    }}
                  />
                  <span>
                    {settings.cancellation_policy
                      ? `I agree to the hotel's cancellation policy (${settings.cancellation_policy}) and house rules`
                      : "I agree to the hotel's cancellation policy and house rules"}{" "}
                    (
                    <Link href="/terms" target="_blank" className="text-link">
                      booking terms
                    </Link>
                    ).
                  </span>
                </label>
                {err("agree")}
                {errors.form && (
                  <p className={styles.formError} role="alert">
                    {errors.form}{" "}
                    <a href={RESERVATIONS.href} className="text-link">
                      Call {RESERVATIONS.display}
                    </a>
                  </p>
                )}

                <div className={styles.navRow}>
                  <button type="button" className="link-line" onClick={() => goTo(2)}>
                    <ArrowLeft /> Back
                  </button>
                  <button type="button" className="btn" onClick={confirm} disabled={pending}>
                    {pending ? "Reserving your rooms…" : `Reserve · ${formatTaka(quote.total)}`}
                    {!pending && <ArrowRight />}
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>

        <aside className={styles.side} aria-label="Your booking">
          {summary || (
            <div className={styles.summaryEmpty}>
              <p className="caps eyebrow">Your stay</p>
              <p className={styles.summaryName}>{formatRange(stay.checkIn, stay.checkOut)}</p>
              <p className={styles.small}>
                {plural(nights, "night")} · {guestsLabel(stay)}
              </p>
              <p className={styles.emptyHint}>Choose rooms to see your total.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

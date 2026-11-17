"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createBooking } from "@/app/booking/actions";
import type { HotelSettings } from "@/lib/data/types";
import { dayOrdinal, formatLong, formatRange, nightsBetween } from "@/lib/dates";
import { formatTaka, plural, roomKind } from "@/lib/format";
import { HOTEL, RESERVATIONS, WHATSAPP } from "@/lib/hotel";
import { downloadStayEvent } from "@/lib/ics";
import type { Photo } from "@/lib/photos";
import { nightsLabel, priceBreakdown, stayCost, taxNote, type RoomRates } from "@/lib/pricing";
import { guestsLabel, type Stay } from "@/lib/stay";
import { ArrowLeft, ArrowRight, Calendar, Check, ChevronDown, Info, Print } from "../icons";
import { WasPrice, WeekendNote } from "../ui/Rate";
import PaymentDetails from "./PaymentDetails";
import StaySearch from "./StaySearch";
import styles from "./BookingFlow.module.css";

export type BookRoom = {
  slug: string;
  name: string;
  tag: string;
  meta: string;
  rates: RoomRates;
  cover: Photo;
  available: number;
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

type Errors = Partial<Record<keyof Guest | "room" | "agree" | "form", string>>;

const STEPS = ["Room", "Guest details", "Review", "Requested"];

const COUNTRIES = [
  "Bangladesh", "India", "Nepal", "Bhutan", "Sri Lanka", "Myanmar", "Malaysia", "Singapore",
  "United Arab Emirates", "Saudi Arabia", "Qatar", "United Kingdom", "United States", "Other",
];

const ARRIVALS = ["Before 1 PM (early check-in)", "1 PM – 4 PM", "4 PM – 6 PM", "6 PM – 9 PM", "After 9 PM"];

const EMPTY_GUEST: Guest = {
  name: "",
  email: "",
  phone: "",
  country: "Bangladesh",
  arrival: "1 PM – 4 PM",
  requests: "",
  airportPickup: false,
};

const DRAFT_KEY = "bsq-guest-draft";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function validateGuest(g: Guest): Errors {
  const e: Errors = {};
  if (g.name.trim().length < 2) e.name = "Please enter the guest's full name.";
  if (!EMAIL_RE.test(g.email.trim())) e.email = "Please enter a valid email, e.g. name@example.com.";
  const digits = g.phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) e.phone = "Please enter a mobile number we can call, e.g. +880 17XX-XXXXXX.";
  if (g.requests.length > 1000) e.requests = "Please keep requests under 1,000 characters.";
  return e;
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

type Props = {
  today: string;
  stay: Stay;
  rooms: BookRoom[];
  initialRoom: string | null;
  live: boolean;
  settings: HotelSettings;
};

export default function BookingFlow({ today, stay, rooms, initialRoom, live, settings }: Props) {
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<1 | -1>(1);
  const [roomSlug, setRoomSlug] = useState<string | null>(initialRoom);
  const [guest, setGuest] = useState<Guest>(EMPTY_GUEST);
  const [errors, setErrors] = useState<Errors>({});
  const [agree, setAgree] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const topRef = useRef<HTMLDivElement>(null);

  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const room = rooms.find((r) => r.slug === roomSlug) ?? null;
  const cost = room ? stayCost(room.rates, stay.checkIn, stay.checkOut, stay.rooms) : null;
  const total = cost?.total ?? 0;
  const bill = priceBreakdown(total, settings);
  const canBook = (r: BookRoom) => !live || r.available >= stay.rooms;

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

  // If new dates make the chosen room unavailable, let go of it.
  useEffect(() => {
    if (room && !canBook(room)) setRoomSlug(null);
  }, [stay, rooms]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const focusFirstError = () =>
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());

  const nextFromRoom = () => {
    if (!room || !canBook(room)) {
      setErrors({ room: "Please choose a room to continue." });
      return;
    }
    setErrors({});
    goTo(2);
  };

  const nextFromGuest = () => {
    const e = validateGuest(guest);
    setErrors(e);
    if (Object.keys(e).length) {
      focusFirstError();
      return;
    }
    goTo(3);
  };

  const confirm = () => {
    if (!agree) {
      setErrors({ agree: "Please agree to the cancellation policy and house rules." });
      focusFirstError();
      return;
    }
    if (!room) return goTo(1);
    setErrors({});
    startTransition(async () => {
      const res = await createBooking({
        room: room.slug,
        ...stay,
        ...guest,
        agree,
      });
      if (res.ok) {
        try {
          sessionStorage.removeItem(DRAFT_KEY);
        } catch {}
        // The server set a private receipt cookie; the confirmation page reads
        // the booking back from the database.
        router.replace("/booking/confirmation");
      } else {
        setErrors({ form: res.message });
      }
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

  /* ---------------------------------------------------------- Steps 1–3 */

  const summary = room && (
    <div className={styles.summaryBody}>
      <div className={`photo ${styles.summaryPhoto}`}>
        <Cover photo={room.cover} sizes="400px" />
      </div>
      <div className={styles.summaryText}>
        <p className="caps eyebrow">Your stay</p>
        <p className={styles.summaryName}>{room.name}</p>
        <dl className={styles.lines}>
          <div>
            <dt>Dates</dt>
            <dd>{formatRange(stay.checkIn, stay.checkOut)}</dd>
          </div>
          <div>
            <dt>Guests</dt>
            <dd>{guestsLabel(stay)}</dd>
          </div>
          {cost!.lines.map((l, i) => (
            <div key={l.kind} className={i === 0 ? styles.sep : undefined}>
              <dt>
                {formatTaka(l.rate)} × {nightsLabel(l)}
                {stay.rooms > 1 ? ` × ${stay.rooms}` : ""}
              </dt>
              <dd>{formatTaka(l.rate * l.nights * stay.rooms)}</dd>
            </div>
          ))}
          <div>
            <dt>Breakfast</dt>
            <dd className={styles.included}>Included</dd>
          </div>
          {bill.service != null && (
            <div>
              <dt>Service charge ({settings.service_charge_percent}%)</dt>
              <dd>{formatTaka(bill.service)}</dd>
            </div>
          )}
          {bill.vat != null && (
            <div>
              <dt>VAT ({settings.vat_percent}%)</dt>
              <dd>{formatTaka(bill.vat)}</dd>
            </div>
          )}
          {!bill.taxesKnown && (
            <div>
              <dt>{bill.vat == null && bill.service == null ? "VAT & service" : "Other charges"}</dt>
              <dd className={styles.mutedDd}>At check-in</dd>
            </div>
          )}
          <div className={styles.totalLine}>
            <dt>{bill.taxesKnown ? "Total" : "Room total"}</dt>
            <dd key={bill.total}>{formatTaka(bill.total)}</dd>
          </div>
        </dl>
        <p className={styles.small}>
          Check-in from {HOTEL.checkIn} · Check-out until {HOTEL.checkOut}
        </p>
      </div>
    </div>
  );

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
                <button
                  type="button"
                  className={styles.stepBtn}
                  onClick={() => done && goTo(n)}
                  disabled={!done}
                  aria-current={current ? "step" : undefined}
                >
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
          {room && (
            <div className={styles.mobileSummary}>
              <button
                type="button"
                className={styles.mobileToggle}
                aria-expanded={summaryOpen}
                onClick={() => setSummaryOpen((o) => !o)}
              >
                <span>
                  {room.name} · {plural(nights, "night")}
                </span>
                <span className={styles.mobileTotal}>
                  {formatTaka(total)} <ChevronDown />
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
                  Choose your <em>room</em>
                </h1>

                <div className={styles.stayRow}>
                  <StaySearch
                    key={`${stay.checkIn}${stay.checkOut}${stay.adults}${stay.children}${stay.rooms}`}
                    today={today}
                    initial={stay}
                    action="/booking"
                    extraParams={roomSlug ? { room: roomSlug } : undefined}
                    variant="card"
                    submitLabel="Update dates & guests"
                  />
                </div>

                <div role="radiogroup" aria-label="Room" className={styles.roomList} aria-describedby={errors.room ? "room-err" : undefined}>
                  {rooms.map((r) => {
                    const ok = canBook(r);
                    const checked = r.slug === roomSlug;
                    return (
                      <button
                        key={r.slug}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        disabled={!ok}
                        className={`${styles.roomOpt} ${checked ? styles.roomOn : ""}`}
                        onClick={() => {
                          setRoomSlug(r.slug);
                          setErrors({});
                        }}
                      >
                        <span className={`photo ${styles.roomPhoto}`}>
                          <Cover photo={r.cover} sizes="220px" />
                        </span>
                        <span className={styles.roomInfo}>
                          <span className={styles.roomTag}>{roomKind(r.tag)}</span>
                          <span className={styles.roomName}>{r.name}</span>
                          <span className={styles.roomMeta}>{r.meta}</span>
                          {live && ok && r.available === 1 && <span className={styles.few}>Only one left for these dates</span>}
                          {!ok && <span className={styles.few}>Fully booked for these dates</span>}
                        </span>
                        <span className={styles.roomPrice}>
                          <span className={styles.roomRate}>
                            <WasPrice rates={r.rates} />
                            {formatTaka(r.rates.price_bdt)}
                          </span>
                          <span className={styles.roomPer}>per night</span>
                          <WeekendNote rates={r.rates} />
                          <span className={styles.roomTotal}>
                            {formatTaka(stayCost(r.rates, stay.checkIn, stay.checkOut, stay.rooms).total)} total
                          </span>
                        </span>
                        <span className={styles.radio} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
                {errors.room && (
                  <p id="room-err" className="field-error" role="alert">
                    {errors.room}
                  </p>
                )}

                <div className={styles.navRow}>
                  <Link href={roomSlug ? `/rooms/${roomSlug}` : "/rooms"} className="link-line">
                    <ArrowLeft /> Back to rooms
                  </Link>
                  <button type="button" className="btn" onClick={nextFromRoom}>
                    Continue to guest details
                    <ArrowRight />
                  </button>
                </div>
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
                    <input
                      className="input"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      {...field("email")}
                    />
                    {err("email")}
                  </label>
                  <label className="field">
                    <span className="field-label">Mobile *</span>
                    <input
                      className="input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+880 17XX-XXXXXX"
                      {...field("phone")}
                    />
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
                    <textarea
                      className="input"
                      rows={4}
                      maxLength={1000}
                      placeholder="A celebration, a dietary need, a quiet room…"
                      {...field("requests")}
                    />
                    {err("requests")}
                  </label>
                  <label className={`check ${styles.full}`}>
                    <input
                      type="checkbox"
                      checked={guest.airportPickup}
                      onChange={(e) => setGuest((g) => ({ ...g, airportPickup: e.target.checked }))}
                    />
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

            {step === 3 && room && (
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
                        <dt>Room</dt>
                        <dd>
                          {room.name}
                          {stay.rooms > 1 ? ` × ${stay.rooms}` : ""}
                        </dd>
                      </div>
                      <div>
                        <dt>Arrive</dt>
                        <dd>{formatLong(stay.checkIn)}, from {HOTEL.checkIn}</dd>
                      </div>
                      <div>
                        <dt>Depart</dt>
                        <dd>{formatLong(stay.checkOut)}, by {HOTEL.checkOut}</dd>
                      </div>
                      <div>
                        <dt>Guests</dt>
                        <dd>{guestsLabel(stay)}</dd>
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

                <h2 className={`h3 ${styles.payTitle}`}>Paying for your stay</h2>
                <p className={styles.notice}>
                  <Info />
                  <span>
                    Your room is held and our front desk will call you{" "}
                    {settings.confirm_call_within ? `within ${settings.confirm_call_within}` : "shortly"} to confirm. Nothing is charged online: pay at the hotel, or send an advance by bKash, Nagad or bank
                    transfer using the details below. {taxNote(settings)}
                  </span>
                </p>
                <PaymentDetails />

                <label className="check">
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
                    {pending ? "Sending your request…" : "Send booking request"}
                    {!pending && <ArrowRight />}
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>

        <aside className={styles.side} aria-label="Your booking">
          {summary ?? (
            <div className={styles.summaryEmpty}>
              <p className="caps eyebrow">Your stay</p>
              <p className={styles.summaryName}>{formatRange(stay.checkIn, stay.checkOut)}</p>
              <p className={styles.small}>
                {plural(nights, "night")} · {guestsLabel(stay)}
              </p>
              <p className={styles.emptyHint}>Choose a room to see your total.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

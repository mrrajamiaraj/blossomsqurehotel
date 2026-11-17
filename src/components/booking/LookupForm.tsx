"use client";

import { useRef, useState, useTransition } from "react";
import { lookupBooking } from "@/app/actions/guest";
import { Button } from "@/components/primitives/button";
import { Field, FieldError, FieldHint, FieldLabel, Input } from "@/components/primitives/field";
import ContactActions from "@/components/site/ContactActions";
import type { GuestBookingView } from "@/lib/data/types";
import { normaliseReference, validContact } from "@/lib/guest-services";
import { Search } from "../icons";
import BookingActions from "./BookingActions";
import GuestBooking from "./GuestBooking";
import PaymentDetails from "./PaymentDetails";

/**
 * Guest booking lookup: reference + the phone or email on the booking.
 * Results come only from the database; a mismatch never reveals whether the
 * reference exists.
 */
export default function LookupForm() {
  const [reference, setReference] = useState("");
  const [contact, setContact] = useState("");
  const [errors, setErrors] = useState<{ reference?: string; contact?: string }>({});
  const [message, setMessage] = useState<{ text: string; unavailable?: boolean } | null>(null);
  const [booking, setBooking] = useState<GuestBookingView | null>(null);
  const [pending, start] = useTransition();
  const resultRef = useRef<HTMLDivElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!normaliseReference(reference)) next.reference = "Enter your booking reference, e.g. BSQ-12345.";
    if (!validContact(contact)) next.contact = "Enter the phone number or email you booked with.";
    setErrors(next);
    setMessage(null);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    start(async () => {
      const res = await lookupBooking(reference, contact);
      if (res.ok) {
        setBooking(res.booking);
        requestAnimationFrame(() => resultRef.current?.focus());
      } else {
        setBooking(null);
        setMessage({ text: res.message, unavailable: res.unavailable });
      }
    });
  };

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
      <form onSubmit={submit} noValidate className="h-fit border border-line bg-ivory p-6 sm:p-10" aria-label="Find my booking">
        <div className="flex flex-col gap-6">
          <Field invalid={!!errors.reference} required>
            <FieldLabel>Booking reference</FieldLabel>
            <Input
              value={reference}
              onChange={(e) => {
                setReference(e.target.value);
                if (errors.reference) setErrors((x) => ({ ...x, reference: undefined }));
              }}
              placeholder="BSQ-12345"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={12}
            />
            <FieldHint>On your confirmation page and in our messages.</FieldHint>
            <FieldError>{errors.reference}</FieldError>
          </Field>
          <Field invalid={!!errors.contact} required>
            <FieldLabel>Phone or email</FieldLabel>
            <Input
              value={contact}
              onChange={(e) => {
                setContact(e.target.value);
                if (errors.contact) setErrors((x) => ({ ...x, contact: undefined }));
              }}
              autoComplete="email"
              inputMode="email"
              placeholder="The one you booked with"
              maxLength={200}
            />
            <FieldError>{errors.contact}</FieldError>
          </Field>
          <Button type="submit" loading={pending} block>
            {!pending && <Search size={16} />}
            {pending ? "Looking it up" : "Find my booking"}
          </Button>
        </div>
        <div aria-live="polite">
          {message && (
            <div className="mt-6 border-l-2 border-destructive bg-sand/60 p-4 text-sm text-ink-soft" role="alert">
              {message.text}
              {message.unavailable && <ContactActions className="mt-4" size="sm" email={false} message={`Hello, I'd like to check my booking ${reference.trim().toUpperCase()}.`} />}
            </div>
          )}
        </div>
      </form>

      <div ref={resultRef} tabIndex={-1} className="outline-none" aria-live="polite">
        {booking ? (
          <div className="flex flex-col gap-10">
            <div>
              <p className="caps eyebrow">Hello{booking.guest_name ? `, ${booking.guest_name}` : ""}</p>
              <h2 className="h2 mt-4">
                Your booking, <em>as we have it.</em>
              </h2>
            </div>
            <GuestBooking
              b={{
                reference: booking.reference,
                status: booking.status,
                roomName: booking.room_name,
                checkIn: booking.check_in,
                checkOut: booking.check_out,
                rooms: booking.rooms,
                adults: booking.adults,
                children: booking.children,
                totalBdt: booking.total_bdt,
                paidBdt: booking.amount_paid_bdt,
                paymentStatus: booking.payment_status,
              }}
            />
            {!["cancelled", "checked_out", "no_show"].includes(booking.status) && (
              <>
                <BookingActions reference={booking.reference} room={booking.room_name} checkIn={booking.check_in} checkOut={booking.check_out} />
                {booking.payment_status !== "paid" && (
                  <section aria-labelledby="pay-h">
                    <h3 id="pay-h" className="h3">
                      Sending an advance
                    </h3>
                    <div className="mt-5">
                      <PaymentDetails reference={booking.reference} />
                    </div>
                  </section>
                )}
              </>
            )}
            <div>
              <p className="caps text-bronze">Change or cancel</p>
              <p className="mt-2 text-ink-soft">Changes are made by our front desk. Call or message us with your reference.</p>
              <ContactActions className="mt-4" size="sm" message={`Hello, about my booking ${booking.reference}:`} />
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col justify-center border border-dashed border-line-strong p-8 text-ink-soft sm:p-12">
            <p className="h4 text-ink">Where to find your reference</p>
            <ul className="mt-4 flex list-disc flex-col gap-2 pl-5">
              <li>On the confirmation page after you booked online.</li>
              <li>In the call or message from our front desk.</li>
              <li>It looks like BSQ- followed by five digits.</li>
            </ul>
            <p className="mt-6">Booked by phone and don&apos;t have one? Call us and we&apos;ll help.</p>
          </div>
        )}
      </div>
    </div>
  );
}

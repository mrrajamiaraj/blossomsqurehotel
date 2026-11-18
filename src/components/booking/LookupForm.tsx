"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { lookupBooking } from "@/app/actions/guest";
import { Button } from "@/components/primitives/button";
import { Field, FieldError, FieldHint, FieldLabel, Input } from "@/components/primitives/field";
import ContactActions from "@/components/site/ContactActions";
import { normaliseReference, validContact } from "@/lib/guest-services";
import { Search } from "../icons";

/**
 * Guest booking lookup: reference + the phone or email on the booking.
 * A match opens /booking/manage for 30 minutes; a mismatch never reveals
 * whether the reference exists.
 */
export default function LookupForm() {
  const [reference, setReference] = useState("");
  const [contact, setContact] = useState("");
  const [errors, setErrors] = useState<{ reference?: string; contact?: string }>({});
  const [message, setMessage] = useState<{ text: string; unavailable?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

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
      if (res.ok) router.push("/booking/manage");
      else setMessage({ text: res.message, unavailable: res.unavailable });
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

      <div>
        {
          <div className="flex h-full flex-col justify-center border border-dashed border-line-strong p-8 text-ink-soft sm:p-12">
            <p className="h4 text-ink">Where to find your reference</p>
            <ul className="mt-4 flex list-disc flex-col gap-2 pl-5">
              <li>On the confirmation page after you booked online.</li>
              <li>In the call or message from our front desk.</li>
              <li>It looks like BSQ- followed by five digits.</li>
            </ul>
            <p className="mt-6">Booked by phone and don&apos;t have one? Call us and we&apos;ll help.</p>
          </div>
        }
      </div>
    </div>
  );
}

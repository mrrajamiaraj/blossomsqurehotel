"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { submitInquiry } from "@/app/actions/guest";
import { Button } from "@/components/primitives/button";
import { Field, FieldError, FieldHint, FieldLabel, Input, Textarea } from "@/components/primitives/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/menu";
import { toast } from "@/components/ui/Toaster";
import type { InquiryKind } from "@/lib/data/types";
import { INQUIRY_KINDS, inquiryText, validateInquiry, type InquiryErrors, type InquiryForm as Form } from "@/lib/guest-services";
import { HOTEL, WHATSAPP } from "@/lib/hotel";
import { cn } from "@/lib/utils";
import { Chat, Check, Mail } from "../icons";

const WITH_EVENT_DETAILS: InquiryKind[] = ["event", "group", "dining"];

type Props = {
  today: string;
  defaultKind?: InquiryKind;
  /** Limit the topic list (e.g. events page). */
  kinds?: InquiryKind[];
  title?: string;
  className?: string;
};

/**
 * Website enquiry. Validates in the browser, then on the server, then in the
 * database. If the enquiry store isn't connected yet, the guest is offered the
 * same message pre-filled for WhatsApp or email, so nothing is lost and no
 * success is shown that didn't happen.
 */
export default function InquiryForm({ today, defaultKind = "general", kinds, title = "Send us a message", className }: Props) {
  const [form, setForm] = useState<Form>({ kind: defaultKind, name: "", email: "", phone: "", message: "", eventDate: "", guests: "", website: "" });
  const [errors, setErrors] = useState<InquiryErrors>({});
  const [sent, setSent] = useState<{ reference: string; preview: boolean } | null>(null);
  const [offline, setOffline] = useState(false);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const headingId = useId();
  const options = kinds ? INQUIRY_KINDS.filter((k) => kinds.includes(k.id)) : INQUIRY_KINDS;
  const withEvent = WITH_EVENT_DETAILS.includes(form.kind as InquiryKind);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as keyof InquiryErrors] || ((key === "email" || key === "phone") && errors.contact))
      setErrors((er) => ({ ...er, [key]: undefined, ...(key === "email" || key === "phone" ? { contact: undefined } : {}) }));
  };

  const focusFirstError = () => requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const local = validateInquiry(form, today);
    setErrors(local);
    if (Object.keys(local).length) return focusFirstError();
    start(async () => {
      const res = await submitInquiry(form);
      if (res.ok) {
        setSent({ reference: res.reference, preview: res.preview });
        return;
      }
      setErrors(res.errors ?? {});
      setOffline(Boolean(res.offline));
      toast.error(res.message);
      if (res.errors) focusFirstError();
    });
  };

  if (sent) {
    const first = form.name.trim().split(/\s+/)[0];
    return (
      <div className={cn("border border-line bg-ivory p-8 sm:p-10", className)} role="status" aria-live="polite">
        <span className="grid size-12 place-items-center rounded-full border border-brass/60 text-primary">
          <Check size={20} />
        </span>
        <h2 className="h3 mt-6">Thank you{first ? `, ${first}` : ""}.</h2>
        <p className="mt-3 max-w-[48ch] text-ink-soft">
          We&apos;ve received your message (reference <strong className="font-semibold text-ink">{sent.reference}</strong>). Our team replies by phone or email,
          usually the same day. For anything urgent, call {HOTEL.phones[0].display}.
        </p>
        {sent.preview && <p className="mt-4 text-sm text-muted-foreground">Preview mode: saved to local preview data only.</p>}
      </div>
    );
  }

  const text = inquiryText(form);

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-labelledby={headingId} className={cn("border border-line bg-ivory p-6 sm:p-10", className)}>
      <h2 id={headingId} className="h3">
        {title}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Fields marked <span aria-hidden="true" className="text-brass">*</span>
        <span className="sr-only">with an asterisk</span> are required. We reply by phone or email.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {options.length > 1 && (
          <Field invalid={!!errors.kind} required className="sm:col-span-2">
            <FieldLabel>About</FieldLabel>
            <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{errors.kind}</FieldError>
          </Field>
        )}

        <Field invalid={!!errors.name} required className="sm:col-span-2">
          <FieldLabel>Your name</FieldLabel>
          <Input autoComplete="name" value={form.name} onChange={set("name")} maxLength={120} />
          <FieldError>{errors.name}</FieldError>
        </Field>

        <Field invalid={!!(errors.phone || errors.contact)}>
          <FieldLabel>Phone or WhatsApp</FieldLabel>
          <Input type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} placeholder="+880 17XX-XXXXXX" maxLength={40} />
          <FieldError>{errors.phone ?? errors.contact}</FieldError>
        </Field>

        <Field invalid={!!(errors.email || (errors.contact && !errors.phone))}>
          <FieldLabel>Email</FieldLabel>
          <Input type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="name@example.com" maxLength={200} />
          <FieldHint>Phone or email: one is enough.</FieldHint>
          <FieldError>{errors.email}</FieldError>
        </Field>

        {withEvent && (
          <>
            <Field invalid={!!errors.eventDate}>
              <FieldLabel>Date</FieldLabel>
              <Input type="date" min={today} value={form.eventDate} onChange={set("eventDate")} />
              <FieldError>{errors.eventDate}</FieldError>
            </Field>
            <Field invalid={!!errors.guests}>
              <FieldLabel>Number of guests</FieldLabel>
              <Input type="number" inputMode="numeric" min={1} max={2000} value={form.guests} onChange={set("guests")} />
              <FieldError>{errors.guests}</FieldError>
            </Field>
          </>
        )}

        <Field invalid={!!errors.message} required className="sm:col-span-2">
          <FieldLabel>Message</FieldLabel>
          <Textarea value={form.message} onChange={set("message")} maxLength={2000} rows={5} />
          <FieldHint>{form.message.length > 1600 ? `${2000 - form.message.length} characters left.` : "Dates, number of guests, anything we should know."}</FieldHint>
          <FieldError>{errors.message}</FieldError>
        </Field>

        {/* Honeypot, hidden from people and assistive tech. */}
        <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
          </label>
        </div>
      </div>

      {offline && (
        <div className="mt-8 border-l-2 border-brass bg-sand/60 p-5" role="note">
          <p className="text-sm text-ink-soft">Our online form isn&apos;t connected yet. Send the same message in one tap instead:</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild size="sm">
              <a href={`${WHATSAPP.href}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
                <Chat size={16} /> Send by WhatsApp
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`mailto:${HOTEL.email}?subject=${encodeURIComponent("Website enquiry")}&body=${encodeURIComponent(text)}`}>
                <Mail size={16} /> Send by email
              </a>
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-col-reverse gap-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[44ch] text-xs leading-relaxed text-muted-foreground">
          We use your details only to answer this message. See our{" "}
          <Link href="/privacy" className="text-link">
            privacy notice
          </Link>
          .
        </p>
        <Button type="submit" loading={pending}>
          {pending ? "Sending" : "Send message"}
        </Button>
      </div>
    </form>
  );
}

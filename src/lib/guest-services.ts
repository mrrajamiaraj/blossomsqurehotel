// Validation for the public enquiry and booking-lookup forms. Shared by the
// browser (instant feedback) and the server actions (the real check). The
// database functions validate again.

import type { InquiryInput, InquiryKind } from "./data/types";
import { isISODate } from "./dates";

export const INQUIRY_KINDS: { id: InquiryKind; label: string }[] = [
  { id: "general", label: "General question" },
  { id: "booking", label: "Rooms & reservations" },
  { id: "dining", label: "Restaurant & dining" },
  { id: "event", label: "Meeting or event" },
  { id: "group", label: "Group booking" },
  { id: "other", label: "Something else" },
];

export type InquiryForm = {
  kind: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  eventDate?: string;
  guests?: string;
  /** Honeypot: real people leave it empty. */
  website?: string;
};

export type InquiryErrors = Partial<Record<"name" | "email" | "phone" | "message" | "eventDate" | "guests" | "kind" | "contact", string>>;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Field errors for an enquiry, or {} when it's valid. */
export function validateInquiry(f: InquiryForm, today: string): InquiryErrors {
  const e: InquiryErrors = {};
  const name = f.name.trim();
  const email = f.email.trim();
  const phone = f.phone.trim();
  if (!INQUIRY_KINDS.some((k) => k.id === f.kind)) e.kind = "Choose what your message is about.";
  if (name.length < 2 || name.length > 120) e.name = "Please enter your name.";
  if (email && !EMAIL_RE.test(email)) e.email = "Please enter a valid email, e.g. name@example.com.";
  if (phone && (phoneDigits(phone).length < 8 || phoneDigits(phone).length > 15)) e.phone = "Please enter a phone number we can call, e.g. +880 17XX-XXXXXX.";
  if (!email && !phone) e.contact = "Add a phone number or an email so we can reply.";
  const message = f.message.trim();
  if (message.length < 10) e.message = "Please tell us a little more (at least 10 characters).";
  else if (message.length > 2000) e.message = "Please keep your message under 2,000 characters.";
  if (f.eventDate) {
    if (!isISODate(f.eventDate)) e.eventDate = "Please choose a date.";
    else if (f.eventDate < today) e.eventDate = "Please choose a date from today onwards.";
  }
  if (f.guests) {
    const n = Number(f.guests);
    if (!Number.isInteger(n) || n < 1 || n > 2000) e.guests = "Enter a number of guests between 1 and 2,000.";
  }
  return e;
}

export function toInquiryInput(f: InquiryForm): InquiryInput {
  return {
    kind: f.kind as InquiryKind,
    name: f.name.trim(),
    email: f.email.trim() || null,
    phone: f.phone.trim() || null,
    message: f.message.trim(),
    eventDate: f.eventDate || null,
    guests: f.guests ? Number(f.guests) : null,
  };
}

/** Plain-text version of an enquiry, for the WhatsApp / email fallback. */
export function inquiryText(f: InquiryForm): string {
  const kind = INQUIRY_KINDS.find((k) => k.id === f.kind)?.label ?? "Enquiry";
  return [
    `${kind} — from ${f.name.trim()}`,
    f.eventDate ? `Date: ${f.eventDate}` : null,
    f.guests ? `Guests: ${f.guests}` : null,
    "",
    f.message.trim(),
    "",
    [f.phone.trim(), f.email.trim()].filter(Boolean).join(" · "),
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/** "bsq 01234", "01234" and "BSQ-01234" all become "BSQ-01234"; anything else is null. */
export function normaliseReference(raw: string): string | null {
  const digits = raw.trim().toUpperCase().replace(/^BSQ[\s-]*/, "");
  return /^\d{5}$/.test(digits) ? `BSQ-${digits}` : null;
}

/** A phone number (8+ digits) or an email address. */
export function validContact(raw: string): boolean {
  const v = raw.trim();
  return EMAIL_RE.test(v) || phoneDigits(v).length >= 8;
}

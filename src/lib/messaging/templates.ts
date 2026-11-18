// Guest message templates: booking confirmation, cancellation, modification,
// pre-arrival reminder, payment confirmation / failure, enquiry
// acknowledgment. Pure functions of the snapshot the database stored when the
// message was queued (message_outbox.data) and the hotel's contact details.
// Every value from the database is escaped before it goes into HTML.

import type { HotelInfo } from "../cms/hotel-info";
import { LEDGER_LABEL } from "../payments/methods";

export const TEMPLATES = [
  "booking_confirmation",
  "booking_cancellation",
  "booking_modification",
  "pre_arrival",
  "payment_confirmation",
  "payment_failure",
  "inquiry_acknowledgment",
] as const;
export type TemplateId = (typeof TEMPLATES)[number];

export const TEMPLATE_LABEL: Record<TemplateId, string> = {
  booking_confirmation: "Booking confirmation",
  booking_cancellation: "Cancellation",
  booking_modification: "Booking change",
  pre_arrival: "Pre-arrival reminder",
  payment_confirmation: "Payment received",
  payment_failure: "Payment problem",
  inquiry_acknowledgment: "Enquiry received",
};

export type MessageData = {
  reference?: string;
  guest_name?: string;
  first_name?: string;
  name?: string;
  status?: string;
  stage?: "received" | "confirmed";
  check_in?: string;
  check_out?: string;
  nights?: number;
  adults?: number;
  children?: number;
  rooms?: string[];
  total?: number;
  paid?: number;
  balance?: number;
  discount?: number;
  taxes_pending?: boolean;
  payment_option?: string;
  advance_due?: number;
  payment_due_at?: string | null;
  cancel_reason?: string | null;
  reason?: string | null;
  airport_pickup?: boolean;
  arrival_window?: string | null;
  from?: { check_in?: string; check_out?: string; rooms?: number; total?: number };
  to?: { check_in?: string; check_out?: string; rooms?: number; total?: number };
  payment?: { amount?: number; method?: string; receipt_no?: string | null; reference?: string | null; reason?: string | null; received_at?: string };
  excerpt?: string;
  kind?: string;
  event_date?: string | null;
};

export type Rendered = { subject: string; text: string; html: string };

/* ---------------------------------------------------------------- helpers */

export const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const taka = (n: unknown) => `৳${Number(n ?? 0).toLocaleString("en-US")}`;

export function niceDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function niceDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" });
}

const party = (d: MessageData) =>
  `${d.adults ?? 1} adult${(d.adults ?? 1) === 1 ? "" : "s"}${d.children ? `, ${d.children} child${d.children === 1 ? "" : "ren"}` : ""}`;

const roomsLine = (d: MessageData) => {
  const r = d.rooms ?? [];
  if (!r.length) return "";
  const counts = new Map<string, number>();
  for (const n of r) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${c} × ${n}` : n)).join(", ");
};

type Row = [string, string];
type Block = { kind: "p"; text: string } | { kind: "rows"; rows: Row[] } | { kind: "note"; text: string } | { kind: "button"; label: string; href: string };

const p = (text: string): Block => ({ kind: "p", text });
const rows = (r: (Row | null | false | undefined)[]): Block => ({ kind: "rows", rows: r.filter(Boolean) as Row[] });
const note = (text: string): Block => ({ kind: "note", text });
const button = (label: string, href: string): Block => ({ kind: "button", label, href });

function stayRows(d: MessageData): (Row | null)[] {
  return [
    ["Booking", d.reference ?? ""],
    ["Arrive", `${niceDate(d.check_in)}`],
    ["Depart", `${niceDate(d.check_out)}`],
    ["Stay", `${d.nights ?? 0} night${d.nights === 1 ? "" : "s"} · ${party(d)}`],
    roomsLine(d) ? ["Room", roomsLine(d)] : null,
  ];
}

function moneyRows(d: MessageData): (Row | null)[] {
  return [
    [d.taxes_pending ? "Room total" : "Total", taka(d.total)],
    d.paid ? ["Paid", taka(d.paid)] : null,
    ["Balance", taka(d.balance ?? d.total)],
  ];
}

/* ---------------------------------------------------------------- layout */

function layout(o: { preheader: string; heading: string; blocks: Block[]; hotel: HotelInfo; siteUrl: string }): { html: string; text: string } {
  const { hotel } = o;
  const phone = hotel.phones[0]?.display ?? "";
  const body = o.blocks
    .map((b) => {
      if (b.kind === "p") return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#2b2925">${esc(b.text)}</p>`;
      if (b.kind === "note")
        return `<p style="margin:0 0 16px;padding:12px 14px;background:#f6f0e4;border-radius:8px;font-size:14px;line-height:1.55;color:#4a4237">${esc(b.text)}</p>`;
      if (b.kind === "button")
        return `<p style="margin:8px 0 20px"><a href="${esc(b.href)}" style="display:inline-block;padding:12px 22px;background:#2b2925;color:#fbf8f2;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600">${esc(b.label)}</a></p>`;
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:collapse;font-size:14px">${b.rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 0;border-bottom:1px solid #ebe3d3;color:#7a7062;width:38%">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #ebe3d3;color:#2b2925;text-align:right;font-weight:600">${esc(v)}</td></tr>`,
        )
        .join("")}</table>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(o.heading)}</title></head>
<body style="margin:0;padding:0;background:#f3eee4">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3eee4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fbf8f2;border-radius:16px;overflow:hidden;font-family:Helvetica,Arial,sans-serif">
<tr><td style="padding:28px 28px 8px;border-bottom:1px solid #ebe3d3">
<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#2b2925;letter-spacing:.02em">${esc(hotel.fullName)}</p>
<p style="margin:4px 0 16px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9a7b4f">${esc(hotel.shortAddress)}</p>
</td></tr>
<tr><td style="padding:24px 28px 8px">
<h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25;color:#2b2925">${esc(o.heading)}</h1>
${body}
</td></tr>
<tr><td style="padding:18px 28px 26px;background:#f6f0e4;font-size:13px;line-height:1.6;color:#6b6255">
Questions? Call ${esc(phone)}, WhatsApp <a href="${esc(hotel.whatsapp.href)}" style="color:#2b2925">${esc(hotel.whatsapp.display)}</a>, or reply to ${esc(hotel.email)}.<br>
${esc(hotel.address)}<br>
<a href="${esc(o.siteUrl)}" style="color:#2b2925">${esc(o.siteUrl.replace(/^https?:\/\//, ""))}</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    hotel.fullName,
    "",
    o.heading,
    "",
    ...o.blocks.map((b) =>
      b.kind === "rows" ? b.rows.map(([k, v]) => `${k}: ${v}`).join("\n") + "\n" : b.kind === "button" ? `${b.label}: ${b.href}\n` : `${b.text}\n`,
    ),
    `Questions? Call ${phone}, WhatsApp ${hotel.whatsapp.display}, or email ${hotel.email}.`,
    hotel.address,
    o.siteUrl,
  ].join("\n");

  return { html, text };
}

/* ---------------------------------------------------------------- templates */

export function renderEmail(template: TemplateId, d: MessageData, hotel: HotelInfo, siteUrl: string): Rendered {
  const site = siteUrl.replace(/\/$/, "");
  const manage = button("View your booking", `${site}/booking/lookup`);
  const first = d.first_name || d.guest_name?.split(" ")[0] || d.name?.split(" ")[0] || "there";
  let subject = "";
  let heading = "";
  let pre = "";
  let blocks: Block[] = [];

  switch (template) {
    case "booking_confirmation": {
      const confirmed = d.stage === "confirmed";
      subject = confirmed ? `Your stay is confirmed — ${d.reference}` : `We've received your booking — ${d.reference}`;
      heading = confirmed ? `Your stay is confirmed, ${first}.` : `Thank you, ${first}. We have your booking.`;
      pre = `${niceDate(d.check_in)} to ${niceDate(d.check_out)} · ${d.reference}`;
      blocks = [
        p(
          confirmed
            ? "We look forward to welcoming you to Cox's Bazar. Here are your booking details."
            : "Your rooms are reserved. Our front desk will call you shortly to confirm the details.",
        ),
        rows([...stayRows(d), ...moneyRows(d)]),
        d.payment_option === "advance" && (d.advance_due ?? 0) > (d.paid ?? 0)
          ? note(
              `Please send the ${taka(d.advance_due)} advance${d.payment_due_at ? ` by ${niceDateTime(d.payment_due_at)}` : ""}, then report the transaction ID on your booking page. Unpaid advance bookings are released automatically.`,
            )
          : null,
        d.taxes_pending ? note("VAT and service charge, where they apply, are added at check-in.") : null,
        p(`Check-in is from ${hotel.checkIn}; check-out by ${hotel.checkOut}. Keep your booking reference handy — you'll need it with your phone number or email to view or change your booking online.`),
        manage,
      ].filter(Boolean) as Block[];
      break;
    }
    case "booking_cancellation":
      subject = `Booking ${d.reference} is cancelled`;
      heading = `Your booking ${d.reference} has been cancelled.`;
      pre = `${niceDate(d.check_in)} to ${niceDate(d.check_out)}`;
      blocks = [
        p(`Hello ${first}, this confirms that your stay from ${niceDate(d.check_in)} to ${niceDate(d.check_out)} is cancelled.`),
        d.reason ? rows([["Reason", d.reason]]) : null,
        (d.paid ?? 0) > 0
          ? note(`You've paid ${taka(d.paid)} on this booking. Our team will contact you about the refund under our cancellation policy.`)
          : null,
        p("If this wasn't what you expected, or you'd like to book other dates, just call or WhatsApp us."),
      ].filter(Boolean) as Block[];
      break;
    case "booking_modification":
      subject = `Your booking ${d.reference} has changed`;
      heading = `Your booking has been updated.`;
      pre = `Now ${niceDate(d.to?.check_in ?? d.check_in)} to ${niceDate(d.to?.check_out ?? d.check_out)}`;
      blocks = [
        p(`Hello ${first}, we've updated booking ${d.reference}. Here's how it stands now.`),
        rows([...stayRows(d), ...moneyRows(d)]),
        d.from?.check_in && (d.from.check_in !== d.to?.check_in || d.from.check_out !== d.to?.check_out)
          ? note(`Previously: ${niceDate(d.from.check_in)} to ${niceDate(d.from.check_out)}${d.from.total ? `, ${taka(d.from.total)}` : ""}.`)
          : null,
        p("If anything here looks wrong, please let us know straight away."),
        manage,
      ].filter(Boolean) as Block[];
      break;
    case "pre_arrival":
      subject = `See you tomorrow, ${first} — ${d.reference}`;
      heading = `We're getting your room ready, ${first}.`;
      pre = `Arriving ${niceDate(d.check_in)} · check-in from ${hotel.checkIn}`;
      blocks = [
        p(`You arrive tomorrow, ${niceDate(d.check_in)}. Check-in is from ${hotel.checkIn}.`),
        rows([...stayRows(d), (d.balance ?? 0) > 0 ? ["To pay at the hotel", taka(d.balance)] : ["Balance", "Fully paid"]]),
        hotel.arriving ? p(hotel.arriving) : null,
        d.airport_pickup ? note("You asked for an airport pickup. We'll call to confirm the time and driver.") : null,
        button("Get directions", hotel.mapUrl),
        p("Running late or arriving very early? Send us a WhatsApp message and we'll plan for it."),
      ].filter(Boolean) as Block[];
      break;
    case "payment_confirmation": {
      const pay = d.payment ?? {};
      subject = `Payment received${pay.receipt_no ? ` — ${pay.receipt_no}` : ""} (${d.reference})`;
      heading = `Thank you — we've received ${taka(pay.amount)}.`;
      pre = `${taka(pay.amount)} for booking ${d.reference}`;
      blocks = [
        rows([
          pay.receipt_no ? ["Receipt", pay.receipt_no] : null,
          ["Booking", d.reference ?? ""],
          ["Amount", taka(pay.amount)],
          ["Method", LEDGER_LABEL[pay.method ?? ""] ?? pay.method ?? ""],
          pay.reference ? ["Transaction", pay.reference] : null,
          ["Booking total", taka(d.total)],
          ["Paid so far", taka(d.paid)],
          ["Balance", taka(d.balance)],
        ]),
        p((d.balance ?? 0) > 0 ? `The remaining ${taka(d.balance)} can be paid at check-in.` : "Your booking is fully paid."),
        button("View receipt and invoice", `${site}/booking/lookup`),
      ];
      break;
    }
    case "payment_failure": {
      const pay = d.payment ?? {};
      subject = `We couldn't confirm your payment for ${d.reference}`;
      heading = `We couldn't confirm your payment.`;
      pre = `${taka(pay.amount)} via ${LEDGER_LABEL[pay.method ?? ""] ?? pay.method}`;
      blocks = [
        p(`Hello ${first}, we couldn't confirm a payment of ${taka(pay.amount)} for booking ${d.reference}. No money has been added to your booking.`),
        rows([
          ["Method", LEDGER_LABEL[pay.method ?? ""] ?? pay.method ?? ""],
          pay.reference ? ["Transaction", pay.reference] : null,
          pay.reason ? ["Reason", humanReason(pay.reason)] : null,
        ]),
        p("If money left your account, please send us the transaction details on WhatsApp and we'll check it. You can also try again from your booking page, or pay at the hotel."),
        manage,
      ];
      break;
    }
    case "inquiry_acknowledgment":
      subject = `We've received your message (${d.reference})`;
      heading = `Thank you, ${first}. We'll be in touch.`;
      pre = `Reference ${d.reference}`;
      blocks = [
        p("Your message has reached our front desk. We usually reply within a few hours, between 8 am and 10 pm."),
        rows([["Reference", d.reference ?? ""], d.event_date ? ["Date", niceDate(d.event_date)] : null, d.excerpt ? ["Your message", truncate(d.excerpt, 160)] : null]),
        p("For anything urgent, call or WhatsApp us directly."),
      ];
      break;
  }

  const { html, text } = layout({ preheader: pre, heading, blocks, hotel, siteUrl: site });
  return { subject, html, text };
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function humanReason(r: string): string {
  if (r === "amount_mismatch") return "The amount paid didn't match the amount requested";
  if (r === "declined") return "The payment was declined";
  return r;
}

/* ------------------------------------------------------------- WhatsApp */

/**
 * WhatsApp Business Platform messages must use templates approved in
 * WhatsApp Manager. These are the body parameters we send, in order; the
 * approved template text must use {{1}}…{{n}} in this order (docs/MESSAGING.md
 * lists the exact text to submit). Payment failures and enquiry
 * acknowledgments go by email only.
 */
export const WHATSAPP_TEMPLATES: Partial<Record<TemplateId, { env: string; params: (d: MessageData) => string[] }>> = {
  booking_confirmation: {
    env: "WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION",
    params: (d) => [d.first_name ?? "Guest", d.reference ?? "", niceDate(d.check_in), niceDate(d.check_out), d.stage === "confirmed" ? "confirmed" : "received"],
  },
  booking_cancellation: {
    env: "WHATSAPP_TEMPLATE_BOOKING_CANCELLATION",
    params: (d) => [d.first_name ?? "Guest", d.reference ?? "", niceDate(d.check_in)],
  },
  booking_modification: {
    env: "WHATSAPP_TEMPLATE_BOOKING_MODIFICATION",
    params: (d) => [d.first_name ?? "Guest", d.reference ?? "", niceDate(d.check_in), niceDate(d.check_out), taka(d.total)],
  },
  pre_arrival: {
    env: "WHATSAPP_TEMPLATE_PRE_ARRIVAL",
    params: (d) => [d.first_name ?? "Guest", niceDate(d.check_in), d.reference ?? "", taka(d.balance)],
  },
  payment_confirmation: {
    env: "WHATSAPP_TEMPLATE_PAYMENT_CONFIRMATION",
    params: (d) => [d.first_name ?? "Guest", taka(d.payment?.amount), d.reference ?? "", taka(d.balance)],
  },
};

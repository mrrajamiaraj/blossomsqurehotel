import { formatTaka } from "../format";
import { STATUS_LABEL } from "../data/rules";
import type { BookingEvent, BookingStatus } from "../data/types";

const METHOD: Record<string, string> = { cash: "cash", bkash: "bKash", nagad: "Nagad", card: "card", bank: "bank transfer", online: "online payment", other: "other" };
const SOURCE: Record<string, string> = { website: "the website", phone: "phone", walk_in: "walk-in", other: "other" };

/** One readable line for an audit-trail entry. */
export function describeEvent(e: BookingEvent): string {
  const d = e.detail as Record<string, unknown>;
  switch (e.kind) {
    case "created":
      return `Booking received via ${SOURCE[String(d.source)] ?? "the desk"}${d.status === "confirmed" ? ", confirmed on entry" : ""}`;
    case "status": {
      const to = STATUS_LABEL[d.to as BookingStatus] ?? String(d.to);
      return `${to}${d.reason ? ` — “${String(d.reason)}”` : ""}`;
    }
    case "room":
      return d.to ? `Room ${String(d.to)} assigned${d.from ? ` (was ${String(d.from)})` : ""}` : `Room ${String(d.from ?? "")} unassigned`;
    case "modified": {
      const to = d.to as Record<string, unknown> | undefined;
      return to ? `Stay changed to ${String(to.check_in)} → ${String(to.check_out)}, total ${formatTaka(Number(to.total))}` : "Stay changed";
    }
    case "payment": {
      const m = METHOD[String(d.method)] ?? String(d.method ?? "other");
      if (d.reported != null) return `Guest reported ${formatTaka(Number(d.reported))} by ${m} (ref ${String(d.reference ?? "")}) — to verify`;
      if (d.verified != null) return `${formatTaka(Number(d.verified))} by ${m} verified as received${d.note ? ` — ${String(d.note)}` : ""}`;
      if (d.rejected != null) return `${formatTaka(Number(d.rejected))} by ${m} not received${d.note ? ` — “${String(d.note)}”` : ""}`;
      if (d.voided != null) return `Payment of ${formatTaka(Number(d.voided))} voided — “${String(d.reason ?? "")}”`;
      if (d.refund_requested != null) return `Refund of ${formatTaka(Number(d.refund_requested))} requested — “${String(d.reason ?? "")}”`;
      if (d.refund) return `Refund of ${formatTaka(Number(d.amount))} ${String(d.refund)}`;
      if (d.gateway)
        return d.result === "succeeded"
          ? `${formatTaka(Number(d.amount))} paid online via ${String(d.gateway)}`
          : d.result === "amount_mismatch"
            ? `Online payment via ${String(d.gateway)} refused: amount ${formatTaka(Number(d.got))} instead of ${formatTaka(Number(d.expected))}`
            : `Online payment via ${String(d.gateway)} ${String(d.result)}`;
      return `${formatTaka(Number(d.amount))} received by ${m}${d.note ? ` — ${String(d.note)}` : ""}`;
    }
    case "message":
      return `Guest message resent (${String(d.resent ?? "").replace(/_/g, " ")}, ${String(d.channel ?? "")})`;
    case "consent":
      return d.whatsapp ? "Guest turned on WhatsApp updates" : "Guest turned off WhatsApp updates";
    case "details":
      return "Guest details or notes updated";
    default:
      return "Updated";
  }
}

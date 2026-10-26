import { formatTaka } from "../format";
import { STATUS_LABEL } from "../data/rules";
import type { BookingEvent, BookingStatus } from "../data/types";

const METHOD: Record<string, string> = { cash: "cash", bkash: "bKash", nagad: "Nagad", card: "card", bank: "bank transfer", other: "other" };
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
    case "payment":
      return `${formatTaka(Number(d.amount))} received by ${METHOD[String(d.method)] ?? "other"}${d.note ? ` — ${String(d.note)}` : ""}`;
    case "details":
      return "Guest details or notes updated";
    default:
      return "Updated";
  }
}

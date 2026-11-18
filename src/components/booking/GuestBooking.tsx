import { Badge } from "@/components/primitives/surface";
import { Money } from "@/components/system/RoomCard";
import type { ManageView } from "@/lib/data/engine-types";
import type { BookingStatus, PaymentStatus } from "@/lib/data/types";
import { formatLong, nightsBetween } from "@/lib/dates";
import { formatTaka, plural } from "@/lib/format";
import { DEFAULT_HOTEL_INFO, type HotelInfo } from "@/lib/cms/hotel-info";
import { guestsLabel } from "@/lib/stay";
import { cn } from "@/lib/utils";

/** What a guest sees about their own booking. Every field comes from the database. */
export type GuestBookingData = {
  reference: string;
  status: BookingStatus | null;
  roomName: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
  totalBdt: number | null;
  paidBdt: number | null;
  paymentStatus: PaymentStatus | null;
  /** The database's price breakdown, when known. */
  breakdown?: { subtotal: number; discount: number; service: number; vat: number; taxesPending: boolean };
  advanceDue?: number;
  paymentDueAt?: string | null;
};

/** Groups the booking's lines: "Deluxe Couple × 2, Premium Twin". */
export function roomsLabel(rooms: { room_type: string }[]): string {
  const counts = new Map<string, number>();
  for (const r of rooms) counts.set(r.room_type, (counts.get(r.room_type) ?? 0) + 1);
  return [...counts].map(([name, n]) => (n > 1 ? `${name} × ${n}` : name)).join(", ");
}

export function fromManageView(v: ManageView): GuestBookingData {
  return {
    reference: v.reference,
    status: v.status,
    roomName: roomsLabel(v.rooms ?? []),
    checkIn: v.check_in,
    checkOut: v.check_out,
    rooms: v.rooms?.length ?? 1,
    adults: v.adults,
    children: v.children,
    totalBdt: v.total,
    paidBdt: v.paid,
    paymentStatus: v.payment_status,
    breakdown: { subtotal: v.subtotal, discount: v.discount, service: v.service_charge, vat: v.vat, taxesPending: v.taxes_pending },
    advanceDue: v.advance_due,
    paymentDueAt: v.payment_due_at,
  };
}

export const STATUS_COPY: Record<BookingStatus, { label: string; tone: "gold" | "pine" | "neutral" | "danger" | "success"; note: string }> = {
  pending: { label: "Awaiting confirmation", tone: "gold", note: "Your rooms are reserved. Our front desk will call to confirm." },
  confirmed: { label: "Confirmed", tone: "success", note: "Your booking is confirmed. We look forward to welcoming you." },
  checked_in: { label: "In house", tone: "pine", note: "Welcome. The front desk is here around the clock." },
  checked_out: { label: "Stay completed", tone: "neutral", note: "Thank you for staying with us." },
  cancelled: { label: "Cancelled", tone: "danger", note: "This booking was cancelled. Call us if that's unexpected." },
  no_show: { label: "Not arrived", tone: "danger", note: "We didn't see you on arrival day. Please call us." },
};

const PAYMENT_COPY: Record<PaymentStatus, string> = { unpaid: "Nothing paid yet", partial: "Advance received", paid: "Paid in full" };

const dueTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export default function GuestBooking({ b, className, hotel = DEFAULT_HOTEL_INFO }: { b: GuestBookingData; className?: string; hotel?: Pick<HotelInfo, "checkIn" | "checkOut"> }) {
  const HOTEL = hotel;
  const nights = nightsBetween(b.checkIn, b.checkOut);
  const status = b.status ? STATUS_COPY[b.status] : null;
  const k = b.breakdown;
  const rows: [string, React.ReactNode][] = [
    [b.rooms > 1 ? "Rooms" : "Room", b.breakdown ? b.roomName : `${b.roomName}${b.rooms > 1 ? ` × ${b.rooms}` : ""}`],
    ["Arrive", `${formatLong(b.checkIn)}, from ${HOTEL.checkIn}`],
    ["Depart", `${formatLong(b.checkOut)}, by ${HOTEL.checkOut}`],
    ["Stay", `${plural(nights, "night")} · ${guestsLabel({ adults: b.adults, children: b.children, rooms: b.rooms })}`],
  ];
  if (b.totalBdt != null)
    rows.push([
      k && !k.taxesPending ? "Total" : "Room total",
      <span key="t" className="flex flex-col">
        <span className="font-serif text-[1.6rem] leading-none text-ink">
          <Money amount={b.totalBdt} />
        </span>
        <span className="mt-1 text-sm text-muted-foreground">
          {k && k.discount > 0 ? `${formatTaka(k.subtotal)} less ${formatTaka(k.discount)} promo · ` : ""}
          {k && !k.taxesPending
            ? `Includes service ${formatTaka(k.service)} and VAT ${formatTaka(k.vat)} · breakfast included`
            : "Breakfast included · VAT & service at check-in"}
        </span>
      </span>,
    ]);
  if (b.paymentStatus && b.paidBdt != null)
    rows.push([
      "Payment",
      <span key="p" className="flex flex-col">
        <span>
          {PAYMENT_COPY[b.paymentStatus]}
          {b.paidBdt > 0 ? ` (${formatTaka(b.paidBdt)})` : ""}
        </span>
        {b.advanceDue != null && b.advanceDue > b.paidBdt && b.paymentDueAt && (
          <span className="mt-1 text-sm text-destructive">
            Advance of {formatTaka(b.advanceDue)} due by {dueTime(b.paymentDueAt)}, or the booking is released.
          </span>
        )}
      </span>,
    ]);

  return (
    <div className={cn("border border-line bg-ivory", className)}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-5 sm:px-8">
        <p className="flex flex-col">
          <span className="caps text-bronze">Reference</span>
          <span className="font-serif text-[1.7rem] leading-tight tracking-wide text-ink">{b.reference}</span>
        </p>
        {status && <Badge tone={status.tone}>{status.label}</Badge>}
      </div>
      <dl className="divide-y divide-line px-6 sm:px-8">
        {rows.map(([key, v]) => (
          <div key={key} className="grid gap-1 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
            <dt className="caps pt-1 text-muted-foreground">{key}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {status && <p className="border-t border-line bg-sand/50 px-6 py-4 text-sm text-ink-soft sm:px-8">{status.note}</p>}
    </div>
  );
}

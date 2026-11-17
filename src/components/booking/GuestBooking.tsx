import { Badge } from "@/components/primitives/surface";
import { Money } from "@/components/system/RoomCard";
import type { BookingStatus, PaymentStatus } from "@/lib/data/types";
import { formatLong, nightsBetween } from "@/lib/dates";
import { plural } from "@/lib/format";
import { HOTEL } from "@/lib/hotel";
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
};

export const STATUS_COPY: Record<BookingStatus, { label: string; tone: "gold" | "pine" | "neutral" | "danger" | "success"; note: string }> = {
  pending: { label: "Awaiting confirmation", tone: "gold", note: "Your room is held. Our front desk will call to confirm." },
  confirmed: { label: "Confirmed", tone: "success", note: "Your booking is confirmed. We look forward to welcoming you." },
  checked_in: { label: "In house", tone: "pine", note: "Welcome. The front desk is here around the clock." },
  checked_out: { label: "Stay completed", tone: "neutral", note: "Thank you for staying with us." },
  cancelled: { label: "Cancelled", tone: "danger", note: "This booking was cancelled. Call us if that's unexpected." },
  no_show: { label: "Not arrived", tone: "danger", note: "We didn't see you on arrival day. Please call us." },
};

const PAYMENT_COPY: Record<PaymentStatus, string> = { unpaid: "Nothing paid yet", partial: "Advance received", paid: "Paid in full" };

export default function GuestBooking({ b, className }: { b: GuestBookingData; className?: string }) {
  const nights = nightsBetween(b.checkIn, b.checkOut);
  const status = b.status ? STATUS_COPY[b.status] : null;
  const rows: [string, React.ReactNode][] = [
    ["Room", `${b.roomName}${b.rooms > 1 ? ` × ${b.rooms}` : ""}`],
    ["Arrive", `${formatLong(b.checkIn)}, from ${HOTEL.checkIn}`],
    ["Depart", `${formatLong(b.checkOut)}, by ${HOTEL.checkOut}`],
    ["Stay", `${plural(nights, "night")} · ${guestsLabel({ adults: b.adults, children: b.children, rooms: b.rooms })}`],
  ];
  if (b.totalBdt != null)
    rows.push([
      "Room total",
      <span key="t" className="flex flex-col">
        <span className="font-serif text-[1.6rem] leading-none text-ink">
          <Money amount={b.totalBdt} />
        </span>
        <span className="mt-1 text-sm text-muted-foreground">Breakfast included · VAT &amp; service at check-in</span>
      </span>,
    ]);
  if (b.paymentStatus && b.paidBdt != null)
    rows.push(["Payment", `${PAYMENT_COPY[b.paymentStatus]}${b.paidBdt > 0 ? ` (৳${b.paidBdt.toLocaleString("en-US")})` : ""}`]);

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
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
            <dt className="caps pt-1 text-muted-foreground">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {status && <p className="border-t border-line bg-sand/50 px-6 py-4 text-sm text-ink-soft sm:px-8">{status.note}</p>}
    </div>
  );
}

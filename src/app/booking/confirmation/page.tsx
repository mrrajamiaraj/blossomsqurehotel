import type { Metadata } from "next";
import Link from "next/link";
import BookingActions from "@/components/booking/BookingActions";
import GuestBooking, { type GuestBookingData } from "@/components/booking/GuestBooking";
import PaymentDetails from "@/components/booking/PaymentDetails";
import { ArrowRight, Info } from "@/components/icons";
import { Button } from "@/components/primitives/button";
import ContactActions from "@/components/site/ContactActions";
import { readReceipt } from "@/lib/booking-receipt";
import { getPublicRepo } from "@/lib/data";
import { errorCode } from "@/lib/data/errors";
import { dayOrdinal } from "@/lib/dates";
import { getRooms, getSettings } from "@/lib/rooms";

export const metadata: Metadata = {
  title: "Booking request received",
  robots: { index: false, follow: false },
};

/**
 * Shown right after a website booking. It reads the booking back from the
 * database (reference + phone from the private receipt cookie), so what the
 * guest sees is what the hotel has. Without a receipt it shows nothing
 * booking-like and points to Find my booking.
 */
export default async function ConfirmationPage() {
  const receipt = await readReceipt();

  if (!receipt) {
    return (
      <section className="wrap max-w-3xl py-[clamp(64px,10vw,140px)]">
        <p className="caps eyebrow">Booking</p>
        <h1 className="h2 mt-5">
          No recent booking <em>on this device.</em>
        </h1>
        <p className="lede mt-5">
          This page shows a booking for two hours after it&apos;s made. To see an earlier booking, look it up with your reference and the
          phone or email you booked with.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/booking/lookup">
              Find my booking <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/booking">Make a booking</Link>
          </Button>
        </div>
      </section>
    );
  }

  const [rooms, settings] = await Promise.all([getRooms(), getSettings()]);
  const repo = getPublicRepo();
  let data: GuestBookingData | null = null;
  let verified = false;
  try {
    const b = repo ? await repo.lookupBooking(receipt.reference, receipt.phone) : null;
    if (b) {
      verified = true;
      data = {
        reference: b.reference,
        status: b.status,
        roomName: b.room_name,
        checkIn: b.check_in,
        checkOut: b.check_out,
        rooms: b.rooms,
        adults: b.adults,
        children: b.children,
        totalBdt: b.total_bdt,
        paidBdt: b.amount_paid_bdt,
        paymentStatus: b.payment_status,
      };
    }
  } catch (err) {
    if (errorCode(err) !== "UNAVAILABLE") console.error("Confirmation lookup failed:", err);
  }
  // Lookup not available yet: show what the database accepted when the
  // request was made (no status or total we can't vouch for).
  if (!data) {
    data = {
      reference: receipt.reference,
      status: null,
      roomName: rooms.find((r) => r.slug === receipt.room)?.name ?? "Your room",
      checkIn: receipt.checkIn,
      checkOut: receipt.checkOut,
      rooms: receipt.rooms,
      adults: receipt.adults,
      children: receipt.children,
      totalBdt: null,
      paidBdt: null,
      paymentStatus: null,
    };
  }

  const confirmed = data.status === "confirmed" || data.status === "checked_in";
  return (
    <section className="wrap grid gap-14 py-[clamp(48px,8vw,112px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
      <div>
        <svg className="size-16 text-brass" viewBox="0 0 96 96" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="48" cy="48" r="46" />
          <path d="M30 49l12 12 25-26" />
        </svg>
        <p className="caps eyebrow mt-8">{confirmed ? "Booking confirmed" : "Booking request received"}</p>
        <h1 className="h1 mt-5">
          See you on the {dayOrdinal(data.checkIn)}
          {receipt.firstName ? (
            <>
              , <em>{receipt.firstName}.</em>
            </>
          ) : (
            "."
          )}
        </h1>
        <p className="lede mt-6 max-w-[48ch]">
          {confirmed
            ? "Your booking is confirmed."
            : (
              <>
                Your room is held. Our front desk will call you on <span className="whitespace-nowrap">{receipt.phone}</span>{" "}
                {settings.confirm_call_within ? `within ${settings.confirm_call_within}` : "shortly"} to confirm.
              </>
            )}{" "}
          No payment has been taken.
        </p>
        {receipt.preview && (
          <p className="mt-5 flex items-start gap-2 text-sm text-muted-foreground">
            <Info size={16} /> Preview mode: saved to local preview data only (Supabase isn&apos;t connected).
          </p>
        )}
        <div className="mt-9">
          <BookingActions reference={data.reference} room={data.roomName} checkIn={data.checkIn} checkOut={data.checkOut} />
        </div>
        <p className="mt-8 text-sm text-ink-soft">
          Keep your reference. You can check this booking any time on{" "}
          <Link href="/booking/lookup" className="text-link">
            Find my booking
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-col gap-10">
        <GuestBooking b={data} />
        {!verified && (
          <p className="-mt-6 text-xs text-muted-foreground">Your total and status appear here once our front desk confirms, and on Find my booking.</p>
        )}
        {data.status !== "cancelled" && (
          <section aria-labelledby="advance-h">
            <h2 id="advance-h" className="h3">
              Want to confirm faster? <em>Send an advance.</em>
            </h2>
            <div className="mt-6">
              <PaymentDetails reference={data.reference} />
            </div>
            <p className="mt-5 text-sm text-ink-soft">Or simply pay at the hotel when you arrive.</p>
          </section>
        )}
        <div>
          <p className="caps text-bronze">Questions?</p>
          <ContactActions className="mt-4" size="sm" message={`Hello, about my booking ${data.reference}:`} />
        </div>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import BookingActions from "@/components/booking/BookingActions";
import GuestBooking, { fromManageView } from "@/components/booking/GuestBooking";
import { getHotelInfo } from "@/lib/cms/content";
import ManageActions from "@/components/booking/ManageActions";
import PaymentDetails from "@/components/booking/PaymentDetails";
import { ArrowRight, Info } from "@/components/icons";
import { Button } from "@/components/primitives/button";
import ContactActions from "@/components/site/ContactActions";
import { readReceipt } from "@/lib/booking-receipt";
import { getEngine } from "@/lib/data/engine";
import type { ManageView } from "@/lib/data/engine-types";
import { errorCode } from "@/lib/data/errors";
import { dayOrdinal, hotelToday } from "@/lib/dates";
import { formatTaka } from "@/lib/format";
import { getSettings } from "@/lib/rooms";

export const metadata: Metadata = {
  title: "Booking received",
  robots: { index: false, follow: false },
};

/**
 * Shown right after a website booking. It reads the booking back from the
 * database with the private token from the receipt cookie, so what the
 * guest sees is exactly what the hotel has.
 */
export default async function ConfirmationPage() {
  const receipt = await readReceipt();
  const engine = getEngine();
  let view: ManageView | null = null;
  if (receipt && engine) {
    try {
      view = await engine.view(receipt.token);
    } catch (err) {
      console.error("Confirmation read-back failed:", errorCode(err));
    }
  }

  if (!receipt || !view) {
    return (
      <section className="wrap max-w-3xl py-[clamp(64px,10vw,140px)]">
        <p className="caps eyebrow">Booking</p>
        <h1 className="h2 mt-5">
          No recent booking <em>on this device.</em>
        </h1>
        <p className="lede mt-5">
          {receipt
            ? `Your booking ${receipt.reference} was received, but we can't show its details right now. Look it up with your reference and the phone or email you booked with.`
            : "This page shows a booking for two hours after it's made. To see an earlier booking, look it up with your reference and the phone or email you booked with."}
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

  const settings = await getSettings();
  const data = fromManageView(view);
  const confirmed = view.status === "confirmed" || view.status === "checked_in";
  const cancelled = view.status === "cancelled" || view.status === "no_show";
  const advance = view.payment_option === "advance" && view.advance_due > view.paid;

  return (
    <section className="wrap grid gap-14 py-[clamp(48px,8vw,112px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
      <div>
        <svg className="size-16 text-brass" viewBox="0 0 96 96" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="48" cy="48" r="46" />
          <path d="M30 49l12 12 25-26" />
        </svg>
        <p className="caps eyebrow mt-8">{cancelled ? "Booking cancelled" : confirmed ? "Booking confirmed" : "Booking received"}</p>
        <h1 className="h1 mt-5">
          {cancelled ? "Your booking is cancelled" : `See you on the ${dayOrdinal(view.check_in)}`}
          {receipt.firstName ? (
            <>
              , <em>{receipt.firstName}.</em>
            </>
          ) : (
            "."
          )}
        </h1>
        {!cancelled && (
          <p className="lede mt-6 max-w-[48ch]">
            {confirmed ? (
              "Your booking is confirmed."
            ) : advance ? (
              <>Your rooms are reserved. Send the advance of {formatTaka(view.advance_due)} to secure them; our front desk will then call to confirm.</>
            ) : (
              <>
                Your rooms are reserved. Our front desk will call you {settings.confirm_call_within ? `within ${settings.confirm_call_within}` : "shortly"} to confirm.
              </>
            )}{" "}
            No payment has been taken online.
          </p>
        )}
        {receipt.preview && (
          <p className="mt-5 flex items-start gap-2 text-sm text-muted-foreground">
            <Info size={16} /> Preview mode: saved to local preview data only (Supabase isn&apos;t connected).
          </p>
        )}
        {!cancelled && (
          <div className="mt-9">
            <BookingActions reference={data.reference} room={data.roomName} checkIn={data.checkIn} checkOut={data.checkOut} />
          </div>
        )}
        <p className="mt-8 text-sm text-ink-soft">
          Keep your reference. You can check this booking any time on{" "}
          <Link href="/booking/lookup" className="text-link">
            Find my booking
          </Link>{" "}
          with the phone or email you booked with.
        </p>
      </div>

      <div className="flex flex-col gap-10">
        <GuestBooking b={data} hotel={await getHotelInfo()} />
        {!cancelled && (
          <section aria-labelledby="advance-h">
            <h2 id="advance-h" className="h3">
              {advance ? (
                <>
                  Send your <em>advance.</em>
                </>
              ) : (
                <>
                  Want to confirm faster? <em>Send an advance.</em>
                </>
              )}
            </h2>
            <div className="mt-6">
              <PaymentDetails reference={view.reference} />
            </div>
            {!advance && <p className="mt-5 text-sm text-ink-soft">Or simply pay at the hotel when you arrive.</p>}
          </section>
        )}
        <ManageActions
          reference={view.reference}
          today={hotelToday()}
          checkIn={view.check_in}
          checkOut={view.check_out}
          canCancel={view.can_cancel}
          cancelsInstantly={view.cancels_instantly}
          canChange={view.can_request_change}
          openRequests={view.open_requests}
        />
        <div>
          <p className="caps text-bronze">Questions?</p>
          <ContactActions className="mt-4" size="sm" message={`Hello, about my booking ${view.reference}:`} />
        </div>
      </div>
    </section>
  );
}

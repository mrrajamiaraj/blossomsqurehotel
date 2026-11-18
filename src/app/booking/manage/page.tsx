import type { Metadata } from "next";
import Link from "next/link";
import BookingActions from "@/components/booking/BookingActions";
import GuestBooking, { fromManageView } from "@/components/booking/GuestBooking";
import { getHotelInfo } from "@/lib/cms/content";
import ManageActions from "@/components/booking/ManageActions";
import GuestPayments from "@/components/booking/GuestPayments";
import PaymentDetails from "@/components/booking/PaymentDetails";
import { configuredGateways } from "@/lib/payments/gateways";
import { guestPaymentOptions, type GuestPaymentOptions } from "@/lib/payments/guest";
import { ArrowRight } from "@/components/icons";
import { Button } from "@/components/primitives/button";
import ContactActions from "@/components/site/ContactActions";
import { readManageToken } from "@/lib/booking-receipt";
import { getEngine } from "@/lib/data/engine";
import type { ManageView } from "@/lib/data/engine-types";
import { errorCode } from "@/lib/data/errors";
import { hotelToday } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false },
};

/**
 * A guest's own booking, opened by "Find my booking" (reference + contact).
 * Access is a 30-minute token in an httpOnly cookie; contact details are
 * masked by the database.
 */
export default async function ManagePage() {
  const token = await readManageToken();
  const engine = getEngine();
  let view: ManageView | null = null;
  if (token && engine) {
    try {
      view = await engine.view(token);
    } catch (err) {
      if (errorCode(err) !== "ACCESS_EXPIRED") console.error("Manage view failed:", errorCode(err));
    }
  }

  if (!view) {
    return (
      <section className="wrap max-w-3xl py-[clamp(64px,10vw,140px)]">
        <p className="caps eyebrow">Your booking</p>
        <h1 className="h2 mt-5">
          This page has <em>timed out.</em>
        </h1>
        <p className="lede mt-5">For your privacy, a booking stays open here for 30 minutes. Look it up again with your reference and the phone or email you booked with.</p>
        <div className="mt-9">
          <Button asChild>
            <Link href="/booking/lookup">
              Find my booking <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  const data = fromManageView(view);
  const open = !["cancelled", "checked_out", "no_show"].includes(view.status);
  const hotel = await getHotelInfo();
  // Payments need the live database (the preview hotel shows the static details).
  let payOptions: GuestPaymentOptions | null = null;
  if (engine?.mode === "live" && token) {
    try {
      payOptions = await guestPaymentOptions(token);
    } catch (err) {
      console.error("Guest payment options:", errorCode(err));
    }
  }
  return (
    <section className="wrap grid gap-12 py-[clamp(48px,8vw,112px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-20">
      <div className="flex flex-col gap-10">
        <div>
          <p className="caps eyebrow">Hello{view.guest_first_name ? `, ${view.guest_first_name}` : ""}</p>
          <h1 className="h2 mt-4">
            Your booking, <em>as we have it.</em>
          </h1>
          <p className="mt-4 text-sm text-ink-soft">
            Contact on file: {[view.phone, view.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        <GuestBooking b={data} hotel={hotel} />
        {open && <BookingActions reference={data.reference} room={data.roomName} checkIn={data.checkIn} checkOut={data.checkOut} />}
      </div>
      <div className="flex flex-col gap-10">
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
        {payOptions ? (
          <GuestPayments o={payOptions} gateways={configuredGateways()} whatsappHref={hotel.whatsapp.href} />
        ) : (
          open &&
          view.payment_status !== "paid" && (
            <section aria-labelledby="pay-h">
              <h2 id="pay-h" className="h3">
                Sending an advance
              </h2>
              <div className="mt-5">
                <PaymentDetails reference={view.reference} />
              </div>
            </section>
          )
        )}
        <div>
          <p className="caps text-bronze">Questions?</p>
          <ContactActions className="mt-4" size="sm" message={`Hello, about my booking ${view.reference}:`} />
        </div>
      </div>
    </section>
  );
}

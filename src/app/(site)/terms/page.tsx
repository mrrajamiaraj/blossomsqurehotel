import Link from "next/link";
import LegalPage from "@/components/site/LegalPage";
import { HOTEL, PAYMENT_METHODS } from "@/lib/hotel";
import { taxNote, WEEKEND_LABEL } from "@/lib/pricing";
import { getSettings } from "@/lib/rooms";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Booking terms",
  description: "How booking requests, prices, payment, cancellation and check-in work at Blossom Square Hotel & Suites.",
  path: "/terms",
});

export default async function TermsPage() {
  const s = await getSettings();
  const methods = PAYMENT_METHODS.map((m) => m.name).join("; ");
  const call = `${HOTEL.phones[0].display}`;
  return (
    <LegalPage
      crumb="Terms"
      updated="18 November 2026"
      title={
        <>
          Booking terms, <em>in plain words.</em>
        </>
      }
      lede="How a booking made on this website works, from the request to check-out. Policies set by the hotel appear here exactly as they apply to your stay."
      sections={[
        {
          id: "request",
          title: "Your booking request",
          body: (
            <>
              <p>
                When you send a booking on this website, the room is held for your dates and you receive a reference (BSQ-…). Your booking is{" "}
                <strong>confirmed once our front desk confirms it</strong>, by phone{s.confirm_call_within ? ` within ${s.confirm_call_within}` : ""}. You can check its
                status any time on <Link href="/booking/lookup">Find my booking</Link>.
              </p>
            </>
          ),
        },
        {
          id: "prices",
          title: "Prices",
          body: (
            <>
              <p>
                Prices are in Bangladeshi taka (৳), per room per night. Weekday rates apply to Sunday to Wednesday nights; {WEEKEND_LABEL.toLowerCase()} are charged at the
                weekend rate. The rate shown when you send your request is the rate for your booking.
              </p>
              <p>{taxNote(s) || "VAT and service charge are added at check-in."} Breakfast is included.</p>
            </>
          ),
        },
        {
          id: "payment",
          title: "Payment",
          body: (
            <>
              <p>No payment is taken on this website. You can pay at the hotel, or send an advance to confirm faster by: {methods}.</p>
              <p>Please quote your booking reference with any advance, and keep the transaction receipt.</p>
            </>
          ),
        },
        {
          id: "cancel",
          title: "Changes and cancellation",
          body: (
            <p>
              {s.cancellation_policy || "Our front desk explains the cancellation terms when they confirm your booking."} To change or cancel, call {call} or email{" "}
              <a href={`mailto:${HOTEL.email}`}>{HOTEL.email}</a> with your reference.
            </p>
          ),
        },
        {
          id: "stay",
          title: "Check-in and your stay",
          body: (
            <ul>
              <li>
                Check-in from {HOTEL.checkIn}, check-out until {HOTEL.checkOut}. Early check-in and late check-out are on request.
              </li>
              <li>Each room sleeps the number of guests shown on it.{s.children_policy ? ` ${s.children_policy}` : ""}</li>
              <li>We&apos;re unable to accommodate pets.</li>
              <li>Airport pickup and drop-off are available on request, at an extra charge.</li>
            </ul>
          ),
        },
        {
          id: "site",
          title: "This website",
          body: (
            <p>
              Room photographs on this site are of Blossom Square. We keep rates, availability and facilities up to date; if something
              differs at the hotel, the front desk will tell you before you confirm. Your information is handled as described in our{" "}
              <Link href="/privacy">privacy notice</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}

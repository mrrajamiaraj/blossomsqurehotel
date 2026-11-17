import type { Metadata } from "next";
import LookupForm from "@/components/booking/LookupForm";

export const metadata: Metadata = {
  title: "Find my booking",
  description: "Check the status of your Blossom Square booking with your reference and the phone or email you booked with.",
  alternates: { canonical: "/booking/lookup" },
  robots: { index: false, follow: true },
};

export default function LookupPage() {
  return (
    <section className="wrap py-[clamp(48px,8vw,112px)]" aria-labelledby="lookup-h">
      <p className="caps eyebrow">Guest services</p>
      <h1 id="lookup-h" className="h1 mt-5 max-w-[14ch]">
        Find <em>my booking.</em>
      </h1>
      <p className="lede mt-5 max-w-[52ch]">Check your booking&apos;s status, dates and total with your reference and the phone number or email you booked with.</p>
      <div className="mt-12">
        <LookupForm />
      </div>
    </section>
  );
}

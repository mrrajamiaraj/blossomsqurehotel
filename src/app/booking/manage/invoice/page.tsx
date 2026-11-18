import type { Metadata } from "next";
import Link from "next/link";
import { documentStyles, InvoiceView } from "@/components/documents/InvoiceView";
import GuestPrintButton from "@/components/documents/GuestPrintButton";
import { readManageToken, readReceipt } from "@/lib/booking-receipt";
import { getHotelInfo } from "@/lib/cms/content";
import { errorCode } from "@/lib/data/errors";
import type { InvoiceDoc } from "@/lib/data/payments";
import { guestInvoice } from "@/lib/payments/guest";

export const metadata: Metadata = { title: "Your invoice", robots: { index: false, follow: false } };

export default async function GuestInvoicePage() {
  const token = (await readManageToken()) ?? (await readReceipt())?.token ?? null;
  let doc: InvoiceDoc | null = null;
  let code = "ACCESS_EXPIRED";
  if (token) {
    try {
      doc = await guestInvoice(token);
    } catch (err) {
      code = errorCode(err);
    }
  }
  if (!doc) {
    return (
      <section className="wrap max-w-3xl py-[clamp(64px,10vw,140px)]">
        <h1 className="h2">{code === "ACCESS_EXPIRED" ? "This page has timed out." : "Your invoice isn't available right now."}</h1>
        <p className="lede mt-5">For your privacy, look up your booking again with your reference and the phone or email you booked with.</p>
        <p className="mt-8">
          <Link className="text-link" href="/booking/lookup">
            Find my booking
          </Link>
        </p>
      </section>
    );
  }
  return (
    <section className="wrap py-[clamp(32px,6vw,80px)]">
      <div className={documentStyles.toolbar}>
        <Link className="text-link" href="/booking/manage">
          ← Back to your booking
        </Link>
        <GuestPrintButton />
      </div>
      <InvoiceView doc={doc} hotel={await getHotelInfo()} />
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { documentStyles, ReceiptView } from "@/components/documents/InvoiceView";
import GuestPrintButton from "@/components/documents/GuestPrintButton";
import { readManageToken, readReceipt } from "@/lib/booking-receipt";
import { getHotelInfo } from "@/lib/cms/content";
import type { ReceiptDoc } from "@/lib/data/payments";
import { guestReceipt } from "@/lib/payments/guest";

export const metadata: Metadata = { title: "Payment receipt", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GuestReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await readManageToken()) ?? (await readReceipt())?.token ?? null;
  if (!UUID.test(id)) notFound();
  let doc: ReceiptDoc | null = null;
  if (token) doc = await guestReceipt(token, id).catch(() => null);
  if (!doc) {
    return (
      <section className="wrap max-w-3xl py-[clamp(64px,10vw,140px)]">
        <h1 className="h2">This receipt isn&apos;t available.</h1>
        <p className="lede mt-5">The page may have timed out. Look up your booking again to see your receipts.</p>
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
      <ReceiptView doc={doc} hotel={await getHotelInfo()} />
    </section>
  );
}

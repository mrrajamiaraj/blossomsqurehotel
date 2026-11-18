import type { Metadata } from "next";
import Link from "next/link";
import { readManageToken, readReceipt } from "@/lib/booking-receipt";
import { formatTaka } from "@/lib/format";
import { guestPaymentStatus } from "@/lib/payments/guest";
import { methodInfo } from "@/lib/payments/methods";

export const metadata: Metadata = { title: "Payment status", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where guests land after an online checkout. It shows what the DATABASE
 * says — set only by the gateway's verified server-to-server answer — never
 * what the browser was told. While it's still processing, the page refreshes.
 */
export default async function PaymentStatusPage({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  const { intent } = await searchParams;
  const token = (await readManageToken()) ?? (await readReceipt())?.token ?? null;
  let s: Awaited<ReturnType<typeof guestPaymentStatus>> | null = null;
  if (token && intent && UUID.test(intent)) s = await guestPaymentStatus(token, intent).catch(() => null);

  const state = !s ? "unknown" : s.status === "succeeded" ? "paid" : s.status === "created" ? "processing" : s.status;
  const name = s ? methodInfo(s.provider)?.short ?? s.provider : "";

  return (
    <section className="wrap max-w-3xl py-[clamp(64px,10vw,140px)]" aria-live="polite">
      {state === "processing" && <meta httpEquiv="refresh" content="5" />}
      <p className="caps eyebrow">{s ? s.reference : "Payment"}</p>
      <h1 className="h2 mt-5">
        {state === "paid"
          ? "Payment received. Thank you."
          : state === "processing"
            ? "Confirming your payment…"
            : state === "unknown"
              ? "We couldn't show this payment."
              : "Your payment didn't go through."}
      </h1>
      <p className="lede mt-5">
        {state === "paid" && s
          ? `${formatTaka(s.amount)} by ${name} is on your booking${s.receipt_no ? ` (receipt ${s.receipt_no})` : ""}. We've emailed you a receipt.`
          : state === "processing"
            ? `We're waiting for ${name} to confirm it to us. This page updates by itself — please don't pay again.`
            : state === "unknown"
              ? "The page may have timed out. Look up your booking to see its payments. If money left your account, please contact us with the transaction details."
              : "No money has been added to your booking. If money left your account, contact us with the transaction details and we'll check it. You can also try again or choose another way to pay."}
      </p>
      <div className="mt-9 flex flex-wrap gap-4">
        <Link className="text-link" href={token ? "/booking/manage" : "/booking/lookup"}>
          {token ? "Back to your booking" : "Find my booking"}
        </Link>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PrintButton from "@/components/admin/PrintButton";
import { documentStyles, InvoiceView } from "@/components/documents/InvoiceView";
import { requirePermission } from "@/lib/admin/session";
import { getHotelInfo } from "@/lib/cms/content";
import { errorCode, errorMessage } from "@/lib/data/errors";
import { PaymentsRepo, type InvoiceDoc } from "@/lib/data/payments";
import { getSessionClient } from "@/lib/supabase";

type Props = { params: Promise<{ reference: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Invoice ${(await params).reference}` };
}

export default async function InvoicePage({ params }: Props) {
  const { repo, mode } = await requirePermission("bookings.read");
  const { reference } = await params;
  const booking = await repo.getBooking(decodeURIComponent(reference));
  if (!booking) notFound();
  const back = (
    <Link href={`/admin/bookings/${booking.reference}`} className="a-btn a-btn--ghost">
      ← {booking.reference}
    </Link>
  );
  if (mode === "preview") {
    return (
      <div className="a-panel" style={{ padding: 20 }}>
        {back}
        <p className="a-hint" style={{ marginTop: 12 }}>
          Invoices need Supabase. Connect it to issue numbered invoices.
        </p>
      </div>
    );
  }
  let doc: InvoiceDoc | null = null;
  let failure = "";
  try {
    doc = await new PaymentsRepo(await getSessionClient()).invoice(booking.id);
  } catch (err) {
    failure = errorMessage(errorCode(err));
  }
  return (
    <div>
      <div className={documentStyles.toolbar}>
        {back}
        {doc && <PrintButton label="Print or save as PDF" />}
      </div>
      {doc ? (
        <InvoiceView doc={doc} hotel={await getHotelInfo()} />
      ) : (
        <p className="a-error" role="alert">
          {failure}
        </p>
      )}
    </div>
  );
}

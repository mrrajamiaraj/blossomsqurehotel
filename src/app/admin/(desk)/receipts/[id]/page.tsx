import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PrintButton from "@/components/admin/PrintButton";
import { documentStyles, ReceiptView } from "@/components/documents/InvoiceView";
import { requirePermission } from "@/lib/admin/session";
import { getHotelInfo } from "@/lib/cms/content";
import { errorCode } from "@/lib/data/errors";
import { PaymentsRepo, type ReceiptDoc } from "@/lib/data/payments";
import { getSessionClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Receipt" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { mode } = await requirePermission("payments.read");
  const { id } = await params;
  if (!UUID.test(id) || mode === "preview") notFound();
  let doc: ReceiptDoc;
  try {
    doc = await new PaymentsRepo(await getSessionClient()).receipt(id);
  } catch (err) {
    if (errorCode(err) === "NOT_FOUND") notFound();
    throw err;
  }
  return (
    <div>
      <div className={documentStyles.toolbar}>
        <Link href={`/admin/bookings/${doc.booking.reference}`} className="a-btn a-btn--ghost">
          ← {doc.booking.reference}
        </Link>
        <PrintButton label="Print or save as PDF" />
      </div>
      <ReceiptView doc={doc} hotel={await getHotelInfo()} />
    </div>
  );
}

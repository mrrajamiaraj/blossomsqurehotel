import type { Metadata } from "next";
import Link from "next/link";
import { setInquiryStatus } from "@/app/admin/actions";
import ActionButton from "@/components/admin/ActionButton";
import { AdminEmptyState, PageHeader, Panel } from "@/components/admin/kit";
import { requireAdmin } from "@/lib/admin/session";
import { errorCode } from "@/lib/data/errors";
import type { Inquiry, InquiryStatus } from "@/lib/data/types";
import { INQUIRY_KINDS } from "@/lib/guest-services";

export const metadata: Metadata = { title: "Enquiries" };

const VIEWS: { id: InquiryStatus | "all"; label: string }[] = [
  { id: "new", label: "New" },
  { id: "handled", label: "Handled" },
  { id: "spam", label: "Spam" },
  { id: "all", label: "All" },
];

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Messages sent from the website's contact, dining and events forms. */
export default async function InquiriesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { repo } = await requireAdmin();
  const { view: v } = await searchParams;
  const view = VIEWS.find((x) => x.id === v)?.id ?? "new";
  let rows: Inquiry[] = [];
  let unavailable = false;
  try {
    rows = await repo.listInquiries({ status: view, limit: 200 });
  } catch (err) {
    if (errorCode(err) === "UNAVAILABLE") unavailable = true;
    else throw err;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader eyebrow="Website" title="Enquiries" description="Messages from the contact, dining and events forms. Reply by phone or email, then mark them handled." />

      <nav aria-label="Enquiry views" className="a-tabs" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {VIEWS.map((x) => (
          <Link key={x.id} href={`/admin/inquiries?view=${x.id}`} className={`a-btn ${x.id === view ? "a-btn--primary" : ""}`} aria-current={x.id === view ? "page" : undefined}>
            {x.label}
          </Link>
        ))}
      </nav>

      <Panel flush>
        {unavailable ? (
          <AdminEmptyState title="Enquiries aren't connected yet">
            Apply the migration supabase/migrations/20261117194739_guest_services.sql to start receiving website messages here. Until then the website offers guests WhatsApp and email instead.
          </AdminEmptyState>
        ) : rows.length === 0 ? (
          <AdminEmptyState title={view === "new" ? "No new enquiries" : "Nothing here"}>{view === "new" ? "New messages from the website appear here." : undefined}</AdminEmptyState>
        ) : (
          <ul role="list" style={{ margin: 0, padding: 0 }}>
            {rows.map((q) => (
              <li key={q.id} style={{ display: "grid", gap: 10, padding: "16px 20px", borderTop: "1px solid var(--a-line)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <strong>
                    {q.name} <span className="a-muted" style={{ fontWeight: 400 }}>· {INQUIRY_KINDS.find((k) => k.id === q.kind)?.label ?? q.kind}</span>
                  </strong>
                  <span className="a-muted" style={{ fontSize: "0.85rem" }}>
                    {q.reference} · {when(q.created_at)}
                  </span>
                </div>
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{q.message}</p>
                {(q.event_date || q.guests) && (
                  <p className="a-muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                    {[q.event_date && `Date ${q.event_date}`, q.guests && `${q.guests} guests`].filter(Boolean).join(" · ")}
                  </p>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  {q.phone && (
                    <a className="a-btn" href={`tel:${q.phone.replace(/[^\d+]/g, "")}`}>
                      Call {q.phone}
                    </a>
                  )}
                  {q.email && (
                    <a className="a-btn" href={`mailto:${q.email}?subject=${encodeURIComponent(`Your enquiry ${q.reference}`)}`}>
                      Email
                    </a>
                  )}
                  {q.status !== "handled" && (
                    <ActionButton className="a-btn a-btn--primary" action={setInquiryStatus.bind(null, q.id, "handled")}>
                      Mark handled
                    </ActionButton>
                  )}
                  {q.status === "new" && (
                    <ActionButton action={setInquiryStatus.bind(null, q.id, "spam")}>Spam</ActionButton>
                  )}
                  {q.status !== "new" && <ActionButton action={setInquiryStatus.bind(null, q.id, "new")}>Move to new</ActionButton>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit";
import MessageList from "@/components/admin/MessageList";
import RunQueueButton from "@/components/admin/RunQueueButton";
import { can } from "@/lib/access";
import { requirePermission } from "@/lib/admin/session";
import { PaymentsRepo, type MessageRow } from "@/lib/data/payments";
import { integrationStatus } from "@/lib/integrations";
import { getSessionClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Guest messages" };

const FILTERS = [
  { id: "problems", label: "Needs attention" },
  { id: "queued", label: "Queued" },
  { id: "sent", label: "Sent" },
  { id: "delivered", label: "Delivered" },
  { id: "all", label: "All" },
] as const;

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { mode, access } = await requirePermission("bookings.read");
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.id === sp.status)?.id ?? "problems";
  const status = integrationStatus();
  let messages: MessageRow[] = [];
  let counts: Record<string, number> = {};
  let failed = false;
  if (mode === "live") {
    const repo = new PaymentsRepo(await getSessionClient());
    try {
      [messages, counts] = await Promise.all([
        repo.messages({ status: filter === "all" ? undefined : (filter as MessageRow["status"] | "problems"), limit: 150 }),
        repo.messageCounts(),
      ]);
    } catch (err) {
      console.error("Messages:", err);
      failed = true;
    }
  }
  const problems = (counts.failed ?? 0) + (counts.unconfigured ?? 0) + (counts.skipped ?? 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1080 }}>
      <PageHeader
        eyebrow="Guests"
        title="Guest messages"
        description="Every email and WhatsApp message the hotel sends a guest: booking confirmations, changes, cancellations, reminders, payment receipts and enquiry replies. Failed messages can be resent."
        actions={can(access, "bookings.write") ? <RunQueueButton disabled={mode !== "live"} /> : undefined}
      />

      <section className="a-panel" aria-labelledby="svc-h">
        <div className="a-panel-head">
          <h2 id="svc-h" className="a-h2">
            Delivery services
          </h2>
        </div>
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <li style={{ padding: "12px 20px", borderTop: "1px solid var(--a-line)" }}>
            <strong>Email</strong>{" "}
            <span className="a-badge" data-s={status.email.configured ? "confirmed" : "checked_out"}>
              {status.email.configured ? "Connected" : "Not set up"}
            </span>
            <span className="a-hint" style={{ display: "block" }}>
              {status.email.configured
                ? `Sending through Resend.${status.email.webhook ? " Delivery and bounce tracking is on." : " Add RESEND_WEBHOOK_SECRET to track delivery and bounces."}`
                : `Messages are kept as “Not set up” until the server has ${status.email.missing.join(" and ")}. Resend them once it's connected.`}
            </span>
          </li>
          <li style={{ padding: "12px 20px", borderTop: "1px solid var(--a-line)" }}>
            <strong>WhatsApp Business</strong>{" "}
            <span className="a-badge" data-s={status.whatsapp.configured ? "confirmed" : "checked_out"}>
              {status.whatsapp.configured ? "Connected" : "Not set up"}
            </span>
            <span className="a-hint" style={{ display: "block" }}>
              {status.whatsapp.configured
                ? `Approved templates: ${status.whatsapp.templates.filter((t) => t.set).map((t) => t.label).join(", ") || "none yet"}. Only guests who opt in receive WhatsApp messages.`
                : "Optional. Guests can always reach you through the WhatsApp button on the website. Official notifications need a WhatsApp Business Platform account and approved templates."}
            </span>
          </li>
          <li style={{ padding: "12px 20px", borderTop: "1px solid var(--a-line)" }}>
            <strong>Retries</strong>{" "}
            <span className="a-badge" data-s={status.jobs ? "confirmed" : "pending"}>
              {status.jobs ? "Scheduled" : "On page activity only"}
            </span>
            <span className="a-hint" style={{ display: "block" }}>
              Messages go out within seconds of each booking or payment. Failed sends are retried up to 5 times with growing gaps
              {status.jobs ? " by the scheduled sweep." : "; set CRON_SECRET and the schedule so retries also run when nobody is using the site."}
            </span>
          </li>
        </ul>
      </section>

      {mode === "preview" && <p className="a-hint">Messages need Supabase. Connect it to see guest messages.</p>}
      {failed && (
        <p className="a-error" role="alert">
          Couldn&apos;t load messages. Refresh to try again.
        </p>
      )}

      <section className="a-panel" aria-labelledby="list-h">
        <div className="a-panel-head" style={{ flexWrap: "wrap", gap: 10 }}>
          <h2 id="list-h" className="a-h2">
            Messages
          </h2>
          <nav className="a-seg" aria-label="Filter messages" style={{ flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <Link key={f.id} href={`/admin/messages?status=${f.id}`} aria-current={filter === f.id ? "page" : undefined} className="a-seg-link" style={{ padding: "6px 12px", fontWeight: filter === f.id ? 600 : 400, textDecoration: filter === f.id ? "underline" : "none" }}>
                {f.label}
                {f.id === "problems" && problems ? ` (${problems})` : f.id !== "all" && counts[f.id] ? ` (${counts[f.id]})` : ""}
              </Link>
            ))}
          </nav>
        </div>
        <MessageList messages={messages} canResend={can(access, "bookings.write")} live={mode === "live"} showBooking />
      </section>
      <p className="a-hint">Counts cover the last 30 days. Messages about enquiries appear for staff who handle enquiries.</p>
    </div>
  );
}

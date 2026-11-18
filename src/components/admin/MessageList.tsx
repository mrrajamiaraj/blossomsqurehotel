"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { resendMessage } from "@/app/admin/payments";
import type { MessageRow } from "@/lib/data/payments";
import { TEMPLATE_LABEL, type TemplateId } from "@/lib/messaging/templates";
import { toast } from "../ui/Toaster";

export const MESSAGE_STATUS: Record<MessageRow["status"], { label: string; badge: string; note: string }> = {
  queued: { label: "Queued", badge: "pending", note: "Waiting to be sent" },
  sending: { label: "Sending", badge: "pending", note: "Being sent now" },
  sent: { label: "Sent", badge: "confirmed", note: "Accepted by the provider" },
  delivered: { label: "Delivered", badge: "confirmed", note: "Reached the guest's inbox or phone" },
  failed: { label: "Failed", badge: "cancelled", note: "Couldn't be delivered" },
  skipped: { label: "No address", badge: "checked_out", note: "No email or WhatsApp number on file" },
  unconfigured: { label: "Not set up", badge: "checked_out", note: "The email or WhatsApp service isn't connected yet" },
  cancelled: { label: "Cancelled", badge: "checked_out", note: "Not sent" },
};

const RESENDABLE = new Set(["failed", "unconfigured", "skipped", "cancelled"]);
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" }) : "";

export default function MessageList({ messages, canResend, live, showBooking = false }: { messages: MessageRow[]; canResend: boolean; live: boolean; showBooking?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const resent = new Set(messages.map((m) => m.resent_from).filter(Boolean));

  const resend = (m: MessageRow) =>
    start(async () => {
      const r = await resendMessage(m.id);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.message);
    });

  if (!messages.length)
    return (
      <div className="a-empty">
        <strong>No messages</strong>
        <span>Emails and WhatsApp messages to guests appear here as they're queued and sent.</span>
      </div>
    );

  return (
    <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {messages.map((m) => {
        const s = MESSAGE_STATUS[m.status];
        const ref = m.data?.reference;
        const eligible = canResend && RESENDABLE.has(m.status) && !resent.has(m.id);
        return (
          <li key={m.id} style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", alignItems: "center", padding: "11px 20px", borderTop: "1px solid var(--a-line)" }}>
            <span style={{ flex: "1 1 260px", minWidth: 0 }}>
              <strong>{TEMPLATE_LABEL[m.template as TemplateId] ?? m.template}</strong>
              <span className="a-hint"> · {m.channel === "email" ? "Email" : "WhatsApp"}</span>{" "}
              <span className="a-badge" data-s={s.badge} title={s.note}>
                {s.label}
              </span>
              {m.resent_from && <span className="a-hint"> · resent</span>}
              <span className="a-hint" style={{ display: "block", overflowWrap: "anywhere" }}>
                {showBooking && ref ? (
                  m.booking_id ? (
                    <>
                      <Link className="a-link" href={`/admin/bookings/${ref}`}>
                        {ref}
                      </Link>{" "}
                      ·{" "}
                    </>
                  ) : (
                    `${ref} · `
                  )
                ) : null}
                {m.recipient ?? "no recipient"} · {when(m.delivered_at ?? m.sent_at ?? m.created_at)}
                {m.attempts > 1 ? ` · ${m.attempts} attempts` : ""}
                {m.status === "queued" && m.attempts > 0 ? ` · next try ${when(m.next_attempt_at)}` : ""}
              </span>
              {m.last_error && (m.status === "failed" || m.status === "unconfigured" || m.status === "queued" || m.status === "skipped") && (
                <span className="a-hint" style={{ display: "block", color: "var(--a-danger, #b42318)", overflowWrap: "anywhere" }}>
                  {m.last_error}
                </span>
              )}
            </span>
            {eligible && (
              <button type="button" className="a-btn a-btn--sm" disabled={pending || !live} onClick={() => resend(m)}>
                Resend
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

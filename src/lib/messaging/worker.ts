import "server-only";
import { after } from "next/server";
import { getHotelInfo } from "../cms/content";
import type { HotelInfo } from "../cms/hotel-info";
import { getServiceClient, isServiceRoleConfigured } from "../supabase";
import { sendEmail, sendWhatsAppTemplate, whatsappConfigured, type SendResult } from "./providers";
import { renderEmail, TEMPLATES, WHATSAPP_TEMPLATES, type MessageData, type TemplateId } from "./templates";

export type OutboxRow = { id: string; channel: "email" | "whatsapp"; template: string; recipient: string | null; data: unknown; attempts: number };

export type WorkerDeps = {
  claim(limit: number): Promise<OutboxRow[]>;
  complete(id: string, result: "sent" | "retry" | "failed" | "unconfigured", provider: string | null, providerId: string | null, error: string | null): Promise<string>;
  sendEmail: typeof sendEmail;
  sendWhatsApp: typeof sendWhatsAppTemplate;
  whatsappConfigured: () => boolean;
  hotel: () => Promise<HotelInfo>;
  siteUrl: string;
  env: (name: string) => string | undefined;
};

export type RunSummary = { claimed: number; sent: number; retry: number; failed: number; unconfigured: number };

/** Sends one claimed message and reports the result (never throws). */
async function deliver(m: OutboxRow, deps: WorkerDeps, hotel: HotelInfo): Promise<SendResult> {
  if (!(TEMPLATES as readonly string[]).includes(m.template)) return { kind: "failed", error: `Unknown template ${m.template}` };
  const template = m.template as TemplateId;
  const data = (m.data ?? {}) as MessageData;
  if (!m.recipient) return { kind: "failed", error: "No recipient" };

  if (m.channel === "email") {
    const r = renderEmail(template, data, hotel, deps.siteUrl);
    return deps.sendEmail({ id: m.id, to: m.recipient, subject: r.subject, html: r.html, text: r.text });
  }
  const wa = WHATSAPP_TEMPLATES[template];
  if (!wa) return { kind: "failed", error: `No WhatsApp template for ${template}` };
  if (!deps.whatsappConfigured()) return { kind: "unconfigured", error: "WhatsApp isn't set up" };
  const name = deps.env(wa.env);
  if (!name) return { kind: "unconfigured", error: `No approved WhatsApp template configured (${wa.env})` };
  return deps.sendWhatsApp({ to: m.recipient, template: name, params: wa.params(data) });
}

/**
 * Claims due messages and sends them. Each message is claimed by exactly one
 * run (the database locks it); failures are retried with backoff by the
 * database, and a message that can't be sent is left "failed" or
 * "unconfigured" for staff to resend.
 */
export async function runOutbox(deps: WorkerDeps, limit = 10): Promise<RunSummary> {
  const summary: RunSummary = { claimed: 0, sent: 0, retry: 0, failed: 0, unconfigured: 0 };
  const rows = await deps.claim(limit);
  summary.claimed = rows.length;
  if (!rows.length) return summary;
  const hotel = await deps.hotel();
  for (const m of rows) {
    let r: SendResult;
    try {
      r = await deliver(m, deps, hotel);
    } catch (err) {
      r = { kind: "retry", error: `Worker error: ${(err as Error).message}`.slice(0, 500) };
    }
    const result = r.kind === "sent" ? "sent" : r.kind;
    const final = await deps.complete(m.id, result, r.kind === "sent" ? r.provider : null, r.kind === "sent" ? r.id : null, r.kind === "sent" ? null : r.error);
    if (final === "sent") summary.sent++;
    else if (final === "retry") summary.retry++;
    else if (final === "unconfigured") summary.unconfigured++;
    else if (final === "failed") summary.failed++;
  }
  return summary;
}

/** The real dependencies (server key). Null when the server key isn't set. */
export function liveDeps(): WorkerDeps | null {
  const db = getServiceClient();
  if (!db) return null;
  return {
    async claim(limit) {
      const { data, error } = await db.rpc("claim_messages", { p_limit: limit });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as OutboxRow[];
    },
    async complete(id, result, provider, providerId, err) {
      const { data, error } = await db.rpc("complete_message", {
        p_id: id,
        p_result: result,
        p_provider: provider as string,
        p_provider_message_id: providerId as string,
        p_error: err as string,
      });
      if (error) throw new Error(error.message);
      return String(data);
    },
    sendEmail,
    sendWhatsApp: sendWhatsAppTemplate,
    whatsappConfigured,
    hotel: getHotelInfo,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://blossomsquare.online",
    env: (n) => process.env[n]?.trim() || undefined,
  };
}

export async function processOutbox(limit = 10): Promise<RunSummary | null> {
  const deps = liveDeps();
  if (!deps) return null;
  return runOutbox(deps, limit);
}

/**
 * Send what was just queued, right after the response (guest emails go out
 * within seconds). The scheduled sweep (/api/jobs/messages) handles retries
 * and anything this misses.
 */
export function kickOutbox() {
  if (!isServiceRoleConfigured()) return;
  try {
    after(async () => {
      try {
        await processOutbox(10);
      } catch (err) {
        console.error("Message worker:", (err as Error).message);
      }
    });
  } catch {
    // Outside a request (tests, build): the sweep will pick the messages up.
  }
}

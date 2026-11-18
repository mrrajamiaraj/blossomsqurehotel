import "server-only";

// Delivery providers. Keys live only in server environment variables; they're
// never sent to the browser, logged, or stored in the database.
//
//   Email     Resend (https://resend.com). RESEND_API_KEY, EMAIL_FROM
//             (a sender on a domain verified in Resend), optional EMAIL_REPLY_TO.
//   WhatsApp  WhatsApp Business Platform (Cloud API). WHATSAPP_ACCESS_TOKEN,
//             WHATSAPP_PHONE_NUMBER_ID and one approved template per message
//             (WHATSAPP_TEMPLATE_*). Optional WHATSAPP_TEMPLATE_LANG (default
//             "en"), WHATSAPP_GRAPH_VERSION (default v21.0).

export type SendResult =
  | { kind: "sent"; provider: string; id: string }
  | { kind: "retry"; error: string }
  | { kind: "failed"; error: string }
  | { kind: "unconfigured"; error: string };

const env = (n: string) => process.env[n]?.trim() || undefined;

export const EMAIL_REQUIRES = ["RESEND_API_KEY", "EMAIL_FROM"] as const;
export const WHATSAPP_REQUIRES = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"] as const;

export const emailConfigured = () => EMAIL_REQUIRES.every((n) => env(n));
export const whatsappConfigured = () => WHATSAPP_REQUIRES.every((n) => env(n));

/** HTTP status → retry or give up (4xx other than 408/409/429 won't succeed on retry). */
export function classify(status: number): "retry" | "failed" {
  return status >= 500 || status === 429 || status === 408 || status === 409 ? "retry" : "failed";
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; json: Record<string, unknown> | null } | { error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
  } catch (err) {
    return { error: `Network error: ${(err as Error).message}` };
  }
}

export async function sendEmail(m: { id: string; to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  if (!emailConfigured()) return { kind: "unconfigured", error: "Email isn't set up (RESEND_API_KEY / EMAIL_FROM)" };
  const r = await post(
    "https://api.resend.com/emails",
    // The outbox id makes a retried send idempotent at the provider too.
    { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Idempotency-Key": `bsq-${m.id}` },
    {
      from: env("EMAIL_FROM"),
      to: [m.to],
      reply_to: env("EMAIL_REPLY_TO"),
      subject: m.subject,
      html: m.html,
      text: m.text,
      tags: [{ name: "outbox_id", value: m.id.replace(/[^A-Za-z0-9_-]/g, "") }],
    },
  );
  if ("error" in r) return { kind: "retry", error: r.error };
  const id = typeof r.json?.id === "string" ? r.json.id : null;
  if (r.status >= 200 && r.status < 300 && id) return { kind: "sent", provider: "resend", id };
  const msg = `Resend ${r.status}: ${String(r.json?.message ?? r.json?.name ?? "error").slice(0, 300)}`;
  return { kind: classify(r.status), error: msg } as SendResult;
}

export async function sendWhatsAppTemplate(m: { to: string; template: string; params: string[] }): Promise<SendResult> {
  if (!whatsappConfigured()) return { kind: "unconfigured", error: "WhatsApp isn't set up (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID)" };
  const version = env("WHATSAPP_GRAPH_VERSION") ?? "v21.0";
  const r = await post(
    `https://graph.facebook.com/${version}/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`,
    { Authorization: `Bearer ${env("WHATSAPP_ACCESS_TOKEN")}` },
    {
      messaging_product: "whatsapp",
      to: m.to,
      type: "template",
      template: {
        name: m.template,
        language: { code: env("WHATSAPP_TEMPLATE_LANG") ?? "en" },
        components: [{ type: "body", parameters: m.params.map((text) => ({ type: "text", text: text.slice(0, 1000) })) }],
      },
    },
  );
  if ("error" in r) return { kind: "retry", error: r.error };
  const id = (r.json?.messages as { id?: string }[] | undefined)?.[0]?.id;
  if (r.status >= 200 && r.status < 300 && id) return { kind: "sent", provider: "whatsapp", id };
  const err = r.json?.error as { message?: string; code?: number } | undefined;
  return { kind: classify(r.status), error: `WhatsApp ${r.status}${err?.code ? ` (${err.code})` : ""}: ${String(err?.message ?? "error").slice(0, 300)}` } as SendResult;
}

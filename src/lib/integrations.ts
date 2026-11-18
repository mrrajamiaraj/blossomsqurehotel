import "server-only";
import { EMAIL_REQUIRES, emailConfigured, WHATSAPP_REQUIRES, whatsappConfigured } from "./messaging/providers";
import { TEMPLATE_LABEL, WHATSAPP_TEMPLATES, type TemplateId } from "./messaging/templates";
import { gatewayStatus } from "./payments/gateways";
import { isServiceRoleConfigured } from "./supabase";

const set = (n: string) => Boolean(process.env[n]?.trim());
const missing = (names: readonly string[]) => names.filter((n) => !set(n));

export type IntegrationStatus = {
  serviceKey: boolean;
  jobs: boolean;
  email: { configured: boolean; missing: string[]; webhook: boolean };
  whatsapp: { configured: boolean; missing: string[]; webhook: boolean; templates: { template: TemplateId; label: string; env: string; set: boolean }[] };
  gateways: ReturnType<typeof gatewayStatus>;
};

/**
 * What's set up on the server, for the admin. Only booleans and environment
 * variable NAMES ever leave this function — never a value.
 */
export function integrationStatus(): IntegrationStatus {
  return {
    serviceKey: isServiceRoleConfigured(),
    jobs: set("CRON_SECRET"),
    email: { configured: emailConfigured(), missing: missing(EMAIL_REQUIRES), webhook: set("RESEND_WEBHOOK_SECRET") },
    whatsapp: {
      configured: whatsappConfigured(),
      missing: missing(WHATSAPP_REQUIRES),
      webhook: set("WHATSAPP_APP_SECRET") && set("WHATSAPP_VERIFY_TOKEN"),
      templates: (Object.entries(WHATSAPP_TEMPLATES) as [TemplateId, { env: string }][]).map(([template, t]) => ({
        template,
        label: TEMPLATE_LABEL[template],
        env: t.env,
        set: set(t.env),
      })),
    },
    gateways: gatewayStatus(),
  };
}

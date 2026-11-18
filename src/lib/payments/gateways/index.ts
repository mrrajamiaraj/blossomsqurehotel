import "server-only";
import type { GatewayId } from "../methods";
import { bkash } from "./bkash";
import { nagad } from "./nagad";
import { sslcommerz } from "./sslcommerz";
import type { PaymentGateway } from "./types";

const ALL: Record<GatewayId, PaymentGateway> = { bkash, nagad, card: sslcommerz };

export function getGateway(id: string): PaymentGateway | null {
  return (ALL as Record<string, PaymentGateway>)[id] ?? null;
}

/** Gateways whose credentials are present on the server. */
export function configuredGateways(): GatewayId[] {
  return (Object.keys(ALL) as GatewayId[]).filter((id) => ALL[id].configured());
}

/** For the admin: names only, never values. */
export function gatewayStatus(): { id: GatewayId; name: string; configured: boolean; missing: string[] }[] {
  return (Object.keys(ALL) as GatewayId[]).map((id) => {
    const g = ALL[id];
    return { id, name: g.name, configured: g.configured(), missing: g.requires.filter((n) => !process.env[n]?.trim()) };
  });
}

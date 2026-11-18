import "server-only";
import { GatewayError, type PaymentGateway } from "./types";

/**
 * Nagad online checkout — interface only.
 *
 * Nagad's merchant API signs every request with the merchant's RSA private
 * key and encrypts sensitive data with Nagad's public key; the exact payload
 * format comes with merchant onboarding. Until the hotel has that onboarding
 * pack and sandbox access, this adapter reports itself as not configured, so
 * guests see "not available yet" and no payment can be started. Guests can
 * still pay Nagad to the merchant number and report the transaction ID
 * ("Nagad (send money)"), which staff verify.
 *
 * To implement: start() → initialize + complete checkout, returning the
 * callBackUrl; fromWebhook()/fromReturn() → payment_ref_id; verify() →
 * GET /verify/payment/{payment_ref_id} and map status "Success" + amount +
 * orderId (our intent id). Keep the ledger rules: only verify()'s answer counts.
 */
export const nagad: PaymentGateway = {
  id: "nagad",
  name: "Nagad",
  requires: ["NAGAD_MERCHANT_ID", "NAGAD_MERCHANT_PRIVATE_KEY", "NAGAD_PUBLIC_KEY", "NAGAD_BASE_URL"],
  configured: () => false,
  async start() {
    throw new GatewayError("Nagad online checkout isn't set up yet");
  },
  fromReturn: () => null,
  fromWebhook: async () => null,
  async verify() {
    throw new GatewayError("Nagad online checkout isn't set up yet");
  },
};

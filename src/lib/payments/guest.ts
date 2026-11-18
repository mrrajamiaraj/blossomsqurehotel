import "server-only";
import { errorCode, RepoError } from "../data/errors";
import type { InvoiceDoc, ReceiptDoc } from "../data/payments";
import { getPublicClient } from "../supabase";

// A guest's own payments, invoice and receipts, opened with their private
// booking token (the database checks it and masks contact details).

export type GuestPaymentOptions = {
  reference: string;
  status: string;
  total: number;
  paid: number;
  balance: number;
  /** Balance minus transfers still being checked. */
  payable: number;
  advance_due: number;
  payment_due_at: string | null;
  open: boolean;
  methods: string[];
  whatsapp_consent: boolean;
  payments: { id: string; amount: number; method: string; reference: string | null; status: "pending" | "confirmed" | "failed"; receipt_no: string | null; received_at: string; note: string | null }[];
};

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const db = getPublicClient();
  if (!db) throw new RepoError("OFFLINE");
  const { data, error } = await db.rpc(fn as never, args as never);
  if (error) throw new RepoError(errorCode(new Error(error.message)));
  return data as T;
}

export const guestPaymentOptions = (token: string) => rpc<GuestPaymentOptions>("guest_payment_options", { p_token: token });
export const guestInvoice = (token: string) => rpc<InvoiceDoc>("guest_invoice", { p_token: token });
export const guestReceipt = (token: string, paymentId: string) => rpc<ReceiptDoc>("guest_payment_receipt", { p_token: token, p_payment: paymentId });
export const guestPaymentStatus = (token: string, intentId: string) =>
  rpc<{ status: string; amount: number; provider: string; reference: string; receipt_no: string | null }>("guest_payment_status", { p_token: token, p_intent: intentId });
export const guestReportTransfer = (token: string, method: string, amount: number, reference: string, sender: string) =>
  rpc<{ id: string; status: string; reference: string }>("guest_submit_payment", { p_token: token, p_method: method, p_amount: amount, p_reference: reference, p_sender: sender });
export const guestSetWhatsApp = (token: string, on: boolean) => rpc<boolean>("guest_set_whatsapp_consent", { p_token: token, p_on: on });

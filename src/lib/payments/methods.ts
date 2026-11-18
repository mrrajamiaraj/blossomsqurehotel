// The payment methods the hotel can offer. Shared by server and browser code
// (no secrets here). Which ones a guest actually sees depends on two things:
//   1. the hotel has switched it on (Admin → Settings → Payments), and
//   2. for gateways, the server has the merchant credentials (see
//      src/lib/payments/gateways). Unconfigured gateways show "not available yet".

export type MethodId = "pay_at_hotel" | "bank_transfer" | "bkash_manual" | "nagad_manual" | "bkash" | "nagad" | "card";

export type MethodKind =
  /** Settle at the front desk. */
  | "desk"
  /** The guest sends money to the hotel's published account and reports the transaction ID; staff verify it. */
  | "transfer"
  /** An approved payment gateway: confirmed only by authenticated server-to-server verification. */
  | "gateway";

export type PaymentMethodInfo = {
  id: MethodId;
  kind: MethodKind;
  label: string;
  short: string;
  /** Ledger method recorded for this payment (payments.method). */
  ledger: "cash" | "bank" | "bkash" | "nagad" | "card" | null;
  /** What to tell the guest. */
  guide: string;
  /** Account details for transfers (published by the hotel). */
  account?: { label: string; value: string; copy: string }[];
};

export const METHODS: readonly PaymentMethodInfo[] = [
  {
    id: "pay_at_hotel",
    kind: "desk",
    label: "Pay at the hotel",
    short: "At the hotel",
    ledger: null,
    guide: "Pay the balance at check-in by cash, card, bKash or Nagad at the front desk.",
  },
  {
    id: "bank_transfer",
    kind: "transfer",
    label: "Bank transfer",
    short: "Bank",
    ledger: "bank",
    guide: "Transfer from any bank in Bangladesh, then enter the transaction reference below. We confirm it once it reaches our account.",
    account: [
      { label: "Bank", value: "Eastern Bank PLC", copy: "Eastern Bank PLC" },
      { label: "Account name", value: "Blossom Square Hotel and Suites", copy: "BLOSSOM SQUARE HOTEL AND SUITES" },
      { label: "Account no.", value: "0091350000386", copy: "0091350000386" },
      { label: "Routing no.", value: "095220253", copy: "095220253" },
    ],
  },
  {
    id: "bkash_manual",
    kind: "transfer",
    label: "bKash (send money)",
    short: "bKash",
    ledger: "bkash",
    guide: "Send money from your bKash app to our number, then enter the transaction ID (TrxID) from the confirmation SMS.",
    account: [{ label: "bKash number", value: "01805-006900", copy: "01805006900" }],
  },
  {
    id: "nagad_manual",
    kind: "transfer",
    label: "Nagad (send money)",
    short: "Nagad",
    ledger: "nagad",
    guide: "Pay our Nagad merchant number from your app, then enter the transaction ID from the confirmation SMS.",
    account: [{ label: "Nagad number", value: "01805-006909", copy: "01805006909" }],
  },
  {
    id: "bkash",
    kind: "gateway",
    label: "bKash online checkout",
    short: "bKash online",
    ledger: "bkash",
    guide: "Pay securely in bKash's own checkout. Your booking updates as soon as bKash confirms the payment to us.",
  },
  {
    id: "nagad",
    kind: "gateway",
    label: "Nagad online checkout",
    short: "Nagad online",
    ledger: "nagad",
    guide: "Pay securely in Nagad's own checkout. Your booking updates as soon as Nagad confirms the payment to us.",
  },
  {
    id: "card",
    kind: "gateway",
    label: "Card (Visa, Mastercard, Amex)",
    short: "Card",
    ledger: "card",
    guide: "Pay by card on our payment partner's secure page. We never see or store your card number.",
  },
] as const;

export const methodInfo = (id: string): PaymentMethodInfo | undefined => METHODS.find((m) => m.id === id);
export const isMethodId = (v: unknown): v is MethodId => METHODS.some((m) => m.id === v);
export const GATEWAYS = ["bkash", "nagad", "card"] as const;
export type GatewayId = (typeof GATEWAYS)[number];
export const isGatewayId = (v: unknown): v is GatewayId => (GATEWAYS as readonly string[]).includes(v as string);

/** Ledger method → a label for receipts and history. */
export const LEDGER_LABEL: Record<string, string> = {
  cash: "Cash",
  bank: "Bank transfer",
  bkash: "bKash",
  nagad: "Nagad",
  card: "Card",
  online: "Online payment",
  other: "Other",
};

export type MethodAvailability = { id: MethodId; offered: boolean; configured: boolean };

/**
 * What the guest can use now: offered by the hotel, and (for gateways)
 * configured on the server. Methods the hotel offers but that aren't set up
 * are returned with configured=false so the page can say "not available yet".
 */
export function availableMethods(offered: readonly string[], configuredGateways: readonly string[]): MethodAvailability[] {
  return METHODS.filter((m) => offered.includes(m.id)).map((m) => ({
    id: m.id,
    offered: true,
    configured: m.kind !== "gateway" || configuredGateways.includes(m.id),
  }));
}

/** Transaction IDs as the database stores them: no spaces, upper case. */
export function normaliseTxnId(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}
export const TXN_ID_RE = /^[A-Z0-9-]{6,40}$/;

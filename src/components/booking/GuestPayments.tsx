"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { reportTransfer, setWhatsAppUpdates, startOnlinePayment } from "@/app/booking/manage/actions";
import { formatTaka } from "@/lib/format";
import { availableMethods, LEDGER_LABEL, methodInfo, normaliseTxnId, TXN_ID_RE, type MethodId } from "@/lib/payments/methods";
import type { GuestPaymentOptions } from "@/lib/payments/guest";
import { Button } from "../primitives/button";
import { RadioCard, RadioGroup, Switch } from "../primitives/choice";
import { Field, FieldError, FieldHint, FieldLabel, Input } from "../primitives/field";
import CopyButton from "../ui/CopyButton";
import { toast } from "../ui/Toaster";

const STATUS: Record<string, string> = { pending: "Being checked", confirmed: "Received", failed: "Not confirmed" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" });
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`);

/**
 * The guest's payments: balance, the ways to pay the hotel offers (online
 * gateways only once they're set up), reporting a transfer, receipts and the
 * invoice, and WhatsApp updates.
 */
export default function GuestPayments({ o, gateways, whatsappHref }: { o: GuestPaymentOptions; gateways: string[]; whatsappHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const methods = useMemo(() => availableMethods(o.methods, gateways), [o.methods, gateways]);
  const firstUsable = methods.find((m) => m.configured && m.id !== "pay_at_hotel")?.id ?? methods[0]?.id ?? "pay_at_hotel";
  const [method, setMethod] = useState<MethodId>(firstUsable);
  const suggested = o.advance_due > 0 ? o.advance_due : o.payable;
  const [amount, setAmount] = useState(String(suggested || ""));
  const [txn, setTxn] = useState("");
  const [sender, setSender] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; txn?: string }>({});
  const [wa, setWa] = useState(o.whatsapp_consent);
  const [key] = useState(newKey);

  const info = methodInfo(method);
  const amt = Math.round(Number(amount));

  const validate = () => {
    const e: typeof errors = {};
    if (!Number.isInteger(amt) || amt < 1) e.amount = "Enter the amount in taka.";
    else if (amt > o.payable) e.amount = `That's more than the ${formatTaka(o.payable)} still to pay.`;
    if (info?.kind === "transfer" && !TXN_ID_RE.test(normaliseTxnId(txn))) e.txn = "Enter the transaction ID exactly as in your SMS or bank receipt (6–40 letters and numbers).";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!info || info.kind === "desk" || !validate()) return;
    start(async () => {
      if (info.kind === "transfer") {
        const r = await reportTransfer(info.id, amt, txn, sender);
        if (!r.ok) {
          if (r.code === "BAD_REFERENCE" || r.code === "DUPLICATE_REFERENCE") setErrors({ txn: r.message });
          else if (r.code === "BAD_AMOUNT") setErrors({ amount: r.message });
          else toast.error(r.message);
          return;
        }
        toast.success(r.message);
        setTxn("");
        setSender("");
        router.refresh();
      } else {
        const r = await startOnlinePayment(info.id, amt, key);
        if (!r.ok) return void toast.error(r.message);
        toast(r.message);
        if (r.redirect) window.location.assign(r.redirect);
      }
    });
  };

  const toggleWa = (on: boolean) =>
    start(async () => {
      const r = await setWhatsAppUpdates(on);
      if (r.ok) {
        setWa(on);
        toast.success(r.message);
      } else toast.error(r.message);
    });

  const checking = o.payments.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="pay-h">
        <h2 id="pay-h" className="h3">
          Payments
        </h2>
        <dl className="mt-5 grid grid-cols-3 gap-4 border-y border-line py-4 text-sm">
          <div>
            <dt className="caps text-bronze">Total</dt>
            <dd className="mt-1 text-lg">{formatTaka(o.total)}</dd>
          </div>
          <div>
            <dt className="caps text-bronze">Paid</dt>
            <dd className="mt-1 text-lg">{formatTaka(o.paid)}</dd>
          </div>
          <div>
            <dt className="caps text-bronze">Balance</dt>
            <dd className="mt-1 text-lg font-semibold">{formatTaka(o.balance)}</dd>
          </div>
        </dl>
        {checking > 0 && (
          <p className="mt-3 text-sm text-ink-soft" role="status">
            We&apos;re checking {formatTaka(checking)} you reported. It counts as paid once we confirm it.
          </p>
        )}
        {o.advance_due > 0 && (
          <p className="mt-3 text-sm">
            <strong>Advance due: {formatTaka(o.advance_due)}</strong>
            {o.payment_due_at ? ` by ${when(o.payment_due_at)}` : ""}. Unpaid advance bookings are released automatically.
          </p>
        )}
        <p className="mt-3 text-sm">
          <Link href="/booking/manage/invoice" className="text-link">
            View or print your invoice
          </Link>
        </p>
      </section>

      {o.open && o.payable > 0 && (
        <form onSubmit={submit} noValidate className="flex flex-col gap-6" aria-labelledby="how-h">
          <h3 id="how-h" className="caps text-bronze">
            How would you like to pay?
          </h3>
          <RadioGroup value={method} onValueChange={(v) => { setMethod(v as MethodId); setErrors({}); }} aria-labelledby="how-h">
            {methods.map((m) => {
              const mi = methodInfo(m.id)!;
              return (
                <RadioCard
                  key={m.id}
                  value={m.id}
                  disabled={!m.configured}
                  title={mi.label}
                  description={m.configured ? mi.guide : "Not available yet — choose another way, or pay at the hotel."}
                />
              );
            })}
          </RadioGroup>

          {info?.kind === "transfer" && info.account && (
            <dl className="grid gap-3 rounded-[var(--radius-1)] border border-line bg-ivory p-5 text-sm">
              {info.account.map((a) => (
                <div key={a.label} className="flex items-center justify-between gap-3">
                  <dt className="text-ink-soft">{a.label}</dt>
                  <dd className="flex items-center gap-2 font-medium">
                    {a.value}
                    <CopyButton text={a.copy} label={a.label} className="rounded-full p-1.5 hover:bg-sand" />
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-soft">Reference</dt>
                <dd className="flex items-center gap-2 font-medium">
                  {o.reference}
                  <CopyButton text={o.reference} label="Booking reference" className="rounded-full p-1.5 hover:bg-sand" />
                </dd>
              </div>
            </dl>
          )}

          {info && info.kind !== "desk" && (
            <>
              <Field invalid={Boolean(errors.amount)} required>
                <FieldLabel>Amount (৳)</FieldLabel>
                <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
                <FieldHint>
                  {o.advance_due > 0 ? `Advance ${formatTaka(o.advance_due)} · ` : ""}Up to {formatTaka(o.payable)}.
                  {o.advance_due > 0 && o.payable !== o.advance_due && (
                    <>
                      {" "}
                      <button type="button" className="text-link" onClick={() => setAmount(String(o.payable))}>
                        Pay the full balance
                      </button>
                    </>
                  )}
                </FieldHint>
                <FieldError>{errors.amount}</FieldError>
              </Field>
              {info.kind === "transfer" && (
                <>
                  <Field invalid={Boolean(errors.txn)} required>
                    <FieldLabel>Transaction ID</FieldLabel>
                    <Input value={txn} onChange={(e) => setTxn(e.target.value)} autoComplete="off" spellCheck={false} placeholder={info.id === "bank_transfer" ? "e.g. EBL-2611-55501" : "e.g. 9A7B6C5D4E"} />
                    <FieldHint>From the confirmation SMS or bank receipt. We check it against our statement.</FieldHint>
                    <FieldError>{errors.txn}</FieldError>
                  </Field>
                  <Field>
                    <FieldLabel>Sent from (optional)</FieldLabel>
                    <Input value={sender} onChange={(e) => setSender(e.target.value)} maxLength={60} placeholder={info.id === "bank_transfer" ? "Your bank and account name" : "The number you paid from"} />
                    <FieldHint>Helps us find it faster.</FieldHint>
                  </Field>
                </>
              )}
              <div>
                <Button type="submit" loading={pending}>
                  {info.kind === "transfer" ? "I've sent it — report payment" : `Pay ${Number.isInteger(amt) && amt > 0 ? formatTaka(amt) : ""} securely`}
                </Button>
                {info.kind === "gateway" && <p className="mt-3 text-xs text-ink-soft">You&apos;ll go to the payment partner&apos;s page. Your booking updates only when they confirm the payment to us.</p>}
              </div>
            </>
          )}
          {info?.kind === "desk" && <p className="text-sm text-ink-soft">{info.guide}</p>}
        </form>
      )}

      {o.payments.length > 0 && (
        <section aria-labelledby="hist-h">
          <h3 id="hist-h" className="caps text-bronze">
            Your payments
          </h3>
          <ul role="list" className="mt-3 divide-y divide-line border-y border-line text-sm">
            {o.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span>
                  <strong>{formatTaka(p.amount)}</strong> · {LEDGER_LABEL[p.method] ?? p.method}
                  {p.reference ? ` · ${p.reference}` : ""}
                  <span className="block text-xs text-ink-soft">
                    {STATUS[p.status]} · {when(p.received_at)}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                </span>
                {p.status === "confirmed" && (
                  <Link className="text-link text-xs" href={`/booking/manage/receipt/${p.id}`}>
                    Receipt {p.receipt_no}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="wa-h" className="rounded-[var(--radius-1)] border border-line p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="wa-h" className="font-medium">
              Booking updates on WhatsApp
            </h3>
            <p className="mt-1 text-sm text-ink-soft">
              Confirmations, changes, payment receipts and a reminder the day before you arrive. We always email you too. You can turn this off at any time.
            </p>
          </div>
          <Switch checked={wa} onCheckedChange={toggleWa} disabled={pending} aria-labelledby="wa-h" />
        </div>
        <p className="mt-3 text-sm">
          Prefer to chat?{" "}
          <a className="text-link" href={`${whatsappHref}?text=${encodeURIComponent(`Hello, about my booking ${o.reference}:`)}`} target="_blank" rel="noopener noreferrer">
            Message us on WhatsApp
          </a>
        </p>
      </section>
    </div>
  );
}

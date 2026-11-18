"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelMyBooking, requestDateChange } from "@/app/booking/manage/actions";
import { Button } from "@/components/primitives/button";
import { Field, FieldError, FieldHint, FieldLabel, Input } from "@/components/primitives/field";
import { addDays } from "@/lib/dates";

type Props = {
  reference: string;
  today: string;
  checkIn: string;
  checkOut: string;
  canCancel: boolean;
  cancelsInstantly: boolean;
  canChange: boolean;
  openRequests: { kind: "cancel" | "change" }[];
};

/**
 * Cancel or ask for new dates. Unpaid, unconfirmed bookings cancel at once;
 * otherwise the front desk receives a request and calls the guest. Date
 * changes are always requests: the desk applies them with the same
 * availability and pricing rules as a new booking.
 */
export default function ManageActions({ reference, today, checkIn, checkOut, canCancel, cancelsInstantly, canChange, openRequests }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "cancel" | "change">("none");
  const [reason, setReason] = useState("");
  const [dates, setDates] = useState({ checkIn, checkOut });
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const cancelAsked = openRequests.some((r) => r.kind === "cancel");

  // Keep the panel while it has something to say (e.g. "your booking is cancelled"
  // stays on screen after the refresh removes the actions).
  if (!canCancel && !canChange && !msg) return null;

  const doCancel = () =>
    start(async () => {
      const r = await cancelMyBooking(reason);
      if (!r.ok) return setMsg({ ok: false, text: r.message });
      setMode("none");
      setMsg({
        ok: true,
        text: r.outcome === "cancelled" ? `Booking ${reference} is cancelled and the rooms are released.` : "Your cancellation request is with our front desk. We'll call you to complete it.",
      });
      router.refresh();
    });

  const doChange = () =>
    start(async () => {
      const r = await requestDateChange(dates.checkIn, dates.checkOut, note);
      if (!r.ok) return setMsg({ ok: false, text: r.message });
      setMode("none");
      setMsg({
        ok: true,
        text:
          r.outcome === "available"
            ? "Request sent. Those dates are open right now; our front desk will call to confirm the change and any price difference."
            : "Request sent. Those dates look full at the moment, but our front desk will call you with the closest options.",
      });
      router.refresh();
    });

  return (
    <section aria-labelledby="manage-h" className="border border-line bg-ivory p-6 sm:p-8">
      <h2 id="manage-h" className="h4">
        Change or cancel
      </h2>
      {msg && (
        <p role="status" className={`mt-4 border-l-2 p-3 text-sm ${msg.ok ? "border-pine-800 bg-sand/60" : "border-destructive bg-sand/60"}`}>
          {msg.text}
        </p>
      )}

      {mode === "none" && (
        <div className="mt-5 flex flex-wrap gap-3">
          {canChange && (
            <Button variant="outline" onClick={() => setMode("change")}>
              Ask for new dates
            </Button>
          )}
          {canCancel && !cancelAsked && (
            <Button variant="outline" onClick={() => setMode("cancel")}>
              Cancel booking
            </Button>
          )}
          {cancelAsked && <p className="text-sm text-ink-soft">Your cancellation request is with our front desk.</p>}
        </div>
      )}

      {mode === "cancel" && (
        <div className="mt-5 flex flex-col gap-4">
          <p className="text-ink-soft">
            {cancelsInstantly
              ? "This cancels your booking straight away and releases the rooms. It can't be undone online."
              : "Because this booking is confirmed or has a payment, our front desk completes the cancellation and any refund under the hotel's policy. We'll call you."}
          </p>
          <Field>
            <FieldLabel>Reason (optional)</FieldLabel>
            <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button onClick={doCancel} loading={pending}>
              {cancelsInstantly ? "Cancel my booking" : "Send cancellation request"}
            </Button>
            <Button variant="ghost" onClick={() => setMode("none")} disabled={pending}>
              Keep my booking
            </Button>
          </div>
        </div>
      )}

      {mode === "change" && (
        <div className="mt-5 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field invalid={dates.checkIn < today}>
              <FieldLabel>New check-in</FieldLabel>
              <Input type="date" min={today} value={dates.checkIn} onChange={(e) => setDates((d) => ({ ...d, checkIn: e.target.value }))} />
              <FieldError>{dates.checkIn < today ? "Choose today or later." : undefined}</FieldError>
            </Field>
            <Field invalid={dates.checkOut <= dates.checkIn}>
              <FieldLabel>New check-out</FieldLabel>
              <Input type="date" min={addDays(dates.checkIn || today, 1)} value={dates.checkOut} onChange={(e) => setDates((d) => ({ ...d, checkOut: e.target.value }))} />
              <FieldError>{dates.checkOut <= dates.checkIn ? "Check-out must be after check-in." : undefined}</FieldError>
            </Field>
          </div>
          <Field>
            <FieldLabel>Anything else (optional)</FieldLabel>
            <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            <FieldHint>Same rooms and guests. For other changes, call or message us.</FieldHint>
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button onClick={doChange} loading={pending} disabled={dates.checkIn < today || dates.checkOut <= dates.checkIn}>
              Send request
            </Button>
            <Button variant="ghost" onClick={() => setMode("none")} disabled={pending}>
              Back
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// @vitest-environment jsdom
// Payment and messaging screens as staff and guests use them.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ok = (message = "Done") => Promise.resolve({ ok: true as const, message });
const fail = (message: string, code = "X") => Promise.resolve({ ok: false as const, code, message });

const pay = vi.hoisted(() => ({ verifyPayment: vi.fn(), resendMessage: vi.fn(), runMessageQueue: vi.fn(), setPaymentMethods: vi.fn() }));
const ops = vi.hoisted(() => ({ voidPayment: vi.fn(), requestRefund: vi.fn(), decideRefund: vi.fn(), completeRefund: vi.fn() }));
const guest = vi.hoisted(() => ({ reportTransfer: vi.fn(), startOnlinePayment: vi.fn(), setWhatsAppUpdates: vi.fn() }));
const toasts = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));

vi.mock("@/app/admin/payments", () => pay);
vi.mock("@/app/admin/operations", () => ops);
vi.mock("@/app/booking/manage/actions", () => guest);
vi.mock("@/components/ui/Toaster", () => ({ toast: toasts, default: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import LedgerPanel from "@/components/admin/LedgerPanel";
import MessageList from "@/components/admin/MessageList";
import GuestPayments from "@/components/booking/GuestPayments";
import type { LedgerRow, MessageRow, RefundRow } from "@/lib/data/payments";
import type { GuestPaymentOptions } from "@/lib/payments/guest";

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal: () => void; close: () => void };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const ME = "00000000-0000-4000-8000-000000000001";
const payment = (o: Partial<LedgerRow>): LedgerRow => ({
  id: "p1", booking_id: "b1", amount_bdt: 2000, method: "bkash", status: "pending", source: "guest", reference: "9AB12CD34", sender: "01711000000",
  note: null, review_note: null, receipt_no: null, received_at: "2026-11-18T08:00:00Z", created_at: "2026-11-18T08:00:00Z", void_reason: null, verified_at: null, ...o,
});
const allPerms = { record: true, void: true, refundRequest: true, refundApprove: true };

describe("staff: verifying reported transfers", () => {
  it("confirming asks first and names the transaction to look for", async () => {
    pay.verifyPayment.mockReturnValue(ok("Payment confirmed — receipt issued and the guest has been told"));
    render(<LedgerPanel bookingId="b1" reference="BSQ-1" payments={[payment({})]} refunds={[]} paid={0} perms={allPerms} live me={ME} />);
    expect(screen.getByText(/1 reported payment to check/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Confirm received" }));
    const d = screen.getByRole("dialog", { name: /Confirm ৳2,000 was received/ });
    expect(within(d).getByText(/transaction 9AB12CD34/)).toBeTruthy();
    await userEvent.click(within(d).getByRole("button", { name: "Confirm received" }));
    expect(pay.verifyPayment).toHaveBeenCalledWith("p1", true, "");
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith(expect.stringMatching(/receipt issued/)));
  });

  it("rejecting needs a reason the guest will see", async () => {
    pay.verifyPayment.mockReturnValue(ok());
    render(<LedgerPanel bookingId="b1" reference="BSQ-1" payments={[payment({})]} refunds={[]} paid={0} perms={allPerms} live me={ME} />);
    await userEvent.click(screen.getByRole("button", { name: "Not received" }));
    const d = screen.getByRole("dialog", { name: "Mark as not received?" });
    const submit = within(d).getByRole("button", { name: "Not received" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await userEvent.type(within(d).getByLabelText("Reason"), "Not in statement");
    await userEvent.click(submit);
    expect(pay.verifyPayment).toHaveBeenCalledWith("p1", false, "Not in statement");
  });

  it("without payments.record there's no verify button; confirmed payments show a receipt", () => {
    render(
      <LedgerPanel
        bookingId="b1"
        reference="BSQ-1"
        payments={[payment({}), payment({ id: "p2", status: "confirmed", source: "desk", receipt_no: "RCP-2026-000002", method: "cash", reference: null })]}
        refunds={[]}
        paid={2000}
        perms={{ record: false, void: false, refundRequest: false, refundApprove: false }}
        live
        me={ME}
      />,
    );
    expect(screen.queryByRole("button", { name: "Confirm received" })).toBeNull();
    expect(screen.getByRole("link", { name: "Receipt" }).getAttribute("href")).toBe("/admin/receipts/p2");
    expect(screen.getByRole("link", { name: "Invoice" }).getAttribute("href")).toBe("/admin/bookings/BSQ-1/invoice");
  });

  it("four eyes: the person who asked for a refund can't approve it", () => {
    const refund: RefundRow = { id: "r1", booking_id: "b1", payment_id: null, amount_bdt: 500, method: "cash", reason: "Cancelled early", status: "requested", reference: null, requested_by: ME, decided_by: null, created_at: "2026-11-18T08:00:00Z", completed_at: null };
    const { rerender } = render(<LedgerPanel bookingId="b1" reference="BSQ-1" payments={[]} refunds={[refund]} paid={500} perms={allPerms} live me={ME} />);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByText("Another colleague approves it")).toBeTruthy();
    rerender(<LedgerPanel bookingId="b1" reference="BSQ-1" payments={[]} refunds={[refund]} paid={500} perms={allPerms} live me="someone-else" />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  });
});

describe("staff: guest message delivery", () => {
  const msg = (o: Partial<MessageRow>): MessageRow => ({
    id: "m1", channel: "email", template: "booking_confirmation", booking_id: "b1", inquiry_id: null, recipient: "g@example.com", status: "failed",
    attempts: 5, max_attempts: 5, last_error: "Resend 422: Invalid `to`", next_attempt_at: "2026-11-18T08:00:00Z", created_at: "2026-11-18T08:00:00Z",
    sent_at: null, delivered_at: null, resent_from: null, data: { reference: "BSQ-1" }, ...o,
  });

  it("shows status and the reason it failed; resends only eligible messages", async () => {
    pay.resendMessage.mockReturnValue(ok("Queued again — it goes out within a minute"));
    render(
      <MessageList
        messages={[msg({}), msg({ id: "m2", status: "delivered", last_error: null, template: "pre_arrival" }), msg({ id: "m3", status: "unconfigured", channel: "whatsapp", last_error: "WhatsApp isn't set up" })]}
        canResend
        live
        showBooking
      />,
    );
    expect(screen.getByText("Resend 422: Invalid `to`")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Resend" })).toHaveLength(2); // failed + not set up, not delivered
    await userEvent.click(screen.getAllByRole("button", { name: "Resend" })[0]);
    expect(pay.resendMessage).toHaveBeenCalledWith("m1");
    await waitFor(() => expect(toasts.success).toHaveBeenCalled());
  });

  it("a message already resent, or a viewer without bookings.write, gets no resend button", () => {
    render(<MessageList messages={[msg({}), msg({ id: "m9", status: "queued", resent_from: "m1", last_error: null })]} canResend live />);
    expect(screen.queryByRole("button", { name: "Resend" })).toBeNull();
    cleanup();
    render(<MessageList messages={[msg({})]} canResend={false} live />);
    expect(screen.queryByRole("button", { name: "Resend" })).toBeNull();
  });
});

describe("guest: paying a booking", () => {
  const options = (o: Partial<GuestPaymentOptions> = {}): GuestPaymentOptions => ({
    reference: "BSQ-12345", status: "pending", total: 7000, paid: 0, balance: 7000, payable: 7000, advance_due: 3500, payment_due_at: null, open: true,
    methods: ["pay_at_hotel", "bank_transfer", "bkash_manual", "card"], whatsapp_consent: false, payments: [], ...o,
  });

  it("an offered gateway without credentials is shown but can't be chosen", () => {
    render(<GuestPayments o={options()} gateways={[]} whatsappHref="https://wa.me/8801805006900" />);
    const card = screen.getByRole("radio", { name: /Card/ });
    expect(card.hasAttribute("disabled") || card.getAttribute("data-disabled") !== null).toBe(true);
    expect(screen.getByText(/Not available yet/)).toBeTruthy();
  });

  it("reporting a transfer: shows our account, checks the ID and amount, then reports it", async () => {
    guest.reportTransfer.mockReturnValue(ok("Thank you — we'll check it"));
    render(<GuestPayments o={options()} gateways={[]} whatsappHref="https://wa.me/8801805006900" />);
    // Bank transfer is the first usable method.
    expect(screen.getByText("0091350000386")).toBeTruthy();
    const amount = screen.getByLabelText(/Amount/);
    expect((amount as HTMLInputElement).value).toBe("3500"); // the advance
    await userEvent.click(screen.getByRole("button", { name: /report payment/ }));
    expect(guest.reportTransfer).not.toHaveBeenCalled();
    expect(screen.getByText(/exactly as in your SMS/)).toBeTruthy();

    await userEvent.clear(amount);
    await userEvent.type(amount, "9000");
    await userEvent.type(screen.getByLabelText(/Transaction ID/), "EBL 2611 55501");
    await userEvent.click(screen.getByRole("button", { name: /report payment/ }));
    expect(screen.getByText(/more than the ৳7,000 still to pay/)).toBeTruthy();

    await userEvent.clear(amount);
    await userEvent.type(amount, "3500");
    await userEvent.click(screen.getByRole("button", { name: /report payment/ }));
    expect(guest.reportTransfer).toHaveBeenCalledWith("bank_transfer", 3500, "EBL 2611 55501", "");
    await waitFor(() => expect(toasts.success).toHaveBeenCalled());
  });

  it("a duplicate transaction ID is explained on the field", async () => {
    guest.reportTransfer.mockReturnValue(fail("That transaction ID has already been reported.", "DUPLICATE_REFERENCE"));
    render(<GuestPayments o={options()} gateways={[]} whatsappHref="https://wa.me/x" />);
    await userEvent.type(screen.getByLabelText(/Transaction ID/), "EBL-55501");
    await userEvent.click(screen.getByRole("button", { name: /report payment/ }));
    await waitFor(() => expect(screen.getByText("That transaction ID has already been reported.")).toBeTruthy());
  });

  it("online payment goes to the gateway only after the server says so", async () => {
    guest.startOnlinePayment.mockReturnValue(Promise.resolve({ ok: true, message: "Taking you…", redirect: "https://sandbox.sslcommerz.com/pay/abc" }));
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign }, configurable: true });
    render(<GuestPayments o={options()} gateways={["card"]} whatsappHref="https://wa.me/x" />);
    await userEvent.click(screen.getByRole("radio", { name: /Card/ }));
    await userEvent.click(screen.getByRole("button", { name: /Pay ৳3,500 securely/ }));
    expect(guest.startOnlinePayment).toHaveBeenCalledWith("card", 3500, expect.any(String));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://sandbox.sslcommerz.com/pay/abc"));
  });

  it("lists reported payments with their status, receipts, and the WhatsApp choice", async () => {
    guest.setWhatsAppUpdates.mockReturnValue(ok("We'll send booking updates to your WhatsApp too."));
    render(
      <GuestPayments
        o={options({
          paid: 2000,
          balance: 5000,
          payable: 4000,
          payments: [
            { id: "x1", amount: 2000, method: "bkash", reference: "9AB", status: "confirmed", receipt_no: "RCP-2026-000001", received_at: "2026-11-18T08:00:00Z", note: null },
            { id: "x2", amount: 1000, method: "bank", reference: "EBL1", status: "pending", receipt_no: null, received_at: "2026-11-18T09:00:00Z", note: null },
          ],
        })}
        gateways={[]}
        whatsappHref="https://wa.me/x"
      />,
    );
    expect(screen.getByText(/checking ৳1,000 you reported/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Receipt RCP-2026-000001/ }).getAttribute("href")).toBe("/booking/manage/receipt/x1");
    await userEvent.click(screen.getByRole("switch"));
    expect(guest.setWhatsAppUpdates).toHaveBeenCalledWith(true);
  });

  it("nothing left to pay → no payment form", () => {
    render(<GuestPayments o={options({ paid: 7000, balance: 0, payable: 0, advance_due: 0 })} gateways={[]} whatsappHref="https://wa.me/x" />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByRole("link", { name: /invoice/ })).toBeTruthy();
  });
});

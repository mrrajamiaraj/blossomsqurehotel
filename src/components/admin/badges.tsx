import { STATUS_LABEL } from "@/lib/data/rules";
import type { BookingSource, BookingStatus, PaymentStatus } from "@/lib/data/types";

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className="a-badge" data-s={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const PAYMENT_LABEL: Record<PaymentStatus, string> = { unpaid: "Unpaid", partial: "Part-paid", paid: "Paid" };

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className="a-badge" data-p={status}>
      {PAYMENT_LABEL[status]}
    </span>
  );
}

export const SOURCE_LABEL: Record<BookingSource, string> = {
  website: "Website",
  phone: "Phone",
  walk_in: "Walk-in",
  other: "Other",
};

import type { Metadata } from "next";
import Link from "next/link";
import NewBookingForm from "@/components/admin/NewBookingForm";
import { requireAdmin } from "@/lib/admin/session";
import { hotelToday } from "@/lib/dates";

export const metadata: Metadata = { title: "New booking" };

export default async function NewBookingPage() {
  const { repo } = await requireAdmin();
  const types = await repo.listRoomTypes({ includeUnpublished: true });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 8, fontSize: "0.8rem", color: "var(--a-muted)" }}>
        <Link href="/admin/bookings" className="a-link">
          Bookings
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">New</span>
      </nav>
      <header>
        <p className="a-eyebrow">Phone &amp; walk-in</p>
        <h1 className="a-title">New booking</h1>
      </header>
      <NewBookingForm
        today={hotelToday()}
        types={types.map((t) => ({ slug: t.slug, name: t.name, price: t.price_bdt, weekend: t.weekend_price_bdt, sleeps: t.sleeps, published: t.is_published }))}
      />
    </div>
  );
}

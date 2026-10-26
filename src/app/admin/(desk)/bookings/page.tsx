import type { Metadata } from "next";
import Link from "next/link";
import { PaymentBadge, SOURCE_LABEL, StatusBadge } from "@/components/admin/badges";
import { IChevronLeft, IChevronRight, IPlus, ISearch } from "@/components/admin/icons";
import { ago, stayLine } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/admin/session";
import type { BookingView } from "@/lib/data/types";
import { hotelToday } from "@/lib/dates";
import { formatTaka } from "@/lib/format";
import styles from "./bookings.module.css";

export const metadata: Metadata = { title: "Bookings" };

const VIEWS: { id: BookingView; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "requests", label: "To confirm" },
  { id: "arrivals", label: "Arriving today" },
  { id: "in_house", label: "In house" },
  { id: "departures", label: "Leaving today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

const PAGE_SIZE = 20;

type Params = { view?: string; q?: string; page?: string };

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { repo } = await requireAdmin();
  const params = await searchParams;
  const view = (VIEWS.find((v) => v.id === params.view)?.id ?? "active") as BookingView;
  const q = (params.q ?? "").slice(0, 60);
  const page = Math.max(1, Number(params.page) || 1);
  const today = hotelToday();

  const [{ rows, total }, types, rooms, counts] = await Promise.all([
    repo.listBookings({ view, q, page, pageSize: PAGE_SIZE, today }),
    repo.listRoomTypes({ includeUnpublished: true }),
    repo.listRooms(),
    // Live counts for the working views (cheap: count-only queries in Supabase).
    Promise.all(
      (["requests", "arrivals", "in_house", "departures"] as BookingView[]).map(async (v) => [
        v,
        (await repo.listBookings({ view: v, today, pageSize: 1 })).total,
      ]),
    ),
  ]);

  const countOf = Object.fromEntries(counts) as Record<string, number>;
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const roomNo = new Map(rooms.map((r) => [r.id, r.number]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: Partial<Params>) => {
    const s = new URLSearchParams({ view, ...(q ? { q } : {}), ...p } as Record<string, string>);
    if (s.get("page") === "1") s.delete("page");
    return `/admin/bookings?${s}`;
  };

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className="a-eyebrow">Reservations</p>
          <h1 className="a-title">Bookings</h1>
        </div>
        <Link href="/admin/bookings/new" className="a-btn a-btn--primary">
          <IPlus size={16} /> New booking
        </Link>
      </header>

      <nav className={styles.tabs} aria-label="Booking views">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={`/admin/bookings?view=${v.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`${styles.tab} ${v.id === view ? styles.tabOn : ""}`}
            aria-current={v.id === view ? "page" : undefined}
          >
            {v.label}
            {countOf[v.id] ? <span className="a-count">{countOf[v.id]}</span> : null}
          </Link>
        ))}
      </nav>

      <section className="a-panel">
        <form className={styles.toolbar} action="/admin/bookings" method="get" role="search">
          <input type="hidden" name="view" value={view} />
          <label className={styles.search}>
            <ISearch size={16} />
            <span className="sr-only">Search</span>
            <input name="q" type="search" defaultValue={q} placeholder="Guest name, phone, email or BSQ reference" className={styles.searchInput} />
          </label>
          <button type="submit" className="a-btn">
            Search
          </button>
          {q && (
            <Link href={`/admin/bookings?view=${view}`} className="a-btn a-btn--ghost">
              Clear
            </Link>
          )}
          <span className={styles.total} aria-live="polite">
            {total} {total === 1 ? "booking" : "bookings"}
          </span>
        </form>

        {rows.length ? (
          <div className="a-table-wrap">
            <table className="a-table a-table--stack">
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Stay</th>
                  <th>Room</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th className="a-right">Total</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td data-label="">
                      <Link href={`/admin/bookings/${b.reference}`} className="a-rowlink a-primary-cell">
                        <strong>{b.guest_name}</strong>
                        <span>
                          {b.reference} · {b.phone}
                        </span>
                      </Link>
                    </td>
                    <td data-label="Stay">
                      <span className="a-primary-cell">
                        <strong>{typeName.get(b.room_type_id)}</strong>
                        <span>{stayLine(b.check_in, b.check_out)}</span>
                      </span>
                    </td>
                    <td data-label="Room" className="a-num">
                      {b.rooms > 1 ? `${b.rooms} rooms` : b.room_id ? roomNo.get(b.room_id) : <span className="a-muted">—</span>}
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={b.status} />
                    </td>
                    <td data-label="Payment">
                      <PaymentBadge status={b.payment_status} />
                    </td>
                    <td data-label="Total" className="a-right a-num">
                      {formatTaka(b.total_bdt)}
                    </td>
                    <td data-label="Received" className="a-muted">
                      {ago(b.created_at)} · {SOURCE_LABEL[b.source]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="a-empty">
            <strong>{q ? "No bookings match that search" : "Nothing here"}</strong>
            <span>{q ? "Try a phone number, part of a name, or the BSQ reference." : "Bookings in this view will appear here."}</span>
          </div>
        )}

        {pages > 1 && (
          <nav className={styles.pager} aria-label="Pages">
            <Link
              href={href({ page: String(page - 1) })}
              className="a-btn a-btn--sm"
              aria-disabled={page <= 1}
              tabIndex={page <= 1 ? -1 : undefined}
            >
              <IChevronLeft size={15} /> Previous
            </Link>
            <span className="a-muted">
              Page {page} of {pages}
            </span>
            <Link
              href={href({ page: String(page + 1) })}
              className="a-btn a-btn--sm"
              aria-disabled={page >= pages}
              tabIndex={page >= pages ? -1 : undefined}
            >
              Next <IChevronRight size={15} />
            </Link>
          </nav>
        )}
      </section>
    </div>
  );
}

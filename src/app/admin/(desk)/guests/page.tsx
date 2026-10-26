import type { Metadata } from "next";
import Link from "next/link";
import { PaymentBadge, StatusBadge } from "@/components/admin/badges";
import { IChevronLeft, IChevronRight, ISearch } from "@/components/admin/icons";
import { longDate, stayLine } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/admin/session";
import { formatTaka } from "@/lib/format";

export const metadata: Metadata = { title: "Guests" };

const PAGE_SIZE = 25;

export default async function GuestsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; guest?: string }> }) {
  const { repo } = await requireAdmin();
  const { q = "", page: p, guest } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const [{ rows, total }, history, types] = await Promise.all([
    repo.guests(q.slice(0, 60), page, PAGE_SIZE),
    guest ? repo.bookingsForGuest(guest.slice(0, 160)) : Promise.resolve([]),
    repo.listRoomTypes({ includeUnpublished: true }),
  ]);
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (extra: Record<string, string>) => `/admin/guests?${new URLSearchParams({ ...(q ? { q } : {}), ...(page > 1 ? { page: String(page) } : {}), ...extra })}`;
  const selected = guest ? rows.find((r) => r.key === guest) : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header>
        <p className="a-eyebrow">Directory</p>
        <h1 className="a-title">Guests</h1>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: guest ? "minmax(0, 1.3fr) minmax(0, 1fr)" : "minmax(0, 1fr)", gap: 20, alignItems: "start" }} className="guests-grid">
        <section className="a-panel">
          <form action="/admin/guests" method="get" role="search" style={{ display: "flex", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--a-line)", flexWrap: "wrap" }}>
            <label style={{ flex: "1 1 260px", display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--a-line-strong)", borderRadius: 3, padding: "0 12px", color: "var(--a-muted)", minHeight: 38 }}>
              <ISearch size={16} />
              <span className="sr-only">Search guests</span>
              <input name="q" type="search" defaultValue={q} placeholder="Name, phone or email" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", font: "inherit", fontSize: "max(16px, 0.875rem)", background: "transparent", color: "var(--a-ink)" }} />
            </label>
            <button type="submit" className="a-btn">
              Search
            </button>
          </form>

          {rows.length ? (
            <div className="a-table-wrap">
              <table className="a-table a-table--stack">
                <thead>
                  <tr>
                    <th>Guest</th>
                    <th className="a-right">Stays</th>
                    <th className="a-right">Nights</th>
                    <th className="a-right">Spend</th>
                    <th>Last arrival</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g) => (
                    <tr key={g.key} style={g.key === guest ? { background: "var(--a-brass-soft)" } : undefined}>
                      <td data-label="">
                        <Link href={link({ guest: g.key })} className="a-rowlink a-primary-cell" scroll={false} aria-current={g.key === guest ? "true" : undefined}>
                          <strong>
                            {g.guest_name}
                            {g.upcoming && (
                              <span className="a-badge" data-s="confirmed" style={{ marginLeft: 8, verticalAlign: 1 }}>
                                Upcoming
                              </span>
                            )}
                          </strong>
                          <span>
                            {g.phone}
                            {g.email ? ` · ${g.email}` : ""}
                          </span>
                        </Link>
                      </td>
                      <td data-label="Stays" className="a-right a-num">
                        {g.stays}
                      </td>
                      <td data-label="Nights" className="a-right a-num">
                        {g.nights}
                      </td>
                      <td data-label="Spend" className="a-right a-num">
                        {formatTaka(g.spend_bdt)}
                      </td>
                      <td data-label="Last arrival" className="a-muted">
                        {longDate(g.last_check_in).replace(/^\w+, /, "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="a-empty">
              <strong>{q ? "No guests match" : "No guests yet"}</strong>
              <span>Guests appear here after their first booking.</span>
            </div>
          )}

          {pages > 1 && (
            <nav aria-label="Pages" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid var(--a-line)", fontSize: "0.8rem" }}>
              <Link href={`/admin/guests?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page - 1) })}`} className="a-btn a-btn--sm" aria-disabled={page <= 1}>
                <IChevronLeft size={15} /> Previous
              </Link>
              <span className="a-muted">
                Page {page} of {pages}
              </span>
              <Link href={`/admin/guests?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}`} className="a-btn a-btn--sm" aria-disabled={page >= pages}>
                Next <IChevronRight size={15} />
              </Link>
            </nav>
          )}
        </section>

        {guest && (
          <aside className="a-panel" aria-label="Guest history" style={{ position: "sticky", top: 84 }}>
            <div className="a-panel-head">
              <div>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 500, color: "var(--a-pine)", lineHeight: 1.1 }}>
                  {selected?.guest_name ?? history[0]?.guest_name ?? "Guest"}
                </h2>
                <p className="a-muted" style={{ fontSize: "0.78rem" }}>
                  {history.length} {history.length === 1 ? "booking" : "bookings"}
                </p>
              </div>
              <Link href={link({})} className="a-btn a-btn--ghost a-btn--sm" scroll={false}>
                Close
              </Link>
            </div>
            <ol role="list" style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {history.map((b) => (
                <li key={b.id} style={{ borderTop: "1px solid var(--a-line)" }}>
                  <Link href={`/admin/bookings/${b.reference}`} className="a-rowlink" style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 20px" }}>
                    <span className="a-primary-cell">
                      <strong>{typeName.get(b.room_type_id)}</strong>
                      <span>
                        {stayLine(b.check_in, b.check_out)} · {b.reference}
                      </span>
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <StatusBadge status={b.status} />
                      <PaymentBadge status={b.payment_status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
    </div>
  );
}

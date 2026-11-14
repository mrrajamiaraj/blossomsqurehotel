import { bookingsCsv } from "@/lib/admin/reports";
import { requireAdmin } from "@/lib/admin/session";
import { addDays, hotelToday, isISODate, nightsBetween } from "@/lib/dates";

/** CSV of every booking with at least one night in [from, to] (inclusive), any status. */
export async function GET(request: Request) {
  const { repo } = await requireAdmin();
  const url = new URL(request.url);
  const today = hotelToday();
  let from = url.searchParams.get("from") ?? "";
  let to = url.searchParams.get("to") ?? "";
  if (!isISODate(from)) from = addDays(today, -29);
  if (!isISODate(to)) to = today;
  if (from > to) [from, to] = [to, from];
  if (nightsBetween(from, to) > 730) from = addDays(to, -730);

  const [rows, types, rooms] = await Promise.all([
    repo.bookingsBetween(from, addDays(to, 1)),
    repo.listRoomTypes({ includeUnpublished: true }),
    repo.listRooms(),
  ]);

  const csv = bookingsCsv(
    rows,
    new Map(types.map((t) => [t.id, t.name])),
    new Map(rooms.map((r) => [r.id, r.number])),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="blossom-square-bookings-${from}-to-${to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

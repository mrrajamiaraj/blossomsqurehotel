import { isLive, overlaps } from "../data/rules";
import type { Booking, BookingLine, RoomUnit } from "../data/types";

/**
 * Rooms a booking (or one of its lines) could be moved into: same type, in
 * service, and not held by another live stay on any of its nights. Others are
 * listed disabled with the reason, so staff see why. The database is the
 * final check.
 *
 * `lines` are the reserved-room lines around the stay (multi-room bookings
 * keep their rooms there); `others` are the bookings, for guest names.
 */
export function roomOptions(
  booking: Booking,
  rooms: RoomUnit[],
  others: Booking[],
  opts: { typeId?: string; lineId?: string; lines?: BookingLine[] } = {},
) {
  const typeId = opts.typeId ?? booking.room_type_id;
  const guest = (bookingId: string) => others.find((o) => o.id === bookingId)?.guest_name.split(" ")[0] ?? "another booking";
  return rooms
    .filter((r) => r.room_type_id === typeId)
    .map((r) => {
      const clashLine = opts.lines?.find(
        (l) => l.id !== opts.lineId && l.room_id === r.id && l.active && overlaps(l.check_in, l.check_out, booking.check_in, booking.check_out),
      );
      const clashBooking = others.find(
        (o) => o.id !== booking.id && o.room_id === r.id && isLive(o.status) && overlaps(o.check_in, o.check_out, booking.check_in, booking.check_out),
      );
      const takenBy = clashLine ? (clashLine.booking_id === booking.id ? "another room of this booking" : guest(clashLine.booking_id)) : clashBooking ? guest(clashBooking.id) : null;
      const note = r.out_of_service ? "out of service" : takenBy ? `taken by ${takenBy}` : r.housekeeping === "dirty" ? "needs cleaning" : undefined;
      return { id: r.id, number: r.number, note, disabled: r.out_of_service || Boolean(takenBy) };
    });
}

import { isLive, overlaps } from "../data/rules";
import type { Booking, RoomUnit } from "../data/types";

/**
 * Rooms a booking could be moved into: same type, in service, and not held
 * by another live stay on any of its nights. Others are listed disabled with
 * the reason, so staff see why.
 */
export function roomOptions(booking: Booking, rooms: RoomUnit[], others: Booking[]) {
  return rooms
    .filter((r) => r.room_type_id === booking.room_type_id)
    .map((r) => {
      const clash = others.find(
        (o) => o.id !== booking.id && o.room_id === r.id && isLive(o.status) && overlaps(o.check_in, o.check_out, booking.check_in, booking.check_out),
      );
      const note = r.out_of_service ? "out of service" : clash ? `taken by ${clash.guest_name.split(" ")[0]}` : r.housekeeping === "dirty" ? "needs cleaning" : undefined;
      return { id: r.id, number: r.number, note, disabled: r.out_of_service || Boolean(clash) };
    });
}

// Room status as housekeeping sees it. Shared by server and browser code.

/** The six statuses: four set by staff, "occupied" and "out of service" derived. */
export type RoomStatus = "dirty" | "cleaning" | "clean" | "inspected" | "occupied" | "out_of_service";

export function roomStatus(r: { housekeeping: "dirty" | "cleaning" | "clean" | "inspected"; out_of_service: boolean; occupied: boolean }): RoomStatus {
  if (r.out_of_service) return "out_of_service";
  if (r.occupied && r.housekeeping !== "cleaning") return "occupied";
  return r.housekeeping;
}

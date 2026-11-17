"use client";

import { Button } from "@/components/primitives/button";
import { downloadStayEvent } from "@/lib/ics";
import { Calendar, Print } from "../icons";

/** Add-to-calendar and print, for a booking the server has already returned. */
export default function BookingActions({ reference, room, checkIn, checkOut }: { reference: string; room: string; checkIn: string; checkOut: string }) {
  return (
    <div className="flex flex-wrap gap-3 print:hidden">
      <Button type="button" onClick={() => downloadStayEvent({ reference, room, checkIn, checkOut })}>
        <Calendar size={16} />
        Add to calendar
      </Button>
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <Print />
        Print
      </Button>
    </div>
  );
}

import { HOTEL } from "./hotel";

function escape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
}

/** Downloads an all-day calendar event spanning the stay. */
export function downloadStayEvent(opts: { reference: string; room: string; checkIn: string; checkOut: string }) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Blossom Square//Booking//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${opts.reference}@blossomsquare`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${opts.checkIn.replace(/-/g, "")}`,
    `DTEND;VALUE=DATE:${opts.checkOut.replace(/-/g, "")}`,
    `SUMMARY:${escape(`${HOTEL.fullName} — ${opts.room}`)}`,
    `LOCATION:${escape(HOTEL.address)}`,
    `DESCRIPTION:${escape(
      `Booking ${opts.reference}\nCheck-in from ${HOTEL.checkIn}, check-out until ${HOTEL.checkOut}.\nReservations ${HOTEL.phones[0].display}`,
    )}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `blossom-square-${opts.reference}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

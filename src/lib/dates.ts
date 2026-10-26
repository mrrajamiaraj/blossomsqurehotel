// Dates travel as ISO "yyyy-mm-dd" strings and are handled in UTC so the
// day a guest picks never shifts with the browser's timezone.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isISODate(value: unknown): value is string {
  return typeof value === "string" && ISO_RE.test(value) && !Number.isNaN(toDate(value).getTime());
}

/** Today's date at the hotel (Asia/Dhaka), as ISO. */
export function hotelToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((toDate(checkOut).getTime() - toDate(checkIn).getTime()) / 86_400_000);
}

/** "Fri, 12 Dec" */
export function formatShort(iso: string): string {
  const d = toDate(iso);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Fri, 12 Dec 2026" */
export function formatLong(iso: string): string {
  return `${formatShort(iso)} ${toDate(iso).getUTCFullYear()}`;
}

/** "12 – 15 Dec 2026", "30 Dec 2026 – 2 Jan 2027" */
export function formatRange(checkIn: string, checkOut: string): string {
  const a = toDate(checkIn);
  const b = toDate(checkOut);
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const sameMonth = sameYear && a.getUTCMonth() === b.getUTCMonth();
  const end = `${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  if (sameMonth) return `${a.getUTCDate()} – ${end}`;
  if (sameYear) return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${end}`;
  return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()} – ${end}`;
}

export function dayOrdinal(iso: string): string {
  const n = toDate(iso).getUTCDate();
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${n}${suffix}`;
}

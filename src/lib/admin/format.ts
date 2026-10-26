import { formatShort, MONTHS_LONG, nightsBetween, toDate } from "../dates";

const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Wednesday, 28 October 2026" */
export function longDate(iso: string): string {
  const d = toDate(iso);
  return `${DAYS_LONG[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "28 Oct – 31 Oct · 3 nights" */
export function stayLine(checkIn: string, checkOut: string): string {
  const n = nightsBetween(checkIn, checkOut);
  return `${formatShort(checkIn).slice(5)} – ${formatShort(checkOut).slice(5)} · ${n} ${n === 1 ? "night" : "nights"}`;
}

/** "12 min ago", "3 h ago", "2 days ago", or a date. */
export function ago(isoTime: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(isoTime).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(isoTime).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
}

/** "28 Oct 2026, 14:05" in hotel time. */
export function dateTime(isoTime: string): string {
  return new Date(isoTime).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  });
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Dhaka" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

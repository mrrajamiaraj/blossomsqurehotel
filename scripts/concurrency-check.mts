// Fires truly simultaneous requests at a real Supabase project through the
// public API (publishable key only, exactly like the website) and checks the
// booking engine never oversells or double-creates.
//
//   $env:CHECK_URL = "https://<ref>.supabase.co"; $env:CHECK_KEY = "<publishable key>"
//   npx tsx scripts/concurrency-check.mts
//
// Use a STAGING project: it creates holds and test bookings (then cancels them).
import { randomUUID } from "node:crypto";

const URL_ = process.env.CHECK_URL;
const KEY = process.env.CHECK_KEY;
if (!URL_ || !KEY) throw new Error("Set CHECK_URL and CHECK_KEY");
if (/sbzwlizkllzjpbqjhued/.test(URL_)) throw new Error("Refusing to run against production");

async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return res.ok ? { ok: true, data: json as T } : { ok: false, error: String(json?.message ?? res.status) };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const offset = 150 + Math.floor(Math.random() * 150);
const inD = new Date(Date.now() + offset * 86400000);
const outD = new Date(inD.getTime() + 2 * 86400000);
const [check_in, check_out] = [iso(inD), iso(outD)];
const slug = "deluxe-couple";
let failures = 0;
const check = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

type Hold = { token: string; quote: { total: number } };
type Confirm = { reference: string; manage_token: string; replayed: boolean };

const avail = await rpc<{ slug: string; available: number }[]>("room_availability", { p_check_in: check_in, p_check_out: check_out });
if (!avail.ok) throw new Error(avail.error);
const free = avail.data.find((r) => r.slug === slug)!.available;
console.log(`${slug}, ${check_in} → ${check_out}: ${free} free before the test`);

// 1. 25 simultaneous holds for one room each: exactly `free` may succeed.
const N = 25;
const holds = await Promise.all(
  Array.from({ length: N }, () => rpc<Hold>("create_hold", { p_check_in: check_in, p_check_out: check_out, p_adults: 2, p_children: 0, p_lines: [{ room_type: slug }] })),
);
const won = holds.filter((h) => h.ok) as { ok: true; data: Hold }[];
const lost = holds.filter((h) => !h.ok) as { ok: false; error: string }[];
check(won.length === free, `${N} simultaneous holds → ${won.length} succeeded (expected ${free})`);
check(lost.every((l) => l.error === "SOLD_OUT"), `the other ${lost.length} were refused with SOLD_OUT`);
const after = await rpc<{ slug: string; available: number }[]>("room_availability", { p_check_in: check_in, p_check_out: check_out });
check(after.ok && after.data.find((r) => r.slug === slug)!.available === 0, "availability now shows 0");

// 2. The same confirmation sent 10 times at once (double-click / retries) → one booking.
const h = won[0].data;
const key = randomUUID();
const email = `concurrency+${randomUUID().slice(0, 8)}@example.com`;
const confirmArgs = {
  p_token: h.token, p_idempotency_key: key, p_guest_name: "Concurrency Test", p_email: email,
  p_phone: `+88017${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`, p_country: "Bangladesh",
  p_arrival: "", p_requests: "Automated concurrency test — safe to ignore", p_airport_pickup: false,
  p_payment_option: "pay_at_hotel", p_quoted_total: h.quote.total,
};
const confirms = await Promise.all(Array.from({ length: 10 }, () => rpc<Confirm>("confirm_hold", confirmArgs)));
const refs = new Set(confirms.filter((c) => c.ok).map((c) => (c as { data: Confirm }).data.reference));
check(confirms.every((c) => c.ok), `10 simultaneous confirmations all answered (${confirms.filter((c) => !c.ok).map((c) => (c as { error: string }).error).join(", ") || "no errors"})`);
check(refs.size === 1, `…with one booking reference (${[...refs].join(", ")})`);
check(confirms.filter((c) => c.ok && !(c as { data: Confirm }).data.replayed).length === 1, "exactly one created it; the rest were replays");

// 3. A tampered price is refused.
if (won[1]) {
  const tampered = await rpc<Confirm>("confirm_hold", { ...confirmArgs, p_token: won[1].data.token, p_idempotency_key: randomUUID(), p_quoted_total: 1 });
  check(!tampered.ok && tampered.error === "PRICE_CHANGED", `a confirmation claiming ৳1 is refused (${tampered.ok ? "accepted!" : tampered.error})`);
}

// 4. Clean up: release the other holds, cancel the test booking with its private token.
await Promise.all(won.slice(1).map((w) => rpc("release_hold", { p_token: w.data.token })));
const manage = (confirms.find((c) => c.ok) as { data: Confirm }).data.manage_token;
const cancelled = await rpc<string>("guest_cancel", { p_token: manage, p_reason: "Automated concurrency test" });
check(cancelled.ok && cancelled.data === "cancelled", "test booking cancelled by the guest link");
const end = await rpc<{ slug: string; available: number }[]>("room_availability", { p_check_in: check_in, p_check_out: check_out });
check(end.ok && end.data.find((r) => r.slug === slug)!.available === free, `availability back to ${free}`);

// 5. Private data: the reference alone reveals nothing; the token view is masked.
const peek = await rpc<unknown>("guest_booking", { p_token: "0".repeat(64) });
check(!peek.ok && peek.error === "ACCESS_EXPIRED", "a guessed token is refused");
const view = await rpc<{ email: string }>("guest_booking", { p_token: manage });
check(view.ok && view.data.email.includes("•••") && !view.data.email.includes("concurrency+"), `guest view masks the email (${view.ok ? view.data.email : view.error})`);
const direct = await fetch(`${URL_}/rest/v1/bookings?select=*`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
check(direct.status === 401 || direct.status === 403 || JSON.stringify(await direct.json()) === "[]", "the bookings table can't be read with the public key");

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);

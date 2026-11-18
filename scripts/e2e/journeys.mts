// End-to-end journeys in a real (headless) Chrome against a running site.
//
//   E2E_BASE=http://localhost:3100  E2E_PASSWORD=…  E2E_OUT=<dir>  npx tsx scripts/e2e/journeys.mts
//
// Run it against STAGING (the app started with the staging Supabase project):
// it creates and cancels bookings and signs in as the staging test staff
// (desk@ / hk@ / editor@ / owner@staging.test). Never point it at production.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { Browser, sleep, totp } from "./browser.mts";

const BASE = (process.env.E2E_BASE ?? "http://localhost:3100").replace(/\/$/, "");
const PASSWORD = process.env.E2E_PASSWORD ?? "";
const OUT = process.env.E2E_OUT ?? "e2e-results";
if (/blossomsquare\.online/.test(BASE)) throw new Error("Refusing to run journeys against production.");
if (!PASSWORD) throw new Error("Set E2E_PASSWORD (staging test staff password).");

type Result = { journey: string; step: string; ok: boolean; ms: number; detail: string; shot?: string };
const results: Result[] = [];
const facts: Record<string, unknown> = {};
let b: Browser;

const dhaka = (offsetDays = 0) => new Date(Date.now() + 6 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);

async function step(journey: string, name: string, fn: () => Promise<string | void>): Promise<boolean> {
  const t = Date.now();
  const shot = path.join(OUT, `${slug(journey)}--${slug(name)}.png`);
  try {
    const detail = (await fn()) ?? "";
    await b.screenshot(shot).catch(() => undefined);
    results.push({ journey, step: name, ok: true, ms: Date.now() - t, detail, shot });
    console.log(`  ✓ ${journey} › ${name}${detail ? ` — ${detail}` : ""}`);
    return true;
  } catch (err) {
    await b.screenshot(shot).catch(() => undefined);
    const detail = (err as Error).message.slice(0, 400);
    results.push({ journey, step: name, ok: false, ms: Date.now() - t, detail, shot });
    console.log(`  ✗ ${journey} › ${name} — ${detail}`);
    return false;
  }
}
const skip = (journey: string, name: string, why: string) => {
  results.push({ journey, step: name, ok: false, ms: 0, detail: `SKIPPED: ${why}` });
  console.log(`  - ${journey} › ${name} — skipped (${why})`);
};

const js = (s: string) => JSON.stringify(s);
const click = (sel: string, text?: string) => b.eval(`__h.click(${js(sel)}${text !== undefined ? `, ${js(text)}` : ""})`);
const fill = (label: string, v: string) => b.eval(`__h.fill(${js(label)}, ${js(v)})`);
const text = () => b.eval<string>("__h.text()");

async function signIn(email: string) {
  await b.clearCookies();
  await b.goto(`${BASE}/admin/login`);
  await b.waitFor("document.querySelector('input[name=email]')");
  await b.eval(`__h.set(document.querySelector('input[name=email]'), ${js(email)})`);
  await b.eval(`__h.set(document.querySelector('input[name=password]'), ${js(PASSWORD)})`);
  await click("button[type=submit]", "Sign in");
  await b.waitFor("!location.pathname.startsWith('/admin/login')", 20_000, "leave the sign-in page");
}

/* =============================================================== guest */

async function guest() {
  const J = "Guest";
  const IN = dhaka(45);
  const OUT2 = dhaka(47);
  const phone = `+880 1712 ${String(Date.now()).slice(-6)}`;
  let ref = "";
  let total = "";

  await step(J, "1. Homepage loads with rooms, booking entry and no broken images", async () => {
    await b.goto(`${BASE}/`);
    const h1 = await b.eval<string>("document.querySelector('h1')?.innerText ?? ''");
    if (!h1) throw new Error("No h1");
    const broken = await b.eval<string[]>("[...document.images].filter(i => i.complete && i.naturalWidth === 0 && !i.loading?.includes('lazy')).map(i => i.src)");
    if (broken.length) throw new Error(`Broken images: ${broken.join(", ")}`);
    const bookLink = await b.eval<boolean>("[...document.querySelectorAll('a[href^=\"/booking\"], form[action=\"/booking\"]')].length > 0");
    if (!bookLink) throw new Error("No booking link or search form");
    return `h1 "${h1.slice(0, 60)}"`;
  });

  await step(J, "2. Search availability for 2 nights, 2 adults", async () => {
    await b.goto(`${BASE}/booking?checkIn=${IN}&checkOut=${OUT2}&adults=2&children=0&rooms=1`);
    await b.waitText("Choose your rooms");
    const t = await text();
    if (/Online booking is paused/.test(t)) throw new Error("Booking engine offline");
    const free = await b.eval<number>("__h.all('button', 'Add a').filter(x => !x.disabled).length");
    if (!free) throw new Error("No room can be added");
    return `${free} room types available`;
  });

  await step(J, "3. Select a Deluxe Couple", async () => {
    await click("button", "Add a Deluxe Couple");
    await b.waitFor("__h.all('[aria-label]', '1 Deluxe Couple selected').length > 0", 5000, "1 selected");
  });

  await step(J, "4. Hold the room; the stay is priced on the server", async () => {
    await click("button", "Hold rooms & continue");
    await b.waitText("staying", 20_000);
    const t = await text();
    const m = t.match(/Total[\s\S]{0,40}?(৳[\d,]+)/);
    return m ? `summary total ${m[1]}` : "held";
  });

  await step(J, "5. Enter guest details (with validation)", async () => {
    await click("button", "Review booking");
    await sleep(300);
    const errs = await b.eval<number>("document.querySelectorAll('[aria-invalid=\"true\"]').length");
    if (!errs) throw new Error("Empty form was accepted");
    await fill("Full name", "Asha E2E Rahman");
    // Unique per run: the engine allows 3 website bookings per hour per email/phone.
    await fill("Email", `asha.e2e.${Date.now().toString(36)}@example.com`);
    await fill("Mobile", phone);
    await click("button", "Review booking");
    await b.waitText("Step three");
    return `empty form showed ${errs} errors`;
  });

  await step(J, "6. Reserve (terms required, price as quoted)", async () => {
    const btn = await b.eval<string>("__h.one('button', 'Reserve ·').innerText");
    total = (btn.match(/৳[\d,]+/) ?? [""])[0];
    await click("button", "Reserve ·");
    await sleep(400);
    if ((await b.url()).includes("/booking/confirmation")) throw new Error("Reserved without accepting the terms");
    await b.eval("__h.tick('I agree')");
    await click("button", "Reserve ·");
    await b.waitFor("location.pathname.startsWith('/booking/confirmation')", 30_000, "confirmation page");
    return `button showed ${total}`;
  });

  await step(J, "7. Confirmation shows the reference and total", async () => {
    await b.waitFor("/BSQ-\\d{5}/.test(__h.text())", 15_000, "reference");
    const t = await text();
    ref = t.match(/BSQ-\d{5}/)![0];
    facts.guestReference = ref;
    facts.guestQuotedTotal = total;
    if (total && !t.includes(total)) throw new Error(`Total ${total} not on the confirmation page`);
    return ref;
  });

  if (!ref) return skip(J, "8–9", "no booking reference");

  await step(J, "8a. Lookup with the wrong contact is refused without revealing anything", async () => {
    await b.clearCookies();
    await b.goto(`${BASE}/booking/lookup`);
    await fill("Booking reference", ref);
    await fill("Phone or email", "01999000111");
    await click("button[type=submit]", "Find my booking");
    await b.waitText("couldn't find a booking");
    if ((await b.url()).includes("/booking/manage")) throw new Error("Opened with the wrong contact");
  });

  await step(J, "8b. Lookup with reference + phone opens the booking (contact masked)", async () => {
    await fill("Phone or email", phone);
    await click("button[type=submit]", "Find my booking");
    await b.waitFor("location.pathname === '/booking/manage'", 20_000, "manage page");
    await b.waitText(ref, 20_000);
    await b.waitText("Transaction ID", 20_000);
    const t = await text();
    if (!t.includes(ref)) throw new Error("Reference missing");
    if (/asha\.e2e\.[a-z0-9]+@example\.com/.test(t)) throw new Error("Email shown unmasked");
    if (!t.includes("Payments")) throw new Error("No payments section");
    return "masked contact; payments section present";
  });

  await step(J, "8c. Report a bank transfer (pending until staff verify)", async () => {
    await fill("Transaction ID", `E2E-${Date.now().toString().slice(-8)}`);
    await click("button", "report payment");
    await b.waitText("Being checked", 15_000);
  });

  await step(J, "8d. Invoice opens with a number and balance", async () => {
    await b.goto(`${BASE}/booking/manage/invoice`);
    await b.waitFor("/INV-\\d{4}-\\d{5}/.test(__h.text())", 15_000, "invoice number");
    const t = await text();
    if (!/Balance due/.test(t)) throw new Error("No balance line");
    return t.match(/INV-\d{4}-\d{5}/)![0];
  });

  await step(J, "9a. Ask for new dates", async () => {
    await b.goto(`${BASE}/booking/manage`);
    await b.waitText("Ask for new dates", 20_000);
    await click("button", "Ask for new dates");
    await sleep(300);
    const submit = await b.eval<string>("__h.all('button').map(x => __h.norm(x.textContent)).find(t => /request|send/i.test(t) && !/cancel/i.test(t)) ?? ''");
    if (!submit) throw new Error("No request button");
    await click("button", submit.trim());
    await b.waitText("Request sent", 15_000);
  });

  await step(J, "9b. Cancel the booking (unpaid, so it cancels at once)", async () => {
    await b.goto(`${BASE}/booking/manage`);
    await b.waitText("Cancel booking", 20_000);
    await click("button", "Cancel booking");
    await click("button", "Cancel my booking");
    await b.waitText("is cancelled and the rooms are released", 15_000);
    await sleep(1500); // after the refresh, the confirmation must still be on screen
    await b.waitText("is cancelled and the rooms are released", 3_000);
    await b.goto(`${BASE}/booking/manage`);
    await b.waitText("Cancelled", 15_000);
  });
}

/* =============================================================== staff */

async function staff() {
  const J = "Staff";
  const today = dhaka(0);
  let ref = "";
  let roomNo = "";

  if (!(await step(J, "1. Receptionist signs in", () => signIn("desk@staging.test").then(() => b.url()))))
    return skip(J, "2–7", "sign-in failed");

  await step(J, "2. Receptionist sees today's board (arrivals / in-house)", async () => {
    await b.goto(`${BASE}/admin`);
    const t = await text();
    if (!/Arriv/i.test(t)) throw new Error("No arrivals section");
  });

  await step(J, "3. Receptionist creates a walk-in booking", async () => {
    await b.goto(`${BASE}/admin/bookings/new`);
    await b.waitText("Room type");
    await fill("Arrive", today);
    await fill("Depart", dhaka(1));
    await b.waitFor("__h.text().includes('free for these dates')", 15_000, "availability");
    await b.eval("__h.one('label', 'Deluxe Couple').click()");
    await fill("Full name", "Walk-in E2E Guest");
    await fill("Phone", "+8801911000555");
    await fill("Booked by", "walk_in");
    await b.eval("__h.tick('Confirm now')");
    await click("button[type=submit]", "Create booking");
    await b.waitFor("/\\/admin\\/bookings\\/BSQ-\\d{5}/.test(location.pathname)", 30_000, "booking page");
    ref = (await b.url()).match(/BSQ-\d{5}/)![0];
    facts.walkInReference = ref;
    return ref;
  });
  if (!ref) return skip(J, "4–7", "no walk-in booking");

  await step(J, "4. Assign a room and check the guest in", async () => {
    const opt = await b.eval<{ value: string; text: string }>(
      "(() => { const s = document.querySelector('select[aria-label=\"Assign room\"]'); const o = [...s.options].find(o => o.value && !o.disabled); return { value: o.value, text: o.text }; })()",
    );
    roomNo = opt.text.split(" ")[0];
    await b.eval(`__h.set(document.querySelector('select[aria-label="Assign room"]'), ${js(opt.value)})`);
    await b.waitText("Room " + roomNo, 15_000).catch(() => undefined);
    await sleep(1200);
    await b.goto(await b.url());
    await click("button", "Check in");
    await b.waitFor("__h.all('button', 'Check out').length > 0", 20_000, "Check out button");
    facts.walkInRoom = roomNo;
    return `room ${roomNo}`;
  });

  await step(J, "5. Record the payment (receipt issued)", async () => {
    await click("button", "Record payment");
    await sleep(300);
    await fill("Method", "card");
    await click("button[type=submit]", "Record ৳");
    await sleep(1500);
    await b.goto(await b.url());
    await b.waitFor("/RCP-\\d{4}-\\d{6}/.test(__h.text())", 15_000, "receipt number");
    return (await text()).match(/RCP-\d{4}-\d{6}/)![0];
  });

  await step(J, "7. Check the guest out (room goes to cleaning)", async () => {
    await click("button", "Check out");
    await sleep(500);
    // A confirm dialog only appears if a balance is still due.
    const dialog = await b.eval<boolean>("__h.all('button', 'Check out anyway').length > 0");
    if (dialog) throw new Error("Balance still due after paying in full");
    await b.waitFor("__h.all('button', 'Check out').length === 0", 20_000, "checked out");
  });

  if (!(await step(J, "6. Housekeeping signs in and marks the room as cleaning", async () => {
    await signIn("hk@staging.test");
    await b.goto(`${BASE}/admin/housekeeping`);
    await b.waitFor(`document.querySelector('[aria-label="Set status of room ${roomNo}"]')`, 15_000, "room card");
    await b.eval(`__h.one('[aria-label="Set status of room ${roomNo}"] button', 'Cleaning').click()`);
    await b.waitText(`Room ${roomNo}: cleaning`, 15_000);
    // And can't open bookings.
    await b.goto(`${BASE}/admin/bookings`);
    const t = await text();
    if (t.includes(ref)) throw new Error("Housekeeping can see bookings");
    return `room ${roomNo}`;
  }))) {
    /* recorded */
  }

  await step(J, "9. Content editor updates a room's wording (price fields locked)", async () => {
    await signIn("editor@staging.test");
    await b.goto(`${BASE}/admin/rooms`);
    await click("a", "Details, amenities");
    await b.waitText("Save wording", 15_000);
    const locked = await b.eval<boolean>("__h.field('Name').disabled && __h.field('Sleeps (adults)').disabled");
    if (!locked) throw new Error("Name/occupancy editable by a content editor");
    const blurb = `Calm and bright — checked ${new Date().toISOString().slice(11, 16)}`;
    await fill("One-line description", blurb);
    await click("button[type=submit]", "Save wording");
    await b.waitText("Room wording saved", 15_000);
    facts.editedBlurb = blurb;
    const roomSlug = await b.eval<string>("(__h.all('a', 'View on website')[0]?.getAttribute('href') ?? '').split('/').pop()");
    // The one-liner is shown on the room cards (/rooms) and as the room page's search description.
    await b.goto(`${BASE}/rooms`);
    if (!(await text()).includes(blurb)) throw new Error("New wording not on the public rooms list");
    if (roomSlug) {
      await b.goto(`${BASE}/rooms/${roomSlug}`);
      const meta = await b.eval<string>("document.querySelector('meta[name=description]')?.content ?? ''");
      if (meta !== blurb) throw new Error(`Room page description is "${meta}"`);
    }
    return roomSlug || "saved";
  });

  await step(J, "8 & 10. Owner signs in with an authenticator code, reviews dashboard and revenue report", async () => {
    await signIn("owner@staging.test");
    // Wait for real content: /admin redirects to /admin/mfa until the second step is done.
    await b.waitFor("/6-digit code|Set up authenticator app|Arriv/i.test(__h.text())", 20_000, "MFA screen or dashboard");
    if ((await b.url()).includes("/admin/mfa")) {
      const enrolling = await b.eval<boolean>("__h.all('button', 'Set up authenticator app').length > 0");
      if (enrolling) {
        await click("button", "Set up authenticator app");
        await b.waitFor("document.querySelector('details code')?.textContent", 15_000, "secret");
        const secret = await b.eval<string>("document.querySelector('details code').textContent");
        facts.ownerMfaSecretSaved = true;
        writeFileSync(path.join(OUT, "owner-totp-secret.txt"), secret); // staging only, outside the repo
      }
      const secret = await b.eval<string>("document.querySelector('details code')?.textContent ?? ''").catch(() => "");
      const s = secret || (process.env.E2E_OWNER_TOTP ?? "");
      if (!s) throw new Error("Owner already has a factor; set E2E_OWNER_TOTP");
      await fill("6-digit code", await totp(s));
      await click("button[type=submit]", (await b.eval<boolean>("__h.all('button', 'Turn on').length > 0")) ? "Turn on" : "Verify");
      await b.waitFor("location.pathname === '/admin'", 20_000, "dashboard after MFA");
    }
    const dash = await text();
    if (!/Today|Arriv|Occupancy/i.test(dash)) throw new Error("Dashboard didn't render");
    await b.goto(`${BASE}/admin/reports`);
    await b.waitFor("/Revenue|ADR|Occupancy/.test(__h.text())", 15_000, "report");
    const rep = await text();
    await b.goto(`${BASE}/admin/payments`);
    await b.waitText("Reconciliation", 15_000);
    return `report shows ${(rep.match(/Revenue[^\n]{0,40}/) ?? ["revenue"])[0].trim()}`;
  });
}

/* ========================================================= responsiveness */

async function responsive() {
  const J = "Mobile 375px";
  await b.clearCookies();
  await b.viewport(375, 812, true);
  const pages = ["/", "/rooms", "/rooms/deluxe-couple", "/booking", "/booking/lookup", "/about", "/dining", "/facilities", "/meetings-events", "/offers", "/gallery", "/contact", "/faq", "/privacy", "/terms", "/admin/login"];
  for (const p of pages) {
    await step(J, p, async () => {
      await b.goto(`${BASE}${p}`);
      await sleep(300);
      const r = await b.eval<{ sw: number; cw: number; broken: string[]; small: number }>(`({
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width > 0).map(i => i.src).slice(0, 3),
        small: [...document.querySelectorAll('a,button')].filter(e => { const r = e.getBoundingClientRect(); return __h.vis(e) && r.width > 0 && r.height > 0 && r.height < 24 && r.width < 24; }).length
      })`);
      if (r.sw > r.cw + 1) throw new Error(`Horizontal scroll: page ${r.sw}px wide in a ${r.cw}px viewport`);
      if (r.broken.length) throw new Error(`Broken images: ${r.broken.join(", ")}`);
      return `fits (${r.sw}px)${r.small ? `, ${r.small} tiny tap targets` : ""}`;
    });
  }
  await b.viewport(1366, 900, false);
}

/* ================================================================ run */

b = await Browser.launch();
const t0 = Date.now();
try {
  console.log("Guest journey");
  await guest();
  console.log("Staff journey");
  await staff();
  console.log("Responsive");
  await responsive();
} finally {
  const report = {
    base: BASE,
    at: new Date().toISOString(),
    seconds: Math.round((Date.now() - t0) / 1000),
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    facts,
    consoleErrors: b.consoleErrors,
    failedRequests: b.failedRequests,
  };
  writeFileSync(path.join(OUT, "e2e-report.json"), JSON.stringify(report, null, 2));
  console.log(`\n${report.passed} passed, ${report.failed} failed in ${report.seconds}s; ${b.consoleErrors.length} console errors, ${b.failedRequests.length} failed requests`);
  await b.close();
}

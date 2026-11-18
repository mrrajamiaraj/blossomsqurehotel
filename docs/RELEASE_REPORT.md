# Release report — final integration & production readiness (18 Nov 2026)

Every result below was observed, not assumed. Where something could not be verified, it says so.

**Verdict.** The guest booking site is ready for real guests. Everything works end to end on production data paths:

- booking;
- secure lookup;
- change requests and cancellation;
- transfer reporting;
- invoices.

**Staff operations are verified on staging but not yet usable in production.** Production has no staff accounts, so the owner must create the first one (see [DEPLOYMENT.md](DEPLOYMENT.md) §4). Email, WhatsApp and online gateways are built but switched off until credentials exist (§8 Known limitations).

**Released to production on 18 Nov 2026 (16:18–16:30 UTC)**, after approval, a backup and a staging rehearsal (§7):

- the room-copy permission;
- the operational hygiene fixes;
- `pg_net` moved to the `extensions` schema;
- the photo and performance work;
- the Content-Security-Policy;
- the health endpoint;
- the `www` → apex redirect.

## 1. Test summary

| Suite | Where | Result |
| ----- | ----- | ------ |
| Unit, component and database tests (`npm test`, 26 files) | local, PGlite with every migration | **373 / 373 passed** |
| Typecheck (`tsc --noEmit`) and production build (`next build`) | local | **pass** |
| Journey tests through the database (`tests/db/journeys.test.ts`): 9 guest steps, 10 staff steps (+7b), 9 security checks; plus the new rollback test (`tests/db/hygiene-rollback.test.ts`) | local | **25 / 25 + 1 / 1 passed** (included in the 373) |
| Browser end-to-end (`scripts/e2e/journeys.mts`, headless Chrome): guest, staff, mobile layout | production build of the app on staging data | **38 / 38 passed**, 0 console errors, 0 failed requests |
| Concurrency over the public API (`scripts/concurrency-check.mts`) | staging | **12 / 12 checks passed** |
| Production crawl, headers, TLS, performance (`scripts/e2e/prod-audit.mts`) | blossomsquare.online, read-only | 39 pages, 0 broken; 14 images, 0 broken |
| Production database: RLS, grants, cron health, advisors | blossomsquare.online, read-only | see §3 |

The browser tests ran against the real Next.js production build (`next build && next start`). It was connected to the **staging** Supabase project, so no production data was created.

### 1.1 Guest journey (browser, staging)

| # | Step | Verified result |
| - | ---- | --------------- |
| 1 | Visit homepage | Hero `h1` renders, booking entry present, no broken images |
| 2 | Search availability (2 nights, 2 adults) | 7 room types offered with live prices |
| 3 | Select room | "1 Deluxe Couple selected" |
| 4 | Complete stay price | Held on the server: **৳8,855** = ৳7,000 rooms + ৳700 service (10%) + ৳1,155 VAT (15%). The database row matches exactly |
| 5 | Guest information | An empty form is refused with 3 field errors, then accepted when filled |
| 6 | Create reservation | Refused until the terms box is ticked, then reserved at the quoted ৳8,855 |
| 7 | Confirmation | Reference **BSQ-88270** and the total are shown; the confirmation email is queued |
| 8 | Retrieve securely | The wrong contact gets a neutral "couldn't find" message. Reference + phone opens the booking with contact details masked. The invoice opens (INV-2026-00006). A bank transfer can be reported, shown as "Being checked" and not counted as paid |
| 9 | Modify / cancel | Date-change request sent; cancellation immediate (unpaid). The confirmation message stays on screen and the booking shows "Cancelled"; the cancellation email is queued |

### 1.2 Staff journey (browser, staging test accounts)

| # | Step | Verified result |
| - | ---- | --------------- |
| 1 | Staff signs in | Receptionist, housekeeping and content editor with a password; owner with password **and a real authenticator (TOTP) code**, enrolled during the test |
| 2 | Receptionist views arrivals | Today board renders the arrivals section |
| 3 | Walk-in booking | **BSQ-50251** created, confirmed, priced by the engine (৳4,428 incl. taxes) |
| 4 | Check in | Room 101 assigned, then checked in |
| 5 | Payment | Recorded in full; receipt **RCP-2026-000006**; payment status "paid" |
| 6 | Housekeeping updates room | Housekeeper sets room 101 to "Cleaning"; the housekeeper cannot see bookings |
| 7 | Check out | No balance warning (fully paid); the room becomes "dirty" and an urgent cleaning task opens (database-checked) |
| 8 | Revenue report | Owner opens Reports (revenue, ADR, occupancy) and Payments → Reconciliation |
| 9 | Content editor updates room details | Name and occupancy fields locked. Wording saved; the new one-liner appears on `/rooms` and as the room page's description |
| 10 | Owner dashboard | Dashboard and reports render after two-step sign-in |

In the database-level journey, finance (with two-step sign-in) records the payment; in the browser run, the receptionist did. Both paths are tested.

### 1.3 Security & reliability (verified)

| Check | How | Result |
| ----- | --- | ------ |
| Unauthorised requests | Anonymous API calls to 8 private tables and 4 staff and worker functions; a signed-in non-staff user | All refused (`permission denied` / `NOT_STAFF`); production public API: drafts, media, staff functions → 401 |
| Restricted roles | Housekeeping and editor on payments, revenue, bookings, room prices; desk on the audit log; MFA roles without the second factor | Refused (`NOT_ALLOWED` / `MFA_REQUIRED`); price and occupancy updates by an editor change nothing |
| Concurrent bookings | 25 simultaneous holds on 3 free rooms (staging) | Exactly 3 succeed, 22 `SOLD_OUT`; the last-room check also passes at database level |
| Double submissions | 10 simultaneous identical confirmations; the same confirmation twice | One booking, the rest replays |
| Invalid prices | Confirmation claiming ৳1 | `PRICE_CHANGED`, nothing booked |
| Failed payments | Rejected transfer; gateway amount mismatch | Never counted as paid; two payment-problem emails queued |
| Expired sessions | Expired / guessed booking tokens | `ACCESS_EXPIRED` |
| Abuse limits | 4th website booking in an hour from one email; 9th sign-in in 15 minutes | Refused with a clear message (observed during testing) |
| Upload restrictions | Bucket limits; anonymous / housekeeping uploads; foreign image URLs and more than 12 photos in a gallery | JPEG/PNG/WebP only, ≤ 10 MB; uploads refused; `BAD_PHOTO`, `PHOTO_LIMIT` |
| Invalid room assignments | Wrong room type; out-of-service room; room taken the same nights; check-in without a room | `WRONG_ROOM_TYPE`, `ROOM_OUT_OF_SERVICE`, `ROOM_TAKEN`, `ASSIGN_ROOM` |
| Database integrity | Ledger vs bookings, overlapping room nights, bookings without lines, negative totals | 0 / 0 / 0 / 0 |
| Broken images & navigation | Production crawl from the homepage | 39 pages all 200; 14 images all 200 |
| Mobile responsiveness | 16 pages at 375 px (headless Chrome, mobile emulation) | All fit (no sideways scroll) after the fix below |

### 1.4 Bugs found and fixed in this phase

| Bug | Found by | Fix |
| --- | -------- | --- |
| Content editors couldn't update room details at all | Staff journey 9 | `admin_update_room_copy` / `admin_set_room_gallery` (wording, features, view, photos; not name, beds, occupancy or price); editor-mode form |
| A cancelled booking kept an open date-change request | Browser run → database cross-check | Closing a booking closes its open requests (`20261119100000`) |
| Every check-out added another cleaning task, even with one already open; marking a room clean didn't close it | Browser run → database cross-check (4 open tasks for room 101) | One open task per room; board status closes tasks; existing duplicates tidied |
| Guest's "booking cancelled" confirmation vanished immediately | Browser run | The message stays after refresh |
| `/booking` briefly 13 px too wide on phones (slide-in animation) | Mobile check | Clipped horizontally |
| Phones downloaded full-size photos (~946 KB on `/booking`) | Performance audit | Pre-generated WebP sizes + image loader: **105 KB** |
| No Content-Security-Policy | Header audit | Structural CSP added (see §3) |
| No health endpoint for uptime monitoring | Monitoring review | `/api/health` |

## 2. Performance

Production (`prod-audit.mts`), before this phase's image fix. Headless Chrome, 390 px phone, simulated 4G (1.6 Mbps, 150 ms) and 4× CPU slow-down, cache off:

| Page | TTFB | FCP | LCP | CLS | Transferred | Images |
| ---- | ---- | --- | --- | --- | ----------- | ------ |
| `/` | 796 ms (cold) | 2.8 s | 5.9 s | 0.003 | 1,148 KB | 297 KB |
| `/rooms` | 152 ms | 1.9 s | 2.3 s | 0 | 995 KB | 171 KB |
| `/rooms/deluxe-couple` | 152 ms | 2.6 s | 6.9 s | 0 | 1,172 KB | 527 KB |
| `/booking` | 152 ms | 2.5 s | 7.9 s | 0.001 | 1,427 KB | 946 KB |
| `/contact` | 152 ms | 1.7 s | 2.1 s | 0 | 692 KB | 66 KB |
| `/gallery` | 152 ms | 1.8 s | 6.1 s | 0 | 1,169 KB | 330 KB |

**Fix (built, not yet deployed).** Vercel's image optimiser is off (paid quota). So the 12 hotel photos now have committed WebP copies at 480, 960 and 1600 px (1.8 MB of originals → 86 KB at 480 px), chosen per screen by `src/lib/image-loader.ts`. Measured on the new build with the same 390 px phone:

| Page | Photo bytes before | after |
| ---- | ------------------ | ----- |
| `/booking` | ~946 KB | **105 KB** |
| `/` | ~297 KB | **57 KB** |
| `/rooms/deluxe-couple` | ~527 KB | **58 KB** |
| `/gallery` | ~330 KB | **87 KB** |

**Re-measured on production after the deploy** (same script and throttling, two runs; run-to-run variance is large on throttled headless Chrome):

| Page | LCP before | LCP after (run 1 / run 2) | Transferred before → after | Images after |
| ---- | ---------- | ------------------------- | -------------------------- | ------------ |
| `/` | 5.9 s | 5.8 s / 9.1 s | 1,148 → 586 KB | 33 KB |
| `/rooms` | 2.3 s | 4.6 s / 2.3 s | 995 → 687 KB | 19 KB |
| `/rooms/deluxe-couple` | 6.9 s | 5.6 s / 5.6 s | 1,172 → 703 KB | 58 KB |
| `/booking` | 7.9 s | 4.3 s / 4.3 s | 1,427 → 587 KB | 105 KB |
| `/contact` | 2.1 s | 3.7 s / 3.4 s | 692 → 693 KB | 66 KB |
| `/gallery` | 6.1 s | 3.5 s / 2.1 s | 1,169 → 713 KB | 63 KB |

What this shows:

- **Verified:** page weight roughly halved on photo-heavy pages. `/booking` (−3.6 s) and `/gallery` are clearly faster.
- **Not improved:** the homepage. Its images are now only 33 KB, so its slow LCP on a 4×-throttled CPU comes from JavaScript (~220–314 KB per page: React, motion, Radix) and the hero text animation, not from photos. Trimming JavaScript and starting the hero without an animation is the next optimisation.
- **Watch:** `/booking` showed layout shift 0.145 in one of the two runs (0 in the other). Needs investigation.
- TTFB is ~150 ms when warm; the first request after idle is 0.6–1.0 s (cold start).

## 3. Security findings

| # | Finding | Severity | Status |
| - | ------- | -------- | ------ |
| S1 | Supabase project on the **Free plan**: no automatic restorable backups; inactive projects can be paused | **High (operational)** | Owner decision: upgrade to Pro (daily backups, no pausing). Until then, take the manual exports in [DEPLOYMENT.md](DEPLOYMENT.md) §6 |
| S2 | No staff accounts in production; the owner account and MFA are not set up | High (blocks staff use) | Owner action ([DEPLOYMENT.md](DEPLOYMENT.md) §4) |
| S3 | No Content-Security-Policy header | Medium | **Fixed, live:** structural CSP (`base-uri`, `object-src`, `frame-ancestors`, `form-action`, `upgrade-insecure-requests`), verified in production headers. Script/style nonces are a later step |
| S4 | Sign-in and booking rate limits are per server instance (in memory); on Vercel each instance counts separately | Medium | Supabase Auth adds its own server-side sign-in limits; the database also limits bookings per email/phone (3/hour) and lookups per reference (8/hour). Recommended: Vercel Firewall rate-limit rule on `/admin/login` and `/booking` |
| S5 | `www.blossomsquare.online` and `blossomsqurehotel-teal.vercel.app` serve the site directly (duplicate hosts) | Low | **Fixed for www:** 308 to the apex, verified. The `*.vercel.app` host still serves the site; canonical URLs point to the apex |
| S6 | `pg_net` extension installed in the `public` schema (advisor WARN) | Low | **Fixed:** moved to `extensions`; the advisor warning is gone; the sweep still returns HTTP 200 |
| S7 | Hobby plan keeps runtime logs ~30 minutes; no error alerting | Medium (operational) | `/api/health` for an external uptime monitor; recommend Vercel Pro observability or an error tracker |
| S8 | Security advisor: guest functions callable anonymously; staff functions callable by signed-in users | Info (by design) | Guest functions need a private booking token; every staff function checks permission and MFA itself (tested per role) |
| S9 | Performance advisor: 4 RLS policies re-evaluate `auth.uid()` per row; 1 duplicate index on `bookings`; unindexed audit foreign keys | Info | No effect at current volume; tidy in a later migration |

Verified as correct:

- secrets are server-only (tests enforce it);
- HSTS (2 years) and HTTP → HTTPS 308;
- TLS 1.3 with a Let's Encrypt certificate (88 days left; Vercel renews it automatically);
- `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` and `Permissions-Policy` present, and no `X-Powered-By`;
- RLS on every public table;
- audit log append-only;
- the webhook signatures and replay protection tested ([PAYMENTS_AND_MESSAGING.md](PAYMENTS_AND_MESSAGING.md)).

## 4. Monitoring status (production, read-only checks)

| Job | Schedule | Runs (24 h) | Failures |
| --- | -------- | ----------- | -------- |
| `bsq-booking-expiry` | every 5 min | 85 | 0 |
| `bsq-message-sweep` (calls `/api/jobs/messages`) | every 5 min | 8 (since setup) | 0; all HTTP 200 |
| `bsq-payment-intents` | every 5 min | 9 | 0 |
| `bsq-pre-arrival` | 04:00 UTC | not yet due | — |

Recent production request logs show only normal page loads (the plan retains ~30 minutes).

## 5. Migration history (production)

| Version | Name | Phase |
| ------- | ---- | ----- |
| 20261116114846 … 20261116152055 | room_types … is_manager_never_null (11) | foundation |
| 20261117194739, 20261117194819 | guest_services, guest_services_staff_grant | public site |
| 20261117203948 … 20261117204245 | rbac, reservations, catalogue_and_content, audit_log, storage | access architecture |
| 20261118051211, 20261118060259 | booking_engine (+ part 2) | booking engine |
| 20261118113708, 20261118113854 | cms_and_operations (+ part 2) | CMS & operations |
| 20261118122301, 20261118122426 | payments_and_messaging (+ part 2) | payments & messaging |
| 20261118161825 (local file `20261119090000`) | content_editor_room_copy | final release |
| 20261118161841 (local file `20261119100000`) | operational_hygiene | final release |
| 20261118162052 (local file `20261119110000`) | pg_net_extensions_schema | final release (skipped by the PGlite test harness, which has no pg_net) |

Each production version maps to a file in `supabase/migrations/`. Split releases were applied as two parts whose concatenation equals the file (plus a temporary security guard, documented in [MIGRATION_AND_ROLLBACK.md](MIGRATION_AND_ROLLBACK.md)). Every release has a tested rollback in `supabase/rollbacks/`.

## 6. Test accounts and test data

Staging (`eayihyxelygfljulmmjp`) has test staff: `desk@`, `hk@`, `editor@`, `finance@`, `manager@` and `owner@staging.test`. The password and the owner's authenticator key are not stored in the repo; they live only on the tester's machine. Staging also holds test bookings from these runs. Production holds only the one cancelled smoke-test booking from 18 Nov (BSQ-99296).

## 7. Release record — 18 Nov 2026

| Time (UTC) | Step | Verified result |
| ---------- | ---- | --------------- |
| 16:15 | `operational_hygiene` on **staging** | Trigger present; 0 duplicate open cleaning tasks; 0 stale requests |
| 16:17 | Production backup | `supabase/backups/2026-11-18-production-before-final-release.json`: replaced function, triggers, cron jobs, room-type copy, row counts |
| 16:18 | `content_editor_room_copy` on production | Executable by `authenticated` only; helper not callable directly |
| 16:18 | `operational_hygiene` on production | Trigger present; new status function live. Production had 0 tasks and 0 requests, so the tidy touched no rows |
| 16:20 | `pg_net` → `extensions` | Extension v0.20.4 in `extensions`; `net.http_post` present; the 16:25 sweep returned **HTTP 200**; all cron jobs succeeded |
| 16:22 | Site deployed (`blossomsquare-hotel-eeo812w9h`) | `/api/health` 200 (`db: ok`); CSP header served; `/admin` → sign-in; jobs endpoint 401 without the secret; WebP photo variants served |
| 16:23 | `www` → apex 308 | `https://www.blossomsquare.online/rooms` → 308 → `https://blossomsquare.online/rooms` |
| 16:25 | Production audit | 39 pages, 0 broken; 14 images, 0 broken; TLS 1.3, 88 days |
| 16:30 | Security advisor | `extension_in_public` gone; only the two new permission-checked functions added to the informational list |

After the release, data counts are unchanged (12 rooms, 1 booking, 7 room types) and `npm run verify` passes 373/373.

Rollback, if needed:

- **App:** promote `dpl_jrMMZrAHsS9kccHb3Zq8JLQJLR1n`.
- **Database:**
  - hygiene: `supabase/rollbacks/20261119100000_operational_hygiene.down.sql`;
  - room copy: the three drops listed in that file;
  - `pg_net`: `drop extension pg_net; create extension pg_net;`.
- **www:** clear the redirect in Vercel → Domains.

## 8. Known limitations

- **Staff can't use production yet:** no accounts (see S2).
- **Email isn't delivered** until Resend is connected; messages wait as "Not set up" and can be resent.
- **WhatsApp notifications are not sent:** they need a WhatsApp Business account and approved templates. Click-to-chat works.
- **Online payments are off.** Card (SSLCommerz) and bKash online need merchant approval and a sandbox test. Nagad online needs merchant onboarding before it can be implemented. The bank, bKash and Nagad transfer methods (verified by staff) and pay-at-hotel work.
- **Hotel data still to fill in:**
  - real room numbers (104–107 and 301 are placeholders);
  - VAT and service charge (production has none set, so totals exclude taxes and the booking pages say so);
  - cancellation and children policies;
  - missing photos (pool, restaurant, banquet, exterior).
- **Not yet built:**
  - date-change requests are handled by staff, not automatically re-priced for the guest;
  - English only;
  - no PDF generation (the browser's "Save as PDF" is used for invoices and receipts).
- **Lighthouse not run:** performance was measured with a custom Chrome script instead, to avoid downloading new tools. Figures are comparable but not Lighthouse scores.
- **No real-device testing:** the browser tests use desktop Chrome with mobile emulation, not physical phones or Safari.

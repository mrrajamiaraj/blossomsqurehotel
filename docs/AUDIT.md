# Foundation Audit — 2026-11-17

Scope: every route, component folder, Server Action, route handler, the proxy,
the data layer, all 10 migrations, the live Supabase project
(`sbzwlizkllzjpbqjhued`, read-only inspection) and the build/deploy config.

**Overall:** this is a strong base to build on, not a rewrite candidate. The
booking engine is correct by construction: prices are computed in the DB,
rows are locked against overselling, an exclusion constraint prevents
double-assigned rooms, and there is a full audit trail. The security model
(RLS, permission-checked RPCs, least-privilege grants) is well above average.
The gaps are in operations and environments, not in the core logic.

Status legend: ✅ fixed in this phase · 🔧 needs owner action · 📋 planned for a later phase

## Live data inventory (preserved, untouched)

| Table            | Rows | Notes |
| ---------------- | ---- | ----- |
| `room_types`     | 7    | Standard Couple, Deluxe Couple, Honeymoon Couple, Premium Twin, Executive Family Suite, Connecting King Suite, Connecting Queen Suite. Live rates ৳2,500–৳12,500 |
| `rooms`          | 12   | Includes **placeholder** numbers 104–107 and 301 (real numbers still unknown) |
| `bookings`       | 0    | No guest data in production yet |
| `booking_events` | 0    | |
| `staff`          | 0    | **No manager exists, so the live front desk cannot be used** |
| `hotel_settings` | 1    | Policies, VAT and service charge intentionally blank (hidden on site) |

Photos: 12 originals in `public/photos/`, crest and WhatsApp QR in `public/brand/`.
Room galleries reference them by ref (`DSC5566`, …) or by Storage URL.

## Findings

### High

| # | Finding | Risk | Status |
| - | ------- | ---- | ------ |
| H1 | **Local migration filenames did not match production's history.** Every version differed (e.g. local `20261027000000_room_types` vs remote `20261116114846`), and production had an extra `revoke_trigger_fn_execute` migration. | `supabase db push` would have tried to re-run all 10 migrations against production (`create table` on existing tables, re-seeding rooms). | ✅ Renamed files to remote versions after confirming the SQL matches (byte-identical once comments are removed; the gaps were only inline comments). Split the trailing revoke into its own file. Guarded by a unit test. |
| H2 | No staff row in production. | The admin is unusable live, and the first person to get a staff row controls the hotel. | 🔧 Create the manager (README, step 5) after setting the secret key. |
| H3 | `SUPABASE_SERVICE_ROLE_KEY` / secret key not set on Vercel. | Staff invites fail. | 🔧 Add `SUPABASE_SECRET_KEY` (sb_secret_…) as a *Sensitive* env var for Production only. |
| H4 | Production uses the **legacy anon JWT**. Legacy keys can't be rotated independently and will be retired by Supabase. | Rotation is hard after a leak; deprecation risk. | ✅ Code reads `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` first (with legacy fallback). 🔧 Add the publishable key on Vercel, redeploy, then remove the anon var and disable legacy keys. |
| H5 | **No staging environment.** Vercel Preview deploys have no Supabase variables, and the only database is production. | Schema changes can only be tested on live data. | 🔧/📋 Create a staging Supabase project and wire it to Vercel *Preview* (see migration plan). |

### Medium

| # | Finding | Status |
| - | ------- | ------ |
| M1 | The in-memory rate limiter (`lib/rate-limit.ts`) is per serverless instance, so it barely throttles bookings or sign-in on Vercel. The DB's per-contact limit still applies. | 📋 Add a Vercel Firewall rate-limit rule on `POST /booking` and `/admin/login`, or use Upstash. |
| M2 | No route error boundaries; `global-error` missing. A thrown error showed Next's default screen. | ✅ `global-error.tsx`, plus `error.tsx` for (site), booking and the admin desk, using the shared `ErrorState`. |
| M3 | Loading states existed only for the admin desk. | ✅ `loading.tsx` for (site) and booking (quiet brass progress line). |
| M4 | No security headers. | ✅ nosniff, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy, HSTS, `X-Powered-By` removed. 📋 Add a Content-Security-Policy (needs nonces for the theme boot script, and must allow the Google Maps iframe and Supabase Storage). |
| M5 | Nothing stopped a secret key being added with a `NEXT_PUBLIC_` prefix. | ✅ The build now fails on that; a unit test checks only `lib/supabase/admin.ts` reads the secret. |
| M6 | Next.js 16.4.3 had a moderate advisory (GHSA-mfr8-8qww-v76h). The app doesn't use `use cache`, so it wasn't exploitable here. | ✅ Upgraded to 16.4.6; `npm audit` reports 0. |
| M7 | Proxy used `getUser()` (a network call on every admin request) and ignored the cache headers `@supabase/ssr` asks for. | ✅ Proxy uses `getClaims()` (verifies the JWT; local with asymmetric keys) and forwards cache headers. Pages still call `getUser()` + the staff check. |
| M8 | Supabase client untyped; schema drift was invisible to TypeScript. | ✅ Generated `database.types.ts`; all clients typed as `SupabaseClient<Database>`. |
| M9 | Supabase Auth "allow new sign-ups" setting in production not verified. The app has no sign-up form and RLS blocks non-staff, but open sign-up still lets anyone create accounts. | 🔧 Dashboard → Authentication → Sign In / Providers: disable *Allow new users to sign up* (invites still work). Local config already has `enable_signup = false`. |
| M10 | Placeholder room numbers (104–107, 301), blank policies, VAT, service charge and confirm-call time. | 🔧 Business data. Fill in from Admin → Rooms and Settings (no code change). |

### Low / technical debt

| # | Finding | Status |
| - | ------- | ------ |
| L1 | Repo root holds source material: saved pages of the old site (`hotel.queuecommerce.com.html`, `*_files/`), `.ai` artwork, a 5 MB PNG, design canvases, and `download-images.mjs`, which reads a `hotel-data.json` that doesn't exist. | ✅ Excluded from Vercel uploads (`.vercelignore`); nothing deleted. 📋 Move to `/reference` or Git LFS. |
| L2 | No ESLint/Prettier config and no CI. | 📋 Add `eslint-config-next` + a GitHub Action that runs `npm run verify`. |
| L3 | Git CLI not installed (GitHub Desktop only), so the working tree can't be diffed from a terminal. | 🔧 Commit this phase on a branch via GitHub Desktop, or install Git for Windows. |
| L4 | `allowedDevOrigins` hard-coded a LAN IP. | ✅ Overridable with `DEV_LAN_ORIGINS`. |
| L5 | Stray `C:\Users\rajam\package-lock.json` outside the repo; Next warns about it on every build. | 🔧 Delete it if nothing in your home folder needs it. |
| L6 | Image optimisation disabled (Vercel quota). | Accepted. 📋 Pre-generate AVIF/WebP at 2–3 widths for the gallery. |
| L7 | Missing photography: restaurant, banquet hall, pool, exterior (placeholders render). | 🔧 Content. |
| L8 | Online payment not integrated (guests reserve, pay at hotel or by transfer). | 📋 Gateway + `payment-webhook` Edge Function. |
| L9 | Supabase linter: 16 "SECURITY DEFINER executable by anon/authenticated" warnings. | Accepted by design. These functions are the API and authorise inside; documented in ARCHITECTURE §5. |

## Design observations (for the premium rebuild phase)

- **Strengths:** a restrained palette (sea-pine, ivory, brass), a full night
  theme (warm, not inverted), Inter variable type, view-transition theme
  reveal, a once-per-session intro curtain, and reduced-motion support throughout.
- **Weaknesses:** a single typeface (headlines would gain from a display serif
  paired with Inter); photography is the bottleneck; booking steps lack
  progressive enhancement if JS fails; there is no structured data
  (`Hotel`/`LodgingBusiness` JSON-LD), no `sitemap.ts` or `robots.ts`, and no
  Open Graph images; the admin is desktop-first with tables that stack on mobile.

## Verification performed

- `npm run typecheck`: clean.
- `npm test`: 64/64 (57 existing + 7 new security/migration guards).
- `next build`: succeeds unconfigured, and configured with the production URL +
  publishable key (via process env; no `.env.local` written).
- `next start` smoke test against live Supabase (read-only): `/`, `/rooms`,
  `/rooms/king-suite`, `/booking`, `/admin/login` → 200; `/admin` and
  `/admin/bookings` → 307 to login; unknown path → branded 404. All 7 live
  room types and rates render, and the security headers are present.
- Client bundles scanned: no `sb_secret_` or `service_role` strings.
- `next build` with a fake `NEXT_PUBLIC_SUPABASE_SECRET_KEY` fails as intended.
- `next dev` in preview mode: public pages and admin desk → 200.
- No production data or schema was changed. The only production queries were
  `list_tables`, `list_migrations`, advisors, and `SELECT`s on
  `supabase_migrations.schema_migrations`.

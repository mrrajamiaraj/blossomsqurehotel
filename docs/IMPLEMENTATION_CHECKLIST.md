# Implementation Checklist

## Phase 0 — Foundation (this phase) ✅

- [x] Inspect the full codebase, live Supabase schema, migration history and advisors
- [x] Audit report (`docs/AUDIT.md`)
- [x] Align local migration versions with production; split `revoke_trigger_fn_execute`
- [x] Supabase CLI as a dev dependency; `supabase/config.toml` (invite-only auth, 10-char passwords); `seed.sql`; `functions/`
- [x] Typed database interfaces (`src/lib/supabase/database.types.ts`) and typed clients
- [x] Supabase module: `config` / `server` / `admin` (secret, server-only) / `client` (browser) / `proxy`
- [x] Publishable/secret key env conventions with legacy fallback; `.env.example` rewritten
- [x] Build fails if a secret is exposed through `NEXT_PUBLIC_*`
- [x] Proxy session refresh with `getClaims()` and cache-header forwarding
- [x] Tailwind CSS v4 (theme + utilities, no preflight) with brand-mapped shadcn tokens
- [x] shadcn/ui config (`components.json` → `components/primitives`), `cn()`, `Button`
- [x] Motion installed; `AppProviders` with `MotionConfig reducedMotion="user"`
- [x] `global-error`, segment `error.tsx` ×3, `loading.tsx` ×2, shared `ErrorState` / `PageLoading`
- [x] Security headers; `X-Powered-By` off; Next 16.4.6 (0 vulnerabilities)
- [x] Security & migration guard tests (7 new; 64/64 passing)
- [x] npm scripts: `verify`, `db:*`
- [x] Architecture doc, this checklist, migration/rollback plan

## Owner actions before Phase 1 🔧

- [ ] Commit this phase on a branch (GitHub Desktop) and open a PR
- [ ] Vercel Production: add `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` (Sensitive)
- [ ] Create the first manager account and staff row
- [ ] Supabase Auth: disable public sign-ups; set Site URL and the `/admin/auth/confirm` redirect; update the invite/reset email templates (README)
- [ ] Create a staging Supabase project and wire it to Vercel Preview
- [ ] Supply: real room numbers, cancellation & children policies, VAT %, service charge %, confirm-call time, manager name/email, social links
- [ ] Photography: restaurant, banquet, pool, exterior, beach view

## Phase 1 — Premium public website 📋

- [ ] Design direction sign-off (display serif + Inter, photography-led layouts) using `blossom-square-design/` canvases
- [ ] Home: hero video/still, story, rooms showcase, dining, location, reviews
- [ ] Rooms index and room detail: galleries (AVIF/WebP), amenities, live "from" rate, availability calendar
- [ ] New pages: Dining, Events/Banquet, Gallery, Offers, About, Contact, FAQ, Policies
- [ ] SEO: `sitemap.ts`, `robots.ts`, JSON-LD (`Hotel`, `Offer`, `BreadcrumbList`), OG images, canonical URLs
- [ ] Accessibility pass (WCAG 2.2 AA), keyboard paths, focus order, contrast in both themes
- [ ] Performance budget: LCP < 2.0 s on 4G, CLS < 0.05; image sizes pre-generated
- [ ] Content-Security-Policy with nonces

## Phase 2 — Booking engine 📋

- [ ] Rate plans (room-only / breakfast), seasonal and date-specific rates, min-stay rules (migration + admin UI)
- [ ] Promo codes
- [ ] Guest "manage my booking" (reference + phone/email OTP)
- [ ] Confirmation email/SMS via `booking-notify` Edge Function (DB webhook on `booking_events`)
- [ ] Payment gateway (bKash/Nagad/cards) + `payment-webhook` Edge Function with signature check
- [ ] Edge rate limiting (Vercel Firewall / Upstash) on booking and sign-in

## Phase 3 — Front desk 📋

- [ ] Realtime: live new-booking toasts and calendar updates (`getBrowserClient()` in the admin layout)
- [ ] Housekeeping board for mobile staff
- [ ] Staff activity log, role audit
- [ ] Reports: occupancy/ADR/RevPAR by channel (extends `lib/admin/reports.ts`)

## Phase 4 — Quality & operations 📋

- [ ] ESLint + Prettier; GitHub Action running `npm run verify` on every PR
- [ ] Playwright end-to-end tests: booking happy path, sold-out, admin confirm → check-in → check-out
- [ ] Error monitoring (Sentry or Vercel Observability), uptime check
- [ ] Backups: confirm the PITR / daily backup plan; quarterly restore drill to a scratch project
- [ ] Move reference material out of the repo root (L1 in the audit)

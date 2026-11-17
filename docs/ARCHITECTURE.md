# Blossom Square — Architecture

Guest website, booking engine and front-desk system for Blossom Square Hotel &
Suites, Kolatoli, Cox's Bazar. Production: <https://blossomsquare.online>.

| Layer      | Choice                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| Framework  | Next.js 16 App Router (Turbopack), React 19, TypeScript (strict)       |
| Styling    | Hand-built design system (`globals.css` + CSS Modules) **+** Tailwind CSS v4 utilities and shadcn/ui primitives for new UI |
| Motion     | CSS reveal system (`[data-reveal]`, Lenis smooth scroll) **+** Motion (`motion/react`) for new interactions |
| Data       | Supabase Postgres with RLS; all writes go through permission-checked SQL functions |
| Auth       | Supabase Auth (email + password, invite-only staff), cookie sessions via `@supabase/ssr` |
| Storage    | Supabase Storage bucket `room-photos` (public read, manager write)     |
| Realtime   | Enabled; browser client ready (`src/lib/supabase/client.ts`), not used yet |
| Functions  | `supabase/functions/` (none deployed yet)                              |
| Hosting    | Vercel (project `rmr6/blossomsqurehotel`); DNS at Namecheap            |

---

## 1. Request flow

```
Browser
  │
  ├─ /, /rooms, /rooms/[slug]          (site)   Server Components, static/ISR
  │        └─ getPublicRepo() ── anon client (publishable key, no cookies)
  │
  ├─ /booking                           booking  Client flow → Server Action createBooking()
  │        └─ validate → rate-limit → repo.createWebsiteBooking() → rpc create_booking
  │
  └─ /admin/**                          admin
           ├─ src/proxy.ts               1. optimistic: getClaims() verifies the JWT,
           │                                refreshes cookies, redirects signed-out users
           ├─ requireAdmin()/requireManager()
           │                             2. authoritative (app): getUser() + active staff row
           └─ rpc admin_* / RLS           3. authoritative (DB): _require_staff/_require_manager
                                             inside every SECURITY DEFINER function
```

Defence in depth: even a bug in layers 1–2 cannot let a non-staff user read
bookings or change data, because RLS and the SQL functions check `auth.uid()`
against `public.staff` themselves.

## 2. Route map

| Segment                    | Purpose                                  | Rendering            | Guards                         |
| -------------------------- | ---------------------------------------- | -------------------- | ------------------------------ |
| `app/(site)/`              | Home, rooms list, room detail            | Static / ISR (5 min) | none (public)                  |
| `app/booking/`             | 4-step checkout                          | Dynamic              | server validation + rate limit + DB rules |
| `app/admin/login`, `setup`, `auth/confirm` | Sign-in, "connect DB", email-link landing | Dynamic | public within /admin            |
| `app/admin/(desk)/**`      | Today, Bookings, Calendar, Rooms, Guests, Reports, Settings, Account | Dynamic (`connection()`) | proxy → `requireAdmin` → DB |
| `app/admin/reports/export` | CSV export route handler                 | Dynamic              | `requireAdmin`                 |

Shell files per segment:

| File                                  | Role                                               |
| ------------------------------------- | -------------------------------------------------- |
| `app/layout.tsx`                      | `<html>`, Inter font, theme boot script, `AppProviders`, Toaster, reveal observer |
| `app/global-error.tsx`                | Last-resort boundary (self-contained document)     |
| `app/not-found.tsx`                   | Branded 404                                        |
| `app/(site)/layout.tsx` · `template.tsx` · `error.tsx` · `loading.tsx` | Header/footer chrome, page-enter animation, error & loading states |
| `app/booking/layout.tsx` · `error.tsx` · `loading.tsx` | Quiet checkout chrome                    |
| `app/admin/layout.tsx` → `(desk)/layout.tsx` · `error.tsx` · `loading.tsx` | `noindex`, admin palette, AdminShell (sidebar, command palette) |

Error boundaries use the `retry` prop (stable in Next 16.3+), not the old `reset`.

## 3. Source layout

```
src/
  app/                    routes only — thin pages that call lib/ and render components
  components/
    site/ home/ rooms/    guest-facing UI (CSS Modules)
    booking/              booking flow UI
    admin/                front-desk UI
    motion/               reveal system, Lenis smooth scroll, intro curtain
    ui/                   small custom building blocks (Accordion, Toaster, …)
    primitives/           shadcn/ui components (Tailwind)           ← new
    providers/            AppProviders (MotionConfig)               ← new
    shell/                ErrorState, PageLoading                   ← new
  lib/
    supabase/             ← new module (replaces lib/supabase.ts)
      config.ts             URL + publishable key (isomorphic)
      server.ts             getPublicClient(), getSessionClient()   server-only
      admin.ts              getServiceClient() — secret key         server-only
      client.ts             getBrowserClient() — Realtime etc.      "use client"
      proxy.ts              updateSession() for src/proxy.ts
      database.types.ts     generated types (npm run db:types)
      index.ts              server barrel (keeps `@/lib/supabase` imports working)
    data/                 repository pattern
      repo.ts               PublicRepo / AdminRepo interfaces
      supabase-repo.ts      live implementation (typed client)
      preview-repo.ts       in-memory hotel for dev without Supabase
      rules.ts errors.ts types.ts
    admin/                session (requireAdmin), metrics, reports
    hotel.ts rooms.ts amenities.ts photos.ts …   static hotel facts
    pricing.ts dates.ts stay.ts availability.ts   pure domain logic (unit-tested)
  proxy.ts                Next 16 "proxy" (formerly middleware), matcher /admin/:path*
supabase/
  config.toml             local stack config (auth invite-only, min password 10)
  migrations/             versions match production's history exactly
  seed.sql                local-only seed (no real data)
  functions/              Edge Functions (planned)
tests/                    Vitest: booking rules, pricing, reports, security boundaries
docs/                     this file, audit, checklist, migration & rollback plan
```

### Module boundaries (rules for the next phase)

1. **Pages never talk to Supabase directly.** They call a repo (`getPublicRepo()`,
   `requireAdmin().repo`) or a Server Action. New data needs = new repo method,
   implemented in both `SupabaseRepo` and `PreviewRepo`.
2. **Mutations are Server Actions** that (a) authorise, (b) validate and clamp
   input, (c) call a repo method backed by a SQL function, (d) `revalidatePath`.
3. **Prices and availability are computed in the database.** The browser never
   sends a price.
4. **`@/lib/supabase/admin` (secret key) is used only after `requireManager()`**,
   and only for Auth admin APIs (invites, staff changes).
5. Client components may import only `@/lib/supabase/client`. This is enforced by
   `tests/security-boundaries.test.ts`.
6. When a feature grows, group it as `src/features/<name>/{components,actions.ts,queries.ts}`
   and keep `app/` routes thin. Existing folders stay where they are until touched.

## 4. Supabase clients and keys

| Client                | Key                                   | Cookies | RLS     | Where                         |
| --------------------- | ------------------------------------- | ------- | ------- | ----------------------------- |
| `getPublicClient()`   | publishable (`sb_publishable_…`)      | no      | anon    | public pages, website booking |
| `getSessionClient()`  | publishable                           | yes     | as user | admin pages/actions, auth     |
| `updateSession()`     | publishable                           | yes     | —       | `src/proxy.ts` only           |
| `getBrowserClient()`  | publishable                           | browser | as user | future Realtime               |
| `getServiceClient()`  | secret (`sb_secret_…`)                | no      | **bypassed** | staff invites/updates only |

Environment variables (see `.env.example`):

| Variable                               | Exposure | Notes |
| -------------------------------------- | -------- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL`             | public   | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public   | preferred |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`        | public   | legacy fallback; remove after migration |
| `NEXT_PUBLIC_SITE_URL`                 | public   | used in auth email links |
| `SUPABASE_SECRET_KEY`                  | **server** | preferred; Vercel "Sensitive" |
| `SUPABASE_SERVICE_ROLE_KEY`            | **server** | legacy fallback |

`next.config.ts` **fails the build** if any `NEXT_PUBLIC_*` variable carries a
secret (`sb_secret_…`, a `service_role` JWT, or a name containing SECRET /
SERVICE_ROLE).

## 5. Database model (summary)

`room_types` (catalogue + rates) · `rooms` (physical units, housekeeping) ·
`bookings` · `booking_events` (audit trail) · `staff` (role: manager / front_desk) ·
`hotel_settings` (singleton: policies, VAT, service charge) · view `guest_summary`.

- RLS on every table; `anon` may only `select` published room types and settings.
- Public RPCs: `room_availability`, `create_booking` (rate-limited per contact in SQL).
- Staff RPCs: `admin_*` — each starts with `_require_staff()` / `_require_manager()`.
- Exclusion constraint prevents double-assigning a room; type-row locks prevent
  overselling the last unit.
- Supabase's linter warns that these SECURITY DEFINER functions are callable by
  `anon`/`authenticated`. That is **intentional**: they are the API, and they
  authorise internally with a pinned `search_path` (checked by a unit test).

## 6. Styling

Full reference: **[docs/DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)** (tokens, type,
components, motion, accessibility checklist) and the living style guide at
`/design-system`. Headlines use Cormorant Garamond and everything else uses Inter.

The existing look is a bespoke design system: **do not restyle existing pages
with Tailwind as a side effect.**

- `globals.css` loads Tailwind as `theme` + `utilities` layers **without preflight**.
  Brand styles stay **unlayered**, so they win over Tailwind everywhere they apply.
- The element reset (`*`, `html`, `body`, `a`, `button`, …) sits in `@layer base`.
  It contains only element selectors, so every class rule already out-ranked it.
  Moving it changes nothing on today's pages, and it lets utilities such as
  `bg-primary` style a `<button>`.
- shadcn tokens (`--color-primary`, `--color-muted`, …) are mapped in `@theme inline`
  onto the brand variables (`--pine-800`, `--sand`, …), so they flip with the
  night theme. The `dark:` variant follows `html[data-theme="dark"]`.
- shadcn components live in `src/components/primitives/`, not `components/ui/`.
  On Windows' case-insensitive filesystem, `accordion.tsx` would clash with the
  existing `Accordion.tsx`. `components.json` points `ui` there.
- **Running `npx shadcn add …` may edit `globals.css`.** Review that diff and
  revert any new `:root` variables or `@layer base` rules, because the tokens are
  already mapped.
- The admin keeps its own light palette (`admin.css`, `a-*` classes).

## 7. Motion

- Existing: `[data-reveal]` + `MotionRoot` (IntersectionObserver), `Parallax`,
  `SplitWords`, Lenis `SmoothScroll`, the intro curtain, and view-transition theme reveal.
  All honour `prefers-reduced-motion`.
- New: `AppProviders` wraps the app in `<MotionConfig reducedMotion="user">` with
  the brand easing `cubic-bezier(0.16, 1, 0.3, 1)`. Use `motion/react` (`m.` with
  `LazyMotion` on heavy pages) for gesture/layout animation. Keep scroll reveals on
  the CSS system so content renders without JavaScript.

## 8. Environments

| Environment | Next.js            | Supabase project                    | Data            |
| ----------- | ------------------ | ----------------------------------- | --------------- |
| Local       | `npm run dev`      | none (preview repo) **or** local stack (`npm run db:start`, needs Docker) **or** staging | sample / seed |
| Preview     | Vercel Preview     | **staging project** (to create)     | test data only  |
| Production  | Vercel Production  | `sbzwlizkllzjpbqjhued` (ap-southeast-1) | real          |

See `docs/MIGRATION_AND_ROLLBACK.md` for how schema changes move through them.

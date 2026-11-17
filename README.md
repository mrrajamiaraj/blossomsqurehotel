# Blossom Square Hotel & Suites

Guest website and front-desk system for Blossom Square, Kolatoli, Cox's Bazar.
Next.js 16 (App Router) · Supabase (Postgres, Auth, RLS) · TypeScript.

- **Website** — `/`, `/rooms`, `/rooms/[slug]`, `/booking` (4-step booking with live availability), day/night theme.
- **Front desk** — `/admin`: Today, Bookings, Calendar, Rooms & rates, Guests, Settings.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000  ·  front desk at /admin
npm test           # unit tests (booking rules, KPIs, dates, pricing, security guards)
npm run verify     # typecheck + tests + production build
```

Docs: [Architecture](docs/ARCHITECTURE.md) · [Public site](docs/PUBLIC_SITE.md) · [UI system](docs/DESIGN_SYSTEM.md) (live at `/design-system` in dev) · [Audit](docs/AUDIT.md) ·
[Checklist](docs/IMPLEMENTATION_CHECKLIST.md) · [Migrations & rollback](docs/MIGRATION_AND_ROLLBACK.md)

Database scripts (Supabase CLI is a dev dependency):

| Script | Does |
| ------ | ---- |
| `npm run db:start` / `db:stop` | local Supabase stack (needs Docker) |
| `npm run db:reset` | rebuild the **local** DB from migrations + `seed.sql` |
| `npm run db:new -- <name>` | new migration file |
| `npm run db:types` / `db:types:local` | regenerate `src/lib/supabase/database.types.ts` |
| `npm run db:migrations` / `db:push:dry` | compare / dry-run against the linked project |

There is deliberately no `db:push` script; production pushes follow
`docs/MIGRATION_AND_ROLLBACK.md`.

Without Supabase, **development** runs on an in-memory preview hotel (clearly
labelled, resets on restart) so every workflow can be tried. **Production**
never shows sample data: the website falls back to the built-in room list with
online booking disabled, and `/admin` shows a "connect the database" page.

## Connect Supabase

1. Create a project (use a **staging** project for anything but production).
   Apply `supabase/migrations` with `npx supabase link --project-ref <ref>` then
   `npx supabase db push --linked`, or run the files in filename order in the
   SQL editor. Each file starts with its rollback notes. The production project
   already has every migration; its history matches these filenames.
2. Copy `.env.example` to `.env.local` (and set the same variables on your host):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`),
   `SUPABASE_SECRET_KEY` (`sb_secret_…`, server only — the build fails if it is
   given a `NEXT_PUBLIC_` prefix), `NEXT_PUBLIC_SITE_URL`. The legacy
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` still work as fallbacks.
3. **Auth → URL configuration:** set Site URL to your domain and add
   `https://YOUR-DOMAIN/admin/auth/confirm` to the redirect URLs.
4. **Auth → Email templates** (Invite user, Reset password): point the link at
   `{{ .SiteURL }}/admin/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/admin/account`
5. **Create the first manager.** In Auth → Users, add a user with a password,
   then in the SQL editor:

   ```sql
   insert into public.staff (user_id, full_name, role)
   select id, 'Your Name', 'manager' from auth.users where email = 'you@example.com';
   ```

   Further staff are invited from **Settings → Team**.

## How bookings stay correct

- Prices are read from `room_types` inside the database; the browser never sends a price.
- `create_booking` / `admin_*` functions lock the room type row, so two guests
  can't take the last room at once. An exclusion constraint stops one physical
  room being assigned to overlapping stays.
- Bookings are read-only through the API; every change goes through a
  permission-checked function that enforces the lifecycle
  (pending → confirmed → in house → checked out, or cancelled / no-show) and
  writes the audit trail.
- Guests can't read any booking data (RLS). Staff roles: **manager** (rates,
  rooms setup, policies, team) and **front desk** (bookings, guests, housekeeping).
- Website bookings are throttled per IP and per contact; sign-in is rate-limited.

## Photos

Put photos in `public/photos/<REF>.jpg` (e.g. `DSC5566.jpg`); they replace the
placeholders automatically. Room galleries use the refs in each room type's
`gallery` column. Still missing: restaurant (`RESTAURANT`), banquet hall
(`BANQUET`) — and pool, beach-view and exterior shots would strengthen the site.

## Still to supply

Room sizes (Rooms & rates), cancellation and children policies, VAT and
service-charge rates, confirmation-call time (Settings), social links
(`src/lib/hotel.ts`). Online payment (bKash, Nagad, cards) needs a payment
gateway account; until then guests reserve and pay at the hotel.

# Migration & Rollback Plan

Two kinds of change are covered here: **(A)** shipping this foundation phase, and
**(B)** how every future database change moves from local → staging → production.

> Golden rules
> 1. Production (`sbzwlizkllzjpbqjhued`) is never the first place a migration runs.
> 2. No `db reset`, `db push --include-seed`, `drop`, or `truncate` against production.
> 3. Every migration file starts with a `-- Rollback:` note.
> 4. Migrations are append-only. Never edit or rename a file that production has applied.
>    This phase renamed files once, to *match* production's history (see A.1).

---

## A. Shipping this foundation phase

### A.1 What changed in the repo (no production effect)

| Change | Production impact |
| ------ | ----------------- |
| Migration files renamed to production's versions; `revoke_trigger_fn_execute` split out | None. History now matches, so `supabase db push --dry-run` should report *no pending migrations*. |
| `supabase/config.toml`, `seed.sql`, `functions/` added | None (local tooling). |
| `src/lib/supabase/*` replaces `src/lib/supabase.ts` (same exports) | Same behaviour; reads the new key names with legacy fallback. |
| Proxy uses `getClaims()` | Same redirects; fewer Auth round-trips. |
| Tailwind (no preflight), shadcn tokens, Motion provider | No visual change to existing pages. |
| Error/loading boundaries, security headers | Additive. |

### A.2 Deploy steps

1. **Commit on a branch** (GitHub Desktop) → push → Vercel builds a Preview.
2. Open the Preview URL. Without Supabase variables, Preview shows the built-in
   room list and `/admin/setup`. That is expected until staging exists (B.1).
3. On Vercel → Settings → Environment Variables (Production):
   - add `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the project's `sb_publishable_…` key;
   - add `SUPABASE_SECRET_KEY` = a new `sb_secret_…` key, marked **Sensitive**.
   Use the dashboard or `vercel env add NAME production --value …` (never pipe
   values from PowerShell, which adds a BOM).
4. Merge to `main`. Production deploys. Check `/`, `/rooms`, `/booking`, `/admin/login`.
5. Once production runs on the publishable key, delete `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   from Vercel, redeploy, then disable the legacy API keys in Supabase.
6. Create the first manager (README step 5) and sign in.

### A.3 Rollback for this phase

- **Code:** Vercel → Deployments → previous production deployment → *Promote*
  (instant, no rebuild). Or revert the merge commit.
- **Env vars:** the old variables keep working; the code falls back to
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. Don't disable
  legacy keys until step 5 has run cleanly for a few days.
- **Database:** nothing to roll back; no SQL was run.
- **Local files:** the pre-change copies of every modified file are in the
  session scratchpad backup (`backup-pre-foundation`). That is temporary, so
  commit before relying on it.

---

## B. Workflow for future schema changes

### B.1 One-time setup

```bash
npx supabase login                     # opens browser
npx supabase link --project-ref <STAGING_REF>   # link to STAGING by default
```

Create a **staging** Supabase project (free tier is fine), then:

```bash
npx supabase db push --linked          # applies all migrations to the empty staging DB
```

On Vercel, set the staging URL and keys for the **Preview** environment only.
Production variables stay on Production.

Optional, with Docker Desktop: `npm run db:start` runs a full local stack
(Postgres, Auth, Storage, Studio on :54323) from `config.toml`, migrations and
`seed.sql`. Put its URL and keys in `.env.local`.

### B.2 Making a change

```bash
npm run db:new -- add_meal_plans        # creates supabase/migrations/<ts>_add_meal_plans.sql
# write SQL — start with the rollback note:
#   -- Rollback: drop table public.meal_plans;
npm run db:reset                        # local: rebuild from scratch + seed (local only)
npm run db:lint                         # catches missing search_path, etc.
npm run db:types:local                  # regenerate src/lib/supabase/database.types.ts
npm run verify                          # typecheck + tests + build
```

No Docker? Apply to **staging** instead (`npx supabase db push --linked` while
linked to staging) and regenerate types with `npm run db:types`.

Checklist for every migration:
- [ ] new tables: `enable row level security` + explicit policies + least-privilege `grant`s (the unit test checks RLS);
- [ ] `security definer` functions: `set search_path = public`, `_require_staff()`/`_require_manager()` first, `revoke … from public, anon` then targeted `grant execute`;
- [ ] expand/contract for breaking changes: add new column → deploy code that writes both → backfill → deploy code that reads new → drop old in a *later* migration;
- [ ] long backfills run in batches, not inside the DDL migration;
- [ ] `-- Rollback:` note written and tested on staging.

### B.3 Promoting to production

1. Merge the PR. The Vercel Preview has already run against staging.
2. Take a backup: Supabase → Database → Backups (daily backups on paid plans; on
   free, run `npx supabase db dump --linked -f backup-YYYYMMDD.sql` while linked
   to **production**, then re-link to staging).
3. Link to production **temporarily** and dry-run:
   ```bash
   npx supabase link --project-ref sbzwlizkllzjpbqjhued
   npm run db:push:dry                  # must list ONLY the new migration(s)
   npx supabase db push --linked        # apply
   npx supabase link --project-ref <STAGING_REF>   # switch back immediately
   ```
4. Check the Supabase advisors (security + performance), then deploy the code.

**Ordering:** additive migrations go *before* the code that uses them.
Destructive ones (drop/rename) go *after* the code no longer needs them.

### B.4 Rolling back a production migration

1. **Code first:** promote the previous Vercel deployment.
2. If the schema must go back, write a **new forward migration** containing the
   file's `-- Rollback:` SQL. Run it on staging, then production (B.3). Never
   delete the original file or edit `supabase_migrations.schema_migrations` by hand.
3. Data loss or corruption: restore from the backup taken in B.3 step 2 (or PITR
   if enabled) into a *new* project first, verify, then cut over or copy rows back.

### B.5 Edge Functions and secrets

Deploy to staging (`npx supabase functions deploy <name> --project-ref <STAGING_REF>`),
test, then to production. Secrets via `npx supabase secrets set` per project.
Roll back by redeploying the previous version from Git.

## C. Access-architecture release

The release is five migrations, `20261117203948` to `20261117204245`. They add:
- roles and permissions, and MFA for privileged roles;
- guests, the payments ledger, refunds, room blocks and housekeeping tasks;
- the catalogue, content, reviews and notifications;
- the audit log and storage policies.

**Status:** tested in development only. **Not applied to production.**

### C.1 What changes for people using the system
- **Staff roles:** `manager` stays `manager`, and `front_desk` becomes `receptionist`. Production has no staff rows yet.
- **Managers, owners, super admins and finance** must enrol an authenticator app at their next sign-in (`/admin/mfa`). Until they do, the database gives them no access.
- **Payments:** recording a payment still works the same. The booking's paid amount is now derived from the payments ledger.
- **Availability:** room maintenance blocks now reduce what the website sells.
- **Prices:** none change. Rate plans, seasons and promotions don't affect totals yet.

### C.2 Review checklist (before production)
- [ ] Read the five migration files and the rollback script.
- [ ] `npm run db:dev:check` replays every migration from scratch.
- [ ] `npm test` passes, including `tests/db/*`: RLS by role, and the rollback restores the exact schema.
- [ ] Apply to a **staging** Supabase project or branch first. Then sign in there as an owner, a receptionist and a manager (with and without MFA) and run through:
  - a website booking;
  - confirming it and taking a payment;
  - a refund request, approved by finance;
  - blocking a room and checking it disappears from availability;
  - the audit log.
- [ ] Run Supabase's security advisor on staging. Expect only the documented findings: the public RPCs, and `booking_lookup_attempts` having no policy.
- [ ] Enrol MFA for the first owner, then create the owner row (`docs/DATABASE.md` §3).

### C.3 Apply (production, after the review)
1. Back up: Supabase dashboard → Database → Backups (or `pg_dump`).
2. Push in order with the CLI: `npm run db:push:dry` and check the plan lists exactly the five files, then `npx supabase db push --linked`.
3. `npm run db:types` (it should be identical to the committed `database.types.ts`).
4. Deploy the app built from the same commit. Older app builds call `staff.role` values that no longer exist, so ship them together.
5. Smoke test with the C.2 flows on production.

### C.4 Roll back
1. Download anything needed from the `site-media` and `guest-documents` buckets, then empty them. The script refuses to run otherwise.
2. `psql "$DB_URL" -v ON_ERROR_STOP=1 -1 -f supabase/rollbacks/20261117203948_access_architecture.down.sql` (one transaction: all or nothing).
3. Delete the five versions from `supabase_migrations.schema_migrations`.
4. Redeploy the previous app build.

**Data dropped by the rollback:**
- the new tables (guests, payments ledger, refunds, blocks, tasks, reviews, content, notifications, audit log);
- staff roles collapse to `manager` or `front_desk`.

`bookings.amount_paid_bdt` keeps its latest value. `tests/db/rollback.test.ts` proves the resulting schema is identical to the pre-release one.

### C.5 Staging run: 18 Nov 2026

- **Project:** `blossomsquare-staging` (ref `eayihyxelygfljulmmjp`, ap-southeast-1, free plan).
- **Migrations:** all 18 applied in order, plus one staging-only patch that matches two later fixes in the files:
  - `audit.refuse_change` now pins `search_path`;
  - `_guest_document_path_ok` now answers only for staff who can upload documents.
- **Test data:** test users (owner, manager, finance, receptionist, housekeeping, guest), 4 extra rooms and two website bookings. Staging only.
- **Results on real Supabase (Postgres 17, real Storage):** all role checks passed.
  - Anonymous visitors can read only the public catalogue.
  - A signed-in guest sees no booking or payment rows.
  - A receptionist can't edit totals or payments directly.
  - Housekeeping sees no guests or bookings.
  - Manager, finance and owner sessions without MFA are refused; with MFA they work.
  - Rank and self-change rules hold, and the audit log is unreachable.
  - Guest documents upload only into a real booking's folder.
- **Money and inventory flow:** payment ৳2,000, then a ৳500 refund (requested by reception, approved and paid out by finance), leaves ৳1,500 paid (partial). A maintenance block reduced availability from 1 to 0. Audit entries and refund notifications were written.
- **Supabase security advisor:** only the expected findings remain:
  - public RPCs callable without signing in, and staff RPCs callable when signed in (each checks permission internally);
  - tables in `private` and `audit` with RLS on but no policies (deliberate: no direct access);
  - "leaked password protection" off. This is an Auth dashboard setting; turn it on in production if your plan includes it.
- **Not yet tested:** a real browser sign-in with authenticator-app enrolment. The checks above used Supabase's own role and JWT mechanism directly. To try it, point a local or preview build at the staging keys.

### C.6 Production release: 18 Nov 2026

1. **Backup:** the production data was exported to `supabase/backups/2026-11-18-production-before-access-architecture.json`. At the time it held 7 room types, 12 rooms and settings; there were no bookings, staff, enquiries, users or files.
2. **Migrations:** the five migrations were applied to production. The local files were renamed to the versions production recorded:
   - `20261117203948_rbac`
   - `20261117204108_reservations`
   - `20261117204211_catalogue_and_content`
   - `20261117204238_audit_log`
   - `20261117204245_storage`

   The rollback script is `supabase/rollbacks/20261117203948_access_architecture.down.sql`.
3. **Checks on production (read-only, as a visitor):**
   - 7 room types and availability are visible;
   - bookings, guests, staff and the audit log are refused;
   - 7 roles, 12 amenities and 7 rate plans exist;
   - rooms and prices are unchanged;
   - the 3 buckets exist.

   The security advisor shows only the documented findings.
4. **App:** deployed to Vercel production (`blossomsquare.online`).
   - All 16 public pages, the sitemap and robots.txt return 200.
   - `/admin` redirects to the login page, and `/design-system` returns 404.
   - Live prices and availability come from Supabase.

**Next (owner):**
1. Create the first owner: an Auth user, then a staff row with role `owner` (`docs/DATABASE.md` §3).
2. Sign in at `/admin` and enrol the authenticator app.
3. Optionally turn on leaked-password protection in Auth settings.

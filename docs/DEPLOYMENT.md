# Deployment, configuration, backup & rollback

How Blossom Square is deployed, how to release a change safely, and how to recover.

Detailed per-release records are in [MIGRATION_AND_ROLLBACK.md](MIGRATION_AND_ROLLBACK.md); test evidence is in [RELEASE_REPORT.md](RELEASE_REPORT.md).

## 1. Production configuration

| Piece | Value |
| ----- | ----- |
| Domain | `blossomsquare.online`. DNS at Namecheap (A `@` → Vercel; CNAME `www` → Vercel); HTTPS by Vercel (Let's Encrypt, auto-renewed); HSTS 2 years |
| Hosting | Vercel project `blossomsquare-hotel` (`prj_W8fWyO2uopPo2EemOvRlNERnzC3B`), team of the hotel account, **Hobby plan** |
| Database / auth / storage | Supabase project `sbzwlizkllzjpbqjhued` (ap-southeast-1, Postgres 17), **Free plan** |
| Staging | Supabase project `eayihyxelygfljulmmjp`. Used for migration rehearsals and browser tests (run the app locally against it) |

Vercel Production environment variables (names only):

| Variable | Kind | Set? |
| -------- | ---- | ---- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL` | public config | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | legacy, unused while the publishable key is set | ✅ (can be removed) |
| `SUPABASE_SECRET_KEY` | Sensitive | ✅ |
| `CRON_SECRET` | Sensitive; must equal the Supabase vault secret `bsq_cron_secret` | ✅ |
| `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET` | Sensitive | ⏸ not yet (email off) |
| `WHATSAPP_*`, `SSLCOMMERZ_*`, `BKASH_*` | Sensitive | ⏸ not yet (see [PAYMENTS_AND_MESSAGING.md](PAYMENTS_AND_MESSAGING.md)) |

Supabase scheduled jobs (pg_cron):

| Job | Schedule (UTC) | What it does |
| --- | -------------- | ------------ |
| `bsq-booking-expiry` | every 5 min | expire holds and unpaid advance bookings |
| `bsq-payment-intents` | every 5 min | expire unpaid gateway intents |
| `bsq-message-sweep` | every 5 min | POST `/api/jobs/messages` with `Bearer` from the vault (`bsq_cron_secret`) |
| `bsq-pre-arrival` | 04:00 | queue tomorrow's arrival reminders |

Supabase Auth settings to confirm in the dashboard (they can't be read from here):

- public sign-ups **disabled**;
- Site URL `https://blossomsquare.online`;
- redirect URL `https://blossomsquare.online/admin/auth/confirm`;
- TOTP MFA enabled (it is the default).

## 2. Normal release procedure

Never skip staging, the backup or the rollback file.

1. **Build and test locally.** Run `npm run verify` (typecheck, 373+ tests, build). It must be green.
2. **Write the migration and its rollback** (if the database changes):
   - add `supabase/migrations/<version>_<name>.sql` and a rollback in `supabase/rollbacks/`;
   - add a rollback test that compares schemas (see `tests/db/*-rollback.test.ts`);
   - regenerate types: `npm run db:types:dev`.
3. **Rehearse on staging:**
   - apply the migration to `eayihyxelygfljulmmjp`;
   - run the browser suite against a local production build pointed at staging:
     ```powershell
     $env:NEXT_PUBLIC_SUPABASE_URL='https://eayihyxelygfljulmmjp.supabase.co'
     $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='<staging publishable key>'
     $env:NEXT_PUBLIC_SITE_URL='http://localhost:3100'
     npx next build; npx next start -p 3100     # (second terminal for the tests)
     $env:E2E_PASSWORD='<staging test password>'; $env:E2E_OWNER_TOTP='<staging owner key>'
     npx tsx scripts/e2e/journeys.mts            # must be 38/38
     $env:CHECK_URL='https://eayihyxelygfljulmmjp.supabase.co'; $env:CHECK_KEY='<staging publishable key>'
     npx tsx scripts/concurrency-check.mts       # must say "All checks passed"
     ```
4. **Back up production:** export the affected tables to `supabase/backups/<date>-production-before-<release>.json` (§6).
5. **Apply the migration to production.** Large files go in two parts, and part 1 ends with an interim guard (RLS on, rights revoked) so nothing is exposed between the parts. Prove on PGlite that part 1, the guard and part 2 together equal the file.
6. **Check production:**
   - RLS on new tables;
   - `has_function_privilege` for anon/authenticated on new functions;
   - the security advisor;
   - a pricing spot check.
7. **Deploy the app:**
   ```powershell
   node "$env:LOCALAPPDATA\npm-cache\_npx\67eb4586ca667318\node_modules\vercel\dist\vc.js" deploy --prod --yes
   ```
   (`npx vercel` fails on this machine with an npm cache error; the cached CLI works.)
8. **Smoke test:**
   - `npx tsx scripts/e2e/prod-audit.mts` (read-only): 0 broken pages and images;
   - `/api/health` returns 200;
   - `/admin/*` redirects to sign-in;
   - `/api/jobs/messages` returns 401 without the secret.
9. **Record it** in [MIGRATION_AND_ROLLBACK.md](MIGRATION_AND_ROLLBACK.md).

## 3. Final release — done 18 Nov 2026

All of the changes below are **live**; the step-by-step record is in [RELEASE_REPORT.md](RELEASE_REPORT.md) §7. Production recorded these migrations under versions 20261118161825, 20261118161841 and 20261118162052. The local files keep their 20261119… names so that they still sort after the earlier local files.

| Change | Kind | Rehearsed |
| ------ | ---- | --------- |
| `20261119090000_content_editor_room_copy.sql` | 2 new functions + helper, grants | applied to staging; browser journey 9 passed |
| `20261119100000_operational_hygiene.sql` | replaces `_after_booking_status`, adds `rooms_status_closes_tasks` trigger, one-off tidy | database tests and rollback test passed (not yet on staging) |
| Move `pg_net` to the `extensions` schema | `drop extension pg_net; create extension pg_net with schema extensions;`. The sweep job calls `net.http_post` (schema `net`, unaffected); old HTTP response logs are lost | — |
| App deploy | photo variants + loader, CSP header, `/api/health`, room-copy UI, manage-page message fix, booking-page mobile clip, history labels | browser suite 38/38 on the new build |
| Vercel domain setting | `www.blossomsquare.online` → 308 redirect to `blossomsquare.online` | — |

Rollback:

- the hygiene migration: `supabase/rollbacks/20261119100000_operational_hygiene.down.sql` (tested);
- the room-copy migration: drop its three functions (listed in the same file);
- the app: Vercel → Deployments → promote the previous deployment (instant).

## 4. First owner account (owner action, required before staff can work)

Production has **no staff accounts**.

1. **Create the account:** Supabase dashboard → Authentication → Users → **Invite user** with the owner's email.
2. **Make it the owner:** in the SQL editor, run (replace the email and name):
   ```sql
   insert into public.staff (user_id, full_name, role)
   select id, 'Owner Name', 'owner' from auth.users where email = 'owner@example.com';
   ```
3. **Set a password:** the owner opens the invite email, sets a password (at least 10 characters), and signs in at `https://blossomsquare.online/admin/login`.
4. **Two-step sign-in (optional):** the owner decided on 18 Nov 2026 that no role must use an authenticator app (`private.roles.requires_mfa = false`, migration `20261119120000_mfa_optional`). Anyone can still turn it on from their Account page. To require it again: `update private.roles set requires_mfa = true where code in ('owner','super_admin','manager','finance');`.

   **Done 18 Nov 2026:** owner account `blossomsquarehotel@gmail.com` ("mrrmr") created by the owner in the dashboard and made owner by SQL.
5. **Invite colleagues:** Admin → Team → invite, choosing each person's role. Nobody can appoint at or above their own rank.
6. **Fill in hotel details:**
   - Settings: VAT %, service %, advance %, policies, ways to pay;
   - Rooms: real room numbers;
   - Website content: as needed.

## 5. Monitoring

| What | How | Status |
| ---- | --- | ------ |
| Uptime | External monitor (free tiers: UptimeRobot, Better Stack) polling `https://blossomsquare.online/api/health` every 5 min; alert on non-200 | Endpoint ready after the pending deploy; the monitor itself needs an account (owner) |
| Scheduled jobs | `select jobname, status, start_time from cron.job_run_details order by start_time desc limit 20;` and `select status_code, count(*) from net._http_response group by 1;` | Checked: 0 failures |
| Server errors | Vercel → Logs (Hobby keeps ~30 minutes) | Recommend Vercel Pro observability, or an error tracker such as Sentry |
| Messages and payments | Admin → Guest messages ("Needs attention"); Admin → Payments → Reconciliation | Built in |
| Database health | Supabase → Advisors (security, performance) after each migration | Last run 18 Nov: no new security issues |

## 6. Backups and restore

**Current state.** The Supabase **Free plan has no restorable automatic backups.**

**Recommended.** Upgrade the organisation to **Pro** (daily backups kept 7 days, no project pausing; point-in-time recovery is an add-on). Owner decision.

Until then, and in addition, take manual exports:

- **Before every release:** a JSON snapshot of the affected tables to `supabase/backups/` (done for every release so far).
- **Weekly (and before risky changes):** a full logical dump with the database password (Supabase → Project Settings → Database). Store it off-site.
  ```powershell
  npx supabase db dump --db-url "postgresql://postgres:<password>@db.sbzwlizkllzjpbqjhued.supabase.co:5432/postgres" -f backup-schema.sql
  npx supabase db dump --db-url "<same>" --data-only -f backup-data.sql
  ```
- **Storage** (room photos and website media): download the `room-photos` and `site-media` buckets from the dashboard. The hotel's original photos are also in `public/photos/` in the repo.

**Restore.**

- Schema problems: run the release's rollback file (§7).
- Lost data: restore from the Pro daily backup (dashboard). Without Pro, load `backup-data.sql` into a **new** project, check it, then point Vercel's environment at it.
- Rehearse a restore into a scratch project once a quarter.

## 7. Rollback procedure

1. **The app.** Vercel → Deployments → previous production deployment → **Promote**. This takes seconds and touches no data.
2. **The database.** Run the release's down file in one transaction (each is tested to restore the previous schema exactly), then delete its rows from `supabase_migrations.schema_migrations`:
   ```
   psql "$DB_URL" -v ON_ERROR_STOP=1 -1 -f supabase/rollbacks/<version>_<name>.down.sql
   ```
   - Always roll back the app first if the new app relies on the new database functions.
   - Each down file lists the data it can't keep (for example, the payments rollback drops receipt numbers but keeps every payment).
3. **Scheduled jobs.** If a release added any, unschedule them: `select cron.unschedule('<job>');`.
4. **Secrets.** If one was exposed, rotate it at the provider, update Vercel (and for `CRON_SECRET`, the vault secret `bsq_cron_secret`), and redeploy.

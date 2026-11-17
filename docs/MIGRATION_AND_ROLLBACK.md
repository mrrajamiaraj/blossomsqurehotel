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

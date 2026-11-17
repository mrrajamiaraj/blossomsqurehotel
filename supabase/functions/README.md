# Supabase Edge Functions

No Edge Functions are deployed yet. This folder is where they go.

## Planned (see docs/IMPLEMENTATION_CHECKLIST.md)

| Function                | Trigger                                  | Needs secrets                 |
| ----------------------- | ---------------------------------------- | ----------------------------- |
| `booking-notify`        | Database webhook on `booking_events` insert | email/SMS provider API key  |
| `payment-webhook`       | bKash / Nagad / card gateway callback    | gateway signing secret        |

## Conventions

- One folder per function: `supabase/functions/<name>/index.ts` (Deno).
- Create with `npx supabase functions new <name>`; serve locally with
  `npx supabase functions serve <name>` (needs the local stack / Docker).
- Secrets go in Supabase → Edge Functions → Secrets (or
  `npx supabase secrets set NAME=value`) — never in this repo.
- Verify webhook signatures before doing anything; return 2xx only after the
  work is committed.
- Deploy to **staging first**: `npx supabase functions deploy <name> --project-ref <staging-ref>`.

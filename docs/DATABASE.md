# Blossom Square — Database & access architecture

Supabase Postgres with Row Level Security on every table, permission-based
staff roles, MFA for privileged roles, an append-only audit log and
per-bucket storage policies.

- **Migrations:** `supabase/migrations/` (applied in filename order).
- **Rollback for this release:** `supabase/rollbacks/20261118100000_access_architecture.down.sql`.
- **Tests:** `tests/db/` (real PostgreSQL via PGlite: `npm run test:db`).
- **Status (18 Nov 2026):** migrations `20261118100000` to `20261118100400` exist in development only. They are **not applied to production**. See the release plan in [MIGRATION_AND_ROLLBACK.md](MIGRATION_AND_ROLLBACK.md#access-architecture-release).

## 1. Schemas

| Schema | Exposed through the Data API | Contents |
| ------ | ---------------------------- | -------- |
| `public` | yes (RLS on every table) | hotel data, website data, the RPC functions the app calls |
| `private` | **no** | `roles`, `permissions`, `role_permissions` |
| `audit` | **no** | `logs` (append-only) |
| `storage` | Supabase-managed | buckets `room-photos`, `site-media`, `guest-documents` |

## 2. Tables

The requested model maps onto these tables. "Reservations" are the existing `bookings` rows, kept so the live site and desk keep working.

| Requirement | Table | Notes |
| ----------- | ----- | ----- |
| Staff profiles | `staff` | `user_id` → `auth.users`; role → `private.roles`; email, phone, job title |
| Roles & permissions | `private.roles`, `private.permissions`, `private.role_permissions` | seven roles, 26 permissions |
| Guests | `guests` | matched by email, then the last 10 digits of the phone; optional `user_id` for a guest account |
| Room types | `room_types` | prices used for every total today |
| Physical rooms | `rooms` | housekeeping status, out of service |
| Amenities | `amenities`, `room_type_amenities` | seeded from the room types' feature lists |
| Room images | `room_images` | path in `room-photos` or `/photos/…`; one cover per type |
| Rate plans | `rate_plans` | a STANDARD plan per room type is seeded |
| Seasonal prices | `seasonal_rates` | no overlapping active season per type and plan (exclusion constraint) |
| Maintenance blocks | `room_blocks` | no overlapping active blocks per room; availability subtracts them |
| Reservations | `bookings` | totals and paid amounts are never writable through the API |
| Reserved rooms | `booking_rooms` | one row per room; synced from `bookings` by trigger; no double assignment (exclusion) |
| Booking guests | `booking_guests` | primary guest synced; `id_document_path` points into the private bucket |
| Payments | `payments` | ledger; `bookings.amount_paid_bdt` is derived from it by trigger |
| Refunds | `refunds` | requested → approved/rejected → completed; the requester can't approve (four eyes) |
| Promotions | `promotions` | public when active and public |
| Housekeeping tasks | `housekeeping_tasks` | a cleaning task is created automatically at check-out |
| Contact enquiries | `inquiries` | from the website forms |
| Event enquiries | `event_inquiries` | 1:1 extension of `inquiries` (type, space, date, guests, budget) |
| Reviews | `reviews` | website reviews need a completed stay; external ones need a source link; public only when approved |
| Website content | `site_content` | keyed blocks, draft/published, `en` / `bn` |
| Hotel settings | `hotel_settings` | single row |
| Notifications | `notifications` | per-staff inbox, filled by triggers |
| Audit logs | `audit.logs` | written by trigger; immutable |

Also: `booking_events` (per-booking history), `booking_lookup_attempts` (throttle log) and the `guest_summary` view (`security_invoker`).

> **Pricing:** rate plans, seasonal rates and promotions are stored and protected, but **don't change any total yet**. `_stay_total()` and the website quote still use `room_types` prices. They are switched together in the next phase, so the price shown always equals the price charged.

## 3. Roles

| Role | Rank | MFA | Can |
| ---- | ---- | --- | --- |
| Owner | 100 | required | everything; appoint owners |
| Super admin | 90 | required | everything below owner |
| Manager | 70 | required | everything except approving refunds; team below manager |
| Finance | 50 | required | payments, voids, refunds (request and approve), reports, read bookings and guests |
| Receptionist | 40 | — | bookings, guests, desk payments, refund requests, housekeeping, enquiries, guest documents |
| Content editor | 30 | — | website content, media, reviews |
| Housekeeping | 20 | — | housekeeping tasks and room cleaning status |

The full matrix is in `20261118100000_rbac.sql`. `src/lib/access.ts` mirrors it for the UI, and a test fails if the two differ.

**Rules enforced in the database:**
- **Permission checks:** every policy and staff function checks a *permission* (`has_permission` / `_require`), never a role name.
- **MFA:** privileged roles get **no** permission unless the session's JWT has `aal = aal2`. Without it, reads return nothing and functions raise `MFA_REQUIRED`. The admin sends them to `/admin/mfa` (TOTP enrol / verify).
- **Staff changes:** staff rows have no write grants. They change only via `admin_upsert_staff`, `admin_set_staff_role` and `admin_set_staff_active`. These refuse self-changes and appointments at or above your own rank (owners may appoint owners), and they keep at least one active owner.

**Bootstrap the first owner** (once, in the SQL editor, after creating the Auth user and enrolling MFA):

```sql
insert into public.staff (user_id, full_name, role, email)
select id, 'Owner Name', 'owner', email from auth.users where email = 'owner@example.com';
```

## 4. Who can do what (summary of RLS and grants)

| | anon | signed-in guest | staff (by permission) |
| --- | --- | --- | --- |
| room types, amenities, rate plans, promotions, images | read public rows | same | read all; write by permission |
| site content, reviews | read published / approved (public columns only for reviews) | same | editors read/write all |
| bookings, booking_events, booking_rooms | — | own via `my_bookings()` (safe columns) | `bookings.read` |
| guests, booking_guests | — | own profile; may edit name/phone/country/opt-in | `guests.read` |
| payments, refunds | — | — | `payments.read`; writes via functions only |
| inquiries, event_inquiries | submit via functions | same | `inquiries.read` |
| housekeeping_tasks, room_blocks | — | — | `housekeeping.read` / staff |
| notifications | — | — | own inbox only |
| staff | — | — | own row, or `staff.read` |
| private.*, audit.* | — | — | via functions only (`admin_audit_log` needs `audit.read`) |

**Never writable through the API:**
- `staff`, `bookings`, `payments`, `refunds`, `booking_events`, `booking_rooms`, `inquiries`, `notifications`, `audit.logs`;
- `rooms`, except the three columns `housekeeping`, `out_of_service` and `service_note` (a trigger re-checks permissions per column).

## 5. Server-side functions (the only write path for protected data)

**Public (anon):**
- `room_availability`
- `create_booking`
- `lookup_booking`
- `submit_inquiry`
- `submit_event_inquiry`
- `submit_review`

**Signed-in guest:**
- `my_bookings`
- `claim_guest_profile`

**Staff**, each starting with a permission check:

| Area | Functions |
| ---- | --------- |
| Bookings | `admin_create_booking`, `admin_set_status`, `admin_assign_room`, `admin_modify_booking` |
| Guests | `admin_update_guest_details` |
| Payments and refunds | `admin_record_payment`, `admin_void_payment`, `admin_request_refund`, `admin_decide_refund`, `admin_complete_refund` |
| Rooms and maintenance | `admin_add_room`, `admin_update_room_unit`, `admin_delete_room`, `admin_block_room`, `admin_release_block` |
| Housekeeping | `admin_create_task`, `admin_update_task` |
| Enquiries and reviews | `admin_set_inquiry_status`, `admin_moderate_review`, `admin_add_review` |
| Staff | `admin_upsert_staff`, `admin_set_staff_role`, `admin_set_staff_active` |
| Audit, access and inbox | `admin_audit_log`, `my_access`, `mark_notifications_read` |

All are `SECURITY DEFINER` with a pinned `search_path`. Internal helpers (`_require`, `_free_units`, `_recalc_paid`, …) aren't executable by `anon` or `authenticated`.

The app calls them through server actions (`src/app/admin/actions.ts`, `src/app/admin/operations.ts`). Each action validates input and checks the permission first. The secret key is used only to create Auth users for invitations and to read staff emails. It never writes staff rows.

**Edge Functions:** none are needed today. Every elevated operation is a database function run as the signed-in user, which keeps the permission check, the work and the audit entry in one transaction. Edge Functions are reserved for third-party callbacks (a payment gateway webhook) when that arrives.

## 6. Audit log

`audit.capture()` runs after every insert, update or delete on these tables:
- `staff`, `bookings`, `payments`, `refunds`, `guests`;
- `room_types`, `rooms`, `room_blocks`, `room_images`;
- `rate_plans`, `seasonal_rates`, `promotions`;
- `hotel_settings`, `site_content`, `reviews`.

**Each entry records:**
- the actor and their role;
- the database role;
- the action and record;
- the changed fields;
- before and after copies of the row.

No API role has any grant on `audit.logs`. A trigger refuses UPDATE, DELETE and TRUNCATE for everyone, including the table owner (only a superuser dropping the trigger could). Staff read it with `admin_audit_log(table, record, limit)`, which needs `audit.read`.

## 7. Storage

| Bucket | Public | Read (list) | Write |
| ------ | ------ | ----------- | ----- |
| `room-photos` | yes | `rooms.manage` or `content.manage` | same |
| `site-media` | yes | `content.manage` | same |
| `guest-documents` | **no** | `documents.read` | `documents.write`, only to `bookings/<existing booking id>/<file>`; no overwrite; delete needs `staff.manage` |

Guest documents are only ever shown through short-lived signed URLs.

## 8. Typed access layer

| What | Where |
| ---- | ----- |
| Generated database types (from the migrations) | `src/lib/supabase/database.types.ts`, rebuilt by `npm run db:types:dev` (no Supabase project needed), or by `npm run db:types` once the migrations are in the linked project |
| Roles, permissions and rank rules | `src/lib/access.ts` (`can`, `assignableRoles`, `canManage`) |
| Session, permission checks and MFA redirect | `src/lib/admin/session.ts` (`requireAdmin`, `requirePermission`) |
| Payments, refunds, blocks, tasks, notifications, audit | `src/lib/data/operations.ts` (`OperationsRepo`) |
| Domain types for bookings and enquiries | `src/lib/data/types.ts` |

## 9. Tests (`npm run test:db`, also part of `npm test`)

| File | What it proves |
| ---- | -------------- |
| `tests/db/rls.test.ts` | each role (anonymous, guest, receptionist, housekeeping, content editor, finance, manager with and without MFA, owner): what it can and can't read, write and call; ledger maths; four-eyes refunds; rank rules; last owner; audit immutability; storage paths; notifications |
| `tests/db/rollback.test.ts` | all migrations plus the rollback produce the **exact** pre-release schema (tables, columns, constraints, indexes, function bodies, policies, grants, triggers, buckets); old desk flows work after rollback; the rollback refuses to run while private documents exist |
| `tests/db/access-parity.test.ts` | `src/lib/access.ts` equals the database seed |
| `tests/security-boundaries.test.ts` | the secret key is used only in `admin.ts`; RLS is enabled in every migration; `search_path` is pinned |

The harness (`tests/db/harness.ts`) creates `anon`, `authenticated` and `service_role`, plus `auth.uid()` and `auth.jwt()` (including `aal`), `auth.users`, `auth.mfa_factors` and the `storage` schema. PostgREST requests are reproduced with `SET ROLE` and `request.jwt.claims`.

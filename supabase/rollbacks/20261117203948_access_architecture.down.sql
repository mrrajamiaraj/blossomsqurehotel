-- ROLLBACK for the access-architecture migrations:
--   20261117203948_rbac · 20261117204108_reservations · 20261117204211_catalogue_and_content
--   20261117204238_audit_log · 20261117204245_storage
--
-- Returns the schema to exactly the state after 20261117194819 (proved by
-- tests/db/rollback.test.ts, which compares tables, columns, functions,
-- policies, grants and triggers). Run as one transaction:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -1 -f supabase/rollbacks/20261117203948_access_architecture.down.sql
-- then delete the five rows from supabase_migrations.schema_migrations.
--
-- DATA LOSS: rows in the new tables (guests, payments ledger, refunds, room
-- blocks, housekeeping tasks, reviews, site content, notifications, audit
-- log, …) are dropped. bookings.amount_paid_bdt keeps its last value. Staff
-- roles collapse to manager (owner, super_admin, manager) or front_desk.
-- Export anything you need first. The script stops (and changes nothing) if
-- the new private storage bucket still holds files.

/* ================================================== 5. storage (100400) */

drop policy if exists "room photos: editors read" on storage.objects;
drop policy if exists "room photos: editors upload" on storage.objects;
drop policy if exists "room photos: editors update" on storage.objects;
drop policy if exists "room photos: editors delete" on storage.objects;
drop policy if exists "site media: editors read" on storage.objects;
drop policy if exists "site media: editors upload" on storage.objects;
drop policy if exists "site media: editors update" on storage.objects;
drop policy if exists "site media: editors delete" on storage.objects;
drop policy if exists "guest documents: documents.read" on storage.objects;
drop policy if exists "guest documents: documents.write uploads" on storage.objects;
drop policy if exists "guest documents: senior staff delete" on storage.objects;
drop function if exists public._guest_document_path_ok(text);

do $$
begin
  if exists (select 1 from storage.objects where bucket_id in ('site-media', 'guest-documents')) then
    raise exception 'rollback: empty the site-media and guest-documents buckets first (download anything you need)';
  end if;
end;
$$;
delete from storage.buckets where id in ('site-media', 'guest-documents');

create policy "room photos: managers read"
  on storage.objects for select to authenticated
  using (bucket_id = 'room-photos' and public.is_manager());
create policy "room photos: managers upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'room-photos' and public.is_manager());
create policy "room photos: managers update"
  on storage.objects for update to authenticated
  using (bucket_id = 'room-photos' and public.is_manager())
  with check (bucket_id = 'room-photos' and public.is_manager());
create policy "room photos: managers delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'room-photos' and public.is_manager());

/* ================================================ 4. audit log (100300) */

do $$
declare
  t text;
begin
  foreach t in array array['staff', 'bookings', 'payments', 'refunds', 'room_types', 'rooms', 'room_blocks', 'rate_plans',
                           'seasonal_rates', 'promotions', 'hotel_settings', 'site_content', 'reviews', 'guests', 'room_images']
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
  end loop;
end;
$$;
drop function if exists public.admin_audit_log(text, text, integer);
drop schema if exists audit cascade;

/* ===================================== 3. catalogue and content (100200) */

drop trigger if exists bookings_notify on public.bookings;
drop trigger if exists inquiries_notify on public.inquiries;
drop trigger if exists refunds_notify on public.refunds;
drop function if exists public.mark_notifications_read(uuid[]);
drop function if exists public._notify_refund();
drop function if exists public._notify_new_inquiry();
drop function if exists public._notify_new_booking();
drop function if exists public._notify(text, text, text, text, text);
drop function if exists public.admin_add_review(text, integer, text, text, text, text, date);
drop function if exists public.admin_moderate_review(uuid, text);
drop function if exists public.submit_review(text, text, integer, text, text);
drop function if exists public.submit_event_inquiry(text, text, text, text, text, text, date, integer, integer, boolean, integer);
drop table if exists public.notifications;
drop table if exists public.site_content;
drop function if exists public._site_content_stamp();
drop table if exists public.reviews;
drop table if exists public.event_inquiries;
alter table public.bookings drop column if exists promotion_id, drop column if exists rate_plan_id;
drop table if exists public.promotions;
drop table if exists public.seasonal_rates;
drop table if exists public.rate_plans;
drop table if exists public.room_images;
drop table if exists public.room_type_amenities;
drop table if exists public.amenities;

/* ============================================= 2. reservations (100100) */

drop trigger if exists bookings_after_status on public.bookings;
drop trigger if exists bookings_sync_children on public.bookings;
drop trigger if exists bookings_link_guest on public.bookings;
drop trigger if exists payments_recalc on public.payments;
drop trigger if exists refunds_recalc on public.refunds;

drop function if exists public.my_bookings();
drop function if exists public.claim_guest_profile();
drop function if exists public.admin_update_task(uuid, text, text);
drop function if exists public.admin_create_task(uuid, text, date, uuid, text, smallint);
drop function if exists public.admin_release_block(uuid);
drop function if exists public.admin_block_room(uuid, date, date, text);
drop function if exists public.admin_complete_refund(uuid, text);
drop function if exists public.admin_decide_refund(uuid, boolean);
drop function if exists public.admin_request_refund(uuid, integer, text, text, uuid);
drop function if exists public.admin_void_payment(uuid, text);
drop function if exists public._after_booking_status();
drop function if exists public._ledger_changed();
drop function if exists public._recalc_paid(uuid);
drop function if exists public._sync_booking_children();
drop function if exists public._link_booking_guest();

drop table if exists public.housekeeping_tasks;
drop table if exists public.room_blocks;
drop table if exists public.refunds;
drop table if exists public.payments;
drop table if exists public.booking_guests;
drop table if exists public.booking_rooms;
drop index if exists public.bookings_stay_idx;
drop index if exists public.bookings_guest_idx;
alter table public.bookings drop column if exists guest_id;
drop function if exists public._upsert_guest(text, text, text, text);
drop table if exists public.guests;

-- Original availability (no maintenance blocks).
create or replace function public._free_units(p_type uuid, p_in date, p_out date, p_exclude uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from rooms r where r.room_type_id = p_type and not r.out_of_service)::integer
       - coalesce((
           select sum(b.rooms) from bookings b
           where b.room_type_id = p_type
             and b.status in ('pending', 'confirmed', 'checked_in')
             and b.check_in < p_out and b.check_out > p_in
             and (p_exclude is null or b.id <> p_exclude)
         ), 0)::integer;
$$;

-- Original desk payment (edits the booking directly).
create or replace function public.admin_record_payment(p_booking uuid, p_amount integer, p_method text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings%rowtype;
  v_paid integer;
begin
  perform public._require_staff();
  select * into b from bookings where id = p_booking for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if b.status in ('cancelled', 'no_show') then
    raise exception 'LOCKED';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000
     or p_method not in ('cash', 'bkash', 'nagad', 'card', 'bank', 'other') then
    raise exception 'BAD_AMOUNT';
  end if;

  v_paid := b.amount_paid_bdt + p_amount;
  update bookings set
    amount_paid_bdt = v_paid,
    payment_status = case when v_paid >= b.total_bdt then 'paid' else 'partial' end
  where id = b.id;

  perform public._log(b.id, 'payment', jsonb_build_object(
    'amount', p_amount, 'method', p_method, 'note', left(coalesce(p_note, ''), 200)
  ));
end;
$$;

/* ===================================================== 1. rbac (100000) */

-- Admin functions: specific permission check -> "any staff" again.
do $$
declare
  f text;
  v_def text;
begin
  foreach f in array array['admin_create_booking', 'admin_set_status', 'admin_assign_room', 'admin_modify_booking',
                           'admin_update_guest_details', 'admin_set_inquiry_status']
  loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f;
    if v_def is null then
      raise exception 'rollback: function % not found', f;
    end if;
    execute regexp_replace(v_def, 'perform public\._require\(''[a-z_.]+''\);', 'perform public._require_staff();');
  end loop;
end;
$$;

-- Original helper definitions.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.staff_role() is not null;
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.staff_role() = 'manager', false);
$$;

create or replace function public._require_staff()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_STAFF';
  end if;
end;
$$;

create or replace function public._require_manager()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'NOT_MANAGER';
  end if;
end;
$$;

create or replace function public.guard_room_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.out_of_service is distinct from old.out_of_service
          or new.room_type_id is distinct from old.room_type_id
          or new.number is distinct from old.number)
     and not public.is_manager() then
    raise exception 'NOT_MANAGER';
  end if;
  return new;
end;
$$;

-- Original policies.
drop policy if exists "staff: own row, or staff.read" on public.staff;
create policy "Staff read own row, managers read all"
  on public.staff for select to authenticated
  using (user_id = auth.uid() or public.is_manager());

drop policy if exists "room types: rates.manage or rooms.manage update" on public.room_types;
create policy "Managers update room types"
  on public.room_types for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

drop policy if exists "rooms: housekeeping, maintenance or rooms.manage update" on public.rooms;
create policy "Staff update rooms"
  on public.rooms for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists "bookings: bookings.read" on public.bookings;
create policy "Staff read bookings"
  on public.bookings for select to authenticated
  using (public.is_staff());

drop policy if exists "booking events: bookings.read" on public.booking_events;
create policy "Staff read booking events"
  on public.booking_events for select to authenticated
  using (public.is_staff());

drop policy if exists "settings: settings.manage update" on public.hotel_settings;
create policy "Managers update settings"
  on public.hotel_settings for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

drop policy if exists "inquiries: inquiries.read" on public.inquiries;
create policy "staff read inquiries" on public.inquiries
  for select to authenticated using (public.is_staff());

-- Original grants on rooms (whole-row update).
revoke update (housekeeping, out_of_service, service_note) on public.rooms from authenticated;
grant update on public.rooms to authenticated;

drop function if exists public.admin_set_staff_active(uuid, boolean);
drop function if exists public.admin_set_staff_role(uuid, text);
drop function if exists public.admin_upsert_staff(uuid, text, text);
drop function if exists public.my_access();
drop function if exists public._require(text);
drop function if exists public.has_permission(text);
drop function if exists public._role_needs_mfa(text);
drop function if exists public._role_rank(text);

-- Staff table back to two roles.
drop index if exists public.staff_role_idx;
alter table public.staff drop constraint if exists staff_role_fkey;
update public.staff set role = case when role in ('owner', 'super_admin', 'manager') then 'manager' else 'front_desk' end;
alter table public.staff
  drop column if exists updated_by,
  drop column if exists updated_at,
  drop column if exists job_title,
  drop column if exists phone,
  drop column if exists email,
  add constraint staff_role_check check (role in ('manager', 'front_desk'));

drop schema if exists private cascade;

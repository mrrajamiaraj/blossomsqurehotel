-- Guests, reserved rooms, booking guests, payments ledger, refunds,
-- maintenance blocks and housekeeping tasks.
--
-- "Reservations" are the existing public.bookings rows (kept, so the website
-- and front desk keep working). New tables hang off them:
--   guests              one profile per person (matched by email, then phone)
--   booking_rooms       one row per room in a reservation (multi-room ready)
--   booking_guests      the people staying
--   payments / refunds  a ledger; bookings.amount_paid_bdt is derived from it
--   room_blocks         maintenance blocks; availability subtracts them
--   housekeeping_tasks  cleaning / inspection work; created on check-out
--
-- Nothing here is writable through the API. Totals, paid amounts, payment
-- status and inventory change only inside SECURITY DEFINER functions that
-- check a permission first.
--
-- Error codes: NOT_STAFF, NOT_ALLOWED, MFA_REQUIRED, NOT_FOUND, BAD_AMOUNT, LOCKED,
-- REFUND_TOO_LARGE, SAME_PERSON, BAD_TRANSITION, ROOM_IN_USE, ROOM_NEEDED, BAD_DATES,
-- BLOCK_OVERLAP, BAD_TASK.
--
-- Rollback (in order): drop the functions and triggers created below; restore
-- _free_units and admin_record_payment from 20261116114952 (with the
-- _require('payments.record') line from 20261118100000); drop tables
-- housekeeping_tasks, room_blocks, refunds, payments, booking_guests,
-- booking_rooms; alter table bookings drop column guest_id; drop table guests.

/* ================================================================ Guests */

create table public.guests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid unique references auth.users (id) on delete set null,
  full_name        text not null check (char_length(full_name) between 2 and 120),
  email            text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone            text check (phone is null or char_length(phone) between 6 and 30),
  phone_key        text generated always as (nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10), '')) stored,
  country          text check (country is null or char_length(country) <= 60),
  marketing_opt_in boolean not null default false,
  staff_notes      text check (staff_notes is null or char_length(staff_notes) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint guests_contact check (email is not null or phone is not null)
);

create unique index guests_email_key on public.guests (lower(email)) where email is not null;
create index guests_phone_key_idx on public.guests (phone_key) where phone_key is not null;

-- Finds the guest by email, then by phone; creates one if neither matches.
create or replace function public._upsert_guest(p_name text, p_email text, p_phone text, p_country text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_key   text := nullif(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10), '');
begin
  if v_email is not null then
    select id into v_id from guests where lower(email) = v_email;
  end if;
  if v_id is null and v_key is not null then
    select id into v_id from guests
    where phone_key = v_key and (email is null or v_email is null or lower(email) = v_email)
    order by created_at limit 1;
  end if;
  if v_id is null then
    insert into guests (full_name, email, phone, country)
    values (trim(p_name), v_email, nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_country, '')), ''))
    returning id into v_id;
  else
    update guests set
      email = coalesce(email, v_email),
      phone = coalesce(phone, nullif(trim(coalesce(p_phone, '')), '')),
      country = coalesce(country, nullif(trim(coalesce(p_country, '')), '')),
      updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end;
$$;

alter table public.bookings add column if not exists guest_id uuid references public.guests (id) on delete restrict;
create index if not exists bookings_guest_idx on public.bookings (guest_id);
create index if not exists bookings_stay_idx on public.bookings (room_type_id, check_in, check_out)
  where status in ('pending', 'confirmed', 'checked_in');

create or replace function public._link_booking_guest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.email is distinct from old.email or new.phone is distinct from old.phone then
    new.guest_id := public._upsert_guest(new.guest_name, new.email, new.phone, new.country);
  end if;
  return new;
end;
$$;

create trigger bookings_link_guest before insert or update of email, phone on public.bookings
  for each row execute function public._link_booking_guest();

-- Existing bookings get their guest.
update public.bookings b set guest_id = public._upsert_guest(b.guest_name, b.email, b.phone, b.country)
where b.guest_id is null;

/* ================================================== Reserved rooms & guests */

create table public.booking_rooms (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings (id) on delete cascade,
  room_type_id uuid not null references public.room_types (id) on delete restrict,
  room_id      uuid references public.rooms (id) on delete set null,
  check_in     date not null,
  check_out    date not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint booking_rooms_dates check (check_out > check_in),
  constraint booking_rooms_no_overlap exclude using gist (
    room_id with =, daterange(check_in, check_out, '[)') with &&
  ) where (room_id is not null and active)
);
create index booking_rooms_booking_idx on public.booking_rooms (booking_id);
create index booking_rooms_room_idx on public.booking_rooms (room_id) where room_id is not null;

create table public.booking_guests (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings (id) on delete cascade,
  guest_id         uuid references public.guests (id) on delete set null,
  full_name        text not null check (char_length(full_name) between 2 and 120),
  is_primary       boolean not null default false,
  age_group        text not null default 'adult' check (age_group in ('adult', 'child')),
  nationality      text check (nationality is null or char_length(nationality) <= 60),
  -- Path in the private guest-documents bucket (never a public URL).
  id_document_path text check (id_document_path is null or id_document_path ~ '^bookings/[0-9a-f-]{36}/[^/]+$'),
  created_at       timestamptz not null default now()
);
create unique index booking_guests_one_primary on public.booking_guests (booking_id) where is_primary;
create index booking_guests_guest_idx on public.booking_guests (guest_id);

-- Keeps booking_rooms and the primary booking guest in step with bookings.
create or replace function public._sync_booking_children()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live boolean := new.status in ('pending', 'confirmed', 'checked_in');
  v_have integer;
begin
  if tg_op = 'INSERT' then
    insert into booking_rooms (booking_id, room_type_id, room_id, check_in, check_out, active)
    select new.id, new.room_type_id, case when g = 1 then new.room_id end, new.check_in, new.check_out, v_live
    from generate_series(1, new.rooms) g;
    insert into booking_guests (booking_id, guest_id, full_name, is_primary)
    values (new.id, new.guest_id, new.guest_name, true);
    return new;
  end if;

  update booking_rooms set
    room_type_id = new.room_type_id, check_in = new.check_in, check_out = new.check_out, active = v_live
  where booking_id = new.id;

  select count(*) into v_have from booking_rooms where booking_id = new.id;
  if v_have < new.rooms then
    insert into booking_rooms (booking_id, room_type_id, check_in, check_out, active)
    select new.id, new.room_type_id, new.check_in, new.check_out, v_live from generate_series(1, new.rooms - v_have);
  elsif v_have > new.rooms then
    delete from booking_rooms where id in (
      select id from booking_rooms where booking_id = new.id order by (room_id is not null), created_at desc limit v_have - new.rooms);
  end if;

  if new.rooms = 1 and new.room_id is distinct from old.room_id then
    update booking_rooms set room_id = new.room_id where booking_id = new.id;
  end if;

  if new.guest_name is distinct from old.guest_name or new.guest_id is distinct from old.guest_id then
    update booking_guests set full_name = new.guest_name, guest_id = new.guest_id where booking_id = new.id and is_primary;
  end if;
  return new;
end;
$$;

create trigger bookings_sync_children after insert or update on public.bookings
  for each row execute function public._sync_booking_children();

insert into public.booking_rooms (booking_id, room_type_id, room_id, check_in, check_out, active)
select b.id, b.room_type_id, case when g = 1 then b.room_id end, b.check_in, b.check_out,
       b.status in ('pending', 'confirmed', 'checked_in')
from public.bookings b cross join lateral generate_series(1, b.rooms) g
where not exists (select 1 from public.booking_rooms r where r.booking_id = b.id);

insert into public.booking_guests (booking_id, guest_id, full_name, is_primary)
select b.id, b.guest_id, b.guest_name, true from public.bookings b
where not exists (select 1 from public.booking_guests g where g.booking_id = b.id and g.is_primary);

/* ======================================================= Payments & refunds */

create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete restrict,
  amount_bdt  integer not null check (amount_bdt > 0 and amount_bdt <= 10000000),
  method      text not null check (method in ('cash', 'bkash', 'nagad', 'card', 'bank', 'other')),
  -- 'pending' is reserved for an online gateway (not built yet): it never counts as paid.
  status      text not null default 'confirmed' check (status in ('pending', 'confirmed', 'failed', 'void')),
  reference   text check (reference is null or char_length(reference) <= 80),
  note        text check (note is null or char_length(note) <= 200),
  received_at timestamptz not null default now(),
  recorded_by uuid references auth.users (id) on delete set null,
  voided_by   uuid references auth.users (id) on delete set null,
  voided_at   timestamptz,
  void_reason text check (void_reason is null or char_length(void_reason) <= 200),
  created_at  timestamptz not null default now(),
  constraint payments_void_reason check (status <> 'void' or void_reason is not null)
);
create index payments_booking_idx on public.payments (booking_id);

create table public.refunds (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings (id) on delete restrict,
  payment_id   uuid references public.payments (id) on delete restrict,
  amount_bdt   integer not null check (amount_bdt > 0 and amount_bdt <= 10000000),
  method       text not null check (method in ('cash', 'bkash', 'nagad', 'card', 'bank', 'other')),
  reason       text not null check (char_length(reason) between 3 and 300),
  status       text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'completed')),
  reference    text check (reference is null or char_length(reference) <= 80),
  requested_by uuid references auth.users (id) on delete set null,
  decided_by   uuid references auth.users (id) on delete set null,
  decided_at   timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  -- Four eyes: whoever asks for a refund can't approve it.
  constraint refunds_four_eyes check (decided_by is null or decided_by is distinct from requested_by)
);
create index refunds_booking_idx on public.refunds (booking_id);

-- amount_paid_bdt and payment_status are derived from the ledger, never set directly.
create or replace function public._recalc_paid(p_booking uuid)
returns void
language sql
security definer
set search_path = public
as $$
  with t as (
    select greatest(0,
      coalesce((select sum(amount_bdt) from payments where booking_id = p_booking and status = 'confirmed'), 0)
      - coalesce((select sum(amount_bdt) from refunds where booking_id = p_booking and status = 'completed'), 0)
    )::integer as paid
  )
  update bookings b set
    amount_paid_bdt = t.paid,
    payment_status = case when t.paid = 0 then 'unpaid' when t.paid >= b.total_bdt then 'paid' else 'partial' end
  from t where b.id = p_booking
    and (b.amount_paid_bdt is distinct from t.paid
         or b.payment_status is distinct from case when t.paid = 0 then 'unpaid' when t.paid >= b.total_bdt then 'paid' else 'partial' end);
$$;

create or replace function public._ledger_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._recalc_paid(coalesce(new.booking_id, old.booking_id));
  return null;
end;
$$;

create trigger payments_recalc after insert or update or delete on public.payments
  for each row execute function public._ledger_changed();
create trigger refunds_recalc after insert or update or delete on public.refunds
  for each row execute function public._ledger_changed();

-- Opening balances: past desk payments (from the booking history), then a
-- single adjustment where the history doesn't add up to what was recorded.
insert into public.payments (booking_id, amount_bdt, method, note, received_at, recorded_by)
select e.booking_id, (e.detail ->> 'amount')::integer,
       case when e.detail ->> 'method' in ('cash', 'bkash', 'nagad', 'card', 'bank', 'other') then e.detail ->> 'method' else 'other' end,
       nullif(left(coalesce(e.detail ->> 'note', ''), 200), ''), e.created_at, e.actor
from public.booking_events e
where e.kind = 'payment' and (e.detail ->> 'amount') ~ '^\d+$' and (e.detail ->> 'amount')::integer > 0;

insert into public.payments (booking_id, amount_bdt, method, note)
select b.id, b.amount_paid_bdt - coalesce(p.sum, 0), 'other', 'Opening balance (recorded before the payments ledger)'
from public.bookings b
left join (select booking_id, sum(amount_bdt)::integer as sum from public.payments group by booking_id) p on p.booking_id = b.id
where b.amount_paid_bdt > coalesce(p.sum, 0);

-- Money received at the desk. Replaces the version that edited the booking directly.
create or replace function public.admin_record_payment(p_booking uuid, p_amount integer, p_method text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings%rowtype;
begin
  perform public._require('payments.record');
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
  insert into payments (booking_id, amount_bdt, method, note, recorded_by)
  values (b.id, p_amount, p_method, nullif(left(trim(coalesce(p_note, '')), 200), ''), auth.uid());
  perform public._log(b.id, 'payment', jsonb_build_object('amount', p_amount, 'method', p_method, 'note', left(coalesce(p_note, ''), 200)));
end;
$$;

create or replace function public.admin_void_payment(p_payment uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p payments%rowtype;
begin
  perform public._require('payments.void');
  select * into p from payments where id = p_payment for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if p.status <> 'confirmed' or char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'BAD_TRANSITION';
  end if;
  if exists (select 1 from refunds where payment_id = p.id and status in ('approved', 'completed')) then
    raise exception 'LOCKED';
  end if;
  update payments set status = 'void', voided_by = auth.uid(), voided_at = now(), void_reason = left(trim(p_reason), 200)
  where id = p.id;
  perform public._log(p.booking_id, 'payment', jsonb_build_object('voided', p.amount_bdt, 'reason', left(trim(p_reason), 200)));
end;
$$;

create or replace function public.admin_request_refund(p_booking uuid, p_amount integer, p_method text, p_reason text, p_payment uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b        bookings%rowtype;
  v_open   integer;
  v_id     uuid;
begin
  perform public._require('refunds.request');
  select * into b from bookings where id = p_booking for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if p_amount is null or p_amount <= 0 or p_method not in ('cash', 'bkash', 'nagad', 'card', 'bank', 'other')
     or char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'BAD_AMOUNT';
  end if;
  if p_payment is not null and not exists (select 1 from payments where id = p_payment and booking_id = b.id and status = 'confirmed') then
    raise exception 'NOT_FOUND';
  end if;
  -- Can't refund more than was paid, counting refunds already in progress.
  select coalesce(sum(amount_bdt), 0) into v_open from refunds where booking_id = b.id and status in ('requested', 'approved');
  if p_amount + v_open > b.amount_paid_bdt then
    raise exception 'REFUND_TOO_LARGE';
  end if;
  insert into refunds (booking_id, payment_id, amount_bdt, method, reason, requested_by)
  values (b.id, p_payment, p_amount, p_method, left(trim(p_reason), 300), auth.uid())
  returning id into v_id;
  perform public._log(b.id, 'payment', jsonb_build_object('refund_requested', p_amount, 'reason', left(trim(p_reason), 300)));
  return v_id;
end;
$$;

create or replace function public.admin_decide_refund(p_refund uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r refunds%rowtype;
begin
  perform public._require('refunds.approve');
  select * into r from refunds where id = p_refund for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if r.status <> 'requested' then
    raise exception 'BAD_TRANSITION';
  end if;
  if r.requested_by = auth.uid() then
    raise exception 'SAME_PERSON';
  end if;
  update refunds set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now()
  where id = r.id;
  perform public._log(r.booking_id, 'payment', jsonb_build_object('refund', case when p_approve then 'approved' else 'rejected' end, 'amount', r.amount_bdt));
end;
$$;

create or replace function public.admin_complete_refund(p_refund uuid, p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r refunds%rowtype;
begin
  perform public._require('refunds.approve');
  select * into r from refunds where id = p_refund for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if r.status <> 'approved' then
    raise exception 'BAD_TRANSITION';
  end if;
  update refunds set status = 'completed', completed_at = now(), reference = nullif(left(trim(coalesce(p_reference, '')), 80), '')
  where id = r.id;
  perform public._log(r.booking_id, 'payment', jsonb_build_object('refund', 'completed', 'amount', r.amount_bdt));
end;
$$;

/* ==================================================== Maintenance blocks */

create table public.room_blocks (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  reason      text not null check (char_length(reason) between 3 and 200),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references auth.users (id) on delete set null,
  constraint room_blocks_dates check (ends_on > starts_on and ends_on - starts_on <= 366),
  constraint room_blocks_no_overlap exclude using gist (
    room_id with =, daterange(starts_on, ends_on, '[)') with &&
  ) where (released_at is null)
);
create index room_blocks_room_idx on public.room_blocks (room_id) where released_at is null;

-- Availability now also subtracts rooms blocked for maintenance in the range.
create or replace function public._free_units(p_type uuid, p_in date, p_out date, p_exclude uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from rooms r
          where r.room_type_id = p_type and not r.out_of_service
            and not exists (select 1 from room_blocks k
                            where k.room_id = r.id and k.released_at is null
                              and k.starts_on < p_out and k.ends_on > p_in))::integer
       - coalesce((
           select sum(b.rooms) from bookings b
           where b.room_type_id = p_type
             and b.status in ('pending', 'confirmed', 'checked_in')
             and b.check_in < p_out and b.check_out > p_in
             and (p_exclude is null or b.id <> p_exclude)
         ), 0)::integer;
$$;

create or replace function public.admin_block_room(p_room uuid, p_from date, p_to date, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r    rooms%rowtype;
  v_id uuid;
  n    date;
begin
  perform public._require('maintenance.manage');
  select * into r from rooms where id = p_room for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > 366
     or p_to <= (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'BAD_DATES';
  end if;
  perform 1 from room_types where id = r.room_type_id for update;
  if exists (select 1 from booking_rooms br where br.room_id = r.id and br.active
             and br.check_in < p_to and br.check_out > p_from) then
    raise exception 'ROOM_IN_USE';
  end if;
  -- Every night must still have enough rooms for the reservations already taken.
  if not r.out_of_service then
    for n in select generate_series(p_from, p_to - 1, interval '1 day')::date loop
      if public._free_units(r.room_type_id, n, n + 1, null) - 1 < 0 then
        raise exception 'ROOM_NEEDED';
      end if;
    end loop;
  end if;
  begin
    insert into room_blocks (room_id, starts_on, ends_on, reason, created_by)
    values (r.id, p_from, p_to, left(trim(p_reason), 200), auth.uid())
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'BLOCK_OVERLAP';
  end;
  return v_id;
end;
$$;

create or replace function public.admin_release_block(p_block uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require('maintenance.manage');
  update room_blocks set released_at = now(), released_by = auth.uid()
  where id = p_block and released_at is null;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
end;
$$;

/* ==================================================== Housekeeping tasks */

create table public.housekeeping_tasks (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms (id) on delete cascade,
  booking_id   uuid references public.bookings (id) on delete set null,
  kind         text not null check (kind in ('clean', 'inspect', 'turndown', 'maintenance', 'other')),
  status       text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  priority     smallint not null default 2 check (priority between 1 and 3),
  due_on       date not null default ((now() at time zone 'Asia/Dhaka')::date),
  assigned_to  uuid references auth.users (id) on delete set null,
  notes        text check (notes is null or char_length(notes) <= 500),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index housekeeping_tasks_open_idx on public.housekeeping_tasks (due_on, status) where status in ('open', 'in_progress');
create index housekeeping_tasks_assignee_idx on public.housekeeping_tasks (assigned_to) where assigned_to is not null;

-- A departure creates the cleaning task (the room is already marked dirty).
create or replace function public._after_booking_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'checked_out' and old.status is distinct from 'checked_out' then
    insert into housekeeping_tasks (room_id, booking_id, kind, priority, created_by)
    select br.room_id, new.id, 'clean', 1, auth.uid()
    from booking_rooms br where br.booking_id = new.id and br.room_id is not null;
  end if;
  return new;
end;
$$;

create trigger bookings_after_status after update of status on public.bookings
  for each row execute function public._after_booking_status();

create or replace function public.admin_create_task(p_room uuid, p_kind text, p_due date, p_assigned uuid, p_notes text, p_priority smallint default 2)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public._require('housekeeping.write');
  if not exists (select 1 from rooms where id = p_room) then
    raise exception 'NOT_FOUND';
  end if;
  if p_kind not in ('clean', 'inspect', 'turndown', 'maintenance', 'other') or p_priority not between 1 and 3 then
    raise exception 'BAD_TASK';
  end if;
  if p_assigned is not null and not exists (select 1 from staff where user_id = p_assigned and active) then
    raise exception 'NOT_FOUND';
  end if;
  insert into housekeeping_tasks (room_id, kind, due_on, assigned_to, notes, priority, created_by)
  values (p_room, p_kind, coalesce(p_due, (now() at time zone 'Asia/Dhaka')::date), p_assigned,
          nullif(left(trim(coalesce(p_notes, '')), 500), ''), p_priority, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Housekeepers update tasks assigned to them (or claim unassigned ones);
-- anyone who can also handle bookings may update any task. Finishing a
-- cleaning or inspection updates the room's status.
create or replace function public.admin_update_task(p_task uuid, p_status text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t housekeeping_tasks%rowtype;
begin
  perform public._require('housekeeping.write');
  select * into t from housekeeping_tasks where id = p_task for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if p_status not in ('open', 'in_progress', 'done', 'cancelled') then
    raise exception 'BAD_TASK';
  end if;
  if t.assigned_to is not null and t.assigned_to <> auth.uid() and not public.has_permission('bookings.write') then
    raise exception 'NOT_ALLOWED';
  end if;
  update housekeeping_tasks set
    status = p_status,
    assigned_to = coalesce(assigned_to, auth.uid()),
    notes = coalesce(nullif(left(trim(coalesce(p_notes, '')), 500), ''), notes),
    completed_at = case when p_status = 'done' then now() end,
    updated_at = now()
  where id = t.id;
  if p_status = 'done' and t.kind in ('clean', 'inspect') then
    update rooms set housekeeping = case when t.kind = 'clean' then 'clean' else 'inspected' end where id = t.room_id;
  end if;
end;
$$;

/* ======================================================= Guest self-service */

-- A signed-in guest links their account to their guest profile when the
-- verified email matches. Staff accounts can't be guests.
create or replace function public.claim_guest_profile()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_id    uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_FOUND';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then
    raise exception 'NOT_FOUND';
  end if;
  update guests set user_id = auth.uid(), updated_at = now()
  where lower(email) = v_email and (user_id is null or user_id = auth.uid())
  returning id into v_id;
  if v_id is null then
    raise exception 'NOT_FOUND';
  end if;
  return v_id;
end;
$$;

-- A guest's own reservations: safe columns only (no staff notes, no other guests).
create or replace function public.my_bookings()
returns table (
  reference text, status text, room_name text, check_in date, check_out date, rooms integer,
  adults integer, children integer, total_bdt integer, amount_paid_bdt integer, payment_status text, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select b.reference, b.status, rt.name, b.check_in, b.check_out, b.rooms, b.adults, b.children,
         b.total_bdt, b.amount_paid_bdt, b.payment_status, b.created_at
  from bookings b
  join guests g on g.id = b.guest_id
  join room_types rt on rt.id = b.room_type_id
  where g.user_id = auth.uid() and auth.uid() is not null
  order by b.check_in desc;
$$;

/* ================================================================ RLS */

alter table public.guests enable row level security;
alter table public.booking_rooms enable row level security;
alter table public.booking_guests enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.room_blocks enable row level security;
alter table public.housekeeping_tasks enable row level security;

create policy "guests: staff with guests.read" on public.guests for select to authenticated
  using (public.has_permission('guests.read'));
create policy "guests: a guest reads their own profile" on public.guests for select to authenticated
  using (user_id = auth.uid());
create policy "guests: a guest edits their own profile" on public.guests for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "booking rooms: bookings.read or housekeeping.read" on public.booking_rooms for select to authenticated
  using (public.has_permission('bookings.read') or public.has_permission('housekeeping.read'));
create policy "booking guests: guests.read" on public.booking_guests for select to authenticated
  using (public.has_permission('guests.read'));
create policy "payments: payments.read" on public.payments for select to authenticated
  using (public.has_permission('payments.read'));
create policy "refunds: payments.read" on public.refunds for select to authenticated
  using (public.has_permission('payments.read'));
create policy "room blocks: staff" on public.room_blocks for select to authenticated
  using (public.is_staff());
create policy "housekeeping tasks: housekeeping.read" on public.housekeeping_tasks for select to authenticated
  using (public.has_permission('housekeeping.read'));

/* ================================================================ Grants */

revoke all on public.guests, public.booking_rooms, public.booking_guests, public.payments, public.refunds,
  public.room_blocks, public.housekeeping_tasks from anon, authenticated;
grant select on public.guests, public.booking_rooms, public.booking_guests, public.payments, public.refunds,
  public.room_blocks, public.housekeeping_tasks to authenticated;
-- A guest may correct their own name, phone, country and marketing choice (RLS limits it to their row).
grant update (full_name, phone, country, marketing_opt_in) on public.guests to authenticated;

revoke all on function public._upsert_guest(text, text, text, text), public._link_booking_guest(),
  public._sync_booking_children(), public._recalc_paid(uuid), public._ledger_changed(),
  public._after_booking_status() from public, anon, authenticated;
revoke all on function public.admin_void_payment(uuid, text), public.admin_request_refund(uuid, integer, text, text, uuid),
  public.admin_decide_refund(uuid, boolean), public.admin_complete_refund(uuid, text),
  public.admin_block_room(uuid, date, date, text), public.admin_release_block(uuid),
  public.admin_create_task(uuid, text, date, uuid, text, smallint), public.admin_update_task(uuid, text, text),
  public.claim_guest_profile(), public.my_bookings() from public, anon;
grant execute on function public.admin_void_payment(uuid, text), public.admin_request_refund(uuid, integer, text, text, uuid),
  public.admin_decide_refund(uuid, boolean), public.admin_complete_refund(uuid, text),
  public.admin_block_room(uuid, date, date, text), public.admin_release_block(uuid),
  public.admin_create_task(uuid, text, date, uuid, text, smallint), public.admin_update_task(uuid, text, text),
  public.claim_guest_profile(), public.my_bookings() to authenticated;

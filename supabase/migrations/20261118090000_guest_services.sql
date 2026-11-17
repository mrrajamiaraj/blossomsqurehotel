-- Guest services for the public website: contact enquiries and booking lookup.
-- Additive only: two new tables and four new functions. Nothing existing changes.
--
--   inquiries                 messages sent from /contact, /dining and /meetings-events
--   booking_lookup_attempts   throttle log for /booking/lookup (no guest data)
--   submit_inquiry()          anon: validates, throttles, stores; returns a reference
--   lookup_booking()          anon: reference + matching phone or email -> safe fields only
--   admin_set_inquiry_status  staff: mark an enquiry handled / spam / new
--
-- Error codes raised (matched by the app): BAD_EMAIL, BAD_INQUIRY, RATE_LIMITED,
-- NOT_STAFF, NOT_FOUND.
--
-- Rollback:
--   drop function if exists public.admin_set_inquiry_status(uuid, text);
--   drop function if exists public.lookup_booking(text, text);
--   drop function if exists public.submit_inquiry(text, text, text, text, text, date, integer);
--   drop table if exists public.booking_lookup_attempts;
--   drop table if exists public.inquiries;

create table if not exists public.inquiries (
  id          uuid primary key default gen_random_uuid(),
  reference   text not null unique,
  kind        text not null default 'general'
              check (kind in ('general', 'booking', 'dining', 'event', 'group', 'other')),
  name        text not null check (char_length(name) between 2 and 120),
  email       text,
  phone       text,
  message     text not null check (char_length(message) between 10 and 2000),
  event_date  date,
  guests      integer check (guests is null or guests between 1 and 2000),
  status      text not null default 'new' check (status in ('new', 'handled', 'spam')),
  handled_at  timestamptz,
  handled_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint inquiries_contact check (email is not null or phone is not null)
);

create index if not exists inquiries_created_idx on public.inquiries (created_at desc);

alter table public.inquiries enable row level security;

drop policy if exists "staff read inquiries" on public.inquiries;
create policy "staff read inquiries" on public.inquiries
  for select to authenticated using (public.is_staff());

revoke all on public.inquiries from anon, authenticated;
grant select on public.inquiries to authenticated;

create table if not exists public.booking_lookup_attempts (
  id          bigint generated always as identity primary key,
  reference   text not null,
  created_at  timestamptz not null default now()
);

create index if not exists booking_lookup_attempts_ref_idx
  on public.booking_lookup_attempts (reference, created_at desc);

-- No policies and no grants: only the SECURITY DEFINER function below touches it.
alter table public.booking_lookup_attempts enable row level security;
revoke all on public.booking_lookup_attempts from anon, authenticated;

-- Website enquiry. Throttled per contact and overall, so the form can't be
-- used to flood the front desk.
create or replace function public.submit_inquiry(
  p_kind text, p_name text, p_email text, p_phone text, p_message text,
  p_event_date date, p_guests integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_ref   text;
begin
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'BAD_EMAIL';
  end if;
  if v_email is null and v_phone is null then
    raise exception 'BAD_INQUIRY';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120
     or char_length(trim(coalesce(p_message, ''))) not between 10 and 2000
     or coalesce(p_kind, 'general') not in ('general', 'booking', 'dining', 'event', 'group', 'other') then
    raise exception 'BAD_INQUIRY';
  end if;

  if (select count(*) from inquiries
      where created_at > now() - interval '1 hour'
        and ((v_email is not null and email = v_email) or (v_phone is not null and phone = v_phone))) >= 3
     or (select count(*) from inquiries where created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'RATE_LIMITED';
  end if;

  loop
    v_ref := 'ENQ-' || lpad((floor(random() * 1000000))::text, 6, '0');
    exit when not exists (select 1 from inquiries where reference = v_ref);
  end loop;

  insert into inquiries (reference, kind, name, email, phone, message, event_date, guests)
  values (v_ref, coalesce(p_kind, 'general'), trim(p_name), v_email, v_phone, trim(p_message), p_event_date, p_guests);

  return v_ref;
end;
$$;

-- A guest checks their own booking. Both the reference and the phone number
-- (last 10 digits) or email on the booking must match. Returns only what the
-- guest already gave us plus status and totals; never notes or other guests.
create or replace function public.lookup_booking(p_reference text, p_contact text)
returns table (
  reference text, status text, room_name text, check_in date, check_out date,
  rooms integer, adults integer, children integer, total_bdt integer,
  amount_paid_bdt integer, payment_status text, guest_name text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref     text := upper(trim(coalesce(p_reference, '')));
  v_contact text := lower(trim(coalesce(p_contact, '')));
  v_digits  text := right(regexp_replace(coalesce(p_contact, ''), '\D', '', 'g'), 10);
begin
  if v_ref = '' or v_contact = '' then
    return;
  end if;
  if (select count(*) from booking_lookup_attempts
      where booking_lookup_attempts.reference = v_ref
        and booking_lookup_attempts.created_at > now() - interval '1 hour') >= 8 then
    raise exception 'RATE_LIMITED';
  end if;
  insert into booking_lookup_attempts (reference) values (v_ref);

  return query
    select b.reference, b.status, rt.name, b.check_in, b.check_out,
           b.rooms, b.adults, b.children, b.total_bdt,
           b.amount_paid_bdt, b.payment_status,
           split_part(b.guest_name, ' ', 1), b.created_at
    from bookings b
    join room_types rt on rt.id = b.room_type_id
    where b.reference = v_ref
      and (
        (b.email is not null and lower(b.email) = v_contact)
        or (char_length(v_digits) >= 8 and right(regexp_replace(b.phone, '\D', '', 'g'), 10) = v_digits)
      );
end;
$$;

create or replace function public.admin_set_inquiry_status(p_inquiry uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_staff();
  if p_status not in ('new', 'handled', 'spam') then
    raise exception 'BAD_INQUIRY';
  end if;
  update inquiries
     set status = p_status,
         handled_at = case when p_status = 'new' then null else now() end,
         handled_by = case when p_status = 'new' then null else auth.uid() end
   where id = p_inquiry;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
end;
$$;

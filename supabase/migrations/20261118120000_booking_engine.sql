-- Booking engine: holds, night-by-night inventory, server-side pricing,
-- multi-room reservations, idempotent confirmation, payment intents and
-- callbacks, guest self-service with time-limited tokens, expiry jobs.
--
-- Double-booking protection, in layers:
--  1. Every write that changes what a room type can sell (holds, bookings,
--     modifications, blocks, rooms leaving service) first locks the
--     room_types rows involved (in id order, so no deadlocks). Availability
--     is then counted per night under that lock, so concurrent requests for
--     the last room are serialised: one wins, the rest get SOLD_OUT.
--  2. After writing, _assert_capacity re-counts every night and aborts the
--     transaction if any night would be oversold.
--  3. Physical rooms: exclusion constraints on booking_rooms and bookings
--     (daterange '[)' — check-out day is free for the next guest) and on
--     room_blocks make overlapping allocations impossible at the table level.
--
-- Stays are [check_in, check_out): nights check_in … check_out-1.
--
-- Error codes: PAST_DATE, BAD_DATES, TOO_FAR, NO_ROOM, NO_RATE_PLAN, RATE_PLAN_NIGHTS,
-- TOO_MANY_GUESTS, TOO_MANY_ROOMS, SOLD_OUT, RATE_LIMITED, BAD_EMAIL, BAD_GUEST, PROMO_INVALID,
-- PROMO_NOT_APPLICABLE, PROMO_EXHAUSTED, HOLD_NOT_FOUND, HOLD_EXPIRED, PRICE_CHANGED,
-- BAD_IDEMPOTENCY_KEY, IDEMPOTENCY_CONFLICT, BAD_PAYMENT_OPTION, ACCESS_EXPIRED, NOT_FOUND,
-- NOT_ALLOWED, BAD_TRANSITION, TOO_EARLY, ASSIGN_ROOM, ROOM_TAKEN, ROOM_BLOCKED, WRONG_ROOM_TYPE,
-- ROOM_OUT_OF_SERVICE, ROOM_IN_USE, ROOM_NEEDED, LOCKED, BAD_AMOUNT, CAPACITY_BREACH.
--
-- Rollback: supabase/rollbacks/20261118120000_booking_engine.down.sql (generated
-- and verified by tests/db/engine-rollback.test.ts).

/* ================================================================ Settings */

alter table public.hotel_settings
  add column if not exists advance_percent   numeric(5, 2) check (advance_percent is null or advance_percent between 0 and 100),
  add column if not exists advance_due_hours integer not null default 24 check (advance_due_hours between 1 and 168),
  add column if not exists hold_minutes      integer not null default 15 check (hold_minutes between 5 and 60);

/* ============================================================ Bookings */

alter table public.bookings
  add column if not exists subtotal_bdt       integer check (subtotal_bdt is null or subtotal_bdt >= 0),
  add column if not exists discount_bdt       integer not null default 0 check (discount_bdt >= 0),
  add column if not exists service_charge_bdt integer not null default 0 check (service_charge_bdt >= 0),
  add column if not exists vat_bdt            integer not null default 0 check (vat_bdt >= 0),
  add column if not exists payment_option     text not null default 'pay_at_hotel' check (payment_option in ('pay_at_hotel', 'advance', 'online')),
  add column if not exists advance_due_bdt    integer not null default 0 check (advance_due_bdt >= 0),
  add column if not exists payment_due_at     timestamptz,
  add column if not exists idempotency_key    text unique check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9_-]{8,80}$'),
  add column if not exists hold_id            uuid,
  add column if not exists price_detail       jsonb;

update public.bookings set subtotal_bdt = total_bdt where subtotal_bdt is null;

alter table public.booking_rooms
  add column if not exists rate_plan_id uuid references public.rate_plans (id) on delete set null,
  add column if not exists subtotal_bdt integer check (subtotal_bdt is null or subtotal_bdt >= 0),
  add column if not exists price_detail jsonb,
  add column if not exists line_no      smallint;

create index if not exists booking_rooms_inventory_idx on public.booking_rooms (room_type_id, check_in, check_out) where active;

alter table public.promotions
  add column if not exists max_redemptions integer check (max_redemptions is null or max_redemptions > 0);
create unique index if not exists promotions_code_ci on public.promotions (upper(code)) where code is not null;

alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check check (method in ('cash', 'bkash', 'nagad', 'card', 'bank', 'online', 'other'));
alter table public.payments add column if not exists intent_id uuid;
create unique index if not exists payments_intent_once on public.payments (intent_id) where intent_id is not null;

/* =============================================================== Holds */

create table public.booking_holds (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,
  source      text not null default 'website' check (source in ('website', 'phone', 'walk_in', 'other')),
  check_in    date not null,
  check_out   date not null,
  adults      integer not null check (adults between 1 and 30),
  children    integer not null default 0 check (children between 0 and 20),
  promo_code  text check (promo_code is null or char_length(promo_code) <= 20),
  quote       jsonb not null,
  total_bdt   integer not null check (total_bdt >= 0),
  status      text not null default 'active' check (status in ('active', 'converted', 'expired', 'released')),
  expires_at  timestamptz not null,
  booking_id  uuid references public.bookings (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint booking_holds_dates check (check_out > check_in)
);
create index booking_holds_live_idx on public.booking_holds (expires_at) where status = 'active';

create table public.booking_hold_rooms (
  id           uuid primary key default gen_random_uuid(),
  hold_id      uuid not null references public.booking_holds (id) on delete cascade,
  line_no      smallint not null,
  room_type_id uuid not null references public.room_types (id) on delete restrict,
  rate_plan_id uuid references public.rate_plans (id) on delete set null,
  unique (hold_id, line_no)
);
create index booking_hold_rooms_type_idx on public.booking_hold_rooms (room_type_id);

alter table public.bookings add constraint bookings_hold_fkey foreign key (hold_id) references public.booking_holds (id) on delete set null;

/* ================================================= Guest access & requests */

create table public.booking_access_tokens (
  token_hash text primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  purpose    text not null default 'manage' check (purpose in ('manage')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index booking_access_tokens_booking_idx on public.booking_access_tokens (booking_id);

create table public.booking_requests (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  kind        text not null check (kind in ('cancel', 'change')),
  status      text not null default 'open' check (status in ('open', 'done', 'declined')),
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  handled_by  uuid references auth.users (id) on delete set null,
  handled_at  timestamptz
);
create index booking_requests_open_idx on public.booking_requests (created_at) where status = 'open';

/* ============================================================ Payments */

create table public.payment_intents (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings (id) on delete restrict,
  provider        text not null check (provider ~ '^[a-z0-9_]{2,30}$'),
  amount_bdt      integer not null check (amount_bdt > 0 and amount_bdt <= 10000000),
  status          text not null default 'created' check (status in ('created', 'succeeded', 'failed', 'cancelled', 'expired')),
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9_-]{8,80}$'),
  provider_ref    text check (provider_ref is null or char_length(provider_ref) <= 120),
  failure_reason  text check (failure_reason is null or char_length(failure_reason) <= 200),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index payment_intents_booking_idx on public.payment_intents (booking_id);

alter table public.payments add constraint payments_intent_fkey foreign key (intent_id) references public.payment_intents (id) on delete restrict;

/* ======================================================== Small helpers */

create or replace function public._today()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Dhaka')::date;
$$;

create or replace function public._token_hash(p_token text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- 64 hex characters (two v4 UUIDs: 244 random bits).
create or replace function public._new_token()
returns text language sql volatile set search_path = public as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

create or replace function public._validate_stay(p_in date, p_out date)
returns void language plpgsql stable set search_path = public as $$
begin
  if p_in is null or p_out is null or p_out <= p_in then
    raise exception 'BAD_DATES';
  end if;
  if p_in < public._today() then
    raise exception 'PAST_DATE';
  end if;
  if p_out - p_in > 30 then
    raise exception 'BAD_DATES';
  end if;
  if p_in > public._today() + 365 then
    raise exception 'TOO_FAR';
  end if;
end;
$$;

-- Locks the room types (in id order) so every inventory change for them is serialised.
create or replace function public._lock_types(p_types uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  -- A loop fetches (and so locks) every row, in a fixed order.
  for r in select id from room_types where id = any (p_types) order by id for update loop
    null;
  end loop;
end;
$$;

/* ============================================ Night-by-night inventory */

-- Free units of a type for every night of [p_in, p_out), counting sellable
-- rooms (in service, not blocked that night), active reservation lines and
-- live holds. p_exclude / p_exclude_hold leave one booking / hold out (for
-- modifications and confirmations).
create or replace function public._free_units(p_type uuid, p_in date, p_out date, p_exclude uuid, p_exclude_hold uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(min(free), 0)::integer from (
    select
      (select count(*) from rooms r
        where r.room_type_id = p_type and not r.out_of_service
          and not exists (select 1 from room_blocks k
                          where k.room_id = r.id and k.released_at is null
                            and k.starts_on <= n.night and k.ends_on > n.night))
      - (select count(*) from booking_rooms br
          where br.room_type_id = p_type and br.active
            and br.check_in <= n.night and br.check_out > n.night
            and (p_exclude is null or br.booking_id <> p_exclude))
      - (select count(*) from booking_hold_rooms hr join booking_holds h on h.id = hr.hold_id
          where hr.room_type_id = p_type and h.status = 'active' and h.expires_at > now()
            and h.check_in <= n.night and h.check_out > n.night
            and (p_exclude_hold is null or h.id <> p_exclude_hold))
      as free
    from (select d::date as night from generate_series(p_in, p_out - 1, interval '1 day') d) n
  ) x;
$$;

-- The existing 4-argument form (used by room setup and blocks) now counts per night and includes holds.
create or replace function public._free_units(p_type uuid, p_in date, p_out date, p_exclude uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public._free_units(p_type, p_in, p_out, p_exclude, null);
$$;

-- Safety net run after every write: no night may be oversold.
create or replace function public._assert_capacity(p_types uuid[], p_in date, p_out date, p_exclude_hold uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  t uuid;
begin
  -- p_exclude_hold: the hold being converted (its rooms are now the booking's).
  foreach t in array p_types loop
    if public._free_units(t, p_in, p_out, null, p_exclude_hold) < 0 then
      raise exception 'CAPACITY_BREACH';
    end if;
  end loop;
end;
$$;

-- Every future night keeps enough sellable rooms after removing p_fewer units.
create or replace function public._type_still_fits(p_type uuid, p_fewer integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with horizon as (
    select greatest(
      (select max(br.check_out) from booking_rooms br where br.room_type_id = p_type and br.active),
      (select max(h.check_out) from booking_hold_rooms hr join booking_holds h on h.id = hr.hold_id
        where hr.room_type_id = p_type and h.status = 'active' and h.expires_at > now())
    ) as last_out
  )
  select not exists (
    select 1
    from horizon, generate_series(public._today(), coalesce(horizon.last_out, public._today()) - 1, interval '1 day') n
    where public._free_units(p_type, n::date, n::date + 1, null, null) - p_fewer < 0
  );
$$;

create or replace function public.room_availability(p_check_in date, p_check_out date)
returns table (slug text, available integer)
language sql
stable
security definer
set search_path = public
as $$
  select rt.slug, greatest(0, public._free_units(rt.id, p_check_in, p_check_out, null, null))
  from room_types rt
  where rt.is_published;
$$;

/* ============================================================ Pricing */

-- The price of one night: an active season for the plan (or for the type),
-- else the type's weekday / weekend rate.
create or replace function public._night_rate(p_type uuid, p_plan uuid, p_night date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s  seasonal_rates%rowtype;
  rt room_types%rowtype;
  v_weekend boolean := public._is_weekend_night(p_night);
begin
  select * into s from seasonal_rates
  where room_type_id = p_type and is_active and starts_on <= p_night and ends_on > p_night
    and (rate_plan_id is null or rate_plan_id = p_plan)
  order by (rate_plan_id is null), starts_on desc
  limit 1;
  if found then
    return jsonb_build_object('night', p_night,
      'rate', case when v_weekend and s.weekend_price_bdt is not null then s.weekend_price_bdt else s.price_bdt end,
      'kind', 'season', 'season', s.name, 'weekend', v_weekend);
  end if;
  select * into rt from room_types where id = p_type;
  return jsonb_build_object('night', p_night,
    'rate', case when v_weekend and rt.weekend_price_bdt is not null then rt.weekend_price_bdt else rt.price_bdt end,
    'kind', case when v_weekend and rt.weekend_price_bdt is not null then 'weekend' else 'weekday' end,
    'weekend', v_weekend);
end;
$$;

create or replace function public._stay_total(p_type uuid, p_in date, p_out date)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum((public._night_rate(p_type, null, d::date) ->> 'rate')::integer), 0)::integer
  from generate_series(p_in, p_out - 1, interval '1 day') d;
$$;

-- Resolves a promo code for a stay. p_strict raises; otherwise returns null.
create or replace function public._promotion_for(p_code text, p_in date, p_out date, p_types uuid[], p_strict boolean)
returns promotions
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p promotions%rowtype;
  v_used integer;
begin
  if p_code is null or btrim(p_code) = '' then
    return null;
  end if;
  select * into p from promotions where upper(code) = upper(btrim(p_code)) and is_active;
  if not found or p.ends_on <= public._today() then
    if p_strict then raise exception 'PROMO_INVALID'; end if;
    return null;
  end if;
  if p_in < p.starts_on or p_in >= p.ends_on or (p_out - p_in) < p.min_nights
     or (cardinality(p.room_type_ids) > 0 and not (p.room_type_ids && p_types)) then
    if p_strict then raise exception 'PROMO_NOT_APPLICABLE'; end if;
    return null;
  end if;
  if p.max_redemptions is not null then
    select count(*) into v_used from bookings where promotion_id = p.id and status not in ('cancelled');
    if v_used >= p.max_redemptions then
      if p_strict then raise exception 'PROMO_EXHAUSTED'; end if;
      return null;
    end if;
  end if;
  return p;
end;
$$;

-- The full price of a reservation, computed only here. Lines are parallel
-- arrays (room type, rate plan). Returns every number the guest sees.
create or replace function public._quote(p_types uuid[], p_plans uuid[], p_in date, p_out date, p_promo text, p_strict boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  st         hotel_settings%rowtype;
  promo      promotions%rowtype;
  i          integer;
  v_lines    jsonb := '[]'::jsonb;
  v_nights   jsonb;
  v_line_sub integer;
  v_elig     integer := 0;
  v_sub      integer := 0;
  v_disc     integer := 0;
  v_svc      integer := 0;
  v_vat      integer := 0;
  v_total    integer;
  rt         room_types%rowtype;
  rp         rate_plans%rowtype;
begin
  select * into st from hotel_settings where id = 1;
  promo := public._promotion_for(p_promo, p_in, p_out, p_types, p_strict);

  for i in 1 .. coalesce(array_length(p_types, 1), 0) loop
    select * into rt from room_types where id = p_types[i];
    rp := null;
    if p_plans[i] is not null then
      select * into rp from rate_plans where id = p_plans[i];
    end if;
    select jsonb_agg(public._night_rate(p_types[i], p_plans[i], d::date) order by d)
      into v_nights from generate_series(p_in, p_out - 1, interval '1 day') d;
    select coalesce(sum((n ->> 'rate')::integer), 0) into v_line_sub from jsonb_array_elements(v_nights) n;
    v_sub := v_sub + v_line_sub;
    -- Promotion: eligible nights are those of eligible room types inside the promotion's dates.
    if promo.id is not null and (cardinality(promo.room_type_ids) = 0 or rt.id = any (promo.room_type_ids)) then
      select v_elig + coalesce(sum((n ->> 'rate')::integer), 0) into v_elig
      from jsonb_array_elements(v_nights) n
      where (n ->> 'night')::date >= promo.starts_on and (n ->> 'night')::date < promo.ends_on;
    end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'line', i, 'room_type_id', rt.id, 'room_type', rt.slug, 'name', rt.name, 'sleeps', rt.sleeps,
      'rate_plan_id', rp.id, 'rate_plan', rp.code, 'rate_plan_name', rp.name,
      'nights', v_nights, 'subtotal', v_line_sub));
  end loop;

  if promo.id is not null then
    v_disc := case promo.discount_type
                when 'percent' then round(v_elig * promo.discount_value / 100.0)::integer
                else least(promo.discount_value, v_elig) end;
  end if;
  if st.service_charge_percent is not null then
    v_svc := round((v_sub - v_disc) * st.service_charge_percent / 100.0)::integer;
  end if;
  if st.vat_percent is not null then
    v_vat := round((v_sub - v_disc + v_svc) * st.vat_percent / 100.0)::integer;
  end if;
  v_total := v_sub - v_disc + v_svc + v_vat;

  return jsonb_build_object(
    'currency', 'BDT', 'check_in', p_in, 'check_out', p_out, 'nights', p_out - p_in,
    'lines', v_lines, 'subtotal', v_sub, 'discount', v_disc,
    'promotion', case when promo.id is null then null else jsonb_build_object('id', promo.id, 'code', promo.code, 'name', promo.name) end,
    'service_charge_percent', st.service_charge_percent, 'service_charge', v_svc,
    'vat_percent', st.vat_percent, 'vat', v_vat,
    'taxes_pending', (st.service_charge_percent is null or st.vat_percent is null),
    'total', v_total,
    'advance_percent', st.advance_percent,
    'advance_due', case when st.advance_percent is null then 0 else round(v_total * st.advance_percent / 100.0)::integer end);
end;
$$;

/* ========================================================== Lines */

-- Turns [{"room_type": "deluxe-couple", "rate_plan": "STANDARD"}, …] into
-- room-type / rate-plan arrays, validating every line.
create or replace function public._resolve_lines(p_lines jsonb, p_nights integer, p_public boolean, out types uuid[], out plans uuid[])
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l  jsonb;
  rt room_types%rowtype;
  rp rate_plans%rowtype;
begin
  types := '{}';
  plans := '{}';
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'NO_ROOM';
  end if;
  if jsonb_array_length(p_lines) > 5 then
    raise exception 'TOO_MANY_ROOMS';
  end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    select * into rt from room_types where slug = l ->> 'room_type';
    if not found or (p_public and not rt.is_published) then
      raise exception 'NO_ROOM';
    end if;
    select * into rp from rate_plans
    where room_type_id = rt.id and is_active and (not p_public or is_public)
      and code = coalesce(nullif(l ->> 'rate_plan', ''), 'STANDARD');
    if not found then
      if nullif(l ->> 'rate_plan', '') is not null then
        raise exception 'NO_RATE_PLAN';
      end if;
      rp := null;
    elsif p_nights < rp.min_nights or p_nights > rp.max_nights then
      raise exception 'RATE_PLAN_NIGHTS';
    end if;
    types := types || rt.id;
    plans := plans || rp.id;
  end loop;
end;
$$;

-- Each room takes up to `sleeps` adults plus one child.
create or replace function public._check_party(p_types uuid[], p_adults integer, p_children integer)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_sleeps integer;
  v_n integer := cardinality(p_types);
begin
  select coalesce(sum(rt.sleeps), 0) into v_sleeps from unnest(p_types) u(id) join room_types rt on rt.id = u.id;
  if p_adults is null or p_children is null or p_adults < 1 or p_children < 0
     or p_adults > v_sleeps or p_adults + p_children > v_sleeps + v_n then
    raise exception 'TOO_MANY_GUESTS';
  end if;
end;
$$;

-- Locks the types and checks there is a unit of each line for every night.
create or replace function public._reserve_inventory(p_types uuid[], p_in date, p_out date, p_exclude uuid, p_exclude_hold uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t record;
begin
  perform public._lock_types(p_types);
  for t in select id, count(*)::integer as n from unnest(p_types) id group by id loop
    if public._free_units(t.id, p_in, p_out, p_exclude, p_exclude_hold) < t.n then
      raise exception 'SOLD_OUT';
    end if;
  end loop;
end;
$$;

/* ======================================================= Expiry jobs */

create or replace function public.expire_holds()
returns integer language sql security definer set search_path = public as $$
  with x as (
    update booking_holds set status = 'expired', updated_at = now()
    where status = 'active' and expires_at <= now()
    returning 1
  )
  select count(*)::integer from x;
$$;

/* ============================================= Status transitions (core) */

-- The one place a booking's status changes. Callers check permission.
create or replace function public._transition(p_booking uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings%rowtype;
begin
  select * into b from bookings where id = p_booking for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if not (
    (b.status = 'pending' and p_status in ('confirmed', 'cancelled', 'no_show')) or
    (b.status = 'confirmed' and p_status in ('checked_in', 'cancelled', 'no_show')) or
    (b.status = 'checked_in' and p_status = 'checked_out')
  ) then
    raise exception 'BAD_TRANSITION';
  end if;
  if p_status = 'checked_in' then
    if b.check_in > public._today() then
      raise exception 'TOO_EARLY';
    end if;
    if exists (select 1 from booking_rooms where booking_id = b.id and room_id is null) then
      raise exception 'ASSIGN_ROOM';
    end if;
  end if;
  if p_status = 'no_show' and b.check_in > public._today() then
    raise exception 'TOO_EARLY';
  end if;

  update bookings set
    status = p_status,
    cancel_reason = case when p_status in ('cancelled', 'no_show') then nullif(left(trim(coalesce(p_reason, '')), 300), '') else cancel_reason end,
    confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
    checked_in_at = case when p_status = 'checked_in' then now() else checked_in_at end,
    checked_out_at = case when p_status = 'checked_out' then now() else checked_out_at end,
    cancelled_at = case when p_status in ('cancelled', 'no_show') then now() else cancelled_at end,
    payment_due_at = case when p_status in ('cancelled', 'no_show', 'checked_in') then null else payment_due_at end
  where id = b.id;

  if p_status = 'checked_out' then
    update rooms set housekeeping = 'dirty'
    where id in (select room_id from booking_rooms where booking_id = b.id and room_id is not null);
  end if;

  perform public._log(b.id, 'status', jsonb_build_object('from', b.status, 'to', p_status, 'reason', p_reason));
end;
$$;

create or replace function public.admin_set_status(p_booking uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require('bookings.write');
  perform public._transition(p_booking, p_status, p_reason);
end;
$$;

-- Website reservations with an advance due that wasn't paid in time.
create or replace function public.expire_overdue_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  n integer := 0;
begin
  for b in
    select id from bookings
    where status = 'pending' and payment_option = 'advance' and payment_due_at is not null
      and payment_due_at <= now() and amount_paid_bdt = 0
    for update skip locked
  loop
    perform public._transition(b.id, 'cancelled', 'Advance not received in time');
    n := n + 1;
  end loop;
  return n;
end;
$$;

/* ======================================================= Reservation */

-- Creates a reservation: validates, locks inventory, prices on the server,
-- writes header + lines, re-checks capacity. Callers check permission.
create or replace function public._reserve(
  p_source text, p_status text, p_check_in date, p_check_out date, p_adults integer, p_children integer,
  p_types uuid[], p_plans uuid[], p_promo text,
  p_guest_name text, p_email text, p_phone text, p_country text, p_arrival text, p_requests text,
  p_notes text, p_pickup boolean, p_payment_option text, p_idempotency_key text, p_exclude_hold uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote jsonb;
  v_promo promotions%rowtype;
  v_ref   text;
  v_id    uuid;
  v_n     integer := cardinality(p_types);
  v_nights integer := p_check_out - p_check_in;
  v_hours integer;
  v_line  jsonb;
begin
  perform public._validate_stay(p_check_in, p_check_out);
  if v_n < 1 or v_n > 5 then
    raise exception 'TOO_MANY_ROOMS';
  end if;
  perform public._check_party(p_types, p_adults, p_children);
  if char_length(trim(coalesce(p_guest_name, ''))) not between 2 and 120
     or char_length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) not between 6 and 15
     or char_length(coalesce(p_requests, '')) > 1000 then
    raise exception 'BAD_GUEST';
  end if;
  if p_email is not null and trim(p_email) <> '' and p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'BAD_EMAIL';
  end if;
  if p_payment_option not in ('pay_at_hotel', 'advance', 'online') then
    raise exception 'BAD_PAYMENT_OPTION';
  end if;

  perform public._reserve_inventory(p_types, p_check_in, p_check_out, null, p_exclude_hold);

  v_quote := public._quote(p_types, p_plans, p_check_in, p_check_out, p_promo, true);
  if v_quote -> 'promotion' is not null and jsonb_typeof(v_quote -> 'promotion') = 'object' then
    -- Serialise redemptions of a limited promotion, then re-check the limit.
    select * into v_promo from promotions where id = (v_quote -> 'promotion' ->> 'id')::uuid for update;
    perform public._promotion_for(p_promo, p_check_in, p_check_out, p_types, true);
  end if;

  loop
    v_ref := 'BSQ-' || lpad((floor(random() * 100000))::text, 5, '0');
    exit when not exists (select 1 from bookings where reference = v_ref);
  end loop;

  select advance_due_hours into v_hours from hotel_settings where id = 1;

  insert into bookings (
    reference, room_type_id, rate_plan_id, rooms, check_in, check_out, adults, children,
    guest_name, email, phone, country, arrival_window, special_requests, internal_notes, airport_pickup,
    source, status, confirmed_at, nightly_rate_bdt, subtotal_bdt, discount_bdt, service_charge_bdt, vat_bdt,
    total_bdt, promotion_id, payment_option, advance_due_bdt, payment_due_at, idempotency_key, hold_id, price_detail
  ) values (
    v_ref, p_types[1], p_plans[1], v_n, p_check_in, p_check_out, p_adults, coalesce(p_children, 0),
    trim(p_guest_name), nullif(lower(trim(coalesce(p_email, ''))), ''), trim(p_phone),
    nullif(trim(coalesce(p_country, '')), ''), nullif(trim(coalesce(p_arrival, '')), ''),
    nullif(trim(coalesce(p_requests, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), coalesce(p_pickup, false),
    p_source, p_status, case when p_status = 'confirmed' then now() end,
    greatest(1, round((v_quote ->> 'subtotal')::numeric / v_nights / v_n))::integer,
    (v_quote ->> 'subtotal')::integer, (v_quote ->> 'discount')::integer,
    (v_quote ->> 'service_charge')::integer, (v_quote ->> 'vat')::integer, (v_quote ->> 'total')::integer,
    nullif(v_quote -> 'promotion' ->> 'id', '')::uuid, p_payment_option,
    case when p_payment_option = 'advance' then (v_quote ->> 'advance_due')::integer else 0 end,
    case when p_payment_option = 'advance' and (v_quote ->> 'advance_due')::integer > 0 then now() + make_interval(hours => v_hours) end,
    p_idempotency_key, p_exclude_hold, v_quote
  )
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(v_quote -> 'lines') loop
    insert into booking_rooms (booking_id, room_type_id, rate_plan_id, check_in, check_out, active, subtotal_bdt, price_detail, line_no)
    values (v_id, (v_line ->> 'room_type_id')::uuid, nullif(v_line ->> 'rate_plan_id', '')::uuid, p_check_in, p_check_out,
            p_status in ('pending', 'confirmed', 'checked_in'), (v_line ->> 'subtotal')::integer, v_line -> 'nights',
            (v_line ->> 'line')::smallint);
  end loop;

  perform public._assert_capacity(p_types, p_check_in, p_check_out, p_exclude_hold);
  perform public._log(v_id, 'created', jsonb_build_object('source', p_source, 'status', p_status, 'total', v_quote -> 'total',
                                                           'rooms', v_n, 'payment_option', p_payment_option));
  return v_id;
end;
$$;

-- The header no longer generates lines (the engine writes them); it keeps
-- their dates and "active" flag in step and the primary guest's name.
create or replace function public._sync_booking_children()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live boolean := new.status in ('pending', 'confirmed', 'checked_in');
begin
  if tg_op = 'INSERT' then
    insert into booking_guests (booking_id, guest_id, full_name, is_primary)
    values (new.id, new.guest_id, new.guest_name, true);
    return new;
  end if;
  update booking_rooms set check_in = new.check_in, check_out = new.check_out, active = v_live
  where booking_id = new.id and (check_in, check_out, active) is distinct from (new.check_in, new.check_out, v_live);
  if new.rooms = 1 and new.room_id is distinct from old.room_id then
    update booking_rooms set room_id = new.room_id where booking_id = new.id;
  end if;
  if new.guest_name is distinct from old.guest_name or new.guest_id is distinct from old.guest_id then
    update booking_guests set full_name = new.guest_name, guest_id = new.guest_id where booking_id = new.id and is_primary;
  end if;
  return new;
end;
$$;

-- Older single-type entry point, now on the engine (kept for callers that still use it).
create or replace function public._insert_booking(
  p_room_slug text, p_check_in date, p_check_out date, p_rooms integer,
  p_adults integer, p_children integer, p_guest_name text, p_email text,
  p_phone text, p_country text, p_arrival_window text, p_special_requests text,
  p_airport_pickup boolean, p_source text, p_status text, p_internal_notes text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_id uuid;
begin
  if p_rooms is null or p_rooms < 1 or p_rooms > 5 then
    raise exception 'TOO_MANY_GUESTS';
  end if;
  select * into r from public._resolve_lines(
    (select jsonb_agg(jsonb_build_object('room_type', p_room_slug)) from generate_series(1, p_rooms)),
    p_check_out - p_check_in, p_source = 'website');
  v_id := public._reserve(p_source, p_status, p_check_in, p_check_out, p_adults, p_children, r.types, r.plans, null,
    p_guest_name, p_email, p_phone, p_country, p_arrival_window, p_special_requests, p_internal_notes,
    p_airport_pickup, 'pay_at_hotel', null, null);
  return (select reference from bookings where id = v_id);
end;
$$;

-- Website booking in one call (the previous checkout). Same engine and rules.
create or replace function public.create_booking(
  p_room_slug text, p_check_in date, p_check_out date, p_rooms integer,
  p_adults integer, p_children integer, p_guest_name text, p_email text,
  p_phone text, p_country text, p_arrival_window text, p_special_requests text,
  p_airport_pickup boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'BAD_EMAIL';
  end if;
  if (select count(*) from bookings
      where created_at > now() - interval '1 hour' and source = 'website'
        and (phone = trim(p_phone) or lower(email) = lower(trim(p_email)))) >= 3 then
    raise exception 'RATE_LIMITED';
  end if;
  return public._insert_booking(p_room_slug, p_check_in, p_check_out, p_rooms, p_adults, p_children,
    p_guest_name, p_email, p_phone, p_country, p_arrival_window, p_special_requests, p_airport_pickup,
    'website', 'pending', null);
end;
$$;

create or replace function public.admin_create_booking(
  p_room_slug text, p_check_in date, p_check_out date, p_rooms integer,
  p_adults integer, p_children integer, p_guest_name text, p_email text,
  p_phone text, p_country text, p_special_requests text, p_internal_notes text,
  p_airport_pickup boolean, p_source text, p_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require('bookings.write');
  if p_source not in ('phone', 'walk_in', 'other') or p_status not in ('pending', 'confirmed') then
    raise exception 'BAD_TRANSITION';
  end if;
  return public._insert_booking(p_room_slug, p_check_in, p_check_out, p_rooms, p_adults, p_children,
    p_guest_name, p_email, p_phone, p_country, null, p_special_requests, p_airport_pickup,
    p_source, p_status, p_internal_notes);
end;
$$;

-- Staff reservation with several room types (same engine).
create or replace function public.admin_create_reservation(
  p_lines jsonb, p_check_in date, p_check_out date, p_adults integer, p_children integer, p_promo text,
  p_guest_name text, p_email text, p_phone text, p_country text, p_requests text, p_notes text,
  p_pickup boolean, p_source text, p_status text, p_payment_option text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_id uuid;
begin
  perform public._require('bookings.write');
  if p_source not in ('phone', 'walk_in', 'other') or p_status not in ('pending', 'confirmed') then
    raise exception 'BAD_TRANSITION';
  end if;
  select * into r from public._resolve_lines(p_lines, p_check_out - p_check_in, false);
  v_id := public._reserve(p_source, p_status, p_check_in, p_check_out, p_adults, p_children, r.types, r.plans, p_promo,
    p_guest_name, p_email, p_phone, p_country, null, p_requests, p_notes, p_pickup, coalesce(p_payment_option, 'pay_at_hotel'), null, null);
  return (select reference from bookings where id = v_id);
end;
$$;

/* ====================================================== Modification */

-- Changes dates, party or rooms with availability re-checked (this booking's
-- own units excluded) and prices recomputed on the server. With p_keep_rates
-- and unchanged rooms and dates, the agreed price stands.
create or replace function public._modify(
  p_booking uuid, p_check_in date, p_check_out date, p_adults integer, p_children integer,
  p_types uuid[], p_plans uuid[], p_keep_rates boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b        bookings%rowtype;
  v_old    uuid[];
  v_same   boolean;
  v_quote  jsonb;
  v_line   jsonb;
  v_rooms  uuid[];
  v_n      integer := cardinality(p_types);
  v_nights integer := p_check_out - p_check_in;
  v_promo  text;
begin
  select * into b from bookings where id = p_booking for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if b.status not in ('pending', 'confirmed', 'checked_in') then
    raise exception 'LOCKED';
  end if;
  select array_agg(room_type_id order by line_no, id), array_agg(room_id order by line_no, id)
    into v_old, v_rooms from booking_rooms where booking_id = b.id;
  if b.status = 'checked_in' and (p_check_in <> b.check_in or p_types is distinct from v_old) then
    raise exception 'LOCKED';
  end if;
  if p_check_in is null or p_check_out is null or v_nights < 1 or v_nights > 30 then
    raise exception 'BAD_DATES';
  end if;
  if b.status <> 'checked_in' and p_check_in < public._today() and p_check_in <> b.check_in then
    raise exception 'PAST_DATE';
  end if;
  if v_n < 1 or v_n > 5 then
    raise exception 'TOO_MANY_ROOMS';
  end if;
  perform public._check_party(p_types, p_adults, p_children);

  perform public._lock_types(array(select distinct x from unnest(p_types || v_old) x));
  perform public._reserve_inventory(p_types, p_check_in, p_check_out, b.id, null);

  v_same := p_keep_rates and p_types = v_old and p_check_in = b.check_in and p_check_out = b.check_out;
  if not v_same then
    v_promo := (select code from promotions where id = b.promotion_id);
    v_quote := public._quote(p_types, p_plans, p_check_in, p_check_out, v_promo, false);
    delete from booking_rooms where booking_id = b.id;
    for v_line in select * from jsonb_array_elements(v_quote -> 'lines') loop
      begin
        insert into booking_rooms (booking_id, room_type_id, rate_plan_id, room_id, check_in, check_out, active, subtotal_bdt, price_detail, line_no)
        values (b.id, (v_line ->> 'room_type_id')::uuid, nullif(v_line ->> 'rate_plan_id', '')::uuid,
                -- Keep the room already given to this line when its type is unchanged.
                case when v_old[(v_line ->> 'line')::integer] = (v_line ->> 'room_type_id')::uuid then v_rooms[(v_line ->> 'line')::integer] end,
                p_check_in, p_check_out, true, (v_line ->> 'subtotal')::integer, v_line -> 'nights', (v_line ->> 'line')::smallint);
      exception when exclusion_violation then
        raise exception 'ROOM_TAKEN';
      end;
    end loop;
  end if;

  begin
    update bookings set
      room_type_id = p_types[1],
      rate_plan_id = p_plans[1],
      rooms = v_n,
      room_id = case when v_n = 1 and v_old[1] = p_types[1] then b.room_id end,
      check_in = p_check_in,
      check_out = p_check_out,
      adults = p_adults,
      children = p_children,
      nightly_rate_bdt = case when v_same then b.nightly_rate_bdt
                              else greatest(1, round((v_quote ->> 'subtotal')::numeric / v_nights / v_n))::integer end,
      subtotal_bdt = case when v_same then b.subtotal_bdt else (v_quote ->> 'subtotal')::integer end,
      discount_bdt = case when v_same then b.discount_bdt else (v_quote ->> 'discount')::integer end,
      service_charge_bdt = case when v_same then b.service_charge_bdt else (v_quote ->> 'service_charge')::integer end,
      vat_bdt = case when v_same then b.vat_bdt else (v_quote ->> 'vat')::integer end,
      total_bdt = case when v_same then b.total_bdt else (v_quote ->> 'total')::integer end,
      promotion_id = case when v_same then b.promotion_id else nullif(v_quote -> 'promotion' ->> 'id', '')::uuid end,
      price_detail = case when v_same then b.price_detail else v_quote end
    where id = b.id;
  exception when exclusion_violation then
    raise exception 'ROOM_TAKEN';
  end;

  perform public._recalc_paid(b.id);
  perform public._assert_capacity(array(select distinct x from unnest(p_types || v_old) x), least(p_check_in, b.check_in), greatest(p_check_out, b.check_out), null);
  perform public._log(b.id, 'modified', jsonb_build_object(
    'from', jsonb_build_object('check_in', b.check_in, 'check_out', b.check_out, 'rooms', b.rooms,
                               'adults', b.adults, 'children', b.children, 'total', b.total_bdt),
    'to', jsonb_build_object('check_in', p_check_in, 'check_out', p_check_out, 'rooms', v_n,
                             'adults', p_adults, 'children', p_children,
                             'total', case when v_same then b.total_bdt else (v_quote ->> 'total')::integer end)));
end;
$$;

-- Existing single-type modification, on the engine.
create or replace function public.admin_modify_booking(
  p_booking uuid, p_room_slug text, p_check_in date, p_check_out date,
  p_rooms integer, p_adults integer, p_children integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  perform public._require('bookings.write');
  if p_rooms is null or p_rooms < 1 or p_rooms > 5 then
    raise exception 'TOO_MANY_GUESTS';
  end if;
  select * into r from public._resolve_lines(
    (select jsonb_agg(jsonb_build_object('room_type', p_room_slug)) from generate_series(1, p_rooms)),
    p_check_out - p_check_in, false);
  perform public._modify(p_booking, p_check_in, p_check_out, p_adults, p_children, r.types, r.plans, true);
end;
$$;

create or replace function public.admin_modify_reservation(
  p_booking uuid, p_lines jsonb, p_check_in date, p_check_out date, p_adults integer, p_children integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  perform public._require('bookings.write');
  select * into r from public._resolve_lines(p_lines, p_check_out - p_check_in, false);
  perform public._modify(p_booking, p_check_in, p_check_out, p_adults, p_children, r.types, r.plans, true);
end;
$$;

/* ================================================ Physical assignment */

create or replace function public._room_assignable(p_room uuid, p_type uuid, p_in date, p_out date)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  r rooms%rowtype;
begin
  select * into r from rooms where id = p_room;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if r.room_type_id <> p_type then
    raise exception 'WRONG_ROOM_TYPE';
  end if;
  if r.out_of_service then
    raise exception 'ROOM_OUT_OF_SERVICE';
  end if;
  if exists (select 1 from room_blocks where room_id = r.id and released_at is null and starts_on < p_out and ends_on > p_in) then
    raise exception 'ROOM_BLOCKED';
  end if;
end;
$$;

-- Assign (or clear) the physical room of one reservation line.
create or replace function public.admin_assign_room_line(p_line uuid, p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l booking_rooms%rowtype;
  b bookings%rowtype;
begin
  perform public._require('bookings.write');
  select * into l from booking_rooms where id = p_line for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  select * into b from bookings where id = l.booking_id for update;
  if b.status not in ('pending', 'confirmed', 'checked_in') then
    raise exception 'LOCKED';
  end if;
  if p_room is not null then
    perform public._room_assignable(p_room, l.room_type_id, b.check_in, b.check_out);
  end if;
  begin
    if b.rooms = 1 then
      update bookings set room_id = p_room where id = b.id;   -- syncs the line
    else
      update booking_rooms set room_id = p_room where id = l.id;
    end if;
  exception when exclusion_violation then
    raise exception 'ROOM_TAKEN';
  end;
  perform public._log(b.id, 'room', jsonb_build_object('line', l.line_no,
    'from', (select number from rooms where id = l.room_id), 'to', (select number from rooms where id = p_room)));
end;
$$;

-- Existing single-room assignment.
create or replace function public.admin_assign_room(p_booking uuid, p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line uuid;
  v_n integer;
begin
  perform public._require('bookings.write');
  select count(*), min(id::text)::uuid into v_n, v_line from booking_rooms where booking_id = p_booking;
  if v_n = 0 then
    raise exception 'NOT_FOUND';
  end if;
  if v_n <> 1 then
    raise exception 'LOCKED';
  end if;
  perform public.admin_assign_room_line(v_line, p_room);
end;
$$;

-- Gives every unassigned line a free room of its type (clean rooms first).
create or replace function public.admin_auto_assign(p_booking uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  b  bookings%rowtype;
  l  record;
  r  record;
  n  integer := 0;
  ok boolean;
begin
  perform public._require('bookings.write');
  select * into b from bookings where id = p_booking for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if b.status not in ('pending', 'confirmed', 'checked_in') then
    raise exception 'LOCKED';
  end if;
  for l in select * from booking_rooms where booking_id = b.id and room_id is null order by line_no loop
    ok := false;
    for r in
      select rm.id from rooms rm
      where rm.room_type_id = l.room_type_id and not rm.out_of_service
        and not exists (select 1 from room_blocks k where k.room_id = rm.id and k.released_at is null and k.starts_on < b.check_out and k.ends_on > b.check_in)
        and not exists (select 1 from booking_rooms o where o.room_id = rm.id and o.active and o.check_in < b.check_out and o.check_out > b.check_in)
      order by (rm.housekeeping = 'dirty'), rm.number
    loop
      begin
        if b.rooms = 1 then
          update bookings set room_id = r.id where id = b.id;
        else
          update booking_rooms set room_id = r.id where id = l.id;
        end if;
        ok := true;
        n := n + 1;
        exit;
      exception when exclusion_violation then
        null;   -- taken in the meantime; try the next room
      end;
    end loop;
    if not ok then
      raise exception 'ROOM_TAKEN';
    end if;
  end loop;
  if n > 0 then
    perform public._log(b.id, 'room', jsonb_build_object('auto_assigned', n));
  end if;
  return n;
end;
$$;

/* ================================================ Rooms leaving service */

create or replace function public.guard_room_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if (new.number is distinct from old.number or new.room_type_id is distinct from old.room_type_id)
       and not public.has_permission('rooms.manage') then
      raise exception 'NOT_ALLOWED';
    end if;
    if new.out_of_service is distinct from old.out_of_service and not public.has_permission('maintenance.manage') then
      raise exception 'NOT_ALLOWED';
    end if;
    if new.housekeeping is distinct from old.housekeeping and not public.has_permission('housekeeping.write') then
      raise exception 'NOT_ALLOWED';
    end if;
  end if;
  -- Taking a room out of service must not oversell or strand a guest.
  if new.out_of_service and not old.out_of_service then
    perform public._lock_types(array[old.room_type_id]);
    if exists (select 1 from booking_rooms where room_id = old.id and active and check_out > public._today()) then
      raise exception 'ROOM_IN_USE';
    end if;
    if not public._type_still_fits(old.room_type_id, 1) then
      raise exception 'ROOM_NEEDED';
    end if;
  end if;
  return new;
end;
$$;

/* ================================================== Public: search */

-- What the website shows for a search: every published type with its
-- live availability for the whole stay and the server's price for one room.
create or replace function public.search_availability(p_check_in date, p_check_out date, p_adults integer, p_children integer, p_promo text default null)
returns table (room_type text, name text, tag text, sleeps integer, available integer, nights integer,
               subtotal integer, discount integer, total integer, quote jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rt room_types%rowtype;
  rp uuid;
  q  jsonb;
begin
  perform public._validate_stay(p_check_in, p_check_out);
  if p_adults is null or p_adults < 1 or p_adults > 30 or p_children is null or p_children < 0 or p_children > 20 then
    raise exception 'TOO_MANY_GUESTS';
  end if;
  for rt in select * from room_types where is_published order by sort_order loop
    select id into rp from rate_plans where room_type_id = rt.id and code = 'STANDARD' and is_active and is_public;
    q := public._quote(array[rt.id], array[rp], p_check_in, p_check_out, p_promo, false);
    room_type := rt.slug; name := rt.name; tag := rt.tag; sleeps := rt.sleeps;
    available := greatest(0, public._free_units(rt.id, p_check_in, p_check_out, null, null));
    nights := p_check_out - p_check_in;
    subtotal := (q ->> 'subtotal')::integer; discount := (q ->> 'discount')::integer; total := (q ->> 'total')::integer;
    quote := q;
    return next;
  end loop;
end;
$$;

/* ==================================================== Public: holds */

-- Reserves the chosen rooms for a few minutes while the guest completes
-- checkout. Returns a secret token (only its hash is stored) and the quote.
create or replace function public.create_hold(
  p_check_in date, p_check_out date, p_adults integer, p_children integer, p_lines jsonb, p_promo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_quote jsonb;
  v_token text := public._new_token();
  v_id    uuid;
  v_mins  integer;
  v_exp   timestamptz;
  i       integer;
begin
  perform public._validate_stay(p_check_in, p_check_out);
  select * into r from public._resolve_lines(p_lines, p_check_out - p_check_in, true);
  perform public._check_party(r.types, p_adults, p_children);
  perform public.expire_holds();
  -- Stop one visitor from tying up the hotel with holds.
  if (select count(*) from booking_holds where status = 'active' and expires_at > now()) >= 40 then
    raise exception 'RATE_LIMITED';
  end if;
  perform public._reserve_inventory(r.types, p_check_in, p_check_out, null, null);
  v_quote := public._quote(r.types, r.plans, p_check_in, p_check_out, p_promo, true);

  select hold_minutes into v_mins from hotel_settings where id = 1;
  v_exp := now() + make_interval(mins => coalesce(v_mins, 15));
  insert into booking_holds (token_hash, check_in, check_out, adults, children, promo_code, quote, total_bdt, expires_at)
  values (public._token_hash(v_token), p_check_in, p_check_out, p_adults, coalesce(p_children, 0),
          nullif(upper(btrim(coalesce(p_promo, ''))), ''), v_quote, (v_quote ->> 'total')::integer, v_exp)
  returning id into v_id;
  for i in 1 .. cardinality(r.types) loop
    insert into booking_hold_rooms (hold_id, line_no, room_type_id, rate_plan_id) values (v_id, i, r.types[i], r.plans[i]);
  end loop;
  perform public._assert_capacity(r.types, p_check_in, p_check_out, null);
  return jsonb_build_object('token', v_token, 'expires_at', v_exp, 'quote', v_quote);
end;
$$;

create or replace function public._hold_for(p_token text, p_lock boolean)
returns booking_holds language plpgsql security definer set search_path = public as $$
declare
  h booking_holds%rowtype;
begin
  if p_lock then
    select * into h from booking_holds where token_hash = public._token_hash(p_token) for update;
  else
    select * into h from booking_holds where token_hash = public._token_hash(p_token);
  end if;
  if not found then
    raise exception 'HOLD_NOT_FOUND';
  end if;
  return h;
end;
$$;

create or replace function public.get_hold(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  h booking_holds%rowtype := public._hold_for(p_token, false);
begin
  return jsonb_build_object(
    'status', case when h.status = 'active' and h.expires_at <= now() then 'expired' else h.status end,
    'expires_at', h.expires_at, 'check_in', h.check_in, 'check_out', h.check_out,
    'adults', h.adults, 'children', h.children, 'promo_code', h.promo_code, 'quote', h.quote,
    'reference', (select reference from bookings where id = h.booking_id));
end;
$$;

-- Re-prices the hold with a promo code (or none). Inventory is untouched.
create or replace function public.hold_apply_promo(p_token text, p_promo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  h booking_holds%rowtype := public._hold_for(p_token, true);
  v_types uuid[];
  v_plans uuid[];
  v_quote jsonb;
begin
  if h.status <> 'active' or h.expires_at <= now() then
    raise exception 'HOLD_EXPIRED';
  end if;
  select array_agg(room_type_id order by line_no), array_agg(rate_plan_id order by line_no) into v_types, v_plans
  from booking_hold_rooms where hold_id = h.id;
  v_quote := public._quote(v_types, v_plans, h.check_in, h.check_out, p_promo, true);
  update booking_holds set promo_code = nullif(upper(btrim(coalesce(p_promo, ''))), ''), quote = v_quote,
         total_bdt = (v_quote ->> 'total')::integer, updated_at = now()
  where id = h.id;
  return v_quote;
end;
$$;

create or replace function public.release_hold(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update booking_holds set status = 'released', updated_at = now()
  where token_hash = public._token_hash(p_token) and status = 'active';
end;
$$;

-- Turns a hold into a reservation. Safe to retry: the same idempotency key
-- (or a hold already converted) returns the same booking, never a second one.
-- Availability and price are recomputed here; if the price moved since the
-- guest saw it (p_quoted_total), nothing is booked and PRICE_CHANGED is raised.
create or replace function public.confirm_hold(
  p_token text, p_idempotency_key text, p_guest_name text, p_email text, p_phone text, p_country text,
  p_arrival text, p_requests text, p_airport_pickup boolean, p_payment_option text, p_quoted_total integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  h        booking_holds%rowtype;
  v_types  uuid[];
  v_plans  uuid[];
  v_quote  jsonb;
  v_id     uuid;
  v_ref    text;
  v_token  text := public._new_token();
  v_replay boolean := false;
  b        bookings%rowtype;
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{8,80}$' then
    raise exception 'BAD_IDEMPOTENCY_KEY';
  end if;
  h := public._hold_for(p_token, true);

  select * into b from bookings where idempotency_key = p_idempotency_key;
  if found and b.hold_id is distinct from h.id then
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  if h.status = 'converted' then
    v_id := h.booking_id;
    v_replay := true;
  else
    if h.status <> 'active' then
      raise exception 'HOLD_EXPIRED';
    end if;
    if p_payment_option not in ('pay_at_hotel', 'advance') then
      raise exception 'BAD_PAYMENT_OPTION';
    end if;
    if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'BAD_EMAIL';
    end if;
    if (select count(*) from bookings
        where created_at > now() - interval '1 hour' and source = 'website'
          and (phone = trim(p_phone) or lower(email) = lower(trim(p_email)))) >= 3 then
      raise exception 'RATE_LIMITED';
    end if;
    select array_agg(room_type_id order by line_no), array_agg(rate_plan_id order by line_no) into v_types, v_plans
    from booking_hold_rooms where hold_id = h.id;

    -- Price check before writing anything (inventory is re-checked inside _reserve).
    v_quote := public._quote(v_types, v_plans, h.check_in, h.check_out, h.promo_code, true);
    if p_quoted_total is not null and (v_quote ->> 'total')::integer <> p_quoted_total then
      update booking_holds set quote = v_quote, total_bdt = (v_quote ->> 'total')::integer, updated_at = now() where id = h.id;
      raise exception 'PRICE_CHANGED';
    end if;

    -- An expired hold still converts if its rooms are still free (re-checked under lock).
    begin
      v_id := public._reserve('website', 'pending', h.check_in, h.check_out, h.adults, h.children, v_types, v_plans,
        h.promo_code, p_guest_name, p_email, p_phone, p_country, p_arrival, p_requests, null, p_airport_pickup,
        p_payment_option, p_idempotency_key, h.id);
    exception when others then
      if sqlerrm = 'SOLD_OUT' and h.expires_at <= now() then
        update booking_holds set status = 'expired', updated_at = now() where id = h.id;
        raise exception 'HOLD_EXPIRED';
      end if;
      raise;
    end;
    update booking_holds set status = 'converted', booking_id = v_id, updated_at = now() where id = h.id;
  end if;

  select * into b from bookings where id = v_id;
  insert into booking_access_tokens (token_hash, booking_id, expires_at)
  values (public._token_hash(v_token), v_id, now() + interval '24 hours');

  return jsonb_build_object('reference', b.reference, 'status', b.status, 'total', b.total_bdt,
    'advance_due', b.advance_due_bdt, 'payment_due_at', b.payment_due_at, 'payment_option', b.payment_option,
    'manage_token', v_token, 'manage_expires_at', now() + interval '24 hours', 'replayed', v_replay);
end;
$$;

/* ============================================ Guest self-service */

-- Reference + the phone or email on the booking → a 30-minute private token,
-- or null. (No exception on a miss, so the attempt record is kept and the
-- per-reference throttle counts failed guesses.)
create or replace function public.verify_booking_access(p_reference text, p_contact text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref     text := upper(trim(coalesce(p_reference, '')));
  v_contact text := lower(trim(coalesce(p_contact, '')));
  v_digits  text := right(regexp_replace(coalesce(p_contact, ''), '\D', '', 'g'), 10);
  v_id      uuid;
  v_token   text := public._new_token();
begin
  if v_ref = '' or v_contact = '' then
    raise exception 'NOT_FOUND';
  end if;
  if (select count(*) from booking_lookup_attempts
      where booking_lookup_attempts.reference = v_ref and booking_lookup_attempts.created_at > now() - interval '1 hour') >= 8 then
    raise exception 'RATE_LIMITED';
  end if;
  insert into booking_lookup_attempts (reference) values (v_ref);
  select b.id into v_id from bookings b
  where b.reference = v_ref
    and ((b.email is not null and lower(b.email) = v_contact)
         or (char_length(v_digits) >= 8 and right(regexp_replace(b.phone, '\D', '', 'g'), 10) = v_digits));
  if v_id is null then
    return null;
  end if;
  insert into booking_access_tokens (token_hash, booking_id, expires_at)
  values (public._token_hash(v_token), v_id, now() + interval '30 minutes');
  return jsonb_build_object('token', v_token, 'expires_at', now() + interval '30 minutes');
end;
$$;

create or replace function public._booking_for_token(p_token text)
returns bookings language plpgsql security definer set search_path = public as $$
declare
  b bookings%rowtype;
begin
  select bk.* into b from booking_access_tokens t join bookings bk on bk.id = t.booking_id
  where t.token_hash = public._token_hash(p_token) and t.expires_at > now();
  if not found then
    raise exception 'ACCESS_EXPIRED';
  end if;
  return b;
end;
$$;

create or replace function public._mask_email(p text)
returns text language sql immutable set search_path = public as $$
  select case when p is null then null else left(split_part(p, '@', 1), 1) || '•••@' || split_part(p, '@', 2) end;
$$;

create or replace function public._mask_phone(p text)
returns text language sql immutable set search_path = public as $$
  select case when p is null then null else '•••• ' || right(regexp_replace(p, '\D', '', 'g'), 3) end;
$$;

-- A guest's own booking, for a valid token. Contact details are masked.
create or replace function public.guest_booking(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b bookings%rowtype := public._booking_for_token(p_token);
begin
  return jsonb_build_object(
    'reference', b.reference, 'status', b.status,
    'check_in', b.check_in, 'check_out', b.check_out, 'nights', b.check_out - b.check_in,
    'adults', b.adults, 'children', b.children, 'guest_first_name', split_part(b.guest_name, ' ', 1),
    'email', public._mask_email(b.email), 'phone', public._mask_phone(b.phone),
    'rooms', (select jsonb_agg(jsonb_build_object('room_type', rt.name, 'subtotal', br.subtotal_bdt, 'nights', br.price_detail) order by br.line_no)
              from booking_rooms br join room_types rt on rt.id = br.room_type_id where br.booking_id = b.id),
    'subtotal', coalesce(b.subtotal_bdt, b.total_bdt), 'discount', b.discount_bdt, 'service_charge', b.service_charge_bdt,
    'vat', b.vat_bdt, 'total', b.total_bdt, 'paid', b.amount_paid_bdt, 'payment_status', b.payment_status,
    'payment_option', b.payment_option, 'advance_due', b.advance_due_bdt, 'payment_due_at', b.payment_due_at,
    'taxes_pending', coalesce((b.price_detail ->> 'taxes_pending')::boolean, true),
    'open_requests', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'created_at', created_at)), '[]'::jsonb)
                      from booking_requests where booking_id = b.id and status = 'open'),
    'can_cancel', b.status in ('pending', 'confirmed') and b.check_in >= public._today(),
    'cancels_instantly', b.status = 'pending' and b.amount_paid_bdt = 0,
    'can_request_change', b.status in ('pending', 'confirmed') and b.check_in >= public._today());
end;
$$;

-- Unconfirmed, unpaid bookings are cancelled at once (rooms released);
-- otherwise the front desk gets a cancellation request.
create or replace function public.guest_cancel(p_token text, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings%rowtype := public._booking_for_token(p_token);
begin
  if b.status not in ('pending', 'confirmed') or b.check_in < public._today() then
    raise exception 'NOT_ALLOWED';
  end if;
  if b.status = 'pending' and b.amount_paid_bdt = 0 then
    perform public._transition(b.id, 'cancelled', coalesce(nullif(left(trim(coalesce(p_reason, '')), 300), ''), 'Cancelled by guest'));
    return 'cancelled';
  end if;
  if not exists (select 1 from booking_requests where booking_id = b.id and kind = 'cancel' and status = 'open') then
    insert into booking_requests (booking_id, kind, detail) values (b.id, 'cancel', jsonb_build_object('reason', left(coalesce(p_reason, ''), 300)));
    perform public._notify('bookings.write', 'booking', 'Cancellation request ' || b.reference, left(coalesce(p_reason, ''), 200), '/admin/bookings/' || b.reference);
  end if;
  return 'requested';
end;
$$;

-- A guest asks for new dates; the desk applies it with the same engine.
create or replace function public.guest_request_change(p_token text, p_check_in date, p_check_out date, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings%rowtype := public._booking_for_token(p_token);
  v_types uuid[];
  v_free boolean := true;
  t record;
begin
  if b.status not in ('pending', 'confirmed') or b.check_in < public._today() then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._validate_stay(p_check_in, p_check_out);
  select array_agg(room_type_id order by line_no) into v_types from booking_rooms where booking_id = b.id;
  for t in select id, count(*)::integer n from unnest(v_types) id group by id loop
    if public._free_units(t.id, p_check_in, p_check_out, b.id, null) < t.n then
      v_free := false;
    end if;
  end loop;
  insert into booking_requests (booking_id, kind, detail)
  values (b.id, 'change', jsonb_build_object('check_in', p_check_in, 'check_out', p_check_out,
          'note', left(coalesce(p_note, ''), 500), 'available_when_requested', v_free));
  perform public._notify('bookings.write', 'booking', 'Date change request ' || b.reference,
    to_char(p_check_in, 'DD Mon') || ' – ' || to_char(p_check_out, 'DD Mon') || case when v_free then '' else ' (not available now)' end,
    '/admin/bookings/' || b.reference);
  return jsonb_build_object('requested', true, 'available', v_free);
end;
$$;

create or replace function public.admin_resolve_request(p_request uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require('bookings.write');
  if p_status not in ('done', 'declined') then
    raise exception 'BAD_TRANSITION';
  end if;
  update booking_requests set status = p_status, handled_by = auth.uid(), handled_at = now()
  where id = p_request and status = 'open';
  if not found then
    raise exception 'NOT_FOUND';
  end if;
end;
$$;

create or replace function public.admin_run_booking_jobs()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._require('bookings.write');
  return jsonb_build_object('holds_expired', public.expire_holds(), 'bookings_expired', public.expire_overdue_bookings());
end;
$$;

/* ======================================== Payments (server / gateway) */

-- For a payment gateway: create an intent for part or all of the balance.
-- Callable only with the server's secret key (service_role).
create or replace function public.create_payment_intent(p_reference text, p_amount integer, p_provider text, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings%rowtype;
  i payment_intents%rowtype;
begin
  select * into i from payment_intents where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('intent_id', i.id, 'amount', i.amount_bdt, 'status', i.status, 'replayed', true);
  end if;
  select * into b from bookings where reference = upper(trim(p_reference)) for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if b.status not in ('pending', 'confirmed', 'checked_in') then
    raise exception 'LOCKED';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > b.total_bdt - b.amount_paid_bdt then
    raise exception 'BAD_AMOUNT';
  end if;
  insert into payment_intents (booking_id, provider, amount_bdt, idempotency_key)
  values (b.id, p_provider, p_amount, p_idempotency_key)
  returning * into i;
  return jsonb_build_object('intent_id', i.id, 'amount', i.amount_bdt, 'status', i.status, 'replayed', false);
end;
$$;

-- A gateway's callback. Idempotent: repeats are recognised and change nothing;
-- the amount must match the intent; only success writes to the ledger.
create or replace function public.apply_payment_callback(p_provider text, p_intent uuid, p_provider_ref text, p_status text, p_amount integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  i payment_intents%rowtype;
begin
  select * into i from payment_intents where id = p_intent and provider = p_provider for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if p_status not in ('succeeded', 'failed', 'cancelled') then
    raise exception 'BAD_TRANSITION';
  end if;
  if i.status <> 'created' then
    return case when i.status = p_status and i.provider_ref is not distinct from p_provider_ref then 'duplicate' else 'ignored' end;
  end if;
  if p_status = 'succeeded' and p_amount is distinct from i.amount_bdt then
    update payment_intents set status = 'failed', failure_reason = 'amount_mismatch', provider_ref = p_provider_ref, updated_at = now() where id = i.id;
    perform public._log(i.booking_id, 'payment', jsonb_build_object('gateway', p_provider, 'result', 'amount_mismatch', 'expected', i.amount_bdt, 'got', p_amount));
    return 'mismatch';
  end if;
  update payment_intents set status = p_status, provider_ref = p_provider_ref, updated_at = now() where id = i.id;
  if p_status = 'succeeded' then
    insert into payments (booking_id, amount_bdt, method, reference, note, intent_id)
    values (i.booking_id, i.amount_bdt, 'online', left(p_provider_ref, 80), 'Online payment via ' || p_provider, i.id);
    update bookings set payment_due_at = null where id = i.booking_id and payment_due_at is not null;
  end if;
  perform public._log(i.booking_id, 'payment', jsonb_build_object('gateway', p_provider, 'result', p_status, 'amount', i.amount_bdt));
  return 'applied';
end;
$$;

/* ================================================================ RLS */

alter table public.booking_holds enable row level security;
alter table public.booking_hold_rooms enable row level security;
alter table public.booking_access_tokens enable row level security;
alter table public.booking_requests enable row level security;
alter table public.payment_intents enable row level security;

create policy "booking requests: bookings.read" on public.booking_requests for select to authenticated
  using (public.has_permission('bookings.read'));
create policy "payment intents: payments.read" on public.payment_intents for select to authenticated
  using (public.has_permission('payments.read'));
create policy "holds: bookings.read" on public.booking_holds for select to authenticated
  using (public.has_permission('bookings.read'));
create policy "hold rooms: bookings.read" on public.booking_hold_rooms for select to authenticated
  using (public.has_permission('bookings.read'));

revoke all on public.booking_holds, public.booking_hold_rooms, public.booking_access_tokens,
  public.booking_requests, public.payment_intents from anon, authenticated;
grant select on public.booking_holds, public.booking_hold_rooms, public.booking_requests, public.payment_intents to authenticated;

/* ============================================================== Grants */

do $$
declare
  f text;
begin
  -- Internal helpers: nobody calls them through the API.
  foreach f in array array[
    'public._today()', 'public._token_hash(text)', 'public._new_token()', 'public._validate_stay(date, date)',
    'public._lock_types(uuid[])', 'public._free_units(uuid, date, date, uuid, uuid)', 'public._free_units(uuid, date, date, uuid)',
    'public._assert_capacity(uuid[], date, date, uuid)', 'public._type_still_fits(uuid, integer)',
    'public._night_rate(uuid, uuid, date)', 'public._stay_total(uuid, date, date)',
    'public._promotion_for(text, date, date, uuid[], boolean)', 'public._quote(uuid[], uuid[], date, date, text, boolean)',
    'public._resolve_lines(jsonb, integer, boolean)', 'public._check_party(uuid[], integer, integer)',
    'public._reserve_inventory(uuid[], date, date, uuid, uuid)', 'public._transition(uuid, text, text)',
    'public._reserve(text, text, date, date, integer, integer, uuid[], uuid[], text, text, text, text, text, text, text, text, boolean, text, text, uuid)',
    'public._sync_booking_children()', 'public._modify(uuid, date, date, integer, integer, uuid[], uuid[], boolean)',
    'public._room_assignable(uuid, uuid, date, date)', 'public._hold_for(text, boolean)', 'public._booking_for_token(text)',
    'public._mask_email(text)', 'public._mask_phone(text)', 'public.guard_room_service()',
    'public._insert_booking(text, date, date, integer, integer, integer, text, text, text, text, text, text, boolean, text, text, text)',
    'public.expire_holds()', 'public.expire_overdue_bookings()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  -- The public website (and signed-in users).
  foreach f in array array[
    'public.room_availability(date, date)', 'public.search_availability(date, date, integer, integer, text)',
    'public.create_hold(date, date, integer, integer, jsonb, text)', 'public.get_hold(text)', 'public.hold_apply_promo(text, text)',
    'public.release_hold(text)',
    'public.confirm_hold(text, text, text, text, text, text, text, text, boolean, text, integer)',
    'public.create_booking(text, date, date, integer, integer, integer, text, text, text, text, text, text, boolean)',
    'public.verify_booking_access(text, text)', 'public.guest_booking(text)', 'public.guest_cancel(text, text)',
    'public.guest_request_change(text, date, date, text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;

  -- Staff (each checks a permission itself).
  foreach f in array array[
    'public.admin_set_status(uuid, text, text)', 'public.admin_create_booking(text, date, date, integer, integer, integer, text, text, text, text, text, text, boolean, text, text)',
    'public.admin_create_reservation(jsonb, date, date, integer, integer, text, text, text, text, text, text, text, boolean, text, text, text)',
    'public.admin_modify_booking(uuid, text, date, date, integer, integer, integer)',
    'public.admin_modify_reservation(uuid, jsonb, date, date, integer, integer)',
    'public.admin_assign_room(uuid, uuid)', 'public.admin_assign_room_line(uuid, uuid)', 'public.admin_auto_assign(uuid)',
    'public.admin_resolve_request(uuid, text)', 'public.admin_run_booking_jobs()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  -- Gateway / scheduler: the server's secret key only.
  foreach f in array array[
    'public.create_payment_intent(text, integer, text, text)', 'public.apply_payment_callback(text, uuid, text, text, integer)',
    'public.expire_holds()', 'public.expire_overdue_bookings()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

/* ===================================================== Scheduled jobs */

-- Where pg_cron is available (Supabase), expire holds and overdue advances
-- every five minutes. Availability never depends on this: expired holds stop
-- counting the moment they expire.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron not available: %', sqlerrm;
    return;
  end;
  execute $cron$select cron.schedule('bsq-booking-expiry', '*/5 * * * *', 'select public.expire_holds(); select public.expire_overdue_bookings();')$cron$;
exception when others then
  raise notice 'Could not schedule expiry job: %', sqlerrm;
end;
$$;

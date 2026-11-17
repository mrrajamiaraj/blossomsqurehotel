-- Weekday / weekend rates, the published ("rack") rate, and the hotel's
-- seven-room lineup from its tariff chart.
--
--   price_bdt          weekday rate (Sun–Wed nights)
--   weekend_price_bdt  Thursday and Friday nights; null = weekday rate every night
--   rack_price_bdt     published rate, shown crossed out on the website
--
-- Bookings are priced night by night. nightly_rate_bdt on a booking keeps the
-- average per room per night, so reports stay correct.
--
-- Rollback: restore _insert_booking and admin_modify_booking from
-- 20261027000300_booking_functions.sql, drop _is_weekend_night and _stay_total,
-- and drop the two columns. The room rows are left as they are.

alter table public.room_types
  add column weekend_price_bdt integer check (weekend_price_bdt > 0),
  add column rack_price_bdt    integer check (rack_price_bdt > 0);

/* ---------- The room lineup ---------- */

-- The three original types become the closest brochure types, so their
-- physical rooms and bookings carry over. Slugs change with the names.
update public.room_types set
  slug = 'connecting-king-suite', name = 'Connecting King Suite', tag = 'SUITE',
  bed = 'Two king-size beds', sleeps = 4, floor = '', view = '',
  rack_price_bdt = 10000, price_bdt = 6000, weekend_price_bdt = 8500,
  blurb = 'Two king-size beds and a balcony, for families or friends travelling together.',
  description = 'Two king-size beds, a private bathroom with hot water and a balcony, with air conditioning, TV, Wi-Fi and a work desk. Ideal for families or friends travelling together.',
  features = '{Two king-size beds,Private bathroom,Balcony,Wi-Fi,TV,Air conditioning,Geyser (hot water),Work desk}',
  gallery = '{DSC5566,DSC5565,WA0013}', sort_order = 5
where slug = 'king-suite';

update public.room_types set
  slug = 'connecting-queen-suite', name = 'Connecting Queen Suite', tag = 'SUITE',
  bed = 'Two queen-size beds', sleeps = 4, floor = '', view = '',
  rack_price_bdt = 9000, price_bdt = 5500, weekend_price_bdt = 7500,
  blurb = 'Two queen-size beds and a balcony: room for four without booking two rooms.',
  description = 'Two queen-size beds, a private bathroom with hot water and a balcony, with air conditioning, TV, Wi-Fi and a work desk. Room for four without booking two rooms.',
  features = '{Two queen-size beds,Private bathroom,Balcony,Wi-Fi,TV,Air conditioning,Geyser (hot water),Work desk}',
  gallery = '{WA0018,DSC5578}', sort_order = 6
where slug = 'business-queen-suite';

update public.room_types set
  name = 'Deluxe Couple', tag = 'DELUXE',
  bed = 'Queen-size bed', sleeps = 2, floor = '', view = '',
  rack_price_bdt = 5000, price_bdt = 3500, weekend_price_bdt = 4500,
  blurb = 'A roomier couple''s room with a queen-size bed, soft lighting and a private bathroom.',
  description = 'A roomier couple''s room with a queen-size bed, a private bathroom with hot water, air conditioning, TV, Wi-Fi and a work desk.',
  features = '{Queen-size bed,Private bathroom,Wi-Fi,TV,Air conditioning,Geyser (hot water),Work desk}',
  gallery = '{DSC5551,DSC5552,DSC5555}', sort_order = 2
where slug = 'deluxe-couple';

insert into public.room_types
  (slug, name, tag, bed, sleeps, floor, view, rack_price_bdt, price_bdt, weekend_price_bdt,
   blurb, description, features, gallery, sort_order)
values
  ('standard-couple', 'Standard Couple', 'DELUXE', 'Queen-size bed', 2, '', '', 3500, 2500, 3500,
   'A comfortable room for two with a queen-size bed, private bathroom and everything you need for a beach break.',
   'A comfortable room for two: a queen-size bed, a private bathroom with hot water, air conditioning, TV, Wi-Fi and a work desk. Kolatoli beach is a short walk away.',
   '{Queen-size bed,Private bathroom,Wi-Fi,TV,Air conditioning,Geyser (hot water),Work desk}',
   '{DSC5579,DSC5578}', 1),
  ('honeymoon-couple', 'Honeymoon Couple', 'DELUXE', 'Queen-size bed', 2, '', '', 6000, 4000, 5500,
   'Our room for celebrations: a queen-size bed, warm lighting and a little extra care for the two of you.',
   'Our room for honeymoons and anniversaries: a queen-size bed, a private bathroom with hot water, air conditioning, TV, Wi-Fi and a work desk. Tell us what you''re celebrating when you book.',
   '{Queen-size bed,Private bathroom,Wi-Fi,TV,Air conditioning,Geyser (hot water),Work desk}',
   '{DSC5550,DSC5555}', 3),
  ('executive-family-suite', 'Executive Family Suite', 'SUITE', 'Two queen-size beds + one single bed', 5, '', '', 12000, 7000, 10000,
   'Space for the whole family: two queen-size beds, a single bed, two private bathrooms and a balcony.',
   'Our largest suite, made for families: two queen-size beds and a single bed, two private bathrooms with hot water, a balcony, air conditioning, TV, Wi-Fi and a work desk.',
   '{Two queen-size beds,One single bed,Two private bathrooms,Balcony,Wi-Fi,TV,Air conditioning,Geyser (hot water),Work desk}',
   '{DSC5565,DSC5575}', 4),
  ('premium-twin', 'Premium Twin', 'DELUXE', 'One queen-size bed + one single bed', 3, '', '', 7000, 5000, 6000,
   'A queen-size bed plus a single, for friends, a parent and child, or a small family.',
   'One queen-size bed and one single bed, a private bathroom with hot water, air conditioning, TV, Wi-Fi and a work desk. Good for friends, a parent and child, or a small family.',
   '{One queen-size bed,One single bed,Private bathroom,Wi-Fi,TV,Air conditioning,Geyser (hot water),Work desk}',
   '{DSC5575,DSC5562}', 7)
on conflict (slug) do nothing;

-- New types have no physical rooms yet, so they show as fully booked until
-- the hotel adds its room numbers (insert into public.rooms).

/* ---------- Night-by-night pricing ---------- */

-- Thursday (4) and Friday (5) nights. Keep in step with WEEKEND_NIGHTS in src/lib/pricing.ts.
create or replace function public._is_weekend_night(p_night date)
returns boolean
language sql
immutable
as $$
  select extract(dow from p_night) in (4, 5);
$$;

-- Room total for one unit of a type over [p_in, p_out).
create or replace function public._stay_total(p_type uuid, p_in date, p_out date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
           case when public._is_weekend_night(d::date) and rt.weekend_price_bdt is not null
                then rt.weekend_price_bdt else rt.price_bdt end
         ), 0)::integer
  from room_types rt
  cross join generate_series(p_in, p_out - 1, interval '1 day') as d
  where rt.id = p_type;
$$;

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
  v_room   room_types%rowtype;
  v_nights integer := p_check_out - p_check_in;
  v_unit   integer;
  v_ref    text;
  v_id     uuid;
begin
  if p_check_in < (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'PAST_DATE';
  end if;
  if v_nights < 1 or v_nights > 30 then
    raise exception 'BAD_DATES';
  end if;
  if p_rooms is null or p_rooms < 1 or p_rooms > 5 then
    raise exception 'TOO_MANY_GUESTS';
  end if;

  select * into v_room from room_types where slug = p_room_slug for update;
  if not found or (p_source = 'website' and not v_room.is_published) then
    raise exception 'NO_ROOM';
  end if;

  -- Each room takes up to `sleeps` adults plus one child.
  if p_adults < 1 or p_children < 0
     or p_adults > v_room.sleeps * p_rooms
     or p_adults + p_children > (v_room.sleeps + 1) * p_rooms then
    raise exception 'TOO_MANY_GUESTS';
  end if;

  if public._free_units(v_room.id, p_check_in, p_check_out, null) < p_rooms then
    raise exception 'SOLD_OUT';
  end if;

  v_unit := public._stay_total(v_room.id, p_check_in, p_check_out);

  loop
    v_ref := 'BSQ-' || lpad((floor(random() * 100000))::text, 5, '0');
    exit when not exists (select 1 from bookings where reference = v_ref);
  end loop;

  insert into bookings (
    reference, room_type_id, rooms, check_in, check_out, adults, children,
    guest_name, email, phone, country, arrival_window, special_requests,
    internal_notes, airport_pickup, source, status, confirmed_at,
    nightly_rate_bdt, total_bdt
  ) values (
    v_ref, v_room.id, p_rooms, p_check_in, p_check_out, p_adults, coalesce(p_children, 0),
    trim(p_guest_name), nullif(lower(trim(coalesce(p_email, ''))), ''), trim(p_phone),
    nullif(trim(coalesce(p_country, '')), ''), nullif(trim(coalesce(p_arrival_window, '')), ''),
    nullif(trim(coalesce(p_special_requests, '')), ''), nullif(trim(coalesce(p_internal_notes, '')), ''),
    coalesce(p_airport_pickup, false), p_source, p_status,
    case when p_status = 'confirmed' then now() end,
    round(v_unit::numeric / v_nights)::integer, v_unit * p_rooms
  )
  returning id into v_id;

  perform public._log(v_id, 'created', jsonb_build_object('source', p_source, 'status', p_status));
  return v_ref;
end;
$$;

-- Same room type and dates keep the agreed rate; any other change is
-- re-priced night by night at today's rates.
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
  b        bookings%rowtype;
  v_type   room_types%rowtype;
  v_nights integer := p_check_out - p_check_in;
  v_keep   boolean;
  v_unit   integer;
  v_rate   integer;
  v_total  integer;
  v_room   uuid;
begin
  perform public._require_staff();
  select * into b from bookings where id = p_booking for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if b.status not in ('pending', 'confirmed', 'checked_in') then
    raise exception 'LOCKED';
  end if;
  -- Once a guest is in, only the departure date (and party) can change.
  if b.status = 'checked_in' and (p_check_in <> b.check_in or p_room_slug <> (select slug from room_types where id = b.room_type_id)) then
    raise exception 'LOCKED';
  end if;
  if v_nights < 1 or v_nights > 30 then
    raise exception 'BAD_DATES';
  end if;
  if b.status <> 'checked_in' and p_check_in < (now() at time zone 'Asia/Dhaka')::date and p_check_in <> b.check_in then
    raise exception 'PAST_DATE';
  end if;

  select * into v_type from room_types where slug = p_room_slug for update;
  if not found then
    raise exception 'NO_ROOM';
  end if;
  if p_rooms < 1 or p_rooms > 5 or p_adults < 1 or p_children < 0
     or p_adults > v_type.sleeps * p_rooms
     or p_adults + p_children > (v_type.sleeps + 1) * p_rooms then
    raise exception 'TOO_MANY_GUESTS';
  end if;
  if public._free_units(v_type.id, p_check_in, p_check_out, b.id) < p_rooms then
    raise exception 'SOLD_OUT';
  end if;

  v_keep := v_type.id = b.room_type_id and p_check_in = b.check_in and p_check_out = b.check_out;
  if v_keep then
    v_rate := b.nightly_rate_bdt;
    v_total := round(b.total_bdt::numeric / b.rooms * p_rooms)::integer;
  else
    v_unit := public._stay_total(v_type.id, p_check_in, p_check_out);
    v_rate := round(v_unit::numeric / v_nights)::integer;
    v_total := v_unit * p_rooms;
  end if;
  -- A different type or several rooms can't keep the assigned unit.
  v_room := case when v_type.id = b.room_type_id and p_rooms = 1 then b.room_id end;

  begin
    update bookings set
      room_type_id = v_type.id,
      room_id = v_room,
      check_in = p_check_in,
      check_out = p_check_out,
      rooms = p_rooms,
      adults = p_adults,
      children = p_children,
      nightly_rate_bdt = v_rate,
      total_bdt = v_total,
      payment_status = case
        when amount_paid_bdt = 0 then 'unpaid'
        when amount_paid_bdt >= v_total then 'paid'
        else 'partial' end
    where id = b.id;
  exception when exclusion_violation then
    raise exception 'ROOM_TAKEN';
  end;

  perform public._log(b.id, 'modified', jsonb_build_object(
    'from', jsonb_build_object('check_in', b.check_in, 'check_out', b.check_out, 'rooms', b.rooms,
                               'adults', b.adults, 'children', b.children, 'total', b.total_bdt),
    'to', jsonb_build_object('check_in', p_check_in, 'check_out', p_check_out, 'rooms', p_rooms,
                             'adults', p_adults, 'children', p_children, 'room_type', p_room_slug,
                             'total', v_total)
  ));
end;
$$;

revoke all on function public._is_weekend_night(date) from public, anon, authenticated;
revoke all on function public._stay_total(uuid, date, date) from public, anon, authenticated;
revoke all on function public._insert_booking(text, date, date, integer, integer, integer, text, text, text, text, text, text, boolean, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_modify_booking(uuid, text, date, date, integer, integer, integer) from public, anon;
grant execute on function public.admin_modify_booking(uuid, text, date, date, integer, integer, integer) to authenticated;

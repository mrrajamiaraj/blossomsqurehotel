-- Availability, booking creation and the front-desk lifecycle.
-- All writes to bookings happen here, inside one transaction per call, with
-- the room type row locked so concurrent requests can't oversell.
-- Error codes raised (matched by the app): PAST_DATE, BAD_DATES, NO_ROOM,
-- TOO_MANY_GUESTS, SOLD_OUT, RATE_LIMITED, NOT_STAFF, NOT_MANAGER, NOT_FOUND,
-- BAD_TRANSITION, ASSIGN_ROOM, ROOM_TAKEN, WRONG_ROOM_TYPE, ROOM_OUT_OF_SERVICE,
-- TOO_EARLY, BAD_AMOUNT, LOCKED.
-- Rollback: drop the functions defined in this file.

-- Units of a type still free for [p_in, p_out), optionally ignoring one booking.
-- Rooms marked out of service are not sold.
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

create or replace function public.room_availability(p_check_in date, p_check_out date)
returns table (slug text, available integer)
language sql
stable
security definer
set search_path = public
as $$
  select rt.slug, greatest(0, public._free_units(rt.id, p_check_in, p_check_out, null))
  from room_types rt
  where rt.is_published;
$$;

create or replace function public._log(p_booking uuid, p_kind text, p_detail jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into booking_events (booking_id, kind, detail, actor, actor_name)
  values (
    p_booking, p_kind, coalesce(p_detail, '{}'),
    auth.uid(),
    coalesce((select full_name from staff where user_id = auth.uid()), 'Guest (website)')
  );
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

-- Shared insert path for website and front-desk bookings. Price comes from
-- room_types here, never from the caller.
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
    v_room.price_bdt, v_room.price_bdt * v_nights * p_rooms
  )
  returning id into v_id;

  perform public._log(v_id, 'created', jsonb_build_object('source', p_source, 'status', p_status));
  return v_ref;
end;
$$;

-- Website bookings: always pending until the front desk confirms.
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
  -- Throttle repeated submissions for the same contact details.
  if (select count(*) from bookings
      where created_at > now() - interval '1 hour'
        and source = 'website'
        and (phone = trim(p_phone) or lower(email) = lower(trim(p_email)))) >= 3 then
    raise exception 'RATE_LIMITED';
  end if;

  return public._insert_booking(
    p_room_slug, p_check_in, p_check_out, p_rooms, p_adults, p_children,
    p_guest_name, p_email, p_phone, p_country, p_arrival_window,
    p_special_requests, p_airport_pickup, 'website', 'pending', null
  );
end;
$$;

-- Phone and walk-in bookings taken by staff.
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
  perform public._require_staff();
  if p_source not in ('phone', 'walk_in', 'other') or p_status not in ('pending', 'confirmed') then
    raise exception 'BAD_TRANSITION';
  end if;
  return public._insert_booking(
    p_room_slug, p_check_in, p_check_out, p_rooms, p_adults, p_children,
    p_guest_name, p_email, p_phone, p_country, null, p_special_requests,
    p_airport_pickup, p_source, p_status, p_internal_notes
  );
end;
$$;

-- Moves a booking along its lifecycle:
--   pending → confirmed | cancelled
--   confirmed → checked_in | cancelled | no_show
--   checked_in → checked_out
create or replace function public.admin_set_status(p_booking uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings%rowtype;
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
begin
  perform public._require_staff();
  select * into b from bookings where id = p_booking for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if not (
    (b.status = 'pending' and p_status in ('confirmed', 'cancelled')) or
    (b.status = 'confirmed' and p_status in ('checked_in', 'cancelled', 'no_show')) or
    (b.status = 'checked_in' and p_status = 'checked_out')
  ) then
    raise exception 'BAD_TRANSITION';
  end if;

  if p_status = 'checked_in' then
    if b.check_in > v_today then
      raise exception 'TOO_EARLY';
    end if;
    if b.rooms = 1 and b.room_id is null then
      raise exception 'ASSIGN_ROOM';
    end if;
  end if;
  if p_status = 'no_show' and b.check_in > v_today then
    raise exception 'TOO_EARLY';
  end if;

  update bookings set
    status = p_status,
    cancel_reason = case when p_status in ('cancelled', 'no_show') then nullif(trim(coalesce(p_reason, '')), '') else cancel_reason end,
    confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
    checked_in_at = case when p_status = 'checked_in' then now() else checked_in_at end,
    checked_out_at = case when p_status = 'checked_out' then now() else checked_out_at end,
    cancelled_at = case when p_status in ('cancelled', 'no_show') then now() else cancelled_at end
  where id = b.id;

  -- A departed room needs cleaning before the next guest.
  if p_status = 'checked_out' and b.room_id is not null then
    update rooms set housekeeping = 'dirty' where id = b.room_id;
  end if;

  perform public._log(b.id, 'status', jsonb_build_object('from', b.status, 'to', p_status, 'reason', p_reason));
end;
$$;

-- Gives a single-room booking a specific room (or clears it with null).
create or replace function public.admin_assign_room(p_booking uuid, p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings%rowtype;
  r rooms%rowtype;
begin
  perform public._require_staff();
  select * into b from bookings where id = p_booking for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if b.status not in ('pending', 'confirmed', 'checked_in') or b.rooms <> 1 then
    raise exception 'LOCKED';
  end if;

  if p_room is not null then
    select * into r from rooms where id = p_room;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    if r.room_type_id <> b.room_type_id then
      raise exception 'WRONG_ROOM_TYPE';
    end if;
    if r.out_of_service then
      raise exception 'ROOM_OUT_OF_SERVICE';
    end if;
  end if;

  begin
    update bookings set room_id = p_room where id = b.id;
  exception when exclusion_violation then
    raise exception 'ROOM_TAKEN';
  end;

  perform public._log(b.id, 'room', jsonb_build_object(
    'from', (select number from rooms where id = b.room_id),
    'to', r.number
  ));
end;
$$;

-- Changes dates, room type or party size, re-checking availability with the
-- booking's own units excluded. Keeps the agreed nightly rate unless the
-- room type changes.
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
  v_rate   integer;
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

  v_rate := case when v_type.id = b.room_type_id then b.nightly_rate_bdt else v_type.price_bdt end;
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
      total_bdt = v_rate * v_nights * p_rooms,
      payment_status = case
        when amount_paid_bdt = 0 then 'unpaid'
        when amount_paid_bdt >= v_rate * v_nights * p_rooms then 'paid'
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
                             'total', v_rate * v_nights * p_rooms)
  ));
end;
$$;

-- Records money received at the desk (cash, bKash, card terminal…).
-- Card numbers are never stored: only the amount, method and a short note.
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

-- Corrects guest contact details and staff notes.
create or replace function public.admin_update_guest_details(
  p_booking uuid, p_guest_name text, p_email text, p_phone text,
  p_arrival_window text, p_special_requests text, p_internal_notes text, p_airport_pickup boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_staff();
  update bookings set
    guest_name = trim(p_guest_name),
    email = nullif(lower(trim(coalesce(p_email, ''))), ''),
    phone = trim(p_phone),
    arrival_window = nullif(trim(coalesce(p_arrival_window, '')), ''),
    special_requests = nullif(trim(coalesce(p_special_requests, '')), ''),
    internal_notes = nullif(trim(coalesce(p_internal_notes, '')), ''),
    airport_pickup = coalesce(p_airport_pickup, false)
  where id = p_booking;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  perform public._log(p_booking, 'details', '{}');
end;
$$;

-- Internal helpers are never callable from the API.
revoke all on function public._free_units(uuid, date, date, uuid) from public, anon, authenticated;
revoke all on function public._log(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public._require_staff() from public, anon, authenticated;
revoke all on function public._insert_booking(text, date, date, integer, integer, integer, text, text, text, text, text, text, boolean, text, text, text) from public, anon, authenticated;

revoke all on function public.room_availability(date, date) from public;
revoke all on function public.create_booking(text, date, date, integer, integer, integer, text, text, text, text, text, text, boolean) from public;
grant execute on function public.room_availability(date, date) to anon, authenticated;
grant execute on function public.create_booking(text, date, date, integer, integer, integer, text, text, text, text, text, text, boolean) to anon, authenticated;

revoke all on function public.admin_create_booking(text, date, date, integer, integer, integer, text, text, text, text, text, text, boolean, text, text) from public, anon;
revoke all on function public.admin_set_status(uuid, text, text) from public, anon;
revoke all on function public.admin_assign_room(uuid, uuid) from public, anon;
revoke all on function public.admin_modify_booking(uuid, text, date, date, integer, integer, integer) from public, anon;
revoke all on function public.admin_record_payment(uuid, integer, text, text) from public, anon;
revoke all on function public.admin_update_guest_details(uuid, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_create_booking(text, date, date, integer, integer, integer, text, text, text, text, text, text, boolean, text, text) to authenticated;
grant execute on function public.admin_set_status(uuid, text, text) to authenticated;
grant execute on function public.admin_assign_room(uuid, uuid) to authenticated;
grant execute on function public.admin_modify_booking(uuid, text, date, date, integer, integer, integer) to authenticated;
grant execute on function public.admin_record_payment(uuid, integer, text, text) to authenticated;
grant execute on function public.admin_update_guest_details(uuid, text, text, text, text, text, text, boolean) to authenticated;

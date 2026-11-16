-- Managers set up the hotel from the admin: room numbers, room photos, and
-- policies that start blank instead of showing placeholder text.
--
-- Error codes raised (matched by the app): NOT_MANAGER, NO_ROOM, NOT_FOUND,
-- BAD_ROOM_NUMBER, ROOM_EXISTS, ROOM_IN_USE, ROOM_NEEDED.
--
-- Rollback: drop the three admin_*room functions and _type_still_fits; drop the
-- four "room photos" policies on storage.objects; delete bucket 'room-photos'
-- (after emptying it); reset the hotel_settings defaults.

/* ---------- Policies start blank ---------- */

alter table public.hotel_settings
  alter column cancellation_policy set default '',
  alter column children_policy set default '',
  alter column confirm_call_within set default '';

update public.hotel_settings set
  cancellation_policy = case when cancellation_policy = '[YOUR CANCELLATION POLICY]' then '' else cancellation_policy end,
  children_policy     = case when children_policy = '[YOUR POLICY & CHARGES]' then '' else children_policy end,
  confirm_call_within = case when confirm_call_within = '[X] hours' then '' else confirm_call_within end;

/* ---------- Room units ---------- */

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

-- True when every future night still has enough sellable rooms of the type
-- for the bookings already taken, after removing p_fewer units.
create or replace function public._type_still_fits(p_type uuid, p_fewer integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with today as (select (now() at time zone 'Asia/Dhaka')::date as d),
  last_night as (
    select max(b.check_out) - 1 as d from bookings b
    where b.room_type_id = p_type and b.status in ('pending', 'confirmed', 'checked_in')
  )
  select not exists (
    select 1
    from generate_series((select d from today), coalesce((select d from last_night), (select d from today) - 1), interval '1 day') as n
    where public._free_units(p_type, n::date, n::date + 1, null) - p_fewer < 0
  );
$$;

create or replace function public._clean_room_number(p_number text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := upper(trim(coalesce(p_number, '')));
begin
  if v !~ '^[A-Z0-9][A-Z0-9-]{0,9}$' then
    raise exception 'BAD_ROOM_NUMBER';
  end if;
  return v;
end;
$$;

create or replace function public.admin_add_room(p_number text, p_room_type uuid, p_floor text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public._require_manager();
  if not exists (select 1 from room_types where id = p_room_type) then
    raise exception 'NO_ROOM';
  end if;
  begin
    insert into rooms (number, room_type_id, floor)
    values (public._clean_room_number(p_number), p_room_type, nullif(left(trim(coalesce(p_floor, '')), 20), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'ROOM_EXISTS';
  end;
  return v_id;
end;
$$;

-- Renames a room, moves it to another type, or changes its floor. Moving a
-- room to another type is refused while it's assigned to a live booking, or
-- if its old type would then be oversold.
create or replace function public.admin_update_room_unit(p_room uuid, p_number text, p_room_type uuid, p_floor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r rooms%rowtype;
begin
  perform public._require_manager();
  select * into r from rooms where id = p_room for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if not exists (select 1 from room_types where id = p_room_type) then
    raise exception 'NO_ROOM';
  end if;

  if p_room_type <> r.room_type_id then
    perform 1 from room_types where id = r.room_type_id for update;
    if exists (select 1 from bookings where room_id = r.id and status in ('pending', 'confirmed', 'checked_in')) then
      raise exception 'ROOM_IN_USE';
    end if;
    if not r.out_of_service and not public._type_still_fits(r.room_type_id, 1) then
      raise exception 'ROOM_NEEDED';
    end if;
  end if;

  begin
    update rooms set
      number = public._clean_room_number(p_number),
      room_type_id = p_room_type,
      floor = nullif(left(trim(coalesce(p_floor, '')), 20), '')
    where id = r.id;
  exception when unique_violation then
    raise exception 'ROOM_EXISTS';
  end;
end;
$$;

-- Removes a room that has never been used. Rooms with booking history keep
-- it; take them out of service instead.
create or replace function public.admin_delete_room(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r rooms%rowtype;
begin
  perform public._require_manager();
  select * into r from rooms where id = p_room for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  perform 1 from room_types where id = r.room_type_id for update;
  if exists (select 1 from bookings where room_id = r.id) then
    raise exception 'ROOM_IN_USE';
  end if;
  if not r.out_of_service and not public._type_still_fits(r.room_type_id, 1) then
    raise exception 'ROOM_NEEDED';
  end if;
  delete from rooms where id = r.id;
end;
$$;

revoke all on function public._require_manager() from public, anon, authenticated;
revoke all on function public._type_still_fits(uuid, integer) from public, anon, authenticated;
revoke all on function public._clean_room_number(text) from public, anon, authenticated;
revoke all on function public.admin_add_room(text, uuid, text) from public, anon;
revoke all on function public.admin_update_room_unit(uuid, text, uuid, text) from public, anon;
revoke all on function public.admin_delete_room(uuid) from public, anon;
grant execute on function public.admin_add_room(text, uuid, text) to authenticated;
grant execute on function public.admin_update_room_unit(uuid, text, uuid, text) to authenticated;
grant execute on function public.admin_delete_room(uuid) to authenticated;

/* ---------- Room photos ---------- */

-- Public bucket: anyone can view the photos; only managers add or remove them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-photos', 'room-photos', true, 5242880, '{image/jpeg,image/png,image/webp}')
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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

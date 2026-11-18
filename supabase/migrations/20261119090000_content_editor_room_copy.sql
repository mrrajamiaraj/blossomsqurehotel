-- Content editors maintain how rooms are described and pictured (wording,
-- features, view, photo gallery) without being able to change what is sold
-- (name, beds, occupancy, prices, publishing), which stays with rooms.manage /
-- rates.manage.
--
-- Rollback:
--   drop function if exists public.admin_update_room_copy(uuid, text, text, text[], text);
--   drop function if exists public.admin_set_room_gallery(uuid, text[]);
--   drop function if exists public._require_room_copy();

create or replace function public._require_room_copy()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.has_permission('rooms.manage') then
    return;
  end if;
  perform public._require('content.manage');
end;
$$;

-- The marketing copy of a room type. Features: up to 16 non-empty lines of
-- up to 60 characters.
create or replace function public.admin_update_room_copy(p_type uuid, p_blurb text, p_description text, p_features text[], p_view text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_features text[] := array(
    select left(trim(f), 60) from unnest(coalesce(p_features, '{}')) with ordinality as x(f, n)
    where trim(f) <> '' order by n limit 16);
begin
  perform public._require_room_copy();
  if char_length(coalesce(p_blurb, '')) > 240 or char_length(coalesce(p_description, '')) > 1500 or char_length(coalesce(p_view, '')) > 40 then
    raise exception 'BAD_ROOM_DETAILS';
  end if;
  update room_types set
    blurb = trim(coalesce(p_blurb, '')),
    description = trim(coalesce(p_description, '')),
    features = v_features,
    view = trim(coalesce(p_view, ''))
  where id = p_type;
  if not found then
    raise exception 'NO_ROOM';
  end if;
end;
$$;

-- Reorders, removes or appends gallery photos. Every entry must already be in
-- the gallery, or be a fresh upload in this room type's folder of the public
-- room-photos bucket. At most 12.
create or replace function public.admin_set_room_gallery(p_type uuid, p_gallery text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text[];
  -- Duplicates removed, the caller's order kept.
  v_ordered text[] := array(select x.g from unnest(coalesce(p_gallery, '{}')) with ordinality as x(g, n)
                            group by x.g order by min(x.n));
  g text;
begin
  perform public._require_room_copy();
  select gallery into v_old from room_types where id = p_type for update;
  if not found then
    raise exception 'NO_ROOM';
  end if;
  if cardinality(v_ordered) > 12 then
    raise exception 'PHOTO_LIMIT';
  end if;
  foreach g in array v_ordered loop
    if not (g = any (coalesce(v_old, '{}'))
            or g ~ ('^https://[a-z0-9.-]+/storage/v1/object/public/room-photos/' || p_type::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')) then
      raise exception 'BAD_PHOTO';
    end if;
  end loop;
  update room_types set gallery = v_ordered where id = p_type;
  return v_ordered;
end;
$$;

revoke all on function public._require_room_copy() from public, anon, authenticated;
revoke all on function public.admin_update_room_copy(uuid, text, text, text[], text) from public, anon;
revoke all on function public.admin_set_room_gallery(uuid, text[]) from public, anon;
grant execute on function public.admin_update_room_copy(uuid, text, text, text[], text) to authenticated;
grant execute on function public.admin_set_room_gallery(uuid, text[]) to authenticated;

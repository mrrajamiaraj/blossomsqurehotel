-- ROLLBACK for 20261119100000_operational_hygiene.sql (and 20261119090000_content_editor_room_copy.sql below).
-- Run in one transaction. Data changes made by the tidy (duplicate tasks
-- cancelled, stale requests declined) are kept: they were wrong before.

drop trigger if exists rooms_status_closes_tasks on public.rooms;
drop function if exists public._room_status_closes_tasks();

-- The previous check-out behaviour (one new cleaning task per room, always).
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

-- 20261119090000_content_editor_room_copy (if rolling that back too):
-- drop function if exists public.admin_update_room_copy(uuid, text, text, text[], text);
-- drop function if exists public.admin_set_room_gallery(uuid, text[]);
-- drop function if exists public._require_room_copy();

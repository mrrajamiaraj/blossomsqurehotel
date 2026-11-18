-- Keeps operational lists true to what happened (found in end-to-end testing):
--
--   * A cancelled / no-show / checked-out booking closes its open guest
--     requests (a cancelled booking no longer shows a pending date change).
--   * Check-out creates a cleaning task only if the room has no open one
--     (repeat check-outs used to pile up duplicate tasks); an existing open
--     task becomes urgent instead.
--   * Marking a room clean / inspected on the board completes its open
--     cleaning (and, for inspected, inspection) tasks.
--   * Existing duplicate open cleaning tasks are tidied once (oldest kept).
--
-- Rollback: supabase/rollbacks/20261119100000_operational_hygiene.down.sql

create or replace function public._after_booking_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'checked_out' and old.status is distinct from 'checked_out' then
    -- Rooms that already have an open cleaning task: make it urgent.
    update housekeeping_tasks t set priority = 1, booking_id = coalesce(t.booking_id, new.id), updated_at = now()
    where t.kind = 'clean' and t.status in ('open', 'in_progress')
      and t.room_id in (select br.room_id from booking_rooms br where br.booking_id = new.id and br.room_id is not null);
    -- Others get a new one.
    insert into housekeeping_tasks (room_id, booking_id, kind, priority, created_by)
    select distinct br.room_id, new.id, 'clean', 1, auth.uid()
    from booking_rooms br
    where br.booking_id = new.id and br.room_id is not null
      and not exists (select 1 from housekeeping_tasks t where t.room_id = br.room_id and t.kind = 'clean' and t.status in ('open', 'in_progress'));
  end if;

  if new.status in ('cancelled', 'no_show', 'checked_out') and old.status is distinct from new.status then
    update booking_requests set
      status = case when kind = 'cancel' and new.status in ('cancelled', 'no_show') then 'done' else 'declined' end,
      handled_at = now(),
      handled_by = coalesce(auth.uid(), handled_by)
    where booking_id = new.id and status = 'open';
  end if;
  return new;
end;
$$;

-- Board status → tasks.
create or replace function public._room_status_closes_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.housekeeping in ('clean', 'inspected') and old.housekeeping is distinct from new.housekeeping then
    update housekeeping_tasks set status = 'done', completed_at = now(), updated_at = now(),
           assigned_to = coalesce(assigned_to, auth.uid())
    where room_id = new.id and status in ('open', 'in_progress')
      and (kind = 'clean' or (kind = 'inspect' and new.housekeeping = 'inspected'));
  end if;
  return null;
end;
$$;

create trigger rooms_status_closes_tasks after update of housekeeping on public.rooms
  for each row execute function public._room_status_closes_tasks();

revoke all on function public._room_status_closes_tasks() from public, anon, authenticated;

-- One-off tidy: keep the oldest open cleaning task per room.
update public.housekeeping_tasks t set status = 'cancelled', updated_at = now(),
       notes = left(coalesce(t.notes || ' · ', '') || 'Duplicate of an earlier cleaning task', 500)
where t.kind = 'clean' and t.status = 'open'
  and exists (select 1 from public.housekeeping_tasks o
              where o.room_id = t.room_id and o.kind = 'clean' and o.status in ('open', 'in_progress')
                and (o.created_at, o.id) < (t.created_at, t.id));

-- One-off tidy: open requests on bookings that are already closed.
update public.booking_requests r set status = 'declined', handled_at = now()
from public.bookings b
where b.id = r.booking_id and r.status = 'open' and b.status in ('cancelled', 'no_show', 'checked_out');

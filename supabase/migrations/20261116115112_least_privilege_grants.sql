-- Least-privilege table grants.
-- Supabase gives anon and authenticated every privilege on new public tables
-- and relies on RLS. RLS does not cover TRUNCATE, and defence in depth is
-- cheap, so grant only what the app uses. The service role is unaffected.
--
--   anon           reads published room types and the guest-facing settings;
--                  books only through create_booking() / room_availability().
--   authenticated  staff reads everything (RLS decides what), and updates
--                  room types, rooms and settings (RLS + triggers decide who).
--
-- Rollback: grant all on the tables below to anon, authenticated.

revoke all on public.room_types, public.rooms, public.bookings, public.booking_events,
              public.staff, public.hotel_settings, public.guest_summary
  from anon, authenticated;

grant select on public.room_types, public.hotel_settings to anon;

grant select on public.room_types, public.rooms, public.bookings, public.booking_events,
                public.staff, public.hotel_settings, public.guest_summary
  to authenticated;
grant update on public.room_types, public.rooms, public.hotel_settings to authenticated;

-- Pin search_path on the one helper that lacked it.
alter function public._is_weekend_night(date) set search_path = public;

-- (The guard_room_service() revoke was applied to production as its own
-- migration: 20261116115127_revoke_trigger_fn_execute.sql.)

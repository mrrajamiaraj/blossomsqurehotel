-- A trigger function; never callable through the API.
-- Applied to production separately from least_privilege_grants, so it is kept
-- as its own file to match the remote migration history exactly.
-- Rollback: grant execute on function public.guard_room_service() to authenticated;

revoke all on function public.guard_room_service() from public, anon, authenticated;

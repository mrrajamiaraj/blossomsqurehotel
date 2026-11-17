-- Staff-only: like the other admin_* functions, not callable by the anon role.
-- (It also checks _require_staff() itself.)
-- Rollback: grant execute on function public.admin_set_inquiry_status(uuid, text) to anon, public;
revoke execute on function public.admin_set_inquiry_status(uuid, text) from public, anon;
grant execute on function public.admin_set_inquiry_status(uuid, text) to authenticated;

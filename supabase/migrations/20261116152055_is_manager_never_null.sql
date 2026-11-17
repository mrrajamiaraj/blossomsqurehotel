-- is_manager() returned NULL (not false) for signed-in users with no staff
-- row, because staff_role() is NULL for them. In plpgsql, `if not NULL` is
-- skipped, so a guard written as `if not is_manager() then raise` would let
-- them through. RLS policies already treated NULL as false; this makes every
-- caller safe.
-- Rollback: restore the definition from 20261027000200_staff_and_access.sql.

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.staff_role() = 'manager', false);
$$;

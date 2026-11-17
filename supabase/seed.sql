-- LOCAL DEVELOPMENT SEED — runs only on `supabase db reset` / `supabase start`
-- against the LOCAL stack. It is never applied by `supabase db push` unless
-- you pass --include-seed, which you must not do against production.
--
-- The migrations already create the real room types (with authentic names,
-- rates and photo refs), the 12 rooms and the hotel_settings row, so the local
-- database mirrors production's catalogue without any extra data here.
--
-- To use the front desk locally:
--   1. Open local Studio (http://127.0.0.1:54323) → Authentication → Add user
--      (email + password, "auto confirm").
--   2. Run in the local SQL editor:
--        insert into public.staff (user_id, full_name, role)
--        select id, 'Local Manager', 'manager' from auth.users where email = 'you@local.test';
--
-- Add sample bookings below if a workflow needs them. Keep this file free of
-- real guest data.

select 1;

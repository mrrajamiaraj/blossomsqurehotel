-- One row per guest (by email, or phone when no email), for Admin → Guests.
-- security_invoker makes the view obey the caller's RLS on bookings, so only
-- staff see anything.
-- Rollback: drop view public.guest_summary;

create view public.guest_summary with (security_invoker = true) as
select
  coalesce(lower(b.email), b.phone)                                         as key,
  (array_agg(b.guest_name order by b.created_at desc))[1]                   as guest_name,
  (array_agg(b.email order by b.created_at desc) filter (where b.email is not null))[1] as email,
  (array_agg(b.phone order by b.created_at desc))[1]                        as phone,
  count(*) filter (where b.status in ('confirmed', 'checked_in', 'checked_out'))::integer as stays,
  coalesce(sum((b.check_out - b.check_in) * b.rooms)
           filter (where b.status in ('confirmed', 'checked_in', 'checked_out')), 0)::integer as nights,
  coalesce(sum(b.total_bdt) filter (where b.status in ('checked_in', 'checked_out')), 0)::integer as spend_bdt,
  max(b.check_in)                                                           as last_check_in,
  bool_or(b.status in ('pending', 'confirmed') and b.check_in >= (now() at time zone 'Asia/Dhaka')::date) as upcoming
from public.bookings b
group by coalesce(lower(b.email), b.phone);

revoke all on public.guest_summary from anon;
grant select on public.guest_summary to authenticated;

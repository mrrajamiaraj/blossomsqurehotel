-- Staff accounts (linked to Supabase Auth users) and row-level security.
-- Roles:  manager    — everything, including rates, rooms setup, policies and team
--         front_desk — reservations, guests, housekeeping
-- Rollback: drop the policies below, then drop functions is_manager, is_staff,
--           staff_role and table public.staff.

create table public.staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null check (char_length(full_name) between 2 and 80),
  role       text not null check (role in ('manager', 'front_desk')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.staff enable row level security;

create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from staff where user_id = auth.uid() and active;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.staff_role() is not null;
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.staff_role() = 'manager';
$$;

revoke all on function public.staff_role(), public.is_staff(), public.is_manager() from public, anon;
grant execute on function public.staff_role(), public.is_staff(), public.is_manager() to authenticated;

-- Staff: see your own row; managers see the team. Changes go through the
-- server (service role) so roles can't be self-assigned.
create policy "Staff read own row, managers read all"
  on public.staff for select to authenticated
  using (user_id = auth.uid() or public.is_manager());

-- Room types: staff see unpublished ones too; managers edit rates and copy.
create policy "Staff read all room types"
  on public.room_types for select to authenticated
  using (public.is_staff());
create policy "Managers update room types"
  on public.room_types for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- Rooms: staff read and update housekeeping / service status.
create policy "Staff read rooms"
  on public.rooms for select to authenticated
  using (public.is_staff());
create policy "Staff update rooms"
  on public.rooms for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Bookings and history: read-only to staff. Every change goes through the
-- admin_* functions so the lifecycle and audit trail can't be bypassed.
create policy "Staff read bookings"
  on public.bookings for select to authenticated
  using (public.is_staff());
create policy "Staff read booking events"
  on public.booking_events for select to authenticated
  using (public.is_staff());

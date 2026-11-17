-- Role-based access control for hotel staff.
--
-- Seven roles replace manager / front_desk. Each role carries a set of
-- permissions; every RLS policy and admin_* function checks a permission,
-- never a role name. Privileged roles must have signed in with a second
-- factor (aal2) before any permission applies.
--
--   role            rank  MFA   summary
--   owner            100  yes   everything; can appoint other owners
--   super_admin       90  yes   everything below owner
--   manager           70  yes   operations, rates, rooms, content, team below manager
--   finance           50  yes   payments, refunds, reports
--   receptionist      40  no    bookings, guests, payments at the desk, enquiries
--   content_editor    30  no    website content, media, reviews
--   housekeeping      20  no    housekeeping tasks and room status
--
-- Role tables live in schema `private`, which is not exposed through the
-- Data API. Staff rows change only through admin_*staff functions, which
-- refuse self-changes, enforce rank, and keep at least one active owner.
--
-- Error codes: NOT_STAFF, NOT_ALLOWED, MFA_REQUIRED, BAD_ROLE, RANK, SELF_CHANGE,
-- LAST_OWNER, NOT_FOUND.
--
-- Rollback (in order):
--   drop function public.admin_set_staff_role(uuid, text), public.admin_set_staff_active(uuid, boolean),
--     public.admin_upsert_staff(uuid, text, text), public.my_access(), public._require(text),
--     public.has_permission(text), public._role_rank(text), public._role_needs_mfa(text);
--   restore policies/functions from 20261116114855 / 20261116151700 / 20261117194739;
--   alter table public.staff drop constraint staff_role_fkey; update public.staff set role = 'front_desk'
--     where role <> 'manager'; alter table public.staff add constraint staff_role_check check (role in ('manager','front_desk'));
--   drop schema private cascade;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.roles (
  code         text primary key check (code ~ '^[a-z_]{3,30}$'),
  name         text not null,
  rank         integer not null unique check (rank between 1 and 100),
  requires_mfa boolean not null default false,
  description  text not null default ''
);

create table private.permissions (
  code        text primary key check (code ~ '^[a-z]+\.[a-z_]+$'),
  description text not null
);

create table private.role_permissions (
  role_code       text not null references private.roles (code) on delete cascade,
  permission_code text not null references private.permissions (code) on delete cascade,
  primary key (role_code, permission_code)
);

-- Not reachable through the API, but enabled anyway (defence in depth).
alter table private.roles enable row level security;
alter table private.permissions enable row level security;
alter table private.role_permissions enable row level security;

insert into private.roles (code, name, rank, requires_mfa, description) values
  ('owner',          'Owner',          100, true,  'Everything, including appointing owners'),
  ('super_admin',    'Super admin',     90, true,  'Everything below owner'),
  ('manager',        'Manager',         70, true,  'Operations, rates, rooms, content and team'),
  ('finance',        'Finance',         50, true,  'Payments, refunds and reports'),
  ('receptionist',   'Receptionist',    40, false, 'Bookings, guests, desk payments, enquiries'),
  ('content_editor', 'Content editor',  30, false, 'Website content, media and reviews'),
  ('housekeeping',   'Housekeeping',    20, false, 'Housekeeping tasks and room status');

insert into private.permissions (code, description) values
  ('bookings.read',      'See reservations and their history'),
  ('bookings.write',     'Create, change, assign and move reservations through their lifecycle'),
  ('guests.read',        'See guest profiles and contact details'),
  ('guests.write',       'Correct guest details'),
  ('payments.read',      'See payments and refunds'),
  ('payments.record',    'Record money received'),
  ('payments.void',      'Void a payment recorded in error'),
  ('refunds.request',    'Request a refund'),
  ('refunds.approve',    'Approve, reject and complete refunds'),
  ('rates.manage',       'Room prices, rate plans and seasonal prices'),
  ('rooms.manage',       'Room types, physical rooms, amenities and room images'),
  ('housekeeping.read',  'See housekeeping tasks and room status'),
  ('housekeeping.write', 'Update housekeeping tasks and room status'),
  ('maintenance.manage', 'Block rooms for maintenance'),
  ('inquiries.read',     'See website enquiries'),
  ('inquiries.manage',   'Handle website enquiries'),
  ('content.manage',     'Website content and media'),
  ('reviews.moderate',   'Approve, reject and add reviews'),
  ('promotions.manage',  'Promotions and offers'),
  ('settings.manage',    'Hotel settings and policies'),
  ('staff.read',         'See the team'),
  ('staff.manage',       'Add staff and change roles below your own'),
  ('audit.read',         'Read the audit log'),
  ('reports.read',       'Reports and exports'),
  ('documents.read',     'Open private guest documents'),
  ('documents.write',    'Upload private guest documents');

insert into private.role_permissions (role_code, permission_code)
select r.code, p.code from private.roles r cross join private.permissions p
where r.code in ('owner', 'super_admin');

insert into private.role_permissions (role_code, permission_code)
select 'manager', code from private.permissions where code <> 'refunds.approve';

insert into private.role_permissions (role_code, permission_code) values
  ('finance', 'bookings.read'), ('finance', 'guests.read'), ('finance', 'payments.read'),
  ('finance', 'payments.record'), ('finance', 'payments.void'), ('finance', 'refunds.request'),
  ('finance', 'refunds.approve'), ('finance', 'reports.read'),
  ('receptionist', 'bookings.read'), ('receptionist', 'bookings.write'), ('receptionist', 'guests.read'),
  ('receptionist', 'guests.write'), ('receptionist', 'payments.read'), ('receptionist', 'payments.record'),
  ('receptionist', 'refunds.request'), ('receptionist', 'housekeeping.read'), ('receptionist', 'housekeeping.write'),
  ('receptionist', 'inquiries.read'), ('receptionist', 'inquiries.manage'), ('receptionist', 'documents.read'),
  ('receptionist', 'documents.write'),
  ('content_editor', 'content.manage'), ('content_editor', 'reviews.moderate'),
  ('housekeeping', 'housekeeping.read'), ('housekeeping', 'housekeeping.write');

/* ---------- Staff profiles ---------- */

alter table public.staff drop constraint if exists staff_role_check;
update public.staff set role = 'receptionist' where role = 'front_desk';
alter table public.staff
  add constraint staff_role_fkey foreign key (role) references private.roles (code),
  add column if not exists email      text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column if not exists phone      text check (phone is null or char_length(phone) between 6 and 30),
  add column if not exists job_title  text check (job_title is null or char_length(job_title) <= 60),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

create index if not exists staff_role_idx on public.staff (role) where active;

/* ---------- Checks used by policies and functions ---------- */

create or replace function public._role_rank(p_role text)
returns integer language sql stable security definer set search_path = private as $$
  select rank from private.roles where code = p_role;
$$;

create or replace function public._role_needs_mfa(p_role text)
returns boolean language sql stable security definer set search_path = private as $$
  select coalesce((select requires_mfa from private.roles where code = p_role), true);
$$;

-- True when the caller is active staff, has the permission, and (for
-- privileged roles) signed in with a second factor in this session.
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.staff s
    join private.roles r on r.code = s.role
    join private.role_permissions rp on rp.role_code = s.role
    where s.user_id = auth.uid()
      and s.active
      and rp.permission_code = p_permission
      and (not r.requires_mfa or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
  );
$$;

-- Raises the precise reason a staff action is refused.
create or replace function public._require(p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_role text;
begin
  select s.role into v_role from public.staff s where s.user_id = auth.uid() and s.active;
  if v_role is null then
    raise exception 'NOT_STAFF';
  end if;
  if public._role_needs_mfa(v_role) and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'MFA_REQUIRED';
  end if;
  if not exists (select 1 from private.role_permissions where role_code = v_role and permission_code = p_permission) then
    raise exception 'NOT_ALLOWED';
  end if;
end;
$$;

-- Existing helpers keep their names (policies and functions use them) but now
-- respect MFA and the new roles.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = auth.uid() and s.active
      and (not public._role_needs_mfa(s.role) or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
  );
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_permission('settings.manage');
$$;

create or replace function public._require_staff()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.staff where user_id = auth.uid() and active) then
    raise exception 'NOT_STAFF';
  end if;
  if not public.is_staff() then
    raise exception 'MFA_REQUIRED';
  end if;
end;
$$;

create or replace function public._require_manager()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require('rooms.manage');
end;
$$;

-- What the signed-in user may do, for the admin UI (menus, MFA prompt).
-- The database still checks every action; this is for display only.
create or replace function public.my_access()
returns jsonb
language sql
stable
security definer
set search_path = public, private
as $$
  select case when s.user_id is null then jsonb_build_object('staff', false)
  else jsonb_build_object(
    'staff', true,
    'role', s.role,
    'role_name', r.name,
    'rank', r.rank,
    'requires_mfa', r.requires_mfa,
    'mfa_ok', (not r.requires_mfa or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'),
    'permissions', coalesce((select jsonb_agg(rp.permission_code order by rp.permission_code)
                              from private.role_permissions rp where rp.role_code = s.role), '[]'::jsonb)
  ) end
  from (select auth.uid() as uid) me
  left join public.staff s on s.user_id = me.uid and s.active
  left join private.roles r on r.code = s.role;
$$;

/* ---------- Changing staff (the only way) ---------- */

-- Adds or updates the staff row for an existing Auth user (created by the
-- server with the secret key after the same checks). Rank rules apply.
create or replace function public.admin_upsert_staff(p_user uuid, p_full_name text, p_role text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_me_rank integer;
  v_old     public.staff%rowtype;
begin
  perform public._require('staff.manage');
  if p_user = auth.uid() then
    raise exception 'SELF_CHANGE';
  end if;
  if not exists (select 1 from private.roles where code = p_role) then
    raise exception 'BAD_ROLE';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'NOT_FOUND';
  end if;
  select public._role_rank(role) into v_me_rank from public.staff where user_id = auth.uid();
  select * into v_old from public.staff where user_id = p_user for update;

  -- You can only appoint below your own rank (owners may appoint owners),
  -- and only change people currently below you.
  if (public._role_rank(p_role) >= v_me_rank and not (v_me_rank = 100 and p_role = 'owner'))
     or (v_old.user_id is not null and public._role_rank(v_old.role) >= v_me_rank and v_me_rank < 100) then
    raise exception 'RANK';
  end if;
  if v_old.role = 'owner' and p_role <> 'owner'
     and (select count(*) from public.staff where role = 'owner' and active) <= 1 then
    raise exception 'LAST_OWNER';
  end if;

  insert into public.staff (user_id, full_name, role, email, updated_by, updated_at)
  values (p_user, trim(p_full_name), p_role, (select email from auth.users where id = p_user), auth.uid(), now())
  on conflict (user_id) do update set
    full_name = excluded.full_name, role = excluded.role, updated_by = auth.uid(), updated_at = now();
end;
$$;

create or replace function public.admin_set_staff_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select full_name into v_name from public.staff where user_id = p_user;
  if v_name is null then
    raise exception 'NOT_FOUND';
  end if;
  perform public.admin_upsert_staff(p_user, v_name, p_role);
end;
$$;

create or replace function public.admin_set_staff_active(p_user uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_me_rank integer;
  v_target  public.staff%rowtype;
begin
  perform public._require('staff.manage');
  if p_user = auth.uid() then
    raise exception 'SELF_CHANGE';
  end if;
  select public._role_rank(role) into v_me_rank from public.staff where user_id = auth.uid();
  select * into v_target from public.staff where user_id = p_user for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if public._role_rank(v_target.role) >= v_me_rank and v_me_rank < 100 then
    raise exception 'RANK';
  end if;
  if v_target.role = 'owner' and not p_active
     and (select count(*) from public.staff where role = 'owner' and active) <= 1 then
    raise exception 'LAST_OWNER';
  end if;
  update public.staff set active = coalesce(p_active, false), updated_by = auth.uid(), updated_at = now()
  where user_id = p_user;
end;
$$;

/* ---------- Existing admin functions: permission instead of "any staff" ---------- */

-- Each function's first statement `perform public._require_staff();` becomes a
-- specific permission check. The rest of every body is unchanged. Each
-- rewrite is asserted to happen exactly once.
do $$
declare
  m record;
  v_def text;
  v_new text;
begin
  for m in
    select * from (values
      ('admin_create_booking',       'bookings.write'),
      ('admin_set_status',           'bookings.write'),
      ('admin_assign_room',          'bookings.write'),
      ('admin_modify_booking',       'bookings.write'),
      ('admin_record_payment',       'payments.record'),
      ('admin_update_guest_details', 'guests.write'),
      ('admin_set_inquiry_status',   'inquiries.manage')
    ) as t(fn, perm)
  loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = m.fn;
    if v_def is null then
      raise exception 'rbac: function % not found', m.fn;
    end if;
    v_new := replace(v_def, 'perform public._require_staff();', format('perform public._require(%L);', m.perm));
    if v_new = v_def or (length(v_def) - length(replace(v_def, 'perform public._require_staff();', ''))) <> length('perform public._require_staff();') then
      raise exception 'rbac: expected exactly one _require_staff() in %', m.fn;
    end if;
    execute v_new;
  end loop;
end;
$$;

-- Room status: housekeeping-level staff change cleaning status; taking a
-- room out of service (it changes what is sold) needs maintenance.manage,
-- renumbering or re-typing needs rooms.manage.
create or replace function public.guard_room_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if (new.number is distinct from old.number or new.room_type_id is distinct from old.room_type_id)
       and not public.has_permission('rooms.manage') then
      raise exception 'NOT_ALLOWED';
    end if;
    if new.out_of_service is distinct from old.out_of_service and not public.has_permission('maintenance.manage') then
      raise exception 'NOT_ALLOWED';
    end if;
    if new.housekeeping is distinct from old.housekeeping and not public.has_permission('housekeeping.write') then
      raise exception 'NOT_ALLOWED';
    end if;
  end if;
  return new;
end;
$$;

/* ---------- Policies on existing tables: permission-based ---------- */

drop policy if exists "Staff read own row, managers read all" on public.staff;
create policy "staff: own row, or staff.read"
  on public.staff for select to authenticated
  using (user_id = auth.uid() or public.has_permission('staff.read'));

drop policy if exists "Managers update room types" on public.room_types;
create policy "room types: rates.manage or rooms.manage update"
  on public.room_types for update to authenticated
  using (public.has_permission('rates.manage') or public.has_permission('rooms.manage'))
  with check (public.has_permission('rates.manage') or public.has_permission('rooms.manage'));

drop policy if exists "Staff update rooms" on public.rooms;
create policy "rooms: housekeeping, maintenance or rooms.manage update"
  on public.rooms for update to authenticated
  using (public.has_permission('housekeeping.write') or public.has_permission('maintenance.manage') or public.has_permission('rooms.manage'))
  with check (public.has_permission('housekeeping.write') or public.has_permission('maintenance.manage') or public.has_permission('rooms.manage'));

drop policy if exists "Staff read bookings" on public.bookings;
create policy "bookings: bookings.read"
  on public.bookings for select to authenticated
  using (public.has_permission('bookings.read'));

drop policy if exists "Staff read booking events" on public.booking_events;
create policy "booking events: bookings.read"
  on public.booking_events for select to authenticated
  using (public.has_permission('bookings.read'));

drop policy if exists "Managers update settings" on public.hotel_settings;
create policy "settings: settings.manage update"
  on public.hotel_settings for update to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));

drop policy if exists "staff read inquiries" on public.inquiries;
create policy "inquiries: inquiries.read"
  on public.inquiries for select to authenticated
  using (public.has_permission('inquiries.read'));

/* ---------- Grants ---------- */

revoke all on function public._role_rank(text), public._role_needs_mfa(text), public._require(text)
  from public, anon, authenticated;
revoke all on function public.has_permission(text), public.my_access() from public, anon;
grant execute on function public.has_permission(text), public.my_access() to authenticated;
revoke all on function public.admin_upsert_staff(uuid, text, text), public.admin_set_staff_role(uuid, text),
  public.admin_set_staff_active(uuid, boolean) from public, anon;
grant execute on function public.admin_upsert_staff(uuid, text, text), public.admin_set_staff_role(uuid, text),
  public.admin_set_staff_active(uuid, boolean) to authenticated;

-- Column-level writes: staff rows never change directly; rooms only in the
-- columns the desk and housekeeping use.
revoke insert, update, delete on public.staff from anon, authenticated;
revoke update on public.rooms from authenticated;
grant update (housekeeping, out_of_service, service_note) on public.rooms to authenticated;

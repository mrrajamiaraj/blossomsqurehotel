-- Physical rooms, reservations and their audit trail.
-- Rollback: drop table public.booking_events, public.bookings, public.rooms cascade;
--           (btree_gist can stay installed; it is harmless.)

-- Needed for the exclusion constraint that stops one room being given to
-- two overlapping stays. Supabase keeps extensions in the "extensions" schema.
create extension if not exists btree_gist with schema extensions;

create table public.rooms (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique,
  room_type_id   uuid not null references public.room_types (id) on delete restrict,
  floor          text,
  housekeeping   text not null default 'clean' check (housekeeping in ('clean', 'dirty', 'inspected')),
  out_of_service boolean not null default false,
  service_note   text check (char_length(service_note) <= 300),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index rooms_type_idx on public.rooms (room_type_id);
create trigger rooms_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();

insert into public.rooms (number, room_type_id, floor)
select v.number, rt.id, v.floor
from (values
  ('201', 'king-suite', '2nd'), ('202', 'king-suite', '2nd'),
  ('203', 'business-queen-suite', '2nd'), ('204', 'business-queen-suite', '2nd'),
  ('101', 'deluxe-couple', '1st'), ('102', 'deluxe-couple', '1st'), ('103', 'deluxe-couple', '1st')
) as v(number, slug, floor)
join public.room_types rt on rt.slug = v.slug;

create table public.bookings (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,
  room_type_id     uuid not null references public.room_types (id) on delete restrict,
  room_id          uuid references public.rooms (id) on delete set null,  -- assigned unit (single-room bookings)
  rooms            integer not null default 1 check (rooms between 1 and 5),
  check_in         date not null,
  check_out        date not null,
  adults           integer not null check (adults between 1 and 10),
  children         integer not null default 0 check (children between 0 and 10),
  guest_name       text not null check (char_length(guest_name) between 2 and 120),
  email            text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone            text not null check (char_length(phone) between 6 and 30),
  country          text,
  arrival_window   text,
  special_requests text check (char_length(special_requests) <= 1000),
  internal_notes   text check (char_length(internal_notes) <= 2000),
  airport_pickup   boolean not null default false,
  source           text not null default 'website' check (source in ('website', 'phone', 'walk_in', 'other')),
  nightly_rate_bdt integer not null check (nightly_rate_bdt > 0),
  total_bdt        integer not null check (total_bdt >= 0),
  amount_paid_bdt  integer not null default 0 check (amount_paid_bdt >= 0),
  payment_status   text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid')),
  status           text not null default 'pending'
                   check (status in ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
  cancel_reason    text check (char_length(cancel_reason) <= 300),
  confirmed_at     timestamptz,
  checked_in_at    timestamptz,
  checked_out_at   timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint stay_order check (check_out > check_in),
  constraint stay_length check (check_out - check_in <= 30),
  constraint assignment_single_room check (room_id is null or rooms = 1),
  -- The core double-booking guard: an assigned room can't hold two live stays at once.
  constraint no_overlapping_room exclude using gist (
    room_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (room_id is not null and status in ('pending', 'confirmed', 'checked_in'))
);

create index bookings_live_stay_idx on public.bookings (room_type_id, check_in, check_out)
  where status in ('pending', 'confirmed', 'checked_in');
create index bookings_check_in_idx on public.bookings (check_in);
create index bookings_created_idx on public.bookings (created_at desc);
create index bookings_phone_idx on public.bookings (phone);
create index bookings_email_idx on public.bookings (lower(email));

create trigger bookings_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

-- Who did what to a booking, and when.
create table public.booking_events (
  id          bigint generated always as identity primary key,
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  kind        text not null,
  detail      jsonb not null default '{}',
  actor       uuid,                -- auth user, null for the website
  actor_name  text not null,
  created_at  timestamptz not null default now()
);

create index booking_events_booking_idx on public.booking_events (booking_id, created_at desc);
create index booking_events_recent_idx on public.booking_events (created_at desc);

alter table public.rooms enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;
-- Policies are added with the staff table in the next migration. Until then
-- nobody but the service role can read these tables.

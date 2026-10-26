-- Room categories shown on the public site (Home, Rooms, Room detail) and
-- managed from the Admin front desk.
create table public.room_types (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  tag          text not null check (tag in ('SUITE', 'DELUXE')),
  bed          text not null,
  size_sqft    integer,                       -- null until the hotel confirms sizes
  sleeps       integer not null default 2,
  floor        text,
  price_bdt    integer not null check (price_bdt > 0),
  units        integer not null default 1,
  blurb        text not null,
  features     text[] not null default '{}',  -- short list for mobile cards
  photo_ref    text not null,                 -- placeholder label until real photos land
  sort_order   integer not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.room_types enable row level security;

create policy "Published room types are public"
  on public.room_types for select
  to anon, authenticated
  using (is_published);

insert into public.room_types
  (slug, name, tag, bed, floor, price_bdt, units, blurb, features, photo_ref, sort_order)
values
  ('king-suite', 'King Suite', 'SUITE', 'Double bed', '2nd floor', 12500, 2,
   'Our largest room on the second floor, with a private balcony looking out to the bay.',
   '{Double bed,Balcony,Sea view}', 'KING SUITE · DSC5566', 1),
  ('business-queen-suite', 'Business Queen Suite', 'SUITE', 'Queen bed', '2nd floor', 10500, 2,
   'A calm second-floor suite with a work desk, for trips that mix meetings and the beach.',
   '{Queen bed,Work desk,Sea view}', 'QUEEN SUITE · DSC5579', 2),
  ('deluxe-couple', 'Deluxe Couple', 'DELUXE', 'Double bed', 'Sea-facing', 7800, 3,
   'Everything you need for two: sea view, balcony, mini bar and breakfast included.',
   '{Double bed,Balcony,Sea view}', 'DELUXE COUPLE · DSC5550', 3);

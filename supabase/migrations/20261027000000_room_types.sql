-- Room categories shown on the public site and managed from Admin → Rooms & rates.
-- Rollback: drop table public.room_types cascade; drop function public.set_updated_at();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.room_types (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name         text not null,
  tag          text not null check (tag in ('SUITE', 'DELUXE')),
  bed          text not null,
  size_sqft    integer check (size_sqft > 0),       -- null until the hotel confirms sizes
  sleeps       integer not null default 2 check (sleeps > 0),
  floor        text not null,
  view         text not null default 'Sea',
  price_bdt    integer not null check (price_bdt > 0),
  blurb        text not null,
  description  text not null,
  features     text[] not null default '{}',
  gallery      text[] not null default '{}',         -- photo refs; first is the cover
  sort_order   integer not null default 0,
  is_published boolean not null default true,        -- "Bookable online"
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger room_types_updated_at before update on public.room_types
  for each row execute function public.set_updated_at();

alter table public.room_types enable row level security;

create policy "Published room types are public"
  on public.room_types for select
  to anon, authenticated
  using (is_published);

insert into public.room_types
  (slug, name, tag, bed, floor, price_bdt, blurb, description, features, gallery, sort_order)
values
  ('king-suite', 'King Suite', 'SUITE', 'Double bed', 'Second floor', 12500,
   'Our largest room, with a private balcony looking straight out over the Bay of Bengal.',
   'Our largest room. Wake up to the bay from bed, take coffee on the private balcony, and walk to the beach in minutes. Breakfast for two and pool access are included.',
   '{Double bed,Balcony,Sea view}', '{DSC5566,DSC5565,WA0013}', 1),
  ('business-queen-suite', 'Business Queen Suite', 'SUITE', 'Queen bed', 'Second floor', 10500,
   'A calm suite with room to work, for trips that mix meetings with an evening by the sea.',
   'A quiet second-floor suite with a proper work desk and fast Wi-Fi, for trips that mix meetings with an evening by the sea. Breakfast for two and pool access are included.',
   '{Queen bed,Work desk,Sea view}', '{DSC5579,DSC5578,WA0018}', 2),
  ('deluxe-couple', 'Deluxe Couple', 'DELUXE', 'Double bed', 'Sea-facing', 7800,
   'Everything you need for two: a sea view from bed, a balcony for sunset, a mini bar and breakfast downstairs.',
   'Everything you need for two: a sea view from bed, a balcony for sunset, a mini bar, and breakfast downstairs every morning. Pool access is included.',
   '{Double bed,Balcony,Sea view}', '{DSC5550,DSC5551,DSC5552}', 3);

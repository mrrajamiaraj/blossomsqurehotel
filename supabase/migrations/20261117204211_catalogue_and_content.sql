-- Catalogue, pricing structure, content, reviews and notifications.
--
--   amenities, room_type_amenities   what each room type offers
--   room_images                      ordered photos per room type (room-photos bucket)
--   rate_plans, seasonal_rates       pricing structure (see note below)
--   promotions                       public offers / codes (see note below)
--   event_inquiries                  event details attached to an enquiry
--   reviews                          moderated; only approved ones are public
--   site_content                     editable website copy (draft / published)
--   notifications                    per-staff inbox, filled by triggers
--
-- Pricing note: reservation totals are still computed by _stay_total() from
-- room_types prices. Rate plans, seasonal rates and promotions are stored and
-- protected here, but do NOT change any total until the booking functions
-- and the website quote are switched over together (next phase), so the
-- price a guest sees always equals the price they're charged.
--
-- Public (anon) reads: active amenities, images of published room types,
-- public rate plans, public active promotions, approved reviews, published
-- content. Everything else is staff-only by permission.
--
-- Error codes: NOT_ALLOWED, NOT_FOUND, BAD_INQUIRY, BAD_REVIEW, NOT_ELIGIBLE,
-- ALREADY_REVIEWED, RATE_LIMITED, BAD_TRANSITION.
--
-- Rollback: drop the functions and triggers below, then drop tables
-- notifications, site_content, reviews, event_inquiries, promotions,
-- seasonal_rates, rate_plans, room_images, room_type_amenities, amenities.

/* ================================================================ Amenities */

create table public.amenities (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name       text not null check (char_length(name) between 2 and 60),
  note       text check (note is null or char_length(note) <= 120),
  icon       text check (icon is null or char_length(icon) <= 400),
  category   text not null default 'room' check (category in ('room', 'hotel', 'dining', 'events')),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.room_type_amenities (
  room_type_id uuid not null references public.room_types (id) on delete cascade,
  amenity_id   uuid not null references public.amenities (id) on delete cascade,
  primary key (room_type_id, amenity_id)
);
create index room_type_amenities_amenity_idx on public.room_type_amenities (amenity_id);

insert into public.amenities (code, name, note, category, sort_order) values
  ('private_bathroom', 'Private bathroom', null, 'room', 1),
  ('air_conditioning', 'Air conditioning', null, 'room', 2),
  ('hot_water', 'Hot water', 'Geyser in every bathroom', 'room', 3),
  ('tv', 'TV', null, 'room', 4),
  ('work_desk', 'Work desk', null, 'room', 5),
  ('wifi', 'Wi-Fi', 'High-speed, free', 'hotel', 6),
  ('balcony', 'Balcony', null, 'room', 7),
  ('breakfast', 'Breakfast', 'Buffet, included', 'dining', 8),
  ('pool', 'Swimming pool', 'Open daily', 'hotel', 9),
  ('room_service', 'Room service', 'Twenty-four hours', 'dining', 10),
  ('parking', 'Parking', 'Free, on site', 'hotel', 11),
  ('airport_transfer', 'Airport transfers', 'On request, extra charge', 'hotel', 12)
on conflict (code) do nothing;

-- Link room types to the amenities already listed in their features.
insert into public.room_type_amenities (room_type_id, amenity_id)
select rt.id, a.id
from public.room_types rt
cross join lateral unnest(rt.features) f
join public.amenities a on a.code = case
  when f ilike '%bathroom%' then 'private_bathroom'
  when f ilike 'air%' then 'air_conditioning'
  when f ilike '%geyser%' or f ilike '%hot water%' then 'hot_water'
  when f = 'TV' then 'tv'
  when f ilike '%desk%' then 'work_desk'
  when f ilike '%wi-fi%' then 'wifi'
  when f ilike '%balcony%' then 'balcony'
end
on conflict do nothing;

/* ============================================================== Room images */

create table public.room_images (
  id           uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references public.room_types (id) on delete cascade,
  -- Object path in the public room-photos bucket, or a site path (/photos/…).
  path         text not null check (path ~ '^(room-types/[0-9a-f-]{36}/[A-Za-z0-9._-]+|/photos/[A-Za-z0-9._-]+)$'),
  alt          text not null check (char_length(alt) between 3 and 200),
  caption      text check (caption is null or char_length(caption) <= 200),
  sort_order   integer not null default 0,
  is_cover     boolean not null default false,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index room_images_one_cover on public.room_images (room_type_id) where is_cover;
create index room_images_type_idx on public.room_images (room_type_id, sort_order);

/* ================================================================ Pricing */

create table public.rate_plans (
  id                 uuid primary key default gen_random_uuid(),
  room_type_id       uuid not null references public.room_types (id) on delete cascade,
  code               text not null check (code ~ '^[A-Z0-9_]{2,20}$'),
  name               text not null check (char_length(name) between 2 and 80),
  description        text not null default '' check (char_length(description) <= 500),
  includes_breakfast boolean not null default true,
  refundable         boolean not null default true,
  min_nights         integer not null default 1 check (min_nights between 1 and 30),
  max_nights         integer not null default 30 check (max_nights between 1 and 30),
  is_public          boolean not null default true,
  is_active          boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (room_type_id, code),
  check (max_nights >= min_nights)
);

-- Every room type starts with its current price as the standard plan.
insert into public.rate_plans (room_type_id, code, name, description)
select id, 'STANDARD', 'Standard rate', 'Breakfast included. Pay at the hotel or send an advance.'
from public.room_types
on conflict (room_type_id, code) do nothing;

create table public.seasonal_rates (
  id                uuid primary key default gen_random_uuid(),
  room_type_id      uuid not null references public.room_types (id) on delete cascade,
  rate_plan_id      uuid references public.rate_plans (id) on delete cascade,
  name              text not null check (char_length(name) between 2 and 80),
  starts_on         date not null,
  ends_on           date not null,          -- exclusive: the first night not covered
  price_bdt         integer not null check (price_bdt > 0 and price_bdt <= 1000000),
  weekend_price_bdt integer check (weekend_price_bdt is null or (weekend_price_bdt > 0 and weekend_price_bdt <= 1000000)),
  is_active         boolean not null default true,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint seasonal_rates_dates check (ends_on > starts_on and ends_on - starts_on <= 366),
  -- One active price per room type (and plan) per night.
  constraint seasonal_rates_no_overlap exclude using gist (
    room_type_id with =,
    (coalesce(rate_plan_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    daterange(starts_on, ends_on, '[)') with &&
  ) where (is_active)
);
create index seasonal_rates_type_idx on public.seasonal_rates (room_type_id, starts_on);

create table public.promotions (
  id             uuid primary key default gen_random_uuid(),
  code           text unique check (code is null or code ~ '^[A-Z0-9]{3,20}$'),
  name           text not null check (char_length(name) between 2 and 80),
  description    text not null default '' check (char_length(description) <= 500),
  discount_type  text not null check (discount_type in ('percent', 'amount')),
  discount_value integer not null check (discount_value > 0),
  starts_on      date not null,
  ends_on        date not null,
  min_nights     integer not null default 1 check (min_nights between 1 and 30),
  room_type_ids  uuid[] not null default '{}',   -- empty = every room type
  is_public      boolean not null default true,
  is_active      boolean not null default false,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint promotions_dates check (ends_on > starts_on),
  constraint promotions_percent check (discount_type <> 'percent' or discount_value <= 90)
);
create index promotions_live_idx on public.promotions (starts_on, ends_on) where is_active and is_public;

alter table public.bookings
  add column if not exists rate_plan_id uuid references public.rate_plans (id) on delete set null,
  add column if not exists promotion_id uuid references public.promotions (id) on delete set null;

/* ========================================================= Event enquiries */

create table public.event_inquiries (
  inquiry_id uuid primary key references public.inquiries (id) on delete cascade,
  event_type text not null check (event_type in ('wedding', 'reception', 'conference', 'meeting', 'birthday', 'corporate', 'other')),
  space      text check (space is null or space in ('conference', 'banquet', 'restaurant', 'not_sure')),
  event_date date,
  guests     integer check (guests is null or guests between 1 and 2000),
  budget_bdt integer check (budget_bdt is null or budget_bdt between 0 and 100000000),
  catering   boolean not null default false,
  rooms_needed integer check (rooms_needed is null or rooms_needed between 0 and 200)
);

-- Event enquiry: stored with the general inbox (same throttling) plus details.
create or replace function public.submit_event_inquiry(
  p_name text, p_email text, p_phone text, p_message text, p_event_type text, p_space text,
  p_event_date date, p_guests integer, p_budget integer, p_catering boolean, p_rooms integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_id  uuid;
begin
  if p_event_type not in ('wedding', 'reception', 'conference', 'meeting', 'birthday', 'corporate', 'other')
     or (p_space is not null and p_space not in ('conference', 'banquet', 'restaurant', 'not_sure'))
     or (p_event_date is not null and p_event_date < (now() at time zone 'Asia/Dhaka')::date) then
    raise exception 'BAD_INQUIRY';
  end if;
  v_ref := public.submit_inquiry('event', p_name, p_email, p_phone, p_message, p_event_date, p_guests);
  select id into v_id from inquiries where reference = v_ref;
  insert into event_inquiries (inquiry_id, event_type, space, event_date, guests, budget_bdt, catering, rooms_needed)
  values (v_id, p_event_type, p_space, p_event_date, p_guests, p_budget, coalesce(p_catering, false), p_rooms);
  return v_ref;
end;
$$;

/* ================================================================ Reviews */

create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid unique references public.bookings (id) on delete set null,
  guest_id     uuid references public.guests (id) on delete set null,
  author_name  text not null check (char_length(author_name) between 2 and 80),
  rating       smallint check (rating is null or rating between 1 and 5),
  title        text check (title is null or char_length(title) <= 120),
  body         text not null check (char_length(body) between 10 and 3000),
  source       text not null check (source in ('website', 'google', 'booking_com', 'tripadvisor', 'facebook', 'other')),
  source_url   text check (source_url is null or source_url ~ '^https://'),
  stayed_on    date,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  moderated_by uuid references auth.users (id) on delete set null,
  moderated_at timestamptz,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  -- External reviews must say where they came from.
  constraint reviews_external_source check (source = 'website' or source_url is not null)
);
create index reviews_public_idx on public.reviews (created_at desc) where status = 'approved';

-- A guest reviews a completed stay: reference + the contact on the booking.
-- Always pending until moderated.
create or replace function public.submit_review(p_reference text, p_contact text, p_rating integer, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b        bookings%rowtype;
  v_ref    text := upper(trim(coalesce(p_reference, '')));
  v_c      text := lower(trim(coalesce(p_contact, '')));
  v_digits text := right(regexp_replace(coalesce(p_contact, ''), '\D', '', 'g'), 10);
begin
  if p_rating is null or p_rating not between 1 and 5 or char_length(trim(coalesce(p_body, ''))) not between 10 and 3000 then
    raise exception 'BAD_REVIEW';
  end if;
  if (select count(*) from booking_lookup_attempts where reference = v_ref and created_at > now() - interval '1 hour') >= 8 then
    raise exception 'RATE_LIMITED';
  end if;
  insert into booking_lookup_attempts (reference) values (v_ref);
  select * into b from bookings
  where reference = v_ref
    and ((email is not null and lower(email) = v_c)
         or (char_length(v_digits) >= 8 and right(regexp_replace(phone, '\D', '', 'g'), 10) = v_digits));
  if not found or b.status <> 'checked_out' then
    raise exception 'NOT_ELIGIBLE';
  end if;
  if exists (select 1 from reviews where booking_id = b.id) then
    raise exception 'ALREADY_REVIEWED';
  end if;
  insert into reviews (booking_id, guest_id, author_name, rating, title, body, source, stayed_on)
  values (b.id, b.guest_id, split_part(b.guest_name, ' ', 1), p_rating,
          nullif(left(trim(coalesce(p_title, '')), 120), ''), trim(p_body), 'website', b.check_in);
end;
$$;

create or replace function public.admin_moderate_review(p_review uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require('reviews.moderate');
  if p_status not in ('approved', 'rejected', 'pending') then
    raise exception 'BAD_TRANSITION';
  end if;
  update reviews set status = p_status, moderated_by = auth.uid(), moderated_at = now() where id = p_review;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
end;
$$;

-- An external review (Google, Booking.com…) copied in by staff, with its link.
create or replace function public.admin_add_review(
  p_author text, p_rating integer, p_title text, p_body text, p_source text, p_source_url text, p_stayed_on date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public._require('reviews.moderate');
  if p_source = 'website' or p_source_url is null then
    raise exception 'BAD_REVIEW';
  end if;
  insert into reviews (author_name, rating, title, body, source, source_url, stayed_on, status, created_by, moderated_by, moderated_at)
  values (trim(p_author), p_rating, nullif(trim(coalesce(p_title, '')), ''), trim(p_body), p_source, p_source_url, p_stayed_on,
          'pending', auth.uid(), null, null)
  returning id into v_id;
  return v_id;
end;
$$;

/* =========================================================== Site content */

create table public.site_content (
  key          text not null check (key ~ '^[a-z0-9_.-]{2,80}$'),
  locale       text not null default 'en' check (locale in ('en', 'bn')),
  title        text check (title is null or char_length(title) <= 200),
  body         jsonb not null default '{}'::jsonb,
  status       text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (key, locale)
);

create or replace function public._site_content_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  return new;
end;
$$;
create trigger site_content_stamp before insert or update on public.site_content
  for each row execute function public._site_content_stamp();

/* ========================================================== Notifications */

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  recipient  uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('booking', 'inquiry', 'payment', 'refund', 'housekeeping', 'review', 'system')),
  title      text not null check (char_length(title) <= 160),
  body       text check (body is null or char_length(body) <= 500),
  link       text check (link is null or link ~ '^/admin(/|$)'),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_inbox_idx on public.notifications (recipient, created_at desc);
create index notifications_unread_idx on public.notifications (recipient) where read_at is null;

-- Fans a notification out to every active staff member holding a permission.
create or replace function public._notify(p_permission text, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = public, private
as $$
  insert into notifications (recipient, kind, title, body, link)
  select s.user_id, p_kind, left(p_title, 160), left(p_body, 500), p_link
  from staff s join private.role_permissions rp on rp.role_code = s.role
  where s.active and rp.permission_code = p_permission;
$$;

create or replace function public._notify_new_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'website' then
    perform public._notify('bookings.write', 'booking', 'New booking request ' || new.reference,
      new.guest_name || ' · ' || to_char(new.check_in, 'DD Mon') || ' – ' || to_char(new.check_out, 'DD Mon'),
      '/admin/bookings/' || new.reference);
  end if;
  return null;
end;
$$;
create trigger bookings_notify after insert on public.bookings
  for each row execute function public._notify_new_booking();

create or replace function public._notify_new_inquiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._notify('inquiries.read', 'inquiry', 'New enquiry ' || new.reference, new.name || ': ' || left(new.message, 140), '/admin/inquiries');
  return null;
end;
$$;
create trigger inquiries_notify after insert on public.inquiries
  for each row execute function public._notify_new_inquiry();

create or replace function public._notify_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._notify('refunds.approve', 'refund', 'Refund to approve', '৳' || new.amount_bdt || ': ' || new.reason, '/admin/bookings');
  return null;
end;
$$;
create trigger refunds_notify after insert on public.refunds
  for each row execute function public._notify_refund();

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language sql
security definer
set search_path = public
as $$
  with u as (
    update notifications set read_at = now()
    where recipient = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids))
    returning 1
  )
  select count(*)::integer from u;
$$;

/* ================================================================ RLS */

alter table public.amenities enable row level security;
alter table public.room_type_amenities enable row level security;
alter table public.room_images enable row level security;
alter table public.rate_plans enable row level security;
alter table public.seasonal_rates enable row level security;
alter table public.promotions enable row level security;
alter table public.event_inquiries enable row level security;
alter table public.reviews enable row level security;
alter table public.site_content enable row level security;
alter table public.notifications enable row level security;

-- Public catalogue
create policy "amenities: public active" on public.amenities for select to anon, authenticated using (is_active);
create policy "amenities: rooms.manage reads all" on public.amenities for select to authenticated using (public.has_permission('rooms.manage'));
create policy "amenities: rooms.manage writes" on public.amenities for all to authenticated
  using (public.has_permission('rooms.manage')) with check (public.has_permission('rooms.manage'));

create policy "room type amenities: public" on public.room_type_amenities for select to anon, authenticated using (true);
create policy "room type amenities: rooms.manage writes" on public.room_type_amenities for all to authenticated
  using (public.has_permission('rooms.manage')) with check (public.has_permission('rooms.manage'));

create policy "room images: public for published types" on public.room_images for select to anon, authenticated
  using (exists (select 1 from public.room_types rt where rt.id = room_type_id and rt.is_published));
create policy "room images: staff read all" on public.room_images for select to authenticated using (public.is_staff());
create policy "room images: rooms or content writes" on public.room_images for all to authenticated
  using (public.has_permission('rooms.manage') or public.has_permission('content.manage'))
  with check (public.has_permission('rooms.manage') or public.has_permission('content.manage'));

create policy "rate plans: public active" on public.rate_plans for select to anon, authenticated using (is_public and is_active);
create policy "rate plans: staff read all" on public.rate_plans for select to authenticated using (public.is_staff());
create policy "rate plans: rates.manage writes" on public.rate_plans for all to authenticated
  using (public.has_permission('rates.manage')) with check (public.has_permission('rates.manage'));

create policy "seasonal rates: staff read" on public.seasonal_rates for select to authenticated using (public.is_staff());
create policy "seasonal rates: rates.manage writes" on public.seasonal_rates for all to authenticated
  using (public.has_permission('rates.manage')) with check (public.has_permission('rates.manage'));

create policy "promotions: public live" on public.promotions for select to anon, authenticated
  using (is_public and is_active and ends_on > (now() at time zone 'Asia/Dhaka')::date);
create policy "promotions: staff read all" on public.promotions for select to authenticated using (public.is_staff());
create policy "promotions: promotions.manage writes" on public.promotions for all to authenticated
  using (public.has_permission('promotions.manage')) with check (public.has_permission('promotions.manage'));

create policy "event inquiries: inquiries.read" on public.event_inquiries for select to authenticated
  using (public.has_permission('inquiries.read'));

create policy "reviews: approved are public" on public.reviews for select to anon, authenticated using (status = 'approved');
create policy "reviews: moderators read all" on public.reviews for select to authenticated using (public.has_permission('reviews.moderate'));

create policy "site content: published is public" on public.site_content for select to anon, authenticated using (status = 'published');
create policy "site content: editors read all" on public.site_content for select to authenticated using (public.has_permission('content.manage'));
create policy "site content: editors write" on public.site_content for all to authenticated
  using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));

create policy "notifications: own inbox" on public.notifications for select to authenticated using (recipient = auth.uid());

/* ================================================================ Grants */

revoke all on public.amenities, public.room_type_amenities, public.room_images, public.rate_plans,
  public.seasonal_rates, public.promotions, public.event_inquiries, public.reviews, public.site_content,
  public.notifications from anon, authenticated;

grant select on public.amenities, public.room_type_amenities, public.room_images, public.rate_plans,
  public.promotions, public.reviews, public.site_content to anon;
grant select on public.amenities, public.room_type_amenities, public.room_images, public.rate_plans,
  public.seasonal_rates, public.promotions, public.event_inquiries, public.reviews, public.site_content,
  public.notifications to authenticated;
-- Catalogue and content writes go through RLS (by permission). Reviews,
-- enquiries and notifications change only through functions.
grant insert, update, delete on public.amenities, public.room_type_amenities, public.room_images,
  public.rate_plans, public.seasonal_rates, public.promotions, public.site_content to authenticated;
-- Approved reviews are public, but who moderated them is not.
revoke select on public.reviews from anon;
grant select (id, author_name, rating, title, body, source, source_url, stayed_on, status, created_at) on public.reviews to anon;

revoke all on function public._site_content_stamp(), public._notify(text, text, text, text, text),
  public._notify_new_booking(), public._notify_new_inquiry(), public._notify_refund() from public, anon, authenticated;
revoke all on function public.submit_event_inquiry(text, text, text, text, text, text, date, integer, integer, boolean, integer),
  public.submit_review(text, text, integer, text, text) from public;
grant execute on function public.submit_event_inquiry(text, text, text, text, text, text, date, integer, integer, boolean, integer),
  public.submit_review(text, text, integer, text, text) to anon, authenticated;
revoke all on function public.admin_moderate_review(uuid, text),
  public.admin_add_review(text, integer, text, text, text, text, date),
  public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.admin_moderate_review(uuid, text),
  public.admin_add_review(text, integer, text, text, text, text, date),
  public.mark_notifications_read(uuid[]) to authenticated;

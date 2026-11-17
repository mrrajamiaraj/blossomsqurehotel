-- Guest-facing policies and tax settings, edited by managers in Admin → Settings.
-- Rollback: drop table public.hotel_settings;

create table public.hotel_settings (
  id                     smallint primary key default 1 check (id = 1),
  cancellation_policy    text not null default '[YOUR CANCELLATION POLICY]' check (char_length(cancellation_policy) <= 600),
  children_policy        text not null default '[YOUR POLICY & CHARGES]' check (char_length(children_policy) <= 600),
  confirm_call_within    text not null default '[X] hours' check (char_length(confirm_call_within) <= 40),
  vat_percent            numeric(5, 2) check (vat_percent between 0 and 50),       -- null: shown as "at check-in"
  service_charge_percent numeric(5, 2) check (service_charge_percent between 0 and 50),
  updated_at             timestamptz not null default now()
);

insert into public.hotel_settings (id) values (1);

create trigger hotel_settings_updated_at before update on public.hotel_settings
  for each row execute function public.set_updated_at();

alter table public.hotel_settings enable row level security;

create policy "Settings are public"
  on public.hotel_settings for select to anon, authenticated
  using (true);
create policy "Managers update settings"
  on public.hotel_settings for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

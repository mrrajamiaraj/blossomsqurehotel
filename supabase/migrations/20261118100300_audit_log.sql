-- Append-only audit log in schema `audit` (not exposed through the Data API).
--
-- A trigger records every insert / update / delete on the tables that carry
-- money, access, prices, inventory or public content: who (auth.uid() and
-- their role), when, what changed. Rows can't be updated or deleted by anyone
-- but a database superuser (a trigger refuses it, and no role has the grant).
-- Staff with audit.read see it through admin_audit_log().
--
-- Rollback: drop the audit_* triggers on the tables listed below;
--   drop function public.admin_audit_log(text, text, integer); drop schema audit cascade;

create schema if not exists audit;
revoke all on schema audit from public, anon, authenticated;

create table audit.logs (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  actor          uuid,
  actor_role     text,
  db_role        text not null default current_user,
  action         text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name     text not null,
  record_id      text,
  changed_fields text[],
  old_data       jsonb,
  new_data       jsonb
);
create index logs_record_idx on audit.logs (table_name, record_id, at desc);
create index logs_actor_idx on audit.logs (actor, at desc);
alter table audit.logs enable row level security;

create or replace function audit.capture()
returns trigger
language plpgsql
security definer
set search_path = audit, public
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_changed text[];
  v_id text;
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_new) k
    where v_new -> k is distinct from v_old -> k and k not in ('updated_at');
    if v_changed is null then
      return null;   -- nothing meaningful changed
    end if;
  end if;
  v_id := coalesce(v_new, v_old) ->> coalesce(tg_argv[0], 'id');
  insert into audit.logs (actor, actor_role, action, table_name, record_id, changed_fields, old_data, new_data)
  values (auth.uid(), (select role from public.staff where user_id = auth.uid()), tg_op, tg_table_name, v_id, v_changed, v_old, v_new);
  return null;
end;
$$;

create or replace function audit.refuse_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'AUDIT_IMMUTABLE';
end;
$$;

create trigger logs_immutable before update or delete on audit.logs
  for each row execute function audit.refuse_change();
create trigger logs_no_truncate before truncate on audit.logs
  for each statement execute function audit.refuse_change();

do $$
declare
  t record;
begin
  for t in select * from (values
    ('staff', 'user_id'), ('bookings', 'id'), ('payments', 'id'), ('refunds', 'id'),
    ('room_types', 'id'), ('rooms', 'id'), ('room_blocks', 'id'), ('rate_plans', 'id'),
    ('seasonal_rates', 'id'), ('promotions', 'id'), ('hotel_settings', 'id'),
    ('site_content', 'key'), ('reviews', 'id'), ('guests', 'id'), ('room_images', 'id')
  ) as x(tbl, pk)
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function audit.capture(%2$L)', t.tbl, t.pk);
  end loop;
end;
$$;

-- Reading the log: by table and record, newest first.
create or replace function public.admin_audit_log(p_table text default null, p_record text default null, p_limit integer default 100)
returns table (at timestamptz, actor uuid, actor_name text, actor_role text, action text, table_name text,
               record_id text, changed_fields text[], old_data jsonb, new_data jsonb)
language plpgsql
stable
security definer
set search_path = audit, public
as $$
begin
  perform public._require('audit.read');
  return query
    select l.at, l.actor, s.full_name, l.actor_role, l.action, l.table_name, l.record_id, l.changed_fields, l.old_data, l.new_data
    from audit.logs l left join public.staff s on s.user_id = l.actor
    where (p_table is null or l.table_name = p_table) and (p_record is null or l.record_id = p_record)
    order by l.at desc, l.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke all on all tables in schema audit from public, anon, authenticated, service_role;
revoke all on function audit.capture(), audit.refuse_change() from public, anon, authenticated;
revoke all on function public.admin_audit_log(text, text, integer) from public, anon;
grant execute on function public.admin_audit_log(text, text, integer) to authenticated;

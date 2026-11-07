-- =====================================================================
-- الجزء ح: المرحلة 11 الأساس — الروح المعنوية (sql/part-h-morale.sql)
-- Idempotent. شغّله في Supabase SQL Editor قبل رفع js/56.
-- 1) morale_settings: صف واحد (رسالة اليوم، الهدف الجماعي، تواريخ مميزة) — المدير يكتب والفريق يقرا.
-- 2) team_thanks: حيطة الشكر — الكتابة عن طريق send_thanks() فقط (مفيش insert مباشر).
-- 3) morale_state(): إعدادات + تقدم الهدف الجماعي (أرقام مجمّعة بس، بدون أسماء موظفين).
-- مفيش مراقبة ولا ترتيب بين الموظفين.
-- =====================================================================

create or replace function public.morale_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role(), '') in ('manager', 'staff')
$$;
revoke all on function public.morale_ok() from public, anon;
grant execute on function public.morale_ok() to authenticated;

-- 1) الإعدادات
create table if not exists public.morale_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  daily_message text check (daily_message is null or char_length(daily_message) <= 200),
  team_goal_target integer not null default 0 check (team_goal_target between 0 and 100000),
  goal_period text not null default 'day' check (goal_period in ('day', 'month')),
  special_dates jsonb not null default '[]'::jsonb
    check (jsonb_typeof(special_dates) = 'array' and pg_column_size(special_dates) <= 8000),
  updated_by uuid default (select auth.uid()),
  updated_at timestamptz not null default now()
);
insert into public.morale_settings (id) values (1) on conflict (id) do nothing;

alter table public.morale_settings enable row level security;
revoke all on table public.morale_settings from public, anon;
grant select, insert, update on table public.morale_settings to authenticated;

drop policy if exists ms_select on public.morale_settings;
create policy ms_select on public.morale_settings
  for select to authenticated using ((select public.morale_ok()));
drop policy if exists ms_write_mgr on public.morale_settings;
create policy ms_write_mgr on public.morale_settings
  for all to authenticated
  using ((select public.is_manager())) with check ((select public.is_manager()));

-- 2) حيطة الشكر
create table if not exists public.team_thanks (
  id bigint generated always as identity primary key,
  from_user uuid not null,
  from_name text not null,
  to_user uuid not null,
  to_name text not null,
  message text not null check (char_length(btrim(message)) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists team_thanks_created_idx on public.team_thanks (created_at desc);

alter table public.team_thanks enable row level security;
revoke all on table public.team_thanks from public, anon, authenticated;
grant select, delete on table public.team_thanks to authenticated;

drop policy if exists tt_select on public.team_thanks;
create policy tt_select on public.team_thanks
  for select to authenticated using ((select public.morale_ok()));
drop policy if exists tt_delete_mgr on public.team_thanks;
create policy tt_delete_mgr on public.team_thanks
  for delete to authenticated using ((select public.is_manager()));

-- زمايلي (بدون المنفذين الخارجيين وبدون نفسي)
create or replace function public.morale_colleagues()
returns table (id uuid, full_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.morale_ok() then raise exception 'staff only' using errcode = '42501'; end if;
  return query
    select p.id, coalesce(nullif(btrim(p.full_name), ''), 'موظف')
      from public.profiles p
      join public.user_roles r on r.user_id = p.id
     where r.role in ('manager', 'staff') and p.id <> (select auth.uid())
     order by 2;
end $$;
revoke all on function public.morale_colleagues() from public, anon;
grant execute on function public.morale_colleagues() to authenticated;

-- إرسال شكر: مش لنفسي، لزميل فعلي، وبحد 5 في اليوم
create or replace function public.send_thanks(p_to uuid, p_message text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_from text;
  v_to text;
  v_msg text := btrim(coalesce(p_message, ''));
  v_row public.team_thanks;
begin
  if v_uid is null or not public.morale_ok() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_to is null or p_to = v_uid then
    raise exception 'invalid recipient' using errcode = '22023';
  end if;
  if char_length(v_msg) not between 1 and 200 then
    raise exception 'message must be 1-200 chars' using errcode = '22023';
  end if;
  select coalesce(nullif(btrim(p.full_name), ''), 'موظف') into v_to
    from public.profiles p join public.user_roles r on r.user_id = p.id
   where p.id = p_to and r.role in ('manager', 'staff');
  if v_to is null then
    raise exception 'recipient not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.team_thanks
       where from_user = v_uid
         and created_at >= date_trunc('day', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo') >= 5 then
    raise exception 'daily limit reached' using errcode = '54000';
  end if;
  select coalesce(nullif(btrim(full_name), ''), 'موظف') into v_from from public.profiles where id = v_uid;
  insert into public.team_thanks (from_user, from_name, to_user, to_name, message)
  values (v_uid, coalesce(v_from, 'موظف'), p_to, v_to, v_msg)
  returning * into v_row;
  return to_jsonb(v_row);
end $$;
revoke all on function public.send_thanks(uuid, text) from public, anon;
grant execute on function public.send_thanks(uuid, text) to authenticated;

-- 3) إعدادات + تقدم الهدف الجماعي (أرقام مجمّعة فقط)
create or replace function public.morale_state()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.morale_settings;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_from date;
  v_done integer := 0;
begin
  if not public.morale_ok() then raise exception 'staff only' using errcode = '42501'; end if;
  select * into s from public.morale_settings where id = 1;
  if s.id is null or not s.enabled then
    return jsonb_build_object('enabled', false);
  end if;
  v_from := case when s.goal_period = 'month' then date_trunc('month', v_today)::date else v_today end;
  if s.team_goal_target > 0 then
    select count(*) into v_done from public.request_lines
     where deleted_at is null and delivered_date >= v_from and delivered_date <= v_today;
  end if;
  return jsonb_build_object(
    'enabled', true,
    'daily_message', s.daily_message,
    'special_dates', s.special_dates,
    'goal_target', s.team_goal_target,
    'goal_period', s.goal_period,
    'goal_done', v_done,
    'period_key', v_from::text,
    'today', v_today::text);
end $$;
revoke all on function public.morale_state() from public, anon;
grant execute on function public.morale_state() to authenticated;

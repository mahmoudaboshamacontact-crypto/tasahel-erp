-- =====================================================================
-- المرحلة 3 – أساس الاستقرار (sql/stability-1.sql)
-- قابل لإعادة التشغيل بأمان (Idempotent) في Supabase SQL Editor
-- 1) جدول error_log + قص تلقائي + فهرس created_at + RLS محكم
-- 2) جدولة مسح السجلات الأقدم من 30 يوم عبر pg_cron
-- 3) دالة get_system_status() للمدير فقط (SECURITY DEFINER + search_path = public)
-- =====================================================================

-- 1) إنشاء جدول error_log (وتحديث الأعمدة لو كان الجدول موجوداً من نسخة سابقة)
create table if not exists public.error_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  role text,
  message text,
  source text,
  line integer,
  col integer,
  tab text,
  app_version text,
  ua text
);

alter table public.error_log add column if not exists created_at timestamptz not null default now();
alter table public.error_log add column if not exists user_id uuid default auth.uid();
alter table public.error_log add column if not exists role text;
alter table public.error_log add column if not exists message text;
alter table public.error_log add column if not exists source text;
alter table public.error_log add column if not exists line integer;
alter table public.error_log add column if not exists col integer;
alter table public.error_log add column if not exists tab text;
alter table public.error_log add column if not exists app_version text;
alter table public.error_log add column if not exists ua text;

alter table public.error_log alter column created_at set default now();
alter table public.error_log alter column user_id set default auth.uid();

-- قص أي بيانات قديمة إن وجدت قبل تفعيل قيود الطول
update public.error_log
   set message = left(message, 300)
 where message is not null and char_length(message) > 300;

update public.error_log
   set ua = left(ua, 150)
 where ua is not null and char_length(ua) > 150;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'error_log_message_len_chk') then
    alter table public.error_log
      add constraint error_log_message_len_chk check (message is null or char_length(message) <= 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'error_log_ua_len_chk') then
    alter table public.error_log
      add constraint error_log_ua_len_chk check (ua is null or char_length(ua) <= 150);
  end if;
end $$;

-- Trigger خفيف لقص الرسالة (300 حرف) والـ UA (150 حرف) وتثبيت الهوية والدور من السيرفر
create or replace function public.trg_error_log_sanitize()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  if new.role is null or btrim(new.role) = '' then
    new.role := public.my_role();
  end if;
  if new.message is not null then
    new.message := left(new.message, 300);
  end if;
  if new.ua is not null then
    new.ua := left(new.ua, 150);
  end if;
  if new.created_at is null then
    new.created_at := now();
  end if;
  return new;
end $$;

drop trigger if exists error_log_sanitize_before_ins on public.error_log;
create trigger error_log_sanitize_before_ins
before insert on public.error_log
for each row execute function public.trg_error_log_sanitize();

-- 2) فهرس على created_at
create index if not exists error_log_created_at_idx on public.error_log (created_at desc);

-- 3) صلاحيات الجدول و RLS (مع (select auth.uid()) لتفادي initplan، وممنوع UPDATE)
alter table public.error_log enable row level security;

revoke all on table public.error_log from public, anon;
revoke update on table public.error_log from authenticated;
grant select, insert, delete on table public.error_log to authenticated;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
      from pg_policies
     where schemaname = 'public' and tablename = 'error_log'
  loop
    execute format('drop policy if exists %I on public.error_log', pol.policyname);
  end loop;
end $$;

-- INSERT: للمستخدم المسجّل فقط بشرط user_id = (select auth.uid()) (ومنع partner)
create policy error_log_insert_own
  on public.error_log
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and coalesce((select public.my_role()), '') <> 'partner'
  );

-- SELECT: للمدير فقط
create policy error_log_select_manager
  on public.error_log
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select public.my_role()) = 'manager'
  );

-- DELETE: للمدير فقط
create policy error_log_delete_manager
  on public.error_log
  for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select public.my_role()) = 'manager'
  );

-- منح صلاحية تسلسل الـ ID للمستخدمين المسجّلين (للإدخال)
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'error_log_id_seq') then
    grant usage, select on sequence public.error_log_id_seq to authenticated;
  end if;
end $$;

-- 4) حذف تلقائي للسجلات الأقدم من 30 يوم عن طريق pg_cron
do $$
declare
  jid bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for jid in
      select jobid from cron.job where jobname = 'error_log_cleanup_30d'
    loop
      perform cron.unschedule(jid);
    end loop;

    perform cron.schedule(
      'error_log_cleanup_30d',
      '0 3 * * *',
      $cmd$delete from public.error_log where created_at < now() - interval '30 days'$cmd$
    );
  end if;
end $$;

-- 5) دالة get_system_status() للمدير فقط
create or replace function public.get_system_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_db_bytes bigint;
  v_req_lines bigint := 0;
  v_err_log bigint := 0;
  v_aud_log bigint := 0;
  v_tx_cmts bigint := 0;
  v_msgs bigint := 0;
  v_errors_24h bigint := 0;
begin
  if (select auth.uid()) is null or coalesce(public.my_role(), '') <> 'manager' then
    raise exception 'forbidden: manager only' using errcode = '42501';
  end if;

  select pg_database_size(current_database()) into v_db_bytes;

  select coalesce(max(case when c.reltuples >= 0 then c.reltuples::bigint else coalesce(s.n_live_tup, 0) end), 0)
    into v_req_lines
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
   where n.nspname = 'public' and c.relname = 'request_lines';

  select coalesce(max(case when c.reltuples >= 0 then c.reltuples::bigint else coalesce(s.n_live_tup, 0) end), 0)
    into v_err_log
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
   where n.nspname = 'public' and c.relname = 'error_log';

  select coalesce(max(case when c.reltuples >= 0 then c.reltuples::bigint else coalesce(s.n_live_tup, 0) end), 0)
    into v_aud_log
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
   where n.nspname = 'public' and c.relname = 'audit_log';

  select coalesce(max(case when c.reltuples >= 0 then c.reltuples::bigint else coalesce(s.n_live_tup, 0) end), 0)
    into v_tx_cmts
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
   where n.nspname = 'public' and c.relname = 'tx_comments';

  select coalesce(max(case when c.reltuples >= 0 then c.reltuples::bigint else coalesce(s.n_live_tup, 0) end), 0)
    into v_msgs
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
   where n.nspname = 'public' and c.relname = 'messages';

  select count(*)
    into v_errors_24h
    from public.error_log
   where created_at >= now() - interval '24 hours';

  return jsonb_build_object(
    'db_size_bytes', coalesce(v_db_bytes, 0),
    'db_bytes', coalesce(v_db_bytes, 0),
    'errors_24h', coalesce(v_errors_24h, 0),
    'rows', jsonb_build_object(
      'request_lines', greatest(v_req_lines, 0),
      'error_log', greatest(v_err_log, v_errors_24h, 0),
      'audit_log', greatest(v_aud_log, 0),
      'tx_comments', greatest(v_tx_cmts, 0),
      'messages', greatest(v_msgs, 0)
    ),
    'request_lines', greatest(v_req_lines, 0),
    'error_log', greatest(v_err_log, v_errors_24h, 0),
    'audit_log', greatest(v_aud_log, 0),
    'tx_comments', greatest(v_tx_cmts, 0),
    'messages', greatest(v_msgs, 0)
  );
end $$;

revoke all on function public.get_system_status() from public, anon;
revoke all on function public.trg_error_log_sanitize() from public, anon;
grant execute on function public.get_system_status() to authenticated;

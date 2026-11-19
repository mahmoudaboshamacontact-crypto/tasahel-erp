-- =====================================================================
-- الجزء هـ: المرحلة 6 العملاء والنمو (21 حتى 30 — ما عدا 28 المفصولة للمراجعة الأمنية)
-- الملف: sql/part-e-clients-growth.sql
-- قابل لإعادة التشغيل بأمان (Idempotent). شغّله في Supabase SQL Editor قبل رفع js/54.
-- ملاحظة أمنية: لا يلمس سياسات allow_select_* أو staff_only أو no_partner_all على الجداول الحالية.
-- صفحة التتبع العامة بالرقم والكود (28) موجودة في ملف منفصل:
--   sql/part-e-public-tracking-28.sql (للمراجعة الأمنية من Claude قبل النشر).
-- =====================================================================

-- 1) تاريخ التجديد القادم على بنود الخدمات (21 — قايمة التجديدات القادمة)
alter table public.request_lines add column if not exists renewal_date date;

create index if not exists request_lines_renewal_date_idx
  on public.request_lines (renewal_date)
  where renewal_date is not null and deleted_at is null;

-- 2) جدول ملفات وتصنيفات وعلامات وملاحظات العملاء (22، 23)
create table if not exists public.client_profiles (
  id bigint generated always as identity primary key,
  client_key text not null unique check (char_length(btrim(client_key)) between 2 and 160),
  client_name text not null check (char_length(btrim(client_name)) between 1 and 160),
  phone text,
  tier text not null default 'عادي' check (tier in ('VIP', 'شركة', 'متكرر', 'عادي', 'تنبيه')),
  tags text[] not null default '{}',
  notes text,
  preferred_contact text default 'واتساب',
  updated_by uuid default auth.uid(),
  updated_by_name text,
  updated_at timestamptz not null default now()
);

create index if not exists client_profiles_tier_idx
  on public.client_profiles (tier);

alter table public.client_profiles enable row level security;
revoke all on table public.client_profiles from public, anon;
grant select, insert, update, delete on table public.client_profiles to authenticated;

drop policy if exists cp_select_staff on public.client_profiles;
create policy cp_select_staff on public.client_profiles
  for select to authenticated
  using ((select auth.uid()) is not null and (select public.is_staff()));

drop policy if exists cp_insert_staff on public.client_profiles;
create policy cp_insert_staff on public.client_profiles
  for insert to authenticated
  with check ((select auth.uid()) is not null and (select public.is_staff()));

drop policy if exists cp_update_staff on public.client_profiles;
create policy cp_update_staff on public.client_profiles
  for update to authenticated
  using ((select auth.uid()) is not null and (select public.is_staff()))
  with check ((select auth.uid()) is not null and (select public.is_staff()));

drop policy if exists cp_delete_mgr on public.client_profiles;
create policy cp_delete_mgr on public.client_profiles
  for delete to authenticated
  using ((select public.is_manager()));

-- 3) دالة دمج العملاء المكررين للمدير فقط (25)
create or replace function public.merge_duplicate_clients(
  p_target_name text,
  p_target_phone text,
  p_source_names text[],
  p_source_phones text[] default '{}'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cnt integer := 0;
begin
  if not public.is_manager() then
    raise exception 'manager only' using errcode = '42501';
  end if;
  if p_target_name is null or btrim(p_target_name) = '' then
    raise exception 'target client name required' using errcode = '22023';
  end if;

  update public.request_lines
     set client_name = btrim(p_target_name),
         phone = coalesce(nullif(btrim(coalesce(p_target_phone, '')), ''), phone)
   where deleted_at is null
     and (
       (p_source_names is not null and array_length(p_source_names, 1) > 0 and btrim(client_name) = any(p_source_names))
       or
       (p_source_phones is not null and array_length(p_source_phones, 1) > 0 and btrim(coalesce(phone, '')) = any(p_source_phones))
     );

  get diagnostics v_cnt = row_count;
  return v_cnt;
end $$;

revoke all on function public.merge_duplicate_clients(text, text, text[], text[]) from public, anon;
grant execute on function public.merge_duplicate_clients(text, text, text[], text[]) to authenticated;

-- 4) جدول سجل قائمة الاتصال اليومية (26)
create table if not exists public.daily_call_logs (
  id bigint generated always as identity primary key,
  call_date date not null default ((now() at time zone 'Africa/Cairo')::date),
  client_name text not null,
  phone text,
  transaction_id text,
  reason text not null default 'استلام جاهز',
  outcome text not null default 'تم التواصل',
  notes text,
  called_by uuid not null default auth.uid(),
  called_by_name text not null default 'موظف',
  created_at timestamptz not null default now()
);

create index if not exists daily_call_logs_date_idx
  on public.daily_call_logs (call_date desc);

alter table public.daily_call_logs enable row level security;
revoke all on table public.daily_call_logs from public, anon;
grant select, insert, update, delete on table public.daily_call_logs to authenticated;

drop policy if exists dcl_select_staff on public.daily_call_logs;
create policy dcl_select_staff on public.daily_call_logs
  for select to authenticated
  using ((select auth.uid()) is not null and (select public.is_staff()));

drop policy if exists dcl_insert_staff on public.daily_call_logs;
create policy dcl_insert_staff on public.daily_call_logs
  for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and called_by = (select auth.uid())
    and (select public.is_staff())
  );

drop policy if exists dcl_delete_mgr on public.daily_call_logs;
create policy dcl_delete_mgr on public.daily_call_logs
  for delete to authenticated
  using ((select public.is_manager()));

-- 5) جدول استبيان رضا العملاء (29)
create table if not exists public.client_satisfaction_surveys (
  id bigint generated always as identity primary key,
  transaction_id text not null unique,
  client_name text not null,
  phone text,
  score integer not null check (score between 1 and 5),
  comment text,
  recorded_by uuid default auth.uid(),
  recorded_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists client_satisfaction_surveys_at_idx
  on public.client_satisfaction_surveys (created_at desc);

alter table public.client_satisfaction_surveys enable row level security;
revoke all on table public.client_satisfaction_surveys from public, anon;
grant select, insert, update, delete on table public.client_satisfaction_surveys to authenticated;

drop policy if exists css_select_staff on public.client_satisfaction_surveys;
create policy css_select_staff on public.client_satisfaction_surveys
  for select to authenticated
  using ((select auth.uid()) is not null and (select public.is_staff()));

drop policy if exists css_insert_staff on public.client_satisfaction_surveys;
create policy css_insert_staff on public.client_satisfaction_surveys
  for insert to authenticated
  with check ((select auth.uid()) is not null and (select public.is_staff()));

drop policy if exists css_update_staff on public.client_satisfaction_surveys;
create policy css_update_staff on public.client_satisfaction_surveys
  for update to authenticated
  using ((select auth.uid()) is not null and (select public.is_staff()))
  with check ((select auth.uid()) is not null and (select public.is_staff()));

drop policy if exists css_delete_mgr on public.client_satisfaction_surveys;
create policy css_delete_mgr on public.client_satisfaction_surveys
  for delete to authenticated
  using ((select public.is_manager()));

-- =====================================================================
-- part-k-audit-history.sql | تساهيل ERP — سجل التغييرات الشامل (Change History)
-- ملف idempotent لتأكيد سلامة جدول ومؤشرات وسياسات سجل التغييرات
-- تشغيل يدوي من محمود في Supabase SQL Editor (اختياري / للتوثيق والتأكيد)
-- =====================================================================

-- 1. التأكد من وجود جدول audit_log وهيكله السليم
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamp with time zone default now() not null,
  user_id uuid,
  user_name text,
  action text not null,
  transaction_id text,
  line_id text,
  service text,
  details jsonb
);

-- 2. تفعيل RLS
alter table public.audit_log enable row level security;

-- 3. مؤشر البحث السريع حسب المعاملة والتاريخ
create index if not exists audit_log_tx_idx 
  on public.audit_log (transaction_id, at desc);

-- 4. سياسات الأمان للموظفين المصرح لهم
do $$
begin
  if not exists (
    select 1 from pg_policy 
    where polrelid = 'public.audit_log'::regclass 
      and polname = 'allow_authenticated_select_audit_log'
  ) then
    create policy allow_authenticated_select_audit_log 
      on public.audit_log for select 
      to authenticated 
      using (true);
  end if;

  if not exists (
    select 1 from pg_policy 
    where polrelid = 'public.audit_log'::regclass 
      and polname = 'allow_authenticated_insert_audit_log'
  ) then
    create policy allow_authenticated_insert_audit_log 
      on public.audit_log for insert 
      to authenticated 
      with check (true);
  end if;
end $$;

grant select, insert on public.audit_log to authenticated;

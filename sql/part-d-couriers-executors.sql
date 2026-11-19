-- =====================================================================
-- الجزء د: المرحلة 9 المناديب والمنفذين (41 حتى 50)
-- الملف: sql/part-d-couriers-executors.sql
-- قابل لإعادة التشغيل بأمان (Idempotent). شغّله في Supabase SQL Editor قبل رفع js/53.
-- ملاحظة أمنية: لا يلمس سياسات allow_select_* أو staff_only أو no_partner_all على الجداول الحالية.
-- =====================================================================

-- 1) جدول تأكيد التسليم للعميل (44)
create table if not exists public.delivery_confirmations (
  id bigint generated always as identity primary key,
  transaction_id text not null unique,
  courier_name text,
  received_by_name text not null check (char_length(btrim(received_by_name)) between 1 and 120),
  verify_code text,
  area text,
  notes text,
  confirmed_by uuid not null default auth.uid(),
  confirmed_by_name text not null default 'موظف',
  confirmed_at timestamptz not null default now()
);

create index if not exists delivery_confirmations_at_idx
  on public.delivery_confirmations (confirmed_at desc);

alter table public.delivery_confirmations enable row level security;
revoke all on table public.delivery_confirmations from public, anon;
grant select, insert, update, delete on table public.delivery_confirmations to authenticated;

drop policy if exists dc_select_staff on public.delivery_confirmations;
create policy dc_select_staff on public.delivery_confirmations
  for select to authenticated
  using ((select auth.uid()) is not null and (select public.is_staff()));

drop policy if exists dc_insert_staff on public.delivery_confirmations;
create policy dc_insert_staff on public.delivery_confirmations
  for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and confirmed_by = (select auth.uid())
    and (select public.is_staff())
  );

drop policy if exists dc_update_staff on public.delivery_confirmations;
create policy dc_update_staff on public.delivery_confirmations
  for update to authenticated
  using ((select auth.uid()) is not null and ((select public.is_manager()) or confirmed_by = (select auth.uid())))
  with check ((select auth.uid()) is not null and (select public.is_staff()));

drop policy if exists dc_delete_mgr on public.delivery_confirmations;
create policy dc_delete_mgr on public.delivery_confirmations
  for delete to authenticated
  using ((select public.is_manager()));

-- دالة تأكيد التسليم وتحويل بنود المعاملة إلى Delivered
create or replace function public.confirm_tx_delivery(
  p_tx text,
  p_received_by text,
  p_courier text default null,
  p_code text default null,
  p_area text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_uname text;
  v_row public.delivery_confirmations;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_tx is null or btrim(p_tx) = '' or p_received_by is null or btrim(p_received_by) = '' then
    raise exception 'transaction_id and received_by_name required' using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(full_name), ''), auth.jwt() ->> 'email', 'موظف')
    into v_uname
    from public.profiles
   where id = v_uid;

  insert into public.delivery_confirmations (
    transaction_id, courier_name, received_by_name, verify_code, area, notes, confirmed_by, confirmed_by_name, confirmed_at
  ) values (
    btrim(p_tx),
    nullif(btrim(coalesce(p_courier, '')), ''),
    btrim(p_received_by),
    nullif(btrim(coalesce(p_code, '')), ''),
    nullif(btrim(coalesce(p_area, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_uid,
    coalesce(v_uname, 'موظف'),
    now()
  )
  on conflict (transaction_id) do update
    set courier_name = excluded.courier_name,
        received_by_name = excluded.received_by_name,
        verify_code = excluded.verify_code,
        area = excluded.area,
        notes = excluded.notes,
        confirmed_by = excluded.confirmed_by,
        confirmed_by_name = excluded.confirmed_by_name,
        confirmed_at = now()
  returning * into v_row;

  update public.request_lines
     set delivered = true,
         complete = true,
         under_review = false,
         status = 'Delivered',
         delivered_date = coalesce(delivered_date, (now() at time zone 'Africa/Cairo')::date)
   where transaction_id = btrim(p_tx)
     and deleted_at is null;

  return to_jsonb(v_row);
end $$;

revoke all on function public.confirm_tx_delivery(text, text, text, text, text, text) from public, anon;
grant execute on function public.confirm_tx_delivery(text, text, text, text, text, text) to authenticated;

-- 2) جدول دفعات وسداد المنفذين وكشف حساب سعد (43)
create table if not exists public.executor_payments (
  id bigint generated always as identity primary key,
  executor_name text not null check (char_length(btrim(executor_name)) between 1 and 120),
  pay_date date not null default ((now() at time zone 'Africa/Cairo')::date),
  amount numeric not null check (amount > 0),
  method text not null default 'كاش',
  reference_note text,
  created_by uuid not null default auth.uid(),
  created_by_name text not null default 'المدير',
  created_at timestamptz not null default now()
);

create index if not exists executor_payments_exec_idx
  on public.executor_payments (executor_name, pay_date desc);

alter table public.executor_payments enable row level security;
revoke all on table public.executor_payments from public, anon;
grant select, insert, update, delete on table public.executor_payments to authenticated;

drop policy if exists ep_select_staff on public.executor_payments;
create policy ep_select_staff on public.executor_payments
  for select to authenticated
  using ((select auth.uid()) is not null and (select public.is_staff()));

drop policy if exists ep_write_mgr on public.executor_payments;
create policy ep_write_mgr on public.executor_payments
  for all to authenticated
  using ((select public.is_manager()))
  with check ((select public.is_manager()));

-- 3) جدول تقييم المنفذين الشهري (45)
create table if not exists public.executor_evaluations (
  id bigint generated always as identity primary key,
  executor_name text not null check (char_length(btrim(executor_name)) between 1 and 120),
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  quality_score numeric not null default 5 check (quality_score >= 1 and quality_score <= 5),
  notes text,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (executor_name, month)
);

alter table public.executor_evaluations enable row level security;
revoke all on table public.executor_evaluations from public, anon;
grant select, insert, update, delete on table public.executor_evaluations to authenticated;

drop policy if exists ee_select_staff on public.executor_evaluations;
create policy ee_select_staff on public.executor_evaluations
  for select to authenticated
  using ((select auth.uid()) is not null and (select public.is_staff()));

drop policy if exists ee_write_mgr on public.executor_evaluations;
create policy ee_write_mgr on public.executor_evaluations
  for all to authenticated
  using ((select public.is_manager()))
  with check ((select public.is_manager()));

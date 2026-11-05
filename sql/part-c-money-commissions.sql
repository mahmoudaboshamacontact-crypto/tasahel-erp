-- =====================================================================
-- الجزء ج: المرحلة 8 الفلوس والعمولات (31 حتى 40)
-- الملف: sql/part-c-money-commissions.sql
-- قابل لإعادة التشغيل بأمان (Idempotent). شغّله في Supabase SQL Editor قبل رفع js/52.
-- ملاحظة أمنية: لا يلمس سياسات allow_select_* أو staff_only أو no_partner_all على الجداول الحالية.
-- =====================================================================

-- 1) جدول موافقات الخصم الكبير (31 — النسبة الافتراضية 20%)
create table if not exists public.discount_approvals (
  id bigint generated always as identity primary key,
  transaction_id text not null,
  line_id bigint,
  client_name text,
  service text not null,
  qty numeric not null default 1,
  list_price numeric not null default 0,
  requested_discount_pct numeric not null check (requested_discount_pct > 0 and requested_discount_pct <= 100),
  requested_unit_price numeric not null default 0,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null default (select auth.uid()),
  requested_by_name text not null default 'موظف',
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

create index if not exists discount_approvals_status_idx
  on public.discount_approvals (status, created_at desc);
create index if not exists discount_approvals_tx_idx
  on public.discount_approvals (transaction_id);

create or replace function public.trg_discount_approval_requester()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then return new; end if;
  if tg_op = 'INSERT' then
    new.requested_by := v_uid;
    new.requested_by_name := coalesce(
      (select nullif(btrim(full_name), '') from public.profiles where id = v_uid),
      auth.jwt() ->> 'email',
      'موظف'
    );
    if not public.is_manager() then
      new.status := 'pending';
      new.decided_by := null;
      new.decided_by_name := null;
      new.decided_at := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists discount_approval_requester_trg on public.discount_approvals;
create trigger discount_approval_requester_trg
before insert on public.discount_approvals
for each row execute function public.trg_discount_approval_requester();

alter table public.discount_approvals enable row level security;
revoke all on table public.discount_approvals from public, anon;
grant select, insert, update, delete on table public.discount_approvals to authenticated;

drop policy if exists da_select_staff on public.discount_approvals;
create policy da_select_staff on public.discount_approvals
  for select to authenticated
  using (
    (select auth.uid()) is not null
    and ((select public.is_manager()) or requested_by = (select auth.uid()) or (select public.is_staff()))
  );

drop policy if exists da_insert_staff on public.discount_approvals;
create policy da_insert_staff on public.discount_approvals
  for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and requested_by = (select auth.uid())
    and (select public.is_staff())
  );

drop policy if exists da_update_mgr on public.discount_approvals;
create policy da_update_mgr on public.discount_approvals
  for update to authenticated
  using ((select public.is_manager()))
  with check ((select public.is_manager()));

drop policy if exists da_delete_mgr on public.discount_approvals;
create policy da_delete_mgr on public.discount_approvals
  for delete to authenticated
  using ((select public.is_manager()));

-- دالة اعتماد أو رفض الخصم الكبير للمدير فقط (تطبّق الخصم على request_lines عند الموافقة)
create or replace function public.decide_discount_approval(
  p_id bigint,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_mgr_name text;
  v_row public.discount_approvals;
  v_new_unit numeric;
begin
  if not public.is_manager() then
    raise exception 'manager only' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;

  select * into v_row from public.discount_approvals where id = p_id;
  if v_row.id is null then
    raise exception 'approval request not found' using errcode = 'P0002';
  end if;

  select coalesce(nullif(btrim(full_name), ''), auth.jwt() ->> 'email', 'المدير')
    into v_mgr_name
    from public.profiles
   where id = v_uid;

  update public.discount_approvals
     set status = p_decision,
         decided_by = v_uid,
         decided_by_name = coalesce(v_mgr_name, 'المدير'),
         decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id
   returning * into v_row;

  if p_decision = 'approved' then
    v_new_unit := case
      when coalesce(v_row.requested_unit_price, 0) > 0 then v_row.requested_unit_price
      else round(coalesce(v_row.list_price, 0) * (1 - coalesce(v_row.requested_discount_pct, 0) / 100.0), 2)
    end;

    if v_row.line_id is not null then
      update public.request_lines
         set discount_pct = v_row.requested_discount_pct,
             list_price = case when coalesce(list_price, 0) > 0 then list_price else v_row.list_price end,
             unit_price = v_new_unit
       where id = v_row.line_id
         and deleted_at is null;
    else
      update public.request_lines
         set discount_pct = v_row.requested_discount_pct,
             list_price = case when coalesce(list_price, 0) > 0 then list_price else v_row.list_price end,
             unit_price = v_new_unit
       where transaction_id = v_row.transaction_id
         and service = v_row.service
         and deleted_at is null;
    end if;
  end if;

  return to_jsonb(v_row);
end $$;

revoke all on function public.decide_discount_approval(bigint, text, text) from public, anon;
revoke all on function public.trg_discount_approval_requester() from public, anon;
grant execute on function public.decide_discount_approval(bigint, text, text) to authenticated;

-- 2) جدول مطابقة المحافظ وطرق الدفع اليومية (39) — صف واحد لكل طريقة دفع في اليوم
create table if not exists public.wallet_reconciliations (
  id bigint generated always as identity primary key,
  rec_date date not null default ((now() at time zone 'Africa/Cairo')::date),
  method text not null check (char_length(btrim(method)) between 1 and 60),
  system_amount numeric not null default 0,
  actual_amount numeric not null default 0,
  diff_amount numeric generated always as (actual_amount - system_amount) stored,
  notes text,
  updated_by uuid default (select auth.uid()),
  updated_by_name text,
  updated_at timestamptz not null default now(),
  unique (rec_date, method)
);

create index if not exists wallet_reconciliations_date_idx
  on public.wallet_reconciliations (rec_date desc);

alter table public.wallet_reconciliations enable row level security;
revoke all on table public.wallet_reconciliations from public, anon;
grant select, insert, update, delete on table public.wallet_reconciliations to authenticated;

drop policy if exists wr_select_staff on public.wallet_reconciliations;
create policy wr_select_staff on public.wallet_reconciliations
  for select to authenticated
  using ((select auth.uid()) is not null and (select public.is_staff()));

drop policy if exists wr_write_mgr on public.wallet_reconciliations;
create policy wr_write_mgr on public.wallet_reconciliations
  for all to authenticated
  using ((select public.is_manager()))
  with check ((select public.is_manager()));

-- 3) جدول إعدادات ومصاريف القسم الثابتة لصافي الربح ونسبة الخصم (40، 31)
create table if not exists public.finance_month_settings (
  month text primary key check (month ~ '^\d{4}-\d{2}$'),
  fixed_expenses numeric not null default 0,
  max_discount_pct numeric not null default 20 check (max_discount_pct >= 0 and max_discount_pct <= 100),
  target_margin_pct numeric not null default 35 check (target_margin_pct >= 5 and target_margin_pct <= 95),
  notes text,
  updated_by uuid default (select auth.uid()),
  updated_at timestamptz not null default now()
);

alter table public.finance_month_settings enable row level security;
revoke all on table public.finance_month_settings from public, anon;
grant select, insert, update, delete on table public.finance_month_settings to authenticated;

drop policy if exists fms_select_staff on public.finance_month_settings;
create policy fms_select_staff on public.finance_month_settings
  for select to authenticated
  using ((select auth.uid()) is not null and (select public.is_staff()));

drop policy if exists fms_write_mgr on public.finance_month_settings;
create policy fms_write_mgr on public.finance_month_settings
  for all to authenticated
  using ((select public.is_manager()))
  with check ((select public.is_manager()));

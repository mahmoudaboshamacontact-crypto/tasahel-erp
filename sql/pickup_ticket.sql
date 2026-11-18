-- =====================================================================
-- sql/pickup-ticket.sql (الدفعة 1: تيكت الاستلام المبدئي المعزول)
-- قابل لإعادة التشغيل (Idempotent) — يُشغّل يدوياً في Supabase SQL Editor
-- معزول تماماً عن جدول المعاملات و جدول التعليقات وحسابات الكاش والعمولات.
-- =====================================================================

-- 1) جدول تذاكر الاستلام المبدئية
create table if not exists public.pickup_tickets (
  id bigserial primary key,
  sd_request_id text not null,
  sd_service_id text,
  client_name text not null,
  phone text not null,
  address text,
  zone text,
  service_name text not null,
  qty integer not null default 1 check (qty >= 1 and qty <= 500),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  executor text,
  slot_pref text not null default 'صباحي' check (slot_pref in ('صباحي', 'مسائي', 'سفارة')),
  courier_id bigint references public.couriers(id) on delete set null,
  call_checks jsonb not null default '[]'::jsonb,
  summary_comment text,
  status text not null default 'open' check (status in ('open', 'with_courier', 'converted', 'cancelled')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pickup_tickets_sd_req_nonempty check (btrim(sd_request_id) <> ''),
  constraint pickup_tickets_client_nonempty check (btrim(client_name) <> ''),
  constraint pickup_tickets_phone_nonempty check (btrim(phone) <> ''),
  constraint pickup_tickets_service_nonempty check (btrim(service_name) <> '')
);

-- فهرس فريد مشروط لمنع تكرار نفس Request ID من سمارت ديسك (مع السماح بإعادة فتحه لو اتلغى)
create unique index if not exists pickup_tickets_sd_request_id_uq
  on public.pickup_tickets (sd_request_id)
  where sd_request_id is not null and sd_request_id <> '' and status <> 'cancelled';

create index if not exists pickup_tickets_courier_status_idx
  on public.pickup_tickets (courier_id, status, created_at desc);

-- 2) Trigger لحماية البيانات والحدود وتقييد التعديل بعد الإرسال أو التحويل
create or replace function public.trg_pickup_tickets_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.sd_request_id := btrim(coalesce(new.sd_request_id, ''));
  new.sd_service_id := nullif(btrim(coalesce(new.sd_service_id, '')), '');
  new.client_name := left(btrim(coalesce(new.client_name, '')), 160);
  new.phone := left(btrim(coalesce(new.phone, '')), 30);
  new.address := nullif(left(btrim(coalesce(new.address, '')), 400), '');
  new.zone := nullif(left(btrim(coalesce(new.zone, '')), 100), '');
  new.service_name := left(btrim(coalesce(new.service_name, '')), 200);
  new.summary_comment := nullif(left(btrim(coalesce(new.summary_comment, '')), 1500), '');

  if tg_op = 'INSERT' then
    new.total := round(coalesce(new.unit_price, 0) * coalesce(new.qty, 1), 2);
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'converted' then
      raise exception 'converted ticket cannot be modified' using errcode = '42501';
    end if;

    -- الموظف غير المدير يحدّث status و call_checks و summary_comment فقط (الأسعار لا تتغير بعد الإرسال)
    if not public.is_manager() then
      if new.sd_request_id is distinct from old.sd_request_id
         or new.sd_service_id is distinct from old.sd_service_id
         or new.client_name is distinct from old.client_name
         or new.phone is distinct from old.phone
         or new.address is distinct from old.address
         or new.zone is distinct from old.zone
         or new.service_name is distinct from old.service_name
         or new.qty is distinct from old.qty
         or new.unit_price is distinct from old.unit_price
         or new.total is distinct from old.total
         or new.executor is distinct from old.executor
         or new.slot_pref is distinct from old.slot_pref
         or new.courier_id is distinct from old.courier_id
         or new.created_by is distinct from old.created_by then
        raise exception 'staff can only update status, call_checks, or summary_comment' using errcode = '42501';
      end if;
    else
      new.total := round(coalesce(new.unit_price, 0) * coalesce(new.qty, 1), 2);
    end if;

    new.updated_at := now();
    return new;
  end if;

  return new;
end;
$$;

revoke all on function public.trg_pickup_tickets_guard() from public, anon, authenticated;

drop trigger if exists pickup_tickets_guard_trg on public.pickup_tickets;
create trigger pickup_tickets_guard_trg
  before insert or update on public.pickup_tickets
  for each row execute function public.trg_pickup_tickets_guard();

-- 3) تفعيل RLS وسياسات الأمان
alter table public.pickup_tickets enable row level security;

drop policy if exists courier_block on public.pickup_tickets;
create policy courier_block on public.pickup_tickets
  as restrictive for all to authenticated
  using (not (select public.is_courier()))
  with check (not (select public.is_courier()));

drop policy if exists pt_select_staff on public.pickup_tickets;
create policy pt_select_staff on public.pickup_tickets
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));

drop policy if exists pt_insert_staff on public.pickup_tickets;
create policy pt_insert_staff on public.pickup_tickets
  for insert to authenticated
  with check (
    ((select public.is_staff()) or (select public.is_manager()))
    and created_by = (select auth.uid())
    and status in ('open', 'with_courier')
  );

drop policy if exists pt_update_staff_or_mgr on public.pickup_tickets;
create policy pt_update_staff_or_mgr on public.pickup_tickets
  for update to authenticated
  using (
    ((select public.is_manager()) or ((select public.is_staff()) and created_by = (select auth.uid())))
    and status in ('open', 'with_courier')
  )
  with check (
    ((select public.is_manager()) or ((select public.is_staff()) and created_by = (select auth.uid())))
    and status in ('open', 'with_courier', 'cancelled')
  );

drop policy if exists pt_delete_mgr on public.pickup_tickets;
create policy pt_delete_mgr on public.pickup_tickets
  for delete to authenticated
  using ((select public.is_manager()) and status in ('open', 'with_courier'));

-- 4) دالة المندوب: يرجع تيكتاته النشطة فقط بدون أي أسعار أو إجمالي أو منفذ
drop function if exists public.courier_my_tickets();
create or replace function public.courier_my_tickets()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
begin
  if not public.is_courier() then
    raise exception 'courier only' using errcode = '42501';
  end if;

  select * into v_c
    from public.couriers
   where user_id = auth.uid()
     and active = true
   limit 1;

  if v_c.id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'sd_request_id', t.sd_request_id,
      'sd_service_id', t.sd_service_id,
      'client_name', t.client_name,
      'phone', t.phone,
      'address', t.address,
      'zone', t.zone,
      'service_name', t.service_name,
      'qty', t.qty,
      'slot_pref', t.slot_pref,
      'call_checks', t.call_checks,
      'summary_comment', t.summary_comment,
      'status', t.status,
      'created_at', t.created_at
    ) order by t.created_at desc)
    from public.pickup_tickets t
    where t.courier_id = v_c.id
      and t.status = 'with_courier'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.courier_my_tickets() from public, anon;
grant execute on function public.courier_my_tickets() to authenticated;
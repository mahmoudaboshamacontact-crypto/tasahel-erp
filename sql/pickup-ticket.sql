-- =====================================================================
-- sql/pickup-ticket.sql (الدفعة 1 الكاملة: تيكت الاستلام + ربط كتالوج الخدمات)
-- قابل لإعادة التشغيل بأمان (Idempotent) — يُشغّل يدوياً في Supabase SQL Editor
-- معزول تماماً عن حسابات الكاش والعمولات، ويدعم تعدد الخدمات وحالة الدفع والملاحظات والتحويل.
-- =====================================================================

-- 0) توسيع جدول الخدمات (كتالوج الخدمات) بخانات السكريبت ونقطة التسليم
alter table public.services add column if not exists script_notes text;
alter table public.services add column if not exists delivery_mode text not null default 'home';

alter table public.services drop constraint if exists services_delivery_mode_chk;
alter table public.services add constraint services_delivery_mode_chk
  check (delivery_mode in ('home', 'hub_abbasiya'));

alter table public.services drop constraint if exists services_script_notes_len_chk;
alter table public.services add constraint services_script_notes_len_chk
  check (char_length(coalesce(script_notes, '')) <= 800);

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
  slot_pref text not null default 'صباحي' check (slot_pref in ('صباحي', 'مسائي', 'بعد الظهر', 'سفارة')),
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

-- توسيع الجدول لو كان موجود من الدفعة الأولى (إضافة الأعمدة الجديدة بدون فقد بيانات)
alter table public.pickup_tickets add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.pickup_tickets add column if not exists payment_status text not null default 'paid';
alter table public.pickup_tickets add column if not exists collect_amount numeric(12,2) not null default 0;
alter table public.pickup_tickets add column if not exists staff_notes text;
alter table public.pickup_tickets add column if not exists converted_tx_id text;
alter table public.pickup_tickets add column if not exists converted_at timestamptz;
alter table public.pickup_tickets add column if not exists converted_by uuid;

alter table public.pickup_tickets drop constraint if exists pickup_tickets_slot_pref_check;
alter table public.pickup_tickets add constraint pickup_tickets_slot_pref_check
  check (slot_pref in ('صباحي', 'مسائي', 'بعد الظهر', 'سفارة'));

alter table public.pickup_tickets drop constraint if exists pickup_tickets_payment_status_chk;
alter table public.pickup_tickets add constraint pickup_tickets_payment_status_chk
  check (payment_status in ('paid', 'cod_cash', 'instapay_on_arrival'));

alter table public.pickup_tickets drop constraint if exists pickup_tickets_collect_amount_chk;
alter table public.pickup_tickets add constraint pickup_tickets_collect_amount_chk
  check (collect_amount >= 0);

-- فهرس فريد مشروط لمنع تكرار نفس Request ID من سمارت ديسك (مع السماح بإعادة فتحه لو اتلغى)
create unique index if not exists pickup_tickets_sd_request_id_uq
  on public.pickup_tickets (sd_request_id)
  where sd_request_id is not null and sd_request_id <> '' and status <> 'cancelled';

create index if not exists pickup_tickets_courier_status_idx
  on public.pickup_tickets (courier_id, status, created_at desc);

-- 2) Trigger لحماية البيانات والحدود وتقييد التعديل بعد التحويل
create or replace function public.trg_pickup_tickets_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items_total numeric(12,2);
begin
  new.sd_request_id := btrim(coalesce(new.sd_request_id, ''));
  new.sd_service_id := nullif(btrim(coalesce(new.sd_service_id, '')), '');
  new.client_name := left(btrim(coalesce(new.client_name, '')), 160);
  new.phone := left(btrim(coalesce(new.phone, '')), 30);
  new.address := nullif(left(btrim(coalesce(new.address, '')), 400), '');
  new.zone := nullif(left(btrim(coalesce(new.zone, '')), 100), '');
  new.service_name := left(btrim(coalesce(new.service_name, '')), 200);
  new.staff_notes := nullif(left(btrim(coalesce(new.staff_notes, '')), 800), '');
  new.summary_comment := nullif(left(btrim(coalesce(new.summary_comment, '')), 1800), '');
  if new.items is null or jsonb_typeof(new.items) <> 'array' then
    new.items := '[]'::jsonb;
  end if;

  if tg_op = 'INSERT' then
    if jsonb_array_length(new.items) > 0 then
      select coalesce(sum(
        greatest(0, coalesce((elem->>'unit_price')::numeric, 0)) *
        greatest(1, least(500, coalesce((elem->>'qty')::integer, 1)))
      ), 0)
      into v_items_total
      from jsonb_array_elements(new.items) as elem;
      new.total := round(v_items_total, 2);
    else
      new.total := round(coalesce(new.unit_price, 0) * coalesce(new.qty, 1), 2);
    end if;

    if new.payment_status = 'paid' then
      new.collect_amount := 0;
    else
      new.collect_amount := round(greatest(0, coalesce(nullif(new.collect_amount, 0), new.total)), 2);
    end if;

    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'converted' then
      raise exception 'converted ticket cannot be modified' using errcode = '42501';
    end if;

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
         or new.items is distinct from old.items
         or new.payment_status is distinct from old.payment_status
         or new.collect_amount is distinct from old.collect_amount
         or new.created_by is distinct from old.created_by then
        raise exception 'staff can only update status, notes, call_checks, or conversion fields' using errcode = '42501';
      end if;
    else
      if jsonb_array_length(new.items) > 0 then
        select coalesce(sum(
          greatest(0, coalesce((elem->>'unit_price')::numeric, 0)) *
          greatest(1, least(500, coalesce((elem->>'qty')::integer, 1)))
        ), 0)
        into v_items_total
        from jsonb_array_elements(new.items) as elem;
        new.total := round(v_items_total, 2);
      else
        new.total := round(coalesce(new.unit_price, 0) * coalesce(new.qty, 1), 2);
      end if;

      if new.payment_status = 'paid' then
        new.collect_amount := 0;
      end if;
    end if;

    if new.status = 'converted' and old.status <> 'converted' then
      new.converted_at := coalesce(new.converted_at, now());
      new.converted_by := coalesce(new.converted_by, auth.uid());
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
    and status in ('open', 'with_courier', 'converted', 'cancelled')
  );

drop policy if exists pt_delete_mgr on public.pickup_tickets;
create policy pt_delete_mgr on public.pickup_tickets
  for delete to authenticated
  using ((select public.is_manager()) and status in ('open', 'with_courier'));

-- 4) دالة المندوب: يرجع تيكتاته النشطة (بدون تكلفة أو عمولات أو منفذ، مع إظهار المبلغ المطلوب تحصيله فقط لو العميل غير دافع)
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
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'service_name', el->>'service_name',
          'doc_type', el->>'doc_type',
          'sd_service_id', el->>'sd_service_id',
          'qty', coalesce((el->>'qty')::integer, 1)
        ))
        from jsonb_array_elements(case when jsonb_typeof(t.items) = 'array' then t.items else '[]'::jsonb end) as el
      ), '[]'::jsonb),
      'payment_status', t.payment_status,
      'collect_amount', case when t.payment_status = 'paid' then 0 else coalesce(t.collect_amount, 0) end,
      'slot_pref', t.slot_pref,
      'staff_notes', t.staff_notes,
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

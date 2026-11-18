-- =====================================================================
-- sql/abbasiya-hub-radar.sql (المرحلة 2: رادار تسليم جوازات العباسية الفوري)
-- قابل لإعادة التشغيل بأمان (Idempotent) — يُشغّل يدوياً في Supabase SQL Editor
-- - لا يعدّل ولا يكتب أي بيانات في request_lines (قراءة فقط).
-- - RLS مفعّل على كل الجداول، وجميع التعديلات والاعتمادات تتم بالسيرفر فقط.
-- =====================================================================

-- 1) جدول دفعات تسليم نقطة تجمع جوازات العباسية
create table if not exists public.abbasiya_hub_batches (
  id bigserial primary key,
  batch_day date not null unique,
  hub_name text not null default 'أمام جوازات العباسية',
  courier_id bigint references public.couriers(id) on delete set null,
  courier_name text,
  window_start text not null,
  window_end text not null,
  status text not null default 'approved' check (status in ('approved', 'completed', 'cancelled')),
  notes text,
  approved_by uuid not null default auth.uid(),
  approved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint abbasiya_window_nonempty check (btrim(window_start) <> '' and btrim(window_end) <> '')
);

-- 2) جدول عملاء الدفعة وحالة تأكيد المكالمة مع كل عميل
create table if not exists public.abbasiya_hub_batch_items (
  id bigserial primary key,
  batch_id bigint not null references public.abbasiya_hub_batches(id) on delete cascade,
  line_id bigint not null references public.request_lines(id) on delete cascade,
  transaction_id text not null,
  client_name text not null,
  phone text,
  service_name text not null,
  call_confirmed boolean not null default false,
  call_confirmed_at timestamptz,
  call_confirmed_by uuid,
  call_note text,
  created_at timestamptz not null default now(),
  constraint abbasiya_batch_line_uq unique (batch_id, line_id)
);

create index if not exists abbasiya_items_batch_idx
  on public.abbasiya_hub_batch_items (batch_id, id);

-- 3) تفعيل RLS الصارم على كل جدول
alter table public.abbasiya_hub_batches enable row level security;
alter table public.abbasiya_hub_batch_items enable row level security;

-- منع المندوب من أي قراءة أو كتابة مباشرة على الجداول (المندوب يقرأ من RPC مخصص بدون أسعار)
drop policy if exists ahb_courier_block on public.abbasiya_hub_batches;
create policy ahb_courier_block on public.abbasiya_hub_batches
  as restrictive for all to authenticated
  using (not (select public.is_courier()))
  with check (not (select public.is_courier()));

drop policy if exists ahbi_courier_block on public.abbasiya_hub_batch_items;
create policy ahbi_courier_block on public.abbasiya_hub_batch_items
  as restrictive for all to authenticated
  using (not (select public.is_courier()))
  with check (not (select public.is_courier()));

-- قراءة فقط للموظفين والمدير (وكل تعديل/اعتماد يتم حصراً عبر الدوال SECURITY DEFINER)
drop policy if exists ahb_select_staff on public.abbasiya_hub_batches;
create policy ahb_select_staff on public.abbasiya_hub_batches
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));

drop policy if exists ahbi_select_staff on public.abbasiya_hub_batch_items;
create policy ahbi_select_staff on public.abbasiya_hub_batch_items
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));

-- 4) دالة لقطة الرادار: تقرأ المعاملات الجاهزة (قراءة فقط) + مقارنة خط سير المناديب + دفعة اليوم
drop function if exists public.abbasiya_hub_snapshot(date);
create or replace function public.abbasiya_hub_snapshot(
  p_day date default (now() at time zone 'Africa/Cairo')::date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Cairo')::date);
  v_candidates jsonb;
  v_couriers jsonb;
  v_batch jsonb;
  v_items jsonb;
begin
  if not (public.is_staff() or public.is_manager()) then
    raise exception 'staff or manager only' using errcode = '42501';
  end if;

  -- أ) معاملات العباسية/الجوازات الفوري المفتوحة (قراءة فقط من request_lines)
  select coalesce(jsonb_agg(jsonb_build_object(
    'line_id', l.id,
    'transaction_id', l.transaction_id,
    'client_name', l.client_name,
    'phone', l.phone,
    'service', l.service,
    'qty', l.qty,
    'executor', l.executor,
    'notes', l.notes,
    'received_at', l.received_at
  ) order by l.received_at asc, l.id asc), '[]'::jsonb)
  into v_candidates
  from public.request_lines l
  left join public.services s on public.norm_ar(s.name) = public.norm_ar(l.service)
  where l.deleted_at is null
    and coalesce(l.delivered, false) = false
    and (
      coalesce(s.delivery_mode, 'home') = 'hub_abbasiya'
      or l.service ilike '%جواز%فوري%'
      or l.service ilike '%عباسية%'
    );

  -- ب) حمل خط السير الفعلي لكل مندوب نشط (استلام + تسليم + آخر حركة على البوابة)
  select coalesce(jsonb_agg(jsonb_build_object(
    'courier_id', c.id,
    'name', c.name,
    'active_pickups', (
      select count(*) from public.pickup_tickets pt
      where pt.courier_id = c.id and pt.status = 'with_courier'
    ),
    'pending_deliveries', (
      select count(*) from public.courier_trips ct
      where public.norm_ar(ct.courier) = public.norm_ar(c.name)
        and ct.trip_day >= v_day - 7
        and ct.courier_confirmed_at is null
        and exists (
          select 1 from public.request_lines rl
          where rl.transaction_id = ct.transaction_id
            and rl.deleted_at is null
            and coalesce(rl.delivered, false) = false
        )
    ),
    'last_event_type', (
      select de.event_type from public.courier_dispatch_events de
      where de.courier_id = c.id
      order by de.created_at desc limit 1
    ),
    'last_event_at', (
      select de.created_at from public.courier_dispatch_events de
      where de.courier_id = c.id
      order by de.created_at desc limit 1
    )
  ) order by c.name), '[]'::jsonb)
  into v_couriers
  from public.couriers c
  where c.active = true;

  -- ج) دفعة اليوم المعتمدة إن وجدت
  select to_jsonb(b.*)
  into v_batch
  from public.abbasiya_hub_batches b
  where b.batch_day = v_day
    and b.status <> 'cancelled'
  limit 1;

  if v_batch is not null then
    select coalesce(jsonb_agg(to_jsonb(i.*) order by i.id asc), '[]'::jsonb)
    into v_items
    from public.abbasiya_hub_batch_items i
    where i.batch_id = (v_batch->>'id')::bigint;
  else
    v_items := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'day', v_day,
    'candidates', v_candidates,
    'couriers', v_couriers,
    'batch', v_batch,
    'items', v_items
  );
end;
$$;

revoke all on function public.abbasiya_hub_snapshot(date) from public, anon;
grant execute on function public.abbasiya_hub_snapshot(date) to authenticated;

-- 5) دالة اعتماد المندوب وميعاد العباسية (للمدير فقط)
drop function if exists public.abbasiya_hub_approve(date, bigint, text, text, bigint[], text);
create or replace function public.abbasiya_hub_approve(
  p_day date,
  p_courier_id bigint,
  p_window_start text,
  p_window_end text,
  p_line_ids bigint[],
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Cairo')::date);
  v_c public.couriers;
  v_ws text := left(btrim(coalesce(p_window_start, '')), 20);
  v_we text := left(btrim(coalesce(p_window_end, '')), 20);
  v_batch public.abbasiya_hub_batches;
  v_old public.abbasiya_hub_batches;
  v_cnt integer := 0;
begin
  if not public.is_manager() then
    raise exception 'manager only' using errcode = '42501';
  end if;

  if v_ws = '' or v_we = '' then
    raise exception 'window_start and window_end are required' using errcode = '22023';
  end if;

  if p_line_ids is null or array_length(p_line_ids, 1) is null or array_length(p_line_ids, 1) = 0 then
    raise exception 'select at least one transaction line' using errcode = '22023';
  end if;

  select * into v_c from public.couriers where id = p_courier_id and active = true limit 1;
  if v_c.id is null then
    raise exception 'active courier not found' using errcode = '22023';
  end if;

  -- دفعة اليوم قبل التعديل (لمعرفة لو المندوب أو الميعاد اتغيّروا)
  select * into v_old from public.abbasiya_hub_batches where batch_day = v_day limit 1;

  insert into public.abbasiya_hub_batches (
    batch_day, courier_id, courier_name, window_start, window_end, status, notes, approved_by, approved_at, updated_at
  ) values (
    v_day, v_c.id, v_c.name, v_ws, v_we, 'approved', nullif(left(btrim(coalesce(p_notes, '')), 500), ''), auth.uid(), now(), now()
  )
  on conflict (batch_day) do update set
    courier_id = excluded.courier_id,
    courier_name = excluded.courier_name,
    window_start = excluded.window_start,
    window_end = excluded.window_end,
    status = 'approved',
    notes = excluded.notes,
    approved_by = auth.uid(),
    approved_at = now(),
    updated_at = now()
  returning * into v_batch;

  -- لو المندوب أو الميعاد اتغيّروا: تأكيدات المكالمات القديمة تتلغي (العميل اتبلّغ بميعاد تاني)
  if v_old.id is not null and (
       v_old.courier_id is distinct from v_batch.courier_id
    or v_old.window_start is distinct from v_batch.window_start
    or v_old.window_end is distinct from v_batch.window_end
  ) then
    update public.abbasiya_hub_batch_items
       set call_confirmed = false, call_confirmed_at = null, call_confirmed_by = null
     where batch_id = v_batch.id;
  end if;

  -- حذف أي بند لم يعد مختاراً في دفعة اليوم، وإضافة المختارين من request_lines
  delete from public.abbasiya_hub_batch_items
   where batch_id = v_batch.id
     and not (line_id = any(p_line_ids));

  insert into public.abbasiya_hub_batch_items (
    batch_id, line_id, transaction_id, client_name, phone, service_name
  )
  select
    v_batch.id,
    l.id,
    coalesce(l.transaction_id, ''),
    coalesce(l.client_name, 'عميل'),
    l.phone,
    coalesce(l.service, 'جواز سفر فوري')
  from public.request_lines l
  where l.id = any(p_line_ids)
    and l.deleted_at is null
    and coalesce(l.delivered, false) = false
  on conflict (batch_id, line_id) do nothing;

  select count(*) into v_cnt from public.abbasiya_hub_batch_items where batch_id = v_batch.id;
  if v_cnt = 0 then
    raise exception 'no eligible open lines found' using errcode = '22023';
  end if;

  return to_jsonb(v_batch);
end;
$$;

revoke all on function public.abbasiya_hub_approve(date, bigint, text, text, bigint[], text) from public, anon;
grant execute on function public.abbasiya_hub_approve(date, bigint, text, text, bigint[], text) to authenticated;

-- 6) دالة تسجيل تأكيد المكالمة مع العميل (للموظفين والمدير)
drop function if exists public.abbasiya_hub_mark_called(bigint, boolean, text);
create or replace function public.abbasiya_hub_mark_called(
  p_item_id bigint,
  p_called boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.abbasiya_hub_batch_items;
begin
  if not (public.is_staff() or public.is_manager()) then
    raise exception 'staff or manager only' using errcode = '42501';
  end if;

  update public.abbasiya_hub_batch_items
     set call_confirmed = coalesce(p_called, false),
         call_confirmed_at = case when coalesce(p_called, false) then now() else null end,
         call_confirmed_by = case when coalesce(p_called, false) then auth.uid() else null end,
         call_note = nullif(left(btrim(coalesce(p_note, call_note, '')), 300), '')
   where id = p_item_id
     and exists (
       select 1 from public.abbasiya_hub_batches b
        where b.id = abbasiya_hub_batch_items.batch_id and b.status = 'approved'
     )
   returning * into v_row;

  if v_row.id is null then
    raise exception 'batch item not found or batch not approved' using errcode = 'P0002';
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.abbasiya_hub_mark_called(bigint, boolean, text) from public, anon;
grant execute on function public.abbasiya_hub_mark_called(bigint, boolean, text) to authenticated;

-- 7) دالة المندوب: يرجع كارت محطة جوازات العباسية الخاصة به فقط (بدون أي أسعار أو تكاليف أو عمولات)
drop function if exists public.courier_my_abbasiya_hub(date);
create or replace function public.courier_my_abbasiya_hub(
  p_day date default (now() at time zone 'Africa/Cairo')::date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Cairo')::date);
  v_c public.couriers;
  v_b public.abbasiya_hub_batches;
  v_items jsonb;
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
    return null;
  end if;

  select * into v_b
    from public.abbasiya_hub_batches
   where batch_day = v_day
     and courier_id = v_c.id
     and status = 'approved'
   limit 1;

  if v_b.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'transaction_id', i.transaction_id,
    'client_name', i.client_name,
    'phone', i.phone,
    'service_name', i.service_name,
    'call_confirmed', i.call_confirmed,
    'call_note', i.call_note
  ) order by i.id asc), '[]'::jsonb)
  into v_items
  from public.abbasiya_hub_batch_items i
  where i.batch_id = v_b.id;

  return jsonb_build_object(
    'batch_id', v_b.id,
    'batch_day', v_b.batch_day,
    'hub_name', v_b.hub_name,
    'window_start', v_b.window_start,
    'window_end', v_b.window_end,
    'notes', v_b.notes,
    'items', v_items
  );
end;
$$;

revoke all on function public.courier_my_abbasiya_hub(date) from public, anon;
grant execute on function public.courier_my_abbasiya_hub(date) to authenticated;

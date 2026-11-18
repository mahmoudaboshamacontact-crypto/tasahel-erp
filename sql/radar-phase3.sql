-- =====================================================================
-- sql/radar-phase3.sql (المرحلة 3: الرادار الحي، خطوط المناطق، سفارة الإمارات،
-- عداد الكاش، الإنقاذ الطارئ، المتأخرات، والنداء العام)
-- قابل لإعادة التشغيل بأمان (Idempotent) — يُشغّل يدوياً في Supabase SQL Editor
-- - لا يكتب ولا يعدّل في request_lines (قراءة فقط).
-- - RLS مفعّل على كل جدول جديد، وكل الدوال SECURITY DEFINER مع التحقق من الدور.
-- =====================================================================

-- 1) جدول خطوط ومناطق المناديب (مفتوح للمدير لتعيين خط أو أكتر لكل مندوب)
create table if not exists public.courier_zone_routes (
  courier_id bigint primary key references public.couriers(id) on delete cascade,
  route_keys text[] not null default '{}',
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

-- 2) جدول إعدادات الرادار (وضع الذروة والمطر +25% ETA)
create table if not exists public.radar_settings (
  key text primary key,
  val jsonb not null default '{}'::jsonb,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

insert into public.radar_settings (key, val)
values ('rush_mode', '{"enabled": false, "pct": 25}'::jsonb)
on conflict (key) do nothing;

-- 3) جدول مهام سفارة الإمارات (إيداع صباحي 8-10 ص / استلام مسائي 3-5 م بدون إلزام برقم ريكوست)
create table if not exists public.embassy_missions (
  id bigserial primary key,
  mission_day date not null default (now() at time zone 'Africa/Cairo')::date,
  mission_type text not null check (mission_type in ('dropoff_am', 'pickup_pm')),
  courier_id bigint references public.couriers(id) on delete set null,
  courier_name text,
  window_label text not null,
  notes text,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists embassy_missions_day_idx on public.embassy_missions (mission_day, status);

-- 4) جدول النداء العام لكل المناديب (Fleet Broadcast)
create table if not exists public.fleet_broadcasts (
  id bigserial primary key,
  message text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint fleet_broadcast_msg_chk check (char_length(btrim(message)) between 2 and 400)
);

-- 5) تفعيل RLS الصارم على كل الجداول الجديدة
alter table public.courier_zone_routes enable row level security;
alter table public.radar_settings enable row level security;
alter table public.embassy_missions enable row level security;
alter table public.fleet_broadcasts enable row level security;

drop policy if exists czr_select_auth on public.courier_zone_routes;
create policy czr_select_auth on public.courier_zone_routes
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));

drop policy if exists rs_select_auth on public.radar_settings;
create policy rs_select_auth on public.radar_settings
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));

drop policy if exists em_select_auth on public.embassy_missions;
create policy em_select_auth on public.embassy_missions
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));

drop policy if exists fb_select_auth on public.fleet_broadcasts;
create policy fb_select_auth on public.fleet_broadcasts
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));

-- 6) دالة لقطة المرحلة 3 المجمعة للرادار (قراءة فقط من request_lines)
drop function if exists public.radar_phase3_snapshot(date);
create or replace function public.radar_phase3_snapshot(
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
  v_rush jsonb;
  v_couriers jsonb;
  v_embassy_am jsonb;
  v_missions jsonb;
  v_stale_complete jsonb;
  v_stale_tickets jsonb;
  v_open_tickets jsonb;
  v_broadcasts jsonb;
  v_dup_names jsonb;
begin
  if not (public.is_staff() or public.is_manager()) then
    raise exception 'staff or manager only' using errcode = '42501';
  end if;

  select val into v_rush from public.radar_settings where key = 'rush_mode';
  v_rush := coalesce(v_rush, '{"enabled": false, "pct": 25}'::jsonb);

  -- أ) المناديب الفعليون المفعّلون مع خطوطهم + حمل اليوم + عداد الكاش في إيد المندوب + آخر حركة
  select coalesce(jsonb_agg(jsonb_build_object(
    'courier_id', c.id,
    'name', c.name,
    'route_keys', coalesce((select r.route_keys from public.courier_zone_routes r where r.courier_id = c.id), '{}'::text[]),
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
    'cash_in_hand', (
      coalesce((
        select sum(coalesce(pt.collect_amount, 0))
        from public.pickup_tickets pt
        where pt.courier_id = c.id
          and pt.status = 'with_courier'
          and pt.payment_status = 'cod_cash'
      ), 0)
      +
      coalesce((
        select sum(coalesce(rl.qty, 1) * coalesce(rl.unit_price, 0))
        from public.courier_trips ct
        join public.request_lines rl on rl.transaction_id = ct.transaction_id
        where public.norm_ar(ct.courier) = public.norm_ar(c.name)
          and ct.trip_day = v_day
          and ct.courier_confirmed_at is not null
          and rl.deleted_at is null
          and coalesce(rl.payment_method, 'كاش') = 'كاش'
      ), 0)
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
    ),
    'last_event_tx', (
      select de.transaction_id from public.courier_dispatch_events de
      where de.courier_id = c.id
      order by de.created_at desc limit 1
    )
  ) order by c.name), '[]'::jsonb)
  into v_couriers
  from public.couriers c
  where c.active = true
    and c.user_id is not null
    and coalesce(c.in_ranking, true) = true;

  -- ب) ريكوستات سفارة الإمارات الداخلة حديثاً (آخر 3 أيام بحد أقصى) وغير المسلمة
  select coalesce(jsonb_agg(jsonb_build_object(
    'line_id', l.id,
    'transaction_id', l.transaction_id,
    'client_name', l.client_name,
    'phone', l.phone,
    'service', l.service,
    'received_date', (l.received_at at time zone 'Africa/Cairo')::date,
    'executor', l.executor,
    'complete', coalesce(l.complete, false)
  ) order by l.received_at desc, l.id desc), '[]'::jsonb)
  into v_embassy_am
  from public.request_lines l
  where l.deleted_at is null
    and coalesce(l.delivered, false) = false
    and (l.received_at at time zone 'Africa/Cairo')::date >= (v_day - 3)
    and l.service ilike '%سفارة%إمارات%';

  -- ج) مهام السفارة المسجلة اليوم (بما فيها استلام 3-5 م بدون إلزام برقم ريكوست)
  select coalesce(jsonb_agg(to_jsonb(m.*) order by m.created_at desc), '[]'::jsonb)
  into v_missions
  from public.embassy_missions m
  where m.mission_day = v_day
    and m.status <> 'cancelled';

  -- د) معاملات مكتملة مركونة +24 ساعة بدون تسليم
  select coalesce(jsonb_agg(jsonb_build_object(
    'line_id', l.id,
    'transaction_id', l.transaction_id,
    'client_name', l.client_name,
    'phone', l.phone,
    'service', l.service,
    'received_at', l.received_at,
    'total', round(coalesce(l.qty, 1) * coalesce(l.unit_price, 0), 2)
  ) order by l.received_at asc), '[]'::jsonb)
  into v_stale_complete
  from (
    select l.* from public.request_lines l
    where l.deleted_at is null
      and coalesce(l.complete, false) = true
      and coalesce(l.delivered, false) = false
      and l.received_at < now() - interval '24 hours'
    order by l.received_at asc
    limit 25
  ) l;

  -- هـ) تيكتات استلام معلقة +72 ساعة
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pt.id,
    'sd_request_id', pt.sd_request_id,
    'client_name', pt.client_name,
    'zone', pt.zone,
    'status', pt.status,
    'courier_id', pt.courier_id,
    'created_at', pt.created_at
  ) order by pt.created_at asc), '[]'::jsonb)
  into v_stale_tickets
  from public.pickup_tickets pt
  where pt.status in ('open', 'with_courier')
    and pt.created_at < now() - interval '72 hours';

  -- و) تيكتات الاستلام النشطة (للموزع الذكي + الإنقاذ الطارئ + ذهاب وعودة + التاج الأحمر)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pt.id,
    'sd_request_id', pt.sd_request_id,
    'client_name', pt.client_name,
    'phone', pt.phone,
    'zone', pt.zone,
    'address', pt.address,
    'service_name', pt.service_name,
    'slot_pref', pt.slot_pref,
    'payment_status', pt.payment_status,
    'collect_amount', pt.collect_amount,
    'total', pt.total,
    'courier_id', pt.courier_id,
    'status', pt.status,
    'created_at', pt.created_at,
    'history_count', (
      select count(distinct rl.transaction_id)
      from public.request_lines rl
      where rl.deleted_at is null
        and (
          (pt.phone is not null and pt.phone <> '' and rl.phone = pt.phone)
          or public.norm_ar(rl.client_name) = public.norm_ar(pt.client_name)
        )
    )
  ) order by pt.created_at desc), '[]'::jsonb)
  into v_open_tickets
  from (
    select * from public.pickup_tickets
    where status in ('open', 'with_courier')
    order by created_at desc
    limit 40
  ) pt;

  -- ز) تنبيه تشابه الأسماء في المعاملات النشطة غير المسلمة
  select coalesce(jsonb_agg(jsonb_build_object(
    'first_word', fw,
    'cnt', cnt,
    'names', names
  )), '[]'::jsonb)
  into v_dup_names
  from (
    select
      split_part(public.norm_ar(client_name), ' ', 1) as fw,
      count(distinct client_name) as cnt,
      array_agg(distinct client_name) as names
    from public.request_lines
    where deleted_at is null
      and coalesce(delivered, false) = false
      and coalesce(complete, false) = true
      and btrim(coalesce(client_name, '')) <> ''
    group by split_part(public.norm_ar(client_name), ' ', 1)
    having count(distinct client_name) > 1
    limit 10
  ) d;

  -- ح) آخر 5 نداءات عامة
  select coalesce(jsonb_agg(to_jsonb(fb.*) order by fb.created_at desc), '[]'::jsonb)
  into v_broadcasts
  from (select * from public.fleet_broadcasts order by created_at desc limit 5) fb;

  return jsonb_build_object(
    'day', v_day,
    'rush_mode', v_rush,
    'couriers', v_couriers,
    'embassy_am', v_embassy_am,
    'embassy_missions', v_missions,
    'stale_complete_24h', v_stale_complete,
    'stale_tickets_72h', v_stale_tickets,
    'open_tickets', v_open_tickets,
    'dup_names', v_dup_names,
    'broadcasts', v_broadcasts
  );
end;
$$;

revoke all on function public.radar_phase3_snapshot(date) from public, anon;
grant execute on function public.radar_phase3_snapshot(date) to authenticated;

-- 7) حفظ خطوط المناطق للمندوب (للمدير فقط — يسمح بخط واحد أو أكتر)
drop function if exists public.radar_set_courier_routes(bigint, text[]);
create or replace function public.radar_set_courier_routes(
  p_courier_id bigint,
  p_routes text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.courier_zone_routes;
begin
  if not public.is_manager() then
    raise exception 'manager only' using errcode = '42501';
  end if;

  insert into public.courier_zone_routes (courier_id, route_keys, updated_by, updated_at)
  values (p_courier_id, coalesce(p_routes, '{}'), auth.uid(), now())
  on conflict (courier_id) do update set
    route_keys = excluded.route_keys,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.radar_set_courier_routes(bigint, text[]) from public, anon;
grant execute on function public.radar_set_courier_routes(bigint, text[]) to authenticated;

-- 8) تشغيل/إيقاف وضع الذروة والمطر (للمدير فقط)
drop function if exists public.radar_toggle_rush_mode(boolean);
create or replace function public.radar_toggle_rush_mode(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_val jsonb := jsonb_build_object('enabled', coalesce(p_enabled, false), 'pct', 25);
begin
  if not public.is_manager() then
    raise exception 'manager only' using errcode = '42501';
  end if;

  insert into public.radar_settings (key, val, updated_by, updated_at)
  values ('rush_mode', v_val, auth.uid(), now())
  on conflict (key) do update set
    val = excluded.val,
    updated_by = auth.uid(),
    updated_at = now();

  return v_val;
end;
$$;

revoke all on function public.radar_toggle_rush_mode(boolean) from public, anon;
grant execute on function public.radar_toggle_rush_mode(boolean) to authenticated;

-- 9) إضافة مهمة سفارة الإمارات (استلام 3-5 م أو إيداع 8-10 ص)
drop function if exists public.radar_add_embassy_mission(date, text, bigint, text);
create or replace function public.radar_add_embassy_mission(
  p_day date,
  p_type text,
  p_courier_id bigint,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_win text := case when p_type = 'pickup_pm' then '3:00 م – 5:00 م' else '8:00 ص – 10:00 ص' end;
  v_row public.embassy_missions;
begin
  if not (public.is_staff() or public.is_manager()) then
    raise exception 'staff or manager only' using errcode = '42501';
  end if;

  select * into v_c from public.couriers where id = p_courier_id and active = true and user_id is not null limit 1;
  if v_c.id is null then
    raise exception 'active courier not found' using errcode = '22023';
  end if;

  insert into public.embassy_missions (
    mission_day, mission_type, courier_id, courier_name, window_label, notes, created_by
  ) values (
    coalesce(p_day, (now() at time zone 'Africa/Cairo')::date),
    case when p_type = 'pickup_pm' then 'pickup_pm' else 'dropoff_am' end,
    v_c.id, v_c.name, v_win, nullif(left(btrim(coalesce(p_notes, '')), 400), ''), auth.uid()
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.radar_add_embassy_mission(date, text, bigint, text) from public, anon;
grant execute on function public.radar_add_embassy_mission(date, text, bigint, text) to authenticated;

-- 10) إنقاذ الخط الطارئ: تحويل تيكتات استلام لمندوب تاني بضغطة واحدة
drop function if exists public.radar_fleet_rescue(bigint[], bigint);
create or replace function public.radar_fleet_rescue(
  p_ticket_ids bigint[],
  p_to_courier_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_cnt integer := 0;
begin
  if not (public.is_staff() or public.is_manager()) then
    raise exception 'staff or manager only' using errcode = '42501';
  end if;

  select * into v_c from public.couriers where id = p_to_courier_id and active = true and user_id is not null limit 1;
  if v_c.id is null then
    raise exception 'active courier not found' using errcode = '22023';
  end if;

  update public.pickup_tickets
     set courier_id = v_c.id,
         status = 'with_courier',
         updated_at = now()
   where id = any(p_ticket_ids)
     and status in ('open', 'with_courier');

  get diagnostics v_cnt = row_count;
  return jsonb_build_object('moved', v_cnt, 'courier_name', v_c.name);
end;
$$;

revoke all on function public.radar_fleet_rescue(bigint[], bigint) from public, anon;
grant execute on function public.radar_fleet_rescue(bigint[], bigint) to authenticated;

-- 11) إرسال نداء عام لكل المناديب (للمدير فقط)
drop function if exists public.radar_send_broadcast(text);
create or replace function public.radar_send_broadcast(p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.fleet_broadcasts;
begin
  if not public.is_manager() then
    raise exception 'manager only' using errcode = '42501';
  end if;

  insert into public.fleet_broadcasts (message, created_by)
  values (left(btrim(coalesce(p_message, '')), 400), auth.uid())
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.radar_send_broadcast(text) from public, anon;
grant execute on function public.radar_send_broadcast(text) to authenticated;

-- 12) دالة المندوب: تعرض له آخر نداء عام + مهام السفارة المعينة له اليوم (بدون أي أسعار)
drop function if exists public.courier_my_radar_alerts(date);
create or replace function public.courier_my_radar_alerts(
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
  v_missions jsonb;
  v_bcasts jsonb;
begin
  if not public.is_courier() then
    raise exception 'courier only' using errcode = '42501';
  end if;

  select * into v_c from public.couriers where user_id = auth.uid() and active = true limit 1;
  if v_c.id is null then
    return jsonb_build_object('missions', '[]'::jsonb, 'broadcasts', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'mission_type', m.mission_type,
    'window_label', m.window_label,
    'notes', m.notes
  ) order by m.created_at desc), '[]'::jsonb)
  into v_missions
  from public.embassy_missions m
  where m.mission_day = v_day
    and m.courier_id = v_c.id
    and m.status = 'open';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', fb.id,
    'message', fb.message,
    'created_at', fb.created_at
  ) order by fb.created_at desc), '[]'::jsonb)
  into v_bcasts
  from (select * from public.fleet_broadcasts where created_at > now() - interval '24 hours' order by created_at desc limit 3) fb;

  return jsonb_build_object('missions', v_missions, 'broadcasts', v_bcasts);
end;
$$;

revoke all on function public.courier_my_radar_alerts(date) from public, anon;
grant execute on function public.courier_my_radar_alerts(date) to authenticated;

-- =====================================================================
-- courier-v12-modern.sql
-- تحديث بوابة المندوب وربط المكتب والعميل (v12 — بدون أي مرفقات صور نهائياً)
-- يشمل:
--   1) توقيع العميل الخفيف SVG (نص متجهي < 12KB، صفر Storage)
--   2) ذاكرة المكان الدائمة للمناديب (Landmark Memory)
--   3) ناقل أحداث التشغيل والربط اللحظي (في طريقي / انتظار / استراحة / تحويل / تأجيل / مصروف / تنبيه عاجل / تسوية كاش / جاهزية / تأكيد ميعاد / محاولة اتصال)
--   4) تحديث courier_items وcourier_tx_detail لإرجاع tracking_token والتحصيل المتبقي والجاهزية
--   5) رادار المكتب الحي + موافقة بضغطة واحدة + حالة المندوب على صفحة تتبع العميل
-- =====================================================================

-- 1) جدول التوقيع الخفيف (SVG Path Text فقط — بدون أي صور أو مرفقات)
create table if not exists public.courier_signatures (
  id bigserial primary key,
  transaction_id text not null,
  courier_id bigint,
  courier_name text,
  signer_name text,
  svg_path text not null,
  lat numeric(9,6),
  lng numeric(9,6),
  signed_at timestamptz not null default now()
);
create index if not exists idx_courier_signatures_tx on public.courier_signatures(transaction_id, signed_at desc);
alter table public.courier_signatures enable row level security;
drop policy if exists courier_block_signatures on public.courier_signatures;
create policy courier_block_signatures on public.courier_signatures as restrictive for all to authenticated using (not public.is_courier()) with check (not public.is_courier());
drop policy if exists staff_select_signatures on public.courier_signatures;
create policy staff_select_signatures on public.courier_signatures for select to authenticated using (public.is_staff() or public.is_manager());
revoke all on public.courier_signatures from public, anon, authenticated;

-- 2) جدول ذاكرة المكان الدائمة (Landmark Memory)
create table if not exists public.courier_landmarks (
  id bigserial primary key,
  client_key text not null unique,
  client_name text,
  note text not null,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.courier_landmarks enable row level security;
drop policy if exists courier_block_landmarks on public.courier_landmarks;
create policy courier_block_landmarks on public.courier_landmarks as restrictive for all to authenticated using (not public.is_courier()) with check (not public.is_courier());
drop policy if exists staff_all_landmarks on public.courier_landmarks;
create policy staff_all_landmarks on public.courier_landmarks for all to authenticated using (public.is_staff() or public.is_manager()) with check (public.is_staff() or public.is_manager());
revoke all on public.courier_landmarks from public, anon, authenticated;

-- 3) جدول أحداث التشغيل والربط اللحظي بين المندوب والمكتب
create table if not exists public.courier_dispatch_events (
  id bigserial primary key,
  courier_id bigint,
  courier_name text,
  transaction_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'ack',
  created_by uuid default auth.uid(),
  resolved_by uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_cde_created on public.courier_dispatch_events(created_at desc);
create index if not exists idx_cde_tx on public.courier_dispatch_events(transaction_id, created_at desc);
create index if not exists idx_cde_courier on public.courier_dispatch_events(courier_id, created_at desc);
alter table public.courier_dispatch_events enable row level security;
drop policy if exists courier_block_cde on public.courier_dispatch_events;
create policy courier_block_cde on public.courier_dispatch_events as restrictive for all to authenticated using (not public.is_courier()) with check (not public.is_courier());
drop policy if exists staff_all_cde on public.courier_dispatch_events;
create policy staff_all_cde on public.courier_dispatch_events for all to authenticated using (public.is_staff() or public.is_manager()) with check (public.is_staff() or public.is_manager());
revoke all on public.courier_dispatch_events from public, anon, authenticated;

-- 4) تحديث دالة courier_items لإرجاع tracking_token + التحصيل المتبقي + الجاهزية + ملاحظة المكان + التوقيع
drop function if exists public.courier_items(date, date);
create or replace function public.courier_items(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_to date := coalesce(p_to, v_today);
  v_from date;
  v_me text;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier account not linked' using errcode = '42501'; end if;
  v_me := public.norm_ar(v_c.name);
  v_from := coalesce(p_from, v_today - 62);
  if v_from > v_to then raise exception 'invalid date range' using errcode = '22023'; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.day desc, r.sort desc) from (
      select t.kind as type, t.id, t.transaction_id, t.trip_day as day, t.fee as amount, t.id as sort,
             (t.courier_confirmed_at is not null) as confirmed, t.courier_confirmed_at as confirmed_at,
             null::text as fee_kind, i.client_name, i.phone, i.address, i.services, i.employee,
             i.tracking_token, i.lines, i.n_complete, i.n_delivered, i.n_review,
             coalesce(i.cod_due, 0) as cod_remaining,
             (select p.id from public.profiles p where public.norm_ar(p.full_name) = public.norm_ar(i.employee) limit 1) as employee_id,
             (select p.phone from public.profiles p where public.norm_ar(p.full_name) = public.norm_ar(i.employee) limit 1) as employee_phone,
             (select count(*) from public.tx_comments c where c.transaction_id = t.transaction_id and c.author_id = auth.uid() and c.deleted_at is null) as my_notes,
             (select lm.note from public.courier_landmarks lm where lm.client_key = public.norm_ar(coalesce(i.client_name,'') || ' ' || coalesce(i.phone,'')) limit 1) as landmark_note,
             exists (select 1 from public.courier_signatures cs where cs.transaction_id = t.transaction_id) as has_signature,
             exists (select 1 from public.courier_dispatch_events e where e.transaction_id = t.transaction_id and e.event_type = 'ready_flag' and (e.payload->>'val')::boolean = true) as office_ready,
             exists (select 1 from public.courier_dispatch_events e where e.transaction_id = t.transaction_id and e.event_type = 'client_confirmed' and (e.payload->>'val')::boolean = true) as client_confirmed,
             (select count(*) from public.courier_dispatch_events e where e.transaction_id = t.transaction_id and e.event_type = 'call_attempt') as call_attempts,
             (select e.event_type from public.courier_dispatch_events e where e.transaction_id = t.transaction_id and e.event_type in ('on_the_way','waiting') order by e.created_at desc limit 1) as live_state
        from public.courier_trips t
        left join lateral (
          select max(l.client_name) as client_name, max(l.phone) as phone, max(l.address) as address, max(l.employee) as employee,
                 max(l.tracking_token) as tracking_token,
                 string_agg(distinct l.service, '، ') as services, count(*) as lines,
                 count(*) filter (where l.complete) as n_complete, count(*) filter (where l.delivered) as n_delivered,
                 count(*) filter (where l.under_review) as n_review,
                 case when max(coalesce(l.payment_method, '')) ~* 'عند الاستلام|تحصيل|آجل|باقي|cod' then sum(coalesce(l.total, 0)) else 0 end as cod_due
            from public.request_lines l where l.transaction_id = t.transaction_id and l.deleted_at is null) i on true
       where public.norm_ar(t.courier) = v_me and t.trip_day between v_from and v_to and coalesce(i.lines, 0) > 0
      union all
      select 'fee', l.id, l.transaction_id, l.received_at::date, f.amount, l.id,
             (fc.line_id is not null), fc.confirmed_at,
             case when public.norm_ar(l.service) ~ 'عوده|رجوع' then 'round' else 'one' end,
             coalesce(l.client_name, i.client_name), coalesce(l.phone, i.phone), coalesce(l.address, i.address), l.service, l.employee,
             coalesce(l.tracking_token, i.tracking_token), i.lines, i.n_complete, i.n_delivered, i.n_review,
             coalesce(i.cod_due, 0),
             (select p.id from public.profiles p where public.norm_ar(p.full_name) = public.norm_ar(l.employee) limit 1),
             (select p.phone from public.profiles p where public.norm_ar(p.full_name) = public.norm_ar(l.employee) limit 1),
             (select count(*) from public.tx_comments c where c.transaction_id = l.transaction_id and c.author_id = auth.uid() and c.deleted_at is null),
             (select lm.note from public.courier_landmarks lm where lm.client_key = public.norm_ar(coalesce(l.client_name, i.client_name,'') || ' ' || coalesce(l.phone, i.phone,'')) limit 1),
             exists (select 1 from public.courier_signatures cs where cs.transaction_id = l.transaction_id),
             exists (select 1 from public.courier_dispatch_events e where e.transaction_id = l.transaction_id and e.event_type = 'ready_flag' and (e.payload->>'val')::boolean = true),
             exists (select 1 from public.courier_dispatch_events e where e.transaction_id = l.transaction_id and e.event_type = 'client_confirmed' and (e.payload->>'val')::boolean = true),
             (select count(*) from public.courier_dispatch_events e where e.transaction_id = l.transaction_id and e.event_type = 'call_attempt'),
             (select e.event_type from public.courier_dispatch_events e where e.transaction_id = l.transaction_id and e.event_type in ('on_the_way','waiting') order by e.created_at desc limit 1)
        from public.request_lines l
        cross join lateral (select coalesce(nullif(l.exec_total, 0), coalesce(l.qty, 0) * coalesce(l.exec_unit_cost, 0)) as amount) f
        left join public.courier_fee_confirms fc
          on fc.line_id = l.id and public.norm_ar(fc.courier) = v_me and fc.amount = f.amount
        left join lateral (
          select max(x.client_name) as client_name, max(x.phone) as phone, max(x.address) as address, max(x.tracking_token) as tracking_token, count(*) as lines,
                 count(*) filter (where x.complete) as n_complete, count(*) filter (where x.delivered) as n_delivered,
                 count(*) filter (where x.under_review) as n_review,
                 case when max(coalesce(x.payment_method, '')) ~* 'عند الاستلام|تحصيل|آجل|باقي|cod' then sum(coalesce(x.total, 0)) else 0 end as cod_due
            from public.request_lines x where x.transaction_id = l.transaction_id and x.deleted_at is null) i on true
       where l.deleted_at is null and public.norm_ar(l.service) like 'رسوم توصيل%'
         and public.norm_ar(l.executor) = v_me and l.received_at::date between v_from and v_to
    ) r), '[]'::jsonb);
end $$;

-- 5) حفظ توقيع العميل كـ SVG Path (بدون صور أو Storage)
drop function if exists public.courier_v12_save_signature(text, text, text, numeric, numeric);
create or replace function public.courier_v12_save_signature(
  p_tx text, p_signer text, p_svg_path text, p_lat numeric default null, p_lng numeric default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_tx text := btrim(coalesce(p_tx, ''));
  v_svg text := btrim(coalesce(p_svg_path, ''));
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;
  if v_tx = '' or v_svg = '' or char_length(v_svg) > 16000 then raise exception 'invalid signature' using errcode = '22023'; end if;

  insert into public.courier_signatures(transaction_id, courier_id, courier_name, signer_name, svg_path, lat, lng)
  values (v_tx, v_c.id, v_c.name, nullif(btrim(coalesce(p_signer,'')), ''), v_svg, p_lat, p_lng);

  return jsonb_build_object('ok', true, 'transaction_id', v_tx);
end $$;

-- 6) حفظ ملاحظة المكان الدائمة (Landmark Memory)
drop function if exists public.courier_v12_save_landmark(text, text);
create or replace function public.courier_v12_save_landmark(p_tx text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_tx text := btrim(coalesce(p_tx, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_client text;
  v_phone text;
  v_key text;
begin
  if not (public.is_courier() or public.is_staff() or public.is_manager()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_tx = '' or v_note = '' then raise exception 'empty input' using errcode = '22023'; end if;

  select max(l.client_name), max(l.phone) into v_client, v_phone
    from public.request_lines l where l.transaction_id = v_tx and l.deleted_at is null;
  v_key := public.norm_ar(coalesce(v_client,'') || ' ' || coalesce(v_phone,''));
  if v_key = '' then v_key := v_tx; end if;

  insert into public.courier_landmarks(client_key, client_name, note, created_by, updated_at)
  values (v_key, v_client, left(v_note, 300), auth.uid(), now())
  on conflict (client_key) do update set note = excluded.note, updated_at = now(), created_by = auth.uid();

  return jsonb_build_object('ok', true, 'note', left(v_note, 300));
end $$;

-- 7) إرسال حدث تشغيل لحظي من المندوب (في طريقي / انتظار / استراحة / تحويل / تأجيل / مصروف / قرب المكتب / محاولة اتصال / تسوية كاش)
drop function if exists public.courier_v12_dispatch_action(text, text, jsonb);
create or replace function public.courier_v12_dispatch_action(p_event_type text, p_tx text default null, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_type text := btrim(coalesce(p_event_type, ''));
  v_status text := 'ack';
  v_id bigint;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;
  if v_type not in ('on_the_way','waiting','break','resume','handoff_req','reschedule_req','expense','near_office','call_attempt','swap_req','cash_settle','client_tag') then
    raise exception 'invalid event type' using errcode = '22023';
  end if;

  if v_type in ('handoff_req','reschedule_req','expense','swap_req','cash_settle') then
    v_status := 'pending';
  end if;

  insert into public.courier_dispatch_events(courier_id, courier_name, transaction_id, event_type, payload, status, created_by)
  values (v_c.id, v_c.name, nullif(btrim(coalesce(p_tx,'')), ''), v_type, coalesce(p_payload, '{}'::jsonb), v_status, auth.uid())
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', v_status);
end $$;

-- 8) استلام التنبيهات العاجلة للمندوب من المكتب وتأكيد قراءتها
drop function if exists public.courier_v12_my_pings();
create or replace function public.courier_v12_my_pings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_c public.couriers;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'transaction_id', e.transaction_id, 'message', e.payload->>'message',
      'from_name', e.payload->>'from_name', 'created_at', e.created_at
    ) order by e.created_at desc)
    from public.courier_dispatch_events e
    where e.courier_id = v_c.id and e.event_type = 'urgent_ping' and e.status = 'pending'
      and e.created_at > now() - interval '24 hours'
  ), '[]'::jsonb);
end $$;

drop function if exists public.courier_v12_ack_ping(bigint);
create or replace function public.courier_v12_ack_ping(p_event_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  update public.courier_dispatch_events
     set status = 'ack', resolved_by = auth.uid(), resolved_at = now()
   where id = p_event_id and courier_id = v_c.id and event_type = 'urgent_ping';
  return jsonb_build_object('ok', true);
end $$;

-- 9) رادار المكتب الحي والموافقات (للموظفين والمدير)
drop function if exists public.courier_v12_office_radar();
create or replace function public.courier_v12_office_radar()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
begin
  if not (public.is_staff() or public.is_manager()) then raise exception 'staff only' using errcode = '42501'; end if;

  return jsonb_build_object(
    'couriers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'total_today', (select count(*) from public.courier_trips t where public.norm_ar(t.courier) = public.norm_ar(c.name) and t.trip_day = v_today),
        'confirmed_today', (select count(*) from public.courier_trips t where public.norm_ar(t.courier) = public.norm_ar(c.name) and t.trip_day = v_today and t.courier_confirmed_at is not null),
        'last_event', (select jsonb_build_object('type', e.event_type, 'tx', e.transaction_id, 'at', e.created_at, 'payload', e.payload)
                         from public.courier_dispatch_events e where e.courier_id = c.id and e.created_at::date = v_today order by e.created_at desc limit 1)
      ) order by c.name)
      from public.couriers c where c.active
    ), '[]'::jsonb),
    'pending_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'courier_id', e.courier_id, 'courier_name', e.courier_name,
        'transaction_id', e.transaction_id, 'event_type', e.event_type,
        'payload', e.payload, 'created_at', e.created_at
      ) order by e.created_at desc)
      from public.courier_dispatch_events e
      where e.status = 'pending' and e.event_type in ('handoff_req','reschedule_req','expense','swap_req','cash_settle')
        and e.created_at > now() - interval '7 days'
    ), '[]'::jsonb)
  );
end $$;

-- 10) موافقة/رفض المكتب بضغطة واحدة + إرسال تنبيه عاجل للمندوب + تعليم الجاهزية وتأكيد الميعاد
drop function if exists public.courier_v12_resolve_event(bigint, text);
create or replace function public.courier_v12_resolve_event(p_event_id bigint, p_decision text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_dec text := case when lower(btrim(coalesce(p_decision,''))) = 'approved' then 'approved' else 'rejected' end;
  v_ev public.courier_dispatch_events;
begin
  if not (public.is_staff() or public.is_manager()) then raise exception 'staff only' using errcode = '42501'; end if;
  update public.courier_dispatch_events
     set status = v_dec, resolved_by = auth.uid(), resolved_at = now()
   where id = p_event_id
   returning * into v_ev;

  if v_ev.id is not null and v_dec = 'approved' and v_ev.event_type = 'reschedule_req' and v_ev.transaction_id is not null then
    update public.courier_trips
       set trip_day = (now() at time zone 'Africa/Cairo')::date + 1
     where transaction_id = v_ev.transaction_id and courier_id is not distinct from v_ev.courier_id
       and courier_confirmed_at is null;
  end if;

  return jsonb_build_object('ok', true, 'status', v_dec);
end $$;

drop function if exists public.courier_v12_urgent_ping(bigint, text, text);
create or replace function public.courier_v12_urgent_ping(p_courier_id bigint, p_tx text, p_message text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_sender text;
begin
  if not (public.is_staff() or public.is_manager()) then raise exception 'staff only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where id = p_courier_id;
  if v_c.id is null then raise exception 'courier not found' using errcode = '22023'; end if;
  select full_name into v_sender from public.profiles where id = auth.uid();

  insert into public.courier_dispatch_events(courier_id, courier_name, transaction_id, event_type, payload, status, created_by)
  values (v_c.id, v_c.name, nullif(btrim(coalesce(p_tx,'')), ''), 'urgent_ping',
          jsonb_build_object('message', left(btrim(coalesce(p_message,'')), 300), 'from_name', coalesce(v_sender, 'المكتب')),
          'pending', auth.uid());

  return jsonb_build_object('ok', true);
end $$;

drop function if exists public.courier_v12_mark_ready(text, text, boolean);
create or replace function public.courier_v12_mark_ready(p_tx text, p_flag text, p_val boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_flag text := case when p_flag = 'client_confirmed' then 'client_confirmed' else 'ready_flag' end;
begin
  if not (public.is_staff() or public.is_manager()) then raise exception 'staff only' using errcode = '42501'; end if;
  insert into public.courier_dispatch_events(transaction_id, event_type, payload, status, created_by)
  values (btrim(coalesce(p_tx,'')), v_flag, jsonb_build_object('val', coalesce(p_val, true)), 'ack', auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- 11) حالة المندوب الحية لصفحة تتبع العميل (tracking.html) — بدون كشف أي بيانات حساسة
drop function if exists public.public_courier_live_status(text);
create or replace function public.public_courier_live_status(p_tx text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tx text := upper(btrim(coalesce(p_tx, '')));
  v_ev public.courier_dispatch_events;
begin
  if v_tx = '' or char_length(v_tx) > 40 then return jsonb_build_object('on_the_way', false); end if;
  select * into v_ev from public.courier_dispatch_events
   where upper(transaction_id) = v_tx and event_type in ('on_the_way','waiting')
     and created_at > now() - interval '6 hours'
   order by created_at desc limit 1;

  if v_ev.id is null then
    return jsonb_build_object('on_the_way', false);
  end if;
  return jsonb_build_object(
    'on_the_way', true,
    'state', v_ev.event_type,
    'courier_name', split_part(coalesce(v_ev.courier_name, 'مندوب تساهيل'), ' ', 1),
    'at', v_ev.created_at
  );
end $$;

-- الصلاحيات
revoke all on function public.courier_items(date, date) from public, anon;
grant execute on function public.courier_items(date, date) to authenticated;

revoke all on function public.courier_v12_save_signature(text, text, text, numeric, numeric) from public, anon;
grant execute on function public.courier_v12_save_signature(text, text, text, numeric, numeric) to authenticated;

revoke all on function public.courier_v12_save_landmark(text, text) from public, anon;
grant execute on function public.courier_v12_save_landmark(text, text) to authenticated;

revoke all on function public.courier_v12_dispatch_action(text, text, jsonb) from public, anon;
grant execute on function public.courier_v12_dispatch_action(text, text, jsonb) to authenticated;

revoke all on function public.courier_v12_my_pings() from public, anon;
grant execute on function public.courier_v12_my_pings() to authenticated;

revoke all on function public.courier_v12_ack_ping(bigint) from public, anon;
grant execute on function public.courier_v12_ack_ping(bigint) to authenticated;

revoke all on function public.courier_v12_office_radar() from public, anon;
grant execute on function public.courier_v12_office_radar() to authenticated;

revoke all on function public.courier_v12_resolve_event(bigint, text) from public, anon;
grant execute on function public.courier_v12_resolve_event(bigint, text) to authenticated;

revoke all on function public.courier_v12_urgent_ping(bigint, text, text) from public, anon;
grant execute on function public.courier_v12_urgent_ping(bigint, text, text) to authenticated;

revoke all on function public.courier_v12_mark_ready(text, text, boolean) from public, anon;
grant execute on function public.courier_v12_mark_ready(text, text, boolean) to authenticated;

revoke all on function public.public_courier_live_status(text) from public;
grant execute on function public.public_courier_live_status(text) to anon, authenticated;

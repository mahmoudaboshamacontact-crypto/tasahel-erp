-- =====================================================================
-- sql/courier-tickets-phase5.sql (المرحلة 5: تحويل التيكت لمعاملة + مهمة استلام ذرياً)
-- قابل لإعادة التشغيل بأمان (Idempotent) — يُشغّل يدوياً في Supabase SQL Editor
-- الترتيب: يُشغّل بعد sql/courier-tickets-phase4.sql (المرحلة 4).
-- لا يعدّل دوال العمولات (courier_close_account / courier_items / courier_confirm_day / courier_confirm_one)
-- ولا يعدّل أي سياسة RLS موجودة.
-- =====================================================================

-- أ) التأكد من أعمدة التحويل وإضافة mission_id على public.pickup_tickets
alter table public.pickup_tickets
  add column if not exists converted_at timestamptz,
  add column if not exists converted_by uuid,
  add column if not exists mission_id bigint references public.courier_trips(id) on delete set null;

create index if not exists pickup_tickets_mission_id_idx
  on public.pickup_tickets (mission_id)
  where mission_id is not null;

-- ب) تحديث دالة التحويل الذري pickup_convert_ticket:
--    1) للمدير فقط (is_manager)
--    2) قفل الصف بـ FOR UPDATE + idempotent لو متحوّل قبل كده (يرجع نفس converted_tx_id و mission_id بدون تكرار)
--    3) في نفس الـ transaction: إنشاء بنود المعاملة في request_lines + إنشاء صف مهمة استلام في courier_trips
--       (kind='pickup', courier=اسم المندوب, fee=40, trip_day=اليوم, courier_confirmed_at=null)
--    4) UPDATE واحد على pickup_tickets بـ status='converted', converted_tx_id, converted_at, converted_by, mission_id
create or replace function public.pickup_convert_ticket(
  p_ticket_id bigint,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t          public.pickup_tickets;
  v_c          public.couriers;
  v_tx         text;
  v_n          integer := 0;
  v_try        integer := 0;
  v_today      date := (now() at time zone 'Africa/Cairo')::date;
  v_now        timestamptz := now();
  v_mission_id bigint;
begin
  if not public.is_manager() then
    raise exception 'التحويل لمهمة استلام متاح للمدير فقط' using errcode = '42501';
  end if;

  select * into v_t
    from public.pickup_tickets
   where id = p_ticket_id
   for update;

  if v_t.id is null then
    raise exception 'التيكت غير موجود' using errcode = 'P0002';
  end if;

  -- Idempotent مع قفل FOR UPDATE: لو اتحوّل قبل كده نرجع نفس المعاملة والمهمة بدون إنشاء صفوف مكررة
  if v_t.status = 'converted' then
    return jsonb_build_object(
      'ok',                true,
      'already_converted', true,
      'transaction_id',    v_t.converted_tx_id,
      'mission_id',        v_t.mission_id
    );
  end if;

  if v_t.status = 'cancelled' then
    raise exception 'لا يمكن تحويل تيكت ملغي' using errcode = '22023';
  end if;

  if v_t.status not in ('open', 'with_courier') then
    raise exception 'حالة التيكت الحالية (%) لا تسمح بالتحويل', v_t.status using errcode = '22023';
  end if;

  if v_t.courier_id is null then
    raise exception 'لازم تعيّن مندوب للتيكت قبل التحويل لمهمة استلام' using errcode = '22023';
  end if;

  select * into v_c
    from public.couriers
   where id = v_t.courier_id
     and active = true
   limit 1;

  if v_c.id is null then
    raise exception 'المندوب المعيّن غير موجود أو غير نشط' using errcode = '22023';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 50 then
    raise exception 'بنود التحويل غير صالحة' using errcode = '22023';
  end if;

  -- توليد رقم معاملة فريد مع قفل يمنع التضارب
  perform pg_advisory_xact_lock(hashtext('tx_number_gen'));
  loop
    v_try := v_try + 1;
    v_tx := 'TX-' || to_char(now() at time zone 'Africa/Cairo', 'YYYY') || '-' || (floor(1000 + random() * 9000))::int;
    exit when not exists (select 1 from public.request_lines where transaction_id = v_tx);
    if v_try >= 30 then
      raise exception 'تعذر توليد رقم معاملة غير مستخدم' using errcode = '22023';
    end if;
  end loop;

  -- 1) إدخال بنود المعاملة في request_lines (نفس الأعمدة المعتمدة بدون لمس GENERATED ALWAYS)
  insert into public.request_lines (
    client_name, phone, transaction_id, address, employee, payment_method, receiver, received_at, rn_nm,
    service, service_ref, qty, unit_price, list_price, discount_pct, exec_unit_cost, commission_per_unit,
    executor, duration_days, notes
  )
  select x.client_name, x.phone, v_tx, x.address, x.employee, x.payment_method, x.receiver, x.received_at, x.rn_nm,
         x.service, x.service_ref, greatest(1, coalesce(x.qty, 1)), x.unit_price, x.list_price, coalesce(x.discount_pct, 0),
         x.exec_unit_cost, x.commission_per_unit, x.executor, x.duration_days, x.notes
    from jsonb_populate_recordset(null::public.request_lines, p_rows) x
   where btrim(coalesce(x.service, '')) <> '';

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'مفيش بنود صالحة للتحويل' using errcode = '22023';
  end if;

  -- 2) إنشاء مهمة الاستلام في courier_trips في نفس الـ transaction (40 ج.م، بانتظار تأكيد المندوب)
  insert into public.courier_trips (
    transaction_id, kind, courier, fee, trip_day, created_by, courier_confirmed_at
  )
  values (
    v_tx,
    'pickup',
    v_c.name,
    40,
    v_today,
    coalesce(auth.jwt() ->> 'email', 'manager'),
    null
  )
  returning id into v_mission_id;

  -- 3) UPDATE واحد على صف التيكت
  perform set_config('app.pt_trusted', '1', true);

  update public.pickup_tickets
     set status          = 'converted',
         converted_tx_id = v_tx,
         converted_at    = v_now,
         converted_by    = auth.uid(),
         mission_id      = v_mission_id
   where id = v_t.id
     and status in ('open', 'with_courier');

  return jsonb_build_object(
    'ok',             true,
    'transaction_id', v_tx,
    'mission_id',     v_mission_id,
    'lines',          v_n
  );
end;
$$;

revoke all on function public.pickup_convert_ticket(bigint, jsonb) from public, anon;
grant execute on function public.pickup_convert_ticket(bigint, jsonb) to authenticated;

-- ج) تحديث courier_my_tickets لإرجاع المحوّلة خلال آخر 7 أيام + converted_at و mission_id و mission_confirmed
--    ملاحظة: التأكيد يتم عبر دالة courier_confirm_one('pickup', 'trip:' || mission_id) الموجودة بالفعل.
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
      'zone_key', t.zone_key,
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
      'courier_step', t.courier_step,
      'courier_step_at', t.courier_step_at,
      'cancel_reason', t.cancel_reason,
      'cancelled_at', t.cancelled_at,
      'courier_ack_at', t.courier_ack_at,
      'converted_tx_id', t.converted_tx_id,
      'converted_at', t.converted_at,
      'mission_id', t.mission_id,
      'mission_confirmed', exists (
        select 1
          from public.courier_trips ct
         where ct.id = t.mission_id
           and ct.courier_confirmed_at is not null
      ),
      'created_at', t.created_at
    ) order by coalesce(t.converted_at, t.cancelled_at, t.created_at) desc)
    from public.pickup_tickets t
    where t.courier_id = v_c.id
      and (
        t.status = 'with_courier'
        or (t.status = 'cancelled' and t.cancelled_at >= now() - interval '7 days')
        or (t.status = 'converted' and t.converted_at >= now() - interval '7 days')
      )
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.courier_my_tickets() from public, anon;
grant execute on function public.courier_my_tickets() to authenticated;

-- د) تريجر إشعار المندوب بمهمة الاستلام الجديدة عند تحويل التيكت (بدون رقم تليفون، بـ raise warning)
create or replace function public.trg_pickup_ticket_mission_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid;
  v_zone text;
  v_body text;
begin
  if new.status <> 'converted'
     or old.status is not distinct from 'converted'
     or new.courier_id is null
     or new.mission_id is null then
    return new;
  end if;

  select c.user_id into v_uid
    from public.couriers c
   where c.id = new.courier_id
     and c.active = true
     and c.user_id is not null
   limit 1;

  if v_uid is null then
    return new;
  end if;

  v_zone := nullif(btrim(coalesce(new.zone_key, new.zone, '')), '');
  v_body := left(
    coalesce(nullif(btrim(new.client_name), ''), 'عميل') ||
    case when v_zone is not null then ' — ' || v_zone else '' end,
    160
  );

  begin
    insert into public.notifications (user_id, kind, title, body)
    values (v_uid, 'pickup_mission', 'مهمة استلام جديدة', v_body);
  exception when others then
    raise warning 'trg_pickup_ticket_mission_notify failed for ticket %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.trg_pickup_ticket_mission_notify() from public, anon, authenticated;

drop trigger if exists pickup_ticket_mission_notify_trg on public.pickup_tickets;
create trigger pickup_ticket_mission_notify_trg
  after update of status on public.pickup_tickets
  for each row execute function public.trg_pickup_ticket_mission_notify();

-- تحويل التيكت لمهمة استلام = «تأكيد فقط» للمندوب
-- المشكلة: التحويل كان بيعمل مشوار pickup والتيكت بيفضل في خطوة قديمة، فالمندوب يشوفه كأنه لسه هيروح يستلم.
-- الحل:
--  1) التحويل نفسه يقفل خطوات التيكت (papers_received) → الواجهة تعرض زر «تأكيد مشوار الاستلام» بس.
--  2) إشعار «مهمة استلام جديدة» يتشال (المندوب أصلاً شغال على التيكت).
--  3) إشعار «مشوار جديد اتسجل باسمك» يتخطى المشوار اللي بيتعمل من التحويل.

-- (2)
drop trigger if exists pickup_ticket_mission_notify_trg on public.pickup_tickets;

-- (3)
create or replace function public.trg_courier_ops_trip_notice()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_title text; v_body text;
begin
  if coalesce(current_setting('app.skip_trip_notice', true), '') = '1' then return new; end if;
  if tg_op='UPDATE' and new.courier is not distinct from old.courier
     and new.fee is not distinct from old.fee
     and new.trip_day is not distinct from old.trip_day
     and new.transaction_id is not distinct from old.transaction_id
     and new.kind is not distinct from old.kind then return new; end if;
  select c.user_id into v_uid from public.couriers c
   where c.active and c.user_id is not null and public.norm_ar(c.name)=public.norm_ar(new.courier) limit 1;
  if v_uid is not null then
    v_title:=case when tg_op='INSERT' then 'مشوار جديد اتسجل باسمك' else 'تم تعديل أحد مشاويرك' end;
    v_body:='المعاملة '||coalesce(new.transaction_id,'—')||' · '||
      case new.kind when 'pickup' then 'استلام' when 'delivery' then 'تسليم' else new.kind end||
      ' · '||coalesce(new.trip_day::text,'');
    insert into public.notifications(user_id,kind,title,body) values(v_uid,'info',v_title,v_body);
  end if;
  return new;
end $$;

-- (1)
create or replace function public.pickup_convert_ticket(p_ticket_id bigint, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_t public.pickup_tickets; v_c public.couriers; v_tx text;
  v_n integer := 0; v_try integer := 0;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_now timestamptz := now(); v_mission_id bigint;
begin
  if not public.is_internal_user() then
    raise exception 'التحويل لمهمة استلام متاح للموظفين' using errcode = '42501';
  end if;
  select * into v_t from public.pickup_tickets where id = p_ticket_id for update;
  if v_t.id is null then raise exception 'التيكت غير موجود' using errcode = 'P0002'; end if;
  if v_t.status = 'converted' then
    return jsonb_build_object('ok', true, 'already_converted', true,
      'transaction_id', v_t.converted_tx_id, 'mission_id', v_t.mission_id);
  end if;
  if v_t.status = 'cancelled' then raise exception 'لا يمكن تحويل تيكت ملغي' using errcode = '22023'; end if;
  if v_t.status not in ('open', 'with_courier') then
    raise exception 'حالة التيكت الحالية (%) لا تسمح بالتحويل', v_t.status using errcode = '22023';
  end if;
  if v_t.courier_id is null then
    raise exception 'لازم تعيّن مندوب للتيكت قبل التحويل لمهمة استلام' using errcode = '22023';
  end if;
  select * into v_c from public.couriers where id = v_t.courier_id and active = true limit 1;
  if v_c.id is null then raise exception 'المندوب المعيّن غير موجود أو غير نشط' using errcode = '22023'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 50 then
    raise exception 'بنود التحويل غير صالحة' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('tx_number_gen'));
  loop
    v_try := v_try + 1;
    v_tx := 'TX-' || to_char(now() at time zone 'Africa/Cairo', 'YYYY') || '-' || (floor(1000 + random() * 9000))::int;
    exit when not exists (select 1 from public.request_lines where transaction_id = v_tx);
    if v_try >= 30 then raise exception 'تعذر توليد رقم معاملة غير مستخدم' using errcode = '22023'; end if;
  end loop;

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
  if v_n = 0 then raise exception 'مفيش بنود صالحة للتحويل' using errcode = '22023'; end if;

  -- المشوار بينزل للمندوب للتأكيد فقط: من غير إشعار «مشوار جديد»
  perform set_config('app.skip_trip_notice', '1', true);
  insert into public.courier_trips (transaction_id, kind, courier, fee, trip_day, created_by, courier_confirmed_at)
  values (v_tx, 'pickup', v_c.name, 40, v_today, coalesce(auth.jwt() ->> 'email', 'manager'), null)
  returning id into v_mission_id;
  perform set_config('app.skip_trip_notice', '0', true);

  perform set_config('app.pt_trusted', '1', true);
  update public.pickup_tickets
     set status = 'converted', converted_tx_id = v_tx, converted_at = v_now,
         converted_by = auth.uid(), mission_id = v_mission_id,
         courier_step = 'papers_received',
         courier_step_at = coalesce(courier_step_at, v_now)
   where id = v_t.id and status in ('open', 'with_courier');

  return jsonb_build_object('ok', true, 'transaction_id', v_tx, 'mission_id', v_mission_id, 'lines', v_n);
end $$;

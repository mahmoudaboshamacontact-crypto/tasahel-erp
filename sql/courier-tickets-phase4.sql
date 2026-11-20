-- =====================================================================
-- sql/courier-tickets-phase4.sql (المرحلة 4: إلغاء التيكت من العميل/المدير)
-- قابل لإعادة التشغيل بأمان (Idempotent) — يُشغّل يدوياً في Supabase SQL Editor
-- الترتيب: يُشغّل بعد sql/courier-phase3.sql (المرحلة 3).
-- لا يعدّل أي سياسة RLS موجودة، ولا يلمس courier_trips أو أي منطق عمولة.
-- جدول pickup_tickets مضاف بالفعل إلى supabase_realtime من المرحلة 3.
-- =====================================================================

-- أ) أعمدة الإلغاء وتأكيد المندوب على public.pickup_tickets
alter table public.pickup_tickets
  add column if not exists cancel_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists courier_ack_at timestamptz;

-- ب) دالة إلغاء التيكت (المدير فقط — لا تمسح courier_id ولا courier_step)
create or replace function public.pickup_ticket_cancel(
  p_ticket_id bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t      public.pickup_tickets;
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_now    timestamptz := now();
  v_cnt    integer := 0;
begin
  if not public.is_manager() then
    raise exception 'الإلغاء متاح للمدير فقط' using errcode = '42501';
  end if;

  if char_length(v_reason) < 3 then
    raise exception 'لازم تكتب سبب الإلغاء (3 حروف على الأقل)' using errcode = '22023';
  end if;

  select * into v_t
    from public.pickup_tickets
   where id = p_ticket_id
   for update;

  if v_t.id is null then
    raise exception 'التيكت غير موجود' using errcode = 'P0002';
  end if;

  if v_t.status = 'converted' then
    raise exception 'لا يمكن إلغاء تيكت تم تحويله لمعاملة بالفعل' using errcode = '22023';
  end if;

  if v_t.status = 'cancelled' then
    raise exception 'التيكت ملغي بالفعل' using errcode = '22023';
  end if;

  if v_t.status not in ('open', 'with_courier') then
    raise exception 'حالة التيكت الحالية (%) لا تسمح بالإلغاء', v_t.status using errcode = '22023';
  end if;

  perform set_config('app.pt_trusted', '1', true);

  update public.pickup_tickets
     set status        = 'cancelled',
         cancel_reason = v_reason,
         cancelled_at  = v_now,
         cancelled_by  = auth.uid()
   where id = p_ticket_id
     and status in ('open', 'with_courier');

  get diagnostics v_cnt = row_count;
  if v_cnt = 0 then
    raise exception 'تعذر إلغاء التيكت — حاول تاني' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'ok',           true,
    'cancelled_at', v_now
  );
end;
$$;

revoke all on function public.pickup_ticket_cancel(bigint, text) from public, anon;
grant execute on function public.pickup_ticket_cancel(bigint, text) to authenticated;

-- ج) دالة تأكيد المندوب على استلام خبر الإلغاء (Idempotent)
create or replace function public.courier_ticket_ack_cancel(p_ticket_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c      public.couriers;
  v_t      public.pickup_tickets;
  v_now    timestamptz := now();
  v_ack_at timestamptz;
begin
  if not public.is_courier() then
    raise exception 'الإجراء ده متاح للمندوب فقط' using errcode = '42501';
  end if;

  select * into v_c
    from public.couriers
   where user_id = auth.uid()
     and active = true
   limit 1;

  if v_c.id is null then
    raise exception 'حساب المندوب غير مربوط أو غير نشط' using errcode = '42501';
  end if;

  select * into v_t
    from public.pickup_tickets
   where id = p_ticket_id
   for update;

  if v_t.id is null then
    raise exception 'التيكت غير موجود' using errcode = 'P0002';
  end if;

  if v_t.courier_id is distinct from v_c.id then
    raise exception 'التيكت ده مش متعيّن لحضرتك' using errcode = '42501';
  end if;

  if v_t.status <> 'cancelled' then
    raise exception 'التيكت ده مش ملغي' using errcode = '22023';
  end if;

  perform set_config('app.pt_trusted', '1', true);

  update public.pickup_tickets
     set courier_ack_at = coalesce(courier_ack_at, v_now)
   where id = p_ticket_id
     and courier_id = v_c.id
     and status = 'cancelled'
   returning courier_ack_at into v_ack_at;

  if v_ack_at is null then
    raise exception 'تعذر تسجيل تأكيد الإلغاء — حاول تاني' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'ok',             true,
    'courier_ack_at', v_ack_at
  );
end;
$$;

revoke all on function public.courier_ticket_ack_cancel(bigint) from public, anon;
grant execute on function public.courier_ticket_ack_cancel(bigint) to authenticated;

-- د) تعديل courier_my_tickets لإرجاع الملغي خلال آخر 7 أيام مع حقول الإلغاء
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
      'created_at', t.created_at
    ) order by coalesce(t.cancelled_at, t.created_at) desc)
    from public.pickup_tickets t
    where t.courier_id = v_c.id
      and (
        t.status = 'with_courier'
        or (t.status = 'cancelled' and t.cancelled_at >= now() - interval '7 days')
      )
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.courier_my_tickets() from public, anon;
grant execute on function public.courier_my_tickets() to authenticated;

-- هـ) تريجر إشعار الإلغاء للمندوب (يكتب في public.notifications فيلتقطه trg_notify_push تلقائياً)
--     ممنوع أي رقم تليفون في نص الإشعار، وممنوع ابتلاع الخطأ بصمت (raise warning).
create or replace function public.trg_pickup_ticket_cancel_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid;
  v_body text;
begin
  if new.status <> 'cancelled' or old.status is not distinct from 'cancelled' or new.courier_id is null then
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

  v_body := left(
    coalesce(nullif(btrim(new.client_name), ''), 'عميل') || ' — ألغى العميل/المدير التيكت',
    160
  );

  begin
    insert into public.notifications (user_id, kind, title, body)
    values (v_uid, 'pickup_ticket_cancel', 'تم إلغاء تيكت', v_body);
  exception when others then
    raise warning 'trg_pickup_ticket_cancel_notify failed for ticket %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.trg_pickup_ticket_cancel_notify() from public, anon, authenticated;

drop trigger if exists pickup_ticket_cancel_notify_trg on public.pickup_tickets;
create trigger pickup_ticket_cancel_notify_trg
  after update of status on public.pickup_tickets
  for each row execute function public.trg_pickup_ticket_cancel_notify();

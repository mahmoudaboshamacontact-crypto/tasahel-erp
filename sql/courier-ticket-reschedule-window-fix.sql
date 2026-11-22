-- توسيع نافذة طلب التأجيل: أي تيكت نشط مع المندوب قبل تأكيد استلام الأوراق.
-- الموظف أو المدير يظل صاحب قرار الموافقة/الرفض. لا يغيّر هذا الملف سياسة التيكت بعد التحويل.

create or replace function public.courier_ticket_request_reschedule(
  p_ticket_id bigint,
  p_proposed_slot text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_t public.pickup_tickets;
  v_id bigint;
  v_slot text := btrim(coalesce(p_proposed_slot, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_courier() then
    raise exception 'الطلب متاح للمندوب فقط' using errcode = '42501';
  end if;

  select * into v_c
  from public.couriers
  where user_id = (select auth.uid()) and active = true
  limit 1;

  if v_c.id is null then
    raise exception 'حساب المندوب غير مربوط أو غير نشط' using errcode = '42501';
  end if;

  if char_length(v_slot) not between 5 and 160 then
    raise exception 'اكتب الموعد المقترح بشكل واضح (من 5 إلى 160 حرف)' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'اكتب سبب التأجيل (3 حروف على الأقل)' using errcode = '22023';
  end if;

  select * into v_t
  from public.pickup_tickets
  where id = p_ticket_id
  for update;

  if v_t.id is null then
    raise exception 'تيكت الاستلام غير موجود' using errcode = 'P0002';
  end if;
  if v_t.courier_id is distinct from v_c.id then
    raise exception 'التيكت ده مش متعيّن لحضرتك' using errcode = '42501';
  end if;
  if v_t.status <> 'with_courier'
     or v_t.courier_step = 'papers_received' then
    raise exception 'طلب التأجيل متاح للتيكت النشط قبل تأكيد استلام الأوراق فقط' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.pickup_ticket_reschedule_requests r
    where r.ticket_id = v_t.id and r.status = 'pending'
  ) then
    raise exception 'يوجد طلب تأجيل منتظر قرار المكتب بالفعل' using errcode = '23505';
  end if;

  insert into public.pickup_ticket_reschedule_requests
    (ticket_id, courier_id, requested_by, previous_slot, proposed_slot, reason)
  values
    (v_t.id, v_c.id, (select auth.uid()), v_t.slot_pref, v_slot, v_reason)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'request_id', v_id, 'status', 'pending');
end;
$$;

create or replace function public.pickup_ticket_reschedule_resolve(
  p_request_id bigint,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.pickup_ticket_reschedule_requests;
  v_t public.pickup_tickets;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_now timestamptz := now();
begin
  if not (public.is_staff() or public.is_manager()) then
    raise exception 'اعتماد أو رفض التأجيل متاح للمكتب فقط' using errcode = '42501';
  end if;
  if v_decision not in ('approved', 'rejected') then
    raise exception 'القرار غير صالح' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'الملاحظة أطول من المسموح' using errcode = '22023';
  end if;

  select * into v_r
  from public.pickup_ticket_reschedule_requests
  where id = p_request_id
  for update;

  if v_r.id is null then
    raise exception 'طلب التأجيل غير موجود' using errcode = 'P0002';
  end if;
  if v_r.status <> 'pending' then
    raise exception 'تم اتخاذ قرار على طلب التأجيل ده بالفعل' using errcode = '22023';
  end if;

  select * into v_t
  from public.pickup_tickets
  where id = v_r.ticket_id
  for update;

  if v_t.id is null then
    raise exception 'تيكت الاستلام المرتبط بالطلب غير موجود' using errcode = 'P0002';
  end if;

  if v_decision = 'approved'
     and (v_t.status <> 'with_courier' or v_t.courier_step = 'papers_received') then
    raise exception 'التيكت لم يعد يسمح بتطبيق التأجيل؛ راجع حالته قبل القرار' using errcode = '22023';
  end if;

  update public.pickup_ticket_reschedule_requests
  set status = v_decision,
      decision_note = v_note,
      decided_by = (select auth.uid()),
      decided_at = v_now
  where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'تم اتخاذ قرار على طلب التأجيل ده بالفعل' using errcode = '40001';
  end if;

  if v_decision = 'approved' then
    perform set_config('app.pt_trusted', '1', true);
    update public.pickup_tickets
    set slot_pref = v_r.proposed_slot
    where id = v_t.id and status = 'with_courier';
    if not found then
      raise exception 'تعذر تحديث موعد التيكت' using errcode = '40001';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', v_decision,
    'ticket_id', v_t.id,
    'slot_pref', case when v_decision = 'approved' then v_r.proposed_slot else v_t.slot_pref end,
    'decided_at', v_now
  );
end;
$$;

revoke all on function public.courier_ticket_request_reschedule(bigint,text,text) from public, anon;
revoke all on function public.pickup_ticket_reschedule_resolve(bigint,text,text) from public, anon;
grant execute on function public.courier_ticket_request_reschedule(bigint,text,text) to authenticated;
grant execute on function public.pickup_ticket_reschedule_resolve(bigint,text,text) to authenticated;

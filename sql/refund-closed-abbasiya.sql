-- بند 8/9: حالة CLOSED للاسترداد + إخفاء الطلب المسترد المقفول من رادار العباسية (لم يُنفَّذ بعد — ينتظر موافقة محمود)
-- لا يلمس js/42 ولا دوال الاسترداد الحالية. إضافات فقط.
-- الاستثناء: بوابة المنفّذ الآخر (مثل سعد) لا تقرأ من abbasiya_hub_snapshot، فتظل تشوف الطلب مع حالة الاسترداد والسبب.

alter table public.line_refunds
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid;

create or replace function public.line_refund_close(p_id bigint)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.line_refunds%rowtype;
begin
  if not (public.is_manager() or public.is_staff()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into r from public.line_refunds where id = p_id for update;
  if not found then raise exception 'طلب الاسترداد غير موجود'; end if;
  if r.status <> 'approved' then raise exception 'ما ينفعش تقفل إلا بعد اعتماد الاسترداد'; end if;
  if r.closed_at is not null then raise exception 'الطلب مقفول بالفعل'; end if;
  update public.line_refunds set closed_at = now(), closed_by = auth.uid() where id = p_id;
  insert into public.audit_log(user_id, user_name, action, transaction_id, line_id, service, details)
  values (auth.uid(), public.current_author_name(), 'refund_closed', r.transaction_id, r.line_id::text, r.service,
          jsonb_build_object('refund_id', p_id));
end $$;
revoke all on function public.line_refund_close(bigint) from public, anon;
grant execute on function public.line_refund_close(bigint) to authenticated;

-- رادار العباسية: استبعاد البنود المستردة والمقفولة (الباقي زي ما هو بالظبط)
create or replace function public.abbasiya_hub_snapshot(p_day date default ((now() at time zone 'Africa/Cairo'))::date)
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'line_id', l.id,
    'transaction_id', l.transaction_id,
    'client_name', l.client_name,
    'phone', l.phone,
    'service', l.service,
    'qty', l.qty,
    'executor', l.executor,
    'notes', l.notes,
    'received_at', l.received_at,
    'received_date', (l.received_at at time zone 'Africa/Cairo')::date,
    'duration_days', coalesce(l.duration_days, s.duration_days, 1),
    'due_date', ((l.received_at at time zone 'Africa/Cairo')::date + coalesce(l.duration_days, s.duration_days, 1)),
    'complete', coalesce(l.complete, false),
    'under_review', coalesce(l.under_review, false),
    'status', coalesce(l.status, case
      when coalesce(l.complete, false) then 'Complete'
      when coalesce(l.under_review, false) then 'Under Review'
      else 'In Progress'
    end),
    'is_due', (
      coalesce(l.complete, false) = true
      or ((l.received_at at time zone 'Africa/Cairo')::date + coalesce(l.duration_days, s.duration_days, 1)) <= v_day
    )
  ) order by
    coalesce(l.complete, false) desc,
    ((l.received_at at time zone 'Africa/Cairo')::date + coalesce(l.duration_days, s.duration_days, 1)) asc,
    l.received_at asc,
    l.id asc
  ), '[]'::jsonb)
  into v_candidates
  from public.request_lines l
  left join public.services s on public.norm_ar(s.name) = public.norm_ar(l.service)
  where l.deleted_at is null
    and coalesce(l.delivered, false) = false
    and not exists (
      select 1 from public.line_refunds lr
       where lr.line_id = l.id and lr.status = 'approved' and lr.closed_at is not null
    )
    and (
      coalesce(s.delivery_mode, 'home') = 'hub_abbasiya'
      or l.service ilike '%جواز%فوري%'
      or l.service ilike '%عباسية%'
    );

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
  where c.active = true
    and c.user_id is not null
    and coalesce(c.in_ranking, true) = true;

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

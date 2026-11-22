-- =====================================================================
-- sql/courier-ticket-reschedule.sql
-- طلب تأجيل تيكت الاستلام بموافقة المكتب فقط.
-- يُشغّل يدوياً بعد مراحل تيكت الاستلام 3 و4 و5.
-- لا يغيّر الموعد الأصلي عند إرسال الطلب؛ التغيير يتم بعد موافقة المكتب فقط.
-- =====================================================================

create table if not exists public.pickup_ticket_reschedule_requests (
  id bigserial primary key,
  ticket_id bigint not null references public.pickup_tickets(id) on delete cascade,
  courier_id bigint not null references public.couriers(id) on delete restrict,
  requested_by uuid not null default auth.uid(),
  previous_slot text,
  proposed_slot text not null,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  decision_note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (char_length(btrim(proposed_slot)) between 5 and 160),
  check (char_length(btrim(reason)) between 3 and 500),
  check (decision_note is null or char_length(decision_note) <= 500)
);

create unique index if not exists pickup_ticket_reschedule_one_pending_idx
  on public.pickup_ticket_reschedule_requests(ticket_id)
  where status = 'pending';

create index if not exists pickup_ticket_reschedule_courier_recent_idx
  on public.pickup_ticket_reschedule_requests(courier_id, created_at desc);

create index if not exists pickup_ticket_reschedule_pending_recent_idx
  on public.pickup_ticket_reschedule_requests(created_at desc)
  where status = 'pending';

alter table public.pickup_ticket_reschedule_requests enable row level security;

do $
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'pickup_ticket_reschedule_requests'
     ) then
    alter publication supabase_realtime add table public.pickup_ticket_reschedule_requests;
  end if;
end $;

drop policy if exists pickup_ticket_reschedule_staff_select
  on public.pickup_ticket_reschedule_requests;
create policy pickup_ticket_reschedule_staff_select
  on public.pickup_ticket_reschedule_requests
  for select to authenticated
  using (public.is_staff() or public.is_manager());

drop policy if exists pickup_ticket_reschedule_courier_select
  on public.pickup_ticket_reschedule_requests;
create policy pickup_ticket_reschedule_courier_select
  on public.pickup_ticket_reschedule_requests
  for select to authenticated
  using (
    public.is_courier()
    and exists (
      select 1
      from public.couriers c
      where c.id = pickup_ticket_reschedule_requests.courier_id
        and c.user_id = (select auth.uid())
        and c.active = true
    )
  );

-- المندوب يرسل طلباً فقط؛ لا يتم تعديل slot_pref في هذه الدالة.
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
     or v_t.courier_step is null
     or v_t.courier_step not in ('accepted', 'call_attempt', 'on_the_way') then
    raise exception 'طلب التأجيل متاح قبل الوصول للعميل واستلام الأوراق فقط' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.pickup_ticket_reschedule_requests r
    where r.ticket_id = v_t.id and r.status = 'pending'
  ) then
    raise exception 'يوجد طلب تأجيل منتظر قرار المكتب بالفعل' using errcode = '23505';
  end if;

  insert into public.pickup_ticket_reschedule_requests (
    ticket_id, courier_id, requested_by, previous_slot, proposed_slot, reason
  )
  values (
    v_t.id, v_c.id, (select auth.uid()), v_t.slot_pref, v_slot, v_reason
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'request_id', v_id, 'status', 'pending');
end;
$$;

-- قائمة الطلبات المعلّقة للمكتب؛ لا تتضمن أي بيانات مالية.
create or replace function public.pickup_ticket_reschedule_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_staff() or public.is_manager()) then
    raise exception 'عرض طلبات التأجيل متاح للمكتب فقط' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'ticket_id', r.ticket_id,
      'sd_request_id', t.sd_request_id,
      'client_name', t.client_name,
      'courier_name', c.name,
      'previous_slot', r.previous_slot,
      'proposed_slot', r.proposed_slot,
      'reason', r.reason,
      'status', r.status,
      'created_at', r.created_at
    ) order by r.created_at asc)
    from (
      select *
      from public.pickup_ticket_reschedule_requests
      where status = 'pending'
      order by created_at asc
      limit 100
    ) r
    join public.pickup_tickets t on t.id = r.ticket_id
    join public.couriers c on c.id = r.courier_id
  ), '[]'::jsonb);
end;
$$;

-- المندوب يرى طلباته فقط وحالتها، دون بيانات موظفين آخرين.
create or replace function public.courier_my_ticket_reschedule_requests()
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
  where user_id = (select auth.uid()) and active = true
  limit 1;

  if v_c.id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'ticket_id', r.ticket_id,
      'proposed_slot', r.proposed_slot,
      'reason', r.reason,
      'status', r.status,
      'decision_note', r.decision_note,
      'created_at', r.created_at,
      'decided_at', r.decided_at
    ) order by r.created_at desc)
    from (
      select *
      from public.pickup_ticket_reschedule_requests
      where courier_id = v_c.id
        and created_at >= now() - interval '30 days'
      order by created_at desc
      limit 80
    ) r
  ), '[]'::jsonb);
end;
$$;

-- المكتب وحده يعتمد/يرفض. القرار يعمل على pending فقط ولا يمكن تكراره.
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
  if v_decision = 'approved' then
    if v_t.status <> 'with_courier'
       or v_t.courier_step is null
       or v_t.courier_step not in ('accepted', 'call_attempt', 'on_the_way') then
      raise exception 'حالة التيكت لم تعد تسمح بتطبيق التأجيل؛ ارفض الطلب أو راجعه' using errcode = '22023';
    end if;
  end if;

  update public.pickup_ticket_reschedule_requests
  set status = v_decision,
      decision_note = v_note,
      decided_by = (select auth.uid()),
      decided_at = v_now
  where id = p_request_id
    and status = 'pending';

  if not found then
    raise exception 'تم اتخاذ قرار على طلب التأجيل ده بالفعل' using errcode = '40001';
  end if;

  if v_decision = 'approved' then
    -- المرور من Trigger حماية التيكت عبر العلامة المحلية الموثوقة فقط.
    perform set_config('app.pt_trusted', '1', true);
    update public.pickup_tickets
    set slot_pref = v_r.proposed_slot
    where id = v_t.id
      and status = 'with_courier';
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

revoke all on function public.courier_ticket_request_reschedule(bigint, text, text) from public, anon;
revoke all on function public.pickup_ticket_reschedule_requests() from public, anon;
revoke all on function public.courier_my_ticket_reschedule_requests() from public, anon;
revoke all on function public.pickup_ticket_reschedule_resolve(bigint, text, text) from public, anon;

grant execute on function public.courier_ticket_request_reschedule(bigint, text, text) to authenticated;
grant execute on function public.pickup_ticket_reschedule_requests() to authenticated;
grant execute on function public.courier_my_ticket_reschedule_requests() to authenticated;
grant execute on function public.pickup_ticket_reschedule_resolve(bigint, text, text) to authenticated;

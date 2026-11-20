-- =====================================================================
-- sql/courier-tickets-phase6.sql (المرحلة 6: عهدة الأوراق — المكتب ↔ المندوب ↔ العميل)
-- قابل لإعادة التشغيل بأمان (Idempotent) — يُشغّل يدوياً في Supabase SQL Editor
-- الترتيب: يُشغّل بعد sql/courier-tickets-phase5.sql (المرحلة 5).
-- لا يعدّل courier_trips ولا دوال العمولات ولا أي سياسة RLS موجودة.
-- =====================================================================

-- أ) جدول سجل تحركات عهدة الأوراق بين 3 أطراف فقط (office / courier / customer)
create table if not exists public.papers_custody_events (
  id             bigserial primary key,
  ticket_id      bigint not null references public.pickup_tickets(id) on delete cascade,
  from_holder    text not null check (from_holder in ('office', 'courier', 'customer')),
  to_holder      text not null check (to_holder in ('office', 'courier', 'customer')),
  status         text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  requested_by   uuid not null default auth.uid(),
  requested_at   timestamptz not null default now(),
  confirmed_by   uuid,
  confirmed_at   timestamptz,
  recipient_name text,
  note           text,
  check (from_holder <> to_holder),
  check (
    (from_holder = 'office' and to_holder = 'courier')
    or (from_holder = 'courier' and to_holder in ('customer', 'office'))
  )
);

create unique index if not exists papers_custody_events_one_pending_idx
  on public.papers_custody_events (ticket_id)
  where status = 'pending';

create index if not exists papers_custody_events_ticket_idx
  on public.papers_custody_events (ticket_id, requested_at desc);

alter table public.papers_custody_events enable row level security;

drop policy if exists papers_custody_events_staff_select on public.papers_custody_events;
create policy papers_custody_events_staff_select
  on public.papers_custody_events
  for select to authenticated
  using (public.is_staff() or public.is_manager());

drop policy if exists papers_custody_events_courier_select on public.papers_custody_events;
create policy papers_custody_events_courier_select
  on public.papers_custody_events
  for select to authenticated
  using (
    public.is_courier()
    and exists (
      select 1
        from public.pickup_tickets t
        join public.couriers c on c.id = t.courier_id
       where t.id = papers_custody_events.ticket_id
         and c.user_id = auth.uid()
         and c.active = true
    )
  );

-- ب) إضافة عمودي عهدة الأوراق على public.pickup_tickets (بدون لمس سياسات RLS الموجودة)
alter table public.pickup_tickets
  add column if not exists papers_holder text not null default 'office',
  add column if not exists papers_pending_event_id bigint references public.papers_custody_events(id) on delete set null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'pickup_tickets_papers_holder_check'
       and conrelid = 'public.pickup_tickets'::regclass
  ) then
    alter table public.pickup_tickets
      add constraint pickup_tickets_papers_holder_check
      check (papers_holder in ('office', 'courier', 'customer'));
  end if;
end;
$$;

create index if not exists pickup_tickets_papers_pending_idx
  on public.pickup_tickets (papers_pending_event_id)
  where papers_pending_event_id is not null;

-- ج) دالة طلب تسليم الأوراق (office→courier معلّق، courier→customer فوري باسم المستلم، courier→office معلّق)
create or replace function public.papers_request_handover(
  p_ticket_id      bigint,
  p_to_holder      text,
  p_recipient_name text default null,
  p_note           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t           public.pickup_tickets;
  v_c           public.couriers;
  v_to          text := lower(btrim(coalesce(p_to_holder, '')));
  v_from        text;
  v_rec         text := nullif(btrim(coalesce(p_recipient_name, '')), '');
  v_note        text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
  v_ev          public.papers_custody_events;
  v_now         timestamptz := now();
  v_new_holder  text;
  v_new_pending bigint;
begin
  if auth.uid() is null then
    raise exception 'غير مصرح' using errcode = '42501';
  end if;

  if v_to not in ('office', 'courier', 'customer') then
    raise exception 'الطرف المستلم غير صالح' using errcode = '22023';
  end if;

  select * into v_t
    from public.pickup_tickets
   where id = p_ticket_id
   for update;

  if v_t.id is null then
    raise exception 'التيكت غير موجود' using errcode = 'P0002';
  end if;

  v_from := coalesce(v_t.papers_holder, 'office');

  if v_t.papers_pending_event_id is not null
     or exists (select 1 from public.papers_custody_events where ticket_id = v_t.id and status = 'pending') then
    raise exception 'يوجد طلب تسليم أوراق معلق بالفعل على هذا التيكت' using errcode = '22023';
  end if;

  -- 1) المكتب → المندوب (الموظف/المدير يطلب، والمندوب يؤكد لاحقاً؛ قبل التأكيد الحائز يظل office)
  if v_from = 'office' and v_to = 'courier' then
    if not (public.is_manager() or public.is_staff()) then
      raise exception 'طلب تسليم الأوراق للمندوب متاح للموظف أو المدير فقط' using errcode = '42501';
    end if;

    if v_t.status = 'cancelled' then
      raise exception 'لا يمكن تسليم أوراق لمندوب على تيكت ملغي' using errcode = '22023';
    end if;

    if v_t.courier_id is null then
      raise exception 'لازم تعيّن مندوب للتيكت قبل تسليم الأوراق' using errcode = '22023';
    end if;

    select * into v_c
      from public.couriers
     where id = v_t.courier_id
       and active = true
     limit 1;

    if v_c.id is null then
      raise exception 'المندوب المعيّن غير موجود أو غير نشط' using errcode = '22023';
    end if;

    insert into public.papers_custody_events (
      ticket_id, from_holder, to_holder, status, requested_by, requested_at, note
    )
    values (
      v_t.id, 'office', 'courier', 'pending', auth.uid(), v_now, v_note
    )
    returning * into v_ev;

    v_new_holder  := 'office';
    v_new_pending := v_ev.id;

    perform set_config('app.pt_trusted', '1', true);
    update public.pickup_tickets
       set papers_pending_event_id = v_ev.id
     where id = v_t.id;

  -- 2) المندوب → العميل (فوري مع اسم المستلم 2-80 حرف)
  elsif v_from = 'courier' and v_to = 'customer' then
    if not public.is_courier() then
      raise exception 'تسليم الأوراق للعميل متاح للمندوب المعيّن فقط' using errcode = '42501';
    end if;

    select * into v_c
      from public.couriers
     where user_id = auth.uid()
       and active = true
     limit 1;

    if v_c.id is null or v_t.courier_id is distinct from v_c.id then
      raise exception 'التيكت ده مش معيّن لك' using errcode = '42501';
    end if;

    if v_t.status = 'cancelled' then
      raise exception 'التيكت ملغي — استخدم إرجاع الورق للموظف بدلاً من تسليمه للعميل' using errcode = '22023';
    end if;

    if v_rec is null or char_length(v_rec) < 2 or char_length(v_rec) > 80 then
      raise exception 'لازم تكتب اسم المستلم (من 2 إلى 80 حرف)' using errcode = '22023';
    end if;

    insert into public.papers_custody_events (
      ticket_id, from_holder, to_holder, status,
      requested_by, requested_at, confirmed_by, confirmed_at, recipient_name, note
    )
    values (
      v_t.id, 'courier', 'customer', 'confirmed',
      auth.uid(), v_now, auth.uid(), v_now, v_rec, v_note
    )
    returning * into v_ev;

    v_new_holder  := 'customer';
    v_new_pending := null;

    perform set_config('app.pt_trusted', '1', true);
    update public.pickup_tickets
       set papers_holder           = 'customer',
           papers_pending_event_id = null
     where id = v_t.id;

  -- 3) المندوب → المكتب (المندوب يطلب الإرجاع، والموظف/المدير يؤكد لاحقاً؛ متاح حتى لو التيكت ملغي)
  elsif v_from = 'courier' and v_to = 'office' then
    if not public.is_courier() then
      raise exception 'إرجاع الأوراق للموظف متاح للمندوب المعيّن فقط' using errcode = '42501';
    end if;

    select * into v_c
      from public.couriers
     where user_id = auth.uid()
       and active = true
     limit 1;

    if v_c.id is null or v_t.courier_id is distinct from v_c.id then
      raise exception 'التيكت ده مش معيّن لك' using errcode = '42501';
    end if;

    insert into public.papers_custody_events (
      ticket_id, from_holder, to_holder, status, requested_by, requested_at, note
    )
    values (
      v_t.id, 'courier', 'office', 'pending', auth.uid(), v_now, v_note
    )
    returning * into v_ev;

    v_new_holder  := 'courier';
    v_new_pending := v_ev.id;

    perform set_config('app.pt_trusted', '1', true);
    update public.pickup_tickets
       set papers_pending_event_id = v_ev.id
     where id = v_t.id;

  else
    raise exception 'انتقال الأوراق غير مسموح من (%) إلى (%)', v_from, v_to using errcode = '22023';
  end if;

  return jsonb_build_object(
    'ok',                      true,
    'event_id',                v_ev.id,
    'status',                  v_ev.status,
    'papers_holder',           v_new_holder,
    'papers_pending_event_id', v_new_pending
  );
end;
$$;

revoke all on function public.papers_request_handover(bigint, text, text, text) from public, anon;
grant execute on function public.papers_request_handover(bigint, text, text, text) to authenticated;

-- د) دالة تأكيد استلام الأوراق (للطرف المستلم فقط، idempotent)
create or replace function public.papers_confirm_handover(
  p_event_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev  public.papers_custody_events;
  v_t   public.pickup_tickets;
  v_c   public.couriers;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'غير مصرح' using errcode = '42501';
  end if;

  select * into v_ev
    from public.papers_custody_events
   where id = p_event_id
   for update;

  if v_ev.id is null then
    raise exception 'طلب تسليم الأوراق غير موجود' using errcode = 'P0002';
  end if;

  select * into v_t
    from public.pickup_tickets
   where id = v_ev.ticket_id
   for update;

  if v_t.id is null then
    raise exception 'التيكت غير موجود' using errcode = 'P0002';
  end if;

  -- تحقق من صلاحية الطرف المستلم حتى في حالة التكرار (idempotent)
  if v_ev.to_holder = 'courier' then
    if not public.is_courier() then
      raise exception 'تأكيد استلام الأوراق متاح للمندوب المعيّن فقط' using errcode = '42501';
    end if;

    select * into v_c
      from public.couriers
     where user_id = auth.uid()
       and active = true
     limit 1;

    if v_c.id is null or v_t.courier_id is distinct from v_c.id then
      raise exception 'التيكت ده مش معيّن لك' using errcode = '42501';
    end if;

  elsif v_ev.to_holder = 'office' then
    if not (public.is_manager() or public.is_staff()) then
      raise exception 'تأكيد استلام الأوراق في المكتب متاح للموظف أو المدير فقط' using errcode = '42501';
    end if;
  else
    raise exception 'هذا الطلب لا يحتاج تأكيداً إضافياً' using errcode = '22023';
  end if;

  if v_ev.status = 'confirmed' then
    return jsonb_build_object(
      'ok',                true,
      'already_confirmed', true,
      'event_id',          v_ev.id,
      'papers_holder',     v_t.papers_holder,
      'confirmed_at',      v_ev.confirmed_at
    );
  end if;

  if v_ev.status <> 'pending' then
    raise exception 'طلب التسليم غير معلق' using errcode = '22023';
  end if;

  update public.papers_custody_events
     set status       = 'confirmed',
         confirmed_by = auth.uid(),
         confirmed_at = v_now
   where id = v_ev.id;

  perform set_config('app.pt_trusted', '1', true);
  update public.pickup_tickets
     set papers_holder           = v_ev.to_holder,
         papers_pending_event_id = null
   where id = v_t.id;

  return jsonb_build_object(
    'ok',            true,
    'event_id',      v_ev.id,
    'papers_holder', v_ev.to_holder,
    'confirmed_at',  v_now
  );
end;
$$;

revoke all on function public.papers_confirm_handover(bigint) from public, anon;
grant execute on function public.papers_confirm_handover(bigint) to authenticated;

-- هـ) دالة قراءة سجل عهدة الأوراق لتيكت واحد (للموظف/المدير، أو للمندوب على تيكتاته فقط)
create or replace function public.papers_history(
  p_ticket_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_t public.pickup_tickets;
  v_c public.couriers;
begin
  if auth.uid() is null then
    raise exception 'غير مصرح' using errcode = '42501';
  end if;

  select * into v_t
    from public.pickup_tickets
   where id = p_ticket_id;

  if v_t.id is null then
    return '[]'::jsonb;
  end if;

  if public.is_manager() or public.is_staff() then
    null;
  elsif public.is_courier() then
    select * into v_c
      from public.couriers
     where user_id = auth.uid()
       and active = true
     limit 1;
    if v_c.id is null or v_t.courier_id is distinct from v_c.id then
      raise exception 'التيكت ده مش معيّن لك' using errcode = '42501';
    end if;
  else
    raise exception 'غير مصرح' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',                e.id,
      'ticket_id',         e.ticket_id,
      'from_holder',       e.from_holder,
      'to_holder',         e.to_holder,
      'status',            e.status,
      'requested_by',      e.requested_by,
      'requested_by_name', (select p.full_name from public.profiles p where p.id = e.requested_by limit 1),
      'requested_at',      e.requested_at,
      'confirmed_by',      e.confirmed_by,
      'confirmed_by_name', (select p.full_name from public.profiles p where p.id = e.confirmed_by limit 1),
      'confirmed_at',      e.confirmed_at,
      'recipient_name',    e.recipient_name,
      'note',              e.note
    ) order by e.requested_at desc, e.id desc)
    from public.papers_custody_events e
    where e.ticket_id = v_t.id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.papers_history(bigint) from public, anon;
grant execute on function public.papers_history(bigint) to authenticated;

-- و) تحديث courier_my_tickets لإرجاع حقول عهدة الأوراق (papers_holder / papers_pending_*)
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
      'papers_holder', coalesce(t.papers_holder, 'office'),
      'papers_pending_event_id', t.papers_pending_event_id,
      'papers_pending_to', (
        select e.to_holder
          from public.papers_custody_events e
         where e.id = t.papers_pending_event_id
           and e.status = 'pending'
         limit 1
      ),
      'papers_pending_from', (
        select e.from_holder
          from public.papers_custody_events e
         where e.id = t.papers_pending_event_id
           and e.status = 'pending'
         limit 1
      ),
      'papers_pending_at', (
        select e.requested_at
          from public.papers_custody_events e
         where e.id = t.papers_pending_event_id
           and e.status = 'pending'
         limit 1
      ),
      'created_at', t.created_at
    ) order by coalesce(t.converted_at, t.cancelled_at, t.created_at) desc)
    from public.pickup_tickets t
    where t.courier_id = v_c.id
      and (
        t.status = 'with_courier'
        or (t.status = 'cancelled' and t.cancelled_at >= now() - interval '7 days')
        or (t.status = 'converted' and t.converted_at >= now() - interval '7 days')
        or coalesce(t.papers_holder, 'office') = 'courier'
        or t.papers_pending_event_id is not null
      )
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.courier_my_tickets() from public, anon;
grant execute on function public.courier_my_tickets() to authenticated;

-- ز) تريجر إشعارات عهدة الأوراق (kind = 'papers_handover'، بدون رقم تليفون، مع raise warning)
--    - office → courier: إشعار للمندوب المعيّن
--    - courier → office: إشعار لمنشئ التيكت (created_by) + المديرين النشطين فقط
create or replace function public.trg_papers_handover_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t      public.pickup_tickets;
  v_uid    uuid;
  v_client text;
  v_body   text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select * into v_t
    from public.pickup_tickets
   where id = new.ticket_id;

  if v_t.id is null then
    return new;
  end if;

  v_client := coalesce(nullif(btrim(v_t.client_name), ''), 'عميل');

  if new.from_holder = 'office' and new.to_holder = 'courier' then
    if v_t.courier_id is null then
      return new;
    end if;

    select c.user_id into v_uid
      from public.couriers c
     where c.id = v_t.courier_id
       and c.active = true
       and c.user_id is not null
     limit 1;

    if v_uid is null then
      return new;
    end if;

    v_body := left(v_client || ' — افتح التيكت لتأكيد استلام الأوراق', 160);
    begin
      insert into public.notifications (user_id, kind, title, body)
      values (v_uid, 'papers_handover', 'طلب تسليم أوراق لك', v_body);
    exception when others then
      raise warning 'trg_papers_handover_notify (to courier) failed for event %: %', new.id, sqlerrm;
    end;

  elsif new.from_holder = 'courier' and new.to_holder = 'office' then
    v_body := left(v_client || ' — المندوب طلب إرجاع الأوراق للمكتب', 160);
    begin
      insert into public.notifications (user_id, kind, title, body)
      select distinct u.uid, 'papers_handover', 'طلب إرجاع أوراق للمكتب', v_body
        from (
          select v_t.created_by as uid
          union
          select ur.user_id as uid
            from public.user_roles ur
           where ur.role = 'manager'
        ) u
       where u.uid is not null
         and u.uid is distinct from new.requested_by;
    exception when others then
      raise warning 'trg_papers_handover_notify (to office) failed for event %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.trg_papers_handover_notify() from public, anon, authenticated;

drop trigger if exists papers_handover_notify_trg on public.papers_custody_events;
create trigger papers_handover_notify_trg
  after insert on public.papers_custody_events
  for each row execute function public.trg_papers_handover_notify();

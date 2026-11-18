-- =====================================================================
-- sql/courier-phase4.sql (المرحلة 4: بوابة المندوب الميدانية، الأمان، الختم الرقمي،
-- التحويل يد بيد، سجل الوصول بدون لوم، التحصيل المالي المرن، وتقفيل الكاش)
-- قابل لإعادة التشغيل بأمان (Idempotent) — يُشغّل يدوياً في Supabase SQL Editor
-- - لا يكتب ولا يعدّل في request_lines.status نهائياً.
-- - لا يشير إلى أي عمود غير موجود مثل profiles.email (يعتمد فقط على full_name).
-- - يستخدم default auth.uid() مباشرة في أعمدة الجداول، و (select auth.uid()) في سياسات RLS.
-- - RLS مفعّل على كل جدول جديد، وكل الدوال SECURITY DEFINER مع التحقق الصارم من الدور.
-- =====================================================================

-- 1) جدول بوابة ما قبل الانطلاق وحالة القيادة للمندوب (Pre-Departure Gate & Driving Mode)
create table if not exists public.courier_daily_gates (
  id bigserial primary key,
  courier_id bigint not null references public.couriers(id) on delete cascade,
  courier_name text not null,
  gate_day date not null default (now() at time zone 'Africa/Cairo')::date,
  checklist jsonb not null default '{"battery":true,"internet":true,"change_cash":true,"office_papers":true}'::jsonb,
  driving_mode boolean not null default false,
  driving_updated_at timestamptz,
  created_by uuid not null default auth.uid(),
  completed_at timestamptz not null default now(),
  unique (courier_id, gate_day)
);

create index if not exists courier_daily_gates_day_idx on public.courier_daily_gates (gate_day, courier_id);

-- 2) جدول أكواد الختم الرقمي لموظفي المكتب + سجل الأوراق المستلمة بالختم الرقمي (Office Receiver Digital Sign-Off)
create table if not exists public.staff_digital_pins (
  user_id uuid primary key,
  staff_name text not null,
  pin_code text not null default '1234',
  updated_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint staff_digital_pin_chk check (pin_code ~ '^[0-9]{4}$')
);

create table if not exists public.courier_office_handovers (
  id bigserial primary key,
  handover_day date not null default (now() at time zone 'Africa/Cairo')::date,
  courier_id bigint not null references public.couriers(id) on delete cascade,
  courier_name text not null,
  receiver_user_id uuid not null,
  receiver_name text not null,
  transaction_ids text[] not null default '{}',
  items_summary jsonb not null default '[]'::jsonb,
  stamp_code text not null,
  notes text,
  created_by uuid not null default auth.uid(),
  signed_at timestamptz not null default now()
);

create index if not exists courier_office_handovers_day_idx on public.courier_office_handovers (handover_day desc, courier_id);

-- 3) جدول التحويل يد بيد بين المناديب (Hand-to-Hand Courier Transfer)
create table if not exists public.courier_peer_transfers (
  id bigserial primary key,
  transfer_day date not null default (now() at time zone 'Africa/Cairo')::date,
  item_kind text not null default 'tx' check (item_kind in ('tx', 'ticket')),
  transaction_id text not null,
  client_name text,
  from_courier_id bigint not null references public.couriers(id) on delete cascade,
  from_courier_name text not null,
  to_courier_id bigint not null references public.couriers(id) on delete cascade,
  to_courier_name text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists courier_peer_transfers_to_idx on public.courier_peer_transfers (to_courier_id, status, created_at desc);
create index if not exists courier_peer_transfers_from_idx on public.courier_peer_transfers (from_courier_id, status, created_at desc);

-- 4) جدول سجل الوصول بدون لوم (Zero-Blame Arrival Log)
create table if not exists public.courier_zero_blame_logs (
  id bigserial primary key,
  log_day date not null default (now() at time zone 'Africa/Cairo')::date,
  courier_id bigint not null references public.couriers(id) on delete cascade,
  courier_name text not null,
  transaction_id text not null,
  client_name text,
  phone text,
  reason_code text not null check (reason_code in ('no_answer', 'not_home', 'reschedule_asked')),
  reason_label text not null,
  lat numeric(9,6),
  lng numeric(9,6),
  reschedule_sent boolean not null default false,
  created_by uuid not null default auth.uid(),
  arrived_at timestamptz not null default now()
);

create index if not exists courier_zero_blame_day_idx on public.courier_zero_blame_logs (log_day desc, courier_id);

-- 5) جدول أحداث التحصيل المالي الميداني (تحويل كاش -> إنستاباي + الدفع الجزئي)
create table if not exists public.courier_collection_events (
  id bigserial primary key,
  collect_day date not null default (now() at time zone 'Africa/Cairo')::date,
  courier_id bigint not null references public.couriers(id) on delete cascade,
  courier_name text not null,
  item_kind text not null default 'tx' check (item_kind in ('tx', 'ticket')),
  transaction_id text not null,
  client_name text,
  original_amount numeric(12,2) not null default 0,
  collected_amount numeric(12,2) not null default 0,
  remaining_amount numeric(12,2) not null default 0,
  payment_mode text not null check (payment_mode in ('cash_full', 'instapay_switch', 'partial_cash', 'partial_instapay')),
  instapay_ref text,
  notes text,
  created_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (courier_id, collect_day, transaction_id)
);

create index if not exists courier_collection_events_day_idx on public.courier_collection_events (collect_day desc, courier_id);

-- 6) جدول مصافحة تقفيل الكاش آخر اليوم وقفل ما بعد التقفيل (End-of-Day Cash Handshake & Post-Closing Lock)
create table if not exists public.courier_cash_handshakes (
  id bigserial primary key,
  close_day date not null default (now() at time zone 'Africa/Cairo')::date,
  courier_id bigint not null references public.couriers(id) on delete cascade,
  courier_name text not null,
  expected_cash numeric(12,2) not null default 0,
  instapay_total numeric(12,2) not null default 0,
  partial_remaining_total numeric(12,2) not null default 0,
  handed_cash numeric(12,2) not null default 0,
  courier_note text,
  status text not null default 'submitted' check (status in ('submitted', 'confirmed', 'reopened')),
  confirmed_by uuid,
  confirmed_by_name text,
  created_by uuid not null default auth.uid(),
  submitted_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (courier_id, close_day)
);

create index if not exists courier_cash_handshakes_day_idx on public.courier_cash_handshakes (close_day desc, status);

-- 7) تفعيل RLS الصارم على كل الجداول الجديدة
alter table public.courier_daily_gates enable row level security;
alter table public.staff_digital_pins enable row level security;
alter table public.courier_office_handovers enable row level security;
alter table public.courier_peer_transfers enable row level security;
alter table public.courier_zero_blame_logs enable row level security;
alter table public.courier_collection_events enable row level security;
alter table public.courier_cash_handshakes enable row level security;

drop policy if exists cdg_select_staff on public.courier_daily_gates;
create policy cdg_select_staff on public.courier_daily_gates
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));

drop policy if exists sdp_select_staff on public.staff_digital_pins;
create policy sdp_select_staff on public.staff_digital_pins
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));

drop policy if exists coh_select_staff on public.courier_office_handovers;
create policy coh_select_staff on public.courier_office_handovers
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));

drop policy if exists cpt_select_staff on public.courier_peer_transfers;
create policy cpt_select_staff on public.courier_peer_transfers
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));

drop policy if exists czb_select_staff on public.courier_zero_blame_logs;
create policy czb_select_staff on public.courier_zero_blame_logs
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));

drop policy if exists cce_select_staff on public.courier_collection_events;
create policy cce_select_staff on public.courier_collection_events
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));

drop policy if exists cch_select_staff on public.courier_cash_handshakes;
create policy cch_select_staff on public.courier_cash_handshakes
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));

-- 8) دالة مساعدة لحساب إجمالي الكاش المطلوب من المندوب اليوم (مع مراعاة تحويلات إنستاباي والدفع الجزئي)
drop function if exists public.courier_p4_calc_day_totals(bigint, text, date);
create or replace function public.courier_p4_calc_day_totals(
  p_courier_id bigint,
  p_courier_name text,
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
  v_me text := public.norm_ar(p_courier_name);
  v_raw_tx_cash numeric(12,2) := 0;
  v_raw_ticket_cash numeric(12,2) := 0;
  v_instapay_switched numeric(12,2) := 0;
  v_partial_uncollected numeric(12,2) := 0;
  v_net_cash numeric(12,2) := 0;
begin
  select coalesce(sum(t_cod.cod_due), 0)
    into v_raw_tx_cash
    from (
      select distinct ct.transaction_id,
             coalesce((
               select case when max(coalesce(rl.payment_method, '')) ~* 'عند الاستلام|تحصيل|آجل|باقي|cod|كاش'
                           then sum(coalesce(rl.total, coalesce(rl.qty,1)*coalesce(rl.unit_price,0)))
                           else 0 end
               from public.request_lines rl
               where rl.transaction_id = ct.transaction_id and rl.deleted_at is null
             ), 0) as cod_due
      from public.courier_trips ct
      where public.norm_ar(ct.courier) = v_me
        and ct.trip_day = v_day
        and ct.courier_confirmed_at is not null
        and not exists (
          select 1 from public.courier_collection_events ce
          where ce.courier_id = p_courier_id
            and ce.collect_day = v_day
            and ce.transaction_id = ct.transaction_id
        )
    ) t_cod;

  select coalesce(sum(coalesce(pt.collect_amount, 0)), 0)
    into v_raw_ticket_cash
    from public.pickup_tickets pt
   where pt.courier_id = p_courier_id
     and pt.status in ('with_courier', 'converted')
     and pt.payment_status = 'cod_cash'
     and (pt.created_at at time zone 'Africa/Cairo')::date = v_day
     and not exists (
       select 1 from public.courier_collection_events ce
       where ce.courier_id = p_courier_id
         and ce.collect_day = v_day
         and ce.transaction_id = pt.sd_request_id
     );

  select coalesce(sum(case when ce.payment_mode in ('cash_full', 'partial_cash') then ce.collected_amount else 0 end), 0),
         coalesce(sum(case when ce.payment_mode in ('instapay_switch', 'partial_instapay') then ce.collected_amount else 0 end), 0),
         coalesce(sum(ce.remaining_amount), 0)
    into v_net_cash, v_instapay_switched, v_partial_uncollected
    from public.courier_collection_events ce
   where ce.courier_id = p_courier_id
     and ce.collect_day = v_day;

  v_net_cash := coalesce(v_raw_tx_cash, 0) + coalesce(v_raw_ticket_cash, 0) + coalesce(v_net_cash, 0);

  return jsonb_build_object(
    'expected_cash', round(v_net_cash, 2),
    'instapay_total', round(v_instapay_switched, 2),
    'partial_remaining_total', round(v_partial_uncollected, 2)
  );
end;
$$;

-- 9) دالة الحالة الكاملة للمرحلة 4 لبوابة المندوب
drop function if exists public.courier_p4_my_state(date);
create or replace function public.courier_p4_my_state(
  p_day date default (now() at time zone 'Africa/Cairo')::date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Cairo')::date);
  v_gate public.courier_daily_gates;
  v_close public.courier_cash_handshakes;
  v_totals jsonb;
begin
  if not public.is_courier() then
    raise exception 'courier only' using errcode = '42501';
  end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then
    raise exception 'courier not linked' using errcode = '42501';
  end if;

  select * into v_gate from public.courier_daily_gates where courier_id = v_c.id and gate_day = v_day;
  select * into v_close from public.courier_cash_handshakes where courier_id = v_c.id and close_day = v_day;
  v_totals := public.courier_p4_calc_day_totals(v_c.id, v_c.name, v_day);

  return jsonb_build_object(
    'courier_id', v_c.id,
    'courier_name', v_c.name,
    'day', v_day,
    'gate_completed', (v_gate.id is not null),
    'gate_at', v_gate.completed_at,
    'driving_mode', coalesce(v_gate.driving_mode, false),
    'closing', case when v_close.id is null then null else to_jsonb(v_close) end,
    'day_locked', (v_close.id is not null and v_close.status = 'confirmed'),
    'cash_totals', v_totals,
    'staff_list', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', coalesce(nullif(btrim(p.full_name), ''), 'موظف مكتب')
      ) order by p.full_name)
      from public.profiles p
      where coalesce(nullif(btrim(p.full_name), ''), '') <> ''
        and not exists (select 1 from public.couriers cc where cc.user_id = p.id)
    ), '[]'::jsonb),
    'peer_couriers', coalesce((
      select jsonb_agg(jsonb_build_object('id', c2.id, 'name', c2.name) order by c2.name)
      from public.couriers c2
      where c2.active = true and c2.user_id is not null and coalesce(c2.in_ranking, true) = true and c2.id <> v_c.id
    ), '[]'::jsonb),
    'incoming_transfers', coalesce((
      select jsonb_agg(to_jsonb(t.*) order by t.created_at desc)
      from public.courier_peer_transfers t
      where t.to_courier_id = v_c.id and t.status = 'pending'
    ), '[]'::jsonb),
    'outgoing_transfers', coalesce((
      select jsonb_agg(to_jsonb(t.*) order by t.created_at desc)
      from public.courier_peer_transfers t
      where t.from_courier_id = v_c.id and t.transfer_day = v_day
    ), '[]'::jsonb),
    'handovers_today', coalesce((
      select jsonb_agg(to_jsonb(h.*) order by h.signed_at desc)
      from public.courier_office_handovers h
      where h.courier_id = v_c.id and h.handover_day = v_day
    ), '[]'::jsonb),
    'collections_today', coalesce((
      select jsonb_agg(to_jsonb(ce.*) order by ce.updated_at desc)
      from public.courier_collection_events ce
      where ce.courier_id = v_c.id and ce.collect_day = v_day
    ), '[]'::jsonb),
    'zero_blame_today', coalesce((
      select jsonb_agg(to_jsonb(zb.*) order by zb.arrived_at desc)
      from public.courier_zero_blame_logs zb
      where zb.courier_id = v_c.id and zb.log_day = v_day
    ), '[]'::jsonb)
  );
end;
$$;

-- 10) تأكيد بوابة ما قبل الانطلاق (Pre-Departure Gate)
drop function if exists public.courier_p4_complete_gate(jsonb);
create or replace function public.courier_p4_complete_gate(p_checklist jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_day date := (now() at time zone 'Africa/Cairo')::date;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;

  insert into public.courier_daily_gates (courier_id, courier_name, gate_day, checklist, created_by, completed_at)
  values (v_c.id, v_c.name, v_day, coalesce(p_checklist, '{}'::jsonb), auth.uid(), now())
  on conflict (courier_id, gate_day) do update
    set checklist = excluded.checklist, completed_at = now();

  return jsonb_build_object('ok', true, 'day', v_day);
end;
$$;

-- 11) تفعيل / إيقاف وضع القيادة والرد التلقائي (Driving Mode & Auto-Reply)
drop function if exists public.courier_p4_toggle_driving(boolean);
create or replace function public.courier_p4_toggle_driving(p_driving boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_day date := (now() at time zone 'Africa/Cairo')::date;
  v_on boolean := coalesce(p_driving, false);
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;

  insert into public.courier_daily_gates (courier_id, courier_name, gate_day, driving_mode, driving_updated_at, created_by)
  values (v_c.id, v_c.name, v_day, v_on, now(), auth.uid())
  on conflict (courier_id, gate_day) do update
    set driving_mode = v_on, driving_updated_at = now();

  insert into public.courier_dispatch_events (courier_id, courier_name, event_type, payload, status, created_by)
  values (v_c.id, v_c.name, case when v_on then 'waiting' else 'resume' end,
          jsonb_build_object('driving_mode', v_on, 'note', case when v_on then 'في وضع القيادة حالياً، هرد أول ما أقف' else 'متاح للرد' end),
          'ack', auth.uid());

  return jsonb_build_object('ok', true, 'driving_mode', v_on);
end;
$$;

-- 12) الختم الرقمي لاستلام أوراق المكتب من المندوب (Office Receiver Digital Sign-Off)
drop function if exists public.courier_p4_office_digital_signoff(uuid, text, text[], jsonb, text);
create or replace function public.courier_p4_office_digital_signoff(
  p_receiver_id uuid,
  p_pin text,
  p_tx_ids text[],
  p_items_summary jsonb default '[]'::jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_day date := (now() at time zone 'Africa/Cairo')::date;
  v_rec_name text;
  v_saved_pin text;
  v_pin text := btrim(coalesce(p_pin, ''));
  v_stamp text;
  v_tx text;
  v_id bigint;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;
  if p_receiver_id is null or coalesce(array_length(p_tx_ids, 1), 0) = 0 then
    raise exception 'اختر موظف المكتب والأوراق المسلمة أولاً' using errcode = '22023';
  end if;
  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'كود الختم الرقمي للموظف يجب أن يكون 4 أرقام' using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(p.full_name), ''), 'موظف مكتب')
    into v_rec_name
    from public.profiles p
   where p.id = p_receiver_id;
  if v_rec_name is null then
    raise exception 'موظف المكتب غير موجود' using errcode = '22023';
  end if;

  select pin_code into v_saved_pin from public.staff_digital_pins where user_id = p_receiver_id;
  if v_saved_pin is null then
    insert into public.staff_digital_pins (user_id, staff_name, pin_code, updated_by)
    values (p_receiver_id, v_rec_name, v_pin, auth.uid())
    on conflict (user_id) do nothing;
  elsif v_saved_pin <> v_pin then
    raise exception 'كود الختم الرقمي غير صحيح للموظف %', v_rec_name using errcode = '42501';
  end if;

  v_stamp := 'ST-' || to_char(now() at time zone 'Africa/Cairo', 'YYYYMMDD-HH24MI') || '-' || upper(substr(md5(random()::text), 1, 4));

  insert into public.courier_office_handovers (
    handover_day, courier_id, courier_name, receiver_user_id, receiver_name,
    transaction_ids, items_summary, stamp_code, notes, created_by, signed_at
  )
  values (
    v_day, v_c.id, v_c.name, p_receiver_id, v_rec_name,
    p_tx_ids, coalesce(p_items_summary, '[]'::jsonb), v_stamp, nullif(btrim(coalesce(p_notes, '')), ''),
    auth.uid(), now()
  )
  returning id into v_id;

  foreach v_tx in array p_tx_ids loop
    begin
      insert into public.audit_log (transaction_id, action, service, user_name, details)
      values (
        v_tx,
        'updated',
        'استلام أصول بالمكتب (ختم رقمي)',
        v_rec_name,
        jsonb_build_object(
          'الختم_الرقمي', v_stamp,
          'المندوب_المسلم', v_c.name,
          'الموظف_المستلم', v_rec_name
        )
      );
    exception when others then null;
    end;
    begin
      insert into public.tx_comments (transaction_id, author_id, author_name, body)
      values (
        v_tx,
        p_receiver_id,
        v_rec_name,
        'ختم رقمي لاستلام الأوراق بالمكتب (' || v_stamp || ') — استلمها: ' || v_rec_name || ' من المندوب: ' || v_c.name
      );
    exception when others then null;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'stamp_code', v_stamp,
    'receiver_name', v_rec_name,
    'signed_at', now()
  );
end;
$$;

-- 13) طلب تحويل مشوار يد بيد لمندوب زميل (Hand-to-Hand Courier Transfer)
drop function if exists public.courier_p4_request_transfer(text, text, bigint, text);
create or replace function public.courier_p4_request_transfer(
  p_item_kind text,
  p_tx text,
  p_to_courier_id bigint,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.couriers;
  v_to public.couriers;
  v_kind text := case when p_item_kind = 'ticket' then 'ticket' else 'tx' end;
  v_tx text := btrim(coalesce(p_tx, ''));
  v_client text;
  v_id bigint;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_me from public.couriers where user_id = auth.uid() and active;
  if v_me.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;

  select * into v_to from public.couriers where id = p_to_courier_id and active;
  if v_to.id is null or v_to.id = v_me.id then
    raise exception 'اختر مندوب زميل صحيح للتحويل' using errcode = '22023';
  end if;

  if v_kind = 'ticket' then
    select client_name into v_client from public.pickup_tickets where sd_request_id = v_tx limit 1;
  else
    select max(client_name) into v_client from public.request_lines where transaction_id = v_tx and deleted_at is null;
  end if;

  insert into public.courier_peer_transfers (
    item_kind, transaction_id, client_name,
    from_courier_id, from_courier_name, to_courier_id, to_courier_name,
    reason, status, created_by
  )
  values (
    v_kind, v_tx, coalesce(v_client, v_tx),
    v_me.id, v_me.name, v_to.id, v_to.name,
    nullif(btrim(coalesce(p_reason, '')), ''), 'pending', auth.uid()
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'to_courier_name', v_to.name);
end;
$$;

-- 14) قبول أو رفض استلام المشوار المحوّل يد بيد
drop function if exists public.courier_p4_respond_transfer(bigint, text);
create or replace function public.courier_p4_respond_transfer(
  p_transfer_id bigint,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.couriers;
  v_tr public.courier_peer_transfers;
  v_dec text := case when lower(btrim(coalesce(p_decision, ''))) = 'accepted' then 'accepted' else 'rejected' end;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_me from public.couriers where user_id = auth.uid() and active;
  if v_me.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;

  select * into v_tr
    from public.courier_peer_transfers
   where id = p_transfer_id and to_courier_id = v_me.id and status = 'pending';
  if v_tr.id is null then
    raise exception 'طلب التحويل غير موجود أو تم الرد عليه مسبقاً' using errcode = '22023';
  end if;

  update public.courier_peer_transfers
     set status = v_dec, resolved_at = now()
   where id = v_tr.id;

  if v_dec = 'accepted' then
    if v_tr.item_kind = 'ticket' then
      update public.pickup_tickets
         set courier_id = v_me.id, updated_at = now()
       where sd_request_id = v_tr.transaction_id;
    else
      update public.courier_trips
         set courier = v_me.name
       where transaction_id = v_tr.transaction_id
         and public.norm_ar(courier) = public.norm_ar(v_tr.from_courier_name)
         and courier_confirmed_at is null;
    end if;

    begin
      insert into public.audit_log (transaction_id, action, service, user_name, details)
      values (
        v_tr.transaction_id,
        'updated',
        'تحويل يد بيد بين المناديب',
        v_me.name,
        jsonb_build_object('من_المندوب', v_tr.from_courier_name, 'إلى_المندوب', v_me.name, 'السبب', coalesce(v_tr.reason, 'تسليم ميداني'))
      );
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('ok', true, 'status', v_dec, 'transaction_id', v_tr.transaction_id);
end;
$$;

-- 15) تسجيل سجل الوصول بدون لوم (Zero-Blame Arrival Log)
drop function if exists public.courier_p4_log_zero_blame(text, text, numeric, numeric);
create or replace function public.courier_p4_log_zero_blame(
  p_tx text,
  p_reason_code text,
  p_lat numeric default null,
  p_lng numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_tx text := btrim(coalesce(p_tx, ''));
  v_code text := case when p_reason_code in ('no_answer', 'not_home', 'reschedule_asked') then p_reason_code else 'no_answer' end;
  v_label text;
  v_client text;
  v_phone text;
  v_token text;
  v_id bigint;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;

  v_label := case v_code
    when 'no_answer' then 'العميل لا يرد على الهاتف'
    when 'not_home' then 'العميل غير متواجد بالعنوان'
    else 'العميل طلب تأجيل الموعد'
  end;

  select max(client_name), max(phone), max(tracking_token)
    into v_client, v_phone, v_token
    from public.request_lines
   where transaction_id = v_tx and deleted_at is null;

  if v_client is null then
    select client_name, phone into v_client, v_phone
      from public.pickup_tickets
     where sd_request_id = v_tx limit 1;
  end if;

  insert into public.courier_zero_blame_logs (
    courier_id, courier_name, transaction_id, client_name, phone,
    reason_code, reason_label, lat, lng, created_by
  )
  values (
    v_c.id, v_c.name, v_tx, v_client, v_phone,
    v_code, v_label, p_lat, p_lng, auth.uid()
  )
  returning id into v_id;

  begin
    insert into public.tx_comments (transaction_id, author_id, author_name, body)
    values (
      v_tx,
      auth.uid(),
      v_c.name,
      'سجل وصول بدون لوم: وصل المندوب للعميل (' || v_label || ')' ||
      case when p_lat is not null and p_lng is not null then ' — GPS: ' || round(p_lat, 5) || ',' || round(p_lng, 5) else '' end
    );
  exception when others then null;
  end;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'transaction_id', v_tx,
    'client_name', v_client,
    'phone', v_phone,
    'tracking_token', v_token,
    'reason_label', v_label,
    'arrived_at', now()
  );
end;
$$;

-- 16) تسجيل تحصيل مرن (تحويل كاش -> إنستاباي أو دفع جزئي) مع احترام قفل ما بعد التقفيل
drop function if exists public.courier_p4_record_collection(text, text, numeric, numeric, text, text, text);
create or replace function public.courier_p4_record_collection(
  p_item_kind text,
  p_tx text,
  p_original_amount numeric,
  p_collected_amount numeric,
  p_payment_mode text,
  p_instapay_ref text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_day date := (now() at time zone 'Africa/Cairo')::date;
  v_locked boolean := false;
  v_kind text := case when p_item_kind = 'ticket' then 'ticket' else 'tx' end;
  v_tx text := btrim(coalesce(p_tx, ''));
  v_mode text := case when p_payment_mode in ('cash_full', 'instapay_switch', 'partial_cash', 'partial_instapay') then p_payment_mode else 'cash_full' end;
  v_orig numeric(12,2) := greatest(0, coalesce(p_original_amount, 0));
  v_coll numeric(12,2) := greatest(0, coalesce(p_collected_amount, 0));
  v_rem numeric(12,2) := greatest(0, v_orig - v_coll);
  v_client text;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;

  select exists (
    select 1 from public.courier_cash_handshakes h
    where h.courier_id = v_c.id and h.close_day = v_day and h.status = 'confirmed'
  ) into v_locked;

  if v_locked then
    raise exception 'تم تقفيل وتأكيد حساب اليوم من الإدارة — لا يمكن تعديل المبالغ أو طرق الدفع بعد التقفيل' using errcode = '42501';
  end if;

  if v_kind = 'ticket' then
    select client_name into v_client from public.pickup_tickets where sd_request_id = v_tx limit 1;
    if v_mode in ('instapay_switch', 'partial_instapay') then
      update public.pickup_tickets
         set payment_status = 'instapay_on_arrival',
             collect_amount = v_coll,
             updated_at = now()
       where sd_request_id = v_tx and courier_id = v_c.id;
    elsif v_mode = 'partial_cash' then
      update public.pickup_tickets
         set collect_amount = v_coll,
             updated_at = now()
       where sd_request_id = v_tx and courier_id = v_c.id;
    end if;
  else
    select max(client_name) into v_client from public.request_lines where transaction_id = v_tx and deleted_at is null;
  end if;

  insert into public.courier_collection_events (
    collect_day, courier_id, courier_name, item_kind, transaction_id, client_name,
    original_amount, collected_amount, remaining_amount, payment_mode, instapay_ref, notes, created_by, updated_at
  )
  values (
    v_day, v_c.id, v_c.name, v_kind, v_tx, coalesce(v_client, v_tx),
    v_orig, v_coll, v_rem, v_mode, nullif(btrim(coalesce(p_instapay_ref, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(), now()
  )
  on conflict (courier_id, collect_day, transaction_id) do update
    set original_amount = excluded.original_amount,
        collected_amount = excluded.collected_amount,
        remaining_amount = excluded.remaining_amount,
        payment_mode = excluded.payment_mode,
        instapay_ref = excluded.instapay_ref,
        notes = excluded.notes,
        updated_at = now();

  begin
    insert into public.tx_comments (transaction_id, author_id, author_name, body)
    values (
      v_tx,
      auth.uid(),
      v_c.name,
      'تحديث تحصيل ميداني (' ||
      case v_mode
        when 'instapay_switch' then 'تحويل من كاش إلى إنستاباي بالكامل'
        when 'partial_cash' then 'دفع جزئي كاش'
        when 'partial_instapay' then 'دفع جزئي إنستاباي'
        else 'تحصيل كاش كامل'
      end ||
      ') — المحصل: ' || v_coll || ' ج.م من أصل ' || v_orig || ' ج.م (المتبقي: ' || v_rem || ' ج.م)' ||
      case when coalesce(p_instapay_ref, '') <> '' then ' — مرجع إنستاباي: ' || p_instapay_ref else '' end
    );
  exception when others then null;
  end;

  return jsonb_build_object(
    'ok', true,
    'transaction_id', v_tx,
    'payment_mode', v_mode,
    'collected_amount', v_coll,
    'remaining_amount', v_rem,
    'cash_totals', public.courier_p4_calc_day_totals(v_c.id, v_c.name, v_day)
  );
end;
$$;

-- 17) تفصيل فاتورة العميل بدون أي عمولة مندوب أو تكلفة منفذ
drop function if exists public.courier_p4_client_invoice(text);
create or replace function public.courier_p4_client_invoice(p_tx text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_tx text := btrim(coalesce(p_tx, ''));
  v_client text;
  v_phone text;
  v_payment_method text;
  v_lines jsonb;
  v_total numeric(12,2) := 0;
  v_pt public.pickup_tickets;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;

  select * into v_pt from public.pickup_tickets where sd_request_id = v_tx limit 1;
  if v_pt.id is not null then
    return jsonb_build_object(
      'transaction_id', v_pt.sd_request_id,
      'client_name', v_pt.client_name,
      'phone', v_pt.phone,
      'payment_method', case v_pt.payment_status when 'cod_cash' then 'كاش عند الاستلام' when 'instapay_on_arrival' then 'إنستاباي عند الوصول' else 'خالص الدفع' end,
      'items', case when jsonb_typeof(v_pt.items) = 'array' and jsonb_array_length(v_pt.items) > 0 then v_pt.items
                    else jsonb_build_array(jsonb_build_object('service_name', v_pt.service_name, 'qty', coalesce(v_pt.qty, 1), 'line_total', coalesce(v_pt.collect_amount, v_pt.total, 0))) end,
      'total_due', coalesce(v_pt.collect_amount, 0),
      'courier_name', v_c.name
    );
  end if;

  select max(l.client_name), max(l.phone), max(coalesce(l.payment_method, 'كاش')),
         coalesce(jsonb_agg(jsonb_build_object(
           'service_name', l.service,
           'qty', coalesce(l.qty, 1),
           'unit_price', coalesce(l.unit_price, 0),
           'line_total', coalesce(l.total, coalesce(l.qty, 1) * coalesce(l.unit_price, 0))
         ) order by l.id), '[]'::jsonb),
         coalesce(sum(coalesce(l.total, coalesce(l.qty, 1) * coalesce(l.unit_price, 0))), 0)
    into v_client, v_phone, v_payment_method, v_lines, v_total
    from public.request_lines l
   where l.transaction_id = v_tx and l.deleted_at is null;

  return jsonb_build_object(
    'transaction_id', v_tx,
    'client_name', coalesce(v_client, 'عميل تساهيل'),
    'phone', v_phone,
    'payment_method', v_payment_method,
    'items', v_lines,
    'total_due', round(v_total, 2),
    'courier_name', v_c.name
  );
end;
$$;

-- 18) إرسال تقفيل الكاش آخر اليوم بضغطة واحدة
drop function if exists public.courier_p4_submit_cash_closing(text);
create or replace function public.courier_p4_submit_cash_closing(p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_day date := (now() at time zone 'Africa/Cairo')::date;
  v_existing public.courier_cash_handshakes;
  v_totals jsonb;
  v_exp numeric(12,2);
  v_insta numeric(12,2);
  v_part numeric(12,2);
  v_row public.courier_cash_handshakes;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;

  select * into v_existing from public.courier_cash_handshakes where courier_id = v_c.id and close_day = v_day;
  if v_existing.id is not null and v_existing.status = 'confirmed' then
    raise exception 'تم تأكيد تقفيل اليوم بالفعل من الإدارة ولا يمكن إعادة إرساله' using errcode = '42501';
  end if;

  v_totals := public.courier_p4_calc_day_totals(v_c.id, v_c.name, v_day);
  v_exp := coalesce((v_totals->>'expected_cash')::numeric, 0);
  v_insta := coalesce((v_totals->>'instapay_total')::numeric, 0);
  v_part := coalesce((v_totals->>'partial_remaining_total')::numeric, 0);

  insert into public.courier_cash_handshakes (
    close_day, courier_id, courier_name,
    expected_cash, instapay_total, partial_remaining_total, handed_cash,
    courier_note, status, created_by, submitted_at
  )
  values (
    v_day, v_c.id, v_c.name,
    v_exp, v_insta, v_part, v_exp,
    nullif(btrim(coalesce(p_note, '')), ''), 'submitted', auth.uid(), now()
  )
  on conflict (courier_id, close_day) do update
    set expected_cash = excluded.expected_cash,
        instapay_total = excluded.instapay_total,
        partial_remaining_total = excluded.partial_remaining_total,
        handed_cash = excluded.handed_cash,
        courier_note = excluded.courier_note,
        status = 'submitted',
        submitted_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- 19) لوحة متابعة المكتب والرادار للمرحلة 4
drop function if exists public.radar_p4_office_snapshot(date);
create or replace function public.radar_p4_office_snapshot(
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
begin
  if not (public.is_staff() or public.is_manager()) then
    raise exception 'staff or manager only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'day', v_day,
    'my_pin', coalesce((select pin_code from public.staff_digital_pins where user_id = auth.uid()), '1234'),
    'gates', coalesce((
      select jsonb_agg(to_jsonb(g.*) order by g.completed_at desc)
      from public.courier_daily_gates g
      where g.gate_day = v_day
    ), '[]'::jsonb),
    'handovers', coalesce((
      select jsonb_agg(to_jsonb(h.*) order by h.signed_at desc)
      from public.courier_office_handovers h
      where h.handover_day = v_day
    ), '[]'::jsonb),
    'handshakes', coalesce((
      select jsonb_agg(to_jsonb(hs.*) order by hs.submitted_at desc)
      from public.courier_cash_handshakes hs
      where hs.close_day = v_day
    ), '[]'::jsonb),
    'collections', coalesce((
      select jsonb_agg(to_jsonb(ce.*) order by ce.updated_at desc)
      from public.courier_collection_events ce
      where ce.collect_day = v_day
    ), '[]'::jsonb),
    'zero_blame', coalesce((
      select jsonb_agg(to_jsonb(zb.*) order by zb.arrived_at desc)
      from public.courier_zero_blame_logs zb
      where zb.log_day = v_day
    ), '[]'::jsonb),
    'transfers', coalesce((
      select jsonb_agg(to_jsonb(tr.*) order by tr.created_at desc)
      from public.courier_peer_transfers tr
      where tr.transfer_day = v_day
    ), '[]'::jsonb)
  );
end;
$$;

-- 20) حفظ/تغيير كود الختم الرقمي لموظف المكتب (4 أرقام) + تأكيد تقفيل الكاش آخر اليوم من الإدارة (بدون أي إشارة لعمود email)
drop function if exists public.staff_p4_set_my_pin(text);
create or replace function public.staff_p4_set_my_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin text := btrim(coalesce(p_pin, ''));
  v_name text;
begin
  if not (public.is_staff() or public.is_manager()) then
    raise exception 'staff or manager only' using errcode = '42501';
  end if;
  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'كود الختم الرقمي يجب أن يتكون من 4 أرقام فقط' using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(full_name), ''), 'موظف مكتب')
    into v_name from public.profiles where id = auth.uid();

  insert into public.staff_digital_pins (user_id, staff_name, pin_code, updated_by, updated_at)
  values (auth.uid(), coalesce(v_name, 'موظف مكتب'), v_pin, auth.uid(), now())
  on conflict (user_id) do update
    set staff_name = excluded.staff_name,
        pin_code = excluded.pin_code,
        updated_by = auth.uid(),
        updated_at = now();

  return jsonb_build_object('ok', true, 'pin_code', v_pin);
end;
$$;

drop function if exists public.staff_p4_confirm_cash_handshake(bigint, text);
create or replace function public.staff_p4_confirm_cash_handshake(
  p_handshake_id bigint,
  p_action text default 'confirm'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_act text := case when lower(btrim(coalesce(p_action, ''))) = 'reopen' then 'reopened' else 'confirmed' end;
  v_name text;
  v_row public.courier_cash_handshakes;
begin
  if not (public.is_staff() or public.is_manager()) then
    raise exception 'staff or manager only' using errcode = '42501';
  end if;

  select coalesce(nullif(btrim(full_name), ''), 'الإدارة')
    into v_name from public.profiles where id = auth.uid();

  update public.courier_cash_handshakes
     set status = v_act,
         confirmed_by = auth.uid(),
         confirmed_by_name = coalesce(v_name, 'الإدارة'),
         confirmed_at = now()
   where id = p_handshake_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'سجل التقفيل غير موجود' using errcode = '22023';
  end if;

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.courier_p4_calc_day_totals(bigint, text, date) to authenticated;
grant execute on function public.courier_p4_my_state(date) to authenticated;
grant execute on function public.courier_p4_complete_gate(jsonb) to authenticated;
grant execute on function public.courier_p4_toggle_driving(boolean) to authenticated;
grant execute on function public.courier_p4_office_digital_signoff(uuid, text, text[], jsonb, text) to authenticated;
grant execute on function public.courier_p4_request_transfer(text, text, bigint, text) to authenticated;
grant execute on function public.courier_p4_respond_transfer(bigint, text) to authenticated;
grant execute on function public.courier_p4_log_zero_blame(text, text, numeric, numeric) to authenticated;
grant execute on function public.courier_p4_record_collection(text, text, numeric, numeric, text, text, text) to authenticated;
grant execute on function public.courier_p4_client_invoice(text) to authenticated;
grant execute on function public.courier_p4_submit_cash_closing(text) to authenticated;
grant execute on function public.radar_p4_office_snapshot(date) to authenticated;
grant execute on function public.staff_p4_set_my_pin(text) to authenticated;
grant execute on function public.staff_p4_confirm_cash_handshake(bigint, text) to authenticated;

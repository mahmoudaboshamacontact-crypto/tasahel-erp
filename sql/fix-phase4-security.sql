-- =====================================================================
-- sql/fix-phase4-security.sql  (إصلاح أمان ومالية المرحلة 4)
-- يُشغَّل في Supabase SQL Editor *بعد* courier-phase4.sql — قابل لإعادة التشغيل (Idempotent).
-- ⚠ لا تعيد تشغيل courier-phase4.sql بعد هذا الملف (هيرجّع النسخ القديمة)؛ لو اتشغّل بالغلط شغّل ده تاني.
--
-- اللي بيصلحه:
--  1) courier_p4_calc_day_totals: تحقق ملكية + revoke من anon/PUBLIC + حساب COD لكل بند (مش max).
--  2) تحقق ملكية المعاملة في: client_invoice / log_zero_blame / request_transfer / record_collection / signoff.
--  3) record_collection: المبلغ الأصلي بيتحسب من السيرفر، رفض القيم الغلط، وتاريخ لتعديلات التحصيل.
--  4) submit_cash_closing: تسجيل المبلغ المسلَّم فعليًا + الفرق (ومعاه ملاحظة إجبارية لو فيه فرق).
--  5) الختم الرقمي: PIN مشفّر (bcrypt) ومخفي عن الكل + حد محاولات + بدون ابتلاع أخطاء التدقيق.
--  6) respond_transfer: قرار واحد على pending + نقل الملكية والحالة في عملية واحدة.
--  7) بوابة الانطلاق: لازم 4 بنود كلها true، و toggle_driving ما بيعتبرش البوابة مكتملة.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- A) تعديلات الجداول
-- ---------------------------------------------------------------------

-- A1) البوابة: عمود تأكيد صريح + إلغاء الـ default اللي كان بيخلّي كل البنود true
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'courier_daily_gates' and column_name = 'gate_confirmed') then
    alter table public.courier_daily_gates add column gate_confirmed boolean not null default false;
    -- السجلات القديمة (قبل اليوم) تاريخية وتعتبر مؤكدة؛ سجلات اليوم تفضل غير مؤكدة لحد ما المندوب يعدّي البوابة
    update public.courier_daily_gates set gate_confirmed = true
     where gate_day < (now() at time zone 'Africa/Cairo')::date;
  end if;
end $$;
alter table public.courier_daily_gates alter column checklist set default '{}'::jsonb;

-- A2) الأكواد الرقمية: تخزين hash فقط
alter table public.staff_digital_pins add column if not exists pin_hash text;
alter table public.staff_digital_pins add column if not exists failed_attempts integer not null default 0;
alter table public.staff_digital_pins add column if not exists locked_until timestamptz;
alter table public.staff_digital_pins alter column pin_code drop not null;
alter table public.staff_digital_pins alter column pin_code drop default;
alter table public.staff_digital_pins drop constraint if exists staff_digital_pin_chk;

-- الأكواد اللي الموظف عملها بنفسه تتحوّل لـ hash؛ اللي اتعملت تلقائيًا بمعرفة المندوب (أو الافتراضي) تتشال
update public.staff_digital_pins
   set pin_hash = extensions.crypt(pin_code, extensions.gen_salt('bf'))
 where pin_hash is null and pin_code is not null and updated_by = user_id;
delete from public.staff_digital_pins where pin_hash is null;
update public.staff_digital_pins set pin_code = null where pin_code is not null;

alter table public.staff_digital_pins drop constraint if exists staff_digital_pin_no_plain;
alter table public.staff_digital_pins add constraint staff_digital_pin_no_plain check (pin_code is null);
alter table public.staff_digital_pins drop constraint if exists staff_digital_pin_hash_required;
alter table public.staff_digital_pins add constraint staff_digital_pin_hash_required check (pin_hash is not null);

-- الجدول ما يتقراش من المتصفح خالص؛ الوصول عن طريق الدوال فقط
drop policy if exists sdp_select_staff on public.staff_digital_pins;
revoke all on public.staff_digital_pins from anon, authenticated;

-- A3) تقفيل الكاش: الفرق بين المتوقع والمسلَّم فعليًا
alter table public.courier_cash_handshakes add column if not exists diff_cash numeric(12,2) not null default 0;

-- A4) تاريخ تعديلات التحصيل (بدل ما ON CONFLICT يمسح القديم)
create table if not exists public.courier_collection_history (
  id bigserial primary key,
  event_id bigint not null,
  courier_id bigint not null,
  collect_day date not null,
  transaction_id text not null,
  original_amount numeric(12,2),
  collected_amount numeric(12,2),
  remaining_amount numeric(12,2),
  payment_mode text,
  instapay_ref text,
  notes text,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
alter table public.courier_collection_history enable row level security;
drop policy if exists cch_hist_select_staff on public.courier_collection_history;
create policy cch_hist_select_staff on public.courier_collection_history
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));
revoke insert, update, delete on public.courier_collection_history from anon, authenticated;
revoke all on public.courier_collection_history from anon;

create or replace function public.courier_p4_collection_history_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.courier_collection_history (
    event_id, courier_id, collect_day, transaction_id, original_amount, collected_amount,
    remaining_amount, payment_mode, instapay_ref, notes
  ) values (
    old.id, old.courier_id, old.collect_day, old.transaction_id, old.original_amount, old.collected_amount,
    old.remaining_amount, old.payment_mode, old.instapay_ref, old.notes
  );
  return new;
end;
$$;
drop trigger if exists courier_collection_events_hist on public.courier_collection_events;
create trigger courier_collection_events_hist
  before update on public.courier_collection_events
  for each row execute function public.courier_p4_collection_history_fn();

-- منع طلبين تحويل pending لنفس العنصر (أولًا: أي تكرار قديم يتلغي ما عدا الأحدث)
update public.courier_peer_transfers t set status = 'cancelled', resolved_at = now()
 where t.status = 'pending'
   and exists (select 1 from public.courier_peer_transfers n
                where n.item_kind = t.item_kind and n.transaction_id = t.transaction_id
                  and n.status = 'pending' and n.id > t.id);
create unique index if not exists courier_peer_transfers_one_pending
  on public.courier_peer_transfers (item_kind, transaction_id) where status = 'pending';

-- A5) trigger التيكتات كان بيمنع غير المدير من تغيير courier_id/collect_amount حتى من دوال SECURITY DEFINER
--     (يعني تحويل التيكت بين المناديب والتحصيل الجزئي وإنقاذ المشاوير كانت بتفشل لغير المدير).
--     الحل: استثناء بعلامة transaction-local ما تتفعّلش إلا من جوّه الدوال الموثوقة (المتصفح مالوش وصول لـ set_config).
create or replace function public.trg_pickup_tickets_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items_total numeric(12,2);
begin
  new.sd_request_id := btrim(coalesce(new.sd_request_id, ''));
  new.sd_service_id := nullif(btrim(coalesce(new.sd_service_id, '')), '');
  new.client_name := left(btrim(coalesce(new.client_name, '')), 160);
  new.phone := left(btrim(coalesce(new.phone, '')), 30);
  new.address := nullif(left(btrim(coalesce(new.address, '')), 400), '');
  new.zone := nullif(left(btrim(coalesce(new.zone, '')), 100), '');
  new.service_name := left(btrim(coalesce(new.service_name, '')), 200);
  new.staff_notes := nullif(left(btrim(coalesce(new.staff_notes, '')), 800), '');
  new.summary_comment := nullif(left(btrim(coalesce(new.summary_comment, '')), 1800), '');
  if new.items is null or jsonb_typeof(new.items) <> 'array' then
    new.items := '[]'::jsonb;
  end if;

  if tg_op = 'INSERT' then
    if jsonb_array_length(new.items) > 0 then
      select coalesce(sum(
        greatest(0, coalesce((elem->>'unit_price')::numeric, 0)) *
        greatest(1, least(500, coalesce((elem->>'qty')::integer, 1)))
      ), 0)
      into v_items_total
      from jsonb_array_elements(new.items) as elem;
      new.total := round(v_items_total, 2);
    else
      new.total := round(coalesce(new.unit_price, 0) * coalesce(new.qty, 1), 2);
    end if;

    if new.payment_status = 'paid' then
      new.collect_amount := 0;
    else
      new.collect_amount := round(greatest(0, coalesce(nullif(new.collect_amount, 0), new.total)), 2);
    end if;

    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'converted' then
      raise exception 'converted ticket cannot be modified' using errcode = '42501';
    end if;

    -- الدوال الموثوقة (تحويل مشوار/تحصيل/إنقاذ/تحويل تيكت) بتفعّل العلامة دي جوّه الـ transaction بتاعتها بعد ما تتحقق من الصلاحيات بنفسها
    if not public.is_manager() and coalesce(current_setting('app.pt_trusted', true), '') <> '1' then
      if new.sd_request_id is distinct from old.sd_request_id
         or new.sd_service_id is distinct from old.sd_service_id
         or new.client_name is distinct from old.client_name
         or new.phone is distinct from old.phone
         or new.address is distinct from old.address
         or new.zone is distinct from old.zone
         or new.service_name is distinct from old.service_name
         or new.qty is distinct from old.qty
         or new.unit_price is distinct from old.unit_price
         or new.total is distinct from old.total
         or new.executor is distinct from old.executor
         or new.slot_pref is distinct from old.slot_pref
         or new.courier_id is distinct from old.courier_id
         or new.items is distinct from old.items
         or new.payment_status is distinct from old.payment_status
         or new.collect_amount is distinct from old.collect_amount
         or new.created_by is distinct from old.created_by then
        raise exception 'staff can only update status, notes, call_checks, or conversion fields' using errcode = '42501';
      end if;
    else
      if jsonb_array_length(new.items) > 0 then
        select coalesce(sum(
          greatest(0, coalesce((elem->>'unit_price')::numeric, 0)) *
          greatest(1, least(500, coalesce((elem->>'qty')::integer, 1)))
        ), 0)
        into v_items_total
        from jsonb_array_elements(new.items) as elem;
        new.total := round(v_items_total, 2);
      else
        new.total := round(coalesce(new.unit_price, 0) * coalesce(new.qty, 1), 2);
      end if;

      if new.payment_status = 'paid' then
        new.collect_amount := 0;
      end if;
    end if;

    if new.status = 'converted' and old.status <> 'converted' then
      new.converted_at := coalesce(new.converted_at, now());
      new.converted_by := coalesce(new.converted_by, auth.uid());
    end if;

    new.updated_at := now();
    return new;
  end if;

  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- B) دوال داخلية (مش متاحة للمتصفح، بتتنادى من الدوال الأخرى فقط)
-- ---------------------------------------------------------------------

-- مبلغ التحصيل (COD) لمعاملة: مجموع البنود اللي طريقة دفعها عند الاستلام — لكل بند بشكل مستقل
create or replace function public.courier_p4_cod_due(p_tx text)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(
           case when coalesce(rl.payment_method, '') ~* 'عند الاستلام|تحصيل|آجل|باقي|cod|كاش'
                then coalesce(rl.total, coalesce(rl.qty, 1) * coalesce(rl.unit_price, 0))
                else 0 end), 0)::numeric(12,2)
    from public.request_lines rl
   where rl.transaction_id = p_tx and rl.deleted_at is null
$$;

-- هل العنصر (معاملة/تيكت) تابع للمندوب ده؟  p_kind: 'tx' | 'ticket' | null (أي واحد)
create or replace function public.courier_p4_owns_item(p_courier_id bigint, p_courier_name text, p_tx text, p_kind text default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    (coalesce(p_kind, 'ticket') = 'ticket'
      and exists (select 1 from public.pickup_tickets pt
                   where pt.sd_request_id = p_tx and pt.courier_id = p_courier_id and pt.status <> 'cancelled'))
    or
    (coalesce(p_kind, 'tx') = 'tx'
      and (exists (select 1 from public.courier_trips t
                    where t.transaction_id = p_tx and public.norm_ar(t.courier) = public.norm_ar(p_courier_name))
        or exists (select 1 from public.request_lines l
                    where l.transaction_id = p_tx and l.deleted_at is null
                      and public.norm_ar(l.service) like 'رسوم توصيل%'
                      and public.norm_ar(l.executor) = public.norm_ar(p_courier_name))))
$$;

-- حساب إجمالي الكاش اليومي (النواة): بدون أي تحقق صلاحيات — للاستخدام الداخلي فقط
create or replace function public.courier_p4_calc_day_totals_core(
  p_courier_id bigint, p_courier_name text, p_day date
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Cairo')::date);
  v_me text := public.norm_ar(p_courier_name);
  v_raw_tx_cash numeric(12,2) := 0;
  v_raw_ticket_cash numeric(12,2) := 0;
  v_instapay_switched numeric(12,2) := 0;
  v_partial_uncollected numeric(12,2) := 0;
  v_net_cash numeric(12,2) := 0;
begin
  select coalesce(sum(public.courier_p4_cod_due(x.transaction_id)), 0)
    into v_raw_tx_cash
    from (
      select distinct ct.transaction_id
        from public.courier_trips ct
       where public.norm_ar(ct.courier) = v_me
         and ct.trip_day = v_day
         and ct.courier_confirmed_at is not null
         and not exists (
           select 1 from public.courier_collection_events ce
            where ce.courier_id = p_courier_id and ce.collect_day = v_day and ce.transaction_id = ct.transaction_id)
    ) x;

  select coalesce(sum(coalesce(pt.collect_amount, 0)), 0)
    into v_raw_ticket_cash
    from public.pickup_tickets pt
   where pt.courier_id = p_courier_id
     and pt.status in ('with_courier', 'converted')
     and pt.payment_status = 'cod_cash'
     and (pt.created_at at time zone 'Africa/Cairo')::date = v_day
     and not exists (
       select 1 from public.courier_collection_events ce
        where ce.courier_id = p_courier_id and ce.collect_day = v_day and ce.transaction_id = pt.sd_request_id);

  select coalesce(sum(case when ce.payment_mode in ('cash_full', 'partial_cash') then ce.collected_amount else 0 end), 0),
         coalesce(sum(case when ce.payment_mode in ('instapay_switch', 'partial_instapay') then ce.collected_amount else 0 end), 0),
         coalesce(sum(ce.remaining_amount), 0)
    into v_net_cash, v_instapay_switched, v_partial_uncollected
    from public.courier_collection_events ce
   where ce.courier_id = p_courier_id and ce.collect_day = v_day;

  v_net_cash := coalesce(v_raw_tx_cash, 0) + coalesce(v_raw_ticket_cash, 0) + coalesce(v_net_cash, 0);

  return jsonb_build_object(
    'expected_cash', round(v_net_cash, 2),
    'instapay_total', round(v_instapay_switched, 2),
    'partial_remaining_total', round(v_partial_uncollected, 2)
  );
end;
$$;

-- النسخة العامة: لازم المستدعي موظف/مدير أو المندوب صاحب الحساب نفسه (الاسم بيتاخد من جدول المناديب مش من المستدعي)
create or replace function public.courier_p4_calc_day_totals(
  p_courier_id bigint,
  p_courier_name text,
  p_day date default (now() at time zone 'Africa/Cairo')::date
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_c public.couriers;
begin
  if auth.uid() is null then raise exception 'auth required' using errcode = '42501'; end if;
  select * into v_c from public.couriers where id = p_courier_id;
  if v_c.id is null then raise exception 'courier not found' using errcode = '22023'; end if;
  if not (public.is_staff() or public.is_manager()) then
    if not (public.is_courier() and v_c.user_id = auth.uid()) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;
  return public.courier_p4_calc_day_totals_core(v_c.id, v_c.name, p_day);
end;
$$;

-- ---------------------------------------------------------------------
-- C) حالة المندوب + البوابة + وضع القيادة
-- ---------------------------------------------------------------------

create or replace function public.courier_p4_my_state(
  p_day date default (now() at time zone 'Africa/Cairo')::date
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Cairo')::date);
  v_gate public.courier_daily_gates;
  v_close public.courier_cash_handshakes;
  v_totals jsonb;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;

  select * into v_gate from public.courier_daily_gates where courier_id = v_c.id and gate_day = v_day;
  select * into v_close from public.courier_cash_handshakes where courier_id = v_c.id and close_day = v_day;
  v_totals := public.courier_p4_calc_day_totals_core(v_c.id, v_c.name, v_day);

  return jsonb_build_object(
    'courier_id', v_c.id,
    'courier_name', v_c.name,
    'day', v_day,
    'gate_completed', coalesce(v_gate.gate_confirmed, false),
    'gate_at', case when coalesce(v_gate.gate_confirmed, false) then v_gate.completed_at else null end,
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
        and not exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role in ('courier', 'partner'))
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

create or replace function public.courier_p4_complete_gate(p_checklist jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_day date := (now() at time zone 'Africa/Cairo')::date;
  v_chk jsonb := coalesce(p_checklist, '{}'::jsonb);
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;

  if jsonb_typeof(v_chk) <> 'object'
     or coalesce(v_chk->>'battery', '') <> 'true'
     or coalesce(v_chk->>'internet', '') <> 'true'
     or coalesce(v_chk->>'change_cash', '') <> 'true'
     or coalesce(v_chk->>'office_papers', '') <> 'true' then
    raise exception 'أكمل بنود الجاهزية الأربعة قبل بدء اليوم' using errcode = '22023';
  end if;

  insert into public.courier_daily_gates (courier_id, courier_name, gate_day, checklist, gate_confirmed, created_by, completed_at)
  values (v_c.id, v_c.name, v_day,
          jsonb_build_object('battery', true, 'internet', true, 'change_cash', true, 'office_papers', true),
          true, auth.uid(), now())
  on conflict (courier_id, gate_day) do update
    set checklist = excluded.checklist, gate_confirmed = true, completed_at = now();

  return jsonb_build_object('ok', true, 'day', v_day);
end;
$$;

create or replace function public.courier_p4_toggle_driving(p_driving boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_day date := (now() at time zone 'Africa/Cairo')::date;
  v_on boolean := coalesce(p_driving, false);
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;

  -- لو مفيش سجل بوابة لليوم، بيتعمل غير مؤكد (gate_confirmed=false) وبدون بنود جاهزية
  insert into public.courier_daily_gates (courier_id, courier_name, gate_day, checklist, gate_confirmed, driving_mode, driving_updated_at, created_by)
  values (v_c.id, v_c.name, v_day, '{}'::jsonb, false, v_on, now(), auth.uid())
  on conflict (courier_id, gate_day) do update
    set driving_mode = v_on, driving_updated_at = now();

  insert into public.courier_dispatch_events (courier_id, courier_name, event_type, payload, status, created_by)
  values (v_c.id, v_c.name, case when v_on then 'waiting' else 'resume' end,
          jsonb_build_object('driving_mode', v_on, 'note', case when v_on then 'في وضع القيادة حالياً، هرد أول ما أقف' else 'متاح للرد' end),
          'ack', auth.uid());

  return jsonb_build_object('ok', true, 'driving_mode', v_on);
end;
$$;

-- ---------------------------------------------------------------------
-- D) الختم الرقمي + كود الموظف
-- ---------------------------------------------------------------------

create or replace function public.courier_p4_office_digital_signoff(
  p_receiver_id uuid,
  p_pin text,
  p_tx_ids text[],
  p_items_summary jsonb default '[]'::jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_c public.couriers;
  v_day date := (now() at time zone 'Africa/Cairo')::date;
  v_rec_name text;
  v_pin text := btrim(coalesce(p_pin, ''));
  v_row public.staff_digital_pins;
  v_ids text[];
  v_stamp text;
  v_tx text;
  v_id bigint;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;

  select coalesce(array_agg(distinct btrim(x)), '{}') into v_ids
    from unnest(coalesce(p_tx_ids, '{}')) as x where btrim(coalesce(x, '')) <> '';
  if p_receiver_id is null or coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'اختر موظف المكتب والأوراق المسلمة أولاً' using errcode = '22023';
  end if;
  if array_length(v_ids, 1) > 50 then
    raise exception 'الحد الأقصى 50 معاملة في الختم الواحد' using errcode = '22023';
  end if;
  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'كود الختم الرقمي للموظف يجب أن يكون 4 أرقام' using errcode = '22023';
  end if;

  -- المستلم لازم يكون موظف مكتب (مش مندوب ولا شريك)
  if exists (select 1 from public.couriers cc where cc.user_id = p_receiver_id)
     or exists (select 1 from public.user_roles ur where ur.user_id = p_receiver_id and ur.role in ('courier', 'partner')) then
    raise exception 'المستلم لازم يكون موظف مكتب' using errcode = '22023';
  end if;
  select coalesce(nullif(btrim(p.full_name), ''), 'موظف مكتب') into v_rec_name
    from public.profiles p where p.id = p_receiver_id;
  if v_rec_name is null then
    raise exception 'موظف المكتب غير موجود' using errcode = '22023';
  end if;

  -- كل معاملة في القائمة لازم تكون تابعة للمندوب
  foreach v_tx in array v_ids loop
    if not public.courier_p4_owns_item(v_c.id, v_c.name, v_tx, null) then
      raise exception 'المعاملة % مش ضمن مشاويرك', v_tx using errcode = '42501';
    end if;
  end loop;

  -- التحقق من الكود (مع حد محاولات: 5 غلط = قفل 15 دقيقة). الغلط بيرجع ok=false (مش exception) عشان عدّاد المحاولات يتحفظ
  select * into v_row from public.staff_digital_pins where user_id = p_receiver_id for update;
  if v_row.user_id is null or v_row.pin_hash is null then
    raise exception 'الموظف % لم ينشئ كود الختم بعد — لازم يضبطه بنفسه من شاشة العمليات', v_rec_name using errcode = '22023';
  end if;
  if v_row.locked_until is not null and v_row.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'كود الختم مقفول مؤقتًا بسبب محاولات خاطئة — جرّب بعد قليل');
  end if;
  if extensions.crypt(v_pin, v_row.pin_hash) <> v_row.pin_hash then
    update public.staff_digital_pins
       set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
     where user_id = p_receiver_id;
    return jsonb_build_object('ok', false, 'error', 'كود الختم الرقمي غير صحيح');
  end if;
  update public.staff_digital_pins set failed_attempts = 0, locked_until = null where user_id = p_receiver_id;

  v_stamp := 'ST-' || to_char(now() at time zone 'Africa/Cairo', 'YYYYMMDD-HH24MI') || '-' || upper(substr(md5(random()::text), 1, 4));

  insert into public.courier_office_handovers (
    handover_day, courier_id, courier_name, receiver_user_id, receiver_name,
    transaction_ids, items_summary, stamp_code, notes, created_by, signed_at
  )
  values (
    v_day, v_c.id, v_c.name, p_receiver_id, v_rec_name,
    v_ids, coalesce(p_items_summary, '[]'::jsonb), v_stamp, nullif(btrim(coalesce(p_notes, '')), ''),
    auth.uid(), now()
  )
  returning id into v_id;

  -- أي فشل في التدقيق/التعليق بيلغي الختم كله (مفيش ختم من غير أثر مسجّل)
  foreach v_tx in array v_ids loop
    insert into public.audit_log (transaction_id, action, service, user_name, details)
    values (v_tx, 'updated', 'استلام أصول بالمكتب (ختم رقمي)', v_rec_name,
            jsonb_build_object('الختم_الرقمي', v_stamp, 'المندوب_المسلم', v_c.name, 'الموظف_المستلم', v_rec_name));
    insert into public.tx_comments (transaction_id, author_id, author_name, body)
    values (v_tx, p_receiver_id, v_rec_name,
            'ختم رقمي لاستلام الأوراق بالمكتب (' || v_stamp || ') — استلمها: ' || v_rec_name || ' من المندوب: ' || v_c.name);
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id, 'stamp_code', v_stamp, 'receiver_name', v_rec_name, 'signed_at', now());
end;
$$;

create or replace function public.staff_p4_set_my_pin(p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pin text := btrim(coalesce(p_pin, ''));
  v_name text;
begin
  if not (public.is_staff() or public.is_manager()) then
    raise exception 'staff or manager only' using errcode = '42501';
  end if;
  if public.is_courier() then
    raise exception 'staff or manager only' using errcode = '42501';
  end if;
  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'كود الختم الرقمي يجب أن يتكون من 4 أرقام فقط' using errcode = '22023';
  end if;
  if v_pin in ('1234', '4321', '0000') or v_pin ~ '^(.)\1{3}$' then
    raise exception 'اختر كود أصعب في التخمين (مش 1234 ولا أرقام متكررة)' using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(full_name), ''), 'موظف مكتب') into v_name from public.profiles where id = auth.uid();

  insert into public.staff_digital_pins (user_id, staff_name, pin_code, pin_hash, failed_attempts, locked_until, updated_by, updated_at)
  values (auth.uid(), coalesce(v_name, 'موظف مكتب'), null, extensions.crypt(v_pin, extensions.gen_salt('bf')), 0, null, auth.uid(), now())
  on conflict (user_id) do update
    set staff_name = excluded.staff_name,
        pin_hash = excluded.pin_hash,
        pin_code = null,
        failed_attempts = 0,
        locked_until = null,
        updated_by = auth.uid(),
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- E) التحويل بين المناديب
-- ---------------------------------------------------------------------

create or replace function public.courier_p4_request_transfer(
  p_item_kind text,
  p_tx text,
  p_to_courier_id bigint,
  p_reason text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
  if v_tx = '' then raise exception 'رقم المعاملة مطلوب' using errcode = '22023'; end if;

  select * into v_to from public.couriers where id = p_to_courier_id and active;
  if v_to.id is null or v_to.id = v_me.id then
    raise exception 'اختر مندوب زميل صحيح للتحويل' using errcode = '22023';
  end if;

  if not public.courier_p4_owns_item(v_me.id, v_me.name, v_tx, v_kind) then
    raise exception 'المشوار ده مش تابع ليك عشان تحوّله' using errcode = '42501';
  end if;
  if exists (select 1 from public.courier_peer_transfers where item_kind = v_kind and transaction_id = v_tx and status = 'pending') then
    raise exception 'فيه طلب تحويل معلّق بالفعل على المشوار ده' using errcode = '22023';
  end if;

  if v_kind = 'ticket' then
    select client_name into v_client from public.pickup_tickets where sd_request_id = v_tx and courier_id = v_me.id limit 1;
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

create or replace function public.courier_p4_respond_transfer(
  p_transfer_id bigint,
  p_decision text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me public.couriers;
  v_tr public.courier_peer_transfers;
  v_dec text := lower(btrim(coalesce(p_decision, '')));
  v_n integer;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_me from public.couriers where user_id = auth.uid() and active;
  if v_me.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;
  if v_dec not in ('accepted', 'rejected') then
    raise exception 'قرار غير صالح' using errcode = '22023';
  end if;

  -- قفل الصف: طلبين متزامنين على نفس التحويل ما يعديوش الاتنين
  select * into v_tr
    from public.courier_peer_transfers
   where id = p_transfer_id and to_courier_id = v_me.id and status = 'pending'
   for update;
  if v_tr.id is null then
    raise exception 'طلب التحويل غير موجود أو تم الرد عليه مسبقاً' using errcode = '22023';
  end if;

  if v_dec = 'accepted' then
    if v_tr.item_kind = 'ticket' then
      perform set_config('app.pt_trusted', '1', true);
      update public.pickup_tickets
         set courier_id = v_me.id, updated_at = now()
       where sd_request_id = v_tr.transaction_id and courier_id = v_tr.from_courier_id;
    else
      update public.courier_trips
         set courier = v_me.name
       where transaction_id = v_tr.transaction_id
         and public.norm_ar(courier) = public.norm_ar(v_tr.from_courier_name)
         and courier_confirmed_at is null;
    end if;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      raise exception 'المشوار لم يعد تابعًا للمندوب المحوِّل أو اتأكد بالفعل — لا يمكن نقله' using errcode = '22023';
    end if;

    insert into public.audit_log (transaction_id, action, service, user_name, details)
    values (v_tr.transaction_id, 'updated', 'تحويل يد بيد بين المناديب', v_me.name,
            jsonb_build_object('من_المندوب', v_tr.from_courier_name, 'إلى_المندوب', v_me.name, 'السبب', coalesce(v_tr.reason, 'تسليم ميداني')));
  end if;

  update public.courier_peer_transfers
     set status = v_dec, resolved_at = now()
   where id = v_tr.id and status = 'pending';

  return jsonb_build_object('ok', true, 'status', v_dec, 'transaction_id', v_tr.transaction_id);
end;
$$;

-- ---------------------------------------------------------------------
-- F) سجل الوصول بدون لوم + فاتورة العميل + التحصيل
-- ---------------------------------------------------------------------

create or replace function public.courier_p4_log_zero_blame(
  p_tx text,
  p_reason_code text,
  p_lat numeric default null,
  p_lng numeric default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
  if not public.courier_p4_owns_item(v_c.id, v_c.name, v_tx, null) then
    raise exception 'المعاملة دي مش مسندة ليك' using errcode = '42501';
  end if;

  v_label := case v_code
    when 'no_answer' then 'العميل لا يرد على الهاتف'
    when 'not_home' then 'العميل غير متواجد بالعنوان'
    else 'العميل طلب تأجيل الموعد'
  end;

  select max(client_name), max(phone), max(tracking_token)
    into v_client, v_phone, v_token
    from public.request_lines where transaction_id = v_tx and deleted_at is null;

  if v_client is null then
    select client_name, phone into v_client, v_phone
      from public.pickup_tickets where sd_request_id = v_tx and courier_id = v_c.id limit 1;
  end if;

  insert into public.courier_zero_blame_logs (
    courier_id, courier_name, transaction_id, client_name, phone, reason_code, reason_label, lat, lng, created_by
  )
  values (v_c.id, v_c.name, v_tx, v_client, v_phone, v_code, v_label, p_lat, p_lng, auth.uid())
  returning id into v_id;

  begin
    insert into public.tx_comments (transaction_id, author_id, author_name, body)
    values (v_tx, auth.uid(), v_c.name,
      'سجل وصول بدون لوم: وصل المندوب للعميل (' || v_label || ')' ||
      case when p_lat is not null and p_lng is not null then ' — GPS: ' || round(p_lat, 5) || ',' || round(p_lng, 5) else '' end);
  exception when others then
    raise warning 'zero_blame comment failed: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'id', v_id, 'transaction_id', v_tx, 'client_name', v_client,
                            'phone', v_phone, 'tracking_token', v_token, 'reason_label', v_label, 'arrived_at', now());
end;
$$;

create or replace function public.courier_p4_client_invoice(p_tx text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_day date := (now() at time zone 'Africa/Cairo')::date;
  v_tx text := btrim(coalesce(p_tx, ''));
  v_client text;
  v_phone text;
  v_payment_method text;
  v_lines jsonb;
  v_total numeric(12,2) := 0;
  v_pt public.pickup_tickets;
  v_evt_orig numeric(12,2);
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;
  if not public.courier_p4_owns_item(v_c.id, v_c.name, v_tx, null) then
    raise exception 'المعاملة دي مش مسندة ليك' using errcode = '42501';
  end if;

  select original_amount into v_evt_orig
    from public.courier_collection_events
   where courier_id = v_c.id and collect_day = v_day and transaction_id = v_tx;

  select * into v_pt from public.pickup_tickets where sd_request_id = v_tx and courier_id = v_c.id limit 1;
  if v_pt.id is not null then
    return jsonb_build_object(
      'transaction_id', v_pt.sd_request_id,
      'client_name', v_pt.client_name,
      'phone', v_pt.phone,
      'payment_method', case v_pt.payment_status when 'cod_cash' then 'كاش عند الاستلام' when 'instapay_on_arrival' then 'إنستاباي عند الوصول' else 'خالص الدفع' end,
      'items', case when jsonb_typeof(v_pt.items) = 'array' and jsonb_array_length(v_pt.items) > 0 then v_pt.items
                    else jsonb_build_array(jsonb_build_object('service_name', v_pt.service_name, 'qty', coalesce(v_pt.qty, 1), 'line_total', coalesce(v_pt.collect_amount, v_pt.total, 0))) end,
      'total_due', coalesce(v_pt.collect_amount, 0),
      'cod_due', coalesce(v_evt_orig, v_pt.collect_amount, 0),
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
    'cod_due', coalesce(v_evt_orig, public.courier_p4_cod_due(v_tx)),
    'courier_name', v_c.name
  );
end;
$$;

-- (المعاملات p_original_amount بتفضل في التوقيع للتوافق مع الواجهة القديمة، لكن السيرفر بيتجاهلها ويحسب الأصل بنفسه)
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
language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_day date := (now() at time zone 'Africa/Cairo')::date;
  v_kind text := case when p_item_kind = 'ticket' then 'ticket' else 'tx' end;
  v_tx text := btrim(coalesce(p_tx, ''));
  v_mode text := btrim(coalesce(p_payment_mode, ''));
  v_orig numeric(12,2);
  v_coll numeric(12,2);
  v_rem numeric(12,2);
  v_client text;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;

  if v_mode not in ('cash_full', 'instapay_switch', 'partial_cash', 'partial_instapay') then
    raise exception 'طريقة دفع غير معروفة' using errcode = '22023';
  end if;
  if p_collected_amount is null or p_collected_amount < 0 then
    raise exception 'المبلغ المحصل غير صالح' using errcode = '22023';
  end if;
  if not public.courier_p4_owns_item(v_c.id, v_c.name, v_tx, v_kind) then
    raise exception 'المعاملة دي مش مسندة ليك' using errcode = '42501';
  end if;

  if exists (select 1 from public.courier_cash_handshakes h
              where h.courier_id = v_c.id and h.close_day = v_day and h.status = 'confirmed') then
    raise exception 'تم تقفيل وتأكيد حساب اليوم من الإدارة — لا يمكن تعديل المبالغ أو طرق الدفع بعد التقفيل' using errcode = '42501';
  end if;

  -- المبلغ الأصلي: من تحصيل سابق لنفس اليوم (ثابت) وإلا من بيانات المعاملة/التيكت — مش من المتصفح
  select original_amount into v_orig
    from public.courier_collection_events
   where courier_id = v_c.id and collect_day = v_day and transaction_id = v_tx;
  if v_orig is null then
    if v_kind = 'ticket' then
      select collect_amount into v_orig from public.pickup_tickets
       where sd_request_id = v_tx and courier_id = v_c.id and status <> 'cancelled' limit 1;
    else
      v_orig := public.courier_p4_cod_due(v_tx);
    end if;
  end if;
  v_orig := coalesce(v_orig, 0);
  if v_orig <= 0 then
    raise exception 'مفيش مبلغ مطلوب تحصيله على المعاملة دي' using errcode = '22023';
  end if;

  v_coll := round(p_collected_amount, 2);
  if v_coll > v_orig then
    raise exception 'المبلغ المحصل (%) أكبر من المطلوب (%)', v_coll, v_orig using errcode = '22023';
  end if;
  if v_mode in ('cash_full', 'instapay_switch') and v_coll <> v_orig then
    raise exception 'التحصيل الكامل لازم يساوي المطلوب (%) — لو العميل دفع جزء استخدم «دفع جزئي»', v_orig using errcode = '22023';
  end if;
  if v_mode in ('partial_cash', 'partial_instapay') and v_coll >= v_orig then
    raise exception 'الدفع الجزئي لازم يكون أقل من المطلوب (%)', v_orig using errcode = '22023';
  end if;
  v_rem := greatest(0, v_orig - v_coll);

  if v_kind = 'ticket' then
    perform set_config('app.pt_trusted', '1', true);
    select client_name into v_client from public.pickup_tickets where sd_request_id = v_tx and courier_id = v_c.id limit 1;
    if v_mode in ('instapay_switch', 'partial_instapay') then
      update public.pickup_tickets
         set payment_status = 'instapay_on_arrival', collect_amount = v_coll, updated_at = now()
       where sd_request_id = v_tx and courier_id = v_c.id;
    elsif v_mode = 'partial_cash' then
      update public.pickup_tickets
         set collect_amount = v_coll, updated_at = now()
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
        updated_at = now();   -- القديم بيتسجل في courier_collection_history عن طريق الـ trigger

  begin
    insert into public.tx_comments (transaction_id, author_id, author_name, body)
    values (v_tx, auth.uid(), v_c.name,
      'تحديث تحصيل ميداني (' ||
      case v_mode
        when 'instapay_switch' then 'تحويل من كاش إلى إنستاباي بالكامل'
        when 'partial_cash' then 'دفع جزئي كاش'
        when 'partial_instapay' then 'دفع جزئي إنستاباي'
        else 'تحصيل كاش كامل'
      end ||
      ') — المحصل: ' || v_coll || ' ج.م من أصل ' || v_orig || ' ج.م (المتبقي: ' || v_rem || ' ج.م)' ||
      case when coalesce(p_instapay_ref, '') <> '' then ' — مرجع إنستاباي: ' || p_instapay_ref else '' end);
  exception when others then
    raise warning 'collection comment failed: %', sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true, 'transaction_id', v_tx, 'payment_mode', v_mode,
    'original_amount', v_orig, 'collected_amount', v_coll, 'remaining_amount', v_rem,
    'cash_totals', public.courier_p4_calc_day_totals_core(v_c.id, v_c.name, v_day)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- G) تقفيل الكاش (تسجيل المسلَّم فعليًا + الفرق)
-- ---------------------------------------------------------------------

drop function if exists public.courier_p4_submit_cash_closing(text);
create or replace function public.courier_p4_submit_cash_closing(
  p_note text default null,
  p_handed_cash numeric default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_day date := (now() at time zone 'Africa/Cairo')::date;
  v_existing public.courier_cash_handshakes;
  v_totals jsonb;
  v_exp numeric(12,2);
  v_insta numeric(12,2);
  v_part numeric(12,2);
  v_handed numeric(12,2);
  v_diff numeric(12,2);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_row public.courier_cash_handshakes;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;

  if p_handed_cash is null or p_handed_cash < 0 then
    raise exception 'سجّل المبلغ الكاش اللي سلّمته فعليًا للمكتب' using errcode = '22023';
  end if;

  select * into v_existing from public.courier_cash_handshakes where courier_id = v_c.id and close_day = v_day;
  if v_existing.id is not null and v_existing.status = 'confirmed' then
    raise exception 'تم تأكيد تقفيل اليوم بالفعل من الإدارة ولا يمكن إعادة إرساله' using errcode = '42501';
  end if;

  v_totals := public.courier_p4_calc_day_totals_core(v_c.id, v_c.name, v_day);
  v_exp := coalesce((v_totals->>'expected_cash')::numeric, 0);
  v_insta := coalesce((v_totals->>'instapay_total')::numeric, 0);
  v_part := coalesce((v_totals->>'partial_remaining_total')::numeric, 0);
  v_handed := round(p_handed_cash, 2);
  v_diff := round(v_handed - v_exp, 2);

  if v_diff <> 0 and v_note is null then
    raise exception 'فيه فرق % ج بين المتوقع (%) والمسلَّم (%) — اكتب ملاحظة توضح السبب', v_diff, v_exp, v_handed using errcode = '22023';
  end if;

  insert into public.courier_cash_handshakes (
    close_day, courier_id, courier_name,
    expected_cash, instapay_total, partial_remaining_total, handed_cash, diff_cash,
    courier_note, status, created_by, submitted_at
  )
  values (v_day, v_c.id, v_c.name, v_exp, v_insta, v_part, v_handed, v_diff, v_note, 'submitted', auth.uid(), now())
  on conflict (courier_id, close_day) do update
    set expected_cash = excluded.expected_cash,
        instapay_total = excluded.instapay_total,
        partial_remaining_total = excluded.partial_remaining_total,
        handed_cash = excluded.handed_cash,
        diff_cash = excluded.diff_cash,
        courier_note = excluded.courier_note,
        status = 'submitted',
        confirmed_by = null,
        confirmed_by_name = null,
        confirmed_at = null,
        submitted_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.staff_p4_confirm_cash_handshake(
  p_handshake_id bigint,
  p_action text default 'confirm'
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_act text := case when lower(btrim(coalesce(p_action, ''))) = 'reopen' then 'reopened' else 'confirmed' end;
  v_name text;
  v_row public.courier_cash_handshakes;
begin
  if not (public.is_staff() or public.is_manager()) or public.is_courier() then
    raise exception 'staff or manager only' using errcode = '42501';
  end if;

  select coalesce(nullif(btrim(full_name), ''), 'الإدارة') into v_name from public.profiles where id = auth.uid();

  -- التأكيد من حالة submitted فقط، وإعادة الفتح من confirmed/submitted فقط (قرار واحد على الحالة الحالية)
  update public.courier_cash_handshakes
     set status = v_act,
         confirmed_by = auth.uid(),
         confirmed_by_name = coalesce(v_name, 'الإدارة'),
         confirmed_at = now()
   where id = p_handshake_id
     and ((v_act = 'confirmed' and status = 'submitted')
       or (v_act = 'reopened' and status in ('confirmed', 'submitted')))
   returning * into v_row;

  if v_row.id is null then
    raise exception 'سجل التقفيل غير موجود أو حالته الحالية لا تسمح بالإجراء ده' using errcode = '22023';
  end if;

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------
-- H) لوحة المكتب (من غير كشف أي كود)
-- ---------------------------------------------------------------------

create or replace function public.radar_p4_office_snapshot(
  p_day date default (now() at time zone 'Africa/Cairo')::date
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Cairo')::date);
begin
  if not (public.is_staff() or public.is_manager()) or public.is_courier() then
    raise exception 'staff or manager only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'day', v_day,
    'my_pin_set', exists (select 1 from public.staff_digital_pins where user_id = auth.uid() and pin_hash is not null),
    'gates', coalesce((
      select jsonb_agg(to_jsonb(g.*) order by g.completed_at desc)
      from public.courier_daily_gates g where g.gate_day = v_day), '[]'::jsonb),
    'handovers', coalesce((
      select jsonb_agg(to_jsonb(h.*) order by h.signed_at desc)
      from public.courier_office_handovers h where h.handover_day = v_day), '[]'::jsonb),
    'handshakes', coalesce((
      select jsonb_agg(to_jsonb(hs.*) order by hs.submitted_at desc)
      from public.courier_cash_handshakes hs where hs.close_day = v_day), '[]'::jsonb),
    'collections', coalesce((
      select jsonb_agg(to_jsonb(ce.*) order by ce.updated_at desc)
      from public.courier_collection_events ce where ce.collect_day = v_day), '[]'::jsonb),
    'zero_blame', coalesce((
      select jsonb_agg(to_jsonb(zb.*) order by zb.arrived_at desc)
      from public.courier_zero_blame_logs zb where zb.log_day = v_day), '[]'::jsonb),
    'transfers', coalesce((
      select jsonb_agg(to_jsonb(tr.*) order by tr.created_at desc)
      from public.courier_peer_transfers tr where tr.transfer_day = v_day), '[]'::jsonb)
  );
end;
$$;

-- سياسة قراءة البوابات: البيانات دي تشغيلية للموظفين؛ لكن لازم تقفل صراحة عن anon
revoke all on public.courier_daily_gates, public.courier_office_handovers, public.courier_peer_transfers,
            public.courier_zero_blame_logs, public.courier_collection_events, public.courier_cash_handshakes
  from anon;

-- ---------------------------------------------------------------------
-- I) الصلاحيات: revoke صريح من PUBLIC وanon (سوبابيس بيدّي anon تنفيذ تلقائي على أي دالة جديدة)
-- ---------------------------------------------------------------------

-- الدوال الداخلية: ما حدش من المتصفح ينادي عليها
revoke all on function public.courier_p4_cod_due(text) from public, anon, authenticated;
revoke all on function public.courier_p4_owns_item(bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.courier_p4_calc_day_totals_core(bigint, text, date) from public, anon, authenticated;
revoke all on function public.courier_p4_collection_history_fn() from public, anon, authenticated;

-- الدوال المتاحة للمستخدمين المسجّلين فقط (والتحقق من الدور جوّه كل دالة)
revoke all on function public.courier_p4_calc_day_totals(bigint, text, date) from public, anon;
revoke all on function public.courier_p4_my_state(date) from public, anon;
revoke all on function public.courier_p4_complete_gate(jsonb) from public, anon;
revoke all on function public.courier_p4_toggle_driving(boolean) from public, anon;
revoke all on function public.courier_p4_office_digital_signoff(uuid, text, text[], jsonb, text) from public, anon;
revoke all on function public.courier_p4_request_transfer(text, text, bigint, text) from public, anon;
revoke all on function public.courier_p4_respond_transfer(bigint, text) from public, anon;
revoke all on function public.courier_p4_log_zero_blame(text, text, numeric, numeric) from public, anon;
revoke all on function public.courier_p4_record_collection(text, text, numeric, numeric, text, text, text) from public, anon;
revoke all on function public.courier_p4_client_invoice(text) from public, anon;
revoke all on function public.courier_p4_submit_cash_closing(text, numeric) from public, anon;
revoke all on function public.radar_p4_office_snapshot(date) from public, anon;
revoke all on function public.staff_p4_set_my_pin(text) from public, anon;
revoke all on function public.staff_p4_confirm_cash_handshake(bigint, text) from public, anon;

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
grant execute on function public.courier_p4_submit_cash_closing(text, numeric) to authenticated;
grant execute on function public.radar_p4_office_snapshot(date) to authenticated;
grant execute on function public.staff_p4_set_my_pin(text) to authenticated;
grant execute on function public.staff_p4_confirm_cash_handshake(bigint, text) to authenticated;

-- تحقق سريع بعد التشغيل (لازم كل الصفوف تطلع anon_can_execute = false):
--   select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and (p.proname like 'courier_p4_%' or p.proname like 'staff_p4_%' or p.proname like 'radar_p4_%');

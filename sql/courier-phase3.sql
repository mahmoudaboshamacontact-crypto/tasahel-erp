-- =====================================================================
-- sql/courier-phase3.sql (المرحلة 3: حالة التيكت + سجل التواصل + إشعارات المندوب)
-- قابل لإعادة التشغيل بأمان (Idempotent) — يُشغّل يدوياً في Supabase SQL Editor
-- الترتيب: يُشغّل بعد sql/courier-zones.sql (المرحلة 2).
-- لا يعدّل أي سياسة RLS موجودة على أي جدول قديم.
-- =====================================================================

-- =====================================================================
-- الجزء أ: حالة التيكت عند المندوب (تحديث واحد على صف pickup_tickets)
-- =====================================================================

alter table public.pickup_tickets
  add column if not exists courier_step text,
  add column if not exists courier_step_at timestamptz;

alter table public.pickup_tickets
  drop constraint if exists pickup_tickets_courier_step_chk;

alter table public.pickup_tickets
  add constraint pickup_tickets_courier_step_chk
  check (
    courier_step is null
    or courier_step in ('accepted', 'call_attempt', 'on_the_way', 'waiting', 'papers_received')
  );

-- دالة تحديث خطوة المندوب على التيكت (UPDATE واحد فقط على الصف)
create or replace function public.courier_ticket_set_step(
  p_ticket_id bigint,
  p_step text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c      public.couriers;
  v_t      public.pickup_tickets;
  v_step   text := btrim(coalesce(p_step, ''));
  v_steps  text[] := array['accepted', 'call_attempt', 'on_the_way', 'waiting', 'papers_received'];
  v_cur_i  integer;
  v_new_i  integer;
  v_now    timestamptz := now();
  v_cnt    integer := 0;
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

  v_new_i := array_position(v_steps, v_step);
  if v_new_i is null then
    raise exception 'خطوة غير صالحة (%)' , v_step using errcode = '22023';
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

  if v_t.status <> 'with_courier' then
    raise exception 'التيكت غير نشط عند المندوب حالياً (الحالة: %)', v_t.status using errcode = '22023';
  end if;

  if v_t.courier_step is null then
    if v_step <> 'accepted' then
      raise exception 'لازم تأكّد استلام التيكت أولاً قبل الخطوة دي' using errcode = '22023';
    end if;
  else
    v_cur_i := array_position(v_steps, v_t.courier_step);
    if v_new_i = v_cur_i then
      raise exception 'الخطوة دي متسجلة بالفعل' using errcode = '22023';
    elsif v_new_i < v_cur_i then
      raise exception 'مينفعش ترجع لخطوة سابقة' using errcode = '22023';
    elsif v_new_i > v_cur_i + 1 then
      raise exception 'لازم تمشي بالترتيب — سجّل الخطوة السابقة أولاً' using errcode = '22023';
    end if;
  end if;

  -- السماح بالتحديث عبر تريجر الحماية pickup_tickets_guard_trg محلياً داخل نفس المعاملة فقط
  perform set_config('app.pt_trusted', '1', true);

  update public.pickup_tickets
     set courier_step    = v_step,
         courier_step_at = v_now
   where id = p_ticket_id
     and courier_id = v_c.id
     and status = 'with_courier';

  get diagnostics v_cnt = row_count;
  if v_cnt = 0 then
    raise exception 'تعذر تحديث حالة التيكت — حاول تاني' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'ok',   true,
    'step', v_step,
    'at',   v_now
  );
end;
$$;

revoke all on function public.courier_ticket_set_step(bigint, text) from public, anon;
grant execute on function public.courier_ticket_set_step(bigint, text) to authenticated;

-- تحديث courier_my_tickets لإرجاع courier_step و courier_step_at و zone_key من قاعدة البيانات
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
      'created_at', t.created_at
    ) order by t.created_at desc)
    from public.pickup_tickets t
    where t.courier_id = v_c.id
      and t.status = 'with_courier'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.courier_my_tickets() from public, anon;
grant execute on function public.courier_my_tickets() to authenticated;

-- إضافة pickup_tickets إلى publication supabase_realtime بشرط يمنع التكرار
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
         from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'pickup_tickets'
     ) then
    alter publication supabase_realtime add table public.pickup_tickets;
  end if;
end $$;


-- =====================================================================
-- الجزء ب: سجل التواصل مع العميل (courier_contact_log)
-- =====================================================================

create table if not exists public.courier_contact_log (
  id bigserial primary key,
  ticket_id bigint references public.pickup_tickets(id) on delete set null,
  transaction_id text,
  courier_id bigint not null references public.couriers(id) on delete cascade,
  channel text not null check (channel in ('call', 'whatsapp')),
  outcome text check (outcome is null or outcome in ('answered', 'no_answer', 'wrong_number', 'postponed')),
  created_at timestamptz not null default now(),
  constraint courier_contact_log_target_chk
    check (ticket_id is not null or nullif(btrim(coalesce(transaction_id, '')), '') is not null)
);

create index if not exists courier_contact_log_ticket_idx
  on public.courier_contact_log (ticket_id, created_at desc)
  where ticket_id is not null;

create index if not exists courier_contact_log_tx_idx
  on public.courier_contact_log (transaction_id, created_at desc)
  where transaction_id is not null;

create index if not exists courier_contact_log_courier_idx
  on public.courier_contact_log (courier_id, created_at desc);

-- تفعيل RLS على الجدول الجديد فقط: المندوب يقرأ ويكتب صفوفه بس، والمدير (والموظف) يقرأ الكل
alter table public.courier_contact_log enable row level security;

revoke all on public.courier_contact_log from public, anon;
grant select, insert on public.courier_contact_log to authenticated;

drop policy if exists ccl_select_courier on public.courier_contact_log;
create policy ccl_select_courier on public.courier_contact_log
  for select to authenticated
  using (
    exists (
      select 1
        from public.couriers c
       where c.id = courier_id
         and c.user_id = (select auth.uid())
         and c.active = true
    )
  );

drop policy if exists ccl_insert_courier on public.courier_contact_log;
create policy ccl_insert_courier on public.courier_contact_log
  for insert to authenticated
  with check (
    exists (
      select 1
        from public.couriers c
       where c.id = courier_id
         and c.user_id = (select auth.uid())
         and c.active = true
    )
  );

drop policy if exists ccl_select_mgr on public.courier_contact_log;
create policy ccl_select_mgr on public.courier_contact_log
  for select to authenticated
  using ((select public.is_manager()) or (select public.is_staff()));

-- دالة تسجيل التواصل (INSERT واحد بس، لا تعدّل أي جدول آخر)
create or replace function public.courier_log_contact(
  p_ticket_id bigint default null,
  p_tx text default null,
  p_channel text default 'call',
  p_outcome text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c   public.couriers;
  v_tx  text := nullif(btrim(coalesce(p_tx, '')), '');
  v_ch  text := lower(btrim(coalesce(p_channel, '')));
  v_out text := nullif(lower(btrim(coalesce(p_outcome, ''))), '');
  v_id  bigint;
  v_at  timestamptz;
begin
  if not public.is_courier() then
    raise exception 'التسجيل متاح للمندوب فقط' using errcode = '42501';
  end if;

  select * into v_c
    from public.couriers
   where user_id = auth.uid()
     and active = true
   limit 1;

  if v_c.id is null then
    raise exception 'حساب المندوب غير مربوط' using errcode = '42501';
  end if;

  if p_ticket_id is null and v_tx is null then
    raise exception 'لازم تحديد رقم التيكت أو المعاملة' using errcode = '22023';
  end if;

  if v_ch not in ('call', 'whatsapp') then
    raise exception 'قناة تواصل غير صالحة' using errcode = '22023';
  end if;

  if v_out is not null and v_out not in ('answered', 'no_answer', 'wrong_number', 'postponed') then
    raise exception 'نتيجة تواصل غير صالحة' using errcode = '22023';
  end if;

  insert into public.courier_contact_log (ticket_id, transaction_id, courier_id, channel, outcome)
  values (p_ticket_id, v_tx, v_c.id, v_ch, v_out)
  returning id, created_at into v_id, v_at;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'created_at', v_at
  );
end;
$$;

revoke all on function public.courier_log_contact(bigint, text, text, text) from public, anon;
grant execute on function public.courier_log_contact(bigint, text, text, text) to authenticated;

-- View لحساب العدد وآخر وقت من الصفوف مباشرة (بدون عمود متخزن)
create or replace view public.courier_contact_summary
with (security_invoker = true)
as
select
  ticket_id,
  transaction_id,
  count(*)::integer as contact_count,
  max(created_at)   as last_contact_at
from public.courier_contact_log
group by ticket_id, transaction_id;

grant select on public.courier_contact_summary to authenticated;


-- =====================================================================
-- الجزء ج: الإشعارات الخارجية للمندوب (إعادة استخدام send-push الموجودة)
-- =====================================================================

-- 1) دالتان RPC لحفظ/حذف اشتراك المندوب في push_subscriptions بدون لمس سياسات RLS الموجودة
create or replace function public.courier_save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ep   text := btrim(coalesce(p_endpoint, ''));
  v_p256 text := btrim(coalesce(p_p256dh, ''));
  v_auth text := btrim(coalesce(p_auth, ''));
begin
  if not public.is_courier() then
    raise exception 'متاح للمندوب فقط' using errcode = '42501';
  end if;

  if v_ep = '' or v_p256 = '' or v_auth = '' then
    raise exception 'بيانات اشتراك الإشعارات ناقصة' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), v_ep, v_p256, v_auth, left(coalesce(p_user_agent, ''), 200))
  on conflict (endpoint) do update
    set user_id    = auth.uid(),
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        user_agent = excluded.user_agent;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.courier_delete_push_subscription(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_courier() then
    raise exception 'متاح للمندوب فقط' using errcode = '42501';
  end if;

  delete from public.push_subscriptions
   where user_id = auth.uid()
     and endpoint = btrim(coalesce(p_endpoint, ''));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.courier_save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.courier_save_push_subscription(text, text, text, text) to authenticated;

revoke all on function public.courier_delete_push_subscription(text) from public, anon;
grant execute on function public.courier_delete_push_subscription(text) to authenticated;

-- 2) تريجر إشعار المندوب عند تعيين تيكت له فقط (وليس مع تحديث الخطوات)
--    يكتب صفاً في public.notifications فيلتقطه trg_notify_push الموجود ويستدعي send-push تلقائياً.
create or replace function public.trg_pickup_ticket_notify_courier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid;
  v_zone  text;
  v_body  text;
begin
  -- يشتغل فقط لما الحالة with_courier وفيه مندوب معيّن
  if new.status <> 'with_courier' or new.courier_id is null then
    return new;
  end if;

  -- في حالة UPDATE: لا ترسل إشعاراً إلا لو الحالة تحولت لـ with_courier أو تغيّر المندوب
  if tg_op = 'UPDATE'
     and old.status = 'with_courier'
     and old.courier_id is not distinct from new.courier_id then
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
  -- ممنوع إظهار رقم التليفون أو أي بيانات حساسة في نص الإشعار
  v_body := left(
    'تيكت جديد — ' || coalesce(nullif(btrim(new.client_name), ''), 'عميل') ||
    case when v_zone is not null then ' — ' || v_zone else '' end,
    160
  );

  begin
    insert into public.notifications (user_id, kind, title, body)
    values (v_uid, 'pickup_ticket', 'تيكت جديد', v_body);
  exception when others then
    -- لا نكسر حفظ التيكت لو فشل تسجيل الإشعار، لكن نسجّل الخطأ في Postgres logs بدل ما يفشل بصمت
    raise warning 'pickup_ticket_notify_courier failed for ticket %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.trg_pickup_ticket_notify_courier() from public, anon, authenticated;

drop trigger if exists pickup_ticket_notify_courier_trg on public.pickup_tickets;
create trigger pickup_ticket_notify_courier_trg
  after insert or update of courier_id, status on public.pickup_tickets
  for each row execute function public.trg_pickup_ticket_notify_courier();

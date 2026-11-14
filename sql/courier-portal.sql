-- =====================================================================
-- بوابة المندوب (courier portal)
-- الملف: sql/courier-portal.sql — قابل لإعادة التشغيل بأمان (Idempotent).
-- شغّله في Supabase SQL Editor قبل رفع js/70-courier-portal.js.
--
-- المبدأ: المندوب مالوش أي وصول مباشر لأي جدول. كل اللي بيشوفه وبيعمله بيتم
-- عن طريق 3 دوال بس (courier_me / courier_list_tx / courier_confirm)
-- والدوال دي بترجّع أعمدة محدودة (من غير أسعار ولا خصومات ولا عمولات ولا ملاحظات داخلية).
-- =====================================================================

-- 1) دور جديد: courier
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles
  add constraint user_roles_role_check check (role in ('manager','staff','partner','courier'));

-- 2) ربط المندوب بحساب الدخول (مندوب واحد = حساب واحد)
alter table public.couriers add column if not exists user_id uuid unique references auth.users(id) on delete set null;

create or replace function public.is_courier()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'courier' from public.user_roles where user_id = auth.uid()), false)
$$;
revoke all on function public.is_courier() from public, anon;
grant execute on function public.is_courier() to authenticated;

-- 3) إدارة الحسابات (المدير فقط)
create or replace function public.assign_courier(p_email text, p_courier_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if not public.is_manager() then raise exception 'not allowed' using errcode = '42501'; end if;
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'no such account'; end if;
  if exists (select 1 from public.user_roles where user_id = u and role in ('manager','staff','partner')) then
    raise exception 'account already has another role';
  end if;
  if not exists (select 1 from public.couriers where id = p_courier_id and active) then
    raise exception 'courier not found or inactive';
  end if;
  update public.couriers set user_id = null where user_id = u;      -- الحساب يتربط بمندوب واحد بس
  update public.couriers set user_id = u where id = p_courier_id;
  insert into public.user_roles (user_id, role) values (u, 'courier')
  on conflict (user_id) do update set role = 'courier', partner_name = null;
end $$;

create or replace function public.list_courier_accounts()
returns table (id bigint, name text, active boolean, user_id uuid, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select c.id, c.name, c.active, c.user_id, (select a.email::text from auth.users a where a.id = c.user_id)
    from public.couriers c order by c.sort_order, c.id;
end $$;

-- إيقاف أي حساب (شريك أو مندوب): بيشيل الدور وبيفك ربط المندوب
create or replace function public.remove_role(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'not allowed'; end if;
  update public.couriers set user_id = null where user_id = p_user;
  delete from public.user_roles where user_id = p_user and role <> 'manager';
end $$;

revoke all on function public.assign_courier(text, bigint), public.list_courier_accounts() from public, anon;
grant execute on function public.assign_courier(text, bigint), public.list_courier_accounts() to authenticated;

-- 4) دوال المندوب
create or replace function public.courier_me()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.couriers;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into r from public.couriers where user_id = auth.uid() and active;
  if r.id is null then raise exception 'courier account not linked' using errcode = '42501'; end if;
  return jsonb_build_object('id', r.id, 'name', r.name);
end $$;

-- قايمة المعاملات (قراءة فقط): كل غير المسلّم + المسلّم آخر p_days يوم. من غير أي بيانات مالية.
create or replace function public.courier_list_tx(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_cut timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(s.x order by s.last_at desc) from (
      select max(l.created_at) as last_at,
        jsonb_build_object(
          'transaction_id', l.transaction_id,
          'client_name', max(l.client_name),
          'phone', max(l.phone),
          'address', max(l.address),
          'services', coalesce(jsonb_agg(distinct l.service) filter (where l.service is not null), '[]'::jsonb),
          'lines', count(*),
          'n_complete', count(*) filter (where l.complete),
          'n_delivered', count(*) filter (where l.delivered),
          'n_review', count(*) filter (where l.under_review),
          'received_at', max(l.received_at::text),
          'created_at', max(l.created_at),
          'pickup_courier', (select t.courier from public.courier_trips t where t.transaction_id = l.transaction_id and t.kind = 'pickup'),
          'delivery_courier', (select t.courier from public.courier_trips t where t.transaction_id = l.transaction_id and t.kind = 'delivery')
        ) as x
      from public.request_lines l
      where l.deleted_at is null and l.transaction_id is not null
      group by l.transaction_id
      having max(l.created_at) >= v_cut or count(*) filter (where not coalesce(l.delivered, false)) > 0
      order by max(l.created_at) desc
      limit 400
    ) s), '[]'::jsonb);
end $$;

-- تأكيد استلام الأوراق (pickup) أو تسليم المعاملة للعميل (delivery)
create or replace function public.courier_confirm(
  p_tx text, p_kind text, p_received_by text default null, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_c public.couriers;
  v_tx text := btrim(coalesce(p_tx, ''));
  v_day date := (now() at time zone 'Africa/Cairo')::date;
  v_old text;
  v_svc text;
  v_rec text := nullif(btrim(coalesce(p_received_by, '')), '');
  v_pending int;
  v_notready int;
  v_total int;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = v_uid and active;
  if v_c.id is null then raise exception 'courier account not linked' using errcode = '42501'; end if;
  if p_kind not in ('pickup','delivery') then raise exception 'bad kind' using errcode = '22023'; end if;
  if v_tx = '' then raise exception 'transaction required' using errcode = '22023'; end if;

  select string_agg(distinct service, '، '), count(*), count(*) filter (where not coalesce(delivered, false)),
         count(*) filter (where not coalesce(delivered, false) and (not coalesce(complete, false) or coalesce(under_review, false)))
    into v_svc, v_total, v_pending, v_notready
    from public.request_lines where transaction_id = v_tx and deleted_at is null;
  if v_total = 0 then raise exception 'transaction not found' using errcode = 'P0002'; end if;

  -- مشوار مسجّل لمندوب تاني؟ ممنوع الكتابة فوقه
  select courier into v_old from public.courier_trips where transaction_id = v_tx and kind = p_kind;
  if v_old is not null and v_old <> v_c.name and v_old <> '—' then
    raise exception 'already recorded for %', v_old using errcode = '23505';
  end if;

  -- تأكيد استلام مكرر من نفس المندوب: مفيش جديد يتسجّل (بدون سطر مكرر في السجل)
  if p_kind = 'pickup' and v_old = v_c.name then
    return jsonb_build_object('ok', true, 'kind', p_kind, 'courier', v_c.name, 'unchanged', true);
  end if;

  if p_kind = 'delivery' then
    if v_rec is null or char_length(v_rec) > 120 then raise exception 'received_by required' using errcode = '22023'; end if;
    if v_pending = 0 then raise exception 'already delivered' using errcode = '23505'; end if;
    if v_notready > 0 then raise exception 'not ready for delivery' using errcode = '22023'; end if;

    insert into public.delivery_confirmations (transaction_id, courier_name, received_by_name, notes, confirmed_by, confirmed_by_name, confirmed_at)
    values (v_tx, v_c.name, v_rec, nullif(btrim(coalesce(p_notes, '')), ''), v_uid, v_c.name, now())
    on conflict (transaction_id) do update
      set courier_name = excluded.courier_name, received_by_name = excluded.received_by_name,
          notes = excluded.notes, confirmed_by = excluded.confirmed_by,
          confirmed_by_name = excluded.confirmed_by_name, confirmed_at = now();

    update public.request_lines
       set delivered = true, complete = true, under_review = false, status = 'Delivered',
           delivered_date = coalesce(delivered_date, v_day)
     where transaction_id = v_tx and deleted_at is null;
  end if;

  insert into public.courier_trips (transaction_id, kind, courier, fee, trip_day, created_by)
  values (v_tx, p_kind, v_c.name, 40, v_day, v_c.name)     -- 40 = نفس FEE في js/13-couriers.js
  on conflict (transaction_id, kind) do update set courier = excluded.courier, fee = excluded.fee
    where public.courier_trips.courier = '—';

  insert into public.audit_log (transaction_id, action, service, user_name, details)
  values (v_tx, 'updated', left(coalesce(v_svc, ''), 200), v_c.name,
          jsonb_build_object(case p_kind when 'pickup' then 'مندوب الاستلام' else 'مندوب التسليم' end,
                             jsonb_build_object('old', coalesce(v_old, '—'), 'new', v_c.name)));

  return jsonb_build_object('ok', true, 'kind', p_kind, 'courier', v_c.name);
end $$;

revoke all on function public.courier_me(), public.courier_list_tx(int), public.courier_confirm(text, text, text, text) from public, anon;
grant execute on function public.courier_me(), public.courier_list_tx(int), public.courier_confirm(text, text, text, text) to authenticated;

-- 5) قفل كل حاجة تانية في وش المندوب (أهم جزء أمني)
-- سياسة RESTRICTIVE على كل جدول في public: لو الدور courier ترفض أي قراءة/كتابة.
-- (لازم لأن جداول زي client_360_notes و service_workflow_stages و request_line_stage_history
--  كانت مفتوحة لأي مستخدم مسجّل دخول.)
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and c.relrowsecurity
  loop
    execute format('drop policy if exists courier_block on public.%I', t.relname);
    execute format(
      'create policy courier_block on public.%I as restrictive for all to authenticated using (not (select public.is_courier())) with check (not (select public.is_courier()))',
      t.relname);
  end loop;
end $$;

-- 6) دالتين كانوا مفتوحين لأي مستخدم: نقصرهم على الموظفين
create or replace function public.get_customer_360_profile(p_phone text)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_res json;
  v_clean_phone text;
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');
  if length(v_clean_phone) >= 10 and left(v_clean_phone, 2) = '01' then
    v_clean_phone := right(v_clean_phone, 10);
  end if;

  select json_build_object(
    'phone', p_phone,
    'total_orders', count(distinct transaction_id),
    'total_lines', count(id),
    'total_spent', coalesce(sum(total), 0),
    'first_seen', min(received_at),
    'last_seen', max(received_at),
    'services_used', coalesce(json_agg(distinct service) filter (where service is not null), '[]'::json),
    'active_orders', count(id) filter (where status in ('Under Review', 'In Progress', 'Pending Exec', 'Pending Client')),
    'delivered_orders', count(id) filter (where status in ('Delivered', 'Complete'))
  ) into v_res
  from public.request_lines
  where regexp_replace(coalesce(phone, ''), '\D', '', 'g') like '%' || v_clean_phone || '%'
    and deleted_at is null;

  return v_res;
end $$;

create or replace function public.get_or_create_dm(other_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  k   text;
  cid uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  if other_id is null or other_id = me then raise exception 'invalid user'; end if;
  if not exists (select 1 from public.profiles where id = other_id) then raise exception 'user not found'; end if;

  k := least(me::text, other_id::text) || ':' || greatest(me::text, other_id::text);
  select id into cid from public.channels where dm_key = k;

  if cid is null then
    insert into public.channels (kind, dm_key, created_by) values ('dm', k, me)
    on conflict (dm_key) do nothing
    returning id into cid;
    if cid is null then select id into cid from public.channels where dm_key = k; end if;
    insert into public.channel_members (channel_id, user_id) values (cid, me), (cid, other_id)
    on conflict do nothing;
  end if;
  return cid;
end $$;

-- ===== فحص بعد التشغيل (اختياري) =====
-- select tablename from pg_policies where schemaname='public' and policyname='courier_block' order by 1;   -- لازم يطلع كل الجداول
-- select proname from pg_proc where proname like 'courier_%' or proname in ('assign_courier','list_courier_accounts','is_courier');

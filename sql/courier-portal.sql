-- =====================================================================
-- بوابة المندوب (courier portal) — النسخة 2
-- الملف: sql/courier-portal.sql — قابل لإعادة التشغيل بأمان (Idempotent).
-- شغّله في Supabase SQL Editor قبل رفع js/70-courier-portal.js.
--
-- المبدأ: المندوب مالوش أي وصول مباشر لأي جدول. كل اللي بيشوفه وبيعمله بيتم
-- عن طريق دوال courier_* بس، وكل دالة بتجيب شغل المندوب نفسه فقط (مش شغل زمايله).
--   شغل المندوب = مشاوير courier_trips المسجّلة باسمه (استلام/تسليم) + بنود «رسوم توصيل» منفّذها هو.
--   التأكيد (آخر اليوم) بيخلّي المشوار يتحسب في عمولته المؤكدة. المندوب مابيغيّرش حالة المعاملة.
-- =====================================================================

-- 0) تنضيف دوال النسخة الأولى (كانت بتعرض كل المعاملات وبتغيّر حالتها)
drop function if exists public.courier_list_tx(int);
drop function if exists public.courier_confirm(text, text, text, text);

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

-- توحيد الأسماء العربية (زي normName في الواجهة): تشكيل/همزات/ى/ة/علامات ترقيم
create or replace function public.norm_ar(s text)
returns text language sql immutable set search_path = public as $$
  select lower(btrim(regexp_replace(
    translate(regexp_replace(coalesce(s, ''), '[ً-ٰٟـ]', '', 'g'), 'أإآٱىة', 'اااايه'),
    '[\s[:punct:]]+', ' ', 'g')))
$$;

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
  -- المندوب مايكونش عضو في قناة الموظفين العامة (الشات الوحيد له رسايل خاصة)
  delete from public.channel_members m using public.channels c
   where m.user_id = u and m.channel_id = c.id and c.kind = 'general';
end $$;

drop function if exists public.list_courier_accounts();
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

-- 4) تأكيد المندوب
alter table public.courier_trips add column if not exists courier_confirmed_at timestamptz;

-- لو الموظف غيّر المندوب أو الرسوم أو اليوم بعد التأكيد، التأكيد يتلغي
create or replace function public.trg_courier_trip_reset()
returns trigger language plpgsql as $$
begin
  if new.courier is distinct from old.courier or new.fee is distinct from old.fee
     or new.trip_day is distinct from old.trip_day or new.transaction_id is distinct from old.transaction_id then
    new.courier_confirmed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists courier_trip_reset on public.courier_trips;
create trigger courier_trip_reset before update on public.courier_trips
  for each row execute function public.trg_courier_trip_reset();

-- تأكيد بنود «رسوم التوصيل» (بنود في request_lines فمش بنضيف عليها أعمدة)
create table if not exists public.courier_fee_confirms (
  line_id bigint primary key,
  courier text not null,
  amount numeric not null,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid
);
alter table public.courier_fee_confirms enable row level security;
revoke all on table public.courier_fee_confirms from public, anon;
grant select on table public.courier_fee_confirms to authenticated;
drop policy if exists cfc_select_staff on public.courier_fee_confirms;
create policy cfc_select_staff on public.courier_fee_confirms for select to authenticated using (public.is_staff());

-- 5) دوال المندوب (كلها للمندوب فقط، وبتشتغل على شغله هو)
create or replace function public.courier_me()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.couriers;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into r from public.couriers where user_id = auth.uid() and active;
  if r.id is null then raise exception 'courier account not linked' using errcode = '42501'; end if;
  return jsonb_build_object('id', r.id, 'name', r.name, 'user_id', auth.uid(),
                            'fee', coalesce((select max(fee) from public.courier_trips where fee > 0), 40));
end $$;

-- شغلي: مشاويري (استلام/تسليم) + رسوم التوصيل المسجّلة باسمي، في فترة (افتراضي آخر 62 يوم)
create or replace function public.courier_items(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_to date := coalesce(p_to, (now() at time zone 'Africa/Cairo')::date);
  v_from date;
  v_me text;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier account not linked' using errcode = '42501'; end if;
  v_me := public.norm_ar(v_c.name);
  v_from := greatest(coalesce(p_from, v_today - 62), v_to - 120);

  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.day desc, r.sort desc) from (
      -- مشاوير الاستلام والتسليم
      select t.kind as type, t.id, t.transaction_id, t.trip_day as day, t.fee as amount, t.id as sort,
             (t.courier_confirmed_at is not null) as confirmed, t.courier_confirmed_at as confirmed_at,
             null::text as fee_kind, i.client_name, i.phone, i.address, i.services, i.employee,
             i.lines, i.n_complete, i.n_delivered, i.n_review,
             (select p.id from public.profiles p where public.norm_ar(p.full_name) = public.norm_ar(i.employee) limit 1) as employee_id,
             (select p.phone from public.profiles p where public.norm_ar(p.full_name) = public.norm_ar(i.employee) limit 1) as employee_phone,
             (select count(*) from public.tx_comments c where c.transaction_id = t.transaction_id and c.author_id = auth.uid() and c.deleted_at is null) as my_notes
        from public.courier_trips t
        left join lateral (
          select max(l.client_name) as client_name, max(l.phone) as phone, max(l.address) as address, max(l.employee) as employee,
                 string_agg(distinct l.service, '، ') as services, count(*) as lines,
                 count(*) filter (where l.complete) as n_complete, count(*) filter (where l.delivered) as n_delivered,
                 count(*) filter (where l.under_review) as n_review
            from public.request_lines l where l.transaction_id = t.transaction_id and l.deleted_at is null) i on true
       where public.norm_ar(t.courier) = v_me and t.trip_day between v_from and v_to
      union all
      -- رسوم التوصيل (ذهاب أو ذهاب وعودة) المسجّلة باسمي
      select 'fee', l.id, l.transaction_id, l.received_at::date, f.amount, l.id,
             (fc.line_id is not null), fc.confirmed_at,
             case when public.norm_ar(l.service) ~ 'عوده|رجوع' then 'round' else 'one' end,
             coalesce(l.client_name, i.client_name), coalesce(l.phone, i.phone), coalesce(l.address, i.address), l.service, l.employee,
             i.lines, i.n_complete, i.n_delivered, i.n_review,
             (select p.id from public.profiles p where public.norm_ar(p.full_name) = public.norm_ar(l.employee) limit 1),
             (select p.phone from public.profiles p where public.norm_ar(p.full_name) = public.norm_ar(l.employee) limit 1),
             (select count(*) from public.tx_comments c where c.transaction_id = l.transaction_id and c.author_id = auth.uid() and c.deleted_at is null)
        from public.request_lines l
        cross join lateral (select coalesce(nullif(l.exec_total, 0), coalesce(l.qty, 0) * coalesce(l.exec_unit_cost, 0)) as amount) f
        left join public.courier_fee_confirms fc
          on fc.line_id = l.id and public.norm_ar(fc.courier) = v_me and fc.amount = f.amount
        left join lateral (
          select max(x.client_name) as client_name, max(x.phone) as phone, max(x.address) as address, count(*) as lines,
                 count(*) filter (where x.complete) as n_complete, count(*) filter (where x.delivered) as n_delivered,
                 count(*) filter (where x.under_review) as n_review
            from public.request_lines x where x.transaction_id = l.transaction_id and x.deleted_at is null) i on true
       where l.deleted_at is null and public.norm_ar(l.service) like 'رسوم توصيل%'
         and public.norm_ar(l.executor) = v_me and l.received_at::date between v_from and v_to
    ) r), '[]'::jsonb);
end $$;

-- تأكيد آخر اليوم: كل مشاوير النوع ده في اليوم ده (غير المؤكدة) تتأكد وتتحسب في عمولتي
create or replace function public.courier_confirm_day(p_kind text, p_day date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_me text;
  v_n int := 0;
  v_amt numeric := 0;
  v_label text;
  v_txs text[];
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier account not linked' using errcode = '42501'; end if;
  if p_kind not in ('pickup','delivery','fee') then raise exception 'bad kind' using errcode = '22023'; end if;
  if p_day is null or p_day > v_today then raise exception 'bad day' using errcode = '22023'; end if;
  v_me := public.norm_ar(v_c.name);
  v_label := case p_kind when 'pickup' then 'تأكيد المندوب للاستلام' when 'delivery' then 'تأكيد المندوب للتسليم' else 'تأكيد المندوب لرسوم التوصيل' end;

  if p_kind in ('pickup','delivery') then
    with u as (
      update public.courier_trips set courier_confirmed_at = now()
       where kind = p_kind and trip_day = p_day and public.norm_ar(courier) = v_me and courier_confirmed_at is null
      returning transaction_id, fee)
    select count(*), coalesce(sum(fee), 0), array_agg(distinct transaction_id) into v_n, v_amt, v_txs from u;
  else
    with src as (
      select l.id, l.transaction_id, coalesce(nullif(l.exec_total, 0), coalesce(l.qty, 0) * coalesce(l.exec_unit_cost, 0)) as amount
        from public.request_lines l
       where l.deleted_at is null and public.norm_ar(l.service) like 'رسوم توصيل%'
         and public.norm_ar(l.executor) = v_me and l.received_at::date = p_day),
    ins as (
      insert into public.courier_fee_confirms (line_id, courier, amount, confirmed_by)
      select s.id, v_c.name, s.amount, auth.uid() from src s
      on conflict (line_id) do update
        set courier = excluded.courier, amount = excluded.amount, confirmed_at = now(), confirmed_by = excluded.confirmed_by
        where public.courier_fee_confirms.courier is distinct from excluded.courier or public.courier_fee_confirms.amount is distinct from excluded.amount
      returning line_id, amount)
    select count(*), coalesce(sum(i.amount), 0), array_agg(distinct s.transaction_id)
      into v_n, v_amt, v_txs from ins i join src s on s.id = i.line_id;
  end if;

  if v_n > 0 then
    insert into public.audit_log (transaction_id, action, service, user_name, details)
    select tx, 'updated', 'مندوب: ' || v_c.name, v_c.name,
           jsonb_build_object(v_label, jsonb_build_object('old', 'غير مؤكد', 'new', 'مؤكد'))
      from unnest(v_txs) as tx;
  end if;
  return jsonb_build_object('ok', true, 'count', v_n, 'amount', v_amt);
end $$;

-- ملاحظة على معاملة تخصّني: بتظهر كتعليق على المعاملة + إشعار للموظف المسؤول وللمدير
create or replace function public.courier_add_note(p_tx text, p_kind text, p_body text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_me text;
  v_tx text := btrim(coalesce(p_tx, ''));
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_prefix text;
  v_final text;
  v_emp text;
  v_emp_id uuid;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier account not linked' using errcode = '42501'; end if;
  if p_kind not in ('note','missing_fee','problem') then raise exception 'bad kind' using errcode = '22023'; end if;
  if p_kind <> 'missing_fee' and v_body is null then raise exception 'body required' using errcode = '22023'; end if;
  if v_body is not null and char_length(v_body) > 500 then raise exception 'body too long' using errcode = '22023'; end if;
  v_me := public.norm_ar(v_c.name);

  if not (exists (select 1 from public.courier_trips t where t.transaction_id = v_tx and public.norm_ar(t.courier) = v_me)
       or exists (select 1 from public.request_lines l where l.transaction_id = v_tx and l.deleted_at is null
                    and public.norm_ar(l.service) like 'رسوم توصيل%' and public.norm_ar(l.executor) = v_me)) then
    raise exception 'not your transaction' using errcode = '42501';
  end if;

  v_prefix := case p_kind when 'missing_fee' then '⚠ المشوار ده برسوم توصيل ومش متسجّل له رسوم'
                          when 'problem' then '🚩 مشكلة' else '🛵 ملاحظة مندوب' end;
  v_final := v_prefix || coalesce(' — ' || v_body, '') || ' (المندوب: ' || v_c.name || ')';

  insert into public.tx_comments (transaction_id, author_id, author_name, body, is_public)
  values (v_tx, auth.uid(), v_c.name || ' (مندوب)', v_final, false);

  select max(l.employee) into v_emp from public.request_lines l where l.transaction_id = v_tx and l.deleted_at is null;
  select p.id into v_emp_id from public.profiles p where public.norm_ar(p.full_name) = public.norm_ar(v_emp) limit 1;

  insert into public.notifications (user_id, kind, title, body)
  select distinct x.uid, 'info', 'ملاحظة من المندوب ' || v_c.name || ' على ' || v_tx, v_final
    from (select v_emp_id as uid union select ur.user_id from public.user_roles ur where ur.role = 'manager') x
   where x.uid is not null;

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.courier_tx_notes(p_tx text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'at', c.created_at) order by c.created_at desc)
                     from public.tx_comments c
                    where c.transaction_id = btrim(p_tx) and c.author_id = auth.uid() and c.deleted_at is null), '[]'::jsonb);
end $$;

-- 6) شات المندوب: رسايل خاصة فقط مع الموظفين والمدير
create or replace function public.courier_contacts()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.is_manager desc, r.last_at desc nulls last, r.full_name) from (
      select p.id, coalesce(nullif(btrim(p.full_name), ''), 'موظف') as full_name, p.job_title, p.phone, p.last_seen_at,
             (ur.role = 'manager') as is_manager, ch.id as channel_id, lm.body as last_body, lm.created_at as last_at, lm.sender_id as last_sender,
             coalesce((select count(*) from public.messages m join public.channel_members cm on cm.channel_id = m.channel_id and cm.user_id = me
                        where m.channel_id = ch.id and m.sender_id <> me and m.created_at > cm.last_read_at), 0) as unread
        from public.profiles p
        join public.user_roles ur on ur.user_id = p.id and ur.role in ('manager','staff')
        left join lateral (select c.id from public.channels c
                            where c.dm_key = least(me::text, p.id::text) || ':' || greatest(me::text, p.id::text)) ch on true
        left join lateral (select m.body, m.created_at, m.sender_id from public.messages m
                            where m.channel_id = ch.id order by m.created_at desc limit 1) lm on true
    ) r), '[]'::jsonb);
end $$;

create or replace function public.courier_dm(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; cid uuid;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  if p_other is null or p_other = me then raise exception 'invalid user' using errcode = '22023'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_other and role in ('manager','staff')) then
    raise exception 'invalid user' using errcode = '22023';
  end if;
  k := least(me::text, p_other::text) || ':' || greatest(me::text, p_other::text);
  select id into cid from public.channels where dm_key = k;
  if cid is null then
    insert into public.channels (kind, dm_key, created_by) values ('dm', k, me)
    on conflict (dm_key) do nothing returning id into cid;
    if cid is null then select id into cid from public.channels where dm_key = k; end if;
    insert into public.channel_members (channel_id, user_id) values (cid, me), (cid, p_other) on conflict do nothing;
  end if;
  return cid;
end $$;

drop function if exists public.courier_chat_messages(uuid, timestamptz);
create or replace function public.courier_chat_messages(p_channel uuid, p_after timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_other_read timestamptz;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  if not exists (select 1 from public.channels c join public.channel_members m on m.channel_id = c.id
                  where c.id = p_channel and c.kind = 'dm' and m.user_id = me) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select max(cm.last_read_at) into v_other_read
    from public.channel_members cm
   where cm.channel_id = p_channel and cm.user_id <> me;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at) from (
      select m.id, m.body, m.created_at, m.tx_id, (m.sender_id = me) as mine,
             case when m.sender_id = me then coalesce(v_other_read >= m.created_at, false) else true end as read
        from public.messages m
       where m.channel_id = p_channel and (p_after is null or m.created_at > p_after)
       order by m.created_at desc limit 120) x), '[]'::jsonb);
end $$;

create or replace function public.courier_chat_send(p_channel uuid, p_body text, p_tx text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_body text := btrim(coalesce(p_body, '')); r public.messages;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  if v_body = '' or char_length(v_body) > 2000 then raise exception 'bad body' using errcode = '22023'; end if;
  if not exists (select 1 from public.channels c join public.channel_members m on m.channel_id = c.id
                  where c.id = p_channel and c.kind = 'dm' and m.user_id = me) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.messages (channel_id, sender_id, body, tx_id) values (p_channel, me, v_body, nullif(btrim(coalesce(p_tx, '')), ''))
  returning * into r;
  update public.channel_members set last_read_at = now() where channel_id = p_channel and user_id = me;
  return jsonb_build_object('id', r.id, 'created_at', r.created_at);
end $$;

create or replace function public.courier_chat_read(p_channel uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  update public.channel_members set last_read_at = now() where channel_id = p_channel and user_id = auth.uid();
end $$;

-- المدير: متابعة المناديب (كام مشوار لسه ما اتأكدش + ملاحظات آخر 7 أيام)
create or replace function public.courier_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'user_id', c.user_id,
      'pending_trips', (select count(*) from public.courier_trips t where public.norm_ar(t.courier) = public.norm_ar(c.name) and t.courier_confirmed_at is null and t.fee > 0 and t.trip_day >= current_date - 30),
      'notes_7d', (select count(*) from public.tx_comments x where x.author_id = c.user_id and x.created_at > now() - interval '7 days' and x.deleted_at is null)
    ) order by c.sort_order, c.id) from public.couriers c where c.active and c.user_id is not null), '[]'::jsonb);
end $$;

revoke all on function
  public.courier_me(), public.courier_items(date, date), public.courier_confirm_day(text, date),
  public.courier_add_note(text, text, text), public.courier_tx_notes(text), public.courier_contacts(),
  public.courier_dm(uuid), public.courier_chat_messages(uuid, timestamptz), public.courier_chat_send(uuid, text, text),
  public.courier_chat_read(uuid), public.courier_overview(), public.norm_ar(text)
  from public, anon;
grant execute on function
  public.courier_me(), public.courier_items(date, date), public.courier_confirm_day(text, date),
  public.courier_add_note(text, text, text), public.courier_tx_notes(text), public.courier_contacts(),
  public.courier_dm(uuid), public.courier_chat_messages(uuid, timestamptz), public.courier_chat_send(uuid, text, text),
  public.courier_chat_read(uuid), public.courier_overview(), public.norm_ar(text)
  to authenticated;

-- 7) قفل كل حاجة تانية في وش المندوب (أهم جزء أمني)
-- سياسة RESTRICTIVE على كل جدول في public: لو الدور courier ترفض أي قراءة/كتابة.
-- (لازم لأن جداول زي client_360_notes و service_workflow_stages و request_line_stage_history
--  كانت مفتوحة لأي مستخدم مسجّل دخول.) لو أضفت جدول جديد بعد كده شغّل الجزء ده تاني.
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

-- 8) دالتين كانوا مفتوحين لأي مستخدم: نقصرهم على الموظفين
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
-- select proname from pg_proc where proname like 'courier_%' or proname in ('assign_courier','list_courier_accounts','is_courier','norm_ar');

-- =====================================================================
-- 9) إضافات بوابة المندوب (v5):
--    - courier_tx_detail(p_tx): تفاصيل المعاملة للمندوب (بدون أسعار عميل أو مدفوعات)
--    - courier_confirm_one(p_type, p_ref): تأكيد مشوار/بند واحد لوحده („أكّد ده بس“)
--    - courier_my_notes(): آخر ملاحظات المندوب عشان علامة „📨 أبلغت الموظف“
--    - courier_leaderboard(p_from, p_to): لوحة ترتيب الاستلامات والتسليم
-- =====================================================================

-- 9-أ) تفاصيل المعاملة للمندوب (البند A.2)
drop function if exists public.courier_tx_detail(text);
create or replace function public.courier_tx_detail(p_tx text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_me text;
  v_tx text := btrim(coalesce(p_tx, ''));
  v_client text;
  v_phone text;
  v_addr text;
  v_emp text;
  v_emp_id uuid;
  v_emp_phone text;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier account not linked' using errcode = '42501'; end if;
  v_me := public.norm_ar(v_c.name);

  if not (exists (select 1 from public.courier_trips t where t.transaction_id = v_tx and public.norm_ar(t.courier) = v_me)
       or exists (select 1 from public.request_lines l where l.transaction_id = v_tx and l.deleted_at is null
                    and public.norm_ar(l.service) like 'رسوم توصيل%' and public.norm_ar(l.executor) = v_me)) then
    raise exception 'not your transaction' using errcode = '42501';
  end if;

  select max(l.client_name), max(l.phone), max(l.address), max(l.employee)
    into v_client, v_phone, v_addr, v_emp
    from public.request_lines l
   where l.transaction_id = v_tx and l.deleted_at is null;

  select p.id, p.phone into v_emp_id, v_emp_phone
    from public.profiles p
   where public.norm_ar(p.full_name) = public.norm_ar(v_emp)
   limit 1;

  return jsonb_build_object(
    'transaction_id', v_tx,
    'client_name', v_client,
    'phone', v_phone,
    'address', v_addr,
    'employee', v_emp,
    'employee_id', v_emp_id,
    'employee_phone', v_emp_phone,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'service', l.service,
        'status', coalesce(l.status, case when l.delivered then 'Delivered' when l.complete then 'Complete' when l.under_review then 'Under Review' else 'In Progress' end),
        'complete', coalesce(l.complete, false),
        'delivered', coalesce(l.delivered, false),
        'under_review', coalesce(l.under_review, false),
        'received_at', l.received_at
      ) order by l.id)
      from public.request_lines l
      where l.transaction_id = v_tx and l.deleted_at is null
    ), '[]'::jsonb),
    'trips', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'kind', t.kind,
        'trip_day', t.trip_day,
        'fee', t.fee,
        'confirmed', (t.courier_confirmed_at is not null),
        'courier_confirmed_at', t.courier_confirmed_at
      ) order by t.trip_day desc, t.id desc)
      from public.courier_trips t
      where t.transaction_id = v_tx and public.norm_ar(t.courier) = v_me
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'body', c.body,
        'at', c.created_at
      ) order by c.created_at desc)
      from public.tx_comments c
      where c.transaction_id = v_tx and c.author_id = auth.uid() and c.deleted_at is null
    ), '[]'::jsonb)
  );
end $$;

-- 9-ب) تأكيد ريكوست/مشوار واحد لوحده „أكّد ده بس“ (البند B.1)
drop function if exists public.courier_confirm_one(text, text);
create or replace function public.courier_confirm_one(p_type text, p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_me text;
  v_ref text := btrim(coalesce(p_ref, ''));
  v_n int := 0;
  v_amt numeric := 0;
  v_tx text;
  v_line_id bigint;
  v_label text;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier account not linked' using errcode = '42501'; end if;
  if p_type not in ('pickup','delivery','fee') then raise exception 'bad kind' using errcode = '22023'; end if;
  if v_ref = '' then raise exception 'bad ref' using errcode = '22023'; end if;
  v_me := public.norm_ar(v_c.name);
  v_label := case p_type when 'pickup' then 'تأكيد المندوب للاستلام' when 'delivery' then 'تأكيد المندوب للتسليم' else 'تأكيد المندوب لرسوم التوصيل' end;

  if p_type in ('pickup','delivery') then
    if not exists (
      select 1 from public.courier_trips t
       where t.kind = p_type and public.norm_ar(t.courier) = v_me
         and (t.transaction_id = v_ref or t.id::text = v_ref)
    ) then
      raise exception 'not your transaction' using errcode = '42501';
    end if;

    with u as (
      update public.courier_trips t
         set courier_confirmed_at = now()
       where t.kind = p_type
         and public.norm_ar(t.courier) = v_me
         and (t.transaction_id = v_ref or t.id::text = v_ref)
         and t.trip_day <= v_today
         and t.courier_confirmed_at is null
      returning t.transaction_id, t.fee
    )
    select count(*), coalesce(sum(fee), 0), max(transaction_id) into v_n, v_amt, v_tx from u;
  else
    begin
      v_line_id := v_ref::bigint;
    exception when others then
      v_line_id := null;
    end;

    if not exists (
      select 1 from public.request_lines l
       where l.deleted_at is null
         and public.norm_ar(l.service) like 'رسوم توصيل%'
         and public.norm_ar(l.executor) = v_me
         and ((v_line_id is not null and l.id = v_line_id) or l.transaction_id = v_ref)
    ) then
      raise exception 'not your transaction' using errcode = '42501';
    end if;

    with src as (
      select l.id, l.transaction_id,
             coalesce(nullif(l.exec_total, 0), coalesce(l.qty, 0) * coalesce(l.exec_unit_cost, 0)) as amount
        from public.request_lines l
       where l.deleted_at is null
         and public.norm_ar(l.service) like 'رسوم توصيل%'
         and public.norm_ar(l.executor) = v_me
         and ((v_line_id is not null and l.id = v_line_id) or (v_line_id is null and l.transaction_id = v_ref))
         and l.received_at::date <= v_today
       limit 1
    ),
    ins as (
      insert into public.courier_fee_confirms (line_id, courier, amount, confirmed_by)
      select s.id, v_c.name, s.amount, auth.uid() from src s
      on conflict (line_id) do update
        set courier = excluded.courier, amount = excluded.amount, confirmed_at = now(), confirmed_by = excluded.confirmed_by
        where public.courier_fee_confirms.courier is distinct from excluded.courier or public.courier_fee_confirms.amount is distinct from excluded.amount
      returning line_id, amount
    )
    select count(*), coalesce(sum(i.amount), 0), max(s.transaction_id)
      into v_n, v_amt, v_tx
      from ins i join src s on s.id = i.line_id;
  end if;

  if v_n > 0 and v_tx is not null then
    insert into public.audit_log (transaction_id, action, service, user_name, details)
    values (v_tx, 'updated', 'مندوب: ' || v_c.name, v_c.name,
            jsonb_build_object(v_label, jsonb_build_object('old', 'غير مؤكد', 'new', 'مؤكد')));
  end if;

  return jsonb_build_object('ok', true, 'count', v_n, 'amount', v_amt, 'transaction_id', v_tx);
end $$;

-- 9-ج) آخر ملاحظات المندوب على معاملاته (عشان علامة „📨 أبلغت الموظف (الساعة ...)“)
drop function if exists public.courier_my_notes();
create or replace function public.courier_my_notes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_c public.couriers;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier account not linked' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.at desc) from (
      select distinct on (c.transaction_id)
             c.id, c.transaction_id, c.body, c.created_at as at
        from public.tx_comments c
       where c.author_id = auth.uid() and c.deleted_at is null
       order by c.transaction_id, c.created_at desc
       limit 200
    ) r
  ), '[]'::jsonb);
end $$;

-- 9-د) لوحة ترتيب المناديب (للمندوب: أعداد فقط بدون كشف عمولات غيره)
drop function if exists public.courier_leaderboard(date, date);
create or replace function public.courier_leaderboard(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_to date := coalesce(p_to, v_today);
  v_from date := greatest(coalesce(p_from, date_trunc('month', v_today)::date), v_to - 366);
  v_uid uuid := auth.uid();
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = v_uid and active;
  if v_c.id is null then raise exception 'courier account not linked' using errcode = '42501'; end if;

  return coalesce((
    with active_couriers as (
      select c.id, c.name, public.norm_ar(c.name) as norm_name, c.user_id, c.sort_order
        from public.couriers c
       where c.active = true
    ),
    trips_agg as (
      select public.norm_ar(t.courier) as norm_name,
             count(*) filter (where t.kind = 'pickup') as pickups_total,
             count(*) filter (where t.kind = 'pickup' and t.courier_confirmed_at is not null) as pickups_confirmed,
             count(*) filter (where t.kind = 'delivery') as deliveries_total,
             count(*) filter (where t.kind = 'delivery' and t.courier_confirmed_at is not null) as deliveries_confirmed
        from public.courier_trips t
       where t.trip_day between v_from and v_to
         and t.courier is not null and t.courier <> '—'
       group by public.norm_ar(t.courier)
    ),
    fees_agg as (
      select public.norm_ar(l.executor) as norm_name,
             count(*) as fees_total,
             count(*) filter (where fc.line_id is not null) as fees_confirmed
        from public.request_lines l
        left join public.courier_fee_confirms fc
          on fc.line_id = l.id
         and public.norm_ar(fc.courier) = public.norm_ar(l.executor)
       where l.deleted_at is null
         and public.norm_ar(l.service) like 'رسوم توصيل%'
         and l.received_at::date between v_from and v_to
       group by public.norm_ar(l.executor)
    ),
    combined as (
      select ac.id,
             ac.name,
             (ac.user_id = v_uid) as is_me,
             coalesce(ta.pickups_total, 0) as pickups,
             coalesce(ta.pickups_confirmed, 0) as pickups_confirmed,
             coalesce(ta.deliveries_total, 0) as deliveries,
             coalesce(ta.deliveries_confirmed, 0) as deliveries_confirmed,
             coalesce(fa.fees_total, 0) as fee_trips,
             coalesce(fa.fees_confirmed, 0) as fee_trips_confirmed,
             (coalesce(ta.pickups_total, 0) + coalesce(ta.deliveries_total, 0) + coalesce(fa.fees_total, 0)) as total_trips,
             (coalesce(ta.pickups_confirmed, 0) + coalesce(ta.deliveries_confirmed, 0) + coalesce(fa.fees_confirmed, 0)) as confirmed_trips,
             ac.sort_order
        from active_couriers ac
        left join trips_agg ta on ta.norm_name = ac.norm_name
        left join fees_agg fa on fa.norm_name = ac.norm_name
    ),
    ranked as (
      select c.*,
             dense_rank() over (
               order by c.total_trips desc, c.deliveries desc, c.pickups desc, c.confirmed_trips desc, c.sort_order asc, c.id asc
             ) as rank
        from combined c
    )
    select jsonb_agg(to_jsonb(r) order by r.rank asc, r.sort_order asc, r.id asc)
      from ranked r
  ), '[]'::jsonb);
end $$;

revoke all on function
  public.courier_tx_detail(text),
  public.courier_confirm_one(text, text),
  public.courier_my_notes(),
  public.courier_leaderboard(date, date)
  from public, anon;

grant execute on function
  public.courier_tx_detail(text),
  public.courier_confirm_one(text, text),
  public.courier_my_notes(),
  public.courier_leaderboard(date, date)
  to authenticated;

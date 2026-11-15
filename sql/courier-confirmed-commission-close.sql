-- ============================================================
-- المرحلة 11: تأكيد المشاوير والتقفيل المالي الآمن للمندوبين
-- يُشغّل بعد sql/courier-portal.sql
-- لا يغيّر أي مشوار قديم أو ينشئ تأكيدات تلقائيًا؛ فقط يضيف
-- تاريخ التأكيد لبنود رسوم التوصيل ويطابق التأكيدات القائمة.
-- ============================================================

-- 1) تثبيت تاريخ تأكيد رسوم التوصيل حتى لا ينتقل التأكيد لبند
-- تغيّر تاريخه أو بياناته لاحقًا.
alter table public.courier_fee_confirms
  add column if not exists trip_day date;

update public.courier_fee_confirms fc
   set trip_day = l.received_at::date
  from public.request_lines l
 where l.id = fc.line_id
   and fc.trip_day is null
   and l.received_at is not null;

create index if not exists courier_fee_confirms_courier_day_idx
  on public.courier_fee_confirms (courier, trip_day);

create or replace function public.trg_courier_fee_confirm_reset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.courier_fee_confirms where line_id = old.id;
    return old;
  end if;

  if new.executor is distinct from old.executor
     or new.service is distinct from old.service
     or new.received_at is distinct from old.received_at
     or new.exec_total is distinct from old.exec_total
     or new.qty is distinct from old.qty
     or new.exec_unit_cost is distinct from old.exec_unit_cost
     or new.deleted_at is distinct from old.deleted_at then
    delete from public.courier_fee_confirms where line_id = old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists courier_fee_confirm_reset on public.request_lines;
create trigger courier_fee_confirm_reset
before update or delete on public.request_lines
for each row execute function public.trg_courier_fee_confirm_reset();
revoke all on function public.trg_courier_fee_confirm_reset() from public, anon, authenticated;

-- 2) عرض رسوم التوصيل كمؤكدة فقط إذا تطابق المندوب والمبلغ واليوم.
create or replace function public.courier_items(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_to date := coalesce(p_to, (now() at time zone 'Africa/Cairo')::date);
  v_from date;
  v_me text;
begin
  if not public.is_courier() then
    raise exception 'courier only' using errcode = '42501';
  end if;

  select * into v_c
    from public.couriers
   where user_id = auth.uid() and active;

  if v_c.id is null then
    raise exception 'courier account not linked' using errcode = '42501';
  end if;

  v_me := public.norm_ar(v_c.name);
  v_from := greatest(coalesce(p_from, v_today - 62), v_to - 120);

  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.day desc, r.sort desc)
      from (
        select t.kind as type, t.id, t.transaction_id, t.trip_day as day,
               t.fee as amount, t.id as sort,
               (t.courier_confirmed_at is not null) as confirmed,
               t.courier_confirmed_at as confirmed_at,
               null::text as fee_kind,
               i.client_name, i.phone, i.address, i.services, i.employee,
               i.lines, i.n_complete, i.n_delivered, i.n_review,
               (select p.id from public.profiles p
                 where public.norm_ar(p.full_name) = public.norm_ar(i.employee) limit 1) as employee_id,
               (select p.phone from public.profiles p
                 where public.norm_ar(p.full_name) = public.norm_ar(i.employee) limit 1) as employee_phone,
               (select count(*) from public.tx_comments c
                 where c.transaction_id = t.transaction_id
                   and c.author_id = auth.uid() and c.deleted_at is null) as my_notes
          from public.courier_trips t
          left join lateral (
            select max(l.client_name) as client_name,
                   max(l.phone) as phone,
                   max(l.address) as address,
                   max(l.employee) as employee,
                   string_agg(distinct l.service, '، ') as services,
                   count(*) as lines,
                   count(*) filter (where l.complete) as n_complete,
                   count(*) filter (where l.delivered) as n_delivered,
                   count(*) filter (where l.under_review) as n_review
              from public.request_lines l
             where l.transaction_id = t.transaction_id and l.deleted_at is null
          ) i on true
         where public.norm_ar(t.courier) = v_me
           and t.trip_day between v_from and v_to

        union all

        select 'fee', l.id, l.transaction_id, l.received_at::date,
               f.amount, l.id,
               (fc.line_id is not null), fc.confirmed_at,
               case when public.norm_ar(l.service) ~ 'عوده|رجوع' then 'round' else 'one' end,
               coalesce(l.client_name, i.client_name),
               coalesce(l.phone, i.phone),
               coalesce(l.address, i.address),
               l.service, l.employee,
               i.lines, i.n_complete, i.n_delivered, i.n_review,
               (select p.id from public.profiles p
                 where public.norm_ar(p.full_name) = public.norm_ar(l.employee) limit 1),
               (select p.phone from public.profiles p
                 where public.norm_ar(p.full_name) = public.norm_ar(l.employee) limit 1),
               (select count(*) from public.tx_comments c
                 where c.transaction_id = l.transaction_id
                   and c.author_id = auth.uid() and c.deleted_at is null)
          from public.request_lines l
          cross join lateral (
            select coalesce(nullif(l.exec_total, 0),
                            coalesce(l.qty, 0) * coalesce(l.exec_unit_cost, 0)) as amount
          ) f
          left join public.courier_fee_confirms fc
            on fc.line_id = l.id
           and public.norm_ar(fc.courier) = v_me
           and fc.amount = f.amount
           and fc.trip_day = l.received_at::date
          left join lateral (
            select max(x.client_name) as client_name,
                   max(x.phone) as phone,
                   max(x.address) as address,
                   count(*) as lines,
                   count(*) filter (where x.complete) as n_complete,
                   count(*) filter (where x.delivered) as n_delivered,
                   count(*) filter (where x.under_review) as n_review
              from public.request_lines x
             where x.transaction_id = l.transaction_id and x.deleted_at is null
          ) i on true
         where l.deleted_at is null
           and public.norm_ar(l.service) like 'رسوم توصيل%'
           and public.norm_ar(l.executor) = v_me
           and l.received_at::date between v_from and v_to
      ) r
  ), '[]'::jsonb);
end;
$$;

-- 3) تأكيد يوم كامل: حفظ تاريخ بند رسوم التوصيل مع التأكيد.
create or replace function public.courier_confirm_day(p_kind text, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_me text;
  v_n int := 0;
  v_amt numeric := 0;
  v_label text;
  v_txs text[];
begin
  if not public.is_courier() then
    raise exception 'courier only' using errcode = '42501';
  end if;

  select * into v_c from public.couriers
   where user_id = auth.uid() and active;

  if v_c.id is null then
    raise exception 'courier account not linked' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('pickup','delivery','fee') then
    raise exception 'bad kind' using errcode = '22023';
  end if;
  if p_day is null or p_day > v_today then
    raise exception 'bad day' using errcode = '22023';
  end if;

  v_me := public.norm_ar(v_c.name);
  v_label := case p_kind
    when 'pickup' then 'تأكيد المندوب للاستلام'
    when 'delivery' then 'تأكيد المندوب للتسليم'
    else 'تأكيد المندوب لرسوم التوصيل'
  end;

  if p_kind in ('pickup','delivery') then
    with u as (
      update public.courier_trips
         set courier_confirmed_at = now()
       where kind = p_kind
         and trip_day = p_day
         and public.norm_ar(courier) = v_me
         and courier_confirmed_at is null
      returning transaction_id, fee
    )
    select count(*), coalesce(sum(fee), 0),
           array_agg(distinct transaction_id)
      into v_n, v_amt, v_txs
      from u;
  else
    with src as (
      select l.id, l.transaction_id, l.received_at::date as trip_day,
             coalesce(nullif(l.exec_total, 0),
                      coalesce(l.qty, 0) * coalesce(l.exec_unit_cost, 0)) as amount
        from public.request_lines l
       where l.deleted_at is null
         and public.norm_ar(l.service) like 'رسوم توصيل%'
         and public.norm_ar(l.executor) = v_me
         and l.received_at::date = p_day
    ),
    ins as (
      insert into public.courier_fee_confirms
        (line_id, courier, amount, trip_day, confirmed_by)
      select s.id, v_c.name, s.amount, s.trip_day, auth.uid()
        from src s
      on conflict (line_id) do update
        set courier = excluded.courier,
            amount = excluded.amount,
            trip_day = excluded.trip_day,
            confirmed_at = now(),
            confirmed_by = excluded.confirmed_by
      where public.courier_fee_confirms.courier is distinct from excluded.courier
         or public.courier_fee_confirms.amount is distinct from excluded.amount
         or public.courier_fee_confirms.trip_day is distinct from excluded.trip_day
      returning line_id, amount
    )
    select count(*), coalesce(sum(i.amount), 0),
           array_agg(distinct s.transaction_id)
      into v_n, v_amt, v_txs
      from ins i
      join src s on s.id = i.line_id;
  end if;

  if v_n > 0 then
    insert into public.audit_log
      (transaction_id, action, service, user_name, details)
    select tx, 'updated', 'مندوب: ' || v_c.name, v_c.name,
           jsonb_build_object(v_label,
             jsonb_build_object('old', 'غير مؤكد', 'new', 'مؤكد'))
      from unnest(v_txs) as tx;
  end if;

  return jsonb_build_object('ok', true, 'count', v_n, 'amount', v_amt);
end;
$$;

-- 4) التأكيد الفردي يستهدف سجل المشوار نفسه (id)، وليس كل مشاوير المعاملة.
create or replace function public.courier_confirm_one(p_type text, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_me text;
  v_ref text := btrim(coalesce(p_ref, ''));
  v_trip_id bigint;
  v_line_id bigint;
  v_n int := 0;
  v_amt numeric := 0;
  v_tx text;
  v_label text;
begin
  if not public.is_courier() then
    raise exception 'courier only' using errcode = '42501';
  end if;

  select * into v_c from public.couriers
   where user_id = auth.uid() and active;

  if v_c.id is null then
    raise exception 'courier account not linked' using errcode = '42501';
  end if;
  if p_type is null or p_type not in ('pickup','delivery','fee') or v_ref = '' then
    raise exception 'bad confirmation reference' using errcode = '22023';
  end if;

  v_me := public.norm_ar(v_c.name);
  v_label := case p_type
    when 'pickup' then 'تأكيد المندوب للاستلام'
    when 'delivery' then 'تأكيد المندوب للتسليم'
    else 'تأكيد المندوب لرسوم التوصيل'
  end;

  if p_type in ('pickup','delivery') then
    if left(v_ref, 5) = 'trip:' then
      begin
        v_trip_id := substring(v_ref from 6)::bigint;
      exception when invalid_text_representation or numeric_value_out_of_range then
        v_trip_id := null;
      end;
      if v_trip_id is null then
        raise exception 'bad trip id' using errcode = '22023';
      end if;

      with u as (
        update public.courier_trips t
           set courier_confirmed_at = now()
         where t.id = v_trip_id
           and t.kind = p_type
           and public.norm_ar(t.courier) = v_me
           and t.trip_day <= v_today
           and t.courier_confirmed_at is null
        returning t.transaction_id, t.fee
      )
      select count(*), coalesce(sum(fee), 0), max(transaction_id)
        into v_n, v_amt, v_tx
        from u;

      if not exists (
        select 1 from public.courier_trips t
         where t.id = v_trip_id and t.kind = p_type
           and public.norm_ar(t.courier) = v_me
           and t.trip_day <= v_today
      ) then
        raise exception 'not your trip' using errcode = '42501';
      end if;
    else
      -- توافق مؤقت مع النسخة القديمة من الواجهة التي كانت ترسل رقم المعاملة.
      with u as (
        update public.courier_trips t
           set courier_confirmed_at = now()
         where t.transaction_id = v_ref
           and t.kind = p_type
           and public.norm_ar(t.courier) = v_me
           and t.trip_day <= v_today
           and t.courier_confirmed_at is null
        returning t.transaction_id, t.fee
      )
      select count(*), coalesce(sum(fee), 0), max(transaction_id)
        into v_n, v_amt, v_tx
        from u;

      if not exists (
        select 1 from public.courier_trips t
         where t.transaction_id = v_ref and t.kind = p_type
           and public.norm_ar(t.courier) = v_me
      ) then
        raise exception 'not your trip' using errcode = '42501';
      end if;
    end if;
  else
    if left(v_ref, 4) = 'fee:' then
      v_ref := substring(v_ref from 5);
    end if;
    begin
      v_line_id := v_ref::bigint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      v_line_id := null;
    end;

    if v_line_id is null then
      raise exception 'bad fee line id' using errcode = '22023';
    end if;

    with src as (
      select l.id, l.transaction_id, l.received_at::date as trip_day,
             coalesce(nullif(l.exec_total, 0),
                      coalesce(l.qty, 0) * coalesce(l.exec_unit_cost, 0)) as amount
        from public.request_lines l
       where l.id = v_line_id
         and l.deleted_at is null
         and public.norm_ar(l.service) like 'رسوم توصيل%'
         and public.norm_ar(l.executor) = v_me
         and l.received_at::date <= v_today
    ),
    ins as (
      insert into public.courier_fee_confirms
        (line_id, courier, amount, trip_day, confirmed_by)
      select s.id, v_c.name, s.amount, s.trip_day, auth.uid()
        from src s
      on conflict (line_id) do update
        set courier = excluded.courier,
            amount = excluded.amount,
            trip_day = excluded.trip_day,
            confirmed_at = now(),
            confirmed_by = excluded.confirmed_by
      where public.courier_fee_confirms.courier is distinct from excluded.courier
         or public.courier_fee_confirms.amount is distinct from excluded.amount
         or public.courier_fee_confirms.trip_day is distinct from excluded.trip_day
      returning line_id, amount
    )
    select count(*), coalesce(sum(i.amount), 0), max(s.transaction_id)
      into v_n, v_amt, v_tx
      from ins i join src s on s.id = i.line_id;

    if not exists (
      select 1 from public.request_lines l
       where l.id = v_line_id and l.deleted_at is null
         and public.norm_ar(l.service) like 'رسوم توصيل%'
         and public.norm_ar(l.executor) = v_me
         and l.received_at::date <= v_today
    ) then
      raise exception 'not your fee line' using errcode = '42501';
    end if;
  end if;

  if v_n > 0 and v_tx is not null then
    insert into public.audit_log
      (transaction_id, action, service, user_name, details)
    values
      (v_tx, 'updated', 'مندوب: ' || v_c.name, v_c.name,
       jsonb_build_object(v_label,
         jsonb_build_object('old', 'غير مؤكد', 'new', 'مؤكد')));
  end if;

  return jsonb_build_object('ok', true, 'count', v_n, 'amount', v_amt,
                            'transaction_id', v_tx);
end;
$$;

-- 5) مزامنة تأكيدات رسوم التوصيل في بيانات لوحة الترتيب.
create or replace function public.courier_leaderboard(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_to date := coalesce(p_to, v_today);
  v_from date := greatest(coalesce(p_from, date_trunc('month', v_today)::date), v_to - 366);
  v_uid uuid := auth.uid();
begin
  if not public.is_courier() then
    raise exception 'courier only' using errcode = '42501';
  end if;
  select * into v_c from public.couriers where user_id = v_uid and active;
  if v_c.id is null then
    raise exception 'courier account not linked' using errcode = '42501';
  end if;

  return coalesce((
    with active_couriers as (
      select c.id, c.name, public.norm_ar(c.name) as norm_name,
             c.user_id, c.sort_order
        from public.couriers c
       where c.active = true and c.user_id is not null
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
        cross join lateral (
          select coalesce(nullif(l.exec_total, 0),
                          coalesce(l.qty, 0) * coalesce(l.exec_unit_cost, 0)) as amount
        ) f
        left join public.courier_fee_confirms fc
          on fc.line_id = l.id
         and public.norm_ar(fc.courier) = public.norm_ar(l.executor)
         and fc.amount = f.amount
         and fc.trip_day = l.received_at::date
       where l.deleted_at is null
         and public.norm_ar(l.service) like 'رسوم توصيل%'
         and l.received_at::date between v_from and v_to
       group by public.norm_ar(l.executor)
    ),
    combined as (
      select ac.id, ac.name, (ac.user_id = v_uid) as is_me,
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
               order by c.total_trips desc, c.deliveries desc, c.pickups desc,
                        c.confirmed_trips desc, c.sort_order asc, c.id asc
             ) as rank
        from combined c
    )
    select jsonb_agg(to_jsonb(r) order by r.rank asc, r.sort_order asc, r.id asc)
      from ranked r
  ), '[]'::jsonb);
end;
$$;

-- منع الكتابة المباشرة من الواجهة؛ الإغلاق وإعادة الفتح يمران عبر RPC محمي.
drop policy if exists courier_closings_mgr on public.courier_closings;

-- 6) سجل تقفيلات غير قابل للمسح: إعادة الفتح تحفظ السجل وتحرر
-- المشاوير لإمكانية تقفيلها لاحقًا دون تكرارها في تقفيلين نشطين.
alter table public.courier_closings
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by text;

alter table public.courier_closings
  drop constraint if exists courier_closings_period_type_check,
  drop constraint if exists courier_closings_courier_period_start_period_end_key;

alter table public.courier_closings
  add constraint courier_closings_period_type_check
  check (period_type = any (array['today','week','month','prev_month','all','custom']::text[]));

create unique index if not exists courier_closings_active_period_uidx
  on public.courier_closings (lower(btrim(courier)), period_start, period_end)
  where reopened_at is null;

create table if not exists public.courier_closing_items (
  id bigserial primary key,
  closing_id bigint not null references public.courier_closings(id) on delete restrict,
  source_type text not null check (source_type = any (array['pickup','delivery','fee']::text[])),
  source_id bigint not null,
  transaction_id text,
  trip_day date not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  released_by text
);

alter table public.courier_closing_items enable row level security;
revoke all on table public.courier_closing_items from public, anon, authenticated;

create unique index if not exists courier_closing_items_active_source_uidx
  on public.courier_closing_items (source_type, source_id)
  where released_at is null;

create index if not exists courier_closing_items_closing_id_idx
  on public.courier_closing_items (closing_id);

create or replace function public.courier_close_account(
  p_courier text,
  p_period_type text,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_closing_id bigint;
  v_trip_count integer := 0;
  v_trip_amount numeric := 0;
  v_fee_amount numeric := 0;
  v_total numeric := 0;
  v_item_count integer := 0;
begin
  if not public.is_manager() then
    raise exception 'manager only' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_courier, '')), '') is null
     or p_period_start is null or p_period_end is null
     or p_period_start > p_period_end
     or p_period_type is null
     or p_period_type not in ('today','week','month','prev_month','all','custom')
     or p_period_end > (now() at time zone 'Africa/Cairo')::date then
    raise exception 'invalid closing parameters' using errcode = '22023';
  end if;

  select c.name into v_name
    from public.couriers c
   where public.norm_ar(c.name) = public.norm_ar(p_courier)
   order by c.active desc, c.id
   limit 1;
  if v_name is null then
    raise exception 'courier not found' using errcode = 'P0002';
  end if;

  -- تسلسل أي تقفيلات للمندوب نفسه يمنع سباق عمليتين متزامنتين.
  perform pg_advisory_xact_lock(hashtextextended(public.norm_ar(v_name), 0));

  if exists (
    select 1 from public.courier_closings c
     where lower(btrim(c.courier)) = lower(btrim(v_name))
       and c.period_start = p_period_start
       and c.period_end = p_period_end
       and c.reopened_at is null
  ) then
    raise exception 'this period is already closed' using errcode = '23505';
  end if;

  insert into public.courier_closings
    (courier, period_type, period_start, period_end,
     trips_count, trips_amount, far_amount, total, closed_by)
  values
    (v_name, p_period_type, p_period_start, p_period_end,
     0, 0, 0, 0, coalesce(auth.jwt() ->> 'email', 'manager'))
  returning id into v_closing_id;

  with candidates as (
    select t.kind as source_type, t.id as source_id,
           t.transaction_id, t.trip_day, coalesce(t.fee, 0) as amount
      from public.courier_trips t
     where public.norm_ar(t.courier) = public.norm_ar(v_name)
       and t.trip_day between p_period_start and p_period_end
       and t.courier_confirmed_at is not null
       and coalesce(t.fee, 0) > 0
       and not exists (
         select 1 from public.courier_closing_items ci
          where ci.source_type = t.kind
            and ci.source_id = t.id
            and ci.released_at is null
       )

    union all

    select 'fee'::text, l.id, l.transaction_id, l.received_at::date, f.amount
      from public.request_lines l
      cross join lateral (
        select coalesce(nullif(l.exec_total, 0),
                        coalesce(l.qty, 0) * coalesce(l.exec_unit_cost, 0)) as amount
      ) f
      join public.courier_fee_confirms fc
        on fc.line_id = l.id
       and public.norm_ar(fc.courier) = public.norm_ar(v_name)
       and fc.amount = f.amount
       and fc.trip_day = l.received_at::date
     where l.deleted_at is null
       and public.norm_ar(l.service) like 'رسوم توصيل%'
       and public.norm_ar(l.executor) = public.norm_ar(v_name)
       and l.received_at::date between p_period_start and p_period_end
       and not exists (
         select 1 from public.courier_closing_items ci
          where ci.source_type = 'fee'
            and ci.source_id = l.id
            and ci.released_at is null
       )
  ),
  inserted as (
    insert into public.courier_closing_items
      (closing_id, source_type, source_id, transaction_id, trip_day, amount)
    select v_closing_id, c.source_type, c.source_id,
           c.transaction_id, c.trip_day, c.amount
      from candidates c
    returning source_type, amount
  )
  select count(*),
         count(*) filter (where source_type in ('pickup','delivery')),
         coalesce(sum(amount) filter (where source_type in ('pickup','delivery')), 0),
         coalesce(sum(amount) filter (where source_type = 'fee'), 0)
    into v_item_count, v_trip_count, v_trip_amount, v_fee_amount
    from inserted;

  if v_item_count = 0 then
    raise exception 'no confirmed and unclosed trips in this period' using errcode = 'P0001';
  end if;

  v_total := v_trip_amount + v_fee_amount;

  update public.courier_closings
     set trips_count = v_trip_count,
         trips_amount = v_trip_amount,
         far_amount = v_fee_amount,
         total = v_total
   where id = v_closing_id;

  return jsonb_build_object(
    'ok', true,
    'closing_id', v_closing_id,
    'trips_count', v_trip_count,
    'trips_amount', v_trip_amount,
    'far_amount', v_fee_amount,
    'total', v_total,
    'items_count', v_item_count
  );
end;
$$;

create or replace function public.courier_reopen_account(p_closing_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closing public.courier_closings;
begin
  if not public.is_manager() then
    raise exception 'manager only' using errcode = '42501';
  end if;
  if p_closing_id is null then
    raise exception 'closing id required' using errcode = '22023';
  end if;

  select * into v_closing
    from public.courier_closings
   where id = p_closing_id
     and reopened_at is null
   for update;

  if v_closing.id is null then
    raise exception 'active closing not found' using errcode = 'P0002';
  end if;

  -- نفس قفل المندوب المستخدم في التقفيل يمنع تداخل إعادة الفتح مع تقفيل جديد.
  perform pg_advisory_xact_lock(hashtextextended(public.norm_ar(v_closing.courier), 0));

  update public.courier_closing_items
     set released_at = now(),
         released_by = coalesce(auth.jwt() ->> 'email', 'manager')
   where closing_id = p_closing_id
     and released_at is null;

  update public.courier_closings
     set reopened_at = now(),
         reopened_by = coalesce(auth.jwt() ->> 'email', 'manager')
   where id = p_closing_id;

  return jsonb_build_object('ok', true, 'closing_id', p_closing_id,
                            'reopened_at', now());
end;
$$;

revoke all on function public.courier_close_account(text,text,date,date),
  public.courier_reopen_account(bigint)
  from public, anon;

grant execute on function public.courier_close_account(text,text,date,date),
  public.courier_reopen_account(bigint)
  to authenticated;

-- تحديث صلاحيات الدوال التي تم استبدالها مع الحفاظ على نمط الصلاحيات الحالي.
revoke all on function public.courier_items(date,date),
  public.courier_confirm_day(text,date),
  public.courier_confirm_one(text,text),
  public.courier_leaderboard(date,date)
  from public, anon;

grant execute on function public.courier_items(date,date),
  public.courier_confirm_day(text,date),
  public.courier_confirm_one(text,text),
  public.courier_leaderboard(date,date)
  to authenticated;

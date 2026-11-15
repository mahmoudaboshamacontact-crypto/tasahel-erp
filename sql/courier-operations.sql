-- =====================================================================
-- Courier Operations v1 — route order, operational states, issue tracking,
-- detailed commission ledger and payout marking.
-- Run AFTER courier-portal.sql and courier-confirmed-commission-close.sql.
-- This file is intentionally incremental; it does not rewrite historical trips.
-- =====================================================================

create table if not exists public.courier_trip_ops (
  trip_id bigint primary key references public.courier_trips(id) on delete cascade,
  operational_status text not null default 'new'
    check (operational_status in ('new','collecting','collected','on_the_way','delivered')),
  priority smallint not null default 3 check (priority between 1 and 5),
  route_order integer not null default 0,
  operational_note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index if not exists courier_trip_ops_route_idx
  on public.courier_trip_ops (route_order, priority, trip_id);
alter table public.courier_trip_ops enable row level security;
revoke all on public.courier_trip_ops from public, anon, authenticated;

create table if not exists public.courier_trip_issues (
  id bigserial primary key,
  trip_id bigint not null references public.courier_trips(id) on delete cascade,
  reporter_id uuid not null references auth.users(id),
  issue_type text not null check (issue_type in
    ('customer_unavailable','wrong_address','incorrect_fee','pickup_problem','other')),
  details text not null check (char_length(btrim(details)) between 3 and 1000),
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  resolution text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists courier_trip_issues_trip_idx
  on public.courier_trip_issues (trip_id, created_at desc);
create index if not exists courier_trip_issues_status_idx
  on public.courier_trip_issues (status, created_at desc);
alter table public.courier_trip_issues enable row level security;
revoke all on public.courier_trip_issues from public, anon, authenticated;

-- Existing closing means included in the administrative closing, not necessarily paid.
alter table public.courier_closings
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by text;

create or replace function public.courier_ops_items(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_c public.couriers; v_manager boolean := public.is_manager() or public.is_staff();
begin
  if not public.is_courier() and not v_manager then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if public.is_courier() then
    select * into v_c from public.couriers where user_id = auth.uid() and active;
    if v_c.id is null then raise exception 'courier account not linked' using errcode = '42501'; end if;
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.route_order, x.priority, x.trip_day, x.id)
    from (
      select t.id, t.transaction_id, t.kind, t.courier, t.trip_day,
             t.fee, t.courier_confirmed_at,
             coalesce(o.operational_status,'new') as operational_status,
             coalesce(o.priority,3) as priority,
             coalesce(o.route_order,0) as route_order,
             o.operational_note, o.updated_at,
             max(l.client_name) as client_name, max(l.phone) as phone,
             max(l.address) as address,
             string_agg(distinct l.service,'، ') as services
        from public.courier_trips t
        left join public.courier_trip_ops o on o.trip_id=t.id
        left join public.request_lines l on l.transaction_id=t.transaction_id and l.deleted_at is null
       where t.trip_day between coalesce(p_from,(now() at time zone 'Africa/Cairo')::date-30)
                            and coalesce(p_to,(now() at time zone 'Africa/Cairo')::date)
         and (v_manager or public.norm_ar(t.courier)=public.norm_ar(v_c.name))
       group by t.id,o.operational_status,o.priority,o.route_order,o.operational_note,o.updated_at
    ) x
  ),'[]'::jsonb);
end $$;

create or replace function public.courier_ops_update(
  p_trip_id bigint, p_status text default null, p_priority smallint default null,
  p_route_order integer default null, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t public.courier_trips; v_c public.couriers; v_manager boolean := public.is_manager() or public.is_staff();
begin
  if not public.is_courier() and not v_manager then raise exception 'not allowed' using errcode='42501'; end if;
  select * into v_t from public.courier_trips where id=p_trip_id for update;
  if v_t.id is null then raise exception 'trip not found' using errcode='P0002'; end if;
  if public.is_courier() then
    select * into v_c from public.couriers where user_id=auth.uid() and active;
    if v_c.id is null or public.norm_ar(v_t.courier)<>public.norm_ar(v_c.name) then
      raise exception 'not your trip' using errcode='42501';
    end if;
  end if;
  if p_status is not null and p_status not in ('new','collecting','collected','on_the_way','delivered') then
    raise exception 'invalid operational status' using errcode='22023';
  end if;
  if p_priority is not null and p_priority not between 1 and 5 then raise exception 'invalid priority' using errcode='22023'; end if;
  insert into public.courier_trip_ops(trip_id,operational_status,priority,route_order,operational_note,updated_by)
  values(p_trip_id,coalesce(p_status,'new'),coalesce(p_priority,3),coalesce(p_route_order,0),nullif(btrim(p_note),''),auth.uid())
  on conflict(trip_id) do update set
    operational_status=coalesce(p_status,courier_trip_ops.operational_status),
    priority=coalesce(p_priority,courier_trip_ops.priority),
    route_order=coalesce(p_route_order,courier_trip_ops.route_order),
    operational_note=case when p_note is null then courier_trip_ops.operational_note else nullif(btrim(p_note),'') end,
    updated_at=now(),updated_by=auth.uid();
  return jsonb_build_object('ok',true,'trip_id',p_trip_id);
end $$;

create or replace function public.courier_ops_report(p_trip_id bigint,p_issue_type text,p_details text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_t public.courier_trips; v_c public.couriers; v_id bigint; v_manager boolean := public.is_manager() or public.is_staff();
begin
  if not public.is_courier() and not v_manager then raise exception 'not allowed' using errcode='42501'; end if;
  select * into v_t from public.courier_trips where id=p_trip_id;
  if v_t.id is null then raise exception 'trip not found' using errcode='P0002'; end if;
  if public.is_courier() then
    select * into v_c from public.couriers where user_id=auth.uid() and active;
    if v_c.id is null or public.norm_ar(v_t.courier)<>public.norm_ar(v_c.name) then raise exception 'not your trip' using errcode='42501'; end if;
  end if;
  if p_issue_type not in ('customer_unavailable','wrong_address','incorrect_fee','pickup_problem','other')
     or char_length(btrim(coalesce(p_details,''))) not between 3 and 1000 then
    raise exception 'invalid issue details' using errcode='22023';
  end if;
  insert into public.courier_trip_issues(trip_id,reporter_id,issue_type,details)
  values(p_trip_id,auth.uid(),p_issue_type,btrim(p_details)) returning id into v_id;
  insert into public.notifications(user_id,kind,title,body)
  select distinct ur.user_id,'info','بلاغ مشكلة من المندوب '||v_t.courier||' — مشوار '||v_t.transaction_id,
         p_issue_type||' — '||left(btrim(p_details),700)
    from public.user_roles ur where ur.role in ('manager','staff') and ur.user_id<>auth.uid();
  return jsonb_build_object('ok',true,'issue_id',v_id);
end $$;

create or replace function public.courier_ops_issues(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_c public.couriers; v_manager boolean := public.is_manager() or public.is_staff();
begin
  if not public.is_courier() and not v_manager then raise exception 'not allowed' using errcode='42501'; end if;
  if public.is_courier() then
    select * into v_c from public.couriers where user_id=auth.uid() and active;
    if v_c.id is null then raise exception 'courier account not linked' using errcode='42501'; end if;
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select i.*,t.courier,t.transaction_id,t.trip_day,t.kind,
           (select p.full_name from public.profiles p where p.id=i.reporter_id) as reporter_name
      from public.courier_trip_issues i join public.courier_trips t on t.id=i.trip_id
     where (v_manager or i.reporter_id=auth.uid())
       and (p_status is null or i.status=p_status)
  ) x),'[]'::jsonb);
end $$;

create or replace function public.courier_ops_issue_update(p_issue_id bigint,p_status text,p_resolution text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_i public.courier_trip_issues; v_t public.courier_trips;
begin
  if not (public.is_manager() or public.is_staff()) then raise exception 'staff only' using errcode='42501'; end if;
  if p_status not in ('open','in_progress','resolved') then raise exception 'invalid status' using errcode='22023'; end if;
  update public.courier_trip_issues set status=p_status,
    resolution=case when p_resolution is null then resolution else nullif(btrim(p_resolution),'') end,
    assigned_to=coalesce(assigned_to,auth.uid()),updated_at=now(),
    resolved_at=case when p_status='resolved' then now() else null end
   where id=p_issue_id returning * into v_i;
  if v_i.id is null then raise exception 'issue not found' using errcode='P0002'; end if;
  select * into v_t from public.courier_trips where id=v_i.trip_id;
  insert into public.notifications(user_id,kind,title,body)
  select c.user_id,'info','تحديث على بلاغك — مشوار '||v_t.transaction_id,
         case p_status when 'resolved' then 'تم حل البلاغ: '||coalesce(v_i.resolution,'') when 'in_progress' then 'جاري متابعة البلاغ' else 'تم تحديث حالة البلاغ' end
    from public.couriers c where public.norm_ar(c.name)=public.norm_ar(v_t.courier) and c.user_id is not null;
  return jsonb_build_object('ok',true,'issue_id',p_issue_id);
end $$;

create or replace function public.courier_ops_ledger(p_from date default null,p_to date default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_c public.couriers; v_items jsonb;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode='42501'; end if;
  select * into v_c from public.couriers where user_id=auth.uid() and active;
  if v_c.id is null then raise exception 'courier account not linked' using errcode='42501'; end if;
  select coalesce(jsonb_agg(
    e.value || jsonb_build_object(
      'closing_id',ci.closing_id,'closed_at',cl.closed_at,
      'paid_at',cl.paid_at,'paid_by',cl.paid_by,
      'included_in_closing',ci.id is not null and ci.released_at is null,
      'released_at',ci.released_at
    ) order by (e.value->>'day')::date desc
  ),'[]'::jsonb) into v_items
  from jsonb_array_elements(public.courier_items(p_from,p_to)) e(value)
  left join lateral (
    select z.* from public.courier_closing_items z
     where z.source_type=e.value->>'type' and z.source_id=(e.value->>'id')::bigint
     order by z.created_at desc,z.id desc limit 1
  ) ci on true
  left join public.courier_closings cl on cl.id=ci.closing_id;
  return coalesce(v_items,'[]'::jsonb);
end $$;

create or replace function public.courier_ops_closings(p_from date default null,p_to date default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not (public.is_manager() or public.is_staff()) then raise exception 'staff only' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) order by c.closed_at desc) from public.courier_closings c
    where (p_from is null or c.period_end>=p_from) and (p_to is null or c.period_start<=p_to)
  ),'[]'::jsonb);
end $$;

create or replace function public.courier_ops_mark_paid(p_closing_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.is_manager() then raise exception 'manager only' using errcode='42501'; end if;
  update public.courier_closings set paid_at=coalesce(paid_at,now()),
    paid_by=coalesce(paid_by,auth.jwt()->>'email','manager')
   where id=p_closing_id and reopened_at is null;
  if not found then raise exception 'active closing not found' using errcode='P0002'; end if;
  return jsonb_build_object('ok',true,'closing_id',p_closing_id);
end $$;


-- Push in-app notifications for newly assigned or materially changed trips.
create or replace function public.trg_courier_ops_trip_notice()
returns trigger language plpgsql security definer set search_path=public as $func$
declare v_uid uuid; v_title text; v_body text;
begin
  if tg_op='UPDATE' and new.courier is not distinct from old.courier
     and new.fee is not distinct from old.fee
     and new.trip_day is not distinct from old.trip_day
     and new.transaction_id is not distinct from old.transaction_id
     and new.kind is not distinct from old.kind then return new; end if;
  select c.user_id into v_uid from public.couriers c
   where c.active and c.user_id is not null and public.norm_ar(c.name)=public.norm_ar(new.courier) limit 1;
  if v_uid is not null then
    v_title:=case when tg_op='INSERT' then 'مشوار جديد اتسجل باسمك' else 'تم تعديل أحد مشاويرك' end;
    v_body:='المعاملة '||coalesce(new.transaction_id,'—')||' · '||
      case new.kind when 'pickup' then 'استلام' when 'delivery' then 'تسليم' else new.kind end||
      ' · '||coalesce(new.trip_day::text,'');
    insert into public.notifications(user_id,kind,title,body) values(v_uid,'info',v_title,v_body);
  end if;
  return new;
end $func$;
drop trigger if exists courier_ops_trip_notice on public.courier_trips;
create trigger courier_ops_trip_notice after insert or update of courier,fee,trip_day,transaction_id,kind
on public.courier_trips for each row execute function public.trg_courier_ops_trip_notice();

create or replace function public.trg_courier_ops_fee_notice()
returns trigger language plpgsql security definer set search_path=public as $func$
declare v_uid uuid; v_executor text; v_tx text; v_service text;
begin
  if tg_op='UPDATE' and new.executor is not distinct from old.executor
     and new.exec_total is not distinct from old.exec_total
     and new.exec_unit_cost is not distinct from old.exec_unit_cost
     and new.qty is not distinct from old.qty
     and new.received_at is not distinct from old.received_at
     and new.service is not distinct from old.service then return new; end if;
  if new.deleted_at is not null or public.norm_ar(new.service) not like 'رسوم توصيل%' then return new; end if;
  select c.user_id into v_uid from public.couriers c
   where c.active and c.user_id is not null and public.norm_ar(c.name)=public.norm_ar(new.executor) limit 1;
  if v_uid is not null then
    insert into public.notifications(user_id,kind,title,body)
    values(v_uid, 'info',
      case when tg_op='INSERT' then 'رسوم توصيل جديدة مسجلة باسمك' else 'تم تعديل بند رسوم توصيل باسمك' end,
      'المعاملة '||coalesce(new.transaction_id,'—')||' · '||coalesce(new.received_at::date::text,''));
  end if;
  return new;
end $func$;
drop trigger if exists courier_ops_fee_notice on public.request_lines;
create trigger courier_ops_fee_notice after insert or update of executor,exec_total,exec_unit_cost,qty,received_at,service,deleted_at
on public.request_lines for each row execute function public.trg_courier_ops_fee_notice();

\nrevoke all on function public.courier_ops_items(date,date),
 public.courier_ops_update(bigint,text,smallint,integer,text),
 public.courier_ops_report(bigint,text,text),public.courier_ops_issues(text),
 public.courier_ops_issue_update(bigint,text,text),public.courier_ops_ledger(date,date),
 public.courier_ops_closings(date,date),public.courier_ops_mark_paid(bigint)
 from public,anon;
grant execute on function public.courier_ops_items(date,date),
 public.courier_ops_update(bigint,text,smallint,integer,text),
 public.courier_ops_report(bigint,text,text),public.courier_ops_issues(text),
 public.courier_ops_issue_update(bigint,text,text),public.courier_ops_ledger(date,date),
 public.courier_ops_closings(date,date),public.courier_ops_mark_paid(bigint)
 to authenticated;

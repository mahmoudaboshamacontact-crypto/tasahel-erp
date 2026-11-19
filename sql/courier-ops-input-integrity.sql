-- Courier operations: repair ledger volatility and validate bulk/radar inputs.
-- Idempotent replacements only. Run manually in Supabase SQL Editor after review.
-- No SQL is executed against Supabase by this file.

create or replace function public.courier_ops_ledger(
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $
declare
  v_c public.couriers;
  v_items jsonb;
begin
  if not public.is_courier() then
    raise exception 'courier only' using errcode = '42501';
  end if;

  select *
    into v_c
    from public.couriers
   where user_id = (select auth.uid())
     and active;

  if v_c.id is null then
    raise exception 'courier account not linked' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      e.value || jsonb_build_object(
        'closing_id', ci.closing_id,
        'closed_at', cl.created_at,
        'paid_at', cl.paid_at,
        'paid_by', cl.paid_by,
        'included_in_closing', ci.id is not null and ci.released_at is null,
        'released_at', ci.released_at
      )
      order by (e.value->>'day')::date desc
    ),
    '[]'::jsonb
  )
    into v_items
    from jsonb_array_elements(public.courier_items(p_from, p_to)) e(value)
    left join lateral (
      select z.*
        from public.courier_closing_items z
       where z.source_type = e.value->>'type'
         and z.source_id = (e.value->>'id')::bigint
       order by z.created_at desc, z.id desc
       limit 1
    ) ci on true
    left join public.courier_closings cl on cl.id = ci.closing_id;

  return coalesce(v_items, '[]'::jsonb);
end;
$$;

create or replace function public.courier_ops_reorder(p_trip_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_manager boolean := public.is_manager() or public.is_staff();
  v_requested integer;
  v_found integer;
  v_count integer := 0;
begin
  if not public.is_courier() and not v_manager then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_trip_ids is null or cardinality(p_trip_ids) = 0 then
    raise exception 'trip list cannot be empty' using errcode = '22023';
  end if;

  if array_position(p_trip_ids, null) is not null then
    raise exception 'trip list contains an empty id' using errcode = '22023';
  end if;

  v_requested := cardinality(p_trip_ids);

  if (select count(distinct x.trip_id) from unnest(p_trip_ids) as x(trip_id)) <> v_requested then
    raise exception 'trip list contains duplicate ids' using errcode = '22023';
  end if;

  select count(*)
    into v_found
    from public.courier_trips t
   where t.id = any(p_trip_ids);

  if v_found <> v_requested then
    raise exception 'one or more trips do not exist' using errcode = 'P0002';
  end if;

  if public.is_courier() then
    select *
      into v_c
      from public.couriers
     where user_id = (select auth.uid())
       and active;

    if v_c.id is null then
      raise exception 'courier account not linked' using errcode = '42501';
    end if;

    if exists (
      select 1
        from public.courier_trips t
       where t.id = any(p_trip_ids)
         and public.norm_ar(t.courier) is distinct from public.norm_ar(v_c.name)
    ) then
      raise exception 'not your trip' using errcode = '42501';
    end if;
  end if;

  with ord as (
    select x.trip_id, x.ord::integer as route_order
      from unnest(p_trip_ids) with ordinality as x(trip_id, ord)
  ),
  up as (
    insert into public.courier_trip_ops (
      trip_id, route_order, updated_at, updated_by
    )
    select o.trip_id, o.route_order, now(), (select auth.uid())
      from ord o
    on conflict (trip_id) do update
      set route_order = excluded.route_order,
          updated_at = now(),
          updated_by = (select auth.uid())
    where public.courier_trip_ops.route_order is distinct from excluded.route_order
    returning trip_id
  )
  select count(*) into v_count from up;

  return jsonb_build_object('ok', true, 'updated', v_count);
end;
$$;

create or replace function public.courier_v12_mark_ready(
  p_tx text,
  p_flag text,
  p_val boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx text := btrim(coalesce(p_tx, ''));
begin
  if not (public.is_staff() or public.is_manager()) then
    raise exception 'staff only' using errcode = '42501';
  end if;

  if v_tx = '' or char_length(v_tx) > 40 then
    raise exception 'invalid transaction id' using errcode = '22023';
  end if;

  if p_flag not in ('ready_flag', 'client_confirmed') then
    raise exception 'invalid readiness flag' using errcode = '22023';
  end if;

  if not exists (select 1 from public.courier_trips t where t.transaction_id = v_tx)
     and not exists (select 1 from public.request_lines l where l.transaction_id = v_tx and l.deleted_at is null) then
    raise exception 'transaction not found' using errcode = 'P0002';
  end if;

  insert into public.courier_dispatch_events(
    transaction_id, event_type, payload, status, created_by
  )
  values (
    v_tx,
    p_flag,
    jsonb_build_object('val', coalesce(p_val, true)),
    'ack',
    (select auth.uid())
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.courier_ops_ledger(date, date) from public, anon;
grant execute on function public.courier_ops_ledger(date, date) to authenticated;

revoke all on function public.courier_ops_reorder(bigint[]) from public, anon;
grant execute on function public.courier_ops_reorder(bigint[]) to authenticated;

revoke all on function public.courier_v12_mark_ready(text, text, boolean) from public, anon;
grant execute on function public.courier_v12_mark_ready(text, text, boolean) to authenticated;

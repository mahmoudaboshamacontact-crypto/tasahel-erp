-- أزمنة المراحل لكل مندوب (للمدير فقط). قراءة فقط، من pickup_ticket_action_history.
-- المراحل: التذكرة اتفتحت → قبول → محاولة اتصال → في الطريق → وصل/انتظار → استلام الأوراق.
-- لم يُنفَّذ بعد — ينتظر موافقة محمود.
create or replace function public.courier_stage_timings(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 180));
  v_res jsonb;
begin
  if not public.is_manager() then raise exception 'manager only' using errcode = '42501'; end if;

  with ev as (
    select h.ticket_id, h.courier_id, h.step, h.created_at,
           lag(h.created_at) over (partition by h.ticket_id order by h.created_at) as prev_at,
           lag(h.step)       over (partition by h.ticket_id order by h.created_at) as prev_step,
           t.created_at as ticket_at, t.client_name
    from public.pickup_ticket_action_history h
    join public.pickup_tickets t on t.id = h.ticket_id
    where h.created_at >= now() - make_interval(days => v_days)
  ),
  gaps as (
    select ticket_id, courier_id, client_name, step,
           case when prev_at is null then 'to_accept' else step end as stage,
           extract(epoch from (created_at - coalesce(prev_at, ticket_at))) / 60.0 as mins
    from ev
    where (prev_at is not null or step = 'accepted')
  ),
  clean as (select * from gaps where mins >= 0),
  stage_agg as (
    select courier_id, stage, count(*) as n, avg(mins) as avg_m,
           percentile_cont(0.5) within group (order by mins) as med_m, max(mins) as max_m
    from clean group by courier_id, stage
  ),
  tick as (select courier_id, count(distinct ticket_id) as tickets from clean group by courier_id),
  per_courier as (
    select a.courier_id, cr.name, t.tickets,
           jsonb_object_agg(a.stage, jsonb_build_object('n', a.n, 'avg_min', round(a.avg_m::numeric, 1),
             'median_min', round(a.med_m::numeric, 1), 'max_min', round(a.max_m::numeric, 1))) as stages
    from stage_agg a
    join tick t on t.courier_id = a.courier_id
    join public.couriers cr on cr.id = a.courier_id
    group by a.courier_id, cr.name, t.tickets
  )
  select jsonb_build_object(
    'days', v_days,
    'couriers', coalesce((select jsonb_agg(jsonb_build_object('courier_id', courier_id, 'name', name, 'tickets', tickets, 'stages', stages) order by name) from per_courier), '[]'::jsonb),
    'slowest', coalesce((
      select jsonb_agg(jsonb_build_object('ticket_id', s.ticket_id, 'client_name', s.client_name, 'courier', cr.name, 'stage', s.stage, 'minutes', round(s.mins::numeric, 0)))
      from (select * from clean order by mins desc limit 5) s
      join public.couriers cr on cr.id = s.courier_id
    ), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;
revoke all on function public.courier_stage_timings(integer) from public, anon;
grant execute on function public.courier_stage_timings(integer) to authenticated;

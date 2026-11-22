-- ============================================================
-- إصلاح رادار المناديب: إظهار التيكتات المحوّلة وطلبات التأجيل
-- Idempotent: استبدال تعريف RPC فقط، دون تغيير الجداول أو السياسات.
-- ترتيب التشغيل: شغّل pickup-ticket-action-history.sql أولاً.
-- التشغيل يدويًا بعد مراجعة Claude.
-- ============================================================

create or replace function public.courier_radar_active_tickets()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_manager() or public.is_staff())
     or public.is_courier() then
    raise exception 'الرادار متاح للموظفين والمدير فقط'
      using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'ticket_id', t.id,
        'courier_id', c.id,
        'courier_name', c.name,
        'client_name', t.client_name,
        'sd_request_id', t.sd_request_id,
        'transaction_id', coalesce(t.converted_tx_id, t.sd_request_id),
        'status', t.status,
        'courier_step', t.courier_step,
        'radar_status',
          case
            when t.status = 'cancelled' then 'cancelled'
            when rr.status = 'pending'
              and rr.created_at >= coalesce(t.courier_step_at, t.created_at)
              then 'reschedule_pending'
            when rr.status = 'approved'
              and rr.created_at >= coalesce(t.courier_step_at, t.created_at)
              then 'postponed'
            when e.event_type = 'reschedule_req'
              and e.status = 'pending'
              and e.created_at > coalesce(t.courier_step_at, t.created_at)
              then 'reschedule_pending'
            when e.event_type = 'reschedule_req'
              and e.status = 'approved'
              and e.created_at > coalesce(t.courier_step_at, t.created_at)
              then 'postponed'
            when e.event_type = 'waiting'
              and e.created_at > coalesce(t.courier_step_at, t.created_at)
              then 'waiting'
            when e.event_type = 'on_the_way'
              and e.created_at > coalesce(t.courier_step_at, t.created_at)
              then 'on_the_way'
            when t.status = 'converted' and exists (
              select 1 from public.courier_trips mt
              where mt.id = t.mission_id and mt.courier_confirmed_at is not null
            ) then 'trip_confirmed'
            when t.status = 'converted' and t.courier_step is null
              then 'converted'
            else coalesce(t.courier_step, 'new')
          end,
        'event_type', e.event_type,
        'event_status', e.status,
        'reschedule_status', rr.status,
        'proposed_slot', rr.proposed_slot,
        'reschedule_reason', rr.reason,
        'reschedule_note', rr.decision_note,
        'reschedule_created_at', rr.created_at,
        'action_history', coalesce((
          select jsonb_agg(jsonb_build_object(
            'step', a.action,
            'outcome', a.outcome,
            'transaction_id', t.converted_tx_id,
            'created_at', a.created_at
          ) order by a.created_at)
          from (
            select h.step as action, null::text as outcome, h.created_at
            from public.pickup_ticket_action_history h
            where h.ticket_id = t.id
            union all
            select 'contact_' || cl.channel as action, cl.outcome, cl.created_at
            from public.courier_contact_log cl
            where cl.ticket_id = t.id
          ) a
        ), '[]'::jsonb),
        'status_at',
          case
            when t.status = 'cancelled'
              then coalesce(t.cancelled_at, t.created_at)
            when rr.created_at >= coalesce(t.courier_step_at, t.created_at)
              then rr.created_at
            when e.created_at > coalesce(t.courier_step_at, t.created_at)
              then e.created_at
            else coalesce(t.courier_step_at, t.converted_at, t.created_at)
          end,
        'courier_step_at', t.courier_step_at,
        'converted_at', t.converted_at,
        'created_at', t.created_at
      )
      order by
        case
          when t.status = 'cancelled' then coalesce(t.cancelled_at, t.created_at)
          when rr.created_at >= coalesce(t.courier_step_at, t.created_at)
            then rr.created_at
          when e.created_at > coalesce(t.courier_step_at, t.created_at)
            then e.created_at
          else coalesce(t.courier_step_at, t.converted_at, t.created_at)
        end desc
    )
    from public.pickup_tickets t
    join public.couriers c on c.id = t.courier_id
    left join lateral (
      select de.event_type, de.status, de.created_at
      from public.courier_dispatch_events de
      where de.courier_id = t.courier_id
        and upper(coalesce(de.transaction_id, '')) =
            upper(coalesce(t.converted_tx_id, t.sd_request_id, ''))
        and de.event_type in ('on_the_way', 'waiting', 'reschedule_req')
      order by de.created_at desc
      limit 1
    ) e on true
    left join lateral (
      select r.status, r.proposed_slot, r.reason, r.decision_note, r.created_at
      from public.pickup_ticket_reschedule_requests r
      where r.ticket_id = t.id
      order by r.created_at desc
      limit 1
    ) rr on true
    where c.active = true
      and (
        t.status = 'with_courier'
        or (
          t.status = 'cancelled'
          and t.cancelled_at >= now() - interval '7 days'
        )
        or (
          t.status = 'converted'
          and coalesce(t.converted_at, t.created_at) >= now() - interval '7 days'
        )
        or coalesce(t.papers_holder, 'office') = 'courier'
        or t.papers_pending_event_id is not null
      )
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.courier_radar_active_tickets() from public, anon;
grant execute on function public.courier_radar_active_tickets() to authenticated;

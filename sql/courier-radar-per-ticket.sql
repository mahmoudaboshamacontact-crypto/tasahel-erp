-- =====================================================================
-- courier-radar-per-ticket.sql
-- مقترح إضافي للرادار: عرض كل تيكتات الاستلام النشطة لكل مندوب.
-- يُشغّل يدوياً بعد courier-phase3.sql و courier-tickets-phase4.sql
-- و courier-tickets-phase5.sql و courier-v12-modern.sql.
-- لم يتم تنفيذ هذا الملف على Supabase.
-- لا يغيّر أي جدول أو سياسة RLS أو دالة قائمة.
-- =====================================================================

create or replace function public.courier_radar_active_tickets()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_manager() or public.is_staff()) then
    raise exception 'الرادار متاح للموظفين والمدير فقط' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
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
            when e.event_type = 'reschedule_req'
              and e.status = 'approved'
              and e.created_at > coalesce(t.courier_step_at, t.created_at) then 'postponed'
            when e.event_type = 'reschedule_req'
              and e.status = 'pending'
              and e.created_at > coalesce(t.courier_step_at, t.created_at) then 'reschedule_pending'
            when e.event_type = 'waiting'
              and e.created_at > coalesce(t.courier_step_at, t.created_at) then 'waiting'
            when e.event_type = 'on_the_way'
              and e.created_at > coalesce(t.courier_step_at, t.created_at) then 'on_the_way'
            else coalesce(t.courier_step, 'new')
          end,
        'event_type', e.event_type,
        'event_status', e.status,
        'status_at',
          case
            when t.status = 'cancelled' then coalesce(t.cancelled_at, t.created_at)
            when e.created_at > coalesce(t.courier_step_at, t.created_at) then e.created_at
            else coalesce(t.courier_step_at, t.created_at)
          end,
        'courier_step_at', t.courier_step_at,
        'created_at', t.created_at
      )
      order by
        case
          when t.status = 'cancelled' then coalesce(t.cancelled_at, t.created_at)
          when e.created_at > coalesce(t.courier_step_at, t.created_at) then e.created_at
          else coalesce(t.courier_step_at, t.created_at)
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
    where c.active = true
      and (
        t.status = 'with_courier'
        or (
          t.status = 'cancelled'
          and t.cancelled_at >= now() - interval '7 days'
        )
      )
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.courier_radar_active_tickets() from public, anon;
grant execute on function public.courier_radar_active_tickets() to authenticated;

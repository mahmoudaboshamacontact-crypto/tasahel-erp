-- دالة ملخص التشغيل والمالية للمساعد الذكي (للمدير فقط — أرقام مجمّعة بدون أي بيانات عملاء)
create or replace function public.ai_ops_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_month_start date := date_trunc('month', (now() at time zone 'Africa/Cairo'))::date;
  v_refunds jsonb;
  v_tickets jsonb;
  v_trips jsonb;
  v_tasks jsonb;
  v_cash jsonb;
  v_partner jsonb;
begin
  if not public.is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'pending_count', count(*) filter (where status = 'pending'),
    'approved_open_count', count(*) filter (where status = 'approved' and closed_at is null),
    'closed_month_count', count(*) filter (where status = 'approved' and closed_at is not null and coalesce(decided_at, requested_at) >= v_month_start),
    'approved_month_amount', coalesce(round(sum(sales_amount) filter (where status = 'approved' and coalesce(decided_at, requested_at) >= v_month_start)), 0),
    'open_amount', coalesce(round(sum(sales_amount) filter (where status = 'approved' and closed_at is null)), 0)
  ) into v_refunds from public.line_refunds;

  select jsonb_build_object(
    'open_tickets', count(*) filter (where status in ('new', 'in_progress', 'assigned', 'rescheduled')),
    'unassigned_tickets', count(*) filter (where status in ('new', 'rescheduled') and courier_id is null),
    'cancelled_tickets', count(*) filter (where status = 'cancelled'),
    'converted_today', count(*) filter (where converted_at is not null and (converted_at at time zone 'Africa/Cairo')::date = v_today),
    'papers_pending_handover', count(*) filter (where papers_pending_event_id is not null)
  ) into v_tickets from public.pickup_tickets;

  select jsonb_build_object(
    'trips_today', count(*) filter (where trip_day = v_today),
    'unconfirmed_last_7d', count(*) filter (where courier_confirmed_at is null and trip_day >= v_today - 7)
  ) into v_trips from public.courier_trips;

  select jsonb_build_object(
    'open_tasks', count(*) filter (where deleted_at is null and status <> 'done'),
    'late_tasks', count(*) filter (where deleted_at is null and status <> 'done' and due_at is not null and (due_at at time zone 'Africa/Cairo')::date < v_today)
  ) into v_tasks from public.tasks;

  select coalesce((
    select jsonb_build_object(
      'last_day', day,
      'expected', coalesce(expected, 0),
      'counted', coalesce(counted, 0),
      'diff', coalesce(counted, 0) - coalesce(expected, 0)
    )
    from public.cash_closings
    order by day desc, created_at desc limit 1
  ), '{}'::jsonb) into v_cash;

  select jsonb_build_object(
    'unsettled_count', count(*) filter (where coalesce(settled, false) = false),
    'unsettled_amount', coalesce(round(sum(total) filter (where coalesce(settled, false) = false)), 0)
  ) into v_partner from public.partner_ops;

  return jsonb_build_object(
    'cairo_today', v_today,
    'refunds', coalesce(v_refunds, '{}'::jsonb),
    'tickets', coalesce(v_tickets, '{}'::jsonb),
    'courier_trips', coalesce(v_trips, '{}'::jsonb),
    'tasks', coalesce(v_tasks, '{}'::jsonb),
    'last_cash_closing', v_cash,
    'partner_unsettled', coalesce(v_partner, '{}'::jsonb)
  );
end $$;

revoke all on function public.ai_ops_snapshot() from public, anon;
grant execute on function public.ai_ops_snapshot() to authenticated;

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
    'closed_month_count', count(*) filter (where status = 'approved' and closed_at is not null and created_at >= v_month_start),
    'approved_month_amount', coalesce(round(sum(sales_amount) filter (where status = 'approved' and created_at >= v_month_start)), 0),
    'open_amount', coalesce(round(sum(sales_amount) filter (where status = 'approved' and closed_at is null)), 0)
  ) into v_refunds from public.line_refunds;

  select jsonb_build_object(
    'open_tickets', count(*) filter (where status in ('new', 'in_progress', 'assigned', 'rescheduled')),
    'unassigned_tickets', count(*) filter (where status in ('new', 'rescheduled') and assigned_courier_id is null),
    'cancelled_unack', count(*) filter (where status = 'cancelled' and manager_ack_at is null),
    'converted_today', count(*) filter (where converted_at is not null and (converted_at at time zone 'Africa/Cairo')::date = v_today),
    'papers_pending_handover', count(*) filter (where papers_pending_event_id is not null)
  ) into v_tickets from public.pickup_tickets;

  select jsonb_build_object(
    'trips_today', count(*) filter (where trip_date = v_today),
    'unconfirmed_last_7d', count(*) filter (where confirmed_at is null and trip_date >= v_today - 7)
  ) into v_trips from public.courier_trips;

  select jsonb_build_object(
    'open_tasks', count(*) filter (where status <> 'done'),
    'late_tasks', count(*) filter (where status <> 'done' and due_date is not null and due_date < v_today)
  ) into v_tasks from public.tasks;

  select coalesce((
    select jsonb_build_object('last_day', closing_date, 'diff', diff_amount)
    from public.cash_closings
    order by closing_date desc limit 1
  ), '{}'::jsonb) into v_cash;

  select jsonb_build_object(
    'unsettled_count', count(*) filter (where settled_at is null),
    'unsettled_amount', coalesce(round(sum(amount) filter (where settled_at is null)), 0)
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

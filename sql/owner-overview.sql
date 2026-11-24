-- عدادات المالك: نظرة شاملة على الشغل والمناديب والاستردادات والفريق (قراءة فقط، للمدير بس)
-- إضافة جديدة: دالة واحدة، مفيش تعديل في أي جدول.
create or replace function public.owner_overview()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_mstart date := date_trunc('month', now() at time zone 'Africa/Cairo')::date;
  r jsonb;
begin
  if not public.is_manager() then raise exception 'not allowed' using errcode = '42501'; end if;

  select jsonb_build_object(
    'work', jsonb_build_object(
      'lines_today',   (select count(*) from request_lines where deleted_at is null and received_at::date = v_today),
      'orders_today',  (select count(distinct transaction_id) from request_lines where deleted_at is null and received_at::date = v_today),
      'lines_month',   (select count(*) from request_lines where deleted_at is null and received_at::date >= v_mstart),
      'orders_month',  (select count(distinct transaction_id) from request_lines where deleted_at is null and received_at::date >= v_mstart),
      'sales_month',   (select coalesce(sum(total), 0) from request_lines where deleted_at is null and received_at::date >= v_mstart),
      'refunded_month',(select coalesce(sum(sales_amount), 0) from line_refunds where status = 'approved' and coalesce(decided_at, requested_at)::date >= v_mstart),
      'by_status',     coalesce((select jsonb_object_agg(status, n) from (
                          select coalesce(status, '—') status, count(*) n from request_lines
                           where deleted_at is null and received_at::date >= v_today - 90 group by 1) s), '{}'::jsonb),
      'stale_open',    (select count(*) from request_lines where deleted_at is null and status in ('In Progress', 'Under Review') and received_at::date < v_today - 14),
      'daily_7',       coalesce((select jsonb_agg(jsonb_build_object('d', d::text, 'n', n) order by d) from (
                          select g::date d, (select count(*) from request_lines l where l.deleted_at is null and l.received_at::date = g::date) n
                            from generate_series(v_today - 6, v_today, interval '1 day') g) x), '[]'::jsonb),
      'top_staff_month', coalesce((select jsonb_agg(jsonb_build_object('name', employee, 'n', n) order by n desc) from (
                          select employee, count(*) n from request_lines
                           where deleted_at is null and received_at::date >= v_mstart and coalesce(employee, '') <> ''
                           group by employee order by n desc limit 5) t), '[]'::jsonb)
    ),
    'couriers', jsonb_build_object(
      'active',          (select count(*) from couriers where active),
      'trips_today',     (select count(*) from courier_trips where trip_day = v_today),
      'unconfirmed',     (select count(*) from courier_trips where courier_confirmed_at is null and trip_day between v_today - 7 and v_today),
      'tickets_open',    (select count(*) from pickup_tickets where status = 'with_courier'),
      'tickets_unassigned', (select count(*) from pickup_tickets where status = 'open' and courier_id is null),
      'tickets_cancelled_unack', (select count(*) from pickup_tickets where status = 'cancelled' and courier_id is not null and courier_ack_at is null),
      'tickets_converted_today', (select count(*) from pickup_tickets where status = 'converted' and (converted_at at time zone 'Africa/Cairo')::date = v_today),
      'dispatch_pending',(select count(*) from courier_dispatch_events where status = 'pending')
    ),
    'refunds', jsonb_build_object(
      'approved_open',   (select count(*) from line_refunds where status = 'approved' and closed_at is null),
      'closed',          (select count(*) from line_refunds where closed_at is not null),
      'pending',         (select count(*) from line_refunds where status not in ('approved', 'rejected')),
      'open_amount',     (select coalesce(sum(sales_amount), 0) from line_refunds where status = 'approved' and closed_at is null)
    ),
    'team', jsonb_build_object(
      'tasks_open',      (select count(*) from tasks where deleted_at is null and done_at is null),
      'tasks_late',      (select count(*) from tasks where deleted_at is null and done_at is null and due_at is not null and due_at < now()),
      'notif_unread',    (select count(*) from notifications where not coalesce(read, false)),
      'notif_total',     (select count(*) from notifications),
      'active_24h',      (select count(distinct user_name) from audit_log where at >= now() - interval '24 hours'),
      'actions_24h',     (select count(*) from audit_log where at >= now() - interval '24 hours'),
      'last_cash_day',   (select day::text from cash_closings order by day desc limit 1),
      'last_cash_diff',  (select counted - expected from cash_closings order by day desc limit 1),
      'partner_unsettled', (select count(*) from partner_ops where not coalesce(settled, false)),
      'partner_unsettled_total', (select coalesce(sum(total), 0) from partner_ops where not coalesce(settled, false))
    )
  ) into r;
  return r;
end $$;

revoke all on function public.owner_overview() from public, anon;
grant execute on function public.owner_overview() to authenticated;

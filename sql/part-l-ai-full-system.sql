-- تغطية شاملة للنظام للمساعد الذكي (للمدير فقط — بدون أي بيانات عملاء: لا أسماء ولا تليفونات ولا عناوين)

-- 1) الموارد البشرية والحضور والإجازات والخصومات
create or replace function public.ai_hr_snapshot(p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Cairo')::date);
  v_ym text := to_char(v_day, 'YYYY-MM');
  v_checked_in jsonb;
  v_not_checked_in jsonb;
  v_leaves_today jsonb;
  v_pending_leaves jsonb;
  v_adjustments jsonb;
begin
  if not public.is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', coalesce(nullif(btrim(p.full_name), ''), 'موظف'),
    'job_title', p.job_title,
    'check_in', to_char(a.check_in at time zone 'Africa/Cairo', 'HH12:MI AM'),
    'check_out', case when a.check_out is not null then to_char(a.check_out at time zone 'Africa/Cairo', 'HH12:MI AM') else null end,
    'work_start', hs.work_start
  ) order by a.check_in asc), '[]'::jsonb)
  into v_checked_in
  from public.hr_attendance a
  left join public.profiles p on p.id = a.user_id
  left join public.hr_staff hs on hs.user_id = a.user_id
  where a.day = v_day;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', coalesce(nullif(btrim(p.full_name), ''), 'موظف'),
    'job_title', p.job_title,
    'role', coalesce(ur.role, 'staff'),
    'on_approved_leave', exists(
      select 1 from public.hr_leaves lv
      where lv.user_id = p.id and lv.status = 'approved' and v_day between lv.from_day and lv.to_day
    ),
    'last_seen_at', p.last_seen_at
  ) order by p.full_name), '[]'::jsonb)
  into v_not_checked_in
  from public.profiles p
  left join public.user_roles ur on ur.user_id = p.id
  where coalesce(ur.role, 'staff') not in ('courier', 'partner')
    and not exists (
      select 1 from public.hr_attendance a
      where a.user_id = p.id and a.day = v_day and a.check_in is not null
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', coalesce(nullif(btrim(p.full_name), ''), 'موظف'),
    'kind', lv.kind,
    'from_day', lv.from_day,
    'to_day', lv.to_day
  )), '[]'::jsonb)
  into v_leaves_today
  from public.hr_leaves lv
  left join public.profiles p on p.id = lv.user_id
  where lv.status = 'approved' and v_day between lv.from_day and lv.to_day;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', coalesce(nullif(btrim(p.full_name), ''), 'موظف'),
    'kind', lv.kind,
    'from_day', lv.from_day,
    'to_day', lv.to_day,
    'reason', left(coalesce(lv.reason, ''), 80)
  ) order by lv.created_at desc), '[]'::jsonb)
  into v_pending_leaves
  from public.hr_leaves lv
  left join public.profiles p on p.id = lv.user_id
  where lv.status = 'pending';

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  into v_adjustments
  from (
    select kind, count(*) as count, coalesce(round(sum(amount)), 0) as total_amount
    from public.hr_adjustments
    where month = v_ym
    group by kind
  ) x;

  return jsonb_build_object(
    'day', v_day,
    'checked_in_count', jsonb_array_length(v_checked_in),
    'checked_in', v_checked_in,
    'not_checked_in_count', jsonb_array_length(v_not_checked_in),
    'not_checked_in', v_not_checked_in,
    'on_leave_today', v_leaves_today,
    'pending_leaves', v_pending_leaves,
    'month_adjustments', v_adjustments
  );
end $$;

-- 2) المناديب والرادار والتيكتات وتقفيلات الكاش
create or replace function public.ai_couriers_snapshot(p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Cairo')::date);
  v_couriers jsonb;
  v_handshakes jsonb;
  v_dispatch jsonb;
  v_unpaid_closings jsonb;
begin
  if not public.is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', c.name,
    'active', c.active,
    'trips_today', (select count(*) from public.courier_trips t where t.courier = c.name and t.trip_day = v_day),
    'fees_today', coalesce((select round(sum(t.fee)) from public.courier_trips t where t.courier = c.name and t.trip_day = v_day), 0),
    'unconfirmed_7d', (select count(*) from public.courier_trips t where t.courier = c.name and t.courier_confirmed_at is null and t.trip_day >= v_day - 7),
    'open_tickets', (select count(*) from public.pickup_tickets pt where pt.courier_id = c.id and pt.status in ('new', 'in_progress', 'assigned', 'rescheduled'))
  ) order by c.sort_order, c.name), '[]'::jsonb)
  into v_couriers
  from public.couriers c
  where coalesce(c.active, true) = true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'day', h.close_day,
    'courier', h.courier_name,
    'expected_cash', h.expected_cash,
    'handed_cash', h.handed_cash,
    'diff_cash', h.diff_cash,
    'status', h.status
  ) order by h.close_day desc), '[]'::jsonb)
  into v_handshakes
  from (
    select * from public.courier_cash_handshakes
    where coalesce(status, '') <> 'confirmed'
    order by close_day desc limit 15
  ) h;

  select coalesce(jsonb_agg(jsonb_build_object(
    'courier', d.courier_name,
    'event_type', d.event_type,
    'created_at', d.created_at
  ) order by d.created_at desc), '[]'::jsonb)
  into v_dispatch
  from (
    select * from public.courier_dispatch_events
    where status = 'pending'
    order by created_at desc limit 15
  ) d;

  select coalesce(jsonb_agg(jsonb_build_object(
    'courier', cc.courier,
    'period_start', cc.period_start,
    'period_end', cc.period_end,
    'trips_count', cc.trips_count,
    'total', cc.total
  ) order by cc.created_at desc), '[]'::jsonb)
  into v_unpaid_closings
  from (
    select * from public.courier_closings
    where paid_at is null and reopened_at is null
    order by created_at desc limit 15
  ) cc;

  return jsonb_build_object(
    'day', v_day,
    'couriers', v_couriers,
    'pending_cash_handshakes', v_handshakes,
    'pending_dispatch_decisions', v_dispatch,
    'unpaid_courier_closings', v_unpaid_closings
  );
end $$;

-- 3) المالية والأهداف والخصومات والمنفذين والمحافظ وصحة النظام
create or replace function public.ai_finance_snapshot(p_month text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ym text := coalesce(nullif(btrim(p_month), ''), to_char((now() at time zone 'Africa/Cairo')::date, 'YYYY-MM'));
  v_mstart date := to_date(v_ym || '-01', 'YYYY-MM-DD');
  v_mend date := (v_mstart + interval '1 month')::date;
  v_targets jsonb;
  v_discounts jsonb;
  v_exec_pay jsonb;
  v_wallets jsonb;
  v_errors jsonb;
  v_services_count int;
begin
  if not public.is_manager() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', coalesce(nullif(btrim(p.full_name), ''), 'موظف'),
    'sales_target', et.target,
    'services_target', et.services_target
  ) order by et.target desc nulls last), '[]'::jsonb)
  into v_targets
  from public.emp_targets et
  left join public.profiles p on p.id = et.user_id
  where et.month = v_ym;

  select jsonb_build_object(
    'pending_count', count(*) filter (where status = 'pending'),
    'approved_month_count', count(*) filter (where status = 'approved' and created_at >= v_mstart and created_at < v_mend),
    'rejected_month_count', count(*) filter (where status = 'rejected' and created_at >= v_mstart and created_at < v_mend)
  ) into v_discounts from public.discount_approvals;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  into v_exec_pay
  from (
    select coalesce(nullif(btrim(executor_name), ''), 'غير محدد') as executor,
           count(*) as payments_count,
           coalesce(round(sum(amount)), 0) as total_paid
    from public.executor_payments
    where pay_date >= v_mstart and pay_date < v_mend
    group by 1 order by 3 desc limit 20
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', w.rec_date,
    'method', w.method,
    'system_amount', w.system_amount,
    'actual_amount', w.actual_amount,
    'diff_amount', w.diff_amount
  ) order by w.rec_date desc), '[]'::jsonb)
  into v_wallets
  from (
    select * from public.wallet_reconciliations
    order by rec_date desc limit 10
  ) w;

  select jsonb_build_object(
    'errors_24h', count(*) filter (where created_at >= now() - interval '24 hours'),
    'errors_7d', count(*) filter (where created_at >= now() - interval '7 days')
  ) into v_errors from public.error_log;

  select count(*) into v_services_count from public.services;

  return jsonb_build_object(
    'month', v_ym,
    'targets', v_targets,
    'discounts', coalesce(v_discounts, '{}'::jsonb),
    'executor_payments_month', v_exec_pay,
    'recent_wallet_reconciliations', v_wallets,
    'system_errors', coalesce(v_errors, '{}'::jsonb),
    'services_catalog_count', v_services_count
  );
end $$;

revoke all on function public.ai_hr_snapshot(date) from public, anon;
revoke all on function public.ai_couriers_snapshot(date) from public, anon;
revoke all on function public.ai_finance_snapshot(text) from public, anon;
grant execute on function public.ai_hr_snapshot(date) to authenticated;
grant execute on function public.ai_couriers_snapshot(date) to authenticated;
grant execute on function public.ai_finance_snapshot(text) to authenticated;

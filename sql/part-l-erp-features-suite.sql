-- =====================================================================
-- الجزء ل: حزمة الفيتشرات المتقدمة لتساهيل ERP
-- sql/part-l-erp-features-suite.sql
-- يشمل:
-- 1. محرك مسارات العمل الذكي (Intelligent Workflow Engine)
-- 2. ملف العميل الشامل (Customer 360 Profile)
-- 3. مركز التحليلات والذكاء الإداري (Executive Intelligence Center)
-- 4. التحليلات التنبؤية (Predictive Analytics)
-- =====================================================================

-- =====================================================================
-- 1. محرك مسارات العمل (Intelligent Workflow Engine)
-- =====================================================================

create table if not exists public.service_workflow_stages (
  id bigserial primary key,
  service_name text not null,
  stage_name text not null,
  stage_order integer not null default 1,
  sla_hours integer not null default 24, -- مدة المرحلة بالساعات قبل إطلاق تنبيه التأخير
  allowed_roles text[] not null default array['manager', 'staff'],
  next_stages text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

create index if not exists service_workflow_stages_svc_idx 
  on public.service_workflow_stages (service_name);

create table if not exists public.request_line_stage_history (
  id bigserial primary key,
  line_id bigint not null references public.request_lines(id) on delete cascade,
  stage_from text,
  stage_to text not null,
  changed_by text not null,
  changed_at timestamptz not null default now(),
  notes text
);

create index if not exists line_stage_history_line_idx 
  on public.request_line_stage_history (line_id);

alter table public.service_workflow_stages enable row level security;
alter table public.request_line_stage_history enable row level security;

drop policy if exists sws_select_auth on public.service_workflow_stages;
create policy sws_select_auth on public.service_workflow_stages
  for select using (auth.role() = 'authenticated');

drop policy if exists sws_modify_mgr on public.service_workflow_stages;
create policy sws_modify_mgr on public.service_workflow_stages
  for all using ((select public.is_manager()))
  with check ((select public.is_manager()));

drop policy if exists rlsh_select_auth on public.request_line_stage_history;
create policy rlsh_select_auth on public.request_line_stage_history
  for select using (auth.role() = 'authenticated');

drop policy if exists rlsh_ins_auth on public.request_line_stage_history;
create policy rlsh_ins_auth on public.request_line_stage_history
  for insert with check (auth.role() = 'authenticated');

-- =====================================================================
-- 2. ملف العميل الشامل (Customer 360 Profile)
-- =====================================================================

create table if not exists public.client_360_notes (
  id bigserial primary key,
  phone text not null,
  note_type text not null default 'general', -- 'general', 'complaint', 'vip', 'warning'
  title text,
  body text not null,
  is_resolved boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists client_360_notes_phone_idx 
  on public.client_360_notes (phone);

alter table public.client_360_notes enable row level security;

drop policy if exists c360_select_auth on public.client_360_notes;
create policy c360_select_auth on public.client_360_notes
  for select using (auth.role() = 'authenticated');

drop policy if exists c360_ins_auth on public.client_360_notes;
create policy c360_ins_auth on public.client_360_notes
  for insert with check (auth.role() = 'authenticated');

drop policy if exists c360_upd_auth on public.client_360_notes;
create policy c360_upd_auth on public.client_360_notes
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- دالة سريعة لجلب إحصائيات العميل 360 درجة
create or replace function public.get_customer_360_profile(p_phone text)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_res json;
  v_clean_phone text;
begin
  v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');
  if length(v_clean_phone) >= 10 and left(v_clean_phone, 2) = '01' then
    v_clean_phone := right(v_clean_phone, 10);
  end if;

  select json_build_object(
    'phone', p_phone,
    'total_orders', count(distinct transaction_id),
    'total_lines', count(id),
    'total_spent', coalesce(sum(total), 0),
    'first_seen', min(received_at),
    'last_seen', max(received_at),
    'services_used', coalesce(json_agg(distinct service) filter (where service is not null), '[]'::json),
    'active_orders', count(id) filter (where status in ('Under Review', 'In Progress', 'Pending Exec', 'Pending Client')),
    'delivered_orders', count(id) filter (where status in ('Delivered', 'Complete'))
  ) into v_res
  from public.request_lines
  where regexp_replace(coalesce(phone, ''), '\D', '', 'g') like '%' || v_clean_phone || '%'
    and deleted_at is null;

  return v_res;
end $$;

grant execute on function public.get_customer_360_profile(text) to authenticated;

-- =====================================================================
-- 3. مركز التحليلات والذكاء الإداري (Executive Intelligence) للمدير فقط
-- =====================================================================

create or replace function public.get_executive_intelligence_stats(p_days integer default 90)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_cutoff timestamp;
  v_res json;
begin
  -- تحقق أمني صارم: المدير فقط
  if not public.is_manager() then
    raise exception 'manager only';
  end if;

  v_cutoff := now() - (p_days || ' days')::interval;

  with line_stats as (
    select 
      service,
      count(*) as total_requests,
      sum(coalesce(total, 0)) as revenue,
      sum(coalesce(exec_unit_cost, 0) * coalesce(qty, 1)) as exec_cost,
      sum(coalesce(total, 0) - (coalesce(exec_unit_cost, 0) * coalesce(qty, 1))) as net_profit,
      avg(case 
        when delivered_at is not null and received_at is not null 
        then extract(epoch from (delivered_at - received_at)) / 3600.0 
        else null 
      end) as avg_duration_hours
    from public.request_lines
    where received_at >= v_cutoff and deleted_at is null
    group by service
  ),
  overall_stats as (
    select
      coalesce(sum(revenue), 0) as total_revenue,
      coalesce(sum(exec_cost), 0) as total_cost,
      coalesce(sum(net_profit), 0) as total_profit,
      case when sum(revenue) > 0 then (sum(net_profit) / sum(revenue)) * 100.0 else 0 end as profit_margin_pct
    from line_stats
  ),
  executor_stats as (
    select
      coalesce(executor, 'غير محدد') as executor_name,
      count(*) as assigned_count,
      sum(coalesce(total, 0)) as total_handled_value,
      sum(coalesce(exec_unit_cost, 0) * coalesce(qty, 1)) as total_executor_payout
    from public.request_lines
    where received_at >= v_cutoff and deleted_at is null
    group by coalesce(executor, 'غير محدد')
    order by assigned_count desc
    limit 10
  )
  select json_build_object(
    'period_days', p_days,
    'overall', (select row_to_json(o) from overall_stats o),
    'top_profitable_services', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json)
      from (select * from line_stats order by net_profit desc limit 8) t
    ),
    'least_profitable_services', (
      select coalesce(json_agg(row_to_json(l)), '[]'::json)
      from (select * from line_stats where net_profit <= 0 or revenue < 500 order by net_profit asc limit 5) l
    ),
    'top_executors', (
      select coalesce(json_agg(row_to_json(e)), '[]'::json)
      from executor_stats e
    )
  ) into v_res;

  return v_res;
end $$;

revoke all on function public.get_executive_intelligence_stats(integer) from public, anon;
grant execute on function public.get_executive_intelligence_stats(integer) to authenticated;

-- =====================================================================
-- 4. التحليلات التنبؤية (Predictive Analytics) للمدير فقط
-- =====================================================================

create or replace function public.get_predictive_workload_forecast()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_res json;
  v_daily_avg numeric;
  v_late_risk_count integer;
  v_trending_services json;
begin
  -- تحقق أمني صارم: المدير فقط
  if not public.is_manager() then
    raise exception 'manager only';
  end if;

  -- 1. حساب متوسط الطلبات اليومية لآخر 30 يوماً
  select coalesce(count(*) / 30.0, 0) into v_daily_avg
  from public.request_lines
  where received_at >= (now() - interval '30 days') and deleted_at is null;

  -- 2. عدد المعاملات المعرضة لخطر التأخير (مر عليها أكثر من 70% من وقتها المحدد وما زالت قيد التنفيذ)
  select count(*) into v_late_risk_count
  from public.request_lines l
  where l.status in ('In Progress', 'Under Review', 'Pending Exec')
    and l.deleted_at is null
    and l.duration_days is not null
    and now() > (l.received_at + ((l.duration_days * 0.7) || ' days')::interval);

  -- 3. الخدمات التي تشهد تسارعاً في الطلب (Trending Services)
  select coalesce(json_agg(row_to_json(ts)), '[]'::json) into v_trending_services
  from (
    select service, count(*) as count_recent
    from public.request_lines
    where received_at >= (now() - interval '14 days') and deleted_at is null
    group by service
    order by count_recent desc
    limit 6
  ) ts;

  select json_build_object(
    'predicted_weekly_orders', round(v_daily_avg * 7),
    'daily_order_velocity', round(v_daily_avg, 1),
    'high_risk_late_orders', v_late_risk_count,
    'staff_capacity_status', case 
      when v_daily_avg > 50 then 'ضغط مرتفع - يلزم زيادة طاقة المنفذين'
      when v_daily_avg > 25 then 'طاقة تشغيلية معتدلة ومستقرة'
      else 'طاقة كافية ومستقرة'
    end,
    'trending_services', v_trending_services
  ) into v_res;

  return v_res;
end $$;

revoke all on function public.get_predictive_workload_forecast() from public, anon;
grant execute on function public.get_predictive_workload_forecast() to authenticated;

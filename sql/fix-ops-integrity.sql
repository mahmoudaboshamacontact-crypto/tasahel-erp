-- =====================================================================
-- sql/fix-ops-integrity.sql  (سلامة العمليات: موافقات، إنقاذ المشاوير، الموارد البشرية، تحويل التيكت، خصوصية الـ AI)
-- يُشغَّل في Supabase SQL Editor بعد: fix-phase4-security.sql ثم fix-rls-internal-tables.sql  (بيعتمد على is_internal_user)
-- قابل لإعادة التشغيل (Idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) (اتشال من هنا) courier_v12_resolve_event: النسخة المعتمدة في sql/courier-radar-pending-decisions.sql — شغّلها هي بدل تعريف تاني هنا
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 2) الإنقاذ الجماعي للمشاوير: كله أو مفيش (أي تيكت غير مؤهل بيلغي العملية ويتذكر رقمه)
-- ---------------------------------------------------------------------
create or replace function public.radar_fleet_rescue(
  p_ticket_ids bigint[],
  p_to_courier_id bigint
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_ids bigint[];
  v_bad bigint[];
  v_cnt integer := 0;
begin
  if not (public.is_staff() or public.is_manager()) or public.is_courier() then
    raise exception 'staff or manager only' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_ticket_ids, '{}')) as x where x is not null;
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'اختر تيكت واحد على الأقل' using errcode = '22023'; end if;
  if array_length(v_ids, 1) > 200 then raise exception 'عدد التيكتات أكبر من المسموح (200)' using errcode = '22023'; end if;

  select * into v_c from public.couriers where id = p_to_courier_id and active = true and user_id is not null limit 1;
  if v_c.id is null then raise exception 'active courier not found' using errcode = '22023'; end if;

  -- قفل التيكتات المؤهلة، وأي رقم مش موجود/مش مؤهل بيوقف العملية كلها
  with locked as (
    select pt.id from public.pickup_tickets pt
     where pt.id = any(v_ids) and pt.status in ('open', 'with_courier')
     for update
  )
  select coalesce(array_agg(i), '{}') into v_bad
    from unnest(v_ids) as i where i not in (select id from locked);
  if coalesce(array_length(v_bad, 1), 0) > 0 then
    raise exception 'تيكتات غير موجودة أو غير قابلة للنقل (اتحوّلت/اتلغت): %', array_to_string(v_bad, ', ') using errcode = '22023';
  end if;

  perform set_config('app.pt_trusted', '1', true);
  update public.pickup_tickets
     set courier_id = v_c.id, status = 'with_courier', updated_at = now()
   where id = any(v_ids) and status in ('open', 'with_courier');
  get diagnostics v_cnt = row_count;

  if v_cnt <> array_length(v_ids, 1) then
    raise exception 'لم يتم نقل كل التيكتات المحددة — اتلغت العملية' using errcode = '22023';
  end if;
  return jsonb_build_object('moved', v_cnt, 'courier_name', v_c.name);
end;
$$;
revoke all on function public.radar_fleet_rescue(bigint[], bigint) from public, anon;
grant execute on function public.radar_fleet_rescue(bigint[], bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 3) الموارد البشرية: قرار الإجازة على pending فقط + قفل/فتح الشهر في عملية واحدة (المدير فقط)
--    (الأعمدة المستخدمة هي نفسها اللي js/15-hr.js بيكتب فيها)
-- ---------------------------------------------------------------------
create or replace function public.hr_decide_leave(p_id text, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.is_manager() then raise exception 'manager only' using errcode = '42501'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'قرار غير صالح' using errcode = '22023'; end if;
  update public.hr_leaves set status = p_status, decided_by = auth.uid()
   where id::text = p_id and status = 'pending';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'الطلب غير موجود أو تم اتخاذ قرار فيه بالفعل' using errcode = '22023'; end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;
revoke all on function public.hr_decide_leave(text, text) from public, anon;
grant execute on function public.hr_decide_leave(text, text) to authenticated;

create or replace function public.hr_lock_month(p_month text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.is_manager() then raise exception 'manager only' using errcode = '42501'; end if;
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'شهر غير صالح' using errcode = '22023'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'مفيش بيانات كشف لتجميدها' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('hr_month_' || p_month));
  if exists (select 1 from public.hr_month_locks where month::text = p_month) then
    raise exception 'الشهر مقفول بالفعل' using errcode = '22023';
  end if;

  insert into public.hr_payroll_snapshots (month, user_id, data)
  select p_month, x.user_id, x.data
    from jsonb_to_recordset(p_rows) as x(user_id uuid, data jsonb)
   where x.user_id is not null
  on conflict (month, user_id) do update set data = excluded.data;
  get diagnostics v_n = row_count;

  insert into public.hr_month_locks (month, locked_by) values (p_month, auth.uid());
  return jsonb_build_object('ok', true, 'snapshots', v_n);
end $$;
revoke all on function public.hr_lock_month(text, jsonb) from public, anon;
grant execute on function public.hr_lock_month(text, jsonb) to authenticated;

create or replace function public.hr_unlock_month(p_month text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.is_manager() then raise exception 'manager only' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('hr_month_' || p_month));
  delete from public.hr_month_locks where month::text = p_month;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'الشهر مش مقفول' using errcode = '22023'; end if;
  delete from public.hr_payroll_snapshots where month::text = p_month;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.hr_unlock_month(text) from public, anon;
grant execute on function public.hr_unlock_month(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4) تحويل تيكت الاستلام لمعاملة: RPC واحدة (قفل التيكت + توليد رقم معاملة فريد + إدخال البنود + تغيير الحالة)
--    الواجهة بتبعت البنود المحسوبة من كتالوج الخدمات، والسيرفر بياخد أعمدة محددة بس ويولّد الرقم بنفسه.
-- ---------------------------------------------------------------------
create or replace function public.pickup_convert_ticket(p_ticket_id bigint, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_t public.pickup_tickets;
  v_tx text;
  v_n integer;
  v_try integer := 0;
begin
  if not public.is_internal_user() then raise exception 'staff only' using errcode = '42501'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 50 then
    raise exception 'بنود التحويل غير صالحة' using errcode = '22023';
  end if;

  select * into v_t from public.pickup_tickets where id = p_ticket_id for update;
  if v_t.id is null then raise exception 'التيكت غير موجود' using errcode = '22023'; end if;
  if v_t.status = 'converted' then
    raise exception 'التيكت ده اتحوّل لمعاملة بالفعل (%)', coalesce(v_t.converted_tx_id, '-') using errcode = '22023';
  end if;
  if v_t.status not in ('open', 'with_courier') then
    raise exception 'التيكت حالته (%) لا تسمح بالتحويل', v_t.status using errcode = '22023';
  end if;

  -- رقم معاملة فريد يتولّد هنا (مع قفل عشان تحويلين متزامنين ما ياخدوش نفس الرقم)
  perform pg_advisory_xact_lock(hashtext('tx_number_gen'));
  loop
    v_try := v_try + 1;
    v_tx := 'TX-' || to_char(now() at time zone 'Africa/Cairo', 'YYYY') || '-' || (floor(1000 + random() * 9000))::int;
    exit when not exists (select 1 from public.request_lines where transaction_id = v_tx);
    if v_try >= 30 then raise exception 'تعذر توليد رقم معاملة غير مستخدم' using errcode = '22023'; end if;
  end loop;

  insert into public.request_lines (
    client_name, phone, transaction_id, address, employee, payment_method, receiver, received_at, rn_nm,
    service, service_ref, qty, unit_price, list_price, discount_pct, exec_unit_cost, commission_per_unit,
    executor, duration_days, notes
  )
  select x.client_name, x.phone, v_tx, x.address, x.employee, x.payment_method, x.receiver, x.received_at, x.rn_nm,
         x.service, x.service_ref, greatest(1, coalesce(x.qty, 1)), x.unit_price, x.list_price, coalesce(x.discount_pct, 0),
         x.exec_unit_cost, x.commission_per_unit, x.executor, x.duration_days, x.notes
    from jsonb_populate_recordset(null::public.request_lines, p_rows) x
   where btrim(coalesce(x.service, '')) <> '';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'مفيش بنود صالحة للتحويل' using errcode = '22023'; end if;

  perform set_config('app.pt_trusted', '1', true);
  update public.pickup_tickets set status = 'converted', converted_tx_id = v_tx where id = v_t.id;

  return jsonb_build_object('ok', true, 'transaction_id', v_tx, 'lines', v_n);
end;
$$;
revoke all on function public.pickup_convert_ticket(bigint, jsonb) from public, anon;
grant execute on function public.pickup_convert_ticket(bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5) خصوصية الـ AI: التجميع حسب الموظف بيرجع أسماء مجهولة (موظف 1…)، وفلتر اسم الموظف اتقفل
-- ---------------------------------------------------------------------
create or replace function public.ai_report(
  p_group text,
  p_from date default null,
  p_to date default null,
  p_service text default null,
  p_employee text default null,
  p_limit int default 20
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from date := coalesce(p_from, date_trunc('month', (now() at time zone 'Africa/Cairo'))::date);
  v_to   date := coalesce(p_to, (now() at time zone 'Africa/Cairo')::date);
  v_lim  int  := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_rows jsonb;
  v_tot  jsonb;
begin
  if not public.is_manager() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_group not in ('month', 'day', 'service', 'employee', 'payment', 'status') then raise exception 'bad group'; end if;
  if p_employee is not null and btrim(p_employee) <> '' then raise exception 'employee filter disabled: AI receives anonymous aggregates only' using errcode = '22023'; end if;
  if v_to < v_from then raise exception 'bad range'; end if;
  if v_to - v_from > 400 then raise exception 'range too long (max 400 days)'; end if;

  with b as (
    select
      case p_group
        when 'month' then to_char(received_at, 'YYYY-MM')
        when 'day' then to_char(received_at, 'YYYY-MM-DD')
        when 'service' then coalesce(nullif(btrim(service), ''), 'أخرى')
        when 'employee' then coalesce(nullif(btrim(employee), ''), 'غير محدد')
        when 'payment' then coalesce(nullif(btrim(payment_method), ''), 'كاش')
        else coalesce(nullif(btrim(status), ''), 'In Progress')
      end as k,
      coalesce(total, 0) as t, coalesce(exec_total, 0) as e, coalesce(qty, 0) as q, transaction_id,
      coalesce(commission, coalesce(commission_per_unit, 0) * coalesce(qty, 0), 0) as c
    from public.request_lines
    where deleted_at is null
      and received_at >= v_from and received_at < v_to + 1
      and (p_service is null or lower(btrim(service)) = lower(btrim(p_service)))
    ), g as (
    select k, round(sum(t)) as sales, round(sum(e)) as exec_cost, round(sum(t) - sum(e)) as estimated_margin,
           round(sum(c)) as commission, count(*) as service_lines, count(distinct transaction_id) as transactions, round(sum(q)) as qty
    from b group by k
  )
  -- التجميع حسب الموظف بيرجع أسماء مجهولة (موظف 1، موظف 2…) مرتبة بالمبيعات: الـ AI ما يشوفش أسماء موظفين
  select coalesce(jsonb_agg(to_jsonb(x) order by case when p_group in ('month', 'day') then null else x.sales end desc nulls last, x.k), '[]'::jsonb)
  into v_rows
  from (select case when p_group = 'employee' then 'موظف ' || row_number() over (order by sales desc, k) else k end as k,
               sales, exec_cost, estimated_margin, commission, service_lines, transactions, qty
          from g order by case when p_group in ('month', 'day') then null else sales end desc nulls last, k limit v_lim) x;

  select jsonb_build_object('sales', coalesce(round(sum(total)), 0), 'exec_cost', coalesce(round(sum(exec_total)), 0),
                            'service_lines', count(*), 'transactions', count(distinct transaction_id))
  into v_tot
  from public.request_lines
  where deleted_at is null and received_at >= v_from and received_at < v_to + 1
    and (p_service is null or lower(btrim(service)) = lower(btrim(p_service)))
    and (p_employee is null or lower(btrim(employee)) = lower(btrim(p_employee)));

  return jsonb_build_object('group', p_group, 'from', v_from, 'to', v_to, 'limit', v_lim, 'totals', v_tot, 'rows', v_rows);
end $$;

create or replace function public.ai_late_orders(p_group text default 'service', p_limit int default 15)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_lim int := least(greatest(coalesce(p_limit, 15), 1), 50); v_rows jsonb; v_tot jsonb;
begin
  if not public.is_manager() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_group not in ('service', 'employee') then raise exception 'bad group'; end if;

  with l as (
    select case p_group when 'service' then coalesce(nullif(btrim(service), ''), 'أخرى') else coalesce(nullif(btrim(employee), ''), 'غير محدد') end as k,
           ((now() at time zone 'Africa/Cairo')::date - (coalesce(exec_start_date, received_at::date) + duration_days)) as delay
    from public.request_lines
    where deleted_at is null and coalesce(complete, false) = false and coalesce(delivered, false) = false
      and coalesce(status, '') not in ('Delivered', 'Complete') and duration_days is not null
  ), late as (select * from l where delay > 0)
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_rows
  from (select case when p_group = 'employee' then 'موظف ' || row_number() over (order by count(*) desc, k) else k end as k,
               count(*) as late_lines, max(delay) as worst_delay_days, round(avg(delay)) as avg_delay_days
        from late group by k order by count(*) desc, k limit v_lim) x;

  select jsonb_build_object('late_lines', count(*), 'worst_delay_days', coalesce(max(delay), 0)) into v_tot
  from (select ((now() at time zone 'Africa/Cairo')::date - (coalesce(exec_start_date, received_at::date) + duration_days)) as delay
        from public.request_lines
        where deleted_at is null and coalesce(complete, false) = false and coalesce(delivered, false) = false
          and coalesce(status, '') not in ('Delivered', 'Complete') and duration_days is not null) z
  where delay > 0;

  return jsonb_build_object('group', p_group, 'totals', v_tot, 'rows', v_rows);
end $$;

revoke all on function public.ai_report(text, date, date, text, text, int) from public, anon;
revoke all on function public.ai_late_orders(text, int) from public, anon;
grant execute on function public.ai_report(text, date, date, text, text, int) to authenticated;
grant execute on function public.ai_late_orders(text, int) to authenticated;

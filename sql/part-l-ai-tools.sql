-- الجزء ل: أدوات الذكاء الاصطناعي (مرحلة 12) — دوال تجميع للقراءة فقط، للمدير فقط.
-- الـ AI بينادي عليها من Edge Function ask-ai بصلاحيات المدير، ومفيش أي عمود لعميل (اسم/تليفون/عنوان) بيرجع منها.
-- شغّله مرة واحدة في SQL Editor (idempotent).

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
      and (p_employee is null or lower(btrim(employee)) = lower(btrim(p_employee)))
  ), g as (
    select k, round(sum(t)) as sales, round(sum(e)) as exec_cost, round(sum(t) - sum(e)) as estimated_margin,
           round(sum(c)) as commission, count(*) as service_lines, count(distinct transaction_id) as transactions, round(sum(q)) as qty
    from b group by k
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by case when p_group in ('month', 'day') then null else x.sales end desc nulls last, x.k), '[]'::jsonb)
  into v_rows
  from (select * from g order by case when p_group in ('month', 'day') then null else sales end desc nulls last, k limit v_lim) x;

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
  from (select k, count(*) as late_lines, max(delay) as worst_delay_days, round(avg(delay)) as avg_delay_days
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

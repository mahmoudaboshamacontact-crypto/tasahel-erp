-- متابعة التشغيل: (1) تسجيل تلقائي لتغيير حالة أي بند (عشان "اتسلم في الفترة" و"متوسط أيام التسليم" يتحسبوا بدقة من النهاردة)،
-- (2) دالة ops_dashboard للمدير بس: طابور الشغل، العمر، لكل موظف، لكل نوع طلب، متتبع المناديب.
-- إضافة جديدة: دالتين + تريجر؛ مفيش تعديل في أي جدول.
create or replace function public.trg_line_status_history()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status is distinct from old.status then
    insert into public.request_line_stage_history(line_id, stage_from, stage_to, changed_by)
    values (new.id, old.status, new.status, coalesce(auth.uid()::text, 'system'));
  end if;
  return new;
end $$;
revoke all on function public.trg_line_status_history() from public, anon, authenticated;
drop trigger if exists line_status_history_trg on public.request_lines;
create trigger line_status_history_trg after update of complete, delivered, under_review, deleted_at on public.request_lines
  for each row execute function public.trg_line_status_history();

create or replace function public.ops_dashboard(p_from date, p_to date)
returns jsonb language plpgsql stable security definer
set search_path to 'public', 'pg_catalog' as $$
declare v_today date := (now() at time zone 'Africa/Cairo')::date; r jsonb;
begin
  if not public.is_manager() then raise exception 'not allowed' using errcode = '42501'; end if;
  p_from := coalesce(p_from, date_trunc('month', v_today)::date);
  p_to := coalesce(p_to, v_today);
  with base as (
    select l.id, l.transaction_id, l.status, l.employee, l.service, l.received_at::date rd,
           (v_today - l.received_at::date) age
      from request_lines l
     where l.deleted_at is null
       and not exists (select 1 from line_refunds f where f.line_id = l.id and f.status = 'approved' and f.kind = 'full')
       and coalesce(l.employee, '') not in (select name from couriers)
  ), open_l as (select * from base where status <> 'Delivered'),
  per as (select * from base where rd between p_from and p_to)
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'queue', jsonb_build_object(
      'open', (select count(*) from open_l),
      'in_progress', (select count(*) from open_l where status = 'In Progress'),
      'under_review', (select count(*) from open_l where status = 'Under Review'),
      'ready', (select count(*) from open_l where status = 'Complete'),
      'oldest_days', (select coalesce(max(age), 0) from open_l),
      'orders_open', (select count(distinct transaction_id) from open_l)),
    'aging', (select jsonb_build_object(
        'd0', count(*) filter (where age < 1), 'd1_3', count(*) filter (where age between 1 and 3),
        'd3_7', count(*) filter (where age between 4 and 7), 'd7_14', count(*) filter (where age between 8 and 14),
        'd14p', count(*) filter (where age > 14)) from open_l),
    'by_employee', coalesce((select jsonb_agg(x order by x.open desc) from (
        select coalesce(nullif(employee, ''), '—') name,
               count(*) filter (where status <> 'Delivered') open,
               count(*) filter (where status = 'In Progress') in_progress,
               count(*) filter (where status = 'Under Review') under_review,
               count(*) filter (where status = 'Complete') ready,
               coalesce(max(age) filter (where status <> 'Delivered'), 0) oldest,
               count(*) filter (where rd between p_from and p_to) received,
               count(*) filter (where status = 'Delivered' and rd between p_from and p_to) delivered_of_received
          from base group by 1) x where x.open > 0 or x.received > 0), '[]'::jsonb),
    'by_service', coalesce((select jsonb_agg(x order by x.open desc, x.received desc) from (
        select coalesce(nullif(service, ''), '—') name,
               count(*) filter (where status <> 'Delivered') open,
               count(*) filter (where status = 'In Progress') in_progress,
               count(*) filter (where status = 'Complete') ready,
               count(*) filter (where rd between p_from and p_to) received
          from base group by 1 order by count(*) filter (where status <> 'Delivered') desc, count(*) filter (where rd between p_from and p_to) desc limit 15) x), '[]'::jsonb),
    'period_kpi', jsonb_build_object(
      'received', (select count(*) from per), 'orders', (select count(distinct transaction_id) from per),
      'delivered_tracked', (select count(distinct h.line_id) from request_line_stage_history h
                              where h.stage_to = 'Delivered' and (h.changed_at at time zone 'Africa/Cairo')::date between p_from and p_to),
      'tracking_since', (select (min(changed_at) at time zone 'Africa/Cairo')::date from request_line_stage_history)),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('d', d::text, 'n', n) order by d) from (
        select g::date d, (select count(*) from base b where b.rd = g::date) n
          from generate_series(p_from, least(p_to, p_from + 92), interval '1 day') g) z), '[]'::jsonb),
    'runners', coalesce((select jsonb_agg(x order by x.total desc) from (
        select t.courier name, count(*) filter (where t.kind = 'pickup') pickup, count(*) filter (where t.kind = 'delivery') delivery,
               count(*) total, count(*) filter (where t.courier_confirmed_at is not null) confirmed
          from courier_trips t where t.trip_day between p_from and p_to group by 1) x), '[]'::jsonb),
    'cancel_reasons', coalesce((select jsonb_agg(x order by x.n desc) from (
        select coalesce(nullif(trim(k.cancel_reason), ''), 'بدون سبب') reason, count(*) n,
               string_agg(distinct c.name, '، ') couriers
          from pickup_tickets k left join couriers c on c.id = k.courier_id
         where k.status = 'cancelled' and (k.cancelled_at at time zone 'Africa/Cairo')::date between p_from and p_to
         group by 1) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.ops_dashboard(date, date) from public, anon;
grant execute on function public.ops_dashboard(date, date) to authenticated;

-- =====================================================================
-- sql/phase5-analytics-tracking.sql (المرحلة 5: تنبيه التسليم في tracking.html،
-- تحفيز المندوب، خريطة ضغط المناطق، تكلفة التوصيل مقابل الإيراد، وتحليل وقت المشوار)
-- قابل لإعادة التشغيل بأمان (Idempotent) — يُشغّل يدوياً في Supabase SQL Editor
-- - تنبيه tracking.html يعمل على مشاوير التسليم (delivery) فقط وليس تيكتات الاستلام.
-- - تحليلات الإدارة متاحة للموظفين والمدير فقط ولا تظهر للمندوب.
-- =====================================================================

-- 1) تحديث دالة التتبع الحية للعميل: تعمل فقط عندما يكون هناك مشوار تسليم (delivery) فعلي في الطريق
drop function if exists public.public_courier_live_status(text);
create or replace function public.public_courier_live_status(p_tx text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tx text := upper(btrim(coalesce(p_tx, '')));
  v_ev public.courier_dispatch_events;
  v_has_delivery boolean := false;
begin
  if v_tx = '' or char_length(v_tx) > 40 then
    return jsonb_build_object('on_the_way', false);
  end if;

  -- التأكد أن المعاملة في مرحلة التسليم للعميل (delivery) وليست مجرد استلام مبدئي
  select exists (
    select 1 from public.courier_trips ct
    where upper(ct.transaction_id) = v_tx
      and ct.kind = 'delivery'
      and ct.courier_confirmed_at is null
  ) into v_has_delivery;

  if not v_has_delivery then
    return jsonb_build_object('on_the_way', false);
  end if;

  select * into v_ev
    from public.courier_dispatch_events
   where upper(transaction_id) = v_tx
     and event_type in ('on_the_way', 'waiting')
     and created_at > now() - interval '6 hours'
   order by created_at desc
   limit 1;

  if v_ev.id is null then
    return jsonb_build_object('on_the_way', false);
  end if;

  return jsonb_build_object(
    'on_the_way', true,
    'state', v_ev.event_type,
    'courier_name', split_part(coalesce(v_ev.courier_name, 'مندوب تساهيل'), ' ', 1),
    'eta_label', case when v_ev.event_type = 'waiting' then 'وصل للعنوان الآن' else 'متوقع الوصول خلال ~10 دقائق' end,
    'at', v_ev.created_at
  );
end;
$$;

revoke all on function public.public_courier_live_status(text) from public;
grant execute on function public.public_courier_live_status(text) to anon, authenticated;

-- 2) دالة إحصائيات التحفيز الشخصي للمندوب (الهدف اليومي + سلسلة الالتزام + نجم الأسبوع + الرقم القياسي)
drop function if exists public.courier_p5_motivation();
create or replace function public.courier_p5_motivation()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_me text;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_week_start date := date_trunc('week', (now() at time zone 'Africa/Cairo'))::date;
  v_today_total int := 0;
  v_today_conf int := 0;
  v_streak int := 0;
  v_d date;
  v_d_tot int;
  v_d_conf int;
  v_rec_trips int := 0;
  v_rec_day date;
  v_top_name text;
  v_top_trips int := 0;
  v_top_id bigint;
begin
  if not public.is_courier() then
    raise exception 'courier only' using errcode = '42501';
  end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then
    raise exception 'courier not linked' using errcode = '42501';
  end if;
  v_me := public.norm_ar(v_c.name);

  -- مشاوير اليوم
  select count(*), count(*) filter (where courier_confirmed_at is not null)
    into v_today_total, v_today_conf
    from public.courier_trips
   where public.norm_ar(courier) = v_me
     and trip_day = v_today;

  -- سلسلة الالتزام اليومي (أيام متتالية تم فيها تأكيد كل مشاوير اليوم)
  v_d := v_today;
  for i in 0..30 loop
    select count(*), count(*) filter (where courier_confirmed_at is not null)
      into v_d_tot, v_d_conf
      from public.courier_trips
     where public.norm_ar(courier) = v_me
       and trip_day = v_d;
    if v_d_tot > 0 and v_d_tot = v_d_conf then
      v_streak := v_streak + 1;
    elsif i = 0 then
      -- اليوم لسه شغال، نكمل نحسب من إمبارح
      null;
    elsif v_d_tot > 0 then
      exit;
    end if;
    v_d := v_d - 1;
  end loop;

  -- الرقم القياسي الشخصي في يوم واحد
  select ct.trip_day, count(*)::int
    into v_rec_day, v_rec_trips
    from public.courier_trips ct
   where public.norm_ar(ct.courier) = v_me
     and ct.courier_confirmed_at is not null
   group by ct.trip_day
   order by count(*) desc, ct.trip_day desc
   limit 1;

  v_rec_trips := coalesce(v_rec_trips, 0);

  -- نجم الأسبوع الحالي
  select c.id, c.name, count(ct.id)::int as cnt
    into v_top_id, v_top_name, v_top_trips
    from public.couriers c
    join public.courier_trips ct on public.norm_ar(ct.courier) = public.norm_ar(c.name)
   where c.active = true
     and c.user_id is not null
     and coalesce(c.in_ranking, true) = true
     and ct.trip_day >= v_week_start
     and ct.courier_confirmed_at is not null
   group by c.id, c.name
   order by cnt desc, c.id asc
   limit 1;

  return jsonb_build_object(
    'today_total', v_today_total,
    'today_confirmed', v_today_conf,
    'daily_target', greatest(v_today_total, 8),
    'streak_days', v_streak,
    'personal_record', v_rec_trips,
    'personal_record_day', v_rec_day,
    'to_beat_record', greatest(0, (v_rec_trips - v_today_conf) + 1),
    'weekly_top_name', v_top_name,
    'weekly_top_trips', coalesce(v_top_trips, 0),
    'is_weekly_star', (v_top_id is not null and v_top_id = v_c.id)
  );
end;
$$;

revoke all on function public.courier_p5_motivation() from public, anon;
grant execute on function public.courier_p5_motivation() to authenticated;

-- 3) دالة تحليلات الإدارة والربحية (خريطة المناطق + تكلفة التوصيل مقابل الإيراد + وقت الطريق والانتظار)
drop function if exists public.radar_p5_analytics(int);
create or replace function public.radar_p5_analytics(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 180));
  v_from date := ((now() at time zone 'Africa/Cairo')::date - v_days);
  v_zones jsonb;
  v_times jsonb;
begin
  if not (public.is_staff() or public.is_manager()) then
    raise exception 'staff or manager only' using errcode = '42501';
  end if;

  -- أ) خريطة ضغط المناطق وتكلفة التوصيل مقابل الإيراد
  with tx_base as (
    select
      l.transaction_id,
      max(coalesce(l.address, '')) as addr,
      sum(coalesce(l.total, coalesce(l.qty, 1) * coalesce(l.unit_price, 0))) as revenue,
      sum(case when public.norm_ar(l.service) like 'رسوم توصيل%'
               then coalesce(nullif(l.exec_total, 0), coalesce(l.qty, 0) * coalesce(l.exec_unit_cost, 0))
               else 0 end) as fee_cost
    from public.request_lines l
    where l.deleted_at is null
      and (l.received_at at time zone 'Africa/Cairo')::date >= v_from
    group by l.transaction_id
  ),
  tx_with_zone as (
    select
      tb.*,
      coalesce((select sum(coalesce(ct.fee, 0)) from public.courier_trips ct where ct.transaction_id = tb.transaction_id), 0) as trip_cost,
      case
        when tb.addr ~* 'مدينة نصر|مصر الجديدة|النزهة|شيراتون|جسر السويس|الماظة|ألماظة' then 'مدينة نصر ومصر الجديدة'
        when tb.addr ~* 'التجمع|القاهرة الجديدة|الرحاب|مدينتي|الشروق|المستقبل|القطامية|بدر|العاصمة' then 'التجمع والقاهرة الجديدة'
        when tb.addr ~* 'الجيزة|الدقي|المهندسين|فيصل|الهرم|العجوزة|إمبابة|امبابة|حدائق الأهرام' then 'الجيزة والمهندسين'
        when tb.addr ~* 'أكتوبر|اكتوبر|الشيخ زايد|زايد|حدائق أكتوبر' then 'أكتوبر والشيخ زايد'
        when tb.addr ~* 'المعادي|المقطم|حلوان|دار السلام|البساتين|المنيل' then 'المعادي والمقطم'
        when tb.addr ~* 'العباسية|الوايلي|وسط البلد|رمسيس|التحرير|الزمالك|جاردن سيتي|شبرا' then 'وسط البلد والعباسية وشبرا'
        else 'مناطق أخرى / غير محدد'
      end as zone_name
    from tx_base tb
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'zone_name', z.zone_name,
    'orders_count', z.orders_count,
    'revenue', round(z.revenue, 2),
    'delivery_cost', round(z.delivery_cost, 2),
    'cost_pct', case when z.revenue > 0 then round((z.delivery_cost / z.revenue) * 100, 1) else 0 end
  ) order by z.orders_count desc, z.revenue desc), '[]'::jsonb)
  into v_zones
  from (
    select
      zone_name,
      count(*)::int as orders_count,
      coalesce(sum(revenue), 0) as revenue,
      coalesce(sum(trip_cost + fee_cost), 0) as delivery_cost
    from tx_with_zone
    group by zone_name
  ) z;

  -- ب) تحليل وقت المشوار (الطريق vs الانتظار) لكل مندوب
  with ev_pairs as (
    select
      e1.courier_id,
      e1.courier_name,
      e1.transaction_id,
      e1.created_at as on_way_at,
      (select min(e2.created_at) from public.courier_dispatch_events e2
        where e2.courier_id = e1.courier_id
          and e2.transaction_id = e1.transaction_id
          and e2.event_type = 'waiting'
          and e2.created_at >= e1.created_at
          and e2.created_at <= e1.created_at + interval '3 hours') as arrived_at,
      (select min(ct.courier_confirmed_at) from public.courier_trips ct
        where public.norm_ar(ct.courier) = public.norm_ar(e1.courier_name)
          and ct.transaction_id = e1.transaction_id
          and ct.courier_confirmed_at >= e1.created_at
          and ct.courier_confirmed_at <= e1.created_at + interval '4 hours') as confirmed_at
    from public.courier_dispatch_events e1
    where e1.event_type = 'on_the_way'
      and e1.transaction_id is not null
      and (e1.created_at at time zone 'Africa/Cairo')::date >= v_from
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'courier_name', t.courier_name,
    'samples_count', t.samples_count,
    'avg_transit_mins', coalesce(round(t.avg_transit, 0), 0),
    'avg_wait_mins', coalesce(round(t.avg_wait, 0), 0)
  ) order by t.samples_count desc), '[]'::jsonb)
  into v_times
  from (
    select
      courier_name,
      count(*)::int as samples_count,
      avg(extract(epoch from (arrived_at - on_way_at)) / 60.0) filter (where arrived_at is not null) as avg_transit,
      avg(extract(epoch from (confirmed_at - arrived_at)) / 60.0) filter (where arrived_at is not null and confirmed_at is not null and confirmed_at >= arrived_at) as avg_wait
    from ev_pairs
    group by courier_name
  ) t;

  return jsonb_build_object(
    'days', v_days,
    'zones', v_zones,
    'trip_times', v_times
  );
end;
$$;

revoke all on function public.radar_p5_analytics(int) from public, anon;
grant execute on function public.radar_p5_analytics(int) to authenticated;


-- 4) تفاصيل معاملات منطقة محددة (ومنها مناطق أخرى / غير محدد) لفتحها ومعرفة العناوين الناقصة
drop function if exists public.radar_p5_zone_details(text, int);
create or replace function public.radar_p5_zone_details(p_zone text, p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 180));
  v_from date := ((now() at time zone 'Africa/Cairo')::date - v_days);
  v_zone text := btrim(coalesce(p_zone, ''));
begin
  if not (public.is_staff() or public.is_manager()) then
    raise exception 'staff or manager only' using errcode = '42501';
  end if;

  return coalesce((
    with tx_base as (
      select
        l.transaction_id,
        max(l.client_name) as client_name,
        max(coalesce(l.address, '')) as addr,
        sum(coalesce(l.total, coalesce(l.qty, 1) * coalesce(l.unit_price, 0))) as revenue,
        sum(case when public.norm_ar(l.service) like 'رسوم توصيل%'
                 then coalesce(nullif(l.exec_total, 0), coalesce(l.qty, 0) * coalesce(l.exec_unit_cost, 0))
                 else 0 end) as fee_cost
      from public.request_lines l
      where l.deleted_at is null
        and (l.received_at at time zone 'Africa/Cairo')::date >= v_from
      group by l.transaction_id
    ),
    tx_with_zone as (
      select
        tb.*,
        coalesce((select sum(coalesce(ct.fee, 0)) from public.courier_trips ct where ct.transaction_id = tb.transaction_id), 0) as trip_cost,
        case
          when tb.addr ~* 'مدينة نصر|مصر الجديدة|النزهة|شيراتون|جسر السويس|الماظة|ألماظة' then 'مدينة نصر ومصر الجديدة'
          when tb.addr ~* 'التجمع|القاهرة الجديدة|الرحاب|مدينتي|الشروق|المستقبل|القطامية|بدر|العاصمة' then 'التجمع والقاهرة الجديدة'
          when tb.addr ~* 'الجيزة|الدقي|المهندسين|فيصل|الهرم|العجوزة|إمبابة|امبابة|حدائق الأهرام' then 'الجيزة والمهندسين'
          when tb.addr ~* 'أكتوبر|اكتوبر|الشيخ زايد|زايد|حدائق أكتوبر' then 'أكتوبر والشيخ زايد'
          when tb.addr ~* 'المعادي|المقطم|حلوان|دار السلام|البساتين|المنيل' then 'المعادي والمقطم'
          when tb.addr ~* 'العباسية|الوايلي|وسط البلد|رمسيس|التحرير|الزمالك|جاردن سيتي|شبرا' then 'وسط البلد والعباسية وشبرا'
          else 'مناطق أخرى / غير محدد'
        end as zone_name
      from tx_base tb
    )
    select jsonb_agg(jsonb_build_object(
      'transaction_id', z.transaction_id,
      'client_name', z.client_name,
      'address', nullif(btrim(z.addr), ''),
      'revenue', round(z.revenue, 2),
      'delivery_cost', round(z.trip_cost + z.fee_cost, 2)
    ) order by z.revenue desc)
    from tx_with_zone z
    where z.zone_name = v_zone
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.radar_p5_zone_details(text, int) from public, anon;
grant execute on function public.radar_p5_zone_details(text, int) to authenticated;

-- =====================================================================
-- sql/fix-tracking-public.sql  (إصلاح تتبع العميل العام)
-- يُشغَّل في Supabase SQL Editor *بعد* phase5-analytics-tracking.sql — قابل لإعادة التشغيل.
-- المشكلة: phase5 رجّعت تنفيذ public_courier_live_status(رقم المعاملة) لـ anon بعد ما courier-link-v13 قفلته،
--          والرقم ممكن يتخمّن فيكشف حالة المندوب واسمه الأول لأي حد.
-- الحل: حالة المندوب الحية بقت جزء من نتيجة lookup_public_tracking_by_code_and_phone4 (بعد التحقق من الكود وآخر 4 أرقام
--       وبحدود المحاولات)، والدالة القديمة بالرقم اتقفلت نهائيًا عن anon/authenticated.
-- =====================================================================

create or replace function public.lookup_public_tracking_by_code_and_phone4(
  p_transaction_id text, p_code text, p_phone_last4 text
) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_tx text := upper(btrim(coalesce(p_transaction_id, '')));
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_last4 text := regexp_replace(btrim(coalesce(p_phone_last4, '')), '\D', '', 'g');
  v_tx_fail integer;
  v_global_fail integer;
  v_ok boolean;
  v_services jsonb;
  v_pct integer := 0;
  v_stage integer := 1;
  v_received date;
  v_expected date;
  v_ev public.courier_dispatch_events;
  v_live jsonb := jsonb_build_object('on_the_way', false);
begin
  if v_tx = '' or char_length(v_tx) > 40 or v_code !~ '^[0-9A-F]{8}$' or v_last4 !~ '^\d{4}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- قفل عام يسلسل الطلبات فيمنع تخطي الحد بالطلبات المتوازية
  perform pg_advisory_xact_lock(7285001);

  select count(*) filter (where lookup_key = v_tx and attempted_at >= now() - interval '15 minutes'),
         count(*)
    into v_tx_fail, v_global_fail
    from public.public_tracking_attempts
   where succeeded = false and attempted_at >= now() - interval '1 hour';

  if v_tx_fail >= 5 or v_global_fail >= 60 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited',
      'message', 'تم تجاوز الحد المسموح للمحاولات. يرجى الانتظار والمحاولة لاحقًا.');
  end if;

  select exists (
           select 1
             from public.tx_track_codes c
             join public.request_lines l on upper(btrim(l.transaction_id::text)) = c.transaction_id
            where c.transaction_id = v_tx and c.code = v_code
              and l.deleted_at is null
              and right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 4) = v_last4)
    into v_ok;

  if not v_ok then
    insert into public.public_tracking_attempts (lookup_key, succeeded) values (v_tx, false);
    return jsonb_build_object('ok', false, 'error', 'not_found_or_mismatch',
      'message', 'بيانات المعاملة غير صحيحة.');
  end if;

  select min(coalesce(l.received_at::date, l.created_at::date)),
         max(coalesce(l.exec_start_date::date, l.received_at::date) + coalesce(l.duration_days, 0)::int)
    into v_received, v_expected
    from public.request_lines l
   where upper(btrim(l.transaction_id::text)) = v_tx and l.deleted_at is null;

  select coalesce(jsonb_agg(x.item order by x.ord), '[]'::jsonb),
         coalesce(round(avg(x.pct))::int, 0), coalesce(min(x.stg), 1)
    into v_services, v_pct, v_stage
    from (
      select l.id as ord,
             case public.line_stage_of(l.delivered, l.complete, l.under_review)
               when 'delivered' then 100 when 'complete' then 75 when 'under_review' then 50 else 25 end as pct,
             case public.line_stage_of(l.delivered, l.complete, l.under_review)
               when 'delivered' then 3 when 'complete' then 2 else 1 end as stg,
             jsonb_build_object('service', l.service, 'qty', coalesce(l.qty, 1),
                                'status', public.line_stage_of(l.delivered, l.complete, l.under_review)) as item
        from public.request_lines l
       where upper(btrim(l.transaction_id::text)) = v_tx and l.deleted_at is null
    ) x;

  -- حالة المندوب الحية: بعد التحقق من (رقم + كود + آخر 4 أرقام) فقط، ولمشاوير التسليم غير المؤكدة فقط
  if exists (select 1 from public.courier_trips ct
              where upper(ct.transaction_id) = v_tx and ct.kind = 'delivery' and ct.courier_confirmed_at is null) then
    select * into v_ev from public.courier_dispatch_events e
     where upper(e.transaction_id) = v_tx and e.event_type in ('on_the_way', 'waiting')
       and e.created_at > now() - interval '6 hours'
     order by e.created_at desc limit 1;
    if v_ev.id is not null then
      v_live := jsonb_build_object('on_the_way', true, 'state', v_ev.event_type,
        'courier_name', split_part(coalesce(v_ev.courier_name, 'مندوب تساهيل'), ' ', 1),
        'eta_label', case when v_ev.event_type = 'waiting' then 'وصل للعنوان الآن' else 'متوقع الوصول خلال ~10 دقائق' end,
        'at', v_ev.created_at);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'transaction_id', v_tx, 'received_date', v_received,
    'expected_to', v_expected, 'overall_stage', v_stage, 'order_pct', v_pct, 'services', v_services, 'live', v_live);
end $$;

revoke all on function public.lookup_public_tracking_by_code_and_phone4(text, text, text) from public;
grant execute on function public.lookup_public_tracking_by_code_and_phone4(text, text, text) to anon, authenticated;

-- الدالة القديمة بالرقم: مقفولة عن المجهول والمسجّلين (ما حدش بيستخدمها بعد التعديل)
revoke all on function public.public_courier_live_status(text) from public, anon, authenticated;

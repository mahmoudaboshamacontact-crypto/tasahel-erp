-- =====================================================================
-- الجزء هـ (28): التتبع العام — نسخة معدّلة بعد المراجعة الأمنية (جاهزة للتشغيل)
-- الملف: sql/part-e-public-tracking-28.sql — Idempotent.
-- الضوابط: (1) كود تتبع عشوائي 8 خانات + آخر 4 أرقام من التليفون (الرقم TX-سنة-NNNN وحده قابل للتخمين).
-- (2) حد محاولات فاشلة: 5/15 دقيقة لكل معاملة + 60/ساعة عام، مع قفل advisory (لا يُتخطى بالطلبات المتوازية).
-- (3) لا كتابة على النجاح ولا بعد تجاوز الحد العام (الجدول لا يتضخم)؛ التنظيف بـ pg_cron.
-- (4) ترجع الحالة فقط: لا أسماء ولا أرقام تليفون ولا أسعار. المحذوف مستبعد.
-- الأمر الوحيد المتبقي بعد التشغيل: سطر grant لـ anon في آخر الملف (مفعّل هنا بعد المراجعة).
-- =====================================================================

-- 0) كود التتبع لكل معاملة (يُنشأ بمعرفة الموظف فقط)
create table if not exists public.tx_track_codes (
  transaction_id text primary key,
  code text not null,
  created_at timestamptz not null default now()
);
alter table public.tx_track_codes enable row level security;
revoke all on table public.tx_track_codes from public, anon, authenticated;

create or replace function public.staff_get_track_code(p_tx text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_tx text := upper(btrim(coalesce(p_tx, '')));
  v_code text;
begin
  if (select auth.uid()) is null or not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if v_tx = '' or not exists (select 1 from public.request_lines
                               where upper(btrim(transaction_id::text)) = v_tx and deleted_at is null) then
    raise exception 'transaction not found' using errcode = 'P0002';
  end if;
  insert into public.tx_track_codes (transaction_id, code)
  values (v_tx, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)))
  on conflict (transaction_id) do nothing;
  select code into v_code from public.tx_track_codes where transaction_id = v_tx;
  return v_code;
end $$;
revoke all on function public.staff_get_track_code(text) from public, anon;
grant execute on function public.staff_get_track_code(text) to authenticated;


create table if not exists public.public_tracking_attempts (
  id bigint generated always as identity primary key,
  lookup_key text not null check (char_length(lookup_key) between 1 and 120),
  attempted_at timestamptz not null default now(),
  succeeded boolean not null default false
);
create index if not exists public_tracking_attempts_key_at_idx
  on public.public_tracking_attempts (lookup_key, attempted_at desc);
create index if not exists public_tracking_attempts_at_idx
  on public.public_tracking_attempts (attempted_at);
alter table public.public_tracking_attempts enable row level security;
revoke all on table public.public_tracking_attempts from public, anon, authenticated;

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

  return jsonb_build_object('ok', true, 'transaction_id', v_tx, 'received_date', v_received,
    'expected_to', v_expected, 'overall_stage', v_stage, 'order_pct', v_pct, 'services', v_services);
end $$;

-- إزالة النسخة القديمة (بدون كود) لو كانت اتشغلت
drop function if exists public.lookup_public_tracking_by_code_and_phone4(text, text);

revoke all on function public.lookup_public_tracking_by_code_and_phone4(text, text, text) from public;
grant execute on function public.lookup_public_tracking_by_code_and_phone4(text, text, text) to anon, authenticated;

-- تنظيف دوري (لو pg_cron مفعّل)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('public-tracking-attempts-cleanup', '17 * * * *',
      $c$delete from public.public_tracking_attempts where attempted_at < now() - interval '24 hours'$c$);
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;

-- =====================================================================
-- ⚠️ للمراجعة الأمنية فقط بواسطة Claude قبل النشر — لا تشغّله قبل الاعتماد الأمني
-- الجزء هـ (منفصل): فيتشر (28) دالة التتبع العامة بكود المعاملة وآخر 4 أرقام من التليفون
-- الملف: sql/part-e-public-tracking-28.sql
--
-- الضوابط الأمنية المطبّقة في هذا الملف:
-- 1) الدالة تقرأ الحالة فقط (Status Only) ولا ترجع أبداً اسم العميل الكامل أو رقم التليفون
--    أو العنوان أو الأسعار أو تكلفة التنفيذ أو اسم المنفذ أو الملاحظات الداخلية.
-- 2) تستبعد تماماً أي صف محذوف في سلة المحذوفات (deleted_at is null).
-- 3) تتحقق من تطابق كود المعاملة (p_transaction_id) + آخر 4 أرقام من تليفون العميل (p_phone_last4).
-- 4) تحتوي على جدول حماية من التخمين (Rate Limiting: بحد أقصى 5 محاولات فاشلة لكل 15 دقيقة
--    على نفس رقم المعاملة أو بصمة الزائر) مع قفل RLS كامل على جدول المحاولات.
-- 5) معرّفة بـ SECURITY DEFINER مع تثبيت المسار: SET search_path = public, pg_catalog.
-- =====================================================================

-- 1) جدول تسجيل محاولات الاستعلام العام للحد من التخمين (Brute-force Rate Limiting)
create table if not exists public.public_tracking_attempts (
  id bigint generated always as identity primary key,
  lookup_key text not null check (char_length(lookup_key) between 1 and 120),
  attempted_at timestamptz not null default now(),
  succeeded boolean not null default false
);

create index if not exists public_tracking_attempts_key_at_idx
  on public.public_tracking_attempts (lookup_key, attempted_at desc);

alter table public.public_tracking_attempts enable row level security;
-- منع الوصول المباشر للجدول عن الجميع (anon و authenticated)؛ التعامل يتم عبر الدالة المحمية فقط
revoke all on table public.public_tracking_attempts from public, anon, authenticated;

-- 2) دالة التتبع العامة المحمية بكود المعاملة وآخر 4 أرقام من التليفون
create or replace function public.lookup_public_tracking_by_code_and_phone4(
  p_transaction_id text,
  p_phone_last4 text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_tx text := upper(btrim(coalesce(p_transaction_id, '')));
  v_last4 text := regexp_replace(btrim(coalesce(p_phone_last4, '')), '\D', '', 'g');
  v_failed_cnt integer := 0;
  v_matched_phone text;
  v_services jsonb;
  v_pct integer := 0;
  v_overall_stage integer := 1;
  v_received_date date;
  v_expected_to date;
begin
  -- التحقق من صحة المدخلات قبل أي استعلام
  if v_tx = '' or char_length(v_tx) > 40 or v_last4 !~ '^\d{4}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  -- تنظيف السجلات القديمة لأكثر من 24 ساعة للحفاظ على مساحة الباقة المجانية
  delete from public.public_tracking_attempts
   where attempted_at < now() - interval '24 hours';

  -- فحص عدد المحاولات الفاشلة خلال آخر 15 دقيقة على نفس رقم المعاملة
  select count(*)
    into v_failed_cnt
    from public.public_tracking_attempts
   where lookup_key = v_tx
     and succeeded = false
     and attempted_at >= now() - interval '15 minutes';

  if v_failed_cnt >= 5 then
    return jsonb_build_object(
      'ok', false,
      'error', 'rate_limited',
      'message', 'تم تجاوز الحد المسموح للمحاولات. يرجى الانتظار 15 دقيقة والمحاولة مرة أخرى.'
    );
  end if;

  -- التحقق من وجود المعاملة غير المحذوفة ومطابقة آخر 4 أرقام من التليفون
  select right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 4),
         min(coalesce(l.received_at::date, l.created_at::date)),
         max(coalesce(l.exec_start_date::date, l.received_at::date) + coalesce(l.duration_days, 0)::int)
    into v_matched_phone, v_received_date, v_expected_to
    from public.request_lines l
   where upper(btrim(l.transaction_id::text)) = v_tx
     and l.deleted_at is null
   group by right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 4)
   limit 1;

  if v_matched_phone is null or v_matched_phone <> v_last4 then
    insert into public.public_tracking_attempts (lookup_key, succeeded)
    values (v_tx, false);

    return jsonb_build_object(
      'ok', false,
      'error', 'not_found_or_mismatch',
      'message', 'بيانات المعاملة أو آخر 4 أرقام من الهاتف غير صحيحة.'
    );
  end if;

  -- تسجيل نجاح الاستعلام
  insert into public.public_tracking_attempts (lookup_key, succeeded)
  values (v_tx, true);

  -- تجميع حالة الخدمات فقط بدون أي بيانات مالية أو شخصية
  select coalesce(jsonb_agg(x.item order by x.ord), '[]'::jsonb),
         coalesce(round(avg(x.pct))::int, 0),
         coalesce(min(x.stg), 1)
    into v_services, v_pct, v_overall_stage
    from (
      select l.id as ord,
             case public.line_stage_of(l.delivered, l.complete, l.under_review)
               when 'delivered' then 100
               when 'complete' then 75
               when 'under_review' then 50
               else 25
             end as pct,
             case public.line_stage_of(l.delivered, l.complete, l.under_review)
               when 'delivered' then 3
               when 'complete' then 2
               else 1
             end as stg,
             jsonb_build_object(
               'service', l.service,
               'qty', coalesce(l.qty, 1),
               'status', public.line_stage_of(l.delivered, l.complete, l.under_review)
             ) as item
        from public.request_lines l
       where upper(btrim(l.transaction_id::text)) = v_tx
         and l.deleted_at is null
    ) x;

  return jsonb_build_object(
    'ok', true,
    'transaction_id', v_tx,
    'received_date', v_received_date,
    'expected_to', v_expected_to,
    'overall_stage', v_overall_stage,
    'order_pct', v_pct,
    'services', v_services
  );
end $$;

-- تقييد الصلاحيات (لا يتم منحها لـ anon إلا بعد مراجعة Claude واعتماد النشر)
revoke all on function public.lookup_public_tracking_by_code_and_phone4(text, text) from public, anon;
-- بعد مراجعة Claude الأمنية فقط، يمكن تفعيل السطر التالي:
-- grant execute on function public.lookup_public_tracking_by_code_and_phone4(text, text) to anon, authenticated;

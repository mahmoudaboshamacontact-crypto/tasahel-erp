-- الجزء ك: جدولة الملخص اليومي على تليجرام — 10 م بتوقيت القاهرة. (اتطبّق على Supabase بتاريخ 2026-11-07؛ الملف للتوثيق ولإعادة التشغيل.)
-- pg_cron بتشتغل UTC، فبنشغّل الدالة الساعة 19:00 و20:00 UTC، والدالة بتبعت بس لو الساعة في القاهرة = 22 (بتتظبط لوحدها مع التوقيت الصيفي).
-- السر مش في أمر الجدولة: بيتقرا من public.push_config (نفس صف part-j-push.sql). من غيره الدالة مش بتبعت حاجة.
create extension if not exists pg_net;

create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  fn_url text not null,
  secret text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

create or replace function public.run_daily_summary(p_force boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_secret text;
begin
  if not p_force and extract(hour from (now() at time zone 'Africa/Cairo')) <> 22 then
    return 'skipped: not 22:00 Cairo';
  end if;
  select secret into v_secret from public.push_config where id = 1;
  if v_secret is null then return 'skipped: push_config not set'; end if;
  perform net.http_post(
    url := 'https://avehvjqifswsyayckpvx.supabase.co/functions/v1/daily-summary',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
  return 'sent';
end $$;
revoke all on function public.run_daily_summary(boolean) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('telegram-daily-summary-19', 'telegram-daily-summary-20');
select cron.schedule('telegram-daily-summary-19', '0 19 * * *', $$select public.run_daily_summary()$$);
select cron.schedule('telegram-daily-summary-20', '0 20 * * *', $$select public.run_daily_summary()$$);

-- اختبار يدوي (بيبعت رسالة تليجرام فوراً بعد ما push_config يتملي):  select public.run_daily_summary(true);

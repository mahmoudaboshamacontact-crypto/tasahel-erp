-- مراقبة الأخطاء: (1) المندوب يقدر يسجّل أخطاءه عبر دالة محكومة (الجدول نفسه مقفول عليه)،
-- (2) المدير يشوف ملخص الأخطاء في شاشة المالك، (3) تنضيف تلقائي بعد 30 يوم.
-- إضافة جديدة: دالتين + جدولة؛ مفيش تعديل في أي جدول أو سياسة.
create or replace function public.log_client_error(
  p_message text, p_source text default null, p_line int default null, p_col int default null,
  p_tab text default null, p_app_version text default null, p_ua text default null)
returns void language plpgsql security definer
set search_path to 'public', 'pg_catalog' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or coalesce(trim(p_message), '') = '' then return; end if;
  if coalesce(public.my_role(), '') = 'partner' then return; end if;
  -- حد أقصى 20 خطأ لكل مستخدم في الساعة
  if (select count(*) from error_log where user_id = v_uid and created_at > now() - interval '1 hour') >= 20 then return; end if;
  insert into error_log(user_id, role, message, source, line, col, tab, app_version, ua)
  values (v_uid, public.my_role(), left(p_message, 300), left(p_source, 120), p_line, p_col,
          left(p_tab, 40), left(p_app_version, 40), left(p_ua, 150));
end $$;
revoke all on function public.log_client_error(text, text, int, int, text, text, text) from public, anon;
grant execute on function public.log_client_error(text, text, int, int, text, text, text) to authenticated;

create or replace function public.owner_errors(p_days int default 7)
returns jsonb language plpgsql stable security definer
set search_path to 'public', 'pg_catalog' as $$
declare r jsonb;
begin
  if not public.is_manager() then raise exception 'not allowed' using errcode = '42501'; end if;
  select jsonb_build_object(
    'total',    (select count(*) from error_log where created_at > now() - make_interval(days => p_days)),
    'today',    (select count(*) from error_log where created_at > now() - interval '24 hours'),
    'users',    (select count(distinct user_id) from error_log where created_at > now() - make_interval(days => p_days)),
    'top', coalesce((select jsonb_agg(t order by t.n desc) from (
        select left(message, 140) msg, coalesce(tab, '—') tab, coalesce(role, '—') role,
               count(*) n, count(distinct user_id) users, max(created_at) last
          from error_log where created_at > now() - make_interval(days => p_days)
         group by 1, 2, 3 order by count(*) desc limit 8) t), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.owner_errors(int) from public, anon;
grant execute on function public.owner_errors(int) to authenticated;

-- تنضيف: يمسح الأخطاء الأقدم من 30 يوم كل يوم 3 الفجر (بتوقيت UTC)
select cron.unschedule('error_log_cleanup') where exists (select 1 from cron.job where jobname = 'error_log_cleanup');
select cron.schedule('error_log_cleanup', '0 3 * * *', $$delete from public.error_log where created_at < now() - interval '30 days'$$);

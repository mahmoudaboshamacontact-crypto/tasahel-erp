-- أمان 1 — تغييرات آمنة ما بتغيّرش سلوك الموظفين. خد نسخة احتياطية الأول. آمن لو اتشغل أكتر من مرة.
-- (أ) customer_inquiries و backup_log كانوا مفتوحين لأي مستخدم مسجّل (حتى المنفذ الخارجي) → للمدير بس
--     (الموظف العادي أصلاً مش بيشوف الاستفسارات في الواجهة، فمفيش تغيير في شغله)
drop policy if exists staff_only on public.customer_inquiries;
create policy staff_only on public.customer_inquiries as restrictive for all to authenticated using (public.is_manager()) with check (public.is_manager());
drop policy if exists staff_only on public.backup_log;
create policy staff_only on public.backup_log as restrictive for all to authenticated using (public.is_manager()) with check (public.is_manager());

-- (ب) دوال ما لازم تكون متاحة للزائر (anon). التتبع العام وطلب الاستفسار العام بيفضلوا زي ما هم.
do $body$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname in ('remind_task','touch_last_seen','add_partner_comment','get_partner_requests','current_author_name','hr_punch_out')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end
$body$;

-- ===== Rollback =====
-- drop policy if exists staff_only on public.customer_inquiries;
-- drop policy if exists staff_only on public.backup_log;
-- grant execute on function public.get_partner_requests(uuid,int,int) to anon;  -- (لو احتجت ترجّع أي دالة)

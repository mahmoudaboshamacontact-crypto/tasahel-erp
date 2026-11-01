-- أمان 4: تثبيت مكان البحث لدالة fn_audit_request_lines (بتشتغل بصلاحيات عالية). ما بيغيّر أي سلوك. آمن يتشغل أكتر من مرة.
do $body$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_audit_request_lines'
  loop
    execute format('alter function %s set search_path = public, pg_catalog', r.sig);
  end loop;
end
$body$;
-- ===== Rollback: alter function public.fn_audit_request_lines() reset search_path; =====

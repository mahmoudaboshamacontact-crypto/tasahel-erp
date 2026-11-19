-- =====================================================================
-- sql/fix-batch2-cleanup.sql
-- تنظيف صلاحيات anon على دوال الـ Trigger والدوال المساعدة
-- قابل لإعادة التشغيل بأمان (Idempotent).
-- =====================================================================

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'line_stage_of',
         'trg_courier_ops_fee_notice',
         'trg_courier_ops_trip_notice',
         'trg_courier_trip_reset',
         'trg_no_fee_discount',
         'trg_set_delivered_date'
       )
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
  end loop;
end $$;

-- استعلام تحقق: لازم كل الصفوف ترجع anon_can_execute = false
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (
     'line_stage_of',
     'trg_courier_ops_fee_notice',
     'trg_courier_ops_trip_notice',
     'trg_courier_trip_reset',
     'trg_no_fee_discount',
     'trg_set_delivered_date'
   )
 order by p.proname;

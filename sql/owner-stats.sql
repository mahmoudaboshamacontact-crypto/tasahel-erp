-- عدادات المالك (owner.html): دالة قراءة فقط، للمدير بس، بترجّع أرقام مجمّعة (من غير بيانات عملاء). آمنة تتشغل أكتر من مرة.
create or replace function public.owner_stats()
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare r jsonb;
begin
  if not public.is_manager() then raise exception 'not allowed' using errcode = '42501'; end if;
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'users', (select count(*) from auth.users),
    'lines_total', (select count(*) from public.request_lines where deleted_at is null),
    'lines_today', (select count(*) from public.request_lines where received_at >= date_trunc('day', now() at time zone 'Africa/Cairo')),
    'tables', coalesce((select jsonb_agg(t) from (
        select relname as name, n_live_tup as rows, pg_total_relation_size(relid) as bytes
        from pg_stat_user_tables where schemaname = 'public' order by pg_total_relation_size(relid) desc limit 8) t), '[]'::jsonb),
    'rls_off', coalesce((select jsonb_agg(tablename) from pg_tables where schemaname = 'public' and rowsecurity = false), '[]'::jsonb),
    'open_policies', coalesce((select jsonb_agg(p.tablename || '.' || p.policyname) from pg_policies p
        where p.schemaname = 'public' and p.permissive = 'PERMISSIVE' and p.cmd <> 'SELECT'
          and (p.qual = 'true' or p.with_check = 'true')
          and not exists (select 1 from pg_policies r where r.schemaname = 'public' and r.tablename = p.tablename
                          and r.permissive = 'RESTRICTIVE' and r.qual ~ 'is_staff|is_manager')), '[]'::jsonb),
    'open_staff', coalesce((select jsonb_agg(p.tablename || '.' || p.policyname) from pg_policies p
        where p.schemaname = 'public' and p.permissive = 'PERMISSIVE' and p.cmd <> 'SELECT'
          and (p.qual = 'true' or p.with_check = 'true')
          and exists (select 1 from pg_policies r where r.schemaname = 'public' and r.tablename = p.tablename
                      and r.permissive = 'RESTRICTIVE' and r.qual ~ 'is_staff|is_manager')), '[]'::jsonb),
    'checks', jsonb_build_object(
      'user_roles_rls_ok', coalesce((select c.relrowsecurity from pg_class c where c.oid = 'public.user_roles'::regclass), false)
          and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_roles' and cmd in ('INSERT','UPDATE','DELETE','ALL')),
      'profiles_role_writable', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'role')
          and has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE'),
      'profiles_role_in_fn', coalesce((select jsonb_agg(distinct p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prosrc ~* 'profiles[^;]{0,80}role'), '[]'::jsonb),
      'anon_tables', (select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'),
      'public_create', has_schema_privilege('anon', 'public', 'CREATE') or has_schema_privilege('authenticated', 'public', 'CREATE'),
      'secdef_no_path', coalesce((select jsonb_agg(p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), '[]'::jsonb)
    ),
    'anon_funcs', coalesce((select jsonb_agg(p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
          and has_function_privilege('anon', p.oid, 'execute')
          and p.proname not in ('add_public_inquiry','get_public_tracking','get_public_tracking_v2','line_stage_of')), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.owner_stats() from public, anon;
grant execute on function public.owner_stats() to authenticated;
-- ===== Rollback: drop function public.owner_stats(); =====

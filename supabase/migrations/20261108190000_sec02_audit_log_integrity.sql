drop policy if exists allow_authenticated_insert_audit_log on public.audit_log;
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;
revoke execute on function public.log_request_lines() from public, anon, authenticated;
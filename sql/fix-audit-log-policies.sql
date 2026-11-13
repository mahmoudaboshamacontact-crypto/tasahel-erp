-- fix-audit-log-policies.sql
-- بيشيل سياستين زودهم ملف part-k-audit-history.sql (اتشغّل بالغلط):
--   * allow_authenticated_insert_audit_log: أي مستخدم مسجّل يقدر يكتب سجل بأي محتوى (تزوير سجل الحركات)
--   * allow_authenticated_select_audit_log: مكررة، القراءة أصلاً مفتوحة بسياسة audit_select
-- اللي بيفضل: audit_select (قراءة) + staff_only (is_staff) + no_partner_all. الكتابة للموظفين بتفضل شغالة عن طريق staff_only.
-- idempotent: ممكن يتشغّل أكتر من مرة.
-- راجعه مع Claude قبل التشغيل، وبعده شغّل استعلام pg_policy تاني للتأكد.

drop policy if exists allow_authenticated_insert_audit_log on public.audit_log;
drop policy if exists allow_authenticated_select_audit_log on public.audit_log;

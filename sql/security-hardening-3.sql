-- أمان 3: تثبيت مكان البحث عن الجداول لدالة التتبع القديمة (بتشتغل بصلاحيات عالية). ما بيغيّر أي سلوك. آمن يتشغل أكتر من مرة.
alter function public.get_public_tracking(text) set search_path = public, pg_catalog;
-- ===== Rollback: alter function public.get_public_tracking(text) reset search_path; =====

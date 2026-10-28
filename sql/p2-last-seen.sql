-- P2 — تشغيل مرة واحدة في Supabase → SQL Editor. آمن لو اتشغل أكتر من مرة.
-- آخر ظهور للموظف: بيتسجل من دخول السيستم وأحداث فعلية (ضغط/كتابة/تعديل)، من غير أي تتبع للماوس أو الشاشة.

alter table public.profiles add column if not exists last_seen_at timestamptz;

create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;
revoke all on function public.touch_last_seen() from public;
grant execute on function public.touch_last_seen() to authenticated;

-- ===== Rollback =====
-- drop function if exists public.touch_last_seen();
-- alter table public.profiles drop column if exists last_seen_at;

-- P0 أمان — تشغيل مرة واحدة في Supabase → SQL Editor. آمن لو اتشغل أكتر من مرة.
-- 1) الحضور/الانصراف: الوقت من السيرفر (now()) بدل ساعة جهاز الموظف.
--    المدير بس يقدر يعدّل يدوي (hr.saveAtt) — الموظف العادي مايقدرش يغيّر الوقت أو اليوم أو صاحب السجل.
-- 2) تعليقات الطلبات: اسم وهوية الكاتب من الجلسة (auth.uid()) مش من المتصفح.

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'manager');
$$;
revoke all on function public.is_manager() from public;
grant execute on function public.is_manager() to authenticated;

-- ===== الحضور =====
create or replace function public.trg_attendance_server_time()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_manager() then return new; end if;  -- service role / مدير: تعديل يدوي مسموح
  if tg_op = 'INSERT' then
    new.user_id  := auth.uid();                                  -- الموظف يسجّل لنفسه بس
    new.day      := (now() at time zone 'Africa/Cairo')::date;
    new.check_in := now();
    new.check_out := null;
  else
    if old.user_id <> auth.uid() then raise exception 'not allowed'; end if;
    new.user_id := old.user_id; new.day := old.day; new.check_in := old.check_in;
    new.check_out := case when old.check_out is null then now() else old.check_out end;  -- الانصراف مرة واحدة
  end if;
  return new;
end $$;

drop trigger if exists attendance_server_time on public.hr_attendance;
create trigger attendance_server_time before insert or update on public.hr_attendance
for each row execute function public.trg_attendance_server_time();

-- ===== تعليقات الطلبات =====
create or replace function public.trg_comment_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- service role
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_name := coalesce(
      (select nullif(full_name, '') from public.profiles where id = auth.uid()),
      auth.jwt() ->> 'email', 'موظف');
  else  -- التعديل مايغيّرش الكاتب
    new.author_id := old.author_id; new.author_name := old.author_name;
  end if;
  return new;
end $$;

drop trigger if exists comment_author on public.tx_comments;
create trigger comment_author before insert or update on public.tx_comments
for each row execute function public.trg_comment_author();

-- ===== Rollback =====
-- drop trigger if exists attendance_server_time on public.hr_attendance;
-- drop trigger if exists comment_author on public.tx_comments;

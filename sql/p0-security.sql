-- P0 أمان — تشغيل مرة واحدة في Supabase → SQL Editor. آمن لو اتشغل أكتر من مرة.
-- 1) الحضور/الانصراف: الوقت من السيرفر (now()) بدل ساعة جهاز الموظف.
--    المدير بس يقدر يعدّل يدوي (hr.saveAtt) — الموظف العادي مايقدرش يغيّر الوقت أو اليوم أو صاحب السجل.
-- 2) تعليقات الطلبات: اسم وهوية الكاتب من الجلسة (auth.uid()) مش من المتصفح.

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role(), '') = 'manager';  -- الأدوار في user_roles وبترجع من my_role() (مش عمود في profiles)
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

-- ===== سياسات الحضور: "النهارده" بتوقيت القاهرة بدل CURRENT_DATE (UTC) =====
-- قبل كده تسجيل الحضور بين 12 بالليل و2/3 الفجر كان ممكن يترفض. باقي شروط السياسة زي ما هي بالظبط.
begin;
drop policy if exists hr_att_ins on public.hr_attendance;
create policy hr_att_ins on public.hr_attendance for insert to authenticated
  with check (hr_is_mgr() or (user_id = auth.uid() and hr_is_staff() and day = (now() at time zone 'Africa/Cairo')::date));

drop policy if exists hr_att_upd on public.hr_attendance;
create policy hr_att_upd on public.hr_attendance for update to authenticated
  using (hr_is_mgr() or (user_id = auth.uid() and hr_is_staff() and day = (now() at time zone 'Africa/Cairo')::date))
  with check (hr_is_mgr() or (user_id = auth.uid() and day = (now() at time zone 'Africa/Cairo')::date));
commit;

-- ===== Rollback =====
-- drop trigger if exists attendance_server_time on public.hr_attendance;
-- drop trigger if exists comment_author on public.tx_comments;
-- لإرجاع السياستين للأصل: نفس الأوامر فوق مع استبدال (now() at time zone 'Africa/Cairo')::date بـ current_date

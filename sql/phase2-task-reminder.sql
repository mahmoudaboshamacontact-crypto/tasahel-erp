-- تشغيل مرة واحدة في Supabase → SQL Editor. آمن لو اتشغل أكتر من مرة.
-- بيضيف ربط الإشعار بالمهمة + دالة "تذكير" بتتأكد إن المنفّذ مدير.
alter table public.notifications add column if not exists task_id uuid;

create or replace function public.remind_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare t record; me_name text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'manager') then
    raise exception 'not allowed';
  end if;
  select id, title, assignee_id, status into t from public.tasks where id = p_task;
  if t.id is null or t.status <> 'open' then raise exception 'task not open'; end if;
  select coalesce(full_name, 'المدير') into me_name from public.profiles where id = auth.uid();
  -- تذكير واحد مفتوح لكل مهمة (مفيش تكرار لو ضغط أكتر من مرة)
  delete from public.notifications where task_id = t.id and kind = 'task_remind' and read = false;
  insert into public.notifications (user_id, kind, title, body, task_id)
  values (t.assignee_id, 'task_remind', 'تذكير بمهمة', me_name || ' بيفكّرك بالمهمة: ' || t.title, t.id);
end $$;

revoke all on function public.remind_task(uuid) from public;
grant execute on function public.remind_task(uuid) to authenticated;

-- تحديث كاش PostgREST عشان الدالة الجديدة تظهر فوراً
notify pgrst, 'reload schema';

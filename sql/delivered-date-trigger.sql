-- التسليم الفعلي (delivered_date) + الملخص اليومي للمتأخرات (اختياري كـ trigger إضافي بجانب الكود الأمامي)
-- تشغيل مرة واحدة في Supabase → SQL Editor. آمن لو اتشغل أكتر من مرة.
-- يسجّل تاريخ التسليم الفعلي تلقائياً من هنا ورايح بس عند تحويل البند إلى Delivered، بدون أي تعديل على الداتا القديمة.

alter table public.request_lines add column if not exists delivered_date date;

create or replace function public.trg_set_delivered_date()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if (new.delivered is true or new.status = 'Delivered')
     and coalesce(old.delivered, false) is false
     and coalesce(old.status, '') <> 'Delivered'
     and new.delivered_date is null then
    new.delivered_date := (now() at time zone 'Africa/Cairo')::date;
  end if;
  return new;
end $$;

drop trigger if exists set_delivered_date_on_deliver on public.request_lines;
create trigger set_delivered_date_on_deliver
before update on public.request_lines
for each row execute function public.trg_set_delivered_date();

-- ===== Rollback =====
-- drop trigger if exists set_delivered_date_on_deliver on public.request_lines;
-- drop function if exists public.trg_set_delivered_date();

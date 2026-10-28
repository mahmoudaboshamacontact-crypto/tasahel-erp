-- P1-أ — تشغيل مرة واحدة في Supabase → SQL Editor. آمن لو اتشغل أكتر من مرة.
-- 1) رقم الخدمة اليدوي (Service ID) على مستوى كل بند.
-- 2) منع الخصم على "رسوم توصيل" على مستوى الداتابيز (مش بس الواجهة).
-- 3) نسبة الخصم لازم بين 0 و100.

alter table public.request_lines add column if not exists service_ref text;
create index if not exists request_lines_service_ref_idx on public.request_lines (service_ref) where service_ref is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'request_lines_discount_range') then
    alter table public.request_lines
      add constraint request_lines_discount_range check (discount_pct is null or (discount_pct >= 0 and discount_pct <= 100)) not valid;
  end if;
end $$;

create or replace function public.trg_no_fee_discount()
returns trigger language plpgsql set search_path = public as $$
begin
  if ltrim(coalesce(new.service, '')) like 'رسوم توصيل%' and coalesce(new.discount_pct, 0) > 0 then
    if coalesce(new.list_price, 0) > 0 then new.unit_price := new.list_price; end if;  -- رجّع السعر الأصلي
    new.discount_pct := 0;
  end if;
  return new;
end $$;

drop trigger if exists no_fee_discount on public.request_lines;
create trigger no_fee_discount before insert or update on public.request_lines
for each row execute function public.trg_no_fee_discount();

-- ===== Rollback =====
-- drop trigger if exists no_fee_discount on public.request_lines;
-- alter table public.request_lines drop constraint if exists request_lines_discount_range;
-- alter table public.request_lines drop column if exists service_ref;

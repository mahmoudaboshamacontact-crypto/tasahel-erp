-- الجزء ط: كتالوج الخدمات (مرحلة 5) — بيوسّع جدول services الموجود (مش بيعمل جدول جديد).
-- شغّله مرة واحدة في Supabase SQL Editor (idempotent). الصلاحيات الموجودة: قراءة للموظفين وتعديل للمدير فقط (security-hardening-2).
alter table public.services add column if not exists category text;
alter table public.services add column if not exists required_docs text;
alter table public.services add column if not exists priority smallint not null default 0;
alter table public.services add column if not exists renewal_of bigint references public.services(id) on delete set null;

-- حدود مفروضة من السيرفر (مش في الـ JS بس)
alter table public.services drop constraint if exists services_priority_chk;
alter table public.services add constraint services_priority_chk check (priority between 0 and 2);
alter table public.services drop constraint if exists services_duration_chk;
alter table public.services add constraint services_duration_chk check (duration_days is null or duration_days between 1 and 180) not valid;
alter table public.services drop constraint if exists services_catalog_len_chk;
alter table public.services add constraint services_catalog_len_chk check (char_length(coalesce(category,'')) <= 60 and char_length(coalesce(required_docs,'')) <= 600);
alter table public.services drop constraint if exists services_renewal_self_chk;
alter table public.services add constraint services_renewal_self_chk check (renewal_of is null or renewal_of <> id);

create index if not exists services_category_idx on public.services(category);

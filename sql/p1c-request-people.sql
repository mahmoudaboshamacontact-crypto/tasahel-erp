-- P1-ج — تشغيل مرة واحدة في Supabase → SQL Editor. آمن لو اتشغل أكتر من مرة.
-- request_people: مستفيدون إضافيون على الطلب، مع ربط اختياري ببند خدمة. مفيش تأثير على الإجماليات
-- (الإجماليات بتتحسب من request_lines بس، فمفيش عدّ مرتين). للموظفين بس، والشريك الخارجي مالوش وصول.

do $$
declare t text;
begin
  select format_type(atttypid, atttypmod) into t from pg_attribute
   where attrelid = 'public.request_lines'::regclass and attname = 'id' and not attisdropped;
  execute format($f$create table if not exists public.request_people (
      id bigint generated always as identity primary key,
      transaction_id text not null,
      line_id %s null,
      name text not null check (char_length(btrim(name)) between 1 and 120),
      phone text check (phone is null or char_length(phone) <= 30),
      created_at timestamptz not null default now(),
      created_by uuid default auth.uid())$f$, t);
end $$;

create index if not exists request_people_tx_idx on public.request_people (transaction_id);

alter table public.request_people enable row level security;
drop policy if exists rp_staff_all on public.request_people;
create policy rp_staff_all on public.request_people for all to authenticated
  using (is_staff()) with check (is_staff());

-- ===== Rollback =====
-- drop table if exists public.request_people;

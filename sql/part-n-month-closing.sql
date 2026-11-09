-- الجزء ن: اعتماد تقفيل الشهر (الكوميشن + المناديب) — sql/part-n-month-closing.sql
-- شغّله مرة واحدة في Supabase → SQL Editor (idempotent). مفيش بيانات بتتغير وقت التشغيل.
--
-- بيعمل:
--  1) جدول month_closings: نسخة ثابتة من أرقام التقفيل (للمدير فقط، القراءة مباشرة، والكتابة عن طريق دوال فقط).
--  2) close_month(...): بيراجع الأرقام على السيرفر (عدد البنود وإجمالي المبيعات) وبعدين يقفل الفترة.
--  3) reopen_month_closing(...): إعادة فتح بسبب مكتوب (السجل يفضل محفوظ).
--  4) trigger على request_lines: يمنع تغيير بنود فترة معتمدة (الموظف، الخدمة، الكمية، المبلغ، العمولة، التاريخ،
--     رقم المعاملة، الحذف/الاسترجاع، أو إضافة بند بتاريخ جوه الفترة). مسموح: تعديل بنود «رسوم التوصيل»
--     (ليها تقفيل أسبوعي)، وتغيير الحالة والتسليم وبيانات العميل
--     والتثبيت، والأرشفة (البند بيتنقل لجدول الأرشيف) والمسح النهائي من سلة المحذوفات (بنود محذوفة أصلاً).
-- الاستردادات المعتمدة بعد التقفيل بتتحسب في الشهر اللي بعده (بتاريخ القرار) ومش بتتأثر بالقفل.
-- للتراجع الكامل: الأوامر في آخر الملف.

create table if not exists public.month_closings (
  id uuid primary key default gen_random_uuid(),
  period_from date not null,
  period_to date not null,
  summary jsonb not null,
  lines_count integer not null,
  items_sales numeric not null,
  note text,
  closed_by uuid not null default auth.uid(),
  closed_by_name text,
  closed_at timestamptz not null default now(),
  reopened_at timestamptz,
  reopened_by uuid,
  reopen_reason text,
  constraint month_closings_range check (period_to >= period_from and period_to - period_from <= 62)
);
create index if not exists month_closings_active_idx on public.month_closings (period_from, period_to) where reopened_at is null;

alter table public.month_closings enable row level security;
revoke all on table public.month_closings from public, anon, authenticated;
grant select on table public.month_closings to authenticated;
drop policy if exists mc_select_mgr on public.month_closings;
create policy mc_select_mgr on public.month_closings
  for select to authenticated
  using ((select public.is_manager()));

-- ---------- اعتماد التقفيل ----------
create or replace function public.close_month(p_from date, p_to date, p_summary jsonb, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_from date;
  v_cnt integer; v_sum numeric;
  v_name text; v_id uuid;
begin
  if not public.is_manager() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'فترة غير صحيحة'; end if;
  if p_to - p_from > 62 then raise exception 'الفترة أطول من اللازم (الحد الأقصى 62 يوم)'; end if;
  if p_to >= v_today then raise exception 'مينفعش تعتمد فترة لسه ما خلصتش (آخر يوم لازم يكون قبل النهارده)'; end if;
  if p_summary is null or jsonb_typeof(p_summary) <> 'object' or pg_column_size(p_summary) > 400000 then
    raise exception 'ملخص غير صالح';
  end if;
  if exists (select 1 from public.month_closings c
              where c.reopened_at is null and daterange(c.period_from, c.period_to, '[]') && daterange(p_from, p_to, '[]')) then
    raise exception 'فيه تقفيل معتمد بيتداخل مع الفترة دي. افتح القديم الأول.';
  end if;

  -- مراجعة السيرفر: نفس قاعدة الشاشة (بنود غير محذوفة، من غير «رسوم توصيل»)
  v_from := greatest(p_from, coalesce((p_summary->>'data_from')::date, p_from));
  select count(*), coalesce(sum(total), 0) into v_cnt, v_sum
    from public.request_lines
   where deleted_at is null
     and received_at >= v_from::timestamp and received_at < (p_to + 1)::timestamp
     and coalesce(service, '') !~ '^\s*رسوم\s+توصيل';
  if v_cnt <> coalesce((p_summary->>'lines_count')::integer, -1)
     or abs(v_sum - coalesce((p_summary->>'items_sales')::numeric, -1)) > 0.01 then
    raise exception 'الأرقام على الشاشة مش مطابقة للسيرفر (الشاشة: % بند / % ، السيرفر: % بند / %). اعمل تحديث وجرّب تاني.',
      coalesce(p_summary->>'lines_count', '?'), coalesce(p_summary->>'items_sales', '?'), v_cnt, v_sum;
  end if;

  begin
    select full_name into v_name from public.profiles where id = auth.uid();
  exception when others then v_name := null;
  end;

  insert into public.month_closings (period_from, period_to, summary, lines_count, items_sales, note, closed_by_name)
  values (p_from, p_to, p_summary, v_cnt, v_sum, nullif(left(btrim(coalesce(p_note, '')), 300), ''), v_name)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.close_month(date, date, jsonb, text) from public, anon;
grant execute on function public.close_month(date, date, jsonb, text) to authenticated;

-- ---------- إعادة فتح ----------
create or replace function public.reopen_month_closing(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_manager() then raise exception 'not allowed' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'اكتب سبب إعادة الفتح (5 حروف على الأقل)'; end if;
  update public.month_closings
     set reopened_at = now(), reopened_by = auth.uid(), reopen_reason = left(btrim(p_reason), 300)
   where id = p_id and reopened_at is null;
  if not found then raise exception 'التقفيل ده مش موجود أو مفتوح بالفعل'; end if;
end $$;
revoke all on function public.reopen_month_closing(uuid, text) from public, anon;
grant execute on function public.reopen_month_closing(uuid, text) to authenticated;

-- ---------- القفل على بنود الفترة المعتمدة ----------
create or replace function public.trg_lock_closed_month()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_d1 date; v_d2 date;
  v_fee text := '^\s*رسوم\s+توصيل';  -- بنود رسوم التوصيل ليها تقفيل أسبوعي منفصل، مش داخلة في أرقام الشهر
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is not null or new.received_at is null or coalesce(new.service, '') ~ v_fee then return null; end if;
    v_d1 := new.received_at::date;
  elsif tg_op = 'DELETE' then
    if old.deleted_at is not null or old.received_at is null or coalesce(old.service, '') ~ v_fee then return null; end if;
    -- الأرشفة: البند اتنقل لجدول الأرشيف (محفوظ) فمسموح
    if to_regclass('public.request_lines_archive') is not null
       and exists (select 1 from public.request_lines_archive a where a.id = old.id) then
      return null;
    end if;
    v_d1 := old.received_at::date;
  else
    if old.deleted_at is not null and new.deleted_at is not null then return null; end if;
    if coalesce(old.service, '') ~ v_fee and coalesce(new.service, '') ~ v_fee then return null; end if;
    if new.employee is not distinct from old.employee
       and new.service is not distinct from old.service
       and new.qty is not distinct from old.qty
       and new.total is not distinct from old.total
       and new.commission is not distinct from old.commission
       and new.commission_per_unit is not distinct from old.commission_per_unit
       and new.received_at is not distinct from old.received_at
       and new.transaction_id is not distinct from old.transaction_id
       and new.deleted_at is not distinct from old.deleted_at then
      return null;  -- تغيير مش بيأثر على أرقام التقفيل (حالة، تسليم، بيانات عميل، تثبيت...)
    end if;
    v_d1 := old.received_at::date; v_d2 := new.received_at::date;
  end if;

  if exists (
    select 1 from public.month_closings c
     where c.reopened_at is null
       and ((v_d1 between c.period_from and c.period_to) or (v_d2 between c.period_from and c.period_to))
  ) then
    raise exception 'الفترة دي معتمدة ومقفولة: مينفعش تعديل أرقام بنودها. اطلب من المدير إعادة فتح التقفيل.' using errcode = 'P0001';
  end if;
  return null;
end $$;
revoke all on function public.trg_lock_closed_month() from public, anon, authenticated;

drop trigger if exists lock_closed_month_trg on public.request_lines;
create trigger lock_closed_month_trg
after insert or update or delete on public.request_lines
for each row execute function public.trg_lock_closed_month();

-- ===== Rollback (لو احتجت تلغي كل ده) =====
-- drop trigger if exists lock_closed_month_trg on public.request_lines;
-- drop function if exists public.trg_lock_closed_month();
-- drop function if exists public.reopen_month_closing(uuid, text);
-- drop function if exists public.close_month(date, date, jsonb, text);
-- drop table if exists public.month_closings;

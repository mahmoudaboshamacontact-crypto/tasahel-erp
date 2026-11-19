-- =====================================================================
-- الجزء ب: المرحلة 4 متابعة الشغل (11، 12، 13، 15، 17، 18، 19)
-- الملف: sql/part-b-work-tracking.sql
-- قابل لإعادة التشغيل بأمان (Idempotent). شغّله في Supabase SQL Editor قبل رفع js/51.
-- ملاحظة أمنية: لا يلمس سياسات allow_select_* أو staff_only أو no_partner_all على الجداول الحالية.
-- =====================================================================

-- 1) تثبيت المعاملات المهمة (17): أعمدة التثبيت على request_lines
alter table public.request_lines add column if not exists is_pinned boolean not null default false;
alter table public.request_lines add column if not exists pinned_at timestamptz;
alter table public.request_lines add column if not exists pinned_by uuid;

create index if not exists request_lines_pinned_idx
  on public.request_lines (transaction_id, is_pinned)
  where is_pinned = true and deleted_at is null;

-- دالة لتثبيت أو إلغاء تثبيت كل بنود معاملة معينة (للموظفين والمدير فقط)
create or replace function public.toggle_pin_tx(p_tx text, p_pin boolean default true)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_cnt integer := 0;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_tx is null or btrim(p_tx) = '' then
    raise exception 'transaction_id required' using errcode = '22023';
  end if;

  update public.request_lines
     set is_pinned = coalesce(p_pin, false),
         pinned_at = case when coalesce(p_pin, false) then now() else null end,
         pinned_by = case when coalesce(p_pin, false) then v_uid else null end
   where transaction_id = btrim(p_tx)
     and deleted_at is null;

  get diagnostics v_cnt = row_count;
  return v_cnt;
end $$;

revoke all on function public.toggle_pin_tx(text, boolean) from public, anon;
grant execute on function public.toggle_pin_tx(text, boolean) to authenticated;

-- 2) جدول الإجازات الرسمية لحاسبة موعد التسليم (13) لو مش موجود
create table if not exists public.holidays (
  id bigint generated always as identity primary key,
  day date not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

alter table public.holidays add column if not exists day date;
alter table public.holidays add column if not exists title text;
alter table public.holidays add column if not exists created_at timestamptz not null default now();
alter table public.holidays add column if not exists created_by uuid default auth.uid();

alter table public.holidays enable row level security;
revoke all on table public.holidays from public, anon;
grant select, insert, update, delete on table public.holidays to authenticated;

drop policy if exists holidays_read on public.holidays;
create policy holidays_read on public.holidays
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists holidays_write on public.holidays;
create policy holidays_write on public.holidays
  for all to authenticated
  using ((select public.is_manager()))
  with check ((select public.is_manager()));

-- 3) جدول ملاحظات تسليم الوردية (18)
create table if not exists public.shift_handover_notes (
  id bigint generated always as identity primary key,
  shift_date date not null default ((now() at time zone 'Africa/Cairo')::date),
  shift_type text not null default 'صباحية' check (shift_type in ('صباحية', 'مسائية', 'ليلية', 'عام')),
  author_id uuid not null default auth.uid(),
  author_name text not null default 'موظف',
  summary text not null check (char_length(btrim(summary)) between 1 and 2000),
  pending_txs text[] not null default '{}',
  acknowledged_by uuid,
  acknowledged_name text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists shift_handover_notes_date_idx
  on public.shift_handover_notes (shift_date desc, created_at desc);

create or replace function public.trg_shift_handover_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then return new; end if;
  if tg_op = 'INSERT' then
    new.author_id := v_uid;
    new.author_name := coalesce(
      (select nullif(btrim(full_name), '') from public.profiles where id = v_uid),
      auth.jwt() ->> 'email',
      'موظف'
    );
    if new.shift_date is null then
      new.shift_date := (now() at time zone 'Africa/Cairo')::date;
    end if;
  else
    new.author_id := old.author_id;
    new.author_name := old.author_name;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

drop trigger if exists shift_handover_author_trg on public.shift_handover_notes;
create trigger shift_handover_author_trg
before insert or update on public.shift_handover_notes
for each row execute function public.trg_shift_handover_author();

alter table public.shift_handover_notes enable row level security;
revoke all on table public.shift_handover_notes from public, anon;
grant select, insert, update, delete on table public.shift_handover_notes to authenticated;

drop policy if exists shn_select_staff on public.shift_handover_notes;
create policy shn_select_staff on public.shift_handover_notes
  for select to authenticated
  using ((select auth.uid()) is not null and (select public.is_staff()));

drop policy if exists shn_insert_staff on public.shift_handover_notes;
create policy shn_insert_staff on public.shift_handover_notes
  for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and author_id = (select auth.uid())
    and (select public.is_staff())
  );

drop policy if exists shn_update_staff on public.shift_handover_notes;
create policy shn_update_staff on public.shift_handover_notes
  for update to authenticated
  using (
    (select auth.uid()) is not null
    and ((select public.is_manager()) or author_id = (select auth.uid()) or (select public.is_staff()))
  )
  with check (
    (select auth.uid()) is not null
    and (select public.is_staff())
  );

drop policy if exists shn_delete_mgr_or_own on public.shift_handover_notes;
create policy shn_delete_mgr_or_own on public.shift_handover_notes
  for delete to authenticated
  using (
    (select auth.uid()) is not null
    and ((select public.is_manager()) or author_id = (select auth.uid()))
  );

-- دالة لتأكيد استلام الوردية بواسطة الموظف التالي
create or replace function public.acknowledge_shift_note(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text;
  v_row public.shift_handover_notes;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  select coalesce(nullif(btrim(full_name), ''), auth.jwt() ->> 'email', 'موظف')
    into v_name
    from public.profiles
   where id = v_uid;

  update public.shift_handover_notes
     set acknowledged_by = v_uid,
         acknowledged_name = coalesce(v_name, 'موظف'),
         acknowledged_at = now()
   where id = p_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'note not found' using errcode = 'P0002';
  end if;

  return to_jsonb(v_row);
end $$;

revoke all on function public.acknowledge_shift_note(bigint) from public, anon;
revoke all on function public.trg_shift_handover_author() from public, anon;
grant execute on function public.acknowledge_shift_note(bigint) to authenticated;

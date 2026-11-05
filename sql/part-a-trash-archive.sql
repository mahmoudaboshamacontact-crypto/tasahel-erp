-- =====================================================================
-- الجزء أ: سلة المحذوفات (98) + الأرشفة (96)  —  sql/part-a-trash-archive.sql
-- قابل لإعادة التشغيل بأمان. شغّله في Supabase SQL Editor قبل رفع js/50.
-- ملاحظة: سياسة allow_select_rl بتخفي المحذوف عن الكل، عشان كده السلة بدوال
-- security definer للمدير بس (مع set search_path).
-- =====================================================================

create index if not exists request_lines_deleted_at_idx
  on public.request_lines (deleted_at) where deleted_at is not null;

-- ---------- سلة المحذوفات ----------
create or replace function public.trash_list()
returns table (id bigint, transaction_id text, client_name text, service text,
               qty numeric, total numeric, employee text, received_at timestamp, deleted_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'manager only'; end if;
  return query
    select l.id, l.transaction_id, l.client_name, l.service, l.qty, l.total, l.employee, l.received_at, l.deleted_at
    from public.request_lines l
    where l.deleted_at is not null and l.deleted_at > now() - interval '30 days'
    order by l.deleted_at desc limit 500;
end $$;

create or replace function public.trash_restore(ids bigint[])
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_manager() then raise exception 'manager only'; end if;
  update public.request_lines set deleted_at = null
   where id = any(ids) and deleted_at is not null;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.trash_purge()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_manager() then raise exception 'manager only'; end if;
  delete from public.request_lines where deleted_at is not null and deleted_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- الأرشفة ----------
create table if not exists public.request_lines_archive (like public.request_lines including defaults);
alter table public.request_lines_archive add column if not exists archived_at timestamptz not null default now();
create unique index if not exists request_lines_archive_id_uq on public.request_lines_archive (id);
alter table public.request_lines_archive enable row level security;
drop policy if exists archive_select_mgr on public.request_lines_archive;
create policy archive_select_mgr on public.request_lines_archive
  for select using ((select public.is_manager()));

create or replace function public.archive_preview(cutoff date)
returns integer
language plpgsql stable security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_manager() then raise exception 'manager only'; end if;
  select count(*) into n from public.request_lines where received_at < cutoff and deleted_at is null;
  return n;
end $$;

create or replace function public.archive_old_lines(cutoff date)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_manager() then raise exception 'manager only'; end if;
  if cutoff > (current_date - 90) then raise exception 'cutoff must be at least 90 days old'; end if;
  insert into public.request_lines_archive
    select l.*, now() from public.request_lines l
    where l.received_at < cutoff and l.deleted_at is null
    on conflict (id) do nothing;
  delete from public.request_lines l
   where l.received_at < cutoff and l.deleted_at is null
     and exists (select 1 from public.request_lines_archive a where a.id = l.id);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.trash_list(), public.trash_restore(bigint[]), public.trash_purge(),
  public.archive_preview(date), public.archive_old_lines(date) from public, anon;
grant execute on function public.trash_list(), public.trash_restore(bigint[]), public.trash_purge(),
  public.archive_preview(date), public.archive_old_lines(date) to authenticated;

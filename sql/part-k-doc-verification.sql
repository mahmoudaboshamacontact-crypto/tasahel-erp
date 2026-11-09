-- =====================================================================
-- الجزء ك: مراجعة المستندات الذكية (Smart Document Verification)
-- sql/part-k-doc-verification.sql
-- قابل لإعادة التشغيل بأمان (idempotent).
-- صلاحيات: إعداد القوائم للمدير فقط، وفحص المستندات للموظفين والمدير.
-- =====================================================================

-- 1. جدول قوالب الفحص لكل خدمة (يتحكم فيه المدير فقط)
create table if not exists public.service_doc_checklists (
  id bigserial primary key,
  service_name text not null,
  item_title text not null,
  check_validity boolean not null default true,
  check_stamp boolean not null default true,
  check_match boolean not null default true,
  is_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists service_doc_checklists_svc_idx 
  on public.service_doc_checklists (service_name);

-- 2. جدول نتائج الفحص لكل بند معاملة (request_lines)
create table if not exists public.request_line_doc_verifications (
  id bigserial primary key,
  line_id bigint not null references public.request_lines(id) on delete cascade,
  checklist_id bigint references public.service_doc_checklists(id) on delete set null,
  item_title text not null,
  is_present boolean not null default false,
  is_valid boolean not null default false,
  is_stamped boolean not null default false,
  is_matched boolean not null default false,
  status text not null default 'pending', -- 'pending', 'passed', 'missing', 'rejected'
  notes text,
  verified_by text,
  verified_at timestamptz not null default now()
);

create index if not exists line_doc_verifications_line_idx 
  on public.request_line_doc_verifications (line_id);

-- 3. تفعيل الأمان RLS
alter table public.service_doc_checklists enable row level security;
alter table public.request_line_doc_verifications enable row level security;

-- سياسات service_doc_checklists: قراءة للجميع، تعديل للمدير فقط
drop policy if exists sdc_select_auth on public.service_doc_checklists;
create policy sdc_select_auth on public.service_doc_checklists
  for select using (auth.role() = 'authenticated');

drop policy if exists sdc_modify_mgr on public.service_doc_checklists;
create policy sdc_modify_mgr on public.service_doc_checklists
  for all using ((select public.is_manager()))
  with check ((select public.is_manager()));

-- سياسات request_line_doc_verifications: قراءة وكتابة للموظفين، وحذف للمدير فقط
drop policy if exists rldv_select_auth on public.request_line_doc_verifications;
create policy rldv_select_auth on public.request_line_doc_verifications
  for select using (auth.role() = 'authenticated');

drop policy if exists rldv_ins_upd_auth on public.request_line_doc_verifications;
create policy rldv_ins_upd_auth on public.request_line_doc_verifications
  for insert with check (auth.role() = 'authenticated');

drop policy if exists rldv_upd_auth on public.request_line_doc_verifications;
create policy rldv_upd_auth on public.request_line_doc_verifications
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists rldv_del_mgr on public.request_line_doc_verifications;
create policy rldv_del_mgr on public.request_line_doc_verifications
  for delete using ((select public.is_manager()));

-- 4. دالة التحقق من استيفاء جميع المستندات المطلوبة للبند
create or replace function public.is_line_docs_cleared(p_line_id bigint)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_svc text;
  v_req_count integer := 0;
  v_passed_count integer := 0;
begin
  select service into v_svc from public.request_lines where id = p_line_id;
  if v_svc is null then return true; end if;

  -- عدد البنود الإلزامية المشترطة لهذه الخدمة
  select count(*) into v_req_count 
  from public.service_doc_checklists 
  where service_name = v_svc and is_required = true;

  if v_req_count = 0 then return true; end if;

  -- عدد البنود الإلزامية التي اجتازت الفحص بالكامل
  select count(*) into v_passed_count
  from public.request_line_doc_verifications v
  join public.service_doc_checklists c on v.checklist_id = c.id
  where v.line_id = p_line_id and c.is_required = true and v.status = 'passed';

  return (v_passed_count >= v_req_count);
end $$;

grant execute on function public.is_line_docs_cleared(bigint) to authenticated;

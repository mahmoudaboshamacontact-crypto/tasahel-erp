-- =====================================================================
-- sql/fix-rls-internal-tables.sql  (إصلاح صلاحيات الجداول الداخلية الجديدة)
-- يُشغَّل في Supabase SQL Editor *بعد* part-k-doc-verification.sql و part-l-erp-features-suite.sql و courier-portal.sql
-- قابل لإعادة التشغيل (Idempotent).
--
-- المشكلة: السياسات كانت auth.role() = 'authenticated' يعني أي حساب مسجّل (مندوب/شريك/منفّذ) يقرأ ويكتب
--          ملاحظات العملاء وسجل المراحل ونتائج فحص المستندات، وكانت دوال SECURITY DEFINER من غير تحقق دور.
-- الحل:
--  1) دالة is_internal_user(): موظف أو مدير فقط (مش مندوب ولا شريك).
--  2) القراءة والإضافة للموظفين الداخليين فقط. تعديل ملاحظة العميل لصاحبها أو للمدير.
--  3) سجل المراحل ونتائج فحص المستندات بتتكتب عن طريق RPC واحدة atomic (مفيش كتابة مباشرة من المتصفح).
--  4) is_line_docs_cleared / get_customer_360_profile: تحقق دور + revoke من PUBLIC/anon.
--  5) إعادة تشغيل سياسة courier_block على كل الجداول (علشان الجداول اللي اتعملت بعد courier-portal.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) مساعد الدور: موظف داخلي أو مدير فقط
-- ---------------------------------------------------------------------
create or replace function public.is_internal_user()
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and not coalesce((select ur.role in ('courier', 'partner') from public.user_roles ur where ur.user_id = auth.uid() limit 1), false)
     and (coalesce(public.is_manager(), false) or coalesce(public.is_staff(), false))
$$;
revoke all on function public.is_internal_user() from public, anon;
grant execute on function public.is_internal_user() to authenticated;

-- اسم المستخدم الحالي من profiles (بدل ما نصدّق الاسم اللي جاي من المتصفح)
create or replace function public.current_staff_name()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim((select p.full_name from public.profiles p where p.id = auth.uid())), ''), 'موظف')
$$;
revoke all on function public.current_staff_name() from public, anon;
grant execute on function public.current_staff_name() to authenticated;

-- ---------------------------------------------------------------------
-- 2) service_workflow_stages / service_doc_checklists: قراءة للداخليين فقط (التعديل للمدير زي ما هو)
-- ---------------------------------------------------------------------
drop policy if exists sws_select_auth on public.service_workflow_stages;
create policy sws_select_auth on public.service_workflow_stages
  for select to authenticated using ((select public.is_internal_user()));

drop policy if exists sdc_select_auth on public.service_doc_checklists;
create policy sdc_select_auth on public.service_doc_checklists
  for select to authenticated using ((select public.is_internal_user()));

-- ---------------------------------------------------------------------
-- 3) سجل المراحل: قراءة للداخليين، والكتابة عن طريق RPC فقط
-- ---------------------------------------------------------------------
drop policy if exists rlsh_select_auth on public.request_line_stage_history;
create policy rlsh_select_auth on public.request_line_stage_history
  for select to authenticated using ((select public.is_internal_user()));

drop policy if exists rlsh_ins_auth on public.request_line_stage_history;   -- ما فيش insert مباشر

-- عمود المرحلة الحالية للبند (الواجهة كانت بتكتب فيه من غير ما يكون معرّف في أي ملف SQL، فالتحديث كان بيفشل بصمت)
alter table public.request_lines add column if not exists stage text;

create or replace function public.workflow_advance_line(
  p_line_id bigint,
  p_next_stage text,
  p_notes text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_line public.request_lines;
  v_next text := btrim(coalesce(p_next_stage, ''));
  v_from text;
  v_role text;
  v_has_stages boolean;
  v_allowed boolean;
begin
  if not public.is_internal_user() then raise exception 'staff only' using errcode = '42501'; end if;
  if v_next = '' or char_length(v_next) > 120 then raise exception 'المرحلة غير صالحة' using errcode = '22023'; end if;

  select * into v_line from public.request_lines where id = p_line_id and deleted_at is null for update;
  if v_line.id is null then raise exception 'البند غير موجود' using errcode = '22023'; end if;

  v_from := coalesce(v_line.stage, 'بداية');
  if v_from = v_next then raise exception 'البند بالفعل في المرحلة دي' using errcode = '22023'; end if;

  -- لو للخدمة مراحل معرّفة: المرحلة الجديدة لازم تكون منها، ودور المستخدم لازم يكون مسموح له بها
  select exists (select 1 from public.service_workflow_stages where service_name = v_line.service) into v_has_stages;
  if v_has_stages then
    v_role := coalesce(public.my_role(), '');
    select exists (
      select 1 from public.service_workflow_stages s
       where s.service_name = v_line.service and s.stage_name = v_next
         and (v_role = 'manager' or v_role = any (s.allowed_roles))
    ) into v_allowed;
    if not v_allowed then
      raise exception 'المرحلة دي غير معرّفة للخدمة أو غير مسموحة لدورك' using errcode = '42501';
    end if;
  end if;

  update public.request_lines set stage = v_next where id = v_line.id;

  insert into public.request_line_stage_history (line_id, stage_from, stage_to, changed_by, notes)
  values (v_line.id, v_from, v_next, public.current_staff_name(), nullif(btrim(coalesce(p_notes, '')), ''));

  return jsonb_build_object('ok', true, 'line_id', v_line.id, 'stage_from', v_from, 'stage_to', v_next);
end;
$$;
revoke all on function public.workflow_advance_line(bigint, text, text) from public, anon;
grant execute on function public.workflow_advance_line(bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4) فحص المستندات: قراءة للداخليين، والكتابة RPC واحدة (حذف + إدخال في transaction واحدة)
-- ---------------------------------------------------------------------
drop policy if exists rldv_select_auth on public.request_line_doc_verifications;
create policy rldv_select_auth on public.request_line_doc_verifications
  for select to authenticated using ((select public.is_internal_user()));

drop policy if exists rldv_ins_upd_auth on public.request_line_doc_verifications;
drop policy if exists rldv_upd_auth on public.request_line_doc_verifications;
-- (rldv_del_mgr للمدير فقط بتفضل زي ما هي)

create or replace function public.save_line_doc_verifications(p_line_id bigint, p_records jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
  v_name text := public.current_staff_name();
begin
  if not public.is_internal_user() then raise exception 'staff only' using errcode = '42501'; end if;
  if not exists (select 1 from public.request_lines where id = p_line_id and deleted_at is null) then
    raise exception 'البند غير موجود' using errcode = '22023';
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'بيانات الفحص غير صالحة' using errcode = '22023';
  end if;
  if jsonb_array_length(p_records) > 100 then
    raise exception 'عدد بنود الفحص أكبر من المسموح' using errcode = '22023';
  end if;

  -- كله أو مفيش: لو الإدخال فشل بعد الحذف، الحذف بيترجع تلقائيًا
  delete from public.request_line_doc_verifications where line_id = p_line_id;

  insert into public.request_line_doc_verifications (
    line_id, checklist_id, item_title, is_present, is_valid, is_stamped, is_matched, status, notes, verified_by, verified_at
  )
  select p_line_id,
         (select c.id from public.service_doc_checklists c where c.id = x.checklist_id),
         left(btrim(x.item_title), 200),
         coalesce(x.is_present, false), coalesce(x.is_valid, false), coalesce(x.is_stamped, false), coalesce(x.is_matched, false),
         -- الحالة بتتحسب في السيرفر من العلامات (مش من المتصفح)
         case when coalesce(x.is_present, false) and coalesce(x.is_valid, false) and coalesce(x.is_stamped, false) and coalesce(x.is_matched, false) then 'passed'
              when not coalesce(x.is_present, false) then 'missing'
              else 'rejected' end,
         nullif(left(btrim(coalesce(x.notes, '')), 500), ''),
         v_name,
         now()
    from jsonb_to_recordset(p_records) as x(checklist_id bigint, item_title text, is_present boolean, is_valid boolean,
                                           is_stamped boolean, is_matched boolean, notes text)
   where btrim(coalesce(x.item_title, '')) <> '';
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'saved', v_n);
end;
$$;
revoke all on function public.save_line_doc_verifications(bigint, jsonb) from public, anon;
grant execute on function public.save_line_doc_verifications(bigint, jsonb) to authenticated;

-- نتيجة الفحص: تحقق دور (كانت SECURITY DEFINER من غير أي تحقق) + revoke من PUBLIC/anon
create or replace function public.is_line_docs_cleared(p_line_id bigint)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_svc text;
  v_req_count integer := 0;
  v_passed_count integer := 0;
begin
  if not public.is_internal_user() then raise exception 'staff only' using errcode = '42501'; end if;
  select service into v_svc from public.request_lines where id = p_line_id;
  if v_svc is null then return true; end if;

  select count(*) into v_req_count from public.service_doc_checklists
   where service_name = v_svc and is_required = true;
  if v_req_count = 0 then return true; end if;

  select count(*) into v_passed_count
    from public.request_line_doc_verifications v
    join public.service_doc_checklists c on v.checklist_id = c.id
   where v.line_id = p_line_id and c.is_required = true and v.status = 'passed';

  return (v_passed_count >= v_req_count);
end $$;
revoke all on function public.is_line_docs_cleared(bigint) from public, anon;
grant execute on function public.is_line_docs_cleared(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 5) ملاحظات العميل 360: قراءة/إضافة للداخليين، تعديل لصاحب الملاحظة أو المدير، والهوية من السيرفر
-- ---------------------------------------------------------------------
alter table public.client_360_notes add column if not exists created_by_uid uuid;

create or replace function public.client_360_notes_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_uid := auth.uid();
    new.created_by := public.current_staff_name();
    new.created_at := now();
  else
    -- الهوية والرقم وتاريخ الإنشاء ما يتغيروش بالتعديل
    new.created_by_uid := old.created_by_uid;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.phone := old.phone;
  end if;
  return new;
end;
$$;
revoke all on function public.client_360_notes_guard() from public, anon, authenticated;
drop trigger if exists client_360_notes_guard_trg on public.client_360_notes;
create trigger client_360_notes_guard_trg before insert or update on public.client_360_notes
  for each row execute function public.client_360_notes_guard();

drop policy if exists c360_select_auth on public.client_360_notes;
create policy c360_select_auth on public.client_360_notes
  for select to authenticated using ((select public.is_internal_user()));

drop policy if exists c360_ins_auth on public.client_360_notes;
create policy c360_ins_auth on public.client_360_notes
  for insert to authenticated with check ((select public.is_internal_user()));

drop policy if exists c360_upd_auth on public.client_360_notes;
create policy c360_upd_auth on public.client_360_notes
  for update to authenticated
  using ((select public.is_internal_user()) and (created_by_uid = (select auth.uid()) or (select public.is_manager())))
  with check ((select public.is_internal_user()) and (created_by_uid = (select auth.uid()) or (select public.is_manager())));
-- مفيش policy للحذف = ممنوع من المتصفح

-- ---------------------------------------------------------------------
-- 6) get_customer_360_profile: تعريف واحد نهائي بتحقق دور داخلي (كان فيه تعريفين في ملفين مختلفين)
-- ---------------------------------------------------------------------
create or replace function public.get_customer_360_profile(p_phone text)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_res json;
  v_clean_phone text;
begin
  if not public.is_internal_user() then raise exception 'staff only' using errcode = '42501'; end if;
  v_clean_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_clean_phone) < 7 then raise exception 'رقم الهاتف غير صالح' using errcode = '22023'; end if;
  if length(v_clean_phone) >= 10 and left(v_clean_phone, 2) = '01' then
    v_clean_phone := right(v_clean_phone, 10);
  end if;

  select json_build_object(
    'phone', p_phone,
    'total_orders', count(distinct transaction_id),
    'total_lines', count(id),
    'total_spent', coalesce(sum(total), 0),
    'first_seen', min(received_at),
    'last_seen', max(received_at),
    'services_used', coalesce(json_agg(distinct service) filter (where service is not null), '[]'::json),
    'active_orders', count(id) filter (where status in ('Under Review', 'In Progress', 'Pending Exec', 'Pending Client')),
    'delivered_orders', count(id) filter (where status in ('Delivered', 'Complete'))
  ) into v_res
  from public.request_lines
  where regexp_replace(coalesce(phone, ''), '\D', '', 'g') like '%' || v_clean_phone || '%'
    and deleted_at is null;

  return v_res;
end $$;
revoke all on function public.get_customer_360_profile(text) from public, anon;
grant execute on function public.get_customer_360_profile(text) to authenticated;

-- ---------------------------------------------------------------------
-- 7) إعادة تطبيق قفل المندوب على كل الجداول (يشمل الجداول اللي اتعملت بعد courier-portal.sql)
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    execute format('drop policy if exists courier_block on public.%I', t.relname);
    execute format(
      'create policy courier_block on public.%I as restrictive for all to authenticated using (not (select public.is_courier())) with check (not (select public.is_courier()))',
      t.relname);
  end loop;
end $$;

-- تحقق بعد التشغيل:
--  (أ) جداول من غير RLS:   select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
--                           where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
--  (ب) سياسات المستوى "authenticated" المفتوحة:  select tablename, policyname, qual from pg_policies
--                           where schemaname='public' and (qual like '%auth.role()%' or with_check like '%auth.role()%');
--  (ج) سياسة no_partner_all موجودة فعلًا؟:  select tablename from pg_policies where policyname='no_partner_all';

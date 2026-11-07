-- =====================================================================
-- إصلاحات المراجعة النهائية (sql/final-audit-fixes.sql) — Idempotent
-- 1) دوال بوابة المنفذ (security definer) كانت بتقرا/ترجع بنود وتعليقات محذوفة (سلة المحذوفات) → اتقفلت.
-- 2) remind_task: ما تذكّرش بمهمة محذوفة.
-- 3) error_log: لو كان موجود من نسخة قديمة بأعمدة NOT NULL غريبة، بنشيل القيد عشان الإدخال مايفشلش.
-- ملاحظة: الدوال دي بنفس تعريفها القديم بالظبط + شرط deleted_at is null بس.
-- =====================================================================

create or replace function public.get_partner_requests(p_partner_uid uuid default null, p_limit int default 20, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_role text := coalesce(public.my_role(), '');
  v_uid  uuid;
  v_name text;
  v_lim  int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_off  int := greatest(coalesce(p_offset, 0), 0);
  v_total int;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_role = 'manager' and p_partner_uid is not null then v_uid := p_partner_uid;
  elsif v_role = 'partner' then v_uid := auth.uid();   -- المنفذ مايقدرش يطلب بيانات غيره
  else raise exception 'forbidden' using errcode = '42501'; end if;

  select nullif(btrim(partner_name), '') into v_name from public.user_roles where user_id = v_uid;
  if v_name is null then return jsonb_build_object('partner_name', null, 'lines', '[]'::jsonb, 'has_more', false, 'total_count', 0); end if;

  select count(*) into v_total from public.request_lines where btrim(coalesce(executor, '')) = v_name and deleted_at is null;

  return jsonb_build_object('partner_name', v_name, 'total_count', v_total, 'has_more', v_total > v_off + v_lim,
    'lines', coalesce((
    select jsonb_agg(
      (to_jsonb(l) - 'unit_price' - 'total' - 'list_price' - 'discount_pct' - 'commission_per_unit')
      || jsonb_build_object(
        'exec_total', coalesce(l.qty, 1) * coalesce(l.exec_unit_cost, 0),
        'beneficiaries', coalesce((
          select jsonb_agg(jsonb_build_object('name', p.name, 'phone', p.phone, 'line_id', p.line_id))
          from public.request_people p
          where p.transaction_id = l.transaction_id and (p.line_id is null or p.line_id = l.id)), '[]'::jsonb),
        'comments', coalesce((
          select jsonb_agg(jsonb_build_object('id', c.id, 'transaction_id', c.transaction_id,
                 'author_name', c.author_name, 'body', c.body, 'created_at', c.created_at) order by c.created_at)
          from public.tx_comments c
          where c.transaction_id = l.transaction_id and c.author_id = v_uid and c.deleted_at is null), '[]'::jsonb))
      order by l.id desc)
    from (select * from public.request_lines
           where btrim(coalesce(executor, '')) = v_name and deleted_at is null
           order by id desc limit v_lim offset v_off) l), '[]'::jsonb));
end $$;

create or replace function public.add_partner_comment(p_transaction_id text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text; v_row public.tx_comments;
begin
  if auth.uid() is null or coalesce(public.my_role(), '') <> 'partner' then
    raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'invalid body' using errcode = '22023'; end if;
  select nullif(btrim(partner_name), '') into v_name from public.user_roles where user_id = auth.uid();
  -- لازم الطلب يكون فيه بند مسند لهذا المنفذ
  if v_name is null or not exists (select 1 from public.request_lines
       where transaction_id = p_transaction_id and btrim(coalesce(executor, '')) = v_name and deleted_at is null) then
    raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.tx_comments (transaction_id, author_id, body, is_public)
    values (p_transaction_id, auth.uid(), btrim(p_body), false) returning * into v_row;  -- الكاتب بيحطه trigger comment_author
  return jsonb_build_object('id', v_row.id, 'transaction_id', v_row.transaction_id,
    'author_name', v_row.author_name, 'body', v_row.body, 'created_at', v_row.created_at);
end $$;

create or replace function public.get_partner_refunds(p_partner_uid uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_role text := coalesce(public.my_role(), '');
  v_uid  uuid;
  v_name text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_role = 'manager' and p_partner_uid is not null then v_uid := p_partner_uid;
  elsif v_role = 'partner' then v_uid := auth.uid();   -- المنفذ مايقدرش يطلب بيانات غيره
  else raise exception 'forbidden' using errcode = '42501'; end if;

  select nullif(btrim(partner_name), '') into v_name from public.user_roles where user_id = v_uid;
  if v_name is null then
    return jsonb_build_object('partner_name', null, 'refunds', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'partner_name', v_name,
    'refunds', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'line_id', r.line_id,
          'transaction_id', l.transaction_id,
          'kind', r.kind,
          'qty', r.qty,
          'line_qty', coalesce(l.qty, 1),
          'exec_amount', coalesce(r.exec_amount, 0),
          'exec_forfeit', coalesce(r.exec_forfeit, true),
          'reason', r.reason,
          'decided_at', r.decided_at
        ) order by r.decided_at desc nulls last, r.id desc
      )
      from public.line_refunds r
      join public.request_lines l on l.id = r.line_id
      where r.status = 'approved'
        and btrim(coalesce(l.executor, '')) = v_name
        and l.deleted_at is null
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.remind_task(p_task uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare t record; me_name text;
begin
  if coalesce(public.my_role(), '') <> 'manager' then
    raise exception 'not allowed';
  end if;
  select id, title, assignee_id, status into t from public.tasks where id = p_task and deleted_at is null;
  if t.id is null or t.status <> 'open' then raise exception 'task not open'; end if;
  select coalesce(full_name, 'المدير') into me_name from public.profiles where id = auth.uid();
  -- تذكير واحد مفتوح لكل مهمة (مفيش تكرار لو ضغط أكتر من مرة)
  delete from public.notifications where task_id = t.id and kind = 'task_remind' and read = false;
  insert into public.notifications (user_id, kind, title, body, task_id)
  values (t.assignee_id, 'task_remind', 'تذكير بمهمة', me_name || ' بيفكّرك بالمهمة: ' || t.title, t.id);
end $$;

-- error_log: شيل NOT NULL من أي عمود (غير id و created_at) مالوش default
do $$
declare c record;
begin
  for c in
    select a.attname
      from pg_attribute a
      join pg_class t on t.oid = a.attrelid
      join pg_namespace n on n.oid = t.relnamespace
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where n.nspname = 'public' and t.relname = 'error_log'
       and a.attnum > 0 and not a.attisdropped and a.attnotnull
       and a.attname not in ('id', 'created_at')
       and d.adbin is null
       and a.attidentity = ''
  loop
    execute format('alter table public.error_log alter column %I drop not null', c.attname);
  end loop;
exception when undefined_table then null;
end $$;

revoke all on function public.get_partner_requests(uuid, int, int) from public, anon;
revoke all on function public.add_partner_comment(text, text) from public, anon;
revoke all on function public.get_partner_refunds(uuid) from public, anon;
revoke all on function public.remind_task(uuid) from public, anon;
grant execute on function public.get_partner_requests(uuid, int, int) to authenticated;
grant execute on function public.add_partner_comment(text, text) to authenticated;
grant execute on function public.get_partner_refunds(uuid) to authenticated;
grant execute on function public.remind_task(uuid) to authenticated;

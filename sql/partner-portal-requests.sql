-- بوابة المنفذ الخارجي التفاعلية — تشغيل مرة واحدة في Supabase → SQL Editor. آمن لو اتشغل أكتر من مرة.
-- يتطلب وجود: my_role() و user_roles(user_id, role, partner_name) و tx_comments و request_people (من p1c).
-- المبدأ: المنفذ يشوف بس البنود اللي executor بتاعها = partner_name بتاعه. الأسعار والخصومات والعمولة مش بتتبعت له أبدا.
-- التعليقات اللي بترجع له: تعليقاته هو بس (التعليقات الداخلية للموظفين متظهرش).

create or replace function public.get_partner_requests(p_partner_uid uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
  if v_name is null then return jsonb_build_object('partner_name', null, 'lines', '[]'::jsonb); end if;

  return jsonb_build_object('partner_name', v_name, 'lines', coalesce((
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
          where c.transaction_id = l.transaction_id and c.author_id = v_uid), '[]'::jsonb))
      order by l.id desc)
    from public.request_lines l
    where btrim(coalesce(l.executor, '')) = v_name), '[]'::jsonb));
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
       where transaction_id = p_transaction_id and btrim(coalesce(executor, '')) = v_name) then
    raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.tx_comments (transaction_id, author_id, body, is_public)
    values (p_transaction_id, auth.uid(), btrim(p_body), false) returning * into v_row;  -- الكاتب بيحطه trigger comment_author
  return jsonb_build_object('id', v_row.id, 'transaction_id', v_row.transaction_id,
    'author_name', v_row.author_name, 'body', v_row.body, 'created_at', v_row.created_at);
end $$;

revoke all on function public.get_partner_requests(uuid) from public;
revoke all on function public.add_partner_comment(text, text) from public;
grant execute on function public.get_partner_requests(uuid) to authenticated;
grant execute on function public.add_partner_comment(text, text) to authenticated;

-- ===== Rollback =====
-- drop function if exists public.get_partner_requests(uuid);
-- drop function if exists public.add_partner_comment(text, text);

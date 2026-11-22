-- استردادات بوابة المنفذ الخارجي (مكمّل لـ migration line_refunds_v1)
-- تشغيل مرة واحدة في Supabase → SQL Editor. آمن لو اتشغل أكتر من مرة.
-- يتطلب وجود: my_role() و user_roles(user_id, role, partner_name) و request_lines و line_refunds.
-- المبدأ: نفس منطق صلاحيات get_partner_requests بالظبط:
--   - المدير يقدر يبعت p_partner_uid لمعاينة شاشة منفذ معيّن.
--   - المنفذ الخارجي بياخد بياناته هو بس (auth.uid()).
--   - مفيش أي أسعار بيع (sales_amount) أو عمولات (unit_comm_hint) بتتبعت للمنفذ أبداً.
--   - بيرجع الاستردادات المعتمدة (status = 'approved') على البنود المسندة لهذا المنفذ،
--     شاملة: id, line_id, kind (full|partial), qty, exec_amount, exec_forfeit, reason, decided_at.

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
          'decided_at', r.decided_at,
          'closed_at', r.closed_at
        ) order by r.decided_at desc nulls last, r.id desc
      )
      from public.line_refunds r
      join public.request_lines l on l.id = r.line_id
      where r.status = 'approved'
        and btrim(coalesce(l.executor, '')) = v_name
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.get_partner_refunds(uuid) from public, anon;
grant execute on function public.get_partner_refunds(uuid) to authenticated;

-- ===== Rollback =====
-- drop function if exists public.get_partner_refunds(uuid);

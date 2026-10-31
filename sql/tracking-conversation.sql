-- إصلاح: ردود الإدارة واستفسارات العميل ما كانتش بتظهر في صفحة التتبع (Track.html بتقرا d.conversation والدالة ما كانتش بترجّعها).
-- بيضيف conversation = استفسارات العميل + التعليقات العامة بس. آمن لو اتشغل أكتر من مرة. نسخة احتياطية الأول.
create or replace function public.get_public_tracking_v2(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb; tx text; svc jsonb; pct int; conv jsonb;
begin
  base := public.get_public_tracking(p_token)::jsonb;
  if base is null then return null; end if;
  select l.transaction_id::text into tx from public.request_lines l where l.tracking_token = p_token limit 1;
  if tx is null then return base; end if;

  select coalesce(jsonb_agg(x.j order by x.ord), '[]'::jsonb), coalesce(round(avg(x.p))::int, 0)
    into svc, pct
  from (
    select l.id as ord,
      case public.line_stage_of(l.delivered, l.complete, l.under_review)
        when 'delivered' then 100 when 'complete' then 75 when 'under_review' then 50 else 25 end as p,
      jsonb_build_object(
        'name', l.service, 'qty', l.qty,
        'status', public.line_stage_of(l.delivered, l.complete, l.under_review),
        'stage', case public.line_stage_of(l.delivered, l.complete, l.under_review)
                   when 'delivered' then 3 when 'complete' then 2 else 1 end,
        'pct', case public.line_stage_of(l.delivered, l.complete, l.under_review)
                 when 'delivered' then 100 when 'complete' then 75 when 'under_review' then 50 else 25 end,
        'events', coalesce((select jsonb_agg(jsonb_build_object('stage', e.stage, 'at', e.at) order by e.at)
                            from public.line_stage_events e where e.line_id = l.id), '[]'::jsonb)
      ) as j
    from public.request_lines l
    where l.transaction_id::text = tx and l.deleted_at is null
  ) x;

  select coalesce(jsonb_agg(m.j order by m.at), '[]'::jsonb) into conv from (
    select i.created_at as at, jsonb_build_object('kind','client','body',i.body,'at',i.created_at) as j
      from public.customer_inquiries i where i.transaction_id::text = tx
    union all
    select c.created_at, jsonb_build_object('kind','admin','body',c.body,'at',c.created_at)
      from public.tx_comments c where c.transaction_id::text = tx and c.is_public = true and c.deleted_at is null
  ) m;

  return base || jsonb_build_object('services', svc, 'order_pct', pct, 'conversation', conv);
end $$;


revoke all on function public.get_public_tracking_v2(text) from public;
grant execute on function public.get_public_tracking_v2(text) to anon, authenticated;

-- ===== Rollback: شغّل الجزء الخاص بـ get_public_tracking_v2 من sql/p1b-tracking.sql تاني =====

-- P1-ب — تشغيل مرة واحدة في Supabase → SQL Editor. آمن لو اتشغل أكتر من مرة.
-- 1) line_stage_events: سجل بتوقيت حقيقي لكل مرة حالة بند اتغيّرت (بتتملى بتريجر، مش من المتصفح).
-- 2) get_public_tracking_v2(token): بيكمّل get_public_tracking الحالية (من غير ما يلمسها) بكروت الخدمات ونسبة التقدم.
--    مفيش فيه تكلفة تنفيذ ولا أسعار ولا ملاحظات داخلية ولا اسم منفّذ.

do $$
declare t text;
begin
  select format_type(atttypid, atttypmod) into t from pg_attribute
   where attrelid = 'public.request_lines'::regclass and attname = 'id' and not attisdropped;
  execute format($f$create table if not exists public.line_stage_events (
      id bigint generated always as identity primary key,
      line_id %s not null,
      transaction_id text,
      stage text not null check (stage in ('in_progress','under_review','complete','delivered')),
      at timestamptz not null default now(),
      by_user uuid default auth.uid())$f$, t);
end $$;

create index if not exists line_stage_events_line_idx on public.line_stage_events (line_id, at);
create index if not exists line_stage_events_tx_idx on public.line_stage_events (transaction_id);

alter table public.line_stage_events enable row level security;
drop policy if exists lse_staff_select on public.line_stage_events;
create policy lse_staff_select on public.line_stage_events for select to authenticated using (is_staff());
-- مفيش سياسة insert/update/delete: الكتابة من التريجر بس (SECURITY DEFINER)

create or replace function public.line_stage_of(d boolean, c boolean, u boolean)
returns text language sql immutable as $$
  select case when coalesce(d,false) then 'delivered' when coalesce(c,false) then 'complete'
              when coalesce(u,false) then 'under_review' else 'in_progress' end
$$;

create or replace function public.trg_line_stage_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare s text := public.line_stage_of(new.delivered, new.complete, new.under_review);
begin
  if tg_op = 'UPDATE' and s = public.line_stage_of(old.delivered, old.complete, old.under_review) then return new; end if;
  insert into public.line_stage_events (line_id, transaction_id, stage) values (new.id, new.transaction_id::text, s);
  return new;
end $$;

drop trigger if exists line_stage_event on public.request_lines;
create trigger line_stage_event after insert or update of delivered, complete, under_review on public.request_lines
for each row execute function public.trg_line_stage_event();

-- نقطة بداية للبنود الحالية (مرة واحدة): حالتها دلوقتي، بتوقيت التشغيل
insert into public.line_stage_events (line_id, transaction_id, stage)
select l.id, l.transaction_id::text, public.line_stage_of(l.delivered, l.complete, l.under_review)
from public.request_lines l
where l.deleted_at is null
  and not exists (select 1 from public.line_stage_events e where e.line_id = l.id);

-- ===== رابط العميل: كروت الخدمات + النسبة =====
create or replace function public.get_public_tracking_v2(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb; tx text; svc jsonb; pct int;
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

  return base || jsonb_build_object('services', svc, 'order_pct', pct);
end $$;

revoke all on function public.get_public_tracking_v2(text) from public;
grant execute on function public.get_public_tracking_v2(text) to anon, authenticated;

-- ===== Rollback =====
-- drop function if exists public.get_public_tracking_v2(text);
-- drop trigger if exists line_stage_event on public.request_lines;
-- drop function if exists public.trg_line_stage_event();
-- drop function if exists public.line_stage_of(boolean, boolean, boolean);
-- drop table if exists public.line_stage_events;

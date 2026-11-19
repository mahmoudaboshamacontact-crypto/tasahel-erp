-- Courier Radar: harden approve/reject decisions.
-- Safe to run repeatedly. Run manually in Supabase SQL Editor after review.
-- This patch changes only the decision RPC; it does not execute itself.

create or replace function public.courier_v12_resolve_event(
  p_event_id bigint,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_event public.courier_dispatch_events;
begin
  if not (public.is_staff() or public.is_manager()) then
    raise exception 'staff only' using errcode = '42501';
  end if;

  if p_event_id is null or p_event_id <= 0 then
    raise exception 'invalid event id' using errcode = '22023';
  end if;

  if v_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;

  -- Atomic compare-and-set: a decision can be made only once, while pending.
  update public.courier_dispatch_events
     set status = v_decision,
         resolved_by = (select auth.uid()),
         resolved_at = now()
   where id = p_event_id
     and status = 'pending'
     and event_type in ('handoff_req', 'reschedule_req', 'expense', 'swap_req', 'cash_settle')
  returning * into v_event;

  if v_event.id is null then
    raise exception 'event is not pending or was already resolved'
      using errcode = 'P0002';
  end if;

  if v_decision = 'approved'
     and v_event.event_type = 'reschedule_req'
     and v_event.transaction_id is not null then
    update public.courier_trips
       set trip_day = (now() at time zone 'Africa/Cairo')::date + 1
     where transaction_id = v_event.transaction_id
       and courier_id is not distinct from v_event.courier_id
       and courier_confirmed_at is null;
  end if;

  return jsonb_build_object('ok', true, 'status', v_decision);
end;
$$;

revoke all on function public.courier_v12_resolve_event(bigint, text) from public, anon;
grant execute on function public.courier_v12_resolve_event(bigint, text) to authenticated;

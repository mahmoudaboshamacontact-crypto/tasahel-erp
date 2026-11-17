-- =====================================================================
-- courier-link-v13.sql  (قابل لإعادة التشغيل — بيتشغل يدويًا في Supabase SQL Editor)
-- 1) إشعار فوري للمدير/الموظفين لما المندوب يبعت طلب (تحويل/تأجيل/مصروف/تبديل/تسوية كاش)
-- 2) حالة المندوب لصفحة تتبع العميل بالتوكن بدل رقم المعاملة (ومنع الاستعلام المجهول بالرقم)
-- 3) أمان: المندوب يشتغل على معاملاته بس (ملاحظة المكان / التوقيع / أحداث التشغيل) + حد حجم للـ payload
-- ما فيهاش أي حذف لبيانات ولا تغيير في الجداول.
-- =====================================================================

-- 0) هل المعاملة دي بتاعة المندوب الحالي؟ (رحلة مسجلة له أو بند رسوم توصيل باسمه)
create or replace function public.courier_owns_tx(p_tx text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.couriers c
     where c.user_id = auth.uid() and c.active
       and (
         exists (select 1 from public.courier_trips t
                  where t.transaction_id::text = btrim(coalesce(p_tx,''))
                    and public.norm_ar(t.courier) = public.norm_ar(c.name))
         or exists (select 1 from public.request_lines l
                     where l.transaction_id::text = btrim(coalesce(p_tx,''))
                       and l.deleted_at is null
                       and public.norm_ar(l.executor) = public.norm_ar(c.name))
       )
  );
$$;
revoke all on function public.courier_owns_tx(text) from public, anon;
grant execute on function public.courier_owns_tx(text) to authenticated;

-- 1) إشعار الإدارة
create or replace function public.trg_courier_dispatch_notice()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_label text;
begin
  if NEW.status is distinct from 'pending'
     or NEW.event_type not in ('handoff_req','reschedule_req','expense','swap_req','cash_settle') then
    return NEW;
  end if;
  v_label := case NEW.event_type
    when 'handoff_req' then 'طلب تحويل' when 'reschedule_req' then 'طلب تأجيل'
    when 'expense' then 'مصروف طريق' when 'swap_req' then 'طلب تبديل' else 'تسوية كاش' end;
  insert into public.notifications(user_id, kind, title, body)
  select ur.user_id, 'info',
         'المندوب ' || coalesce(NEW.courier_name, '') || ': ' || v_label,
         trim(coalesce(NEW.transaction_id, '') || ' ' || coalesce(left(coalesce(NEW.payload->>'reason', NEW.payload->>'note', ''), 120), ''))
    from public.user_roles ur where ur.role in ('manager', 'staff');
  return NEW;
end $$;
revoke all on function public.trg_courier_dispatch_notice() from public, anon, authenticated;
drop trigger if exists courier_dispatch_notice on public.courier_dispatch_events;
create trigger courier_dispatch_notice after insert on public.courier_dispatch_events
  for each row execute function public.trg_courier_dispatch_notice();

-- 2) حالة المندوب بالتوكن (صفحة Track.html)
create or replace function public.public_courier_live_status_by_token(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_tx text; v_ev public.courier_dispatch_events;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,128}$' then
    return jsonb_build_object('on_the_way', false);
  end if;
  select l.transaction_id::text into v_tx from public.request_lines l
   where l.tracking_token = p_token and l.deleted_at is null limit 1;
  if v_tx is null then return jsonb_build_object('on_the_way', false); end if;
  select * into v_ev from public.courier_dispatch_events e
   where upper(e.transaction_id) = upper(v_tx) and e.event_type in ('on_the_way', 'waiting')
     and e.created_at > now() - interval '6 hours'
   order by e.created_at desc limit 1;
  if v_ev.id is null then return jsonb_build_object('on_the_way', false); end if;
  return jsonb_build_object('on_the_way', true, 'state', v_ev.event_type,
    'courier_name', split_part(coalesce(v_ev.courier_name, 'مندوب تساهيل'), ' ', 1), 'at', v_ev.created_at);
end $$;
revoke all on function public.public_courier_live_status_by_token(text) from public;
grant execute on function public.public_courier_live_status_by_token(text) to anon, authenticated;
-- الدالة القديمة بالرقم: ما تبقاش متاحة للمجهول (الأرقام ممكن تتخمّن)
revoke execute on function public.public_courier_live_status(text) from anon;

-- 3) أمان
create or replace function public.courier_v12_save_signature(
  p_tx text, p_signer text, p_svg_path text, p_lat numeric default null, p_lng numeric default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_tx text := btrim(coalesce(p_tx, ''));
  v_svg text := btrim(coalesce(p_svg_path, ''));
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;
  if v_tx = '' or v_svg = '' or char_length(v_svg) > 16000 then raise exception 'invalid signature' using errcode = '22023'; end if;
  if v_svg !~ '^[MmLlHhVvCcSsQqTtAaZz0-9eE\s,.\-+]+$' then raise exception 'invalid signature path' using errcode = '22023'; end if;
  if not public.courier_owns_tx(v_tx) then raise exception 'not your transaction' using errcode = '42501'; end if;
  insert into public.courier_signatures(transaction_id, courier_id, courier_name, signer_name, svg_path, lat, lng)
  values (v_tx, v_c.id, v_c.name, nullif(left(btrim(coalesce(p_signer,'')), 80), ''), v_svg, p_lat, p_lng);
  return jsonb_build_object('ok', true, 'transaction_id', v_tx);
end $$;

create or replace function public.courier_v12_save_landmark(p_tx text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tx text := btrim(coalesce(p_tx, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_client text; v_phone text; v_key text;
begin
  if not (public.is_courier() or public.is_staff() or public.is_manager()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_tx = '' or v_note = '' then raise exception 'empty input' using errcode = '22023'; end if;
  if public.is_courier() and not public.courier_owns_tx(v_tx) then raise exception 'not your transaction' using errcode = '42501'; end if;
  select max(l.client_name), max(l.phone) into v_client, v_phone
    from public.request_lines l where l.transaction_id::text = v_tx and l.deleted_at is null;
  v_key := public.norm_ar(coalesce(v_client,'') || ' ' || coalesce(v_phone,''));
  if v_key = '' then v_key := v_tx; end if;
  insert into public.courier_landmarks(client_key, client_name, note, created_by, updated_at)
  values (v_key, v_client, left(v_note, 300), auth.uid(), now())
  on conflict (client_key) do update set note = excluded.note, updated_at = now(), created_by = auth.uid();
  return jsonb_build_object('ok', true, 'note', left(v_note, 300));
end $$;

create or replace function public.courier_v12_dispatch_action(p_event_type text, p_tx text default null, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_type text := btrim(coalesce(p_event_type, ''));
  v_tx text := nullif(btrim(coalesce(p_tx, '')), '');
  v_status text := 'ack';
  v_id bigint;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;
  if v_type not in ('on_the_way','waiting','break','resume','handoff_req','reschedule_req','expense','near_office','call_attempt','swap_req','cash_settle','client_tag') then
    raise exception 'invalid event type' using errcode = '22023';
  end if;
  if octet_length(coalesce(p_payload, '{}'::jsonb)::text) > 2000 then raise exception 'payload too large' using errcode = '22023'; end if;
  if v_tx is not null and not public.courier_owns_tx(v_tx) then raise exception 'not your transaction' using errcode = '42501'; end if;
  if v_type in ('handoff_req','reschedule_req','expense','swap_req','cash_settle') then v_status := 'pending'; end if;
  insert into public.courier_dispatch_events(courier_id, courier_name, transaction_id, event_type, payload, status, created_by)
  values (v_c.id, v_c.name, v_tx, v_type, coalesce(p_payload, '{}'::jsonb), v_status, auth.uid())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'status', v_status);
end $$;

-- الصلاحيات (نفسها)
revoke all on function public.courier_v12_save_signature(text, text, text, numeric, numeric) from public, anon;
grant execute on function public.courier_v12_save_signature(text, text, text, numeric, numeric) to authenticated;
revoke all on function public.courier_v12_save_landmark(text, text) from public, anon;
grant execute on function public.courier_v12_save_landmark(text, text) to authenticated;
revoke all on function public.courier_v12_dispatch_action(text, text, jsonb) from public, anon;
grant execute on function public.courier_v12_dispatch_action(text, text, jsonb) to authenticated;

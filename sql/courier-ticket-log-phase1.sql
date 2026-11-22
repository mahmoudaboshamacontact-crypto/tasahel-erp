-- مرحلة 1: سجل نشاط موحّد للتذكرة (لم يُنفَّذ بعد — ينتظر موافقة محمود)
-- 1) إعادة تسمية تعليق الوصول  2) نتيجة الاتصال (ردّ / ما ردّش)  3) تعليق تلقائي لكل خطوة للمندوب

-- (1)
create or replace function public.courier_p4_log_zero_blame(
  p_tx text,
  p_reason_code text,
  p_lat numeric default null,
  p_lng numeric default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_tx text := btrim(coalesce(p_tx, ''));
  v_code text := case when p_reason_code in ('no_answer', 'not_home', 'reschedule_asked') then p_reason_code else 'no_answer' end;
  v_label text;
  v_client text;
  v_phone text;
  v_token text;
  v_id bigint;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;
  if not public.courier_p4_owns_item(v_c.id, v_c.name, v_tx, null) then
    raise exception 'المعاملة دي مش مسندة ليك' using errcode = '42501';
  end if;

  v_label := case v_code
    when 'no_answer' then 'العميل لا يرد على الهاتف'
    when 'not_home' then 'العميل غير متواجد بالعنوان'
    else 'العميل طلب تأجيل الموعد'
  end;

  select max(client_name), max(phone), max(tracking_token)
    into v_client, v_phone, v_token
    from public.request_lines where transaction_id = v_tx and deleted_at is null;

  if v_client is null then
    select client_name, phone into v_client, v_phone
      from public.pickup_tickets where sd_request_id = v_tx and courier_id = v_c.id limit 1;
  end if;

  insert into public.courier_zero_blame_logs (
    courier_id, courier_name, transaction_id, client_name, phone, reason_code, reason_label, lat, lng, created_by
  )
  values (v_c.id, v_c.name, v_tx, v_client, v_phone, v_code, v_label, p_lat, p_lng, auth.uid())
  returning id into v_id;

  begin
    insert into public.tx_comments (transaction_id, author_id, author_name, body)
    values (v_tx, auth.uid(), v_c.name,
      'تسجيل وصول: وصل المندوب للعميل (' || v_label || ')' ||
      case when p_lat is not null and p_lng is not null then ' — GPS: ' || round(p_lat, 5) || ',' || round(p_lng, 5) else '' end);
  exception when others then
    raise warning 'zero_blame comment failed: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'id', v_id, 'transaction_id', v_tx, 'client_name', v_client,
                            'phone', v_phone, 'tracking_token', v_token, 'reason_label', v_label, 'arrived_at', now());
end;
$$;

-- (2) تسجيل نتيجة الاتصال: مرة واحدة فقط، على صف المندوب نفسه
create or replace function public.courier_set_contact_outcome(p_log_id bigint, p_outcome text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_c public.couriers;
  v_r public.courier_contact_log;
  v_out text := lower(btrim(coalesce(p_outcome, '')));
  v_tx text;
begin
  if not public.is_courier() then raise exception 'courier only' using errcode = '42501'; end if;
  select * into v_c from public.couriers where user_id = auth.uid() and active limit 1;
  if v_c.id is null then raise exception 'courier not linked' using errcode = '42501'; end if;
  if v_out not in ('answered', 'no_answer', 'wrong_number', 'postponed') then
    raise exception 'نتيجة غير صالحة' using errcode = '22023';
  end if;
  select * into v_r from public.courier_contact_log where id = p_log_id for update;
  if v_r.id is null or v_r.courier_id is distinct from v_c.id then
    raise exception 'السجل ده مش بتاعك' using errcode = '42501';
  end if;
  if v_r.outcome is not null then
    raise exception 'النتيجة متسجلة بالفعل' using errcode = '22023';
  end if;
  update public.courier_contact_log set outcome = v_out where id = p_log_id;

  v_tx := coalesce(v_r.transaction_id,
                   (select sd_request_id from public.pickup_tickets where id = v_r.ticket_id));
  if v_tx is not null then
    begin
      insert into public.tx_comments (transaction_id, author_id, author_name, body)
      values (v_tx, auth.uid(), v_c.name,
        case v_r.channel when 'whatsapp' then 'واتساب مع العميل' else 'اتصال بالعميل' end || ': ' ||
        case v_out when 'answered' then 'العميل ردّ'
                   when 'no_answer' then 'العميل لم يردّ'
                   when 'wrong_number' then 'رقم خاطئ'
                   else 'العميل طلب التأجيل' end);
    exception when others then
      raise warning 'contact outcome comment failed: %', sqlerrm;
    end;
  end if;
  return jsonb_build_object('ok', true, 'outcome', v_out);
end;
$$;
revoke all on function public.courier_set_contact_outcome(bigint, text) from public, anon;
grant execute on function public.courier_set_contact_outcome(bigint, text) to authenticated;

-- (3) تعليق تلقائي عند كل خطوة للمندوب على التذكرة
create or replace function public.pickup_ticket_step_comment()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if new.sd_request_id is null or new.courier_step is null then return new; end if;
  select name into v_name from public.couriers where id = new.courier_id;
  begin
    insert into public.tx_comments (transaction_id, author_id, author_name, body)
    values (new.sd_request_id, auth.uid(), coalesce(v_name, 'المندوب'),
      case new.courier_step
        when 'accepted' then 'المندوب استلم التذكرة'
        when 'call_attempt' then 'المندوب بدأ محاولة الاتصال بالعميل'
        when 'on_the_way' then 'المندوب في الطريق للعميل'
        when 'waiting' then 'المندوب وصل وفي انتظار العميل'
        when 'papers_received' then 'المندوب استلم الأوراق من العميل'
        else new.courier_step end);
  exception when others then
    raise warning 'step comment failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists pickup_ticket_step_comment_trg on public.pickup_tickets;
create trigger pickup_ticket_step_comment_trg
  after update of courier_step on public.pickup_tickets
  for each row
  when (new.courier_step is distinct from old.courier_step)
  execute function public.pickup_ticket_step_comment();

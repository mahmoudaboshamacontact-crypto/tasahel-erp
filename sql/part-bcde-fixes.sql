-- =====================================================================
-- تصحيحات مراجعة الأجزاء B/C/D/E (بعد دمج PR #62)
-- الملف: sql/part-bcde-fixes.sql — Idempotent. شغّله بعد part-b/c/d/e-clients-growth.
-- =====================================================================

-- 1) ملاحظات الوردية: تعديل المحتوى للمؤلف أو المدير فقط (التأكيد عبر acknowledge_shift_note)
drop policy if exists shn_update_staff on public.shift_handover_notes;
create policy shn_update_staff on public.shift_handover_notes
  for update to authenticated
  using ((select auth.uid()) is not null and ((select public.is_manager()) or author_id = (select auth.uid())))
  with check ((select auth.uid()) is not null and (select public.is_staff()));

-- 2) البيانات المالية الحساسة: قراءة المدير فقط
drop policy if exists fms_select_staff on public.finance_month_settings;
drop policy if exists fms_select_mgr on public.finance_month_settings;
create policy fms_select_mgr on public.finance_month_settings
  for select to authenticated using ((select public.is_manager()));

drop policy if exists ep_select_staff on public.executor_payments;
drop policy if exists ep_select_mgr on public.executor_payments;
create policy ep_select_mgr on public.executor_payments
  for select to authenticated using ((select public.is_manager()));

drop policy if exists wr_select_staff on public.wallet_reconciliations;
drop policy if exists wr_select_mgr on public.wallet_reconciliations;
create policy wr_select_mgr on public.wallet_reconciliations
  for select to authenticated using ((select public.is_manager()));

-- 3) اعتماد الخصم: pending فقط + بند واحد محدد
create or replace function public.decide_discount_approval(
  p_id bigint, p_decision text, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text;
  v_row public.discount_approvals;
  v_unit numeric;
  v_cnt integer;
begin
  if not public.is_manager() then
    raise exception 'manager only' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(full_name), ''), auth.jwt() ->> 'email', 'المدير')
    into v_name from public.profiles where id = v_uid;

  update public.discount_approvals
     set status = p_decision, decided_by = v_uid,
         decided_by_name = coalesce(v_name, 'المدير'), decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id and status = 'pending'
   returning * into v_row;

  if v_row.id is null then
    raise exception 'request not found or already decided' using errcode = 'P0002';
  end if;

  if p_decision = 'approved' then
    v_unit := case when coalesce(v_row.requested_unit_price, 0) > 0 then v_row.requested_unit_price
                   else round(coalesce(v_row.list_price, 0) * (1 - v_row.requested_discount_pct / 100.0), 2) end;
    if v_row.line_id is not null then
      update public.request_lines
         set discount_pct = v_row.requested_discount_pct,
             list_price = case when coalesce(list_price, 0) > 0 then list_price else v_row.list_price end,
             unit_price = v_unit
       where id = v_row.line_id and deleted_at is null;
      get diagnostics v_cnt = row_count;
    else
      -- بدون line_id: نطبّق فقط لو بند واحد مطابق (تفاديًا لتعديل بنود غير مقصودة)
      select count(*) into v_cnt from public.request_lines
       where transaction_id = v_row.transaction_id and service = v_row.service and deleted_at is null;
      if v_cnt <> 1 then
        raise exception 'ambiguous line: set line_id (matches=%)', v_cnt using errcode = '22023';
      end if;
      update public.request_lines
         set discount_pct = v_row.requested_discount_pct,
             list_price = case when coalesce(list_price, 0) > 0 then list_price else v_row.list_price end,
             unit_price = v_unit
       where transaction_id = v_row.transaction_id and service = v_row.service and deleted_at is null;
    end if;
  end if;
  return to_jsonb(v_row);
end $$;
revoke all on function public.decide_discount_approval(bigint, text, text) from public, anon;
grant execute on function public.decide_discount_approval(bigint, text, text) to authenticated;

-- 4) فرض حد الخصم من السيرفر: غير المدير لا يضع خصم فوق الحد إلا بموافقة معتمدة
create or replace function public.trg_enforce_discount_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cap numeric;
begin
  if (select auth.uid()) is null or public.is_manager() then return new; end if;
  if coalesce(new.discount_pct, 0) <= 0 then return new; end if;
  if tg_op = 'UPDATE' and new.discount_pct is not distinct from old.discount_pct then return new; end if;

  select coalesce(
           (select max_discount_pct from public.finance_month_settings
             where month = to_char(now() at time zone 'Africa/Cairo', 'YYYY-MM')), 20)
    into v_cap;
  if new.discount_pct <= v_cap then return new; end if;

  if exists (select 1 from public.discount_approvals a
              where a.status = 'approved'
                and a.transaction_id = new.transaction_id
                and a.service = new.service
                and a.requested_discount_pct >= new.discount_pct) then
    return new;
  end if;
  raise exception 'discount above % %% needs manager approval', v_cap using errcode = '42501';
end $$;
revoke all on function public.trg_enforce_discount_cap() from public, anon;

drop trigger if exists enforce_discount_cap_trg on public.request_lines;
create trigger enforce_discount_cap_trg
before insert or update of discount_pct on public.request_lines
for each row execute function public.trg_enforce_discount_cap();

-- 5) تأكيد التسليم: لا يتم إلا لو كل البنود مكتملة، ولا يُكتب فوق تأكيد سابق إلا بواسطة المدير
create or replace function public.confirm_tx_delivery(
  p_tx text, p_received_by text, p_courier text default null,
  p_code text default null, p_area text default null, p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_uname text;
  v_tx text := btrim(coalesce(p_tx, ''));
  v_row public.delivery_confirmations;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if v_tx = '' or btrim(coalesce(p_received_by, '')) = '' then
    raise exception 'transaction_id and received_by_name required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.request_lines where transaction_id = v_tx and deleted_at is null) then
    raise exception 'transaction not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.request_lines
              where transaction_id = v_tx and deleted_at is null
                and coalesce(complete, false) = false and coalesce(delivered, false) = false) then
    raise exception 'transaction has incomplete lines' using errcode = '22023';
  end if;
  if exists (select 1 from public.delivery_confirmations where transaction_id = v_tx)
     and not public.is_manager() then
    raise exception 'already confirmed (manager only can overwrite)' using errcode = '42501';
  end if;

  select coalesce(nullif(btrim(full_name), ''), auth.jwt() ->> 'email', 'موظف')
    into v_uname from public.profiles where id = v_uid;

  insert into public.delivery_confirmations (transaction_id, courier_name, received_by_name, verify_code,
         area, notes, confirmed_by, confirmed_by_name, confirmed_at)
  values (v_tx, nullif(btrim(coalesce(p_courier, '')), ''), btrim(p_received_by),
          nullif(btrim(coalesce(p_code, '')), ''), nullif(btrim(coalesce(p_area, '')), ''),
          nullif(btrim(coalesce(p_notes, '')), ''), v_uid, coalesce(v_uname, 'موظف'), now())
  on conflict (transaction_id) do update
    set courier_name = excluded.courier_name, received_by_name = excluded.received_by_name,
        verify_code = excluded.verify_code, area = excluded.area, notes = excluded.notes,
        confirmed_by = excluded.confirmed_by, confirmed_by_name = excluded.confirmed_by_name,
        confirmed_at = now()
  returning * into v_row;

  update public.request_lines
     set delivered = true, complete = true, under_review = false, status = 'Delivered',
         delivered_date = coalesce(delivered_date, (now() at time zone 'Africa/Cairo')::date)
   where transaction_id = v_tx and deleted_at is null;

  return to_jsonb(v_row);
end $$;
revoke all on function public.confirm_tx_delivery(text, text, text, text, text, text) from public, anon;
grant execute on function public.confirm_tx_delivery(text, text, text, text, text, text) to authenticated;

-- 6) دمج العملاء: رفض القيم الفاضية في المصادر
create or replace function public.merge_duplicate_clients(
  p_target_name text, p_target_phone text,
  p_source_names text[], p_source_phones text[] default '{}'
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_cnt integer := 0;
  v_names text[];
  v_phones text[];
begin
  if not public.is_manager() then
    raise exception 'manager only' using errcode = '42501';
  end if;
  if btrim(coalesce(p_target_name, '')) = '' then
    raise exception 'target client name required' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct btrim(x)), '{}') into v_names
    from unnest(coalesce(p_source_names, '{}')) x where btrim(coalesce(x, '')) <> '';
  select coalesce(array_agg(distinct btrim(x)), '{}') into v_phones
    from unnest(coalesce(p_source_phones, '{}')) x where btrim(coalesce(x, '')) <> '';
  if cardinality(v_names) = 0 and cardinality(v_phones) = 0 then
    raise exception 'no valid source names or phones' using errcode = '22023';
  end if;

  update public.request_lines
     set client_name = btrim(p_target_name),
         phone = coalesce(nullif(btrim(coalesce(p_target_phone, '')), ''), phone)
   where deleted_at is null
     and (btrim(client_name) = any(v_names) or btrim(coalesce(phone, '')) = any(v_phones));
  get diagnostics v_cnt = row_count;
  return v_cnt;
end $$;
revoke all on function public.merge_duplicate_clients(text, text, text[], text[]) from public, anon;
grant execute on function public.merge_duplicate_clients(text, text, text[], text[]) to authenticated;

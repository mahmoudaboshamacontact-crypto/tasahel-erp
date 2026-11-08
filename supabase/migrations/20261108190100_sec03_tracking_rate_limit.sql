create index if not exists public_tracking_attempts_failed_lookup_attempted_at_idx on public.public_tracking_attempts (lookup_key, attempted_at desc) where succeeded = false;

create or replace function public.lookup_public_tracking_by_code_and_phone4(p_transaction_id text, p_code text, p_phone_last4 text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_catalog' as $function$
declare
  v_tx text := upper(btrim(coalesce(p_transaction_id, '')));
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_last4 text := regexp_replace(btrim(coalesce(p_phone_last4, '')), '\D', '', 'g');
  v_tx_fail integer; v_ok boolean; v_services jsonb; v_pct integer := 0; v_stage integer := 1; v_received date; v_expected date;
begin
  if v_tx = '' or char_length(v_tx) > 40 or v_code !~ '^[0-9A-F]{8}$' or v_last4 !~ '^\d{4}$' then return jsonb_build_object('ok', false, 'error', 'invalid_input'); end if;
  select count(*) into v_tx_fail from public.public_tracking_attempts where lookup_key = v_tx and succeeded = false and attempted_at >= now() - interval '15 minutes';
  if v_tx_fail >= 5 then return jsonb_build_object('ok', false, 'error', 'rate_limited', 'message', 'تم تجاوز الحد المسموح للمحاولات. يرجى الانتظار والمحاولة لاحقًا.'); end if;
  select exists (select 1 from public.tx_track_codes c join public.request_lines l on upper(btrim(l.transaction_id::text)) = c.transaction_id where c.transaction_id = v_tx and c.code = v_code and l.deleted_at is null and right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 4) = v_last4) into v_ok;
  if not v_ok then insert into public.public_tracking_attempts (lookup_key, succeeded) values (v_tx, false); return jsonb_build_object('ok', false, 'error', 'not_found_or_mismatch', 'message', 'بيانات المعاملة غير صحيحة.'); end if;
  select min(coalesce(l.received_at::date, l.created_at::date)), max(coalesce(l.exec_start_date::date, l.received_at::date) + coalesce(l.duration_days, 0)::int) into v_received, v_expected from public.request_lines l where upper(btrim(l.transaction_id::text)) = v_tx and l.deleted_at is null;
  select coalesce(jsonb_agg(x.item order by x.ord), '[]'::jsonb), coalesce(round(avg(x.pct))::int, 0), coalesce(min(x.stg), 1) into v_services, v_pct, v_stage from (select l.id as ord, case public.line_stage_of(l.delivered,l.complete,l.under_review) when 'delivered' then 100 when 'complete' then 75 when 'under_review' then 50 else 25 end as pct, case public.line_stage_of(l.delivered,l.complete,l.under_review) when 'delivered' then 3 when 'complete' then 2 else 1 end as stg, jsonb_build_object('service',l.service,'qty',coalesce(l.qty,1),'status',public.line_stage_of(l.delivered,l.complete,l.under_review)) as item from public.request_lines l where upper(btrim(l.transaction_id::text)) = v_tx and l.deleted_at is null) x;
  return jsonb_build_object('ok', true, 'transaction_id', v_tx, 'received_date', v_received, 'expected_to', v_expected, 'overall_stage', v_stage, 'order_pct', v_pct, 'services', v_services);
end $function$;
revoke execute on function public.lookup_public_tracking_by_code_and_phone4(text, text, text) from public, authenticated;
grant execute on function public.lookup_public_tracking_by_code_and_phone4(text, text, text) to anon;
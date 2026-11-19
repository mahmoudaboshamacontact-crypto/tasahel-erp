-- =====================================================================
-- sql/courier-qr-deliver.sql
-- قفل التسليم بمسح QR الإيصال من بوابة المندوب (بدون خطوة توزيع مسبقة)
--
-- المتطلب المسبق: تشغيل sql/fix-phase4-security.sql أولاً
-- (يعتمد على: public.is_courier(), public.norm_ar(),
--  public.courier_p4_cod_due(), public.courier_trips,
--  public.courier_collection_events + trigger courier_collection_events_hist,
--  public.request_line_stage_history, public.audit_log)
--
-- قابل لإعادة التشغيل بأمان (Idempotent).
-- لا يعدّل دالة courier_apply_delivery (التسليم اليدوي من المكتب يبقى كما هو).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) أعمدة تتبع التسليم على public.courier_trips
-- ---------------------------------------------------------------------
alter table public.courier_trips
  add column if not exists delivered_to_name text,
  add column if not exists delivered_by_courier text,
  add column if not exists delivered_via text,
  add column if not exists delivered_at timestamptz;

alter table public.courier_trips
  drop constraint if exists courier_trips_delivered_via_chk;
alter table public.courier_trips
  add constraint courier_trips_delivered_via_chk
  check (delivered_via is null or delivered_via in ('qr', 'office'));

-- فهرس لحساب حد الـ 40 عملية تسليم في الساعة لكل مندوب بسرعة
create index if not exists courier_trips_qr_rate_idx
  on public.courier_trips (delivered_by_courier, delivered_at desc)
  where delivered_via = 'qr';

-- ---------------------------------------------------------------------
-- 2) دالة معاينة للقراءة فقط بعد مسح QR (لإظهار رقم المعاملة والمبلغ المطلوب
--    بدون قراءة جدول request_lines من المتصفح وبدون كشف أي بيانات عميل)
-- ---------------------------------------------------------------------
create or replace function public.courier_p4_preview_deliver_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_token text := btrim(coalesce(p_token, ''));
  v_tx text;
  v_total_lines integer := 0;
  v_delivered_lines integer := 0;
  v_not_complete integer := 0;
  v_under_review integer := 0;
  v_cancelled integer := 0;
  v_hour_count integer := 0;
  v_cod_due numeric(12,2) := 0;
begin
  -- صلاحية: مندوب نشط ومربوط بحسابه فقط
  if not public.is_courier() then
    raise exception 'courier only' using errcode = '42501';
  end if;
  select * into v_c
    from public.couriers
   where user_id = auth.uid() and active = true;
  if v_c.id is null then
    raise exception 'courier not linked' using errcode = '42501';
  end if;

  -- تحقق صيغة الرمز
  if v_token !~ '^[A-Za-z0-9_-]{16,128}$' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_or_not_ready',
      'message', 'الإيصال غير صالح أو غير جاهز للتسليم'
    );
  end if;

  -- جلب رقم المعاملة من tracking_token
  select l.transaction_id into v_tx
    from public.request_lines l
   where l.tracking_token = v_token
     and l.deleted_at is null
   limit 1;

  if v_tx is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_or_not_ready',
      'message', 'الإيصال غير صالح أو غير جاهز للتسليم'
    );
  end if;

  -- فحص جاهزية كل بنود المعاملة (all-or-nothing)
  select
    count(*),
    count(*) filter (where coalesce(l.delivered, false) = true),
    count(*) filter (where coalesce(l.complete, false) = false),
    count(*) filter (where coalesce(l.under_review, false) = true),
    count(*) filter (where lower(btrim(coalesce(l.status, ''))) in ('cancelled', 'canceled', 'ملغي', 'ملغى'))
  into v_total_lines, v_delivered_lines, v_not_complete, v_under_review, v_cancelled
  from public.request_lines l
  where l.transaction_id = v_tx
    and l.deleted_at is null;

  if v_total_lines = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_or_not_ready',
      'message', 'الإيصال غير صالح أو غير جاهز للتسليم'
    );
  end if;

  -- لو كل البنود اتسلّمت بالفعل
  if v_delivered_lines = v_total_lines then
    return jsonb_build_object(
      'ok', false,
      'code', 'already_delivered',
      'message', 'اتسلّمت قبل كده'
    );
  end if;

  -- أي بند غير مكتمل أو تحت المراجعة أو ملغي أو مسلّم جزئيًا
  if v_delivered_lines > 0 or v_not_complete > 0 or v_under_review > 0 or v_cancelled > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_or_not_ready',
      'message', 'الإيصال غير صالح أو غير جاهز للتسليم'
    );
  end if;

  -- الرمز صحيح والمعاملة مؤهلة: نتحقق من التوزيع لمندوب آخر نشط
  if exists (
       select 1
         from public.courier_trips t
         join public.couriers ac
           on ac.active = true
          and public.norm_ar(ac.name) = public.norm_ar(t.courier)
        where t.transaction_id = v_tx
          and t.kind = 'delivery'
          and public.norm_ar(t.courier) <> public.norm_ar(v_c.name)
     )
     or exists (
       select 1
         from public.request_lines l
         join public.couriers ac
           on ac.active = true
          and public.norm_ar(ac.name) = public.norm_ar(l.executor)
        where l.transaction_id = v_tx
          and l.deleted_at is null
          and public.norm_ar(l.service) like 'رسوم توصيل%'
          and public.norm_ar(l.executor) <> public.norm_ar(v_c.name)
     ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'assigned_other_courier',
      'message', 'موزعة على مندوب آخر، استخدم التحويل'
    );
  end if;

  -- حد أقصى 40 عملية قفل في الساعة للمندوب الواحد
  select count(*) into v_hour_count
    from public.courier_trips t
   where t.delivered_via = 'qr'
     and public.norm_ar(t.delivered_by_courier) = public.norm_ar(v_c.name)
     and t.delivered_at >= now() - interval '1 hour';

  if v_hour_count >= 40 then
    return jsonb_build_object(
      'ok', false,
      'code', 'rate_limited',
      'message', 'تجاوزت الحد الأقصى (40 عملية تسليم في الساعة) — تواصل مع المكتب'
    );
  end if;

  v_cod_due := coalesce(public.courier_p4_cod_due(v_tx), 0);

  return jsonb_build_object(
    'ok', true,
    'transaction_id', v_tx,
    'cod_due', round(v_cod_due, 2),
    'lines_count', v_total_lines
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3) الدالة الأساسية: قفل التسليم بمسح QR الإيصال (ذرية بالكامل)
-- ---------------------------------------------------------------------
create or replace function public.courier_p4_deliver_by_token(
  p_token text,
  p_recipient text,
  p_collected numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.couriers;
  v_token text := btrim(coalesce(p_token, ''));
  v_recipient text := btrim(coalesce(p_recipient, ''));
  v_tx text;
  v_day date := (now() at time zone 'Africa/Cairo')::date;
  v_now timestamptz := now();
  v_now_cairo text := to_char(v_now at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI');
  v_actor text := coalesce(auth.jwt()->>'email', 'courier');
  v_total_lines integer := 0;
  v_delivered_lines integer := 0;
  v_not_complete integer := 0;
  v_under_review integer := 0;
  v_cancelled integer := 0;
  v_hour_count integer := 0;
  v_cod_due numeric(12,2) := 0;
  v_coll numeric(12,2) := 0;
  v_client text;
  v_updated_count integer := 0;
  v_line record;
begin
  -- 1) صلاحية: مندوب نشط فقط (وإلا خطأ 42501)
  if not public.is_courier() then
    raise exception 'courier only' using errcode = '42501';
  end if;
  select * into v_c
    from public.couriers
   where user_id = auth.uid() and active = true;
  if v_c.id is null then
    raise exception 'courier not linked' using errcode = '42501';
  end if;

  -- 2) تحقق صيغة الرمز (رسالة عامة بدون أي بيانات عميل)
  if v_token !~ '^[A-Za-z0-9_-]{16,128}$' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_or_not_ready',
      'message', 'الإيصال غير صالح أو غير جاهز للتسليم'
    );
  end if;

  -- 3) تحويل p_token إلى المعاملة عن طريق request_lines.tracking_token
  select l.transaction_id into v_tx
    from public.request_lines l
   where l.tracking_token = v_token
     and l.deleted_at is null
   limit 1;

  if v_tx is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_or_not_ready',
      'message', 'الإيصال غير صالح أو غير جاهز للتسليم'
    );
  end if;

  -- 4) قفل كل بنود المعاملة النشطة FOR UPDATE داخل نفس الـ transaction
  perform 1
    from public.request_lines l
   where l.transaction_id = v_tx
     and l.deleted_at is null
   order by l.id
   for update;

  select
    count(*),
    count(*) filter (where coalesce(l.delivered, false) = true),
    count(*) filter (where coalesce(l.complete, false) = false),
    count(*) filter (where coalesce(l.under_review, false) = true),
    count(*) filter (where lower(btrim(coalesce(l.status, ''))) in ('cancelled', 'canceled', 'ملغي', 'ملغى')),
    max(l.client_name)
  into v_total_lines, v_delivered_lines, v_not_complete, v_under_review, v_cancelled, v_client
  from public.request_lines l
  where l.transaction_id = v_tx
    and l.deleted_at is null;

  if v_total_lines = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_or_not_ready',
      'message', 'الإيصال غير صالح أو غير جاهز للتسليم'
    );
  end if;

  -- الشرط (b): لو كلها delivered بالفعل ارجع رسالة واضحة بدون خطأ تقني
  if v_delivered_lines = v_total_lines then
    return jsonb_build_object(
      'ok', false,
      'code', 'already_delivered',
      'message', 'اتسلّمت قبل كده'
    );
  end if;

  -- الشرط (a) + تسليم جزئي سابق: أي فشل يرجع الرسالة العامة الموحدة
  if v_delivered_lines > 0 or v_not_complete > 0 or v_under_review > 0 or v_cancelled > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_or_not_ready',
      'message', 'الإيصال غير صالح أو غير جاهز للتسليم'
    );
  end if;

  -- 5) الرمز صحيح والمعاملة مؤهلة — الآن نتحقق من الشروط التفصيلية (c, e, d, التحصيل)

  -- الشرط (c): لو موزعة على مندوب آخر نشط ارفض
  if exists (
       select 1
         from public.courier_trips t
         join public.couriers ac
           on ac.active = true
          and public.norm_ar(ac.name) = public.norm_ar(t.courier)
        where t.transaction_id = v_tx
          and t.kind = 'delivery'
          and public.norm_ar(t.courier) <> public.norm_ar(v_c.name)
     )
     or exists (
       select 1
         from public.request_lines l
         join public.couriers ac
           on ac.active = true
          and public.norm_ar(ac.name) = public.norm_ar(l.executor)
        where l.transaction_id = v_tx
          and l.deleted_at is null
          and public.norm_ar(l.service) like 'رسوم توصيل%'
          and public.norm_ar(l.executor) <> public.norm_ar(v_c.name)
     ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'assigned_other_courier',
      'message', 'موزعة على مندوب آخر، استخدم التحويل'
    );
  end if;

  -- الشرط (e): حد أقصى 40 عملية قفل في الساعة للمندوب الواحد
  select count(*) into v_hour_count
    from public.courier_trips t
   where t.delivered_via = 'qr'
     and public.norm_ar(t.delivered_by_courier) = public.norm_ar(v_c.name)
     and t.delivered_at >= v_now - interval '1 hour';

  if v_hour_count >= 40 then
    return jsonb_build_object(
      'ok', false,
      'code', 'rate_limited',
      'message', 'تجاوزت الحد الأقصى (40 عملية تسليم في الساعة) — تواصل مع المكتب'
    );
  end if;

  -- الشرط (d): اسم المستلم إجباري (من 3 إلى 80 حرف بعد btrim)
  if char_length(v_recipient) < 3 or char_length(v_recipient) > 80 then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_recipient',
      'message', 'اسم المستلم إجباري (3 حروف على الأقل وبحد أقصى 80 حرف)'
    );
  end if;

  -- 6) التحصيل: حساب المطلوب من السيرفر عبر courier_p4_cod_due فقط
  v_cod_due := round(coalesce(public.courier_p4_cod_due(v_tx), 0), 2);
  if v_cod_due > 0 then
    -- لو يوم الكاش مقفول ومؤكد من الإدارة لا يمكن تسجيل تحصيل جديد اليوم
    if exists (
      select 1
        from public.courier_cash_handshakes h
       where h.courier_id = v_c.id
         and h.close_day = v_day
         and h.status = 'confirmed'
    ) then
      return jsonb_build_object(
        'ok', false,
        'code', 'day_locked',
        'message', 'تم تقفيل وتأكيد حساب اليوم من الإدارة — لا يمكن تسجيل تحصيل جديد اليوم'
      );
    end if;

    if p_collected is null or round(p_collected, 2) <> v_cod_due then
      return jsonb_build_object(
        'ok', false,
        'code', 'collection_required',
        'message', 'المطلوب تحصيله ' || v_cod_due::text || ' ج.م — لازم تدخل المبلغ المطلوب بالظبط',
        'cod_due', v_cod_due,
        'transaction_id', v_tx
      );
    end if;
    v_coll := round(p_collected, 2);
  end if;

  -- 7) التنفيذ الذري:
  -- 7.1) توزيع/تحديث مشوار التسليم على المندوب الحالي + حفظ بيانات التسليم
  insert into public.courier_trips (
    transaction_id, kind, courier, fee, trip_day, created_by,
    delivered_to_name, delivered_by_courier, delivered_via, delivered_at
  )
  values (
    v_tx, 'delivery', v_c.name, 40, v_day, v_actor,
    v_recipient, v_c.name, 'qr', v_now
  )
  on conflict (transaction_id, kind) do update
    set courier = case
          when exists (
            select 1 from public.courier_closing_items ci
             where ci.source_type = 'delivery'
               and ci.source_id = public.courier_trips.id
               and ci.released_at is null
          ) then public.courier_trips.courier
          else excluded.courier
        end,
        fee = case
          when exists (
            select 1 from public.courier_closing_items ci
             where ci.source_type = 'delivery'
               and ci.source_id = public.courier_trips.id
               and ci.released_at is null
          ) then public.courier_trips.fee
          else excluded.fee
        end,
        trip_day = case
          when public.norm_ar(public.courier_trips.courier) = public.norm_ar(excluded.courier)
               and public.courier_trips.courier_confirmed_at is not null
          then public.courier_trips.trip_day
          else excluded.trip_day
        end,
        created_by = excluded.created_by,
        delivered_to_name = excluded.delivered_to_name,
        delivered_by_courier = excluded.delivered_by_courier,
        delivered_via = excluded.delivered_via,
        delivered_at = excluded.delivered_at;

  -- 7.2) تحديث كل بنود المعاملة إلى Delivered (مع fallback لغياب delivered_date أو لو status عمود مولّد)
  begin
    update public.request_lines
       set status = 'Delivered',
           delivered = true,
           complete = true,
           under_review = false,
           delivered_date = v_day
     where transaction_id = v_tx
       and deleted_at is null;
  exception
    when undefined_column then
      begin
        update public.request_lines
           set status = 'Delivered',
               delivered = true,
               complete = true,
               under_review = false
         where transaction_id = v_tx
           and deleted_at is null;
      exception when sqlstate '428C9' then
        update public.request_lines
           set delivered = true,
               complete = true,
               under_review = false
         where transaction_id = v_tx
           and deleted_at is null;
      end;
    when sqlstate '428C9' then
      begin
        update public.request_lines
           set delivered = true,
               complete = true,
               under_review = false,
               delivered_date = v_day
         where transaction_id = v_tx
           and deleted_at is null;
      exception when undefined_column then
        update public.request_lines
           set delivered = true,
               complete = true,
               under_review = false
         where transaction_id = v_tx
           and deleted_at is null;
      end;
  end;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_total_lines then
    raise exception 'delivery status update was incomplete' using errcode = '40001';
  end if;

  -- 7.3) تسجيل التحصيل في نفس العملية بنفس منطق courier_p4_record_collection
  --      (trigger courier_collection_events_hist يسجل التعديل تلقائيًا في courier_collection_history)
  if v_cod_due > 0 then
    insert into public.courier_collection_events (
      collect_day, courier_id, courier_name, item_kind, transaction_id, client_name,
      original_amount, collected_amount, remaining_amount, payment_mode, instapay_ref, notes,
      created_by, updated_at
    )
    values (
      v_day, v_c.id, v_c.name, 'tx', v_tx, coalesce(v_client, v_tx),
      v_cod_due, v_coll, 0, 'cash_full', null,
      'تحصيل عند التسليم عبر QR — المستلم: ' || v_recipient,
      auth.uid(), v_now
    )
    on conflict (courier_id, collect_day, transaction_id) do update
      set original_amount = excluded.original_amount,
          collected_amount = excluded.collected_amount,
          remaining_amount = excluded.remaining_amount,
          payment_mode = excluded.payment_mode,
          instapay_ref = excluded.instapay_ref,
          notes = excluded.notes,
          updated_at = v_now;

    begin
      insert into public.tx_comments (transaction_id, author_id, author_name, body)
      values (
        v_tx,
        auth.uid(),
        v_c.name,
        'تحديث تحصيل ميداني (تحصيل كاش كامل عند التسليم عبر QR) — المحصل: ' ||
        v_coll::text || ' ج.م من أصل ' || v_cod_due::text || ' ج.م (المتبقي: 0 ج.م) — المستلم: ' || v_recipient
      );
    exception when others then
      raise warning 'qr deliver collection comment failed: %', sqlerrm;
    end;
  end if;

  -- 7.4) إضافة سطر في السجل الزمني لكل بند في request_line_stage_history
  for v_line in
    select l.id
      from public.request_lines l
     where l.transaction_id = v_tx
       and l.deleted_at is null
     order by l.id
  loop
    insert into public.request_line_stage_history (
      line_id, stage_from, stage_to, changed_by, changed_at, notes
    )
    values (
      v_line.id,
      'Complete',
      'تم التسليم',
      v_c.name,
      v_now,
      'تم التسليم عبر QR — المندوب: ' || v_c.name ||
      ' — المستلم: ' || v_recipient ||
      ' — الوقت: ' || v_now_cairo ||
      case when v_cod_due > 0 then ' — تحصيل: ' || v_coll::text || ' ج.م' else '' end
    );
  end loop;

  -- وأيضًا في audit_log ليظهر في سجل تغييرات المعاملة الموحّد بالواجهة
  insert into public.audit_log (transaction_id, action, service, user_name, details)
  values (
    v_tx,
    'updated',
    'تسليم عبر QR',
    v_c.name,
    jsonb_build_object(
      'delivered', jsonb_build_object('old', false, 'new', true),
      'الحالة', 'تم التسليم',
      'المندوب', v_c.name,
      'المستلم', v_recipient,
      'الوقت', v_now_cairo,
      'الطريقة', 'qr',
      'التحصيل', v_cod_due
    )
  );

  -- تعليق ظاهر في السجل الزمني بالمستلم والمندوب (سطر audit_log لا يعرض التفاصيل)
  begin
    insert into public.tx_comments (transaction_id, author_id, author_name, body)
    values (v_tx, auth.uid(), v_c.name,
            'تم التسليم عبر QR — المندوب: ' || v_c.name || ' — المستلم: ' || v_recipient || ' — ' || v_now_cairo);
  exception when others then
    raise warning 'qr deliver timeline comment failed: %', sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true,
    'transaction_id', v_tx,
    'recipient', v_recipient,
    'lines_count', v_total_lines
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4) الصلاحيات (نفس نمط fix-phase4-security.sql)
-- ---------------------------------------------------------------------
revoke all on function public.courier_p4_preview_deliver_by_token(text) from public, anon;
grant execute on function public.courier_p4_preview_deliver_by_token(text) to authenticated;

revoke all on function public.courier_p4_deliver_by_token(text, text, numeric) from public, anon;
grant execute on function public.courier_p4_deliver_by_token(text, text, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- 5) استعلام تحقق: لازم يطلع anon_can_execute = false لكل الدوال
-- ---------------------------------------------------------------------
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (
     'courier_p4_deliver_by_token',
     'courier_p4_preview_deliver_by_token'
   )
 order by p.proname;

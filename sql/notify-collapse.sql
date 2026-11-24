-- إشعار واحد مجمّع بدل إشعار لكل حدث: لو المندوب عنده إشعار من نفس النوع لسه ما اتقراش من آخر 12 ساعة،
-- بنحدّثه (العدد + آخر معاملة) بدل ما نضيف واحد جديد. إضافة دالة + تعديل دالتين تريجر فقط.
create or replace function public.notify_collapse(p_uid uuid, p_title text, p_tx text, p_extra text default '')
returns void language plpgsql security definer
set search_path to 'public', 'pg_catalog' as $$
declare v_id bigint; v_n int;
begin
  select id, coalesce(nullif(substring(body from '^(\d+)'), '')::int, 1) into v_id, v_n
    from notifications
   where user_id = p_uid and kind = 'info' and title = p_title and not coalesce(read, false)
     and created_at > now() - interval '12 hours'
   order by created_at desc limit 1;
  if v_id is null then
    insert into notifications(user_id, kind, title, body)
    values (p_uid, 'info', p_title, '1 · آخرها المعاملة ' || coalesce(p_tx, '—') || p_extra);
  else
    update notifications set body = (v_n + 1) || ' · آخرها المعاملة ' || coalesce(p_tx, '—') || p_extra,
                             created_at = now()
     where id = v_id;
  end if;
end $$;
revoke all on function public.notify_collapse(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.trg_courier_ops_trip_notice()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid;
begin
  if coalesce(current_setting('app.skip_trip_notice', true), '') = '1' then return new; end if;
  if tg_op = 'UPDATE' and new.courier is not distinct from old.courier
     and new.fee is not distinct from old.fee and new.trip_day is not distinct from old.trip_day
     and new.transaction_id is not distinct from old.transaction_id and new.kind is not distinct from old.kind then return new; end if;
  select c.user_id into v_uid from public.couriers c
   where c.active and c.user_id is not null and public.norm_ar(c.name) = public.norm_ar(new.courier) limit 1;
  if v_uid is not null then
    perform public.notify_collapse(v_uid,
      case when tg_op = 'INSERT' then 'مشاوير جديدة اتسجلت باسمك (العدد أول الرقم)' else 'مشاوير اتعدلت (العدد أول الرقم)' end,
      new.transaction_id);
  end if;
  return new;
end $$;

create or replace function public.trg_courier_ops_fee_notice()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid;
begin
  if tg_op = 'UPDATE' and new.executor is not distinct from old.executor and new.exec_total is not distinct from old.exec_total
     and new.exec_unit_cost is not distinct from old.exec_unit_cost and new.qty is not distinct from old.qty
     and new.received_at is not distinct from old.received_at and new.service is not distinct from old.service then return new; end if;
  if new.deleted_at is not null or public.norm_ar(new.service) not like 'رسوم توصيل%' then return new; end if;
  select c.user_id into v_uid from public.couriers c
   where c.active and c.user_id is not null and public.norm_ar(c.name) = public.norm_ar(new.executor) limit 1;
  if v_uid is not null then
    perform public.notify_collapse(v_uid,
      case when tg_op = 'INSERT' then 'رسوم توصيل جديدة باسمك (العدد أول الرقم)' else 'رسوم توصيل اتعدلت (العدد أول الرقم)' end,
      new.transaction_id);
  end if;
  return new;
end $$;

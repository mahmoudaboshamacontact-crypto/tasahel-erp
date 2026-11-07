-- الجزء ي: إشعارات الدفع (Web Push) — مرحلة 10. شغّله مرة واحدة في Supabase SQL Editor (idempotent).
-- كل صف جديد في notifications بيتحوّل تلقائياً لإشعار على أجهزة صاحبه (لو مفعّل).
create extension if not exists pg_net;

-- 1) اشتراكات الأجهزة: كل موظف يشوف ويدير اشتراكاته بس
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_sub_select on public.push_subscriptions;
drop policy if exists push_sub_insert on public.push_subscriptions;
drop policy if exists push_sub_update on public.push_subscriptions;
drop policy if exists push_sub_delete on public.push_subscriptions;
create policy push_sub_select on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_sub_insert on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_sub_update on public.push_subscriptions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_sub_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

-- 2) إعداد الإرسال (صف واحد): رابط الدالة + السر. RLS شغال من غير أي policy = مفيش وصول من التطبيق خالص،
--    والـ trigger بس (security definer) هو اللي بيقراه.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  fn_url text not null,
  secret text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

-- 3) Trigger: إشعار جديد → استدعاء Edge Function send-push (لو فيه اشتراك للمستلم). مش بيكسر الإدخال لو حصل خطأ.
create or replace function public.notify_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare cfg record;
begin
  if new.user_id is null then return new; end if;
  if not exists (select 1 from public.push_subscriptions where user_id = new.user_id) then return new; end if;
  select fn_url, secret into cfg from public.push_config where id = 1;
  if cfg.fn_url is null then return new; end if;
  begin
    perform net.http_post(
      url := cfg.fn_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', cfg.secret),
      body := jsonb_build_object('user_id', new.user_id, 'title', left(coalesce(new.title, 'تساهيل'), 80), 'body', left(coalesce(new.body, ''), 160), 'kind', new.kind)
    );
  exception when others then null;
  end;
  return new;
end $$;
revoke all on function public.notify_push() from public, anon, authenticated;

drop trigger if exists trg_notify_push on public.notifications;
create trigger trg_notify_push after insert on public.notifications
  for each row execute function public.notify_push();

-- 4) بعد النشر: شغّل ده مرة واحدة (بدّل القيم). السر لازم يساوي Secret اسمه CRON_SECRET في Edge Functions.
-- insert into public.push_config (id, fn_url, secret)
-- values (1, 'https://<project-ref>.supabase.co/functions/v1/send-push', '<CRON_SECRET>')
-- on conflict (id) do update set fn_url = excluded.fn_url, secret = excluded.secret;

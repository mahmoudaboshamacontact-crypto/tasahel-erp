-- =====================================================================
-- sql/courier-zones.sql (المرحلة 2: جدول ربط المناطق بالمناديب + عمود zone_key)
-- قابل لإعادة التشغيل بأمان (Idempotent) — يُشغّل يدوياً في Supabase SQL Editor
-- لا يحذف ولا يعدّل courier_zone_routes أو أي جدول قديم، ولا يغيّر عمود zone.
-- =====================================================================

-- 1) جدول المناطق وربطها بالمناديب
create table if not exists public.courier_zones (
  zone_key text primary key,
  area_key text not null,
  courier_id bigint references public.couriers(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint courier_zones_zone_nonempty check (btrim(zone_key) <> ''),
  constraint courier_zones_area_nonempty check (btrim(area_key) <> '')
);

create index if not exists courier_zones_area_idx
  on public.courier_zones (area_key, courier_id);

create index if not exists courier_zones_courier_idx
  on public.courier_zones (courier_id);

-- 2) قيد: كل area_key ليه مندوب واحد بس (لا يمكن ربط نفس المنطقة الكبيرة بمندوبين مختلفين)
create or replace function public.trg_courier_zones_one_courier_per_area()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.zone_key := btrim(coalesce(new.zone_key, ''));
  new.area_key := btrim(coalesce(new.area_key, ''));
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, auth.uid());

  if new.courier_id is not null then
    if exists (
      select 1
        from public.courier_zones cz
       where cz.area_key = new.area_key
         and cz.zone_key <> new.zone_key
         and cz.courier_id is not null
         and cz.courier_id <> new.courier_id
    ) then
      raise exception 'المنطقة الكبيرة (%) مربوطة بمندوب آخر بالفعل — كل منطقة كبيرة لها مندوب واحد فقط', new.area_key
        using errcode = '23505';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.trg_courier_zones_one_courier_per_area() from public, anon, authenticated;

drop trigger if exists courier_zones_one_courier_per_area_trg on public.courier_zones;
create trigger courier_zones_one_courier_per_area_trg
  before insert or update on public.courier_zones
  for each row execute function public.trg_courier_zones_one_courier_per_area();

-- 3) تفعيل RLS على الجدول الجديد فقط (الموظف يقرأ، والمدير يكتب، والمندوب ممنوع من الوصول المباشر)
alter table public.courier_zones enable row level security;

revoke all on public.courier_zones from public, anon;
grant select, insert, update, delete on public.courier_zones to authenticated;

drop policy if exists courier_block on public.courier_zones;
create policy courier_block on public.courier_zones
  as restrictive for all to authenticated
  using (not (select public.is_courier()))
  with check (not (select public.is_courier()));

drop policy if exists cz_select_staff on public.courier_zones;
create policy cz_select_staff on public.courier_zones
  for select to authenticated
  using ((select public.is_staff()) or (select public.is_manager()));

drop policy if exists cz_write_mgr on public.courier_zones;
create policy cz_write_mgr on public.courier_zones
  for all to authenticated
  using ((select public.is_manager()))
  with check ((select public.is_manager()));

-- 4) إضافة عمود zone_key على جدول pickup_tickets بدون لمس عمود zone القديم
alter table public.pickup_tickets
  add column if not exists zone_key text;

create index if not exists pickup_tickets_zone_key_idx
  on public.pickup_tickets (zone_key)
  where zone_key is not null;

-- 5) البيانات الأولية (توزيع الأحياء على المناديب حسب أسمائهم في public.couriers)
--    يستخدم public.norm_ar للمطابقة الدقيقة بين (مصطفى/مصطفي)، ويُسجّل NOTICE لو اسم مش موجود بدون تخمين.
do $$
declare
  v_samir   bigint;
  v_ali     bigint;
  v_mostafa bigint;
  v_taha    bigint;
begin
  select id into v_samir
    from public.couriers
   where active = true
     and (public.norm_ar(name) = public.norm_ar('سمير محمد')
          or public.norm_ar(name) like public.norm_ar('سمير') || ' %'
          or public.norm_ar(name) = public.norm_ar('سمير'))
   order by id limit 1;

  select id into v_ali
    from public.couriers
   where active = true
     and (public.norm_ar(name) = public.norm_ar('علي صالح')
          or public.norm_ar(name) like public.norm_ar('علي') || ' %'
          or public.norm_ar(name) = public.norm_ar('علي'))
   order by id limit 1;

  select id into v_mostafa
    from public.couriers
   where active = true
     and (public.norm_ar(name) = public.norm_ar('مصطفي محمد')
          or public.norm_ar(name) like public.norm_ar('مصطفى') || ' %'
          or public.norm_ar(name) = public.norm_ar('مصطفى'))
   order by id limit 1;

  select id into v_taha
    from public.couriers
   where active = true
     and public.norm_ar(name) = public.norm_ar('محمد طه')
   order by id limit 1;

  if v_samir is null then raise notice 'courier_zones seed: لم يُعثر على مندوب نشط باسم سمير'; end if;
  if v_ali is null then raise notice 'courier_zones seed: لم يُعثر على مندوب نشط باسم علي'; end if;
  if v_mostafa is null then raise notice 'courier_zones seed: لم يُعثر على مندوب نشط باسم مصطفى'; end if;
  if v_taha is null then raise notice 'courier_zones seed: لم يُعثر على مندوب نشط باسم محمد طه'; end if;

  insert into public.courier_zones (zone_key, area_key, courier_id)
  values
    -- شرق وشمال ووسط القاهرة (سمير) — 15 حي
    ('شبرا',            'east_north_cairo', v_samir),
    ('مدينة نصر',       'east_north_cairo', v_samir),
    ('مصر الجديدة',     'east_north_cairo', v_samir),
    ('النزهة',          'east_north_cairo', v_samir),
    ('شيراتون',         'east_north_cairo', v_samir),
    ('وسط البلد',       'east_north_cairo', v_samir),
    ('رمسيس',           'east_north_cairo', v_samir),
    ('العباسية',        'east_north_cairo', v_samir),
    ('الوايلي',         'east_north_cairo', v_samir),
    ('جسر السويس',      'east_north_cairo', v_samir),
    ('عين شمس',         'east_north_cairo', v_samir),
    ('المرج',           'east_north_cairo', v_samir),
    ('المطرية',         'east_north_cairo', v_samir),
    ('الزيتون',         'east_north_cairo', v_samir),
    ('حدائق القبة',     'east_north_cairo', v_samir),

    -- القاهرة الجديدة والمدن الشرقية (علي) — 9 أحياء
    ('بدر',             'new_cairo_east', v_ali),
    ('العبور',          'new_cairo_east', v_ali),
    ('القاهرة الجديدة', 'new_cairo_east', v_ali),
    ('التجمع',          'new_cairo_east', v_ali),
    ('القطامية',        'new_cairo_east', v_ali),
    ('مدينتي',          'new_cairo_east', v_ali),
    ('الرحاب',          'new_cairo_east', v_ali),
    ('المستقبل',        'new_cairo_east', v_ali),
    ('الشروق',          'new_cairo_east', v_ali),

    -- جنوب القاهرة: المعادي والمقطم وحلوان (مصطفى) — 10 أحياء
    ('المعادي',         'south_cairo', v_mostafa),
    ('زهراء المعادي',   'south_cairo', v_mostafa),
    ('حلوان',           'south_cairo', v_mostafa),
    ('حدائق حلوان',     'south_cairo', v_mostafa),
    ('المعصرة',         'south_cairo', v_mostafa),
    ('المقطم',          'south_cairo', v_mostafa),
    ('دار السلام',      'south_cairo', v_mostafa),
    ('البساتين',        'south_cairo', v_mostafa),
    ('المنيل',          'south_cairo', v_mostafa),
    ('السيدة زينب',     'south_cairo', v_mostafa),

    -- محافظة الجيزة وأكتوبر وزايد والزمالك (محمد طه) — 19 حي
    ('الجيزة',          'giza', v_taha),
    ('الدقي',           'giza', v_taha),
    ('المهندسين',       'giza', v_taha),
    ('الزمالك',         'giza', v_taha),
    ('فيصل',            'giza', v_taha),
    ('الهرم',           'giza', v_taha),
    ('حدائق الأهرام',   'giza', v_taha),
    ('الطالبية',        'giza', v_taha),
    ('المريوطية',       'giza', v_taha),
    ('العجوزة',         'giza', v_taha),
    ('إمبابة',          'giza', v_taha),
    ('بولاق',           'giza', v_taha),
    ('الوراق',          'giza', v_taha),
    ('العمرانية',       'giza', v_taha),
    ('المنيب',          'giza', v_taha),
    ('6 أكتوبر',        'giza', v_taha),
    ('الشيخ زايد',      'giza', v_taha),
    ('الحوامدية',       'giza', v_taha),
    ('البدرشين',        'giza', v_taha),

    -- غير مربوط (خارج التغطية حالياً — بدون مندوب) — 2
    ('القليوبية',        'unassigned', null),
    ('المحافظات الأخرى', 'unassigned', null)
  on conflict (zone_key) do update
    set area_key   = excluded.area_key,
        courier_id = coalesce(public.courier_zones.courier_id, excluded.courier_id),
        updated_at = now();
end $$;

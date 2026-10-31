-- أمان 2 (اختياري — بيغيّر سلوك): بيخلي إقفال الشهور وكتالوج الخدمات والإجازات للمدير بس.
-- شغّله بس لو الموظفين العاديين مش المفروض يعدّلوا دول. ولو في موظف بيحتاج يعدّل ابعتلي.
drop policy if exists allow_write_closures on public.month_closures;   -- closures_write (مدير) فاضلة

drop policy if exists team_all on public.services;
drop policy if exists services_read on public.services;
drop policy if exists services_write on public.services;
create policy services_read  on public.services for select to authenticated using (public.is_staff());
create policy services_write on public.services for all    to authenticated using (public.is_manager()) with check (public.is_manager());

drop policy if exists team_all on public.holidays;
drop policy if exists holidays_read on public.holidays;
drop policy if exists holidays_write on public.holidays;
create policy holidays_read  on public.holidays for select to authenticated using (public.is_staff());
create policy holidays_write on public.holidays for all    to authenticated using (public.is_manager()) with check (public.is_manager());

-- ===== Rollback =====
-- create policy allow_write_closures on public.month_closures for all to authenticated using (true) with check (true);
-- drop policy services_read on public.services; drop policy services_write on public.services;
-- create policy team_all on public.services for all to authenticated using (true) with check (true);
-- drop policy holidays_read on public.holidays; drop policy holidays_write on public.holidays;
-- create policy team_all on public.holidays for all to authenticated using (true) with check (true);

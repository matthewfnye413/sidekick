-- Instructors can view and correct any student's checklist in their school
-- (for example, an item checked by mistake, or a student who isn't keeping their page up to date).
-- Every check-off records who made it.

alter table public.progress add column if not exists checked_by uuid default auth.uid();

create policy "Staff check off" on public.progress for insert
  with check (public.is_staff(public.student_school(student_id)));

create policy "Staff uncheck" on public.progress for delete
  using (public.is_staff(public.student_school(student_id)));

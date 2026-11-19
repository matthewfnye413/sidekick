-- Rank certificates: instructors upload each student's certificate (PDF) for a rank they've earned.
-- Files live in a PRIVATE storage bucket at  <school_id>/<student_id>/<rank_id>.pdf
-- Staff manage their school's files; a family can only read their own students' certificates.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificates', 'certificates', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create table if not exists public.certificates (
  student_id uuid not null references public.students on delete cascade,
  rank_id uuid not null references public.ranks on delete cascade,
  path text not null,
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (student_id, rank_id)
);

alter table public.certificates enable row level security;
create policy "Staff manage certificates" on public.certificates for all
  using (public.is_staff(public.student_school(student_id)))
  with check (public.is_staff(public.student_school(student_id)));
create policy "Families see their certificates" on public.certificates for select
  using (public.owns_student(student_id));
grant select, insert, update, delete on public.certificates to authenticated;

create policy "Staff manage certificate files" on storage.objects for all to authenticated
  using (bucket_id = 'certificates' and public.is_staff(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'certificates' and public.is_staff(((storage.foldername(name))[1])::uuid));
create policy "Families read their certificate files" on storage.objects for select to authenticated
  using (bucket_id = 'certificates' and public.owns_student(((storage.foldername(name))[2])::uuid));

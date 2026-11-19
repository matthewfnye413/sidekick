-- Rank-gated curriculum: each school decides how much of the curriculum a student can see,
-- and instructors can unlock specific higher ranks for individual students.
-- Enforced by Row Level Security, so hidden ranks are withheld by the database itself.

alter table public.schools
  add column if not exists curriculum_visibility text not null default 'learned_and_current'
  check (curriculum_visibility in ('current_only', 'learned_and_current', 'full'));

create table if not exists public.rank_unlocks (
  student_id uuid not null references public.students on delete cascade,
  rank_id uuid not null references public.ranks on delete cascade,
  granted_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (student_id, rank_id)
);

-- Can the caller see this rank's requirements?
create or replace function public.can_view_rank(p_rank uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.ranks r
    join public.schools sc on sc.id = r.school_id
    where r.id = p_rank
      and (
        public.is_staff(r.school_id)
        or (public.is_member(r.school_id) and (
              sc.curriculum_visibility = 'full'
              or exists (
                select 1 from public.students s
                where s.account_id = auth.uid() and s.program_id = r.program_id and (
                  (sc.curriculum_visibility = 'current_only' and r.sort = s.current_rank_sort + 1)
                  or (sc.curriculum_visibility = 'learned_and_current' and r.sort <= s.current_rank_sort + 1)
                  or exists (select 1 from public.rank_unlocks u where u.student_id = s.id and u.rank_id = r.id)
                ))
        ))
      )
  );
$$;

drop policy if exists "Members read ranks" on public.ranks;
create policy "Read ranks you are allowed to see" on public.ranks for select using (public.can_view_rank(id));

-- Students/parents get every rank NAME (so they can see the path) but requirements only where allowed.
create or replace function public.student_curriculum(p_program uuid)
returns table (id uuid, sort int, name text, color text, timeframe text, requirements jsonb, locked boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.sort, r.name, r.color, r.timeframe,
         case when public.can_view_rank(r.id) then r.requirements else null end,
         not public.can_view_rank(r.id)
  from public.ranks r
  join public.programs p on p.id = r.program_id
  where r.program_id = p_program and public.is_member(p.school_id)
  order by r.sort;
$$;

-- Promotions are staff-only.
create or replace function public.set_student_rank(p_student uuid, p_sort int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff(public.student_school(p_student)) then
    raise exception 'Only instructors can change a student''s rank';
  end if;
  update public.students set current_rank_sort = greatest(p_sort, 0) where id = p_student;
end;
$$;

-- Families can still rename their students, but not change rank directly.
revoke update on public.students from authenticated;
grant update (name) on public.students to authenticated;

-- A student added by a family starts at the starting rank; an instructor sets the real rank.
create or replace function public.students_rank_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff(new.school_id) then
    new.current_rank_sort := 0;
  end if;
  return new;
end;
$$;
drop trigger if exists students_rank_guard on public.students;
create trigger students_rank_guard before insert on public.students
  for each row execute function public.students_rank_guard();

-- Only check off techniques you are allowed to see.
drop policy if exists "Check off" on public.progress;
create policy "Check off" on public.progress for insert
  with check (public.owns_student(student_id) and public.is_member(public.student_school(student_id))
              and public.can_view_rank(rank_id));

alter table public.rank_unlocks enable row level security;
create policy "Staff manage unlocks" on public.rank_unlocks for all
  using (public.is_staff(public.student_school(student_id)))
  with check (public.is_staff(public.student_school(student_id)));
create policy "Families see their unlocks" on public.rank_unlocks for select
  using (public.owns_student(student_id));

grant update (curriculum_visibility) on public.schools to authenticated;
grant select, insert, delete on public.rank_unlocks to authenticated;
grant execute on function public.can_view_rank(uuid), public.student_curriculum(uuid),
  public.set_student_rank(uuid, int) to authenticated;
revoke execute on function public.set_student_rank(uuid, int) from anon, public;

-- SideKick — multi-school database.
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- Security model: every row belongs to a school. Row Level Security lets people see only
-- the schools they belong to. The SideKick backend talks to this database AS THE LOGGED-IN
-- USER (never with a master key), so the agents inherit exactly the same limits.

-- ─── Schools & memberships ───────────────────────────────────────────────────
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  monthly_token_budget int not null default 2000000,
  created_at timestamptz not null default now()
);

create table public.memberships (
  school_id uuid not null references public.schools on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'student' check (role in ('owner', 'instructor', 'student')),
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive')),
  full_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  primary key (school_id, user_id)
);

create function public.is_member(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships
                 where school_id = sid and user_id = auth.uid() and status = 'active');
$$;

create function public.is_staff(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships
                 where school_id = sid and user_id = auth.uid() and status = 'active'
                   and role in ('owner', 'instructor'));
$$;

alter table public.schools enable row level security;
alter table public.memberships enable row level security;

create policy "Members see their schools" on public.schools for select
  using (exists (select 1 from public.memberships m where m.school_id = id and m.user_id = auth.uid()));
create policy "Owners rename their school" on public.schools for update
  using (public.is_staff(id)) with check (public.is_staff(id));

create policy "See own membership; staff see all in school" on public.memberships for select
  using (user_id = auth.uid() or public.is_staff(school_id));

-- Create a school: the caller becomes its active owner.
create function public.create_school(p_name text, p_slug text, p_full_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.schools (name, slug) values (p_name, lower(p_slug)) returning id into sid;
  insert into public.memberships (school_id, user_id, role, status, full_name, email)
  values (sid, auth.uid(), 'owner', 'active', p_full_name,
          coalesce((select email from auth.users where id = auth.uid()), ''));
  return sid;
end;
$$;

-- Join a school by its code (slug): pending until staff approve.
create function public.join_school(p_slug text, p_full_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into sid from public.schools where slug = lower(p_slug);
  if sid is null then raise exception 'No school with that code'; end if;
  insert into public.memberships (school_id, user_id, full_name, email)
  values (sid, auth.uid(), p_full_name, coalesce((select email from auth.users where id = auth.uid()), ''))
  on conflict (school_id, user_id) do nothing;
  return sid;
end;
$$;

-- Staff approve / deactivate members; only owners can make instructors.
create function public.set_membership(p_school uuid, p_user uuid, p_status text, p_role text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff(p_school) then raise exception 'Only school staff can do that'; end if;
  if p_role is not null and p_role <> 'student' and not exists (
       select 1 from public.memberships where school_id = p_school and user_id = auth.uid()
         and role = 'owner' and status = 'active') then
    raise exception 'Only the owner can make instructors';
  end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own membership'; end if;
  update public.memberships
     set status = coalesce(p_status, status), role = coalesce(p_role, role)
   where school_id = p_school and user_id = p_user and role <> 'owner';
end;
$$;

-- ─── Curriculum ──────────────────────────────────────────────────────────────
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools on delete cascade,
  name text not null,
  starting_rank text not null default 'White Belt',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table public.ranks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools on delete cascade,
  program_id uuid not null references public.programs on delete cascade,
  sort int not null,
  name text not null,
  color text not null default '#9ca3af',
  timeframe text,
  requirements jsonb not null default '[]'
);

alter table public.programs enable row level security;
alter table public.ranks enable row level security;
create policy "Members read programs" on public.programs for select using (public.is_member(school_id));
create policy "Members read ranks" on public.ranks for select using (public.is_member(school_id));

-- ─── Curriculum imports (agent drafts awaiting human approval) ───────────────
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools on delete cascade,
  created_by uuid not null default auth.uid() references auth.users,
  program_name text not null,
  files text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'discarded')),
  draft jsonb not null,
  issues jsonb not null default '[]',
  summary text,
  usage jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

alter table public.imports enable row level security;
create policy "Staff read imports" on public.imports for select using (public.is_staff(school_id));
create policy "Staff create imports" on public.imports for insert
  with check (public.is_staff(school_id) and created_by = auth.uid() and status = 'draft');
create policy "Staff edit draft imports" on public.imports for update
  using (public.is_staff(school_id) and status = 'draft') with check (public.is_staff(school_id));

-- Publish: the ONLY way agent output reaches students, and only a staff member can call it.
create function public.publish_import(p_import uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare imp public.imports; pid uuid; b jsonb; i int := 0;
begin
  select * into imp from public.imports where id = p_import;
  if imp.id is null or not public.is_staff(imp.school_id) then raise exception 'Not allowed'; end if;
  if imp.status <> 'draft' then raise exception 'This import was already %', imp.status; end if;

  insert into public.programs (school_id, name, starting_rank)
  values (imp.school_id, imp.program_name, coalesce(imp.draft ->> 'starting_rank', 'White Belt'))
  on conflict (school_id, name) do update set starting_rank = excluded.starting_rank
  returning id into pid;

  delete from public.ranks where program_id = pid;  -- re-publishing replaces the old version
  for b in select * from jsonb_array_elements(imp.draft -> 'belts') loop
    i := i + 1;
    insert into public.ranks (school_id, program_id, sort, name, color, timeframe, requirements)
    values (imp.school_id, pid, i, b ->> 'name', coalesce(b ->> 'color_hex', '#9ca3af'),
            b ->> 'timeframe', coalesce(b -> 'requirements', '[]'::jsonb));
  end loop;

  update public.imports set status = 'published', published_at = now() where id = p_import;
  return pid;
end;
$$;

-- ─── Students, progress, attendance ──────────────────────────────────────────
create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools on delete cascade,
  account_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  program_id uuid not null references public.programs on delete cascade,
  current_rank_sort int not null default 0,   -- 0 = starting rank, 1 = first rank in `ranks`, ...
  created_at timestamptz not null default now()
);

create table public.progress (
  student_id uuid not null references public.students on delete cascade,
  rank_id uuid not null references public.ranks on delete cascade,
  item_key text not null,
  created_at timestamptz not null default now(),
  primary key (student_id, rank_id, item_key)
);

create table public.attendance (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools on delete cascade,
  student_id uuid not null references public.students on delete cascade,
  class_date date not null default current_date,
  checked_in_by uuid default auth.uid(),
  unique (student_id, class_date)
);

create function public.owns_student(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.students where id = sid and account_id = auth.uid());
$$;

create function public.student_school(sid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select school_id from public.students where id = sid;
$$;

alter table public.students enable row level security;
alter table public.progress enable row level security;
alter table public.attendance enable row level security;

create policy "Owners and staff read students" on public.students for select
  using ((account_id = auth.uid() and public.is_member(school_id)) or public.is_staff(school_id));
create policy "Members add own students" on public.students for insert
  with check (account_id = auth.uid() and public.is_member(school_id));
create policy "Owners and staff update students" on public.students for update
  using ((account_id = auth.uid() and public.is_member(school_id)) or public.is_staff(school_id))
  with check (public.is_member(school_id));
create policy "Owners and staff remove students" on public.students for delete
  using ((account_id = auth.uid() and public.is_member(school_id)) or public.is_staff(school_id));

create policy "Read progress" on public.progress for select
  using (public.owns_student(student_id) or public.is_staff(public.student_school(student_id)));
create policy "Check off" on public.progress for insert
  with check (public.owns_student(student_id) and public.is_member(public.student_school(student_id)));
create policy "Uncheck" on public.progress for delete
  using (public.owns_student(student_id) and public.is_member(public.student_school(student_id)));

create policy "Staff manage attendance" on public.attendance for all
  using (public.is_staff(school_id)) with check (public.is_staff(school_id));

-- ─── Lesson plans + AI usage ─────────────────────────────────────────────────
create table public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools on delete cascade,
  created_by uuid not null default auth.uid() references auth.users,
  request jsonb not null,
  plan jsonb not null,
  usage jsonb,
  created_at timestamptz not null default now()
);
alter table public.lesson_plans enable row level security;
create policy "Staff read plans" on public.lesson_plans for select using (public.is_staff(school_id));
create policy "Staff save plans" on public.lesson_plans for insert
  with check (public.is_staff(school_id) and created_by = auth.uid());

-- Append-only token log: nobody (not even the owner) can edit or delete rows,
-- so the monthly budget can't be "reset" by tampering with history.
create table public.usage_events (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools on delete cascade,
  user_id uuid not null default auth.uid(),
  kind text not null,
  input_tokens int not null check (input_tokens >= 0),
  cached_input_tokens int not null default 0 check (cached_input_tokens >= 0),
  output_tokens int not null check (output_tokens >= 0),
  est_cost_usd numeric(10, 5) not null default 0 check (est_cost_usd >= 0),
  created_at timestamptz not null default now()
);
alter table public.usage_events enable row level security;
create policy "Staff read usage" on public.usage_events for select using (public.is_staff(school_id));
create policy "Staff log usage" on public.usage_events for insert
  with check (public.is_staff(school_id) and user_id = auth.uid());

create function public.tokens_used_this_month(p_school uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(input_tokens + output_tokens), 0) from public.usage_events
  where school_id = p_school and created_at >= date_trunc('month', now());
$$;

-- ─── API access (explicit, because "expose new tables" is off) ───────────────
grant usage on schema public to anon, authenticated;
grant select on public.schools, public.memberships, public.programs, public.ranks to authenticated;
grant update (name) on public.schools to authenticated;
grant select, insert, update on public.imports to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, delete on public.progress to authenticated;
grant select, insert, update, delete on public.attendance to authenticated;
grant select, insert on public.lesson_plans, public.usage_events to authenticated;
grant execute on function public.is_member(uuid), public.is_staff(uuid), public.owns_student(uuid),
  public.student_school(uuid), public.create_school(text, text, text), public.join_school(text, text),
  public.set_membership(uuid, uuid, text, text), public.publish_import(uuid),
  public.tokens_used_this_month(uuid) to authenticated;
revoke execute on function public.create_school(text, text, text), public.join_school(text, text),
  public.set_membership(uuid, uuid, text, text), public.publish_import(uuid) from anon, public;

-- Supabase schema for QR-ATT.
-- Safe to re-run in the SQL editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  title text not null,
  start_time timestamptz,
  end_time timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint events_time_order check (
    end_time is null or start_time is null or end_time > start_time
  )
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  scanned_at timestamptz not null default now(),
  unique (student_id, event_id)
);

create index if not exists attendance_student_id_idx on public.attendance(student_id);
create index if not exists attendance_event_id_idx on public.attendance(event_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta_role text;
  meta_name text;
begin
  meta_role := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'student');
  if meta_role not in ('student', 'teacher', 'admin') then
    meta_role := 'student';
  end if;
  meta_name := nullif(coalesce(new.raw_user_meta_data->>'full_name', ''), '');

  insert into public.profiles (id, email, full_name, role)
  values (new.id, coalesce(new.email, ''), meta_name, meta_role)
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    -- never silently downgrade an admin/teacher to student
    role = case
      when public.profiles.role = 'admin' then 'admin'
      when excluded.role <> 'student' then excluded.role
      else public.profiles.role
    end,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Events are readable by authenticated users" on public.events;
create policy "Events are readable by authenticated users" on public.events
  for select to authenticated using (true);

drop policy if exists "Users can insert events" on public.events;
create policy "Users can insert events" on public.events
  for insert to authenticated with check (auth.uid() = created_by);

drop policy if exists "Users can update their own events" on public.events;
create policy "Users can update their own events" on public.events
  for update to authenticated using (auth.uid() = created_by) with check (auth.uid() = created_by);

drop policy if exists "Students can view their own attendance" on public.attendance;
create policy "Students can view their own attendance" on public.attendance
  for select to authenticated using (auth.uid() = student_id);

drop policy if exists "Students can insert their own attendance" on public.attendance;
create policy "Students can insert their own attendance" on public.attendance
  for insert to authenticated with check (auth.uid() = student_id);

drop policy if exists "Teachers can view attendance for their events" on public.attendance;
create policy "Teachers can view attendance for their events"
  on public.attendance for select to authenticated using (
    exists (
      select 1
      from public.events e
      where e.id = attendance.event_id
        and e.created_by = auth.uid()
    )
  );

drop policy if exists "Teachers can view profiles of their attendees" on public.profiles;
create policy "Teachers can view profiles of their attendees"
  on public.profiles for select to authenticated using (
    exists (
      select 1
      from public.attendance a
      join public.events e on e.id = a.event_id
      where a.student_id = profiles.id
        and e.created_by = auth.uid()
    )
  );

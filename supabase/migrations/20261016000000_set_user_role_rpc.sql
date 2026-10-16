-- QR-ATT: reliable admin role change via RPC (bypasses RLS safely).
-- Run this in Supabase SQL editor (or `supabase db push`). Safe to re-run.
-- Fixes: direct `update profiles` can return NO error but 0 rows when RLS
-- policies are missing/misordered, so the UI looks updated then reverts.

-- Ensure admin helper exists.
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Admin-only role changer. Validates role, blocks self-demotion, returns new role.
create or replace function public.set_user_role(target_id uuid, new_role text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  current_role text;
begin
  if new_role not in ('student', 'teacher', 'admin') then
    raise exception 'Invalid role "%". Choose student, teacher, or admin.', new_role;
  end if;

  if not public.is_admin() then
    raise exception 'Administrator access required.';
  end if;

  if target_id = auth.uid() and new_role <> 'admin' then
    raise exception 'You cannot remove your own Administrator role.';
  end if;

  update public.profiles set role = new_role, updated_at = now()
  where id = target_id
  returning role into current_role;

  if current_role is null then
    raise exception 'User not found.';
  end if;

  return current_role;
end;
$$;

-- Allow authenticated users to call it (the function itself enforces admin).
grant execute on function public.set_user_role(uuid, text) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- QR-ATT: keep auth.users sign-up metadata in sync with admin role changes.
-- Run in Supabase SQL editor (or `supabase db push`). Safe to re-run.
-- Requires 20261016000000_set_user_role_rpc.sql (same function name — this
-- replaces it with a version that also updates raw_user_meta_data.role).
--
-- Why: raw_user_meta_data.role is frozen at registration. Any code path that
-- re-applies metadata (older app bundles with syncProfileFromMetadata) would
-- flip a teacher→student change back to teacher on the user's next sign-in.
-- Updating metadata at the moment of the admin change makes both stay equal.

create or replace function public.set_user_role(target_id uuid, new_role text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  saved_role text;
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

  update public.profiles
    set role = new_role, updated_at = now()
    where id = target_id
    returning role into saved_role;

  if saved_role is null then
    raise exception 'User not found.';
  end if;

  -- Keep sign-up metadata aligned so nothing can re-apply the old role later.
  update auth.users
    set raw_user_meta_data =
          coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', new_role)
    where id = target_id;

  return saved_role;
end;
$$;

grant execute on function public.set_user_role(uuid, text) to authenticated;

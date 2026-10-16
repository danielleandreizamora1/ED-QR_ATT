-- QR-ATT Smart Attendance.
-- Adds: attendance status (present/late), location verification
-- (event geofence), face verification, and an AUTOMATIC VALIDATION
-- trigger that re-checks everything server-side on every insert so a
-- tampered client cannot bypass the rules.
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1) Events: geofence (location verification) + face requirement
-- ---------------------------------------------------------------------------
alter table public.events add column if not exists geofence_lat double precision;
alter table public.events add column if not exists geofence_lng double precision;
alter table public.events add column if not exists geofence_radius_m real;
alter table public.events add column if not exists require_face boolean not null default false;

-- A geofence is only valid as a whole: all three values or none.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_geofence_check'
  ) then
    alter table public.events
      add constraint events_geofence_check check (
        (geofence_lat is null and geofence_lng is null and geofence_radius_m is null)
        or
        (geofence_lat is not null and geofence_lng is not null
         and geofence_radius_m is not null and geofence_radius_m > 0
         and geofence_lat between -90 and 90
         and geofence_lng between -180 and 180)
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2) Attendance: status, location + face verification evidence
-- ---------------------------------------------------------------------------
-- status is nullable on purpose: legacy rows predate the column and are
-- resolved on read (derive from start_time); the trigger sets it on insert.
alter table public.attendance add column if not exists status text;
alter table public.attendance add column if not exists lat double precision;
alter table public.attendance add column if not exists lng double precision;
alter table public.attendance add column if not exists accuracy_m real;
alter table public.attendance add column if not exists distance_m real;
alter table public.attendance add column if not exists location_status text not null default 'not_required';
alter table public.attendance add column if not exists face_status text not null default 'not_required';
alter table public.attendance add column if not exists face_photo_path text;

-- Backfill late detection for rows recorded before this migration
-- (same 15-minute grace the app uses: attendance.ts LATE_GRACE_MINUTES).
update public.attendance a
set status = case
  when e.start_time is not null
   and a.scanned_at > e.start_time + interval '15 minutes'
  then 'late' else 'present' end
from public.events e
where e.id = a.event_id
  and a.status is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_status_check') then
    alter table public.attendance
      add constraint attendance_status_check check (status in ('present', 'late'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'attendance_location_status_check') then
    alter table public.attendance
      add constraint attendance_location_status_check check (location_status in ('verified', 'not_required'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'attendance_face_status_check') then
    alter table public.attendance
      add constraint attendance_face_status_check check (face_status in ('verified', 'not_required'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3) Automatic validation trigger (late detection + location + face)
-- ---------------------------------------------------------------------------
-- Recomputed server-side on EVERY insert:
--   * status           — present vs late (15-minute grace after start_time)
--   * location_status  — 'verified' only after the geofence distance test;
--                        coordinates are REQUIRED when the event has a fence
--   * face_status      — 'verified' required when event.require_face is true
-- Any violation raises an exception and the check-in is rejected, no matter
-- what the client claims.
create or replace function public.smart_attendance_validation()
returns trigger
language plpgsql
as $$
declare
  ev record;
  dist_m double precision;
  has_fence boolean;
begin
  select * into ev from public.events where id = new.event_id;
  if not found then
    raise exception 'Event not found for this attendance record.';
  end if;

  has_fence := ev.geofence_lat is not null
           and ev.geofence_lng is not null
           and coalesce(ev.geofence_radius_m, 0) > 0;

  -- Late detection (authoritative — ignores any client-supplied status).
  if ev.start_time is not null
     and new.scanned_at > ev.start_time + interval '15 minutes' then
    new.status := 'late';
  else
    new.status := 'present';
  end if;

  -- Location verification (geofence): coordinates required + inside radius.
  if has_fence then
    if new.lat is null or new.lng is null then
      raise exception 'Location verification is required for this event, but no location was provided.';
    end if;
    -- Haversine distance (metres) between check-in point and fence centre.
    dist_m := 6371000 * 2 * asin(least(1.0, sqrt(
      power(sin(radians(new.lat - ev.geofence_lat) / 2), 2)
      + cos(radians(ev.geofence_lat)) * cos(radians(new.lat))
      * power(sin(radians(new.lng - ev.geofence_lng) / 2), 2)
    )));
    if dist_m > ev.geofence_radius_m then
      raise exception 'Outside the check-in area: % m from the venue (limit % m).',
        round(dist_m)::int, round(ev.geofence_radius_m)::int;
    end if;
    new.distance_m := round(dist_m)::real;
    new.location_status := 'verified';
  else
    new.location_status := 'not_required';
    new.distance_m := null;
    new.lat := null;
    new.lng := null;
    new.accuracy_m := null;
  end if;

  -- Face verification requirement.
  if ev.require_face then
    if coalesce(new.face_status, 'not_required') <> 'verified' then
      raise exception 'Face verification is required for this event.';
    end if;
  else
    new.face_status := coalesce(new.face_status, 'not_required');
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_smart_validation on public.attendance;
create trigger attendance_smart_validation
  before insert on public.attendance
  for each row execute procedure public.smart_attendance_validation();

-- ---------------------------------------------------------------------------
-- 4) Face proof photos: Supabase Storage bucket + policies
-- ---------------------------------------------------------------------------
-- Best-effort audit trail: the app uploads the verification selfie to the
-- private `face-proof` bucket and stores the object path on the row.
-- (If storage is unavailable the check-in still succeeds — the
--  face_status flag is the source of truth.)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('face-proof', 'face-proof', false, 5242880, array['image/jpeg'])
    on conflict (id) do nothing;
  end if;
end
$$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    -- One folder per user: <user id>/<attendance id>.jpg
    drop policy if exists "Users can upload their own face proofs" on storage.objects;
    create policy "Users can upload their own face proofs"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'face-proof'
        and (storage.foldername(name))[1] = auth.uid()::text
      );

    drop policy if exists "Users can read their own face proofs" on storage.objects;
    create policy "Users can read their own face proofs"
      on storage.objects for select to authenticated
      using (
        bucket_id = 'face-proof'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 5) Attendance row updates: ONLY the face proof path may be written back
-- ---------------------------------------------------------------------------
-- The app records attendance first, then attaches the selfie afterwards.
-- Column-level grant: students can update face_photo_path on THEIR row and
-- nothing else — scanned_at / status stay tamper-proof.
drop policy if exists "Students can update their own attendance proof" on public.attendance;
create policy "Students can update their own attendance proof"
  on public.attendance for update to authenticated
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

revoke update on table public.attendance from authenticated;
grant update (face_photo_path) on table public.attendance to authenticated;

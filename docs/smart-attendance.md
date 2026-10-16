# Smart Attendance

Late detection, attendance status, automatic validation, location verification
(geofence) and face verification.

## Features

| Feature | What it does |
| --- | --- |
| **Late detection** | A check-in within 15 minutes of the event start is `present` (On-Time); later check-ins are `late` (Late). Events without a start time keep showing `—`. |
| **Attendance status** | `status` (`present`/`late`) is stored on the row and shown in History, Teacher detail and exports. |
| **Automatic validation** | Every check-in runs: auth/role → payload shape → event exists → event open → time window → geofence → face requirement → insert. The same rules run **again in Postgres** (see below). |
| **Location verification** | Optional geofence per event (centre + radius). Students outside the fence are rejected; Android mock locations are always rejected. |
| **Face verification** | Optional per event. The student takes a proof selfie; ML Kit confirms **one** awake, centered face before the row is recorded, and the photo is kept as proof. |

## Setup: run the migration (required)

All smart fields live behind `supabase/migrations/20261016020000_smart_attendance.sql`:

1. Open the Supabase SQL editor for your project.
2. Paste and run the migration file in full.
3. Restart the app (or pull to refresh).

What it creates:

- `events`: `geofence_lat`, `geofence_lng`, `geofence_radius_m`, `require_face`
  (+ `events_geofence_check` — centre and radius must be set together or not at all).
- `attendance`: `status`, `lat`, `lng`, `accuracy_m`, `distance_m`,
  `location_status`, `face_status`, `face_photo_path`.
- **`smart_attendance_validation()` — a `BEFORE INSERT` trigger** that re-derives
  the status from the event's start time (same 15-minute grace as the app) and
  enforces the geofence/face requirements server-side, so a tampered client can't
  bypass the rules.
- `face-proof` storage bucket + RLS policies for proof selfies.

**The app still works without the migration** — smart fields fall back to their
legacy projections and every list/export keeps working. The one exception is a
teacher who *opts into* a geofence or face requirement: `createEvent`/`updateEvent`
fail loudly with "Smart Attendance columns are missing — run …" instead of
silently dropping the requirement.

## Check-in pipeline (client)

Every check-in surface (Scan tab, universal `attend` link) shares one
hook — `src/hooks/useCheckInFlow.ts`:

1. **`prepareCheckIn`** (stage 1): auth/role guard, payload parse, event lookup,
   open/closed state, time window (DB times, 2-minute clock-skew grace), then the
   geofence verdict. Failures return *before* any camera/photo step.
2. **Face gate** (only when `require_face` is on): `FaceCheckSheet` opens — front
   camera, `takePictureAsync` → `verifyFaceFromPhoto` (exactly one face, eyes
   open, centered, big enough). Up to 3 attempts; canceling reports a plain
   failure and nothing is recorded.
3. **`registerAttendance`** (stage 2): inserts the row with `status`,
   coordinates and face verdict, then uploads the proof selfie **best-effort**
   (never blocks the check-in).

A duplicate scan hits the unique constraint and is reported as
`Scan Detected!` with the original check-in time — never as a failure.

## Location verification (geofence)

- Teacher sets **centre + radius** on the event: Teacher tab → Create (or edit an
  event) → *Check-in area* → **Use my current location** + radius in metres.
- At check-in the student's GPS position is compared with the haversine distance
  to the centre. Outside the radius → check-in refused with the exact distance.
- Android mock locations are rejected (`mocked` verdict).
- GPS/permission problems return an explicit `unavailable` failure — attendance is
  **never** recorded with a bad location verdict.

## Face verification

Face checks need a development build too (`@react-native-ml-kit/face-detection`);
in Expo Go the sheet explains that it's unavailable and the check-in fails
loudly (a required face check is never skipped).

- Teacher enables **Require face check** on the event.
- The student's photo is stored in the private `face-proof` bucket as
  `<user id>/<attendance id>.jpg` and referenced by `attendance.face_photo_path`.
- Upload is best-effort: an offline proof photo doesn't block the check-in —
  `face_status = 'verified'` already records the verdict.
- Column-level grants keep students from writing other attendance columns.

## Late detection rules

| Situation | Result |
| --- | --- |
| Checked in ≤ start + 15 min | `present` → "On-Time" |
| Checked in > start + 15 min | `late` → "Late" |
| No start time on the event | `—` (historical rows unchanged) |
| Outside the check-in window (before start − 2 min / after end + 2 min) | Rejected |

The 15-minute grace exists **twice, intentionally**: in
`src/lib/attendance.ts` (`LATE_GRACE_MINUTES`, instant feedback) and in the
`smart_attendance_validation()` trigger (authoritative, can't be faked).

## Exports

CSV exports (History + Admin) gained `Location` and `Face` columns:

```
Student,Email,Event Code,Event Title,Scanned At,Status,Location,Face
```

Empty cells mean the row predates the migration or the event required nothing.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Smart Attendance columns are missing — run …" | Run `20261016020000_smart_attendance.sql` in the Supabase SQL editor. |
| Face sheet says "unavailable" | Expo Go / web: build a dev client with the face-detection library. |
| "You are N m from the venue" but you're on site | Increase the event's radius, or move the centre — a fence is only as accurate as its GPS capture (re-capture outdoors). |
| Attendance records but Location/Face are blank | Those rows predate the migration, or the event had no geofence/face requirement. |

## Code map

| Concern | File |
| --- | --- |
| Shared check-in sequencing | `src/hooks/useCheckInFlow.ts` |
| Guards, window, register pipeline | `src/lib/attendance.ts` |
| Geofence math + GPS verification | `src/lib/geo.ts` |
| Liveness + proof selfie | `src/lib/face.ts` |
| Face gate UI | `src/components/FaceCheckSheet.tsx` |
| Evidence chips | `src/components/VerificationChips.tsx` |
| Scan surface | `src/components/ScanScreen.tsx` |
| Teacher setup UI | `src/app/(tabs)/teacher.tsx` |
| Schema + server-side trigger | `supabase/migrations/20261016020000_smart_attendance.sql` |

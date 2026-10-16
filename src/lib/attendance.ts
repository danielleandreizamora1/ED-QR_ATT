import { supabase } from '@/lib/supabase';
import { getEventByCode, type CloudEvent } from '@/lib/events';
import { parseQRPayload, type QRPayload } from '@/lib/qr';
import { verifyEventLocation, type LocationVerification } from '@/lib/geo';
import { attachFaceProof, uploadFaceProof, type FaceProof } from '@/lib/face';

export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
  startTime: string | null;
  /** Stored smart status — null on rows recorded before the migration. */
  status?: StoredStatus | null;
  locationStatus?: 'verified' | 'not_required' | null;
  faceStatus?: 'verified' | 'not_required' | null;
  distanceM?: number | null;
};

// Punctuality: checked in within the grace window after the event start
// counts as On-Time; later check-ins are Late; events without a start
// time show '—'. The SAME 15-minute rule runs inside Postgres
// (smart_attendance_validation trigger) so stored status can't be faked.
export const LATE_GRACE_MINUTES = 15;

// Check-in window grace: the moment the class's exact date/time arrives the
// event counts as started (and stays scannable briefly past the end).
// Covers phone-clock skew and second-level boundaries so a scan at the exact
// scheduled minute never bounces with "Event has not started yet."
export const CHECKIN_TIME_GRACE_MS = 2 * 60 * 1000;

export type ArrivalStatus = 'On-Time' | 'Late' | '—';

/** Stored attendance status (server-derived on insert). */
export type StoredStatus = 'present' | 'late';

export function getArrivalStatus(scannedAt: string, startTime: string | null): ArrivalStatus {
  if (!startTime) return '—';
  const start = new Date(startTime).getTime();
  const scanned = new Date(scannedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(scanned)) return '—';
  return scanned <= start + LATE_GRACE_MINUTES * 60 * 1000 ? 'On-Time' : 'Late';
}

/**
 * Display status for a row: prefer the stored (DB-validated) status, fall
 * back to deriving it for rows recorded before Smart Attendance existed.
 * Events without a start time keep their historical '—'.
 */
export function resolveArrivalStatus(
  stored: StoredStatus | null | undefined,
  scannedAt: string,
  startTime: string | null,
): ArrivalStatus {
  if (!startTime) return '—';
  if (stored === 'late') return 'Late';
  if (stored === 'present') return 'On-Time';
  return getArrivalStatus(scannedAt, startTime);
}

export type LocationSummary = {
  status: 'verified' | 'not_required' | 'unavailable' | 'outside' | 'mocked';
  distanceM?: number;
  radiusM?: number;
};

export type FaceSummary = { status: 'verified' | 'not_required' | 'failed' | 'unavailable' };

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
  eventCode?: string;
  scannedAt?: string;
  /** Row id of the recorded check-in (present on fresh successes). */
  attendanceId?: string;
  /** Late detection result for this check-in. */
  arrivalStatus?: ArrivalStatus;
  location?: LocationSummary;
  face?: FaceSummary;
};

/** Everything Smart Attendance can use at check-in time. */
export type CheckInContext = {
  /** Pre-verified location (from prepareCheckIn) — skips a second GPS read. */
  location?: LocationVerification;
  /** Result of the face gate, when the event requires/allowed a face check. */
  face?: FaceProof;
  /** Pre-fetched event (from prepareCheckIn) — skips a second DB fetch. */
  event?: CloudEvent;
};

export type TeacherEventAttendance = {
  eventId: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  attendeeCount: number;
  attendees: {
    studentId: string;
    studentName: string | null;
    studentEmail: string | null;
    scannedAt: string;
    status?: StoredStatus | null;
    locationStatus?: 'verified' | 'not_required' | null;
    faceStatus?: 'verified' | 'not_required' | null;
    distanceM?: number | null;
  }[];
};

export type TeacherEventSummary = {
  eventId: string;
  eventCode: string;
  title: string;
  attendeeCount: number;
};

type EventRow = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
};

type AttendanceRow = {
  id?: string;
  event_id: string;
  student_id: string;
  scanned_at: string;
  status?: StoredStatus | null;
  location_status?: string | null;
  face_status?: string | null;
  distance_m?: number | null;
  profiles?: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
};

const SMART_ATTENDANCE_COLUMNS =
  'id, scanned_at, status, location_status, face_status, distance_m, event_id, student_id';
const LEGACY_ATTENDANCE_COLUMNS = 'id, scanned_at, event_id, student_id';

/** True when an error means "migration not run yet" (unknown column). */
function isMissingColumnError(error: { code?: string | null; message: string }): boolean {
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    /column|structure|schema cache/i.test(error.message)
  );
}

function toLocationStatus(value: string | null | undefined): 'verified' | 'not_required' | null {
  return value === 'verified' || value === 'not_required' ? value : null;
}

function toFaceStatus(value: string | null | undefined): 'verified' | 'not_required' | null {
  return value === 'verified' || value === 'not_required' ? value : null;
}

export async function getTeacherEventAttendance(teacherId: string): Promise<TeacherEventAttendance[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError || !events) {
    return [];
  }

  const eventRows = events as EventRow[];
  const eventIds = eventRows.map((event) => event.id);
  if (eventIds.length === 0) {
    return [];
  }

  let attendance = null;
  let attendanceError: { message: string } | null = null;
  ({ data: attendance, error: attendanceError } = await supabase
    .from('attendance')
    .select(`${SMART_ATTENDANCE_COLUMNS}, profiles ( full_name, email )`)
    .in('event_id', eventIds)
    .order('scanned_at', { ascending: false }));
  if (attendanceError) {
    // Migration not run yet — read the legacy columns instead.
    ({ data: attendance, error: attendanceError } = await supabase
      .from('attendance')
      .select(`${LEGACY_ATTENDANCE_COLUMNS}, profiles ( full_name, email )`)
      .in('event_id', eventIds)
      .order('scanned_at', { ascending: false }));
  }

  if (attendanceError || !attendance) {
    return eventRows.map((event) => ({
      eventId: event.id,
      eventCode: event.event_code,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      attendeeCount: 0,
      attendees: [],
    }));
  }

  const attendanceRows = attendance as AttendanceRow[];
  return eventRows.map((event) => {
    const attendees = attendanceRows
      .filter((row) => row.event_id === event.id)
      .map((row) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        return {
          studentId: row.student_id,
          studentName: profile?.full_name ?? null,
          studentEmail: profile?.email ?? null,
          scannedAt: row.scanned_at,
          status: row.status ?? null,
          locationStatus: toLocationStatus(row.location_status),
          faceStatus: toFaceStatus(row.face_status),
          distanceM: row.distance_m ?? null,
        };
      });

    return {
      eventId: event.id,
      eventCode: event.event_code,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      attendeeCount: attendees.length,
      attendees,
    };
  });
}

export async function getTeacherEventSummary(teacherId: string): Promise<TeacherEventSummary[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError || !events) return [];

  const eventRows = events as Array<{ id: string; event_code: string; title: string }>;
  const eventIds = eventRows.map((event) => event.id);
  if (eventIds.length === 0) return [];

  const { data: attRows, error: attendanceError } = await supabase
    .from('attendance')
    .select('event_id')
    .in('event_id', eventIds);

  if (attendanceError || !attRows) {
    return eventRows.map((event) => ({
      eventId: event.id,
      eventCode: event.event_code,
      title: event.title,
      attendeeCount: 0,
    }));
  }

  const counts: Record<string, number> = {};
  (attRows as Array<{ event_id: string }>).forEach((row) => {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
  });

  return eventRows.map((event) => ({
    eventId: event.id,
    eventCode: event.event_code,
    title: event.title,
    attendeeCount: counts[event.id] ?? 0,
  }));
}

// --- Smart Attendance: shared guards --------------------------------------

/** Role/ownership guards shared by prepare + register. Returns a failure message or null. */
async function checkInGuard(studentId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  // 1. Must be logged in. 2. Can only record your OWN attendance.
  // 3. Only student accounts check in (teachers/admins manage events).
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return { ok: false, message: 'Please log in to record attendance.' };
  }
  if (!studentId || studentId !== authUser.id) {
    return { ok: false, message: 'You can only record your own attendance.' };
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authUser.id)
    .maybeSingle();
  if ((profile as { role?: string } | null)?.role !== 'student') {
    return { ok: false, message: 'Only student accounts can record attendance.' };
  }
  return { ok: true };
}

/**
 * Automatic validation, stage 1: everything that can be checked BEFORE the
 * student invests in a face/photo step — auth, QR shape, event existence,
 * open/closed state, the time window, and the location (geofence) verdict.
 */
function validateEventWindow(foundEvent: CloudEvent, payload: QRPayload): RegisterResult | null {
  if (foundEvent.status === 'closed') {
    return {
      success: false,
      message: 'This event is closed. Check-in is disabled.',
      eventTitle: foundEvent.title,
      eventCode: payload.event,
    };
  }

  // Validate the time window against the DATABASE record (authoritative),
  // falling back to QR payload times for legacy events.
  const dbStart = foundEvent.start_time ? new Date(foundEvent.start_time).getTime() : null;
  const dbEnd = foundEvent.end_time ? new Date(foundEvent.end_time).getTime() : null;
  const qrStart = payload.start ? new Date(payload.start).getTime() : null;
  const qrEnd = payload.end ? new Date(payload.end).getTime() : null;
  const start = dbStart ?? qrStart;
  const end = dbEnd ?? qrEnd;

  if ((start !== null && Number.isNaN(start)) || (end !== null && Number.isNaN(end))) {
    return { success: false, message: 'Invalid event time.', eventTitle: foundEvent.title, eventCode: payload.event };
  }
  if (start !== null && end !== null && start >= end) {
    return { success: false, message: 'Invalid event time.', eventTitle: foundEvent.title, eventCode: payload.event };
  }
  const now = Date.now();
  // The event counts as started the instant its scheduled date/time arrives
  // (small grace for clock skew) — same tolerance at the end of the window.
  if (start !== null && now < start - CHECKIN_TIME_GRACE_MS) {
    return { success: false, message: 'Event has not started yet.', eventTitle: foundEvent.title, eventCode: payload.event };
  }
  if (end !== null && now > end + CHECKIN_TIME_GRACE_MS) {
    return { success: false, message: 'Event has already ended.', eventTitle: foundEvent.title, eventCode: payload.event };
  }
  return null;
}

function locationFailure(result: RegisterResult, location: LocationVerification): RegisterResult {
  const summary: LocationSummary = {
    status: location.status,
    distanceM: location.distanceM,
    radiusM: location.radiusM,
  };
  const message =
    location.message ??
    (location.status === 'outside'
      ? 'You are outside the check-in area for this event.'
      : 'Location verification failed — enable location permission and try again.');
  return { ...result, success: false, message, location: summary };
}

export type PreparedCheckIn =
  | {
      ok: true;
      rawPayload: string;
      event: CloudEvent;
      /** True when the event demands the face gate before recording. */
      needsFace: boolean;
      location: LocationVerification;
    }
  | { ok: false; result: RegisterResult };

/**
 * Smart Attendance, stage 1 — validate the payload and event, and verify the
 * geofence, WITHOUT recording anything. Screens use this to decide whether
 * to show the face gate next (and to fail fast on an invalid QR/outside
 * geofence before the student opens the camera).
 */
export async function prepareCheckIn(rawPayload: string, studentId: string): Promise<PreparedCheckIn> {
  const guard = await checkInGuard(studentId);
  if (!guard.ok) return { ok: false, result: { success: false, message: guard.message } };

  const parsed = parseQRPayload(rawPayload);
  if (!parsed.ok) {
    return { ok: false, result: { success: false, message: parsed.message } };
  }
  const payload = parsed.payload;

  const foundEvent = await getEventByCode(payload.event);
  if (!foundEvent) {
    return {
      ok: false,
      result: {
        success: false,
        message: 'Invalid QR: event not found. Ask your teacher to verify the event.',
        eventCode: payload.event,
      },
    };
  }

  const windowFailure = validateEventWindow(foundEvent, payload);
  if (windowFailure) return { ok: false, result: windowFailure };

  // Location verification runs before any face/photo step: being outside the
  // fence fails immediately, and the verdict is reused for the final insert.
  const location = await verifyEventLocation(foundEvent);
  if (location.status !== 'verified' && location.status !== 'not_required') {
    return {
      ok: false,
      result: locationFailure(
        { success: false, message: '', eventTitle: foundEvent.title, eventCode: payload.event },
        location,
      ),
    };
  }

  return {
    ok: true,
    rawPayload,
    event: foundEvent,
    needsFace: foundEvent.requireFace === true,
    location,
  };
}

/**
 * Smart Attendance, stage 2 — the full automatic validation + recording
 * pipeline: auth/role → QR parse → event open → time window → geofence →
 * face requirement → insert (status/evidence) → best-effort proof
 * upload. The Postgres trigger re-runs the same rules server-side.
 */
export async function registerAttendance(
  rawPayload: string,
  studentId: string,
  context: CheckInContext = {},
): Promise<RegisterResult> {
  // --- Unauthorized recording guard (must come first) ---
  const guard = await checkInGuard(studentId);
  if (!guard.ok) return { success: false, message: guard.message };

  // --- Invalid QR guard ---
  // Step 3→4: parse the scanned QR, then VALIDATE against the database.
  const parsed = parseQRPayload(rawPayload);
  if (!parsed.ok) {
    return { success: false, message: parsed.message };
  }

  const payload = parsed.payload;

  // Step 4: system validates the event — it must exist (created by
  // teacher/admin). Unknown codes are rejected, never auto-created.
  // A pre-fetched event from prepareCheckIn avoids the second round-trip.
  const foundEvent =
    context.event?.event_code === payload.event ? context.event : await getEventByCode(payload.event);
  if (!foundEvent) {
    return {
      success: false,
      message: 'Invalid QR: event not found. Ask your teacher to verify the event.',
      eventCode: payload.event,
    };
  }

  // Step 4 (cont.): closed events + the time window (authoritative DB times).
  const windowFailure = validateEventWindow(foundEvent, payload);
  if (windowFailure) return windowFailure;

  // --- Location verification (geofence) ---
  // Reuses prepareCheckIn's verdict when supplied; otherwise reads GPS now.
  // Failures block the recording — a location_status of "outside" or
  // "unavailable" must never end up as an accepted attendance row.
  const location = context.location ?? (await verifyEventLocation(foundEvent));
  if (location.status !== 'verified' && location.status !== 'not_required') {
    return locationFailure(
      {
        success: false,
        message: '',
        eventTitle: foundEvent.title,
        eventCode: payload.event,
      },
      location,
    );
  }

  // --- Face verification ---
  // The face gate runs in the UI (camera + ML Kit liveness) and passes its
  // proof through the context. Required but missing → refuse to record.
  let faceStatus: 'verified' | 'not_required' = 'not_required';
  if (context.face?.status === 'verified') {
    faceStatus = 'verified';
  } else if (foundEvent.requireFace) {
    return {
      success: false,
      message: 'This event requires a face check — complete it in the Scan tab before recording attendance.',
      eventTitle: foundEvent.title,
      eventCode: payload.event,
      face: { status: 'failed' },
    };
  }

  // --- Late detection (client derivation for instant feedback; the DB
  // trigger recomputes the authoritative value on insert) ---
  const storedStatus: StoredStatus =
    foundEvent.start_time &&
    Date.now() > new Date(foundEvent.start_time).getTime() + LATE_GRACE_MINUTES * 60 * 1000
      ? 'late'
      : 'present';

  const baseResult: RegisterResult = {
    success: false,
    // Overridden with the real message at every exit below.
    message: '',
    eventTitle: foundEvent.title,
    eventCode: payload.event,
    location: { status: location.status as 'verified' | 'not_required', distanceM: location.distanceM, radiusM: location.radiusM },
    face: { status: faceStatus },
  };

  // Step 5: system records the student's attendance with the full evidence.
  const row: Record<string, unknown> = {
    student_id: studentId,
    event_id: foundEvent.id,
    status: storedStatus,
    lat: location.lat ?? null,
    lng: location.lng ?? null,
    accuracy_m: location.accuracyM ?? null,
    face_status: faceStatus,
  };

  let { data: inserted, error: attendanceError } = await supabase
    .from('attendance')
    .insert(row)
    .select('id, scanned_at, status, location_status, face_status, distance_m')
    .maybeSingle();

  // Migration not run yet (unknown columns): retry with the legacy payload so
  // attendance still records — smart fields simply aren't stored.
  if (attendanceError && isMissingColumnError(attendanceError)) {
    ({ data: inserted, error: attendanceError } = await supabase
      .from('attendance')
      .insert({ student_id: studentId, event_id: foundEvent.id })
      .select('id, scanned_at')
      .maybeSingle());
  }

  if (attendanceError) {
    if (attendanceError.code === '23505') {
      // Unique violation means the check-in row ALREADY exists — the
      // attendance IS recorded, so report it as a detected scan (not a
      // failure). Read the original check-in time for the confirmation.
      const { data: existing } = await supabase
        .from('attendance')
        .select('id, scanned_at, status, location_status, face_status, distance_m')
        .eq('student_id', studentId)
        .eq('event_id', foundEvent.id)
        .maybeSingle();
      const existingRow = existing as {
        id?: string;
        scanned_at?: string;
        status?: StoredStatus | null;
        location_status?: string | null;
        face_status?: string | null;
        distance_m?: number | null;
      } | null;
      const scannedAt = existingRow?.scanned_at ?? new Date().toISOString();
      return {
        ...baseResult,
        success: true,
        message: 'Scan Detected!',
        scannedAt,
        attendanceId: existingRow?.id,
        arrivalStatus: resolveArrivalStatus(existingRow?.status ?? null, scannedAt, foundEvent.start_time),
        location: {
          status: toLocationStatus(existingRow?.location_status) ?? 'not_required',
          distanceM: existingRow?.distance_m ?? undefined,
          radiusM: location.radiusM,
        },
        face: { status: toFaceStatus(existingRow?.face_status) ?? 'not_required' },
      };
    }
    return { ...baseResult, message: attendanceError.message };
  }

  const scannedAt = (inserted as { scanned_at?: string } | null)?.scanned_at ?? new Date().toISOString();
  const attendanceId = (inserted as { id?: string } | null)?.id;

  // Step 6: confirmation payload for the student — includes late detection,
  // geofence verdict and face verdict.
  const successResult: RegisterResult = {
    ...baseResult,
    success: true,
    message: 'Scan Detected!',
    scannedAt,
    attendanceId,
    arrivalStatus: resolveArrivalStatus(
      ((inserted as { status?: StoredStatus } | null)?.status as StoredStatus | undefined) ?? storedStatus,
      scannedAt,
      foundEvent.start_time,
    ),
    location: {
      status: ((inserted as { location_status?: string } | null)?.location_status as 'verified' | 'not_required') ?? 'not_required',
      distanceM: location.distanceM,
      radiusM: location.radiusM,
    },
    face: { status: faceStatus },
  };

  // Best-effort proof selfie upload — never blocks or fails the check-in.
  const photoBase64 = context.face?.photoBase64;
  if (faceStatus === 'verified' && attendanceId && photoBase64) {
    void uploadFaceProof(studentId, attendanceId, photoBase64)
      .then((path) => (path ? attachFaceProof(attendanceId, path) : undefined))
      .catch(() => undefined);
  }

  return successResult;
}

export async function getAttendanceHistory(studentId: string): Promise<AttendanceRecord[]> {
  // Smart projection first; when the migration hasn't been run the query fails
  // on the unknown columns and the legacy projection is read instead. Rows are
  // kept loosely typed on purpose — both projections map through the same
  // tolerant reader below (missing columns simply read as null/undefined).
  const smart = await supabase
    .from('attendance')
    .select('id, scanned_at, status, location_status, face_status, distance_m, events (event_code, title, start_time)')
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false });

  let rows: any[] | null = smart.data as any[] | null;
  let failed = !!smart.error;
  if (failed) {
    const legacy = await supabase
      .from('attendance')
      .select('id, scanned_at, events (event_code, title, start_time)')
      .eq('student_id', studentId)
      .order('scanned_at', { ascending: false });
    rows = legacy.data as any[] | null;
    failed = !!legacy.error;
  }

  if (failed || !rows) {
    return [];
  }

  return rows.map((row: any) => ({
    id: row.id,
    eventId: row.events?.event_code ?? '',
    eventTitle: row.events?.title ?? '',
    scannedAt: row.scanned_at,
    startTime: row.events?.start_time ?? null,
    status: (row.status as StoredStatus | undefined) ?? null,
    locationStatus: toLocationStatus(row.location_status),
    faceStatus: toFaceStatus(row.face_status),
    distanceM: typeof row.distance_m === 'number' ? row.distance_m : null,
  }));
}

// Admin capability: manage/correct attendance records (delete a bad scan).
export async function deleteAttendanceRecord(
  attendanceId: string,
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if ((profile as { role?: string } | null)?.role !== 'admin') {
    return { error: 'Only administrators can correct attendance records.' };
  }

  const { error } = await supabase.from('attendance').delete().eq('id', attendanceId);
  return { error: error?.message ?? null };
}

import { supabase } from '@/lib/supabase';
import type { CloudEvent } from '@/lib/events';
import type { Profile, Role } from '@/lib/profiles';

async function requireAdmin(): Promise<{ userId: string; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: '', error: 'Not signed in.' };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if ((profile as { role?: string } | null)?.role !== 'admin') {
    return { userId: user.id, error: 'Administrator access required.' };
  }
  return { userId: user.id, error: null };
}

// Admin: manage users — list every profile.
export async function listAllUsers(): Promise<Profile[]> {
  const { error } = await requireAdmin();
  if (error) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .order('created_at', { ascending: false });
  return ((data ?? []) as Profile[]);
}

// Admin: manage users — change a user's role to a specifically chosen role.
// Caller must be an admin; `role` must be one of 'student' | 'teacher' | 'admin'.
// Guards against an admin accidentally removing their own admin access.
//
// Uses the `set_user_role` RPC (SECURITY DEFINER) so the change actually
// persists even when RLS policies are strict. Falls back to a direct update
// with row verification — Supabase returns NO error on RLS-blocked updates,
// only 0 rows, which is why roles previously looked changed then reverted.
export async function setUserRole(
  userId: string,
  role: Role,
): Promise<{ error: string | null; savedRole?: Role }> {
  if (role !== 'student' && role !== 'teacher' && role !== 'admin') {
    return { error: `Invalid role "${role}". Choose student, teacher, or admin.` };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };
  const { error: adminError } = await requireAdmin();
  if (adminError) return { error: adminError };
  if (user.id === userId && role !== 'admin') {
    return { error: 'You cannot remove your own Administrator role.' };
  }

  // 1) Preferred path: RPC bypasses RLS and enforces admin inside Postgres.
  const { data: rpcRole, error: rpcError } = await supabase.rpc('set_user_role', {
    target_id: userId,
    new_role: role,
  });
  if (!rpcError) {
    if (rpcRole !== role) {
      return {
        error: `Role was not saved. Server returned "${String(rpcRole)}" instead of "${role}".`,
      };
    }
    // Authoritative verify: re-read the row — if this mismatches, the write
    // did not actually persist (stale cache / trigger revert).
    const { data: check } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    const checked = (check as { role?: string } | null)?.role;
    if (checked !== role) {
      return {
        error:
          `Write succeeded but re-read shows "${checked ?? 'missing'}" instead of "${role}". ` +
          'The change did not persist — check for a conflicting trigger or RLS read policy.',
      };
    }
    return { error: null, savedRole: role };
  }
  // If RPC is missing (migration not run yet), fall through to direct update
  // so we can surface a helpful message instead of silently failing.
  if (!/could not find the function|schema cache|not found|404|PGRST/i.test(rpcError.message)) {
    return { error: rpcError.message };
  }

  // 2) Fallback: direct update + verify a row was actually written.
  const { data: updated, error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)
    .select('id, role')
    .maybeSingle();
  if (error) return { error: error.message };
  const saved = (updated as { role?: string } | null)?.role;
  if (saved !== role) {
    return {
      error:
        'Role was not saved — the database blocked the update (0 rows written). ' +
        'Run supabase/migrations/20260919000000_admin_role_rbac.sql and ' +
        'supabase/migrations/20261016000000_set_user_role_rpc.sql in the Supabase SQL editor, then retry.',
    };
  }
  return { error: null, savedRole: saved as Role };
}

// Admin: manage events — list every event with its creator.
export async function listAllEvents(): Promise<CloudEvent[]> {
  const { error } = await requireAdmin();
  if (error) return [];
  const { data } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });
  return ((data ?? []) as CloudEvent[]);
}

export type SystemReport = {
  totalUsers: number;
  usersByRole: Record<string, number>;
  totalEvents: number;
  totalAttendance: number;
  perEvent: { eventCode: string; title: string; count: number }[];
};

export type OverallAttendanceRow = {
  id: string;
  scannedAt: string;
  eventCode: string;
  eventTitle: string;
  eventStart: string | null;
  studentName: string | null;
  studentEmail: string | null;
  /** Stored (DB-validated) arrival status — null before Smart Attendance. */
  status?: 'present' | 'late' | null;
  locationStatus?: 'verified' | 'not_required' | null;
  faceStatus?: 'verified' | 'not_required' | null;
  distanceM?: number | null;
};

const SMART_ATTENDANCE_COLUMNS =
  'id, scanned_at, status, location_status, face_status, distance_m, event_id, student_id';
const LEGACY_ATTENDANCE_COLUMNS = 'id, scanned_at, event_id, student_id';

// Admin: view overall attendance — every check-in with event + student.
// Implemented as 3 simple queries merged in code so it works regardless of
// whether attendance.student_id has a FK to profiles (no PostgREST join needed).
// Smart columns are read first; if the migration hasn't been run the query
// fails on the unknown columns and the legacy projection is used instead.
export async function listAllAttendance(): Promise<OverallAttendanceRow[]> {
  const { error } = await requireAdmin();
  if (error) return [];

  // Smart columns first; unknown-column errors (migration not run) fall back
  // to the legacy projection. Rows are read tolerantly so either projection
  // maps through the same code (missing columns → null).
  const smart = await supabase
    .from('attendance')
    .select(SMART_ATTENDANCE_COLUMNS)
    .order('scanned_at', { ascending: false })
    .limit(500);
  let rows: any[] | null = smart.data as any[] | null;
  if (!rows) {
    const legacy = await supabase
      .from('attendance')
      .select(LEGACY_ATTENDANCE_COLUMNS)
      .order('scanned_at', { ascending: false })
      .limit(500);
    rows = legacy.data as any[] | null;
  }

  const [{ data: events }, { data: profiles }] = await Promise.all([
    supabase.from('events').select('id, event_code, title, start_time'),
    supabase.from('profiles').select('id, full_name, email'),
  ]);
  const eventMap = new Map(
    (((events ?? []) as { id: string; event_code: string; title: string; start_time: string | null }[])).map((e) => [e.id, e]),
  );
  const profileMap = new Map(
    (((profiles ?? []) as { id: string; full_name: string | null; email: string | null }[])).map((p) => [p.id, p]),
  );
  return (rows ?? []).map((a) => {
    const e = eventMap.get(a.event_id);
    const p = profileMap.get(a.student_id);
    return {
      id: a.id,
      scannedAt: a.scanned_at,
      eventCode: e?.event_code ?? '—',
      eventTitle: e?.title ?? 'Unknown event',
      eventStart: e?.start_time ?? null,
      studentName: p?.full_name ?? null,
      studentEmail: p?.email ?? null,
      status: a.status === 'present' || a.status === 'late' ? a.status : null,
      locationStatus:
        a.location_status === 'verified' || a.location_status === 'not_required' ? a.location_status : null,
      faceStatus: a.face_status === 'verified' || a.face_status === 'not_required' ? a.face_status : null,
      distanceM: typeof a.distance_m === 'number' ? a.distance_m : null,
    };
  });
}

// Admin: view system reports — overall attendance summary.
export async function getSystemReport(): Promise<SystemReport> {
  const empty: SystemReport = {
    totalUsers: 0,
    usersByRole: {},
    totalEvents: 0,
    totalAttendance: 0,
    perEvent: [],
  };
  const { error } = await requireAdmin();
  if (error) return empty;

  const [{ data: profiles }, { data: events }, { data: attendance }] = await Promise.all([
    supabase.from('profiles').select('role'),
    supabase.from('events').select('id, event_code, title'),
    supabase.from('attendance').select('id, event_id'),
  ]);

  const usersByRole: Record<string, number> = {};
  for (const p of ((profiles ?? []) as { role: string }[])) {
    usersByRole[p.role] = (usersByRole[p.role] ?? 0) + 1;
  }

  const counts: Record<string, number> = {};
  for (const a of ((attendance ?? []) as { event_id: string }[])) {
    counts[a.event_id] = (counts[a.event_id] ?? 0) + 1;
  }

  const eventRows = ((events ?? []) as { id: string; event_code: string; title: string }[]);
  return {
    totalUsers: (profiles ?? []).length,
    usersByRole,
    totalEvents: eventRows.length,
    totalAttendance: (attendance ?? []).length,
    perEvent: eventRows.map((e) => ({
      eventCode: e.event_code,
      title: e.title,
      count: counts[e.id] ?? 0,
    })),
  };
}

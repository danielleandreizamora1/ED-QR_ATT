import { supabase } from '@/lib/supabase';

export type EventStatus = 'open' | 'closed';

export type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  venue?: string;
  description?: string;
  /** Check-in area for location verification — set all three or none. */
  geofence?: { lat: number; lng: number; radiusM: number } | null;
  /** When true, students must pass the face check before recording. */
  requireFace?: boolean;
};

export type CloudEvent = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  description: string | null;
  status: EventStatus;
  created_by: string | null;
  created_at: string;
  /** Geofence centre (null when the event has no location requirement). */
  geofence: { lat: number; lng: number } | null;
  geofenceRadiusM: number | null;
  requireFace: boolean;
};

type EventRow = Record<string, unknown>;

function toCloudEvent(row: EventRow): CloudEvent {
  const lat = typeof row.geofence_lat === 'number' ? row.geofence_lat : null;
  const lng = typeof row.geofence_lng === 'number' ? row.geofence_lng : null;
  const radius = typeof row.geofence_radius_m === 'number' ? row.geofence_radius_m : null;
  return {
    id: String(row.id ?? ''),
    event_code: String(row.event_code ?? ''),
    title: String(row.title ?? ''),
    start_time: (row.start_time as string | null) ?? null,
    end_time: (row.end_time as string | null) ?? null,
    // New columns may not exist until the migration is run — default gracefully.
    venue: (row.venue as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    status: (row.status as EventStatus) === 'closed' ? 'closed' : 'open',
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    geofence: lat !== null && lng !== null && radius !== null && radius > 0 ? { lat, lng } : null,
    geofenceRadiusM: radius !== null && radius > 0 ? radius : null,
    requireFace: row.require_face === true,
  };
}

function statusPayload(status: EventStatus): Record<string, string> {
  // Send status only if the column exists; otherwise the update errors.
  // We always send it and fall back to retrying without it.
  return { status };
}

export async function createEvent(event: Event): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const base: Record<string, unknown> = {
    event_code: event.eventId,
    title: event.title,
    start_time: event.start || null,
    end_time: event.end || null,
    venue: event.venue?.trim() || null,
    description: event.description?.trim() || null,
    status: 'open',
    created_by: user?.id ?? null,
    // Smart Attendance: check-in area + face requirement.
    geofence_lat: event.geofence?.lat ?? null,
    geofence_lng: event.geofence?.lng ?? null,
    geofence_radius_m: event.geofence?.radiusM ?? null,
    require_face: event.requireFace === true,
  };

  // Try full payload first (with new columns), fall back to legacy columns
  // if the migration hasn't been run yet.
  let { error } = await supabase.from('events').upsert(base, { onConflict: 'event_code' });
  if (error) {
    const missingSmart = /geofence|require_face/i.test(error.message);
    const missingLegacy = /venue|description|status/i.test(error.message);
    // Never silently drop a requirement the teacher opted into.
    if (missingSmart && (event.geofence || event.requireFace)) {
      return {
        error:
          'Smart Attendance columns are missing — run supabase/migrations/' +
          '20261016020000_smart_attendance.sql in the Supabase SQL editor, then retry.',
      };
    }
    if (missingSmart || missingLegacy) {
      const legacy: Record<string, unknown> = { ...base };
      if (missingLegacy) {
        delete legacy.venue;
        delete legacy.description;
        delete legacy.status;
      }
      if (missingSmart) {
        delete legacy.geofence_lat;
        delete legacy.geofence_lng;
        delete legacy.geofence_radius_m;
        delete legacy.require_face;
      }
      ({ error } = await supabase.from('events').upsert(legacy, { onConflict: 'event_code' }));
    }
  }

  return { error: error?.message ?? null };
}

export async function getEventsByTeacher(teacherId: string): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as EventRow[]).map(toCloudEvent);
}

// Student capability: browse every available event (RLS: authenticated can read).
export async function getAllEvents(): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('start_time', { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as EventRow[]).map(toCloudEvent);
}

async function checkCanManage(eventUuid: string): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { data: existing } = await supabase
    .from('events')
    .select('created_by')
    .eq('id', eventUuid)
    .maybeSingle();
  if (!existing) return { error: 'Event not found.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const isOwner = (existing as { created_by: string | null }).created_by === user.id;
  const isAdmin = (profile as { role?: string } | null)?.role === 'admin';
  if (!isOwner && !isAdmin) return { error: 'Only the owner or an admin can manage this event.' };
  return { error: null };
}

// Teacher/Admin capability: edit an event (name, date/time, venue, description).
export async function updateEvent(
  eventUuid: string,
  updates: {
    title?: string;
    start?: string | null;
    end?: string | null;
    venue?: string | null;
    description?: string | null;
    geofence?: { lat: number; lng: number; radiusM: number } | null;
    requireFace?: boolean;
  },
): Promise<{ error: string | null }> {
  const { error: permError } = await checkCanManage(eventUuid);
  if (permError) return { error: permError };

  const full: Record<string, unknown> = {
    ...(updates.title !== undefined ? { title: updates.title } : {}),
    ...(updates.start !== undefined ? { start_time: updates.start } : {}),
    ...(updates.end !== undefined ? { end_time: updates.end } : {}),
    ...(updates.venue !== undefined ? { venue: updates.venue } : {}),
    ...(updates.description !== undefined ? { description: updates.description } : {}),
    ...(updates.geofence !== undefined
      ? {
          geofence_lat: updates.geofence?.lat ?? null,
          geofence_lng: updates.geofence?.lng ?? null,
          geofence_radius_m: updates.geofence?.radiusM ?? null,
        }
      : {}),
    ...(updates.requireFace !== undefined ? { require_face: updates.requireFace } : {}),
  };

  let { error } = await supabase.from('events').update(full).eq('id', eventUuid);
  if (error) {
    const missingSmart = /geofence|require_face/i.test(error.message);
    const missingLegacy = /venue|description/i.test(error.message);
    if (missingSmart && (updates.geofence || updates.requireFace)) {
      return {
        error:
          'Smart Attendance columns are missing — run supabase/migrations/' +
          '20261016020000_smart_attendance.sql in the Supabase SQL editor, then retry.',
      };
    }
    if (missingSmart || missingLegacy) {
      const legacy: Record<string, unknown> = { ...full };
      if (missingLegacy) {
        delete legacy.venue;
        delete legacy.description;
      }
      if (missingSmart) {
        delete legacy.geofence_lat;
        delete legacy.geofence_lng;
        delete legacy.geofence_radius_m;
        delete legacy.require_face;
      }
      ({ error } = await supabase.from('events').update(legacy).eq('id', eventUuid));
    }
  }

  return { error: error?.message ?? null };
}

// Teacher/Admin capability: close or reopen an event.
// Closed events block new check-ins (see registerAttendance).
export async function setEventStatus(
  eventUuid: string,
  status: EventStatus,
): Promise<{ error: string | null }> {
  const { error: permError } = await checkCanManage(eventUuid);
  if (permError) return { error: permError };

  const { error } = await supabase.from('events').update(statusPayload(status)).eq('id', eventUuid);
  if (error && /status/i.test(error.message)) {
    return { error: 'Run migration 20260920000000_event_management_fields.sql to enable open/closed status.' };
  }
  return { error: error?.message ?? null };
}

// Teacher/Admin capability: delete an event (attendance rows cascade).
export async function deleteEvent(eventUuid: string): Promise<{ error: string | null }> {
  const { error: permError } = await checkCanManage(eventUuid);
  if (permError) return { error: permError };

  const { error } = await supabase.from('events').delete().eq('id', eventUuid);
  return { error: error?.message ?? null };
}

export async function getEventByCode(code: string): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('event_code', code)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return toCloudEvent(data as EventRow);
}

export async function getEventById(eventUuid: string): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventUuid)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return toCloudEvent(data as EventRow);
}

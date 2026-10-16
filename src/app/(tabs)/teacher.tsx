import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { COLORS } from '@/constants/colors';
import { EmptyState, ErrorNotice, LoadingState, StatusBadge, SuccessNotice } from '@/components/feedback';
import { ScreenHeader } from '@/components/ScreenHeader';
import { UiIcon } from '@/components/UiIcon';
import { VerificationChips } from '@/components/VerificationChips';
import { useAuth } from '@/lib/auth';
import { sanitize, validateEventCode, validateRequired } from '@/lib/validation';
import {
  createEvent,
  deleteEvent,
  getAllEvents,
  getEventsByTeacher,
  setEventStatus,
  updateEvent,
  type CloudEvent,
  type Event,
} from '@/lib/events';
import type { Role } from '@/lib/profiles';
import { getProfile } from '@/lib/profiles';
import { canCreateEvents } from '@/lib/roles';
import {
  getTeacherEventAttendance,
  resolveArrivalStatus,
  type TeacherEventAttendance,
  type TeacherEventSummary,
} from '@/lib/attendance';
import { listAllAttendance } from '@/lib/admin';
import { captureCurrentLocation } from '@/lib/geo';
import { buildQRPayload } from '@/lib/qr';

type Mode = 'create' | 'manage';

// Serialize the picked local date/time as an ABSOLUTE instant (UTC with Z).
// A naive "2026-10-16T08:00:00" is interpreted by Postgres (UTC session) as
// 08:00 UTC — hours off for non-UTC devices — so check-ins at the exact class
// time were rejected with "Event has not started yet." toISOString() keeps the
// wall-clock the teacher picked correct on every device.
function toStoredISO(date: Date) {
  return date.toISOString();
}

function formatDateTime(date: Date) {
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function parseRadiusM(text: string): number | null {
  const value = Number(text.trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Check-in area payload: centre + radius must come as a set (matches the
 * events_geofence_check constraint) — any missing part means "no fence".
 */
function buildGeofence(
  lat: number | null,
  lng: number | null,
  radiusText: string,
): { lat: number; lng: number; radiusM: number } | null {
  const radiusM = parseRadiusM(radiusText);
  if (lat === null || lng === null || radiusM === null) return null;
  return { lat, lng, radiusM };
}

// Teacher + Admin: Create an event • View events • Edit an event •
// Close/reopen an event • Generate event QR • Monitor attendance per
// event • View attendance summaries. Event fields: name, date, time
// (start/end pickers), venue, description, status (open/closed).
// Teachers see only their own events; admins see every event.
export default function TeacherScreen() {
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('create');

  // Create-form state
  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(() => new Date(Date.now() + 60 * 60 * 1000));
  const [editTarget, setEditTarget] = useState<'start' | 'end' | null>(null);
  const [editingPart, setEditingPart] = useState<'date' | 'time'>('date');
  const [payload, setPayload] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Smart Attendance — create form: check-in area (geofence) + face gate.
  const [geofenceLat, setGeofenceLat] = useState<number | null>(null);
  const [geofenceLng, setGeofenceLng] = useState<number | null>(null);
  const [radiusText, setRadiusText] = useState('100');
  const [requireFace, setRequireFace] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);

  // Manage-list state
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selected, setSelected] = useState<CloudEvent | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editDescription, setEditDescription] = useState('');
  // Smart Attendance — edit form mirrors of the create controls.
  const [editLat, setEditLat] = useState<number | null>(null);
  const [editLng, setEditLng] = useState<number | null>(null);
  const [editRadiusText, setEditRadiusText] = useState('');
  const [editRequireFace, setEditRequireFace] = useState(false);
  // Teacher capabilities: monitor attendance + view summaries per event.
  const [summaries, setSummaries] = useState<TeacherEventSummary[]>([]);
  const [attendanceDetail, setAttendanceDetail] = useState<TeacherEventAttendance | null>(null);

  const loadRole = useCallback(() => {
    if (!user) {
      setRoleLoading(false);
      return;
    }
    setRoleLoading(true);
    void getProfile(user.id).then((profile) => {
      setRole(profile?.role ?? 'student');
      setRoleLoading(false);
    });
  }, [user]);

  const loadEvents = useCallback(async () => {
    if (!user) return;
    setListLoading(true);
    // Teachers see their own events; admins see every event.
    const profile = await getProfile(user.id);
    const currentRole = profile?.role ?? 'student';
    const rows =
      currentRole === 'admin' ? await getAllEvents() : await getEventsByTeacher(user.id);
    setEvents(rows);
    // Attendance summaries: teachers get per-event counts for their own
    // events; admins get system-wide counts mapped onto every event.
    if (currentRole === 'teacher') {
      const teacherRows = await getTeacherEventAttendance(user.id);
      setSummaries(
        teacherRows.map((t) => ({
          eventId: t.eventId,
          eventCode: t.eventCode,
          title: t.title,
          attendeeCount: t.attendeeCount,
        })),
      );
    } else if (currentRole === 'admin') {
      const all = await listAllAttendance();
      const counts: Record<string, number> = {};
      for (const row of all) {
        counts[row.eventCode] = (counts[row.eventCode] ?? 0) + 1;
      }
      setSummaries(
        rows.map((e) => ({
          eventId: e.id,
          eventCode: e.event_code,
          title: e.title,
          attendeeCount: counts[e.event_code] ?? 0,
        })),
      );
    } else {
      setSummaries([]);
    }
    setListLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadRole();
      void loadEvents();
    }, [loadRole, loadEvents]),
  );

  const openPicker = (target: 'start' | 'end') => {
    setEditTarget(target);
    setEditingPart('date');
  };

  const onPickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed' || !selectedDate || !editTarget) {
      setEditTarget(null);
      return;
    }
    if (Platform.OS === 'android' && editingPart === 'date') {
      if (editTarget === 'start') setStartDate(selectedDate);
      else setEndDate(selectedDate);
      setEditingPart('time');
      return;
    }
    if (editTarget === 'start') setStartDate(selectedDate);
    else setEndDate(selectedDate);
    setEditTarget(null);
  };

  const setEndOffset = (minutes: number) => {
    setEndDate(new Date(startDate.getTime() + minutes * 60 * 1000));
  };

  const handleCreateEvent = async () => {
    // RBAC: only teachers and admins may create events.
    if (!canCreateEvents(role)) {
      setMessage('Only teacher or admin accounts can create events.');
      setPayload(null);
      return;
    }
    // Input validation (length/format checked here, ownership enforced by RLS).
    const codeError = validateEventCode(eventId);
    if (codeError) {
      setMessage(codeError);
      setPayload(null);
      return;
    }
    const titleError = validateRequired(title, 'Event name', 120);
    if (titleError) {
      setMessage(titleError);
      setPayload(null);
      return;
    }
    const event: Event = {
      eventId: eventId.trim(),
      title: sanitize(title, 120),
      start: toStoredISO(startDate),
      end: toStoredISO(endDate),
      venue: sanitize(venue, 120),
      description: sanitize(description, 500),
      geofence: buildGeofence(geofenceLat, geofenceLng, radiusText),
      requireFace,
    };
    if (endDate.getTime() <= startDate.getTime()) {
      setMessage('Start time must be before end time.');
      setPayload(null);
      return;
    }
    // A captured centre without a usable radius would be silently dropped —
    // refuse instead of saving a check-in area the teacher thinks is active.
    if (geofenceLat !== null && geofenceLng !== null && !event.geofence) {
      setMessage('Enter a check-in radius greater than 0 metres, or clear the check-in point.');
      setPayload(null);
      return;
    }

    try {
      const result = await createEvent(event);
      if (result.error) {
        setMessage(result.error);
        setPayload(null);
        return;
      }
      setMessage('Event saved! QR is a universal https:// link — scannable by any camera.');
      setPayload(buildQRPayload(event));
      setTitle('');
      setEventId('');
      setVenue('');
      setDescription('');
      setGeofenceLat(null);
      setGeofenceLng(null);
      setRadiusText('100');
      setRequireFace(false);
      void loadEvents();
    } catch {
      setMessage('Could not save the event. Please try again.');
      setPayload(null);
    }
  };

  // Smart Attendance: pin the geofence centre to the teacher's current spot.
  const handleUseMyLocation = async () => {
    setGeoBusy(true);
    const result = await captureCurrentLocation();
    setGeoBusy(false);
    if ('error' in result) {
      setMessage(result.error);
      setPayload(null);
      return;
    }
    setGeofenceLat(result.lat);
    setGeofenceLng(result.lng);
    setMessage(null);
  };

  const handleEditUseMyLocation = async () => {
    setGeoBusy(true);
    const result = await captureCurrentLocation();
    setGeoBusy(false);
    if ('error' in result) {
      Alert.alert('Check-in area', result.error);
      return;
    }
    setEditLat(result.lat);
    setEditLng(result.lng);
  };

  const openDetail = (item: CloudEvent) => {
    setSelected(item);
    setEditTitle(item.title);
    setEditVenue(item.venue ?? '');
    setEditDescription(item.description ?? '');
    // Smart Attendance: seed the edit controls from the stored settings.
    setEditLat(item.geofence?.lat ?? null);
    setEditLng(item.geofence?.lng ?? null);
    setEditRadiusText(item.geofenceRadiusM ? String(Math.round(item.geofenceRadiusM)) : '');
    setEditRequireFace(item.requireFace === true);
    // Monitor attendance: load the per-event attendee list for the detail view.
    setAttendanceDetail(null);
    if (user) {
      void (async () => {
        const rows = await getTeacherEventAttendance(user.id);
        const mine = rows.find((r) => r.eventId === item.id);
        if (mine) {
          setAttendanceDetail(mine);
          return;
        }
        // Admins viewing events they didn't create: fall back to
        // system-wide rows filtered to this event.
        if (role === 'admin') {
          const all = await listAllAttendance();
          const matches = all.filter((r) => r.eventCode === item.event_code);
          setAttendanceDetail({
            eventId: item.id,
            eventCode: item.event_code,
            title: item.title,
            startTime: item.start_time,
            endTime: item.end_time,
            attendeeCount: matches.length,
            attendees: matches.map((r) => ({
              studentId: r.id,
              studentName: r.studentName,
              studentEmail: r.studentEmail,
              scannedAt: r.scannedAt,
              status: r.status ?? null,
              locationStatus: r.locationStatus ?? null,
              faceStatus: r.faceStatus ?? null,
              distanceM: r.distanceM ?? null,
            })),
          });
        }
      })();
    }
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    if (!editTitle.trim()) {
      setMessage('Event name cannot be empty.');
      return;
    }
    const geofence = buildGeofence(editLat, editLng, editRadiusText);
    // Captured centre without a valid radius must fail loudly, not silently
    // save as "no check-in area".
    if ((editLat !== null || editLng !== null) && !geofence) {
      Alert.alert('Check-in area', 'Enter a radius greater than 0 metres, or clear the check-in point.');
      return;
    }
    const { error } = await updateEvent(selected.id, {
      title: editTitle.trim(),
      venue: editVenue.trim() || null,
      description: editDescription.trim() || null,
      geofence,
      requireFace: editRequireFace,
    });
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    setSelected({
      ...selected,
      title: editTitle.trim(),
      venue: editVenue.trim() || null,
      description: editDescription.trim() || null,
      geofence: geofence ? { lat: geofence.lat, lng: geofence.lng } : null,
      geofenceRadiusM: geofence ? geofence.radiusM : null,
      requireFace: editRequireFace,
    });
    void loadEvents();
  };

  const handleToggleStatus = async () => {
    if (!selected) return;
    const next = selected.status === 'open' ? 'closed' : 'open';
    const { error } = await setEventStatus(selected.id, next);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    setSelected({ ...selected, status: next });
    void loadEvents();
  };

  const handleDelete = (item: CloudEvent) => {
    Alert.alert('Delete event', `${item.title} (${item.event_code})? Attendance rows delete too.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            const { error } = await deleteEvent(item.id);
            if (error) Alert.alert('Error', error);
            else {
              if (selected?.id === item.id) setSelected(null);
              void loadEvents();
            }
          })(),
      },
    ]);
  };

  if (roleLoading) {
    return <LoadingState message="Checking your account…" />;
  }

  if (!canCreateEvents(role)) {
    return (
      <View style={styles.lockScreen}>
        <SymbolView name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }} tintColor={COLORS.primary} size={42} />
        <Text style={styles.lockTitle}>Teachers & Admins Only</Text>
        <Text style={styles.lockSubtitle}>Only teacher or admin accounts can create and manage events.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.modeRow}>
        {(['create', 'manage'] as const).map((m) => (
          <Pressable key={m} onPress={() => { setMode(m); if (m === 'manage') void loadEvents(); }} style={[styles.modeTab, mode === m && styles.modeTabActive]}>
            <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
              {m === 'create' ? 'Create' : `Manage (${events.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === 'create' ? (
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <ScreenHeader
            eyebrow="EVENT"
            title="Create attendance QR"
            subtitle="Name, date, time, venue, description — status starts as open."
          />
          <View style={styles.form}>
            <Field label="Event name" value={title} onChangeText={setTitle} placeholder="Calculus lecture" icon="edit" />
            <Field label="Event code" value={eventId} onChangeText={setEventId} placeholder="CALC-2026-001" icon="qr" />
            <Field label="Venue" value={venue} onChangeText={setVenue} placeholder="Room 201, Main Bldg" icon="pin" />
            <Field label="Description" value={description} onChangeText={setDescription} placeholder="Weekly lecture — attendance required" multiline icon="edit" />
            <PickerField label="Starts" value={formatDateTime(startDate)} onPress={() => openPicker('start')} />
            <PickerField label="Ends" value={formatDateTime(endDate)} onPress={() => openPicker('end')} />
            <View style={styles.chipRow}>
              {[30, 60, 120].map((minutes) => (
                <Pressable key={minutes} onPress={() => setEndOffset(minutes)} style={styles.chip}>
                  <Text style={styles.chipText}>+{minutes === 60 ? '1 hour' : `${minutes} min`}</Text>
                </Pressable>
              ))}
            </View>

            {/* Smart Attendance: check-in area + face gate requirements. */}
            <View style={styles.fenceCard}>
              <Text style={styles.label}>Check-in area (optional)</Text>
              <Text style={styles.fenceHint}>
                When set, students must be within the radius of this point to check in. Leave the point unset for no
                location check.
              </Text>
              <Pressable
                onPress={() => void handleUseMyLocation()}
                disabled={geoBusy}
                style={[styles.locBtn, geoBusy && styles.disabledRow]}
                accessibilityRole="button"
              >
                <UiIcon name="pin" size={16} color={COLORS.textPrimary} />
                <Text style={styles.locBtnText}>
                  {geoBusy
                    ? 'Reading location…'
                    : geofenceLat !== null
                      ? 'Update check-in point'
                      : 'Use my current location'}
                </Text>
              </Pressable>
              {geofenceLat !== null && geofenceLng !== null ? (
                <View style={styles.fenceMetaRow}>
                  <Text style={styles.fenceMeta} numberOfLines={1}>
                    {geofenceLat.toFixed(5)}, {geofenceLng.toFixed(5)}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setGeofenceLat(null);
                      setGeofenceLng(null);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear check-in point"
                  >
                    <UiIcon name="x" size={15} color={COLORS.textSecondary} />
                  </Pressable>
                </View>
              ) : null}
              <Field
                label="Radius (metres)"
                value={radiusText}
                onChangeText={setRadiusText}
                placeholder="100"
                keyboardType="number-pad"
              />
              <ToggleField
                label="Require face check"
                hint="Students must pass an in-app face check before attendance is recorded."
                value={requireFace}
                onChange={setRequireFace}
              />
            </View>
          </View>
          {editTarget && <DateTimePicker value={editTarget === 'start' ? startDate : endDate} mode={Platform.OS === 'android' ? editingPart : 'datetime'} display={Platform.OS === 'android' ? 'default' : 'spinner'} onChange={onPickerChange} />}
          <Pressable onPress={handleCreateEvent} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <UiIcon name="plus" size={18} color={COLORS.textOnPrimary} />
            <Text style={styles.buttonText}>Create event</Text>
          </Pressable>
          {message && message.startsWith('Event saved') ? (
            <SuccessNotice title={message} />
          ) : message ? (
            <ErrorNotice message={message} />
          ) : null}
          {payload && (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>Universal QR — scan with any camera</Text>
              <View style={styles.qrBox}><QRCode value={payload} size={220} /></View>
              <Text style={styles.payloadText} selectable>{payload}</Text>
            </View>
          )}
        </ScrollView>
      ) : selected ? (
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => setSelected(null)} style={styles.backBtn} accessibilityRole="button">
            <UiIcon name="chevron-left" size={16} color={COLORS.accent} />
            <Text style={styles.backText}>All events</Text>
          </Pressable>
          <ScreenHeader eyebrow="EVENT DETAIL" title={selected.title} />
          <View style={styles.badgeWrap}>
            <StatusBadge status={selected.status} />
          </View>
          <Text style={styles.detailLine}>Code: {selected.event_code}</Text>
          <Text style={styles.detailLine}>
            {selected.start_time ? new Date(selected.start_time).toLocaleString() : 'No start set'}
            {selected.end_time ? ` → ${new Date(selected.end_time).toLocaleString()}` : ''}
          </Text>
          {selected.venue ? <Text style={styles.detailLine}>Venue: {selected.venue}</Text> : null}
          {selected.description ? <Text style={styles.detailLine}>{selected.description}</Text> : null}
          {/* Smart Attendance requirements for this event. */}
          <Text style={styles.detailLine}>
            Check-in area:{' '}
            {selected.geofence && selected.geofenceRadiusM
              ? `within ${Math.round(selected.geofenceRadiusM)} m of ${selected.geofence.lat.toFixed(5)}, ${selected.geofence.lng.toFixed(5)}`
              : 'not set — any location accepted'}
          </Text>
          <Text style={styles.detailLine}>
            Face check: {selected.requireFace ? 'required before check-in' : 'not required'}
          </Text>

          <Text style={styles.sectionTitle}>
            Attendance — {attendanceDetail ? `${attendanceDetail.attendeeCount} checked in` : 'loading…'}
          </Text>
          {attendanceDetail && attendanceDetail.attendees.length > 0 ? (
            <View style={styles.attendeeList}>
              {attendanceDetail.attendees.slice(0, 20).map((a) => (
                <View key={`${a.studentId}-${a.scannedAt}`} style={styles.attendeeRow}>
                  <Text style={styles.attendeeName} numberOfLines={1}>
                    {a.studentName ?? a.studentEmail ?? a.studentId.slice(0, 8)}
                  </Text>
                  <Text style={styles.attendeeTime}>{new Date(a.scannedAt).toLocaleString()}</Text>
                  {/* Evidence: arrival status, distance, face proof. */}
                  <VerificationChips
                    arrival={resolveArrivalStatus(a.status, a.scannedAt, attendanceDetail.startTime)}
                    locationStatus={a.locationStatus}
                    distanceM={a.distanceM}
                    faceStatus={a.faceStatus}
                    align="left"
                  />
                </View>
              ))}
              {attendanceDetail.attendees.length > 20 ? (
                <Text style={styles.detailLine}>+{attendanceDetail.attendees.length - 20} more — see History tab</Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.detailLine}>No check-ins yet. Students scan the event QR to appear here.</Text>
          )}

          <Text style={styles.sectionTitle}>Edit event</Text>
          <Field label="Event name" value={editTitle} onChangeText={setEditTitle} placeholder="Event name" />
          <Field label="Venue" value={editVenue} onChangeText={setEditVenue} placeholder="Venue" />
          <Field label="Description" value={editDescription} onChangeText={setEditDescription} placeholder="Description" multiline />

          {/* Smart Attendance: edit the check-in area + face requirement. */}
          <View style={styles.fenceCard}>
            <Text style={styles.label}>Check-in area (optional)</Text>
            <Pressable
              onPress={() => void handleEditUseMyLocation()}
              disabled={geoBusy}
              style={[styles.locBtn, geoBusy && styles.disabledRow]}
              accessibilityRole="button"
            >
              <UiIcon name="pin" size={16} color={COLORS.textPrimary} />
              <Text style={styles.locBtnText}>
                {geoBusy
                  ? 'Reading location…'
                  : editLat !== null
                    ? 'Update check-in point'
                    : 'Use my current location'}
              </Text>
            </Pressable>
            {editLat !== null && editLng !== null ? (
              <View style={styles.fenceMetaRow}>
                <Text style={styles.fenceMeta} numberOfLines={1}>
                  {editLat.toFixed(5)}, {editLng.toFixed(5)}
                </Text>
                <Pressable
                  onPress={() => {
                    setEditLat(null);
                    setEditLng(null);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear check-in point"
                >
                  <UiIcon name="x" size={15} color={COLORS.textSecondary} />
                </Pressable>
              </View>
            ) : null}
            <Field
              label="Radius (metres)"
              value={editRadiusText}
              onChangeText={setEditRadiusText}
              placeholder="100"
              keyboardType="number-pad"
            />
            <ToggleField
              label="Require face check"
              hint="Students must pass an in-app face check before attendance is recorded."
              value={editRequireFace}
              onChange={setEditRequireFace}
            />
          </View>

          <Pressable onPress={handleSaveEdit} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <UiIcon name="check" size={18} color={COLORS.textOnPrimary} />
            <Text style={styles.buttonText}>Save changes</Text>
          </Pressable>
          <Pressable onPress={handleToggleStatus} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
            <UiIcon name={selected.status === 'open' ? 'lock' : 'refresh'} size={18} color={COLORS.textPrimary} />
            <Text style={styles.secondaryText}>
              {selected.status === 'open' ? 'Close event (block check-ins)' : 'Reopen event'}
            </Text>
          </Pressable>
          <Pressable onPress={() => handleDelete(selected)} style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}>
            <UiIcon name="trash" size={18} color="#FFFFFF" />
            <Text style={styles.dangerText}>Delete event</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={listLoading}
          onRefresh={loadEvents}
          renderItem={({ item }) => (
            <Pressable onPress={() => openDetail(item)} style={({ pressed }) => [styles.eventCard, pressed && styles.pressed]}>
              <View style={styles.eventHeader}>
                <Text style={styles.eventTitle}>{item.title}</Text>
                <StatusBadge status={item.status} />
              </View>
              <Text style={styles.eventCode}>{item.event_code}</Text>
              <Text style={styles.eventMeta}>
                {item.start_time ? new Date(item.start_time).toLocaleDateString() : 'No date'}
                {item.venue ? ` • ${item.venue}` : ''}
              </Text>
              <Text style={styles.eventCount}>
                {summaries.find((s) => s.eventId === item.id)?.attendeeCount ?? 0} attended
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={<EmptyState title="No events yet" hint="Switch to Create to add your first event." art="no-results" />}
        />
      )}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  icon,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  icon?: 'edit' | 'qr' | 'pin';
  keyboardType?: 'default' | 'number-pad' | 'numeric';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, multiline && styles.inputWrapMultiline]}>
        {icon ? <UiIcon name={icon} size={17} color={COLORS.textSecondary} /> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textSecondary}
          style={[styles.inputInner, multiline && styles.inputMultiline]}
          multiline={multiline}
          keyboardType={keyboardType}
        />
      </View>
    </View>
  );
}

// Monochrome switch for the face requirement — ink fill + position carry the
// state (plus the accessibility "switch" role), no color-only signalling.
function ToggleField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={styles.toggleRow}
    >
      <View style={styles.toggleTexts}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.toggleHint}>{hint}</Text> : null}
      </View>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
      </View>
    </Pressable>
  );
}

function PickerField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={onPress} style={styles.pickerField} accessibilityRole="button">
        <UiIcon name="calendar" size={17} color={COLORS.textSecondary} />
        <Text style={styles.pickerText}>{value}</Text>
        <View style={styles.pickerChevron}>
          <UiIcon name="chevron-right" size={16} color={COLORS.textSecondary} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  container: { flexGrow: 1, backgroundColor: COLORS.background, padding: 24 },
  list: { gap: 10, padding: 16, paddingBottom: 32 },
  lockScreen: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  lockTitle: { color: COLORS.textPrimary, fontSize: 24, fontWeight: '800', marginTop: 14 },
  lockSubtitle: { color: COLORS.textSecondary, fontSize: 15, textAlign: 'center', marginTop: 8 },
  modeRow: { flexDirection: 'row', gap: 8, margin: 16, marginBottom: 0, backgroundColor: COLORS.card, borderRadius: 12, padding: 4 },
  modeTab: { flex: 1, minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modeTabActive: { backgroundColor: COLORS.primary },
  modeText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  modeTextActive: { color: COLORS.textOnPrimary },
  badgeWrap: { alignSelf: 'flex-start', marginBottom: 8 },
  form: { gap: 14, marginTop: 4 },
  field: { gap: 7 },
  label: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, paddingHorizontal: 12 },
  inputWrapMultiline: { alignItems: 'flex-start', paddingVertical: 8 },
  inputInner: { flex: 1, color: COLORS.textPrimary, fontSize: 15, paddingVertical: 12 },
  inputMultiline: { minHeight: 64, textAlignVertical: 'top' },
  pickerField: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, paddingHorizontal: 12 },
  pickerText: { color: COLORS.textPrimary, fontSize: 15, flex: 1 },
  pickerChevron: { opacity: 0.7 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { borderRadius: 999, backgroundColor: COLORS.surface, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  chipText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '700' },
  button: { minHeight: 52, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginTop: 22, flexDirection: 'row', gap: 8 },
  buttonText: { color: COLORS.textOnPrimary, fontSize: 15, fontWeight: '800' },
  secondaryBtn: { minHeight: 52, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginTop: 12, flexDirection: 'row', gap: 8 },
  secondaryText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  dangerBtn: { minHeight: 52, borderRadius: 12, backgroundColor: COLORS.danger, alignItems: 'center', justifyContent: 'center', marginTop: 12, flexDirection: 'row', gap: 8 },
  dangerText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.82 },
  resultCard: { alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 16, padding: 22, marginTop: 24, gap: 14, borderWidth: 1, borderColor: COLORS.border },
  resultTitle: { color: COLORS.textPrimary, fontWeight: '700', textAlign: 'center' },
  qrBox: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  payloadText: { color: COLORS.textSecondary, fontSize: 10, textAlign: 'center' },
  backBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, justifyContent: 'center' },
  backText: { color: COLORS.accent, fontWeight: '800' },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 17, fontWeight: '800', marginTop: 24, marginBottom: 10 },
  detailLine: { color: COLORS.textSecondary, fontSize: 14, marginTop: 4 },
  eventCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  eventTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800', flex: 1 },
  eventCode: { color: COLORS.accent, fontSize: 13, fontWeight: '700' },
  eventMeta: { color: COLORS.textSecondary, fontSize: 12 },
  eventCount: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '800' },
  attendeeList: { gap: 8, marginTop: 4 },
  attendeeRow: { backgroundColor: COLORS.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.border, gap: 2 },
  attendeeName: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  attendeeTime: { color: COLORS.textSecondary, fontSize: 12 },
  // Smart Attendance controls.
  fenceCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  fenceHint: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 17 },
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
  },
  locBtnText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  fenceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fenceMeta: { flex: 1, color: COLORS.textSecondary, fontSize: 12, fontFamily: 'monospace' },
  disabledRow: { opacity: 0.6 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  toggleTexts: { flex: 1 },
  toggleHint: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 16, marginTop: 2 },
  toggleTrack: {
    width: 52,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
    padding: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  toggleTrackOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, justifyContent: 'flex-end' },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleThumbOn: { backgroundColor: COLORS.textOnPrimary, borderColor: COLORS.textOnPrimary },
});

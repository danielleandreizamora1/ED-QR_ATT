import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { RADIUS, SHADOW } from '@/constants/ui';
import { EmptyState, ErrorNotice, LoadingState, StatusBadge } from '@/components/feedback';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StatusIcon } from '@/components/StatusIcon';
import { UiIcon } from '@/components/UiIcon';
import { VerificationChips } from '@/components/VerificationChips';
import {
  getAttendanceHistory,
  getTeacherEventAttendance,
  resolveArrivalStatus,
  type AttendanceRecord,
  type StoredStatus,
  type TeacherEventAttendance,
} from '@/lib/attendance';
import { listAllAttendance, type OverallAttendanceRow } from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { attendanceFileName, buildAttendanceCsv, faceCsvText, locationCsvText, shareCsv, type AttendanceCsvRow } from '@/lib/export';
import type { Role } from '@/lib/profiles';
import { getProfile } from '@/lib/profiles';
import { clearScanHistory, getScanHistory, type ScanHistoryEntry } from '@/lib/scanHistory';

type Tab = 'attendance' | 'scans';
type DateFilter = 'all' | 'today' | 'week';
type StatusFilter = 'all' | 'on-time' | 'late';

// Unified row for search / filter / export across all roles.
// Smart Attendance fields ride along so status/geofence/face can be
// shown and exported (null/undefined on rows from before the migration).
type ViewRow = {
  id: string;
  student: string;
  email: string;
  eventCode: string;
  eventTitle: string;
  scannedAt: string;
  startTime: string | null;
  status?: StoredStatus | null;
  locationStatus?: string | null;
  faceStatus?: string | null;
  distanceM?: number | null;
};

export default function HistoryScreen() {
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>([]);
  const [systemRows, setSystemRows] = useState<OverallAttendanceRow[]>([]);
  const [scanEntries, setScanEntries] = useState<ScanHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('attendance');
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const profile = await getProfile(user.id);
      const currentRole = profile?.role ?? 'student';
      setRole(currentRole);

    // Always load local scan history (every QR scanned, not just attendance)
    const scans = await getScanHistory(user.id);

    if (currentRole === 'teacher') {
      const events = await getTeacherEventAttendance(user.id);
      setTeacherEvents(events);
      setStudentRecords([]);
      setSystemRows([]);
      setScanEntries(scans);
    } else if (currentRole === 'admin') {
      // Admins view system-wide attendance records (all events, all students).
      const rows = await listAllAttendance();
      setSystemRows(rows);
      setTeacherEvents([]);
      setStudentRecords([]);
      setScanEntries(scans);
    } else {
      const records = await getAttendanceHistory(user.id);
      setStudentRecords(records);
      setTeacherEvents([]);
      setSystemRows([]);
      setScanEntries(scans);
    }
    } catch {
      setError('Could not load history. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleClearScans = useCallback(async () => {
    if (!user) return;
    await clearScanHistory(user.id);
    setScanEntries([]);
  }, [user]);

  // Normalize per-role data into filterable rows.
  const records: ViewRow[] = useMemo(() => {
    if (role === 'teacher') {
      return teacherEvents.flatMap((event) =>
        event.attendees.map((a) => ({
          id: `${event.eventId}-${a.studentId}-${a.scannedAt}`,
          student: a.studentName ?? a.studentEmail ?? shortId(a.studentId),
          email: a.studentEmail ?? '',
          eventCode: event.eventCode,
          eventTitle: event.title,
          scannedAt: a.scannedAt,
          startTime: event.startTime,
          status: a.status ?? null,
          locationStatus: a.locationStatus ?? null,
          faceStatus: a.faceStatus ?? null,
          distanceM: a.distanceM ?? null,
        })),
      );
    }
    if (role === 'admin') {
      return systemRows.map((r) => ({
        id: r.id,
        student: r.studentName ?? r.studentEmail ?? 'Unknown student',
        email: r.studentEmail ?? '',
        eventCode: r.eventCode,
        eventTitle: r.eventTitle,
        scannedAt: r.scannedAt,
        startTime: r.eventStart,
        status: r.status ?? null,
        locationStatus: r.locationStatus ?? null,
        faceStatus: r.faceStatus ?? null,
        distanceM: r.distanceM ?? null,
      }));
    }
    return studentRecords.map((r) => ({
      id: String(r.id),
      student: 'You',
      email: '',
      eventCode: r.eventId,
      eventTitle: r.eventTitle,
      scannedAt: r.scannedAt,
      startTime: r.startTime,
      status: r.status ?? null,
      locationStatus: r.locationStatus ?? null,
      faceStatus: r.faceStatus ?? null,
      distanceM: r.distanceM ?? null,
    }));
  }, [role, teacherEvents, systemRows, studentRecords]);

  // Search (ID / name / email / event) + date + On-Time/Late filters.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    return records.filter((r) => {
      if (q) {
        const hay = `${r.student} ${r.email} ${r.eventCode} ${r.eventTitle}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (dateFilter !== 'all') {
        const age = now - new Date(r.scannedAt).getTime();
        if (Number.isNaN(age)) return false;
        if (dateFilter === 'today' && age > dayMs) return false;
        if (dateFilter === 'week' && age > 7 * dayMs) return false;
      }
      if (statusFilter !== 'all') {
        // Stored (DB-validated) status first; derived only for legacy rows.
        const status = resolveArrivalStatus(r.status, r.scannedAt, r.startTime);
        if (statusFilter === 'on-time' && status !== 'On-Time') return false;
        if (statusFilter === 'late' && status !== 'Late') return false;
      }
      return true;
    });
  }, [records, query, dateFilter, statusFilter]);

  const handleExport = useCallback(async () => {
    if (filtered.length === 0 || exporting) return;
    setExporting(true);
    try {
      const rows: AttendanceCsvRow[] = filtered.map((r) => ({
        student: r.student,
        email: r.email,
        eventCode: r.eventCode,
        eventTitle: r.eventTitle,
        scannedAt: new Date(r.scannedAt).toLocaleString(),
        status: resolveArrivalStatus(r.status, r.scannedAt, r.startTime),
        location: locationCsvText(r.locationStatus, r.distanceM),
        face: faceCsvText(r.faceStatus),
      }));
      const { error: shareError } = await shareCsv(
        buildAttendanceCsv(rows),
        attendanceFileName('qratt-history'),
      );
      if (shareError) Alert.alert('Export failed', shareError);
    } finally {
      setExporting(false);
    }
  }, [filtered, exporting]);

  return (
    <View style={styles.container}>
      <ScreenHeader
        eyebrow="ATTENDANCE"
        title={role === 'teacher' ? 'Event attendance' : role === 'admin' ? 'System attendance' : 'Scan history'}
        subtitle={
          role === 'teacher'
            ? 'Attendance for events you created + every QR you scanned.'
            : role === 'admin'
              ? 'Every check-in across all events and students.'
              : 'Every QR you scan is saved here — attendance and general codes.'
        }
      />

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <Pressable
          onPress={() => setTab('attendance')}
          style={[styles.tab, tab === 'attendance' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'attendance' && styles.tabTextActive]}>
            {role === 'teacher' ? 'Events' : role === 'admin' ? `All records (${systemRows.length})` : 'Attendance'}
          </Text>
        </Pressable>
        <Pressable onPress={() => setTab('scans')} style={[styles.tab, tab === 'scans' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'scans' && styles.tabTextActive]}>
            Scan Detected ({scanEntries.length})
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <LoadingState message="Loading history…" />
      ) : error ? (
        <ErrorNotice message={error} onRetry={() => void load()} />
      ) : tab === 'scans' ? (
        <FlatList
          data={scanEntries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={scanEntries.length === 0 ? styles.emptyList : styles.list}
          renderItem={({ item }) => <ScanEntryCard entry={item} />}
          ListEmptyComponent={<EmptyState title="No scans yet" hint="Scan any QR — it will appear here." art="no-results" />}
          ListHeaderComponent={
            scanEntries.length > 0 ? (
              <View style={styles.clearRow}>
                <Pressable onPress={handleClearScans} style={styles.clearButton}>
                  <Text style={styles.clearText}>Clear history</Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      ) : (
        <View style={styles.attendanceWrap}>
          {/* Search & filter bar: text query + date + On-Time/Late status. */}
          <View style={styles.searchWrap}>
            <UiIcon name="search" size={18} color={COLORS.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search name, email, event code…"
              placeholderTextColor={COLORS.textSecondary}
              style={styles.searchInput}
            />
          </View>
          <View style={styles.chipRow}>
            {(['all', 'today', 'week'] as const).map((d) => (
              <Pressable key={d} onPress={() => setDateFilter(d)} style={[styles.chip, dateFilter === d && styles.chipActive]}>
                <Text style={[styles.chipText, dateFilter === d && styles.chipTextActive]}>
                  {d === 'all' ? 'All dates' : d === 'today' ? 'Today' : 'Last 7 days'}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.chipRow}>
            {(['all', 'on-time', 'late'] as const).map((s) => (
              <Pressable key={s} onPress={() => setStatusFilter(s)} style={[styles.chip, statusFilter === s && styles.chipActive]}>
                <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>
                  {s === 'all' ? 'All statuses' : s === 'on-time' ? 'On-Time' : 'Late'}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => void handleExport()}
              disabled={filtered.length === 0 || exporting}
              style={[styles.exportBtn, (filtered.length === 0 || exporting) && styles.exportBtnDisabled]}>
              <Text style={styles.exportText}>{exporting ? 'Exporting…' : `Export CSV (${filtered.length})`}</Text>
            </Pressable>
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={filtered.length === 0 ? styles.emptyList : styles.list}
            renderItem={({ item }) => <RecordRow row={item} showStudent={role !== 'student'} />}
            ListEmptyComponent={
              <EmptyState
                title={records.length === 0 ? 'No attendance yet' : 'No matches'}
                hint={
                  records.length === 0
                    ? role === 'teacher'
                      ? 'No students have checked in to your events yet.'
                      : 'Scan an event QR to record your first check-in.'
                    : 'Try a different search or filter.'
                }
                art={records.length === 0 ? 'all-checked-in' : 'no-results'}
              />
            }
          />
        </View>
      )}
    </View>
  );
}

function ScanEntryCard({ entry }: { entry: ScanHistoryEntry }) {
  const isAttendance = entry.isAttendanceQR;
  const isGenericSuccess = !isAttendance && entry.success;
  return (
    <View style={styles.record}>
      <View
        style={[
          styles.recordIcon,
          isAttendance ? styles.iconAttendance : isGenericSuccess ? styles.iconDetected : styles.iconGeneric,
        ]}
      >
        <StatusIcon status={isAttendance ? 'present' : isGenericSuccess ? 'on-time' : 'generic'} size={20} />
      </View>
      <View style={styles.recordDetails}>
        <Text style={styles.eventCode} numberOfLines={1}>
          {isAttendance ? (entry.eventTitle ?? entry.eventCode ?? 'Attendance QR') : 'Scan detected'}
        </Text>
        <Text style={styles.date} numberOfLines={3}>
          {entry.rawData}
        </Text>
        <Text style={styles.date}>{new Date(entry.scannedAt).toLocaleString()}</Text>
        <Text
          style={[
            styles.badge,
            isAttendance ? styles.badgeAttendance : isGenericSuccess ? styles.badgeDetected : styles.badgeGeneric,
          ]}
        >
          {entry.resultMessage}
        </Text>
      </View>
      <Text style={styles.status}>{isAttendance ? 'Event' : 'Detected'}</Text>
    </View>
  );
}

function RecordRow({ row, showStudent }: { row: ViewRow; showStudent: boolean }) {
  // Prefer the stored (DB-validated) status; derive only for legacy rows.
  const status = resolveArrivalStatus(row.status, row.scannedAt, row.startTime);
  return (
    <View style={styles.record}>
      <StatusIcon status={status === 'Late' ? 'late' : status === 'On-Time' ? 'on-time' : 'generic'} size={24} />
      <View style={styles.recordDetails}>
        {showStudent ? (
          <Text style={styles.eventCode} numberOfLines={1}>
            {row.student}
          </Text>
        ) : null}
        <Text style={styles.date} numberOfLines={1}>
          {row.eventTitle} ({row.eventCode})
        </Text>
        <Text style={styles.date}>{new Date(row.scannedAt).toLocaleString()}</Text>
        {/* Geofence / face evidence — arrival is the badge at right. */}
        <VerificationChips
          locationStatus={row.locationStatus}
          distanceM={row.distanceM}
          faceStatus={row.faceStatus}
          align="left"
        />
      </View>
      <ArrivalBadge status={status} />
    </View>
  );
}

function ArrivalBadge({ status }: { status: 'On-Time' | 'Late' | '—' }) {
  if (status === '—') return <StatusBadge status="generic" />;
  return <StatusBadge status={status === 'Late' ? 'late' : 'on-time'} />;
}

function shortId(id: string) {
  return id ? `…${id.slice(-8)}` : 'unknown';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 20, paddingTop: 24 },
  tabRow: { flexDirection: 'row', gap: 4, marginBottom: 14, backgroundColor: COLORS.surface, borderRadius: RADIUS.pill, padding: 4, borderWidth: 1, borderColor: COLORS.border },
  tab: { flex: 1, minHeight: 42, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: COLORS.textOnPrimary, fontWeight: '800' },
  clearRow: { alignItems: 'flex-end', marginBottom: 8 },
  clearButton: { paddingHorizontal: 12, minHeight: 40, justifyContent: 'center', borderRadius: RADIUS.pill, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  clearText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '800' },
  list: { paddingBottom: 24, gap: 12 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  record: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card },
  recordIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.surface },
  iconAttendance: { backgroundColor: COLORS.successSoft, borderWidth: 1, borderColor: `${COLORS.success}40` },
  iconGeneric: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  iconDetected: { backgroundColor: COLORS.primary, borderWidth: 1, borderColor: COLORS.primary },
  recordDetails: { flex: 1, gap: 4 },
  eventCode: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  date: { color: COLORS.textSecondary, fontSize: 12 },
  badge: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  badgeAttendance: { color: COLORS.success ?? COLORS.accent },
  badgeDetected: { color: COLORS.success },
  badgeGeneric: { color: COLORS.textSecondary },
  status: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  attendanceWrap: { flex: 1, gap: 12 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: COLORS.card, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: 15, height: 48 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: COLORS.card, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '800' },
  chipTextActive: { color: COLORS.textOnPrimary },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: RADIUS.pill, backgroundColor: COLORS.primary, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', marginLeft: 'auto' },
  exportBtnDisabled: { opacity: 0.5 },
  exportText: { color: COLORS.textOnPrimary, fontSize: 12, fontWeight: '800' },
});

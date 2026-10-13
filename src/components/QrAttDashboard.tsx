// QR-att dashboard + scanner in the Black & Grey theme.
// Drop-in React Native screen (Expo). No new dependencies.
// Pair with a CameraView by rendering <QrAttScannerFrame> around it,
// or use <QrAttDashboard /> standalone with mock data.

import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { QRATT, STATUS_STYLE, type QrattStatus } from '@/constants/qratt-dark';

type LogRow = { id: string; name: string; code: string; time: string; status: QrattStatus };

const METRICS = [
  { label: 'Total Attendance', value: '1,284', delta: '+4.2% this week' },
  { label: 'Scanned Today', value: '186', delta: '+12 since 8:00 AM' },
  { label: 'On-Time', value: '164', delta: '88% of today' },
  { label: 'Late', value: '22', delta: '12% flagged' },
];

const LOGS: LogRow[] = [
  { id: '1', name: 'Amara Osei', code: 'STU-0412', time: '09:02:14', status: 'present' },
  { id: '2', name: 'Daniel Reyes', code: 'STU-0890', time: '09:03:47', status: 'present' },
  { id: '3', name: 'Priya Nair', code: 'STU-0233', time: '09:11:02', status: 'late' },
  { id: '4', name: 'Jonas Weber', code: 'STU-0771', time: '09:12:30', status: 'late' },
  { id: '5', name: 'Lena Cruz', code: 'STU-0154', time: '09:14:55', status: 'present' },
];

export function QrAttStatusBadge({ status }: { status: QrattStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }]}>
      <View style={[styles.dot, { backgroundColor: s.fg }]} />
      <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

export function QrAttScannerFrame({ statusText = 'Align QR within the frame' }: { statusText?: string }) {
  // Render your <CameraView> as a sibling behind this frame (absoluteFill).
  return (
    <View style={styles.scanner} pointerEvents="none">
      <View style={[styles.corner, styles.cTL]} />
      <View style={[styles.corner, styles.cTR]} />
      <View style={[styles.corner, styles.cBL]} />
      <View style={[styles.corner, styles.cBR]} />
      <View style={styles.scanLine} />
      <View style={styles.scannerPill}>
        <View style={styles.pulse} />
        <Text style={styles.scannerText}>{statusText}</Text>
      </View>
    </View>
  );
}

export default function QrAttDashboard() {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      {/* Top bar */}
      <View style={styles.topbar}>
        <Text style={styles.logo}>
          QR<Text style={styles.logoDash}>-</Text>
          <Text style={styles.logoMuted}>att</Text>
        </Text>
        <View style={styles.search}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput placeholder="Search name, ID…" placeholderTextColor={QRATT.textSecondary} style={styles.searchInput} />
        </View>
        <View style={styles.bell}>
          <Text style={styles.bellIcon}>◉</Text>
          <View style={styles.bellDot} />
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>AR</Text>
        </View>
      </View>

      {/* Metrics */}
      <View style={styles.metrics}>
        {METRICS.map((m) => (
          <View key={m.label} style={styles.metricCard}>
            <Text style={styles.metricLabel}>{m.label}</Text>
            <Text style={styles.metricValue}>{m.value}</Text>
            <Text style={styles.metricDelta}>{m.delta}</Text>
          </View>
        ))}
      </View>

      {/* Trend (CSS-bar chart — swap for your chart lib) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Attendance trend</Text>
        <Text style={styles.cardSub}>Last 7 sessions · dark-grey scale</Text>
        <View style={styles.bars}>
          {[42, 68, 55, 80, 62, 92, 74].map((h, i) => (
            <View key={i} style={styles.barTrack}>
              <View style={[styles.barFill, { height: h, opacity: 0.35 + (h / 100) * 0.65 }]} />
            </View>
          ))}
        </View>
      </View>

      {/* Scanner */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Live scanner</Text>
        <Text style={styles.cardSub}>Camera viewfinder inside a dark frame</Text>
        <View style={styles.viewfinder}>
          <QrAttScannerFrame statusText="Scanning… align QR within frame" />
        </View>
      </View>

      {/* Logs */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent scans</Text>
        <View style={styles.tableHead}>
          <Text style={[styles.th, { flex: 1.4 }]}>Name / ID</Text>
          <Text style={styles.th}>Time</Text>
          <Text style={[styles.th, { textAlign: 'right' }]}>Status</Text>
        </View>
        {LOGS.map((row, i) => (
          <View key={row.id} style={[styles.row, i % 2 === 1 && styles.trAlt]}>
            <View style={{ flex: 1.4 }}>
              <Text style={styles.tdName}>{row.name}</Text>
              <Text style={styles.tdCode}>{row.code}</Text>
            </View>
            <Text style={styles.tdTime}>{row.time}</Text>
            <QrAttStatusBadge status={row.status} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: QRATT.bg },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { color: QRATT.textPrimary, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  logoDash: { color: QRATT.textSecondary },
  logoMuted: { color: QRATT.textSecondary, fontWeight: '600' },
  search: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: QRATT.surface1, borderWidth: 1, borderColor: QRATT.borderSubtle,
    borderRadius: 12, paddingHorizontal: 12, height: 42,
  },
  searchIcon: { color: QRATT.textSecondary, fontSize: 16 },
  searchInput: { flex: 1, color: QRATT.textPrimary, fontSize: 14 },
  bell: {
    width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: QRATT.surface1, borderWidth: 1, borderColor: QRATT.borderSubtle,
  },
  bellIcon: { color: QRATT.textPrimary, fontSize: 16 },
  bellDot: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: QRATT.textPrimary },
  avatar: {
    width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: QRATT.surface3, borderWidth: 1, borderColor: QRATT.borderSubtle,
  },
  avatarText: { color: QRATT.textPrimary, fontWeight: '800', fontSize: 13 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: {
    flexBasis: '48%', flexGrow: 1, backgroundColor: QRATT.surface1,
    borderWidth: 1, borderColor: QRATT.borderSubtle, borderRadius: 20, padding: 16, gap: 4,
  },
  metricLabel: { color: QRATT.textSecondary, fontSize: 12, fontWeight: '600' },
  metricValue: { color: QRATT.textPrimary, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  metricDelta: { color: QRATT.silver, fontSize: 12, fontWeight: '600' },
  card: { backgroundColor: QRATT.surface1, borderWidth: 1, borderColor: QRATT.borderSubtle, borderRadius: 20, padding: 16, gap: 10 },
  cardTitle: { color: QRATT.textPrimary, fontSize: 16, fontWeight: '800' },
  cardSub: { color: QRATT.textSecondary, fontSize: 12, fontWeight: '600' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 120, paddingTop: 8 },
  barTrack: { flex: 1, height: '100%', backgroundColor: QRATT.surface2, borderRadius: 8, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { backgroundColor: QRATT.silver, borderRadius: 8 },
  viewfinder: {
    height: 260, borderRadius: 16, backgroundColor: QRATT.black,
    borderWidth: 1, borderColor: QRATT.borderSubtle, overflow: 'hidden', justifyContent: 'center',
  },
  scanner: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' } as const,
  corner: { position: 'absolute', width: 44, height: 44, borderColor: QRATT.textPrimary },
  cTL: { top: 28, left: 28, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
  cTR: { top: 28, right: 28, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
  cBL: { bottom: 28, left: 28, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 },
  cBR: { bottom: 28, right: 28, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
  scanLine: { width: '62%', height: 2, backgroundColor: QRATT.scanLine, opacity: 0.9, borderRadius: 2 },
  scannerPill: {
    position: 'absolute', bottom: 18, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(24,24,27,0.92)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1, borderColor: QRATT.borderSubtle,
  },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: QRATT.success },
  scannerText: { color: QRATT.textPrimary, fontSize: 12, fontWeight: '700' },
  tableHead: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: QRATT.borderFaint },
  th: { flex: 1, color: QRATT.textSecondary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  trAlt: { backgroundColor: 'rgba(39,39,42,0.55)' },
  tdName: { color: QRATT.textPrimary, fontSize: 14, fontWeight: '700' },
  tdCode: { color: QRATT.textSecondary, fontSize: 12, fontWeight: '600' },
  tdTime: { flex: 1, color: QRATT.silver, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '800' },
});

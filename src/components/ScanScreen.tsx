import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import AppButton from '@/components/AppButton';
import { EmptyArt } from '@/components/EmptyArt';
import { StatusIcon } from '@/components/StatusIcon';
import { Toast, type ToastData } from '@/components/Toast';
import { UiIcon } from '@/components/UiIcon';
import { COLORS } from '@/constants/colors';
import { RADIUS, SHADOW } from '@/constants/ui';
import { useAuth } from '@/lib/auth';
import { registerAttendance, type RegisterResult } from '@/lib/attendance';
import { parseQRPayload } from '@/lib/qr';
import { saveScanHistory } from '@/lib/scanHistory';

// Anti-duplication: ignore the SAME QR re-fired within this window
// (camera sensors often emit duplicate frames for one visible code).
const RESCAN_WINDOW_MS = 6000;

// QR Attendance flow:
// 1. Admin creates an event (Event tab)  2. System generates a QR
// 3. Student scans it here                          4. System validates event
// 5. System records attendance                      6. Student gets confirmation
export default function ScanScreen() {
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lastData, setLastData] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [toast, setToast] = useState<ToastData>(null);
  const lastScanRef = useRef<{ data: string; at: number } | null>(null);

  const showToast = (success: boolean, title: string, detail?: string) => {
    setToast({ id: Date.now(), success, title, detail });
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <EmptyArt kind="camera-disabled" />
        <Text style={styles.title}>Camera permission needed</Text>
        <Text style={styles.subtitle}>Allow camera access to scan an event QR code and record attendance.</Text>
        <AppButton theme="primary" title="Grant permission" icon="camera" onPress={requestPermission} fullWidth />
      </View>
    );
  }

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    setScanned(true);
    setLastData(data);

    // Unauthorized guard: must be logged in before anything is recorded.
    if (!user) {
      setResult({ success: false, message: 'Please log in to record attendance.' });
      return;
    }
    const uid = user.id;
    const trimmed = data.trim();

    // Anti-duplication (short window): same QR re-emitted by the sensor
    // within RESCAN_WINDOW_MS is acknowledged but NOT re-recorded.
    const now = Date.now();
    const last = lastScanRef.current;
    if (last && last.data === trimmed && now - last.at < RESCAN_WINDOW_MS) {
      showToast(false, 'Already scanned — wait a moment', 'Duplicate scan ignored');
      return;
    }
    lastScanRef.current = { data: trimmed, at: now };

    // Non-attendance QR (e.g. a URL or plain text): acknowledge without
    // attempting attendance — still saved to history for the History tab.
    const parsed = parseQRPayload(trimmed);
    if (!parsed.ok && trimmed.length > 0) {
      const generic: RegisterResult = { success: true, message: 'Scan detected — saved to history' };
      setResult(generic);
      showToast(true, 'Scan detected', 'Saved to history');
      await saveScanHistory(uid, data, generic);
      return;
    }

    try {
      const res = await registerAttendance(data, uid);
      setResult(res);
      // Real-time feedback: instant toast on top of the camera view.
      showToast(res.success, res.message, res.eventTitle ?? res.eventCode);
      await saveScanHistory(uid, data, res);
    } catch {
      const fallback: RegisterResult = { success: false, message: 'Could not connect to attendance service. Try again.' };
      setResult(fallback);
      showToast(false, fallback.message);
      await saveScanHistory(uid, data, fallback);
    }
  };

  const handleScanAgain = () => {
    setScanned(false);
    setLastData(null);
    setResult(null);
    setToast(null);
    // Reset the cooldown so the next intentional scan always goes through.
    lastScanRef.current = null;
  };

  const success = result?.success ?? false;

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />
      {/* Scanner focal point: black corner frame guides QR placement. */}
      {!scanned ? (
        <View style={styles.frame} pointerEvents="none">
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
      ) : null}
      <Toast toast={toast} />
      <View style={styles.overlay}>
        <View style={styles.handle} />
        <View style={styles.overlayHeader}>
          <UiIcon name="scan" size={15} color={COLORS.textSecondary} />
          <Text style={styles.overlayText}>{scanned ? 'SCAN DETECTED' : 'SCAN EVENT QR CODE'}</Text>
        </View>
        {!scanned ? (
          <Text style={styles.helperText}>Point the camera at the event QR shown by your teacher.</Text>
        ) : result?.success ? (
          // Step 6: confirmation — event, code, timestamp.
          <View style={styles.confirmCard}>
            <StatusIcon status="present" size={32} />
            <Text style={styles.confirmTitle}>{result.message}</Text>
            {result.eventTitle ? <Text style={styles.confirmEvent}>{result.eventTitle}</Text> : null}
            {result.eventCode ? <Text style={styles.confirmCode}>{result.eventCode}</Text> : null}
            <Text style={styles.confirmTime}>
              {result.scannedAt ? new Date(result.scannedAt).toLocaleString() : new Date().toLocaleString()}
            </Text>
          </View>
        ) : (
          <View style={styles.confirmCard}>
            <StatusIcon status="absent" size={28} />
            <Text style={styles.confirmTitleError}>{result?.message ?? 'Scan failed.'}</Text>
            {result?.eventTitle ? <Text style={styles.confirmEvent}>{result.eventTitle}</Text> : null}
            {result?.eventCode ? <Text style={styles.confirmCode}>{result.eventCode}</Text> : null}
            {lastData ? <Text style={styles.scanData} numberOfLines={2}>{lastData}</Text> : null}
          </View>
        )}
        {scanned && <AppButton theme="primary" title="Scan again" icon="refresh" onPress={handleScanAgain} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, marginBottom: 2 },
  permissionContainer: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8 },
  camera: StyleSheet.absoluteFill,
  frame: { position: 'absolute', top: '20%', left: '14%', right: '14%', aspectRatio: 1 },
  corner: { position: 'absolute', width: 30, height: 30, borderColor: '#FFFFFF', borderRadius: 4 },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  overlay: { position: 'absolute', left: 16, right: 16, bottom: 24, backgroundColor: COLORS.card, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, padding: 20, paddingTop: 12, alignItems: 'center', gap: 12, ...SHADOW.sheet },
  overlayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  overlayText: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, textAlign: 'center', letterSpacing: 1.2 },
  helperText: { fontSize: 15, color: COLORS.textPrimary, textAlign: 'center', marginBottom: 4, lineHeight: 21, fontWeight: '700' },
  confirmCard: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  confirmTitle: { fontSize: 17, textAlign: 'center', fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.2 },
  confirmTitleError: { fontSize: 14, textAlign: 'center', fontWeight: '700', color: COLORS.textPrimary },
  confirmEvent: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center' },
  confirmCode: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, textAlign: 'center', fontFamily: 'monospace', letterSpacing: 0.8 },
  confirmTime: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },
  scanData: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', maxWidth: 280 },
});

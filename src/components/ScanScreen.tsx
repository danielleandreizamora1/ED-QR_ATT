import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import AppButton from '@/components/AppButton';
import { EmptyArt } from '@/components/EmptyArt';
import { FaceCheckSheet } from '@/components/FaceCheckSheet';
import { StatusIcon } from '@/components/StatusIcon';
import { Toast, type ToastData } from '@/components/Toast';
import { UiIcon } from '@/components/UiIcon';
import { VerificationChips } from '@/components/VerificationChips';
import { COLORS } from '@/constants/colors';
import { RADIUS, SHADOW } from '@/constants/ui';
import { useCheckInFlow } from '@/hooks/useCheckInFlow';
import { useAuth } from '@/lib/auth';
import type { RegisterResult } from '@/lib/attendance';
import { parseQRPayload } from '@/lib/qr';
import { saveScanHistory } from '@/lib/scanHistory';

// Anti-duplication: ignore the SAME QR re-fired within this window
// (camera sensors often emit duplicate frames for one visible code).
const RESCAN_WINDOW_MS = 6000;

// QR Attendance flow:
// 1. Admin creates an event (Event tab)  2. System generates a QR
// 3. Student scans the QR here
// 4. useCheckInFlow validates: auth → payload → event → window → geofence
//    → face gate (when required)              5. System records attendance
// 6. Student gets confirmation + verification chips
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

  // Single outcome handler for QR scans: report the verdict, then keep a
  // copy in the History tab (best-effort).
  const flow = useCheckInFlow(async (res, raw) => {
    setResult(res);
    showToast(res.success, res.message, res.eventTitle ?? res.eventCode);
    if (user) {
      try {
        await saveScanHistory(user.id, raw, res);
      } catch {
        // History logging is best-effort — the attendance row already exists.
      }
    }
  });

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
    // within RESCAN_WINDOW_MS is acknowledged but NOT re-recorded — the
    // attendance is (being) saved by the first scan, so report it as
    // detected, never as a failure.
    const now = Date.now();
    const last = lastScanRef.current;
    if (last && last.data === trimmed && now - last.at < RESCAN_WINDOW_MS) {
      showToast(true, 'Scan Detected!', 'Duplicate ignored — already recorded');
      return;
    }
    lastScanRef.current = { data: trimmed, at: now };

    // Non-attendance QR (e.g. a URL or plain text): acknowledge without
    // attempting attendance — still saved to history for the History tab.
    const parsed = parseQRPayload(trimmed);
    if (!parsed.ok && trimmed.length > 0) {
      const generic: RegisterResult = { success: true, message: 'Scan Detected!' };
      setResult(generic);
      showToast(true, 'Scan Detected!', 'Saved to history');
      try {
        await saveScanHistory(uid, data, generic);
      } catch {
        // Best-effort history logging.
      }
      return;
    }

    // Smart Attendance: validate (event, window, geofence, face gate) and
    // record — outcome arrives through the shared handler above.
    await flow.start(data);
  };

  const handleScanAgain = () => {
    setScanned(false);
    setLastData(null);
    setResult(null);
    setToast(null);
    // Reset the cooldown so the next intentional scan always goes through.
    lastScanRef.current = null;
  };

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
          <Text style={styles.overlayText}>
            {scanned ? 'SCAN DETECTED' : 'SCAN EVENT QR CODE'}
          </Text>
        </View>
        {scanned && !result ? (
          // Scan is being verified (result not back yet) — never flash a
          // failure before we know the outcome.
          <View style={styles.confirmCard}>
            <StatusIcon status="generic" size={28} />
            <Text style={styles.confirmTitleError}>Checking scan…</Text>
          </View>
        ) : !scanned ? (
          <Text style={styles.helperText}>Point the camera at the event QR shown by your teacher.</Text>
        ) : result?.success ? (
          // Step 6: confirmation — event, code, timestamp + verification chips
          // (arrival status, geofence distance, face proof).
          <View style={styles.confirmCard}>
            <StatusIcon status={result.arrivalStatus === 'Late' ? 'late' : 'present'} size={32} />
            <Text style={styles.confirmTitle}>{result.message}</Text>
            {result.eventTitle ? <Text style={styles.confirmEvent}>{result.eventTitle}</Text> : null}
            {result.eventCode ? <Text style={styles.confirmCode}>{result.eventCode}</Text> : null}
            <Text style={styles.confirmTime}>
              {result.scannedAt ? new Date(result.scannedAt).toLocaleString() : new Date().toLocaleString()}
            </Text>
            <VerificationChips
              arrival={result.arrivalStatus}
              locationStatus={result.location?.status}
              distanceM={result.location?.distanceM}
              faceStatus={result.face?.status}
            />
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
        {scanned && (
          <AppButton theme="primary" title="Scan again" icon="refresh" onPress={handleScanAgain} />
        )}
      </View>

      {/* Face gate: opens only when the event requires a face check; the
          check-in resumes with the verified selfie (or reports cancelled). */}
      <FaceCheckSheet
        visible={!!flow.faceGate}
        eventTitle={flow.faceGate?.eventTitle}
        onVerified={(proof) => flow.faceGate?.onVerified(proof)}
        onCancel={(reason) => flow.faceGate?.onCancel(reason)}
      />
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

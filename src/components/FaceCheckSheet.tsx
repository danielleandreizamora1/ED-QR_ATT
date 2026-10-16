import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import AppButton from '@/components/AppButton';
import { UiIcon } from '@/components/UiIcon';
import { COLORS } from '@/constants/colors';
import { RADIUS, SHADOW } from '@/constants/ui';
import { isFaceCheckAvailable, verifyFaceFromPhoto, type FaceProof } from '@/lib/face';

// Liveness + proof selfie: front camera → ML Kit confirms one real, awake,
// centered face → the photo is kept as proof for the attendance row.
const MAX_ATTEMPTS = 3;

type Phase = 'starting' | 'unavailable' | 'ready' | 'capturing' | 'checking' | 'failed';

type Props = {
  visible: boolean;
  /** Event waiting on this check — shown in the sheet header. */
  eventTitle?: string;
  /** Passed the verified selfie; the check-in continues with it. */
  onVerified: (proof: FaceProof) => void;
  /** Dismissed without a selfie — `reason` is surfaced as the failure. */
  onCancel: (reason?: string) => void;
};

export function FaceCheckSheet({ visible, eventTitle, onVerified, onCancel }: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('starting');
  const [message, setMessage] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  // Fresh sheet every time it opens: reset progress and probe availability.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setPhase('starting');
    setMessage(null);
    setAttempts(0);
    void isFaceCheckAvailable().then((available) => {
      if (!cancelled) setPhase(available ? 'ready' : 'unavailable');
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const close = (reason?: string) => onCancel(reason);

  const handleCapture = async () => {
    if (phase !== 'ready' && phase !== 'failed') return;
    const camera = cameraRef.current;
    if (!camera) return;

    setPhase('capturing');
    setMessage(null);
    try {
      const photo = await camera.takePictureAsync({ quality: 0.4, base64: true, skipProcessing: true });
      if (!photo?.uri || !photo.base64) {
        setPhase('failed');
        setMessage('Could not capture the photo — try again.');
        return;
      }

      setPhase('checking');
      const verdict = await verifyFaceFromPhoto({
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
      });
      if (verdict.ok) {
        onVerified({
          status: 'verified',
          photoUri: photo.uri,
          photoBase64: photo.base64,
          verifiedAt: new Date().toISOString(),
        });
        return;
      }

      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      if (nextAttempts >= MAX_ATTEMPTS) {
        close(`${verdict.message} Face check failed ${MAX_ATTEMPTS} times — attendance was not recorded.`);
        return;
      }
      setPhase('failed');
      setMessage(verdict.message);
    } catch {
      setPhase('failed');
      setMessage('Camera error — could not capture the photo.');
    }
  };

  const hint =
    phase === 'starting'
      ? 'Starting camera…'
      : phase === 'unavailable'
        ? 'Face check needs a development build with the face-detection library.'
        : permission && !permission.granted
          ? 'Camera access is needed for the face check.'
          : phase === 'checking'
            ? 'Checking the photo…'
            : phase === 'capturing'
              ? 'Capturing…'
              : 'Look at the camera: eyes open, face centered, alone in frame.';

  const showCamera = visible && phase !== 'unavailable' && phase !== 'starting';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => close()}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <UiIcon name="camera" size={15} color={COLORS.textSecondary} />
            <Text style={styles.headerText}>FACE CHECK</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close face check"
              onPress={() => close()}
              style={styles.closeBtn}
              hitSlop={10}
            >
              <UiIcon name="x" size={16} color={COLORS.textSecondary} />
            </Pressable>
          </View>
          {eventTitle ? <Text style={styles.event}>{eventTitle}</Text> : null}

          {phase === 'unavailable' ? (
            <View style={styles.notice}>
              <StatusBlockGlyph />
              <Text style={styles.noticeText}>
                Face verification is unavailable on this device — use a development build of the app.
              </Text>
            </View>
          ) : phase === 'starting' ? (
            <View style={styles.cameraBox}>
              <ActivityIndicator color={COLORS.textSecondary} />
            </View>
          ) : permission && !permission.granted ? (
            <View style={styles.notice}>
              <StatusBlockGlyph />
              <Text style={styles.noticeText}>Camera access is required for the face check.</Text>
              <AppButton
                title="Grant camera permission"
                icon="camera"
                onPress={() => void requestPermission()}
                small
              />
            </View>
          ) : (
            <View style={styles.cameraBox}>
              <CameraView ref={cameraRef} style={styles.camera} facing="front" />
              {/* Guide ring: keeps the face roughly centered for ML Kit. */}
              <View style={styles.guide} pointerEvents="none" />
            </View>
          )}

          <Text style={styles.hint}>{hint}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {attempts > 0 && phase !== 'unavailable' ? (
            <Text style={styles.attempts}>
              Attempt {attempts + 1} of {MAX_ATTEMPTS}
            </Text>
          ) : null}

          {phase === 'unavailable' ? (
            <AppButton title="Close" variant="secondary" onPress={() => close()} fullWidth />
          ) : permission && !permission.granted ? (
            <AppButton title="Cancel" variant="secondary" onPress={() => close()} fullWidth />
          ) : (
            <View style={styles.actions}>
              <AppButton
                title={phase === 'failed' ? 'Try again' : 'Take photo'}
                icon="camera"
                theme="primary"
                onPress={() => void handleCapture()}
                loading={phase === 'capturing' || phase === 'checking'}
                disabled={phase === 'starting'}
                fullWidth
              />
              <AppButton title="Cancel check-in" variant="ghost" onPress={() => close()} fullWidth />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// Small dashed placeholder so the notice keeps the sheet's visual rhythm.
function StatusBlockGlyph() {
  return (
    <View style={styles.noticeGlyph}>
      <UiIcon name="user" size={22} color={COLORS.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,10,9,0.72)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    gap: 10,
    ...SHADOW.sheet,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.2,
  },
  closeBtn: { padding: 2 },
  event: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  cameraBox: {
    height: 300,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: StyleSheet.absoluteFill,
  guide: {
    position: 'absolute',
    width: 190,
    height: 240,
    borderRadius: 95,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  notice: { alignItems: 'center', gap: 10, paddingVertical: 18 },
  noticeGlyph: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  hint: { fontSize: 13, color: COLORS.textPrimary, textAlign: 'center', lineHeight: 19 },
  message: { fontSize: 13, color: COLORS.danger, textAlign: 'center', lineHeight: 19, fontWeight: '600' },
  attempts: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center', letterSpacing: 0.6 },
  actions: { gap: 6 },
});

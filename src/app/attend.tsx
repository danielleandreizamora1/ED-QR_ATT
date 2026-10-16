import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { EmptyState, ErrorNotice, SuccessNotice } from '@/components/feedback';
import { FaceCheckSheet } from '@/components/FaceCheckSheet';
import { VerificationChips } from '@/components/VerificationChips';
import { useAuth } from '@/lib/auth';
import type { RegisterResult } from '@/lib/attendance';
import { useCheckInFlow } from '@/hooks/useCheckInFlow';
import { parseQRPayload } from '@/lib/qr';

/**
 * Universal attend route — opened when ANY camera scans the QR.
 *
 * Old QR was raw JSON like {"v":1,"event":"CALC-001"} — only the app's scanner understood it.
 * New QR is a universal https:// link: https://qrtt.app/attend?event=CALC-001&v=1&title=...
 *   - iOS Camera / Android Lens → opens this page in the browser (or in-app if universal link configured)
 *   - In-app scanner → parseQRPayload extracts event and registers directly without needing this page
 *
 * This page handles the browser case: show event details, let logged-in students confirm attendance,
 * and offer a deep-link to open the native app.
 */
export default function AttendScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    event?: string;
    code?: string;
    eventId?: string;
    title?: string;
    start?: string;
    end?: string;
    v?: string;
  }>();

  const [status, setStatus] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean | null>(null);
  const [result, setResult] = useState<RegisterResult | null>(null);

  // Smart Attendance: validate → face gate (if required) → record. The
  // outcome arrives here once, regardless of which stage produced it.
  const flow = useCheckInFlow((res) => {
    setResult(res);
    setStatus(res.message);
    setSuccess(res.success);
  });
  const busy = flow.busy || flow.faceGate !== null;

  // Reconstruct raw payload for parse + register — use current URL if available
  const rawPayload = useMemo(() => {
    // Prefer building a URL that parseQRPayload understands
    const qs = new URLSearchParams();
    const eventCode = params.event ?? params.code ?? params.eventId;
    if (!eventCode) return null;
    qs.set('event', eventCode);
    qs.set('v', params.v ?? '1');
    if (params.title) qs.set('title', params.title);
    if (params.start) qs.set('start', params.start);
    if (params.end) qs.set('end', params.end);
    const base = process.env.EXPO_PUBLIC_APP_URL ?? 'https://qrtt.app';
    return `${base.replace(/\/$/, '')}/attend?${qs.toString()}`;
  }, [params]);

  const parsed = useMemo(() => {
    if (!rawPayload) return { ok: false as const, message: 'Missing event code in link.' };
    return parseQRPayload(rawPayload);
  }, [rawPayload]);

  const handleRegister = async () => {
    if (!rawPayload) {
      setStatus('Invalid event link.');
      setSuccess(false);
      return;
    }
    if (!user) {
      setStatus('Please log in to record attendance.');
      setSuccess(false);
      router.push('/login');
      return;
    }
    setStatus(null);
    setResult(null);
    // Two-stage pipeline: guards + geofence first, face gate when the event
    // requires it, then the actual recording.
    await flow.start(rawPayload);
  };

  const handleOpenInApp = () => {
    if (!rawPayload) return;
    try {
      const url = new URL(rawPayload);
      const deepLink = `qrttapp://attend?${url.searchParams.toString()}`;
      void Linking.openURL(deepLink);
    } catch {
      void Linking.openURL('qrttapp://scan');
    }
  };

  useEffect(() => {
    // If opened via deep link directly, optionally auto-navigate to scan tab
    // Do nothing — user decides to register.
  }, []);

  if (!parsed.ok) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="Invalid QR Link"
          hint={(parsed as { message?: string }).message ?? 'This QR does not contain a valid event.'}
        />
        <Pressable onPress={() => router.replace('/(tabs)')} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Go Home</Text>
        </Pressable>
      </View>
    );
  }

  const payload = (parsed as { ok: true; payload: any }).payload;

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>ATTENDANCE CHECK-IN</Text>
      <Text style={styles.title}>{payload.title ?? payload.event}</Text>
      <Text style={styles.subtitle}>Event code: {payload.event}</Text>
      {(payload.start || payload.end) && (
        <View style={styles.metaBox}>
          {payload.start ? <Text style={styles.metaText}>Starts: {payload.start}</Text> : null}
          {payload.end ? <Text style={styles.metaText}>Ends: {payload.end}</Text> : null}
        </View>
      )}

      <Text style={styles.helper}>
        This QR was scanned with your {typeof window !== 'undefined' ? 'browser' : 'device'}. Anyone can scan it — iOS
        Camera, Android, or any QR app — because it&apos;s a normal https:// link.
      </Text>

      <View style={styles.actions}>
        <Pressable
          onPress={handleRegister}
          disabled={busy}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, busy && styles.disabled]}
        >
          {busy ? (
            <ActivityIndicator color={COLORS.textOnPrimary} />
          ) : (
            <Text style={styles.primaryBtnText}>{user ? 'Confirm attendance' : 'Log in to confirm'}</Text>
          )}
        </Pressable>

        <Pressable onPress={handleOpenInApp} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
          <Text style={styles.secondaryBtnText}>Open in app</Text>
        </Pressable>

        <Pressable onPress={() => router.push('/(tabs)/scan' as any)} style={styles.linkBtn}>
          <Text style={styles.linkText}>Or scan again inside the app → Scan tab</Text>
        </Pressable>
      </View>

      {status && success ? (
        <>
          <SuccessNotice title={status} detail="Your check-in was recorded." />
          {/* Arrival status, geofence distance, face proof. */}
          <VerificationChips
            arrival={result?.arrivalStatus}
            locationStatus={result?.location?.status}
            distanceM={result?.location?.distanceM}
            faceStatus={result?.face?.status}
          />
        </>
      ) : status ? (
        <ErrorNotice message={status} />
      ) : null}
      {rawPayload && <Text style={styles.urlText}>{rawPayload}</Text>}

      {/* Face gate for events that require a face check before recording. */}
      <FaceCheckSheet
        visible={flow.faceGate !== null}
        eventTitle={flow.faceGate?.eventTitle}
        onVerified={(proof) => flow.faceGate?.onVerified(proof)}
        onCancel={(reason) => flow.faceGate?.onCancel(reason)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 24, paddingTop: 48 },
  eyebrow: { color: COLORS.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: COLORS.textPrimary, fontSize: 28, fontWeight: '800', marginTop: 6 },
  subtitle: { color: COLORS.textSecondary, fontSize: 14, marginTop: 6 },
  metaBox: {
    marginTop: 12,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 4,
  },
  metaText: { color: COLORS.textPrimary, fontSize: 13 },
  helper: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 16 },
  actions: { marginTop: 20, gap: 12 },
  primaryBtn: {
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: COLORS.textOnPrimary, fontSize: 15, fontWeight: '800' },
  secondaryBtn: {
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  linkBtn: { alignItems: 'center', paddingVertical: 8 },
  linkText: { color: COLORS.accent, fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.6 },
  status: { textAlign: 'center', marginTop: 16, fontSize: 14, fontWeight: '600' },
  success: { color: COLORS.success },
  error: { color: COLORS.danger },
  urlText: { color: COLORS.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 12 },
});

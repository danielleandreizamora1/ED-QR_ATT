import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { RADIUS, SHADOW } from '@/constants/ui';
import { STATUS_META, type AttendanceVisualStatus } from '@/constants/icons';
import { EmptyArt, type EmptyArtKind } from '@/components/EmptyArt';
import { StatusIcon } from '@/components/StatusIcon';
import { UiIcon } from '@/components/UiIcon';

// Editorial Mono feedback V2 — flat, hairline, high-contrast.
// Badges: solid black = positive/open, outline = everything else.

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <View style={styles.center} accessibilityRole="progressbar">
      <ActivityIndicator color={COLORS.primary} size="large" />
      <Text style={styles.muted}>{message}</Text>
    </View>
  );
}

export function EmptyState({ title, hint, art = 'no-results' }: { title: string; hint?: string; art?: EmptyArtKind }) {
  return (
    <View style={styles.center}>
      <EmptyArt kind={art} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.mutedCenter}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorCard} accessibilityRole="alert">
      <View style={styles.noticeRow}>
        <View style={styles.errorMark}>
          <UiIcon name="alert" size={16} color={COLORS.textOnPrimary} />
        </View>
        <Text style={styles.errorTitle}>Something went wrong</Text>
      </View>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SuccessNotice({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.successCard} accessibilityRole="alert">
      <StatusIcon status="present" size={28} />
      <Text style={styles.successTitle}>{title}</Text>
      {detail ? <Text style={styles.successDetail}>{detail}</Text> : null}
    </View>
  );
}

const SOLID_STATUSES: ReadonlySet<string> = new Set(['on-time', 'present', 'open']);

export function StatusBadge({ status }: { status: AttendanceVisualStatus | 'open' | 'closed' }) {
  const meta = STATUS_META[status];
  const solid = SOLID_STATUSES.has(status);
  return (
    <View style={[styles.badge, solid ? styles.badgeSolid : styles.badgeOutline]}>
      <View style={styles.badgeRow}>
        <StatusIcon status={status} size={14} />
        <Text style={[styles.badgeText, solid ? styles.badgeTextSolid : styles.badgeTextOutline]}>
          {meta.label.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  muted: { color: COLORS.textSecondary, fontSize: 14 },
  mutedCenter: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 21 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 19, fontWeight: '800', textAlign: 'center', letterSpacing: -0.2 },
  errorCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 18, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 3, borderLeftColor: COLORS.primary, gap: 8, ...SHADOW.card },
  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorMark: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  errorTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' },
  errorText: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20 },
  retryBtn: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: COLORS.primary, borderRadius: RADIUS.pill, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center' },
  retryText: { color: COLORS.textOnPrimary, fontWeight: '700', fontSize: 13 },
  pressed: { opacity: 0.85 },
  successCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 20, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 3, borderLeftColor: COLORS.primary, alignItems: 'center', gap: 8, ...SHADOW.card },
  successTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  successDetail: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  badgeSolid: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  badgeOutline: { backgroundColor: 'transparent', borderColor: COLORS.borderStrong },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  badgeTextSolid: { color: COLORS.textOnPrimary },
  badgeTextOutline: { color: COLORS.textPrimary },
});

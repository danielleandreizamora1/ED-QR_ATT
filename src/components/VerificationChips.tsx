import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { StatusIcon } from '@/components/StatusIcon';
import { UiIcon } from '@/components/UiIcon';
import { COLORS } from '@/constants/colors';
import { RADIUS } from '@/constants/ui';
import type { ArrivalStatus } from '@/lib/attendance';

// Evidence row: arrival status, geofence verdict, face verdict. Monochrome
// pills — status is carried by icon SHAPE plus the text label, never by
// color alone (matches StatusBadge rules).
//
// Normalized props (not a RegisterResult) so every surface can use it:
// check-in results, student history rows, teacher attendee lists.

export type VerificationChipsProps = {
  /** Arrival verdict — '—' and null/undefined hide the chip. */
  arrival?: ArrivalStatus | null;
  /** Geofence verdict: 'verified' shows the distance chip. */
  locationStatus?: string | null;
  /** Metres from the fence centre (shown when locationStatus is 'verified'). */
  distanceM?: number | null;
  /** Face verdict: 'verified' shows the face chip. */
  faceStatus?: string | null;
  /** List rows stack left; result cards stay centered. */
  align?: 'center' | 'left';
};

function Chip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View style={styles.chip}>
      {children}
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

export function VerificationChips({
  arrival,
  locationStatus,
  distanceM,
  faceStatus,
  align = 'center',
}: VerificationChipsProps) {
  const chips: ReactNode[] = [];

  // Arrival: On-Time / Late ('—' rows — events without a start time — skip).
  if (arrival && arrival !== '—') {
    const late = arrival === 'Late';
    chips.push(
      <Chip key="status" label={late ? 'Late' : 'On-Time'}>
        <StatusIcon status={late ? 'late' : 'on-time'} size={14} />
      </Chip>,
    );
  }

  // Geofence: only worth a chip when a fence actually existed.
  if (locationStatus === 'verified') {
    const metres = typeof distanceM === 'number' ? Math.round(distanceM) : null;
    chips.push(
      <Chip key="location" label={metres !== null ? `On-site · ${metres} m` : 'On-site'}>
        <UiIcon name="pin" size={14} color={COLORS.textPrimary} />
      </Chip>,
    );
  }

  // Face proof: only when the event demanded/took a face check.
  if (faceStatus === 'verified') {
    chips.push(
      <Chip key="face" label="Face verified">
        <UiIcon name="check" size={14} color={COLORS.textPrimary} />
      </Chip>,
    );
  }

  if (chips.length === 0) return null;
  return <View style={[styles.row, align === 'left' && styles.rowLeft]}>{chips}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  rowLeft: { justifyContent: 'flex-start', marginTop: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 0.4,
  },
});

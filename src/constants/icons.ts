// QR-Att icon design tokens.
// Touch target vs render size are intentionally separate: the visual glyph
// stays small for legibility, the pressable area stays large for fingers.

import { Platform } from 'react-native';

import { COLORS } from '@/constants/colors';

export const ICON_RENDER_SIZES = {
  sm: 16,
  md: 20,
  lg: 24,
} as const;

export type IconRenderSize = keyof typeof ICON_RENDER_SIZES;

// Minimum pressable area per platform guidelines.
// iOS HIG: 44x44pt. Material: 48x48dp.
export const ICON_TOUCH_MIN = Platform.select({ ios: 44, android: 48, default: 44 }) ?? 44;

// Stroke weight paired to render size — do not scale stroke on resize,
// redraw at each size instead.
export const ICON_STROKE = {
  sm: 1.5,
  md: 1.5,
  lg: 2,
} as const;

export const ICON_RADIUS = {
  inner: 2,
  container: 6,
} as const;

export type AttendanceVisualStatus =
  | 'on-time'
  | 'present'
  | 'late'
  | 'absent'
  | 'excused'
  | 'expired'
  | 'geofence'
  | 'open'
  | 'closed'
  | 'generic';

// Single source of truth for status color + label. Color is never the only
// signal — every usage must also render the label text.
export const STATUS_META: Record<AttendanceVisualStatus, { color: string; label: string }> = {
  'on-time': { color: COLORS.success, label: 'On-Time' },
  present: { color: COLORS.success, label: 'Present' },
  late: { color: COLORS.warning, label: 'Late Check-in' },
  absent: { color: COLORS.danger, label: 'Absent' },
  excused: { color: COLORS.textSecondary, label: 'Excused Absence' },
  expired: { color: COLORS.warning, label: 'QR Session Expired' },
  geofence: { color: COLORS.danger, label: 'Geofence Mismatch' },
  open: { color: COLORS.success, label: 'Open' },
  closed: { color: COLORS.danger, label: 'Closed' },
  generic: { color: COLORS.textSecondary, label: 'Recorded' },
} as const;

// Tab bar: explicit active/inactive specs (no runtime tinting).
// Active = solid black glyph + label. Inactive = warm stone outline.
export const TAB_ICON = {
  size: ICON_RENDER_SIZES.lg,
  strokeWidth: ICON_STROKE.lg,
  active: {
    glyph: COLORS.primary,
    wash: '#0C0A0914',
    label: COLORS.primary,
    weight: '700' as const,
  },
  inactive: {
    glyph: '#A8A29E',
    label: '#78716C',
    weight: '500' as const,
  },
} as const;

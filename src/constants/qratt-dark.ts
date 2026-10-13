// QR-att — Black & Grey dark theme tokens (React Native / Expo).
// Single source of truth mirroring docs/qr-att-redesign/theme.css.
// Usage: import { QRATT } from '@/constants/qratt-dark';

export const QRATT = {
  bg: '#0A0A0A', // pitch black app background
  black: '#000000', // true black (splash, scanner frame)
  surface1: '#121212', // primary cards / sidebar
  surface2: '#18181B', // secondary containers / table header
  surface3: '#27272A', // raised cards / hover / modal
  border: '#3F3F46', // dividers — use at 40-60% opacity
  borderSubtle: 'rgba(63, 63, 70, 0.55)',
  borderFaint: 'rgba(63, 63, 70, 0.32)',
  textPrimary: '#F4F4F5', // off-white headings
  textSecondary: '#A1A1AA', // muted body / metadata
  silver: '#D4D4D8', // neutral badge fill
  white: '#FFFFFF',
  // Minimal status indicators — monochrome first, muted color only for ok/alert.
  success: '#86EFAC', // muted green, use on dark chip bg
  successDim: 'rgba(134, 239, 172, 0.12)',
  alert: '#FCA5A5', // muted red, use on dark chip bg
  alertDim: 'rgba(252, 165, 165, 0.12)',
  warn: '#D4D4D8',
  warnDim: 'rgba(212, 212, 216, 0.12)',
  overlay: 'rgba(0, 0, 0, 0.72)',
  scanLine: '#F4F4F5',
} as const;

export type QrattStatus = 'present' | 'late' | 'absent' | 'neutral';

export const STATUS_STYLE: Record<QrattStatus, { label: string; fg: string; bg: string; border: string }> = {
  present: { label: 'On-Time', fg: '#0A0A0A', bg: '#F4F4F5', border: '#F4F4F5' },
  late: { label: 'Late', fg: '#F4F4F5', bg: 'rgba(63,63,70,0.65)', border: '#3F3F46' },
  absent: { label: 'Absent', fg: '#FCA5A5', bg: 'rgba(252,165,165,0.12)', border: 'rgba(252,165,165,0.35)' },
  neutral: { label: 'Queued', fg: '#D4D4D8', bg: 'rgba(212,212,216,0.10)', border: 'rgba(63,63,70,0.6)' },
};

import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { COLORS } from '@/constants/colors';

export type EmptyArtKind = 'all-checked-in' | 'no-internet' | 'camera-disabled' | 'no-results';

type Props = {
  kind: EmptyArtKind;
  width?: number;
};

// Lightweight vector empty-state art matching the QR-Att palette.
// Decorative — parent must still render title + hint text.
export function EmptyArt({ kind, width = 180 }: Props) {
  const height = Math.round((width * 7) / 10);
  return (
    <View accessibilityRole="image" style={styles.box}>
      <Svg width={width} height={height} viewBox="0 0 200 140" fill="none">
        {kind === 'all-checked-in' ? <AllCheckedIn /> : null}
        {kind === 'no-internet' ? <NoInternet /> : null}
        {kind === 'camera-disabled' ? <CameraDisabled /> : null}
        {kind === 'no-results' ? <NoResults /> : null}
      </Svg>
    </View>
  );
}

function AllCheckedIn() {
  return (
    <>
      <Rect x="60" y="18" width="80" height="100" rx="12" fill={COLORS.card} stroke={COLORS.border} strokeWidth="2" />
      <Line x1="76" y1="48" x2="110" y2="48" stroke={COLORS.surface} strokeWidth="6" strokeLinecap="round" />
      <Line x1="76" y1="64" x2="124" y2="64" stroke={COLORS.surface} strokeWidth="6" strokeLinecap="round" />
      <Circle cx="100" cy="96" r="18" fill="#0C0A0914" stroke={COLORS.success} strokeWidth="3" />
      <Path d="M92 96l6 6 10-12" stroke={COLORS.success} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="52" cy="34" r="4" fill={COLORS.accent} opacity="0.5" />
      <Circle cx="150" cy="52" r="5" fill={COLORS.warning} opacity="0.45" />
      <Circle cx="146" cy="110" r="4" fill={COLORS.primary} opacity="0.4" />
    </>
  );
}

function NoInternet() {
  return (
    <>
      <Rect x="70" y="20" width="60" height="100" rx="12" fill={COLORS.card} stroke={COLORS.border} strokeWidth="2" />
      <Path d="M80 52a28 28 0 0 1 40 0" stroke={COLORS.textSecondary} strokeWidth="3" strokeLinecap="round" />
      <Path d="M88 62a16 16 0 0 1 24 0" stroke={COLORS.textSecondary} strokeWidth="3" strokeLinecap="round" />
      <Circle cx="100" cy="74" r="4" fill={COLORS.textSecondary} />
      <Line x1="70" y1="40" x2="130" y2="92" stroke={COLORS.danger} strokeWidth="3" strokeLinecap="round" />
      <Line x1="50" y1="112" x2="76" y2="112" stroke={COLORS.border} strokeWidth="4" strokeLinecap="round" strokeDasharray="2 6" />
      <Line x1="124" y1="112" x2="150" y2="112" stroke={COLORS.border} strokeWidth="4" strokeLinecap="round" strokeDasharray="2 6" />
    </>
  );
}

function CameraDisabled() {
  return (
    <>
      <Rect x="52" y="42" width="96" height="64" rx="12" fill={COLORS.card} stroke={COLORS.border} strokeWidth="2" />
      <Circle cx="100" cy="74" r="16" stroke={COLORS.textSecondary} strokeWidth="3" />
      <Circle cx="100" cy="74" r="7" stroke={COLORS.textSecondary} strokeWidth="2.5" />
      <Rect x="86" y="32" width="28" height="10" rx="4" fill={COLORS.surface} stroke={COLORS.border} strokeWidth="2" />
      <Line x1="140" y1="46" x2="168" y2="96" stroke={COLORS.warning} strokeWidth="4" strokeLinecap="round" />
      <Circle cx="154" cy="42" r="12" fill="#57534E14" stroke={COLORS.warning} strokeWidth="3" />
      <Line x1="154" y1="37" x2="154" y2="43" stroke={COLORS.warning} strokeWidth="2.5" strokeLinecap="round" />
      <Circle cx="154" cy="47" r="1.4" fill={COLORS.warning} />
    </>
  );
}

function NoResults() {
  return (
    <>
      <Circle cx="92" cy="64" r="26" stroke={COLORS.border} strokeWidth="4" />
      <Line x1="111" y1="83" x2="132" y2="104" stroke={COLORS.border} strokeWidth="6" strokeLinecap="round" />
      <Rect x="118" y="34" width="44" height="26" rx="8" fill={COLORS.card} stroke={COLORS.border} strokeWidth="2" />
      <Path d="M128 47h24M128 53h16" stroke={COLORS.surface} strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});

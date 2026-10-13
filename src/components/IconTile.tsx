import { StyleSheet, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { UiIcon, type UiIconName } from '@/components/UiIcon';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE_BG: Record<Tone, string> = {
  primary: COLORS.primary,
  success: COLORS.primary,
  warning: COLORS.card,
  danger: COLORS.card,
  neutral: COLORS.surface,
};

const TONE_FG: Record<Tone, string> = {
  primary: COLORS.textOnPrimary,
  success: COLORS.textOnPrimary,
  warning: COLORS.textPrimary,
  danger: COLORS.textPrimary,
  neutral: COLORS.textSecondary,
};

const TONE_BORDER: Record<Tone, string> = {
  primary: COLORS.primary,
  success: COLORS.primary,
  warning: COLORS.borderStrong,
  danger: COLORS.borderStrong,
  neutral: COLORS.border,
};

// Editorial Mono tile V2 — solid black for primary actions, hairline
// outline for everything else. Square-ish (12px) instead of bubbly.
export function IconTile({
  name,
  tone = 'neutral',
  size = 40,
  iconSize = 19,
}: {
  name: UiIconName;
  tone?: Tone;
  size?: number;
  iconSize?: number;
}) {
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: 12,
          backgroundColor: TONE_BG[tone],
          borderColor: TONE_BORDER[tone],
        },
      ]}
    >
      <UiIcon name={name} size={iconSize} color={TONE_FG[tone]} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});

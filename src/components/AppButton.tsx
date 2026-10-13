import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { COLORS } from '@/constants/colors';
import { RADIUS, SHADOW } from '@/constants/ui';
import { UiIcon, type UiIconName } from '@/components/UiIcon';

type LegacyIcon = 'camera' | 'refresh' | 'login' | 'register' | 'logout';
type Props = {
  title: string;
  theme?: 'primary';
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: LegacyIcon | UiIconName;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  small?: boolean;
};

const LEGACY_MAP: Record<LegacyIcon, UiIconName> = {
  camera: 'camera',
  refresh: 'refresh',
  login: 'chevron-right',
  register: 'plus',
  logout: 'logout',
};

function resolveIcon(icon?: LegacyIcon | UiIconName): UiIconName | null {
  if (!icon) return null;
  return (LEGACY_MAP as Record<string, UiIconName>)[icon] ?? (icon as UiIconName);
}

// Editorial Mono button V2: flat black primary pill, hairline secondary,
// transparent ghost. No colored shadows — depth comes from ink, not glow.
export default function AppButton({
  title,
  theme,
  variant = 'secondary',
  icon,
  onPress,
  disabled,
  loading,
  fullWidth,
  small,
}: Props) {
  const resolved: 'primary' | 'secondary' | 'danger' | 'ghost' =
    theme === 'primary' ? 'primary' : variant;
  const name = resolveIcon(icon);
  const busy = loading || disabled;
  const iconColor =
    resolved === 'primary' ? COLORS.textOnPrimary : resolved === 'danger' ? COLORS.primary : resolved === 'ghost' ? COLORS.primary : COLORS.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy: loading }}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        fullWidth && styles.fullWidth,
        resolved === 'primary' && styles.primary,
        resolved === 'danger' && styles.danger,
        resolved === 'ghost' && styles.ghost,
        resolved === 'secondary' && styles.secondary,
        pressed && !busy && styles.pressed,
        busy && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} size="small" />
      ) : name ? (
        <UiIcon name={name} size={small ? 16 : 19} color={iconColor} />
      ) : null}
      <Text
        style={[
          styles.label,
          small && styles.labelSmall,
          resolved === 'primary' && styles.primaryLabel,
          resolved === 'danger' && styles.dangerLabel,
          resolved === 'ghost' && styles.ghostLabel,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  small: { minHeight: 42, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 9 },
  fullWidth: { alignSelf: 'stretch' },
  primary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  secondary: { backgroundColor: COLORS.card, borderColor: COLORS.border, ...SHADOW.card },
  danger: { backgroundColor: COLORS.card, borderColor: COLORS.primary, borderWidth: 1.5 },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  label: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  labelSmall: { fontSize: 13 },
  primaryLabel: { color: COLORS.textOnPrimary },
  dangerLabel: { color: COLORS.primary },
  ghostLabel: { color: COLORS.primary },
  pressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
});

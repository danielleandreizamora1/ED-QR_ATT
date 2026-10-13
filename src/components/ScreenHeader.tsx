import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';

type Props = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  index?: string;
  right?: React.ReactNode;
};

// Editorial Mono header V2: index + eyebrow + hairline rule, no pill.
// Example: "01 — SCHOOL EVENTS" with a 24px rule after the eyebrow.
export function ScreenHeader({ eyebrow, title, subtitle, index, right }: Props) {
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <View style={styles.textBlock}>
        <View style={styles.eyebrowRow}>
          {index ? <Text style={styles.index}>{index}</Text> : null}
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <View style={styles.rule} />
        </View>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 },
  textBlock: { flex: 1, gap: 8 },
  right: { paddingTop: 4 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  index: { color: COLORS.textPrimary, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, fontFamily: 'monospace' },
  eyebrow: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  rule: { flex: 1, height: 1, backgroundColor: COLORS.border, marginLeft: 4 },
  title: { color: COLORS.textPrimary, fontSize: 28, fontWeight: '800', lineHeight: 32, letterSpacing: -0.5 },
  subtitle: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21 },
});

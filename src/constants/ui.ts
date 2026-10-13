// Editorial Mono tokens V2 — hairlines, soft shadows, generous whitespace.
// Radius is tighter, shadows are flatter, spacing is airier than V1.

export const RADIUS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

export const SHADOW = {
  card: {
    shadowColor: '#0C0A09',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pop: {
    shadowColor: '#0C0A09',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  sheet: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
} as const;

export const SPACING = {
  screen: 20,
  card: 16,
  gap: 12,
} as const;

// Editorial type scale — single source for headers / titles / mono labels.
export const TYPE = {
  eyebrow: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.4 },
  title: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5, lineHeight: 32 },
  subtitle: { fontSize: 14, lineHeight: 21 },
  mono: { fontFamily: 'monospace', fontSize: 11, letterSpacing: 0.8 },
} as const;

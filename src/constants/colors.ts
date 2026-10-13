// QR-att palette V2 — Editorial Mono.
// Warm paper background, true-black ink, hairline borders.
// Status is shape + label first, tone second (all monochrome).
export const COLORS = {
  primary: '#0C0A09', // stone-950 — key actions, active states
  primaryDeep: '#000000', // true black — hero / dark surfaces
  primarySoft: '#F5F5F4', // stone-100 — tinted tiles, pills
  background: '#FAFAF9', // warm paper — app background
  card: '#FFFFFF', // white — cards over paper
  textPrimary: '#0C0A09', // stone-950 — ink
  textSecondary: '#78716C', // stone-500 — muted text
  textOnPrimary: '#FFFFFF', // white — text on black fills
  surface: '#F5F5F4', // stone-100 — chips, inactive tracks
  border: '#E7E5E4', // stone-200 — hairline
  borderStrong: '#D6D3D1', // stone-300 — inputs
  shadow: '#0C0A0920',
  warning: '#57534E', // stone-600 — late / attention
  warningSoft: '#F5F5F4', // stone-100
  success: '#0C0A09', // stone-950 — success / open (solid black badge)
  successSoft: '#F5F5F4', // stone-100
  danger: '#44403C', // stone-700 — errors / closed
  dangerSoft: '#F5F5F4', // stone-100
  accent: '#0C0A09', // black — scanner focal points, highlights
} as const;

/**
 * Contentra brand tokens — the single source of truth for the Contentra
 * visual identity across Web, Mobile, and Desktop.
 *
 * Official palette: Contentra Orange (#C7FF00) on white/light surfaces with
 * near-black (#111111) typography, muted #6B6B6B text, and #E8E8E8 borders.
 * Lime is a strategic accent: primary CTAs, active navigation, selected
 * states, focus rings, progress, and important metrics only.
 */

export const brand = {
  name: 'Contentra',
  tagline: 'The operating system for creators.',
  headline: 'Grow your content 10x with Contentra',
} as const;

export const colors = {
  primary: '#C7FF00',
  primaryHover: '#B4EA00',
  primaryPressed: '#9CCB00',
  primarySoft: '#F4FFD6',
  primaryBorder: '#DDF59A',

  bg: '#FAFAFA',
  surface: '#FFFFFF',
  text: '#111111',
  muted: '#6B6B6B',
  border: '#E8E8E8',
  borderStrong: '#DCDCDC',

  danger: '#B42318',
  dangerSoft: '#FDEBEA',
  dangerBorder: '#F3D2CE',

  success: '#1E7A41',
  successSoft: '#EAF6EF',
  successBorder: '#C8E8D2',

  infoSoft: '#F4F6F8',

  surfaceDark: '#111111',
  surfaceDarkRaised: '#1C1C1C',
  textOnDark: '#FFFFFF',
  mutedOnDark: '#A6A6A6',
  borderDark: '#2E2E2E',

  focusRing: 'rgba(199, 255, 0, 0.28)',
  overlay: 'rgba(17, 17, 17, 0.35)',
} as const;

export const radii = {
  sm: 8,
  md: 11,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const font = {
  family: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  size: {
    xs: 11,
    sm: 12,
    md: 13,
    base: 14,
    lg: 16,
    xl: 18,
    '2xl': 24,
    '3xl': 28,
    '4xl': 36,
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },
  tracking: {
    tight: '-0.03em',
    tighter: '-0.04em',
    label: '0.04em',
  },
} as const;

export const zIndex = {
  sticky: 20,
  fab: 30,
  backdrop: 40,
  layered: 41,
  top: 50,
} as const;

export const shadows = {
  card: '0 1px 2px rgba(17, 17, 17, 0.04), 0 1px 3px rgba(17, 17, 17, 0.04)',
  panel: '0 1px 2px rgba(17, 17, 17, 0.04), 0 6px 20px rgba(17, 17, 17, 0.06)',
  drawer: '0 18px 50px rgba(17, 17, 17, 0.18)',
  fab: '0 10px 30px rgba(17, 17, 17, 0.18)',
} as const;
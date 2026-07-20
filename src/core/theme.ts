/**
 * Design tokens for the whole app. Keep all colors / spacing here so screens
 * stay consistent and re-theming is a one-file change.
 */
export const theme = {
  colors: {
    bg: '#0E1116',
    surface: '#171B22',
    surfaceAlt: '#1F242D',
    border: '#2A313C',
    primary: '#3DDC97', // pitch green
    primaryDark: '#27A878',
    accent: '#FFB454',
    text: '#F5F7FA',
    textMuted: '#9AA4B2',
    danger: '#FF5C5C',
    home: '#4DA3FF',
    away: '#FF8A5C',
  },
  spacing: (n: number) => n * 4,
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
  font: {
    h1: 28,
    h2: 22,
    h3: 18,
    body: 15,
    small: 13,
    tiny: 11,
  },
} as const;

export type Theme = typeof theme;

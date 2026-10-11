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
    // SD-155 (WCAG 2.1 AA). Measured in tests/a11y-contrast.test.mts — keep ≥ the
    // ratios noted when changing any of these.
    /** Dark text on every bright fill (primary/accent/danger/home/away): ≥6.3:1. */
    onFill: '#06120D',
    /** Red fill that carries WHITE text (LIVE / UNDER REVIEW / badges): 4.98:1.
     *  `danger` (#FF5C5C) with white was 3.03:1 — keep `danger` for red text/
     *  outlines on dark (5.1–6.3:1) and use this for solid red pills. */
    dangerStrong: '#D32F2F',
    /** Text-field / outline-control boundary (1.4.11 non-text ≥3:1 on bg/surface/surfaceAlt). */
    inputBorder: '#6A7482',
    /** Keyboard focus ring on web (≥10:1 on bg/surface). */
    focus: '#FFB454',
  },
  spacing: (n: number) => n * 4,
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
  font: {
    h1: 28,
    h2: 22,
    h3: 18,
    body: 15,
    small: 13,
    // SD-155: 11 → 12 so badges stay legible (and scale with the OS text size).
    tiny: 12,
  },
  // Soft elevation so surfaces lift off the background instead of reading as flat
  // outlined boxes. Cross-platform: shadow* applies on iOS/web, elevation on
  // Android. `live` is a red glow reserved for in-progress matches.
  shadow: {
    card: {
      shadowColor: '#000000',
      shadowOpacity: 0.22,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    live: {
      shadowColor: '#FF5C5C',
      shadowOpacity: 0.32,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 0 },
      elevation: 5,
    },
  },
} as const;

export type Theme = typeof theme;

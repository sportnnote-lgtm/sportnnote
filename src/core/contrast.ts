/**
 * SD-155 — WCAG 2.1 colour-contrast maths (1.4.3 text, 1.4.11 non-text).
 * Pure functions, no React: used by team-coloured buttons to pick legible ink
 * and by tests/a11y-contrast.test.mts to guard the theme tokens.
 */

/** #RGB / #RRGGBB / #RRGGBBAA → [r,g,b] 0–255, or null when not a hex colour. */
export function parseHex(hex: string | undefined | null): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1].slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The app's dark "ink" used on bright fills (green / amber / red / team colours). */
export const INK = '#06120D';
export const WHITE = '#FFFFFF';

/** Dark or white text — whichever has the higher contrast on `bg` (team colours
 *  vary). Unknown / non-hex colours get the dark ink. */
export function readableOn(bg: string | undefined | null): string {
  if (!parseHex(bg)) return INK;
  return contrastRatio(INK, bg!) >= contrastRatio(WHITE, bg!) ? INK : WHITE;
}

/** AA minimums. `large` = ≥18.66 px bold / ≥24 px regular, and UI components. */
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

/** `fg` as-is when it already reaches `min` against `bg`; otherwise mixed toward
 *  white (dark page) or black (light page) just enough to pass. For a team's
 *  colour used as text — a navy kit on the dark scoreboard still reads. */
export function ensureContrast(fg: string | undefined | null, bg: string, min = AA_TEXT): string {
  const f = parseHex(fg);
  const b = parseHex(bg);
  if (!f || !b) return fg ?? WHITE;
  if (contrastRatio(fg!, bg) >= min) return fg!;
  const target = luminance(bg) < 0.5 ? 255 : 0;
  const hex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = hex(f.map((v) => v + (target - v) * t));
    if (contrastRatio(c, bg) >= min) return c;
  }
  return target === 255 ? WHITE : '#000000';
}

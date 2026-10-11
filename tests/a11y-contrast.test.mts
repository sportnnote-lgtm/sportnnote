/**
 * SD-155 — colour contrast of the theme tokens (WCAG 2.1 AA 1.4.3 / 1.4.11).
 * Every text/background pair the app uses is listed with its minimum:
 * 4.5:1 for body text, 3:1 for large text (≥24px, or ≥18.66px bold) and for UI
 * component edges / focus rings. Change a token → this shows what it breaks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { theme } from '../src/core/theme.ts';
import { contrastRatio, readableOn, ensureContrast, INK, WHITE, luminance } from '../src/core/contrast.ts';

const c = theme.colors;
/** `fg` at alpha `a` (0–1) over `bg` — e.g. theme.colors.danger + '22' pill fills. */
function over(fg: string, a: number, bg: string): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [f, b] = [p(fg), p(bg)];
  return '#' + f.map((v, i) => Math.round(v * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join('');
}
const A22 = 0x22 / 255;
const A1F = 0x1f / 255;

type Pair = [name: string, fg: string, bg: string, min: number];
const PAIRS: Pair[] = [
  // body text on every surface
  ...(['bg', 'surface', 'surfaceAlt'] as const).flatMap((s): Pair[] => [
    [`text on ${s}`, c.text, c[s], 4.5],
    [`textMuted on ${s}`, c.textMuted, c[s], 4.5],
    [`primary (links) on ${s}`, c.primary, c[s], 4.5],
    [`primaryDark on ${s}`, c.primaryDark, c[s], 4.5],
    [`accent on ${s}`, c.accent, c[s], 4.5],
    [`danger (error text) on ${s}`, c.danger, c[s], 4.5],
    [`home on ${s}`, c.home, c[s], 4.5],
    [`away on ${s}`, c.away, c[s], 4.5],
    // 1.4.11: text-field edge and the web focus ring
    [`inputBorder on ${s}`, c.inputBorder, c[s], 3],
    [`focus ring on ${s}`, c.focus, c[s], 3],
  ]),
  // dark ink on every bright fill (Button, SelectChip on, pads, LIVE pill text…)
  ...(['primary', 'primaryDark', 'accent', 'danger', 'home', 'away', 'textMuted'] as const).map((s): Pair => [`onFill on ${s}`, c.onFill, c[s], 4.5]),
  // white only on the strong red (LIVE / UNDER REVIEW / unread badge)
  ['white on dangerStrong', WHITE, c.dangerStrong, 4.5],
  // tinted pills: coloured text on its own colour at 13% over the card
  ['danger on danger+22 (LIVE badge on a card)', c.danger, over(c.danger, A22, c.surface), 4.5],
  ['primary on primary+22 (win pill)', c.primary, over(c.primary, A22, c.surface), 4.5],
  ['accent on accent+22 (cue banners)', c.accent, over(c.accent, A22, c.bg), 4.5],
  ['primary on primary+1F (ConfirmSheet NO)', c.primary, over(c.primary, A1F, c.surface), 4.5],
  ['text on accent+26 (backfill bar)', c.accent, over(c.accent, 0x26 / 255, c.bg), 4.5],
];

test('every theme text/background pair meets WCAG 2.1 AA', () => {
  const fails = PAIRS.map(([name, fg, bg, min]) => ({ name, ratio: contrastRatio(fg, bg), min }))
    .filter((p) => p.ratio < p.min)
    .map((p) => `${p.name}: ${p.ratio.toFixed(2)}:1 < ${p.min}:1`);
  assert.deepEqual(fails, []);
});

test('the D20 audit failure is fixed: white text never sits on `danger`', () => {
  assert.ok(contrastRatio(WHITE, c.danger) < 4.5, 'danger is the bright red — white on it fails (2.8–3.0:1)');
  assert.ok(contrastRatio(WHITE, c.dangerStrong) >= 4.5);
  assert.ok(contrastRatio(c.onFill, c.danger) >= 4.5);
});

test('contrast maths matches the WCAG reference values', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF').toFixed(1), '21.0');
  assert.equal(contrastRatio('#777777', '#FFFFFF').toFixed(2), '4.48');
  assert.equal(luminance('#FFFFFF'), 1);
  assert.equal(contrastRatio('#fff', '#FFFFFF'), 1);
});

test('readableOn picks the higher-contrast ink for any team colour', () => {
  assert.equal(readableOn('#FF5C5C'), INK); // the old 0.36 cut-off picked white (3.0:1)
  assert.equal(readableOn('#4DA3FF'), INK);
  assert.equal(readableOn('#1A237E'), WHITE); // navy kit
  assert.equal(readableOn('#000000'), WHITE);
  assert.equal(readableOn('#FFEB3B'), INK);
  assert.equal(readableOn('not-a-colour'), INK);
  for (const kit of ['#E53935', '#8E24AA', '#3949AB', '#00897B', '#7CB342', '#FB8C00', '#6D4C41', '#546E7A', '#C2185B', '#0097A7']) {
    assert.ok(contrastRatio(readableOn(kit), kit) >= 4.5 || contrastRatio(readableOn(kit), kit) >= Math.max(contrastRatio(INK, kit), contrastRatio(WHITE, kit)) - 1e-9, kit);
  }
});

test('ensureContrast lifts a dark kit colour used as scoreboard text', () => {
  const navy = '#1A237E';
  assert.ok(contrastRatio(navy, c.surface) < 3);
  const lifted = ensureContrast(navy, c.surface, 3);
  assert.ok(contrastRatio(lifted, c.surface) >= 3, lifted);
  assert.equal(ensureContrast(c.home, c.surface, 3), c.home); // already fine → unchanged
});

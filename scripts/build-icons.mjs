#!/usr/bin/env node
/**
 * Every app icon from ONE logo: the "S:N" scoreline (green S, amber colon, white N
 * on the app's dark #0E1116). Edit the glyph or colours here, then run:
 *
 *   npm i --no-save @resvg/resvg-js@2.6.2 && node scripts/build-icons.mjs
 *
 * Writes the master SVGs (assets/brand/) and every PNG the app, web app and
 * website use. Sizes follow each platform's safe zone so nothing gets cropped:
 * iPhone rounds the square itself; Android adaptive icons and "maskable" web
 * icons are cut to a circle/squircle, so the mark sits smaller there.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(process.env.RESVG_DIR ?? ROOT, 'package.json'));
let Resvg;
try { ({ Resvg } = require('@resvg/resvg-js')); } catch {
  console.error('Needs @resvg/resvg-js: npm i --no-save @resvg/resvg-js@2.6.2'); process.exit(1);
}

export const BRAND = { dark: '#0E1116', green: '#3DDC97', amber: '#FFB454', white: '#FFFFFF' };

/** The S:N mark on a 200×200 grid, centred on (100,100), scaled by `s`. */
function mark(s, c = { s: BRAND.green, colon: BRAND.amber, n: BRAND.white }) {
  return `<g transform="translate(100 100) scale(${s}) translate(-100 -100)">
  <path d="M80 68 H52 a16 16 0 0 0 0 32 h12 a16 16 0 0 1 0 32 H34" fill="none" stroke="${c.s}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="100" cy="86" r="8" fill="${c.colon}"/><circle cx="100" cy="114" r="8" fill="${c.colon}"/>
  <path d="M122 132 V68 L166 132 V68" fill="none" stroke="${c.n}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
</g>`;
}
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${body}</svg>`;
const tile = (rx = 0) => `<rect width="200" height="200" rx="${rx}" fill="${BRAND.dark}"/>`;

const out = {
  // Masters (vector) — for print, partners, the website, anything new.
  'assets/brand/sportnnote-logo.svg': svg(tile(44) + mark(1)),
  'assets/brand/sportnnote-icon-square.svg': svg(tile(0) + mark(0.85)),
  'assets/brand/sportnnote-mark.svg': svg(mark(1)),
};
const png = {
  // Native app icon (iPhone/Expo rounds it) and the website's logo.
  'assets/icon.png': [svg(tile(0) + mark(0.85)), 1024],
  // Android adaptive icon: background layer + mark inside the 66% safe circle.
  'assets/android-icon-background.png': [svg(tile(0)), 1024],
  'assets/android-icon-foreground.png': [svg(mark(0.72)), 1024],
  // Android 13 themed icons + the notification icon: one colour, shape only.
  'assets/android-icon-monochrome.png': [svg(mark(0.72, { s: BRAND.white, colon: BRAND.white, n: BRAND.white })), 1024],
  'assets/splash-icon.png': [svg(mark(1)), 1024],
  // Browser tab: a rounded tile reads best at 16–48 px.
  'assets/favicon.png': [svg(tile(44) + mark(1)), 48],
  'assets/brand/sportnnote-logo-512.png': [svg(tile(44) + mark(1)), 512],
  // Web app (iPhone Home Screen + Android "Add to Home screen"), maskable-safe.
  'public/apple-touch-icon.png': [svg(tile(0) + mark(0.8)), 180],
  'public/icon-192.png': [svg(tile(0) + mark(0.8)), 192],
  'public/icon-512.png': [svg(tile(0) + mark(0.8)), 512],
};

mkdirSync(join(ROOT, 'assets/brand'), { recursive: true });
for (const [f, s] of Object.entries(out)) writeFileSync(join(ROOT, f), s + '\n');
for (const [f, [s, w]] of Object.entries(png)) {
  writeFileSync(join(ROOT, f), new Resvg(s, { fitTo: { mode: 'width', value: w } }).render().asPng());
  console.log('wrote', f, `${w}px`);
}

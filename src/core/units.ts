/**
 * Display units (SD-154, international I-2b). Everything is STORED metric —
 * metres, kilograms, seconds — and records stay metric. A US meet (or a viewer
 * whose region uses US units) can SEE and TYPE field marks in feet and inches,
 * lifts in pounds and road distances in miles. Swimming yards are not a unit
 * conversion: a 25-yard pool is its own course (data/results/swimming.ts SCY).
 *
 * Pure — no React Native imports (node tests, results engine).
 */

export type FieldUnits = 'metric' | 'imperial';
export type MassUnits = 'kg' | 'kg+lb';
export type DistanceUnits = 'km' | 'mi';

export const M_PER_INCH = 0.0254;
export const LB_PER_KG = 2.20462262;
export const M_PER_MILE = 1609.344;

const FRACTION: Record<number, string> = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' };

/** Metres → feet and inches to the NEAREST quarter inch (so a mark typed in
 *  feet and inches, stored to the centimetre, reads back exactly as typed). */
export function metresToFeetInches(m: number): { feet: number; inches: number } {
  const quarters = Math.round((m / M_PER_INCH) * 4);
  const feet = Math.floor(quarters / 48);
  return { feet, inches: (quarters - feet * 48) / 4 };
}

/** 6.51 → `21' 4¼"`; 1.83 → `6' 0"`. Fractions are quarter inches. */
export function formatFeetInches(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '';
  const { feet, inches } = metresToFeetInches(m);
  const whole = Math.floor(inches);
  const frac = FRACTION[inches - whole] ?? '';
  return `${feet}' ${whole}${frac}"`;
}

/** Text that looks like feet and inches rather than a metric decimal. */
export const looksImperial = (text: string): boolean => /['"′″¼½¾]|\bft\b|\bin\b|feet|inch|^\s*\d+\s*-\s*\d/.test(text);

/**
 * A typed feet-and-inches mark → metres, rounded to the centimetre, or null.
 * Accepts `21' 4.25"`, `21'4¼"`, `21 ft 4 in`, `21ft`, `4.5"` (inches only)
 * and the US results notation `21-04.25` / `6-02` (feet-inches).
 */
export function parseFeetInches(text: string): number | null {
  let t = (text ?? '').trim().toLowerCase().replace(/[′’]/g, "'").replace(/[″”]/g, '"').replace(/,/g, '.');
  if (!t) return null;
  t = t.replace(/(\d)\s*¼/g, '$1.25').replace(/(\d)\s*½/g, '$1.5').replace(/(\d)\s*¾/g, '$1.75')
    .replace(/^¼/, '0.25').replace(/^½/, '0.5').replace(/^¾/, '0.75');
  let feet = 0, inches = 0;
  const dash = /^(\d+)\s*-\s*(\d+(?:\.\d+)?)$/.exec(t);
  const words = /^(?:(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot))?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches|''))?$/.exec(t);
  if (dash) { feet = Number(dash[1]); inches = Number(dash[2]); }
  else if (words && (words[1] != null || words[2] != null)) { feet = Number(words[1] ?? 0); inches = Number(words[2] ?? 0); }
  else return null;
  if (!Number.isFinite(feet) || !Number.isFinite(inches) || inches >= 12 || feet < 0 || inches < 0) return null;
  const m = (feet * 12 + inches) * M_PER_INCH;
  if (!(m > 0)) return null;
  return Math.round(m * 100) / 100;
}

/* --------------------------------- mass ----------------------------------- */

/** 105 → "231.5 lb" (one decimal, trailing .0 dropped). */
export function formatLb(kg: number | null | undefined): string {
  if (kg == null || !Number.isFinite(kg)) return '';
  const lb = Math.round(kg * LB_PER_KG * 10) / 10;
  return `${Number.isInteger(lb) ? lb : lb.toFixed(1)} lb`;
}

/** "105 kg" or "105 kg (231.5 lb)" for a meet showing pounds too. */
export function kgText(kg: number, units: MassUnits = 'kg', fmt: (v: number) => string = String): string {
  return units === 'kg+lb' ? `${fmt(kg)} kg (${formatLb(kg)})` : `${fmt(kg)} kg`;
}

/* ------------------------------- distance --------------------------------- */

/** 5000 → "3.1 mi"; 42195 → "26.2 mi"; 1609 → "1 mi". */
export function formatMiles(metres: number): string {
  const mi = metres / M_PER_MILE;
  const r = Math.round(mi * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)} mi`;
}

/** "10 km" or "10 km (6.2 mi)". */
export function distanceText(metres: number, units: DistanceUnits = 'km'): string {
  const km = metres / 1000;
  const base = metres < 1000 ? `${metres} m` : `${+km.toFixed(3)} km`;
  return units === 'mi' && metres >= 1000 ? `${base} (${formatMiles(metres)})` : base;
}

/* ---------------------------- meet / viewer pick --------------------------- */

/** The region's unit system ('us' = US customary display), from core/region.ts. */
export type RegionUnits = 'metric' | 'us';

/**
 * A meet's display choice for one kind of measure: the meet setting when it
 * names one, else the viewer's region ('us' → the US unit). India and every
 * metric region stay metric.
 */
export function fieldUnitsOf(fmt: Record<string, unknown> | undefined | null, region: RegionUnits = 'metric'): FieldUnits {
  const v = fmt?.fieldUnits;
  if (v === 'metric' || v === 'imperial') return v;
  return region === 'us' ? 'imperial' : 'metric';
}
export function massUnitsOf(fmt: Record<string, unknown> | undefined | null, region: RegionUnits = 'metric'): MassUnits {
  const v = fmt?.massUnits;
  if (v === 'kg' || v === 'kg+lb') return v;
  return region === 'us' ? 'kg+lb' : 'kg';
}
export function distanceUnitsOf(fmt: Record<string, unknown> | undefined | null, region: RegionUnits = 'metric'): DistanceUnits {
  const v = fmt?.distanceUnits;
  if (v === 'km' || v === 'mi') return v;
  return region === 'us' ? 'mi' : 'km';
}

/**
 * Defaults a NEW tournament's sport format gets from the creator's region
 * (never applied to existing tournaments): a US swim meet starts in a 25-yard
 * pool; field marks in feet and inches (and road distances with miles); lifts
 * with pounds alongside kilograms.
 * Metric regions (India included) get nothing — today's defaults stand.
 */
export function regionFormatDefaults(sport: string, region: RegionUnits): Record<string, string> {
  if (region !== 'us') return {};
  switch (sport) {
    case 'swimming': return { course: 'SCY' };
    case 'athletics': return { fieldUnits: 'imperial', distanceUnits: 'mi' };
    case 'weightlifting': return { massUnits: 'kg+lb' };
    default: return {};
  }
}

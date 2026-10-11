/**
 * SD-93 — athletics combined events: the World Athletics Scoring Tables for
 * Combined Events (the 2001 IAAF tables, still in use), the event lists and
 * the combined-event disciplines. No imports, so model.ts can build its
 * catalogue (and parse a key) from it.
 *
 * Points (Scoring Tables introduction):
 *   track   points = INT(A · (B − T)^C)   T = time in seconds (to 1/100)
 *   jumps   points = INT(A · (M − B)^C)   M = height / distance in CENTIMETRES
 *   throws  points = INT(A · (M − B)^C)   M = distance in METRES
 * (B − T) or (M − B) ≤ 0 scores 0. The coefficients below reproduce the
 * published world-record totals exactly (tests/combined-events.test.mts:
 * decathlon 9126 / 9045, heptathlon 7291, indoor heptathlon 6645, indoor
 * pentathlon 5055, women's decathlon 8358).
 *
 * Hand times: the tables score fully automatic times. A hand time is converted
 * first — +0.24 s for races up to 200 m and the sprint hurdles, +0.14 s for
 * 300–400 m; none from 800 m (the conversion in the Scoring Tables'
 * introduction / TR 39 practice — from memory, verify against your edition).
 *
 * Event lists (World Athletics TR 39.1–39.3, from memory): decathlon (men)
 * 100 m, LJ, SP, HJ, 400 m / 110 mH, DT, PV, JT, 1500 m; heptathlon (women)
 * 100 mH, HJ, SP, 200 m / LJ, JT, 800 m; women's decathlon 100 m, DT, PV, JT,
 * 400 m / 100 mH, LJ, SP, HJ, 1500 m; indoor pentathlon (women, one day)
 * 60 mH, HJ, SP, LJ, 800 m; indoor heptathlon (men) 60 m, LJ, SP, HJ / 60 mH,
 * PV, 1000 m. U18 / U20 combined events use the same tables with lighter
 * implements and lower hurdles (implements per category from field.ts).
 * School pentathlon / tetrathlon are NOT World Athletics events: they are
 * presets of scorable events for a school or house to edit.
 */

export type CombinedTable = 'M' | 'F';
export type ScoreKind = 'track' | 'jump' | 'throw';
export interface Coeff { A: number; B: number; C: number; kind: ScoreKind }

const t = (A: number, B: number, C: number): Coeff => ({ A, B, C, kind: 'track' });
const j = (A: number, B: number, C: number): Coeff => ({ A, B, C, kind: 'jump' });
const w = (A: number, B: number, C: number): Coeff => ({ A, B, C, kind: 'throw' });

/** The official A / B / C per event — men's and women's tables. */
export const COEFFS: Record<CombinedTable, Record<string, Coeff>> = {
  M: {
    'ath.100m': t(25.4347, 18, 1.81),
    'ath.400m': t(1.53775, 82, 1.81),
    'ath.1500m': t(0.03768, 480, 1.85),
    'ath.110mh': t(5.74352, 28.5, 1.92),
    // indoor
    'ath.60m': t(58.015, 11.5, 1.81),
    'ath.60mh': t(20.5173, 15.5, 1.92),
    'ath.1000m': t(0.08713, 305.5, 1.85),
    'ath.lj': j(0.14354, 220, 1.4),
    'ath.hj': j(0.8465, 75, 1.42),
    'ath.pv': j(0.2797, 100, 1.35),
    'ath.sp': w(51.39, 1.5, 1.05),
    'ath.dt': w(12.91, 4, 1.1),
    'ath.jt': w(10.14, 7, 1.08),
  },
  F: {
    'ath.100m': t(17.857, 21, 1.81),
    'ath.200m': t(4.99087, 42.5, 1.81),
    'ath.400m': t(1.34285, 91.7, 1.81),
    'ath.800m': t(0.11193, 254, 1.88),
    'ath.1500m': t(0.02883, 535, 1.88),
    'ath.100mh': t(9.23076, 26.7, 1.835),
    // indoor
    'ath.60mh': t(20.0479, 17, 1.835),
    'ath.lj': j(0.188807, 210, 1.41),
    'ath.hj': j(1.84523, 75, 1.348),
    'ath.pv': j(0.44125, 100, 1.35),
    'ath.sp': w(56.0211, 1.5, 1.05),
    'ath.dt': w(12.3311, 3, 1.1),
    'ath.jt': w(15.9803, 3.8, 1.04),
  },
};

/** The events a table can score, in a sensible running order. */
export const SCORABLE: Record<CombinedTable, string[]> = {
  M: ['ath.60m', 'ath.100m', 'ath.400m', 'ath.1000m', 'ath.1500m', 'ath.60mh', 'ath.110mh', 'ath.lj', 'ath.hj', 'ath.pv', 'ath.sp', 'ath.dt', 'ath.jt'],
  F: ['ath.100m', 'ath.200m', 'ath.400m', 'ath.800m', 'ath.1500m', 'ath.60mh', 'ath.100mh', 'ath.lj', 'ath.hj', 'ath.pv', 'ath.sp', 'ath.dt', 'ath.jt'],
};

/** Hand → automatic conversion before scoring (seconds), or 0. */
export function handAdd(discipline: string): number {
  if (['ath.60m', 'ath.100m', 'ath.200m', 'ath.60mh', 'ath.100mh', 'ath.110mh'].includes(discipline)) return 0.24;
  if (['ath.400m'].includes(discipline)) return 0.14;
  return 0;
}

/**
 * Points for one mark. `mark` = seconds (track) or metres (jumps / throws).
 * Returns 0 for an event the table doesn't score or a mark off the table.
 */
export function combinedPoints(discipline: string, table: CombinedTable, mark: number | null | undefined, o: { hand?: boolean } = {}): number {
  const c = COEFFS[table][discipline];
  if (!c || mark == null || !Number.isFinite(mark) || mark <= 0) return 0;
  let x: number;
  if (c.kind === 'track') {
    // hundredths as integers — no floating-point noise at the boundary
    const T = Math.round(mark * 100) + (o.hand ? Math.round(handAdd(discipline) * 100) : 0);
    x = (Math.round(c.B * 100) - T) / 100;
  } else if (c.kind === 'jump') {
    x = Math.round(mark * 100) - c.B; // centimetres
  } else {
    x = Math.round(mark * 100) / 100 - c.B;
  }
  if (!(x > 0)) return 0;
  return Math.floor(c.A * Math.pow(x, c.C) + 1e-9);
}

/* ------------------------------- the presets ------------------------------- */

export type CombinedKind = 'dec' | 'hep' | 'ipen' | 'ihep' | 'pen' | 'tet';

export interface CombinedPreset {
  kind: CombinedKind;
  label: string;
  /** the events per table (absent = not offered for that gender) */
  events: Partial<Record<CombinedTable, string[]>>;
  /** the first event of day 2 (index), per table — absent = one day */
  day2?: Partial<Record<CombinedTable, number>>;
  indoor?: boolean;
  /** a school preset (not a World Athletics event) */
  school?: boolean;
  note: string;
}

export const COMBINED_PRESETS: CombinedPreset[] = [
  {
    kind: 'dec', label: 'Decathlon',
    events: {
      M: ['ath.100m', 'ath.lj', 'ath.sp', 'ath.hj', 'ath.400m', 'ath.110mh', 'ath.dt', 'ath.pv', 'ath.jt', 'ath.1500m'],
      F: ['ath.100m', 'ath.dt', 'ath.pv', 'ath.jt', 'ath.400m', 'ath.100mh', 'ath.lj', 'ath.sp', 'ath.hj', 'ath.1500m'],
    },
    day2: { M: 5, F: 5 },
    note: 'World Athletics TR 39: 10 events over two consecutive days (women’s decathlon in its own order).',
  },
  {
    kind: 'hep', label: 'Heptathlon',
    events: { F: ['ath.100mh', 'ath.hj', 'ath.sp', 'ath.200m', 'ath.lj', 'ath.jt', 'ath.800m'] },
    day2: { F: 4 },
    note: 'World Athletics TR 39: 7 events over two consecutive days.',
  },
  {
    kind: 'ihep', label: 'Indoor heptathlon', indoor: true,
    events: { M: ['ath.60m', 'ath.lj', 'ath.sp', 'ath.hj', 'ath.60mh', 'ath.pv', 'ath.1000m'] },
    day2: { M: 4 },
    note: 'World Athletics indoor (TR 39): 7 events over two days.',
  },
  {
    kind: 'ipen', label: 'Indoor pentathlon', indoor: true,
    events: { F: ['ath.60mh', 'ath.hj', 'ath.sp', 'ath.lj', 'ath.800m'] },
    note: 'World Athletics indoor (TR 39): 5 events in one day.',
  },
  {
    kind: 'pen', label: 'Pentathlon (school)', school: true,
    events: {
      M: ['ath.110mh', 'ath.lj', 'ath.sp', 'ath.hj', 'ath.1000m'],
      F: ['ath.100mh', 'ath.hj', 'ath.sp', 'ath.lj', 'ath.800m'],
    },
    note: 'A school preset (U14–U18): hurdles, jumps, shot and a run in one day, with the category’s lighter implements and lower hurdles. Change the events to your board’s list.',
  },
  {
    kind: 'tet', label: 'Tetrathlon (school)', school: true,
    events: {
      M: ['ath.100m', 'ath.lj', 'ath.sp', 'ath.1000m'],
      F: ['ath.100m', 'ath.lj', 'ath.sp', 'ath.800m'],
    },
    note: 'A school preset (U12–U16): sprint, jump, throw, run in one day. Change the events to your board’s list.',
  },
];

export const presetOf = (kind: string): CombinedPreset | undefined => COMBINED_PRESETS.find((p) => p.kind === kind);

/** Short event names for lists ("100 m, LJ, SP"). */
export const SHORT: Record<string, string> = {
  'ath.60m': '60 m', 'ath.100m': '100 m', 'ath.200m': '200 m', 'ath.400m': '400 m', 'ath.800m': '800 m', 'ath.1000m': '1000 m', 'ath.1500m': '1500 m',
  'ath.60mh': '60 mH', 'ath.100mh': '100 mH', 'ath.110mh': '110 mH',
  'ath.lj': 'LJ', 'ath.hj': 'HJ', 'ath.pv': 'PV', 'ath.sp': 'SP', 'ath.dt': 'DT', 'ath.jt': 'JT',
};
export const shortName = (d: string) => SHORT[d] ?? d.replace(/^ath\./, '');

/* ------------------------- the combined disciplines ------------------------- */

/** What `PhaseFormat.combined` holds: every phase of a combined event is one
 *  of its events (the phase's own discipline), in order. */
export interface CombinedFormat {
  /** the combined discipline ('ath.ce_dec', or 'ath.ce_x_100m_lj_sp' for a house list) */
  key: string;
  /** the scoring table: men's or women's */
  table: CombinedTable;
  /** the events in order */
  events: string[];
  /** index of the first event of day 2 (absent = one day) */
  day2?: number;
  /** this phase's event (0-based) */
  index: number;
  /** the implements chosen for the throws ("ath.sp" → "4 kg") */
  implements?: Record<string, string>;
  /** heats (track) in which a false start has been charged and warned (TR 39.8.3) */
  fsWarned?: number[];
}

/** The combined discipline key for a kind + event list: a preset's own list →
 *  'ath.ce_<kind>'; anything else → 'ath.ce_x_<events>' (a house list keeps its
 *  own records and PBs). */
export function combinedKey(kind: CombinedKind | 'x', table: CombinedTable, events: string[]): string {
  const p = kind === 'x' ? undefined : presetOf(kind);
  const std = p?.events[table];
  if (p && std && std.length === events.length && std.every((d, i) => d === events[i])) return `ath.ce_${p.kind}`;
  return `ath.ce_x_${events.map((d) => d.replace(/^ath\./, '')).join('_')}`;
}

export interface CombinedEventDef { key: string; label: string; kind?: CombinedKind; events?: string[] }

/** 'ath.ce_dec' → Decathlon; 'ath.ce_x_100m_lj_sp' → "Combined event (100 m, LJ, SP)". */
export function combinedEventOf(key?: string | null): CombinedEventDef | null {
  const m = /^ath\.ce_(.+)$/.exec(key ?? '');
  if (!m) return null;
  const p = presetOf(m[1]);
  if (p) return { key: key!, label: p.label.replace(' (school)', ''), kind: p.kind };
  const x = /^x_([a-z0-9_]+)$/.exec(m[1]);
  if (!x) return null;
  const events = x[1].split('_').map((s) => `ath.${s}`);
  if (events.length < 2 || events.some((d) => !COEFFS.M[d] && !COEFFS.F[d])) return null;
  return { key: key!, label: `Combined event (${events.map(shortName).join(', ')})`, events };
}

export const isCombinedKey = (key?: string | null): boolean => !!combinedEventOf(key);

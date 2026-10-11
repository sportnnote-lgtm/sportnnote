/**
 * SD-95 — the World Archery (WA) target rounds the results engine knows (no
 * imports, so model.ts can build its discipline catalogue from it). Rules as
 * implemented — WA Rulebook Book 2 (events) and Book 3 (target archery), as
 * remembered (see the SD-95 report for what is unsure):
 *
 *  - Ranking round, outdoor: 72 arrows in 12 ends of 6 (two halves of 36) —
 *    recurve 70 m on the 122 cm face, compound 50 m on the 80 cm 6-ring face,
 *    barebow 50 m on the 122 cm face. U18 recurve shoots 60 m.
 *  - Ranking round, indoor: 60 arrows at 18 m in 20 ends of 3, 40 cm faces
 *    (recurve / compound triple faces; compound scores the small inner 10).
 *  - An arrow scores X (an inner 10, counted 10), 10 … 1, or M (a miss, 0).
 *  - Ties in the ranking round: most 10s (X included), then most X; still level
 *    → a shoot-off for a place that decides who enters match play, otherwise a
 *    coin toss for the seeding position (Book 3 ties article — 14.5 as remembered).
 *  - Match play: a seeded bracket (1 v 8, 4 v 5, 2 v 7, 3 v 6 …; byes for the
 *    top seeds when the field is short). Recurve and barebow: the set system —
 *    ends of 3 arrows, 2 set points for the higher end, 1 each for a tie, the
 *    first to 6 wins; 5–5 → a one-arrow shoot-off, the higher score wins, then
 *    the arrow closest to the centre. Compound: cumulative — 5 ends of 3 arrows,
 *    the higher total wins; level → the same one-arrow shoot-off. The semi-final
 *    losers shoot the bronze medal match.
 *
 * School / club rounds (shorter distances, bigger faces) are offered as house
 * presets — the national federation or the school board sets them.
 */

/** An arrow: X (inner 10, scores 10), 10 … 1, or M (a miss, 0). */
export type Arrow = number | 'X' | 'M';
export type Bow = 'R' | 'C' | 'B';
export type ArchMatchFormat = 'sets' | 'cumulative';

export const BOW_LABEL: Record<Bow, string> = { R: 'Recurve', C: 'Compound', B: 'Barebow' };
/** WA: recurve and barebow matches use the set system, compound is cumulative. */
export const matchFormatOf = (bow: Bow): ArchMatchFormat => (bow === 'C' ? 'cumulative' : 'sets');

export interface ArchRoundDef {
  key: string;
  label: string;
  short: string;
  bow: Bow;
  /** metres */
  distance: number;
  indoor: boolean;
  /** arrows in the ranking round */
  arrows: number;
  /** arrows per end (6 outdoor, 3 indoor) */
  perEnd: number;
  face: string;
  /** 'wa' = a World Archery round; 'school' = a house preset (shorter / bigger face) */
  level: 'wa' | 'school';
  note: string;
}

const out = (bow: Bow, distance: number, face: string, level: 'wa' | 'school', note: string): ArchRoundDef => ({
  key: `arch.${bow.toLowerCase()}${distance}`, label: `${BOW_LABEL[bow]} ${distance} m`, short: `${bow}${distance}`,
  bow, distance, indoor: false, arrows: 72, perEnd: 6, face, level, note,
});
const ind = (bow: Bow, distance: number, face: string, level: 'wa' | 'school', note: string): ArchRoundDef => ({
  key: `arch.${bow.toLowerCase()}${distance}i`, label: `${BOW_LABEL[bow]} ${distance} m indoor`, short: `${bow}${distance}i`,
  bow, distance, indoor: true, arrows: 60, perEnd: 3, face, level, note,
});

export const ARCH_ROUNDS: ArchRoundDef[] = [
  out('R', 70, '122 cm face', 'wa', 'WA senior and U21'),
  out('R', 60, '122 cm face', 'wa', 'WA U18'),
  out('R', 40, '122 cm face', 'school', 'club / U15 (a house choice)'),
  out('R', 30, '80 cm face', 'school', 'school (a house choice)'),
  out('R', 20, '80 cm face', 'school', 'school beginners (a house choice)'),
  out('C', 50, '80 cm 6-ring face', 'wa', 'WA senior, U21 and U18'),
  out('C', 30, '80 cm face', 'school', 'school (a house choice)'),
  out('B', 50, '122 cm face', 'wa', 'WA barebow'),
  out('B', 30, '122 cm face', 'school', 'school (a house choice)'),
  ind('R', 18, '40 cm triple face', 'wa', 'WA indoor'),
  ind('C', 18, '40 cm triple face, inner 10', 'wa', 'WA indoor'),
  ind('B', 18, '40 cm face', 'wa', 'WA indoor'),
];

export const archRoundOf = (key?: string): ArchRoundDef | undefined => ARCH_ROUNDS.find((r) => r.key === key);

/** Ends in the ranking round: 12 outdoor, 20 indoor. */
export const endsOf = (r: ArchRoundDef): number => Math.ceil(r.arrows / r.perEnd);

/** The most one end can score: 60 (6 arrows) / 30 (3 arrows). */
export const endMax = (perEnd: number): number => perEnd * 10;

/** Match play: 3 arrows an end; 5 ends at most (sets) / exactly 5 (cumulative); first to 6 set points. */
export const MATCH_ARROWS = 3;
export const MATCH_ENDS = 5;
export const SET_WIN = 6;

/* ---------------------------------- arrows --------------------------------- */

/** What an arrow scores: X → 10, M → 0. */
export const arrowValue = (a: Arrow): number => (a === 'X' ? 10 : a === 'M' ? 0 : a);
export const arrowText = (a: Arrow): string => String(a);
/** Scorecard order (WA): highest first, X before 10, M last. */
export const arrowRank = (a: Arrow): number => (a === 'X' ? 11 : a === 'M' ? 0 : a);
export const sortEnd = (arrows: Arrow[]): Arrow[] => [...arrows].sort((x, y) => arrowRank(y) - arrowRank(x));
export const endSum = (arrows: Arrow[]): number => arrows.reduce<number>((s, a) => s + arrowValue(a), 0);
/** 10s as WA counts them for ties: X included. */
export const endTens = (arrows: Arrow[]): number => arrows.filter((a) => a === 'X' || a === 10).length;
export const endXs = (arrows: Arrow[]): number => arrows.filter((a) => a === 'X').length;

/** One arrow as typed / tapped: "X", "10" … "1", "M" (or 0). */
export function parseArrow(t: string): Arrow | null {
  const s = t.trim().toUpperCase();
  if (s === 'X' || s === '*') return 'X';
  if (s === 'M' || s === '0') return 'M';
  if (!/^\d{1,2}$/.test(s)) return null;
  const v = Number(s);
  return v >= 1 && v <= 10 ? v : null;
}

/**
 * SD-84 (GF-09) — unofficial World Handicap System maths for a player's
 * profile. PURE (unit-tested in tests/golf-handicap-team-match.test.mts).
 *
 *   • Adjusted Gross Score (WHS Rule 3.1): each hole capped at net double
 *     bogey = par + 2 + the handicap strokes received on that hole, with the
 *     strokes taken from the COURSE Handicap (not the playing handicap). A
 *     player without a Handicap Index is capped at par + 5 (Rule 3.1b). A
 *     picked-up hole takes the cap (Rule 3.3: most likely score, never more
 *     than net double bogey).
 *   • Score Differential (WHS Rule 5.1):
 *       (113 ÷ Slope Rating) × (Adjusted Gross Score − Course Rating − PCC),
 *     rounded to the nearest tenth (a negative .x5 rounds upward). We have no
 *     Playing Conditions Calculation, so PCC = 0.
 *   • Index estimate (WHS Rule 5.2, table 5.2a): the average of the lowest
 *     differentials among the most recent 20 (8 of 20; fewer scores use fewer
 *     differentials plus an adjustment). Shown ONLY as an "unofficial index
 *     estimate" — only an authorised association (in India the IGU) issues a
 *     Handicap Index, and we apply no caps (Rule 5.8), no exceptional-score
 *     reduction (Rule 5.9) and no PCC.
 *
 * Only complete 18-hole rounds on a tee with a Course Rating and Slope get a
 * differential: 9-hole scores use the WHS expected-score method, which is not
 * built, and incomplete rounds would need net par on unplayed holes (Rule 3.2).
 */
import { courseHandicap, strokesReceived, type GolfCard, type Hole, type Tee } from './engine.ts';

const tenth = (x: number) => Math.round(x * 10) / 10;

/** WHS Rule 3.1 — the Adjusted Gross Score of a COMPLETE card (every hole a
 *  number or a pick-up), or null. `index` undefined = no Handicap Index. */
export function adjustedGrossScore(card: Pick<GolfCard, 'strokes'>, holes: Hole[], tee: Tee | undefined, index: number | undefined): number | null {
  if (!holes.length || card.strokes.length < holes.length) return null;
  if (holes.some((_, i) => card.strokes[i] == null)) return null;
  const recv = index == null ? holes.map(() => 0) : strokesReceived(courseHandicap(index, tee, holes), holes);
  let ags = 0;
  holes.forEach((h, i) => {
    const cap = index == null ? h.par + 5 : h.par + 2 + recv[i];
    const s = card.strokes[i];
    ags += s === 'P' || s == null ? cap : Math.min(s, cap);
  });
  return ags;
}

/** WHS Rule 5.1 — Score Differential, to one decimal. */
export function scoreDifferential(ags: number, courseRating: number, slope: number, pcc = 0): number {
  return tenth((113 / slope) * (ags - courseRating - pcc));
}

export interface RoundDifferential {
  adjGross: number;
  differential: number;
  courseRating: number;
  slope: number;
}

/** A finished round's AGS + differential, when one can be worked out: an
 *  18-hole complete card on a tee with a Course Rating and Slope. */
export function roundDifferential(card: Pick<GolfCard, 'strokes'>, holes: Hole[], tee: Tee | undefined, index: number | undefined): RoundDifferential | null {
  if (holes.length !== 18 || tee?.courseRating == null || !tee.slope) return null;
  const ags = adjustedGrossScore(card, holes, tee, index);
  if (ags == null) return null;
  return { adjGross: ags, differential: scoreDifferential(ags, tee.courseRating, tee.slope), courseRating: tee.courseRating, slope: tee.slope };
}

/** WHS table 5.2a: how many of the lowest differentials count, and the
 *  adjustment, by the number of scores in the record (3–20). */
export function countingRule(n: number): { use: number; adjust: number } | null {
  if (n < 3) return null;
  if (n === 3) return { use: 1, adjust: -2 };
  if (n === 4) return { use: 1, adjust: -1 };
  if (n === 5) return { use: 1, adjust: 0 };
  if (n === 6) return { use: 2, adjust: -1 };
  if (n <= 8) return { use: 2, adjust: 0 };
  if (n <= 11) return { use: 3, adjust: 0 };
  if (n <= 14) return { use: 4, adjust: 0 };
  if (n <= 16) return { use: 5, adjust: 0 };
  if (n <= 18) return { use: 6, adjust: 0 };
  if (n === 19) return { use: 7, adjust: 0 };
  return { use: 8, adjust: 0 };
}

export interface IndexEstimate {
  /** the unofficial estimate, one decimal, max 54.0 */
  value: number;
  /** differentials averaged / considered ("best 8 of 20") */
  used: number;
  of: number;
  adjust: number;
  /** positions (in the given recent list) of the counting differentials */
  counting: number[];
}

/** An unofficial index estimate from differentials in date order (oldest
 *  first): the most recent 20 are considered (Rule 5.2). Null under 3. */
export function indexEstimate(chronological: number[]): IndexEstimate | null {
  const recent = chronological.slice(-20);
  const rule = countingRule(recent.length);
  if (!rule) return null;
  const order = recent.map((d, i) => ({ d, i })).sort((a, b) => a.d - b.d || b.i - a.i).slice(0, rule.use);
  const avg = order.reduce((t, x) => t + x.d, 0) / rule.use;
  const offset = chronological.length - recent.length;
  return {
    value: Math.min(54, tenth(avg + rule.adjust)),
    used: rule.use, of: recent.length, adjust: rule.adjust,
    counting: order.map((x) => x.i + offset).sort((a, b) => a - b),
  };
}

/** "+2.1" for a plus differential / index, "12.4" otherwise. */
export const showHcp = (n: number) => (n < 0 ? `+${Math.abs(n).toFixed(1)}` : n.toFixed(1));

/** The profile's handicap figures from a player's golf stat lines (any
 *  order): the differentials in date order with their course labels, the
 *  unofficial estimate, and the Handicap Index snapshots each round used. */
export function handicapHistory(lines: Array<{ stats: Record<string, number>; date?: string; opponent?: string }>) {
  const dated = [...lines].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const diffs = dated.filter((l) => typeof l.stats.differential === 'number')
    .map((l) => ({ differential: l.stats.differential, adjGross: l.stats.adjGross, date: l.date, course: l.opponent }));
  const recent = diffs.slice(-20);
  const estimate = indexEstimate(diffs.map((d) => d.differential));
  const offset = diffs.length - recent.length;
  const counting = new Set((estimate?.counting ?? []).map((i) => i - offset));
  const snapshots = dated.filter((l) => typeof l.stats.hcpIndex === 'number').map((l) => ({ index: l.stats.hcpIndex, date: l.date }));
  return { recent, counting, estimate, snapshots };
}

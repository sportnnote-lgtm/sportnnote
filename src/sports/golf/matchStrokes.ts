/**
 * SD-87 (GF-10) — match play with strokes. PURE (tests in
 * tests/golf-handicap-team-match.test.mts).
 *
 *   • Handicap allowance (WHS Appendix C): singles match play uses 100% of
 *     each player's Course Handicap; the player with the higher Playing
 *     Handicap receives the full DIFFERENCE, the other plays off 0
 *     (`matchPlayStrokes`), allocated by the course's stroke index (Rule 6.2 /
 *     Appendix E). On 9 holes the nine are ranked among themselves.
 *   • Each hole: both sides' gross strokes → net (gross − strokes received on
 *     that hole) → won / halved / lost (`holeWinner`).
 *   • Extra holes reuse the stroke index of the holes they replay (hole 19 =
 *     the 1st hole of the match): handicap strokes are given as in the
 *     stipulated round (Committee Procedures 5A(5)).
 *   • A back-nine match is numbered 10–18 (19 for the first extra hole).
 */
import { courseHandicap, playingHandicap, matchPlayStrokes, type Hole, type Tee } from './engine.ts';

export interface MatchStrokes {
  /** the match's holes (9 or 18), snapshotted when the strokes are set */
  holes: Hole[];
  course?: string;
  tee?: string;
  allowance: number;
  homeIndex?: number;
  awayIndex?: number;
  homeCH: number;
  awayCH: number;
  homePH: number;
  awayPH: number;
  /** strokes received per hole, same order as `holes` */
  home: number[];
  away: number[];
}

/** Work out both sides' handicaps and the shots per hole. A blank index plays
 *  off 0 (a gross match with scores entered). */
export function setupMatchStrokes(input: { holes: Hole[]; tee?: Tee; homeIndex?: number; awayIndex?: number; allowance?: number; course?: string }): MatchStrokes {
  const allowance = input.allowance ?? 100;
  const ch = (i?: number) => (i == null ? 0 : courseHandicap(i, input.tee, input.holes));
  const homeCH = ch(input.homeIndex), awayCH = ch(input.awayIndex);
  const homePH = playingHandicap(homeCH, allowance), awayPH = playingHandicap(awayCH, allowance);
  const { home, away } = matchPlayStrokes(homePH, awayPH, input.holes);
  return {
    holes: input.holes.map((h) => ({ n: h.n, par: h.par, si: h.si })),
    ...(input.course ? { course: input.course } : {}),
    ...(input.tee?.name ? { tee: input.tee.name } : {}),
    allowance,
    ...(input.homeIndex != null ? { homeIndex: input.homeIndex } : {}),
    ...(input.awayIndex != null ? { awayIndex: input.awayIndex } : {}),
    homeCH, awayCH, homePH, awayPH, home, away,
  };
}

/** The hole a match's i-th hole (0-based) plays — extra holes go round again. */
export function matchHole(ms: Pick<MatchStrokes, 'holes' | 'home' | 'away'>, i: number): { hole: Hole; home: number; away: number } {
  const k = i % ms.holes.length;
  return { hole: ms.holes[k], home: ms.home[k] ?? 0, away: ms.away[k] ?? 0 };
}

/** The number shown for the i-th hole of a match: 1–18, 10–18 on the back
 *  nine; extra holes continue (19, 20 …). */
export const holeNumber = (firstHole: number | undefined, i: number) => (firstHole ?? 1) + i;

/** The score name a hole's gross strokes credit to the player's stats. */
export function scoreStatKey(strokes: number, par: number): 'eagles' | 'birdies' | 'pars' | 'bogeys' | 'doubles' {
  const d = strokes - par;
  return d <= -2 ? 'eagles' : d === -1 ? 'birdies' : d === 0 ? 'pars' : d === 1 ? 'bogeys' : 'doubles';
}

/** "Asha gets 4 shots (holes with SI 1–4)" — who receives what. */
export function strokesLine(ms: MatchStrokes, homeName: string, awayName: string): string {
  const diff = ms.homePH - ms.awayPH;
  if (diff === 0) return 'Level — no shots given';
  const who = diff > 0 ? homeName : awayName;
  const n = Math.abs(diff);
  return `${who} gets ${n} shot${n === 1 ? '' : 's'} (playing handicaps ${ms.homePH} v ${ms.awayPH}, ${ms.allowance}%)`;
}

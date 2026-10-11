/**
 * SD-126 — walkover / forfeit scores per federation. PURE (no React Native):
 * the result writers (repos `walkoverMatch` / `endMatchManually`), the points
 * table and the node tests all read the same figures.
 *
 * A walkover (or a match conceded / awarded by hand) is stored with an extra
 * `result.forfeit` block — the score the TABLE counts (goal / point difference,
 * sets and points ratios). The board score in `result.score` stays what was
 * played, so the card, the share line and the player stats don't change. Old
 * results have no `forfeit` block and rank exactly as before (0-0 for a
 * walkover) until the organiser recalculates them (`recalcWalkovers`).
 *
 * Federation defaults (`WALKOVER_SCORES`):
 *   football    3-0        FIFA regulations (a forfeited match is 3-0; a bigger
 *                          margin already on the board stands)
 *   basketball  20-0       FIBA Official Basketball Rules Art. 20 (forfeit);
 *                          a game lost by default (Art. 21) keeps the score if
 *                          the winner was ahead, else 2-0
 *   volleyball  3-0 sets,  FIVB Rules 6.4.1 (default: 0-3, 0-25 each set; a
 *               25-0 a set best-of-3 format: 0-2, the set target a set); an
 *                          incomplete team (6.4.3) keeps its sets and points
 *                          and the opponent gets the points / sets it needed
 *   hockey      5-0        FIH tournament regulations — verify
 *   handball    10-0       IHF / EHF regulations (0:10) — verify
 *   ice_hockey  5-0        IIHF (a forfeited game is recorded 5-0) — verify
 *   netball     20-0       common league / competition practice — verify
 *   rugby       28-0       common competition practice (no World Rugby law;
 *                          e.g. club / union regulations) — verify; with a
 *                          bonus-point table the winner also takes the try bonus
 * Other sports have no default (a walkover adds nothing, as today); the
 * organiser can still set one per tournament. Chess forfeits keep their own
 * FIDE handling (standings.ts `isChessForfeit`).
 *
 * The tournament override lives in `formats[sport].walkoverScore` (no
 * migration): 'off' = no score (the old behaviour), 'W-L' (e.g. '3-0') = that
 * score; absent = the federation default.
 */
import type { MatchResult, SportId } from '../core/types';

type Side = 'home' | 'away';
type Pair = { home: number; away: number };

export interface WalkoverRule {
  win: number;
  loss: number;
  /** where the default comes from (shown to the organiser) */
  source: string;
  /** the rule couldn't be confirmed from the federation text */
  verify?: boolean;
  /** volleyball: the score counts sets; each awarded set is `perSet`-0 */
  sets?: boolean;
}

export const WALKOVER_SCORES: Partial<Record<SportId, WalkoverRule>> = {
  football: { win: 3, loss: 0, source: 'FIFA' },
  basketball: { win: 20, loss: 0, source: 'FIBA Art. 20' },
  volleyball: { win: 3, loss: 0, source: 'FIVB 6.4', sets: true },
  hockey: { win: 5, loss: 0, source: 'FIH', verify: true },
  handball: { win: 10, loss: 0, source: 'IHF / EHF', verify: true },
  ice_hockey: { win: 5, loss: 0, source: 'IIHF', verify: true },
  netball: { win: 20, loss: 0, source: 'competition rules', verify: true },
  rugby: { win: 28, loss: 0, source: 'competition rules', verify: true },
};

/** Sports whose table can carry a walkover score (match sports with a score). */
export const WALKOVER_SCORE_SPORTS: SportId[] = ['football', 'basketball', 'volleyball', 'hockey', 'handball', 'ice_hockey', 'kabaddi', 'rugby', 'netball'];

export interface ActiveWalkoverRule extends WalkoverRule {
  /** true = the organiser's own score */
  custom: boolean;
}

/** The rule in force for a sport in a tournament (`format` = formats[sport]). */
export function walkoverRuleFor(sport: SportId | string, format?: Record<string, unknown> | null): ActiveWalkoverRule | null {
  const o = format?.walkoverScore;
  const base = WALKOVER_SCORES[sport as SportId];
  if (o === 'off') return null;
  if (typeof o === 'string') {
    const m = /^\s*(\d{1,3})\s*-\s*(\d{1,3})\s*$/.exec(o);
    if (m && Number(m[1]) > Number(m[2])) return { win: Number(m[1]), loss: Number(m[2]), source: 'tournament', custom: true, ...(base?.sets ? { sets: true } : {}) };
  }
  return base ? { ...base, custom: false } : null;
}

/** "3-0 (FIFA)" / "Off" — the setting's one-line label. */
export function walkoverRuleText(sport: SportId | string, rule: ActiveWalkoverRule | null, format?: Record<string, unknown> | null): string {
  if (!rule) return 'No score — a walkover adds nothing to the difference';
  if (rule.sets) {
    const per = perSetOf(format);
    const w = rule.custom ? rule.win : setsToWinOf(format);
    return `${w}-${rule.custom ? rule.loss : 0} in sets, ${per}-0 each set${rule.custom ? '' : ` (${rule.source})`}`;
  }
  return `${rule.win}-${rule.loss}${rule.custom ? '' : ` (${rule.source}${rule.verify ? ', check your regulations' : ''})`}`;
}

/** Sets to win a volleyball match — the format's, else the engine default (2,
 *  best of 3; FIVB indoor tournaments store 3). */
const setsToWinOf = (format?: Record<string, unknown> | null): number => {
  const n = Number(format?.setsToWin);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2;
};
const perSetOf = (format?: Record<string, unknown> | null): number => {
  const n = Number(format?.pointsPerSet);
  return Number.isFinite(n) && n > 0 ? n : 25;
};
const sideFirst = (winner: Side, w: number, l: number): Pair => (winner === 'home' ? { home: w, away: l } : { home: l, away: w });
const fin = (p?: Pair | null): p is Pair => !!p && Number.isFinite(p.home) && Number.isFinite(p.away);

/** The minimal volleyball state the FIVB completion reads. */
interface VbLike {
  sets?: Array<[number, number]>;
  current?: Pair;
  setsWon?: Pair;
  setsToWin?: number;
  target?: number;
  deciderTarget?: number;
  winByTwo?: boolean;
}

/**
 * FIVB 6.4.3 — an incomplete / conceding team loses: it keeps its sets and
 * points, and the opponent is given the points (and sets) it needed. The set
 * in play is finished at the target (win by 2), every remaining set is
 * target-0 (15-0 for a deciding set). Null when the state isn't a volleyball
 * match in progress.
 */
export function volleyballCompletion(state: unknown, winner: Side): { sets: Pair; points: Pair } | null {
  const s = state as VbLike | null | undefined;
  if (!s || !Array.isArray(s.sets) || !s.setsWon || typeof s.setsToWin !== 'number') return null;
  const loser: Side = winner === 'home' ? 'away' : 'home';
  const toWin = Math.max(1, s.setsToWin);
  const target = s.target && s.target > 0 ? s.target : 25;
  const decider = s.deciderTarget && s.deciderTarget > 0 ? s.deciderTarget : 15;
  const by = s.winByTwo === false ? 1 : 2;
  const pts: Pair = { home: 0, away: 0 };
  for (const [h, a] of s.sets) { pts.home += h; pts.away += a; }
  const won = { ...s.setsWon };
  if (won[winner] >= toWin) {
    // already over — just the played sets and points
    const cur = s.current ?? { home: 0, away: 0 };
    return { sets: won, points: { home: pts.home + cur.home, away: pts.away + cur.away } };
  }
  const isDecider = () => toWin > 1 && won.home === toWin - 1 && won.away === toWin - 1;
  // the set in play
  const cur = s.current ?? { home: 0, away: 0 };
  const t = isDecider() ? decider : target;
  pts[loser] += cur[loser];
  pts[winner] += Math.max(cur[winner], t, cur[loser] + by);
  won[winner] += 1;
  // the sets still to play
  while (won[winner] < toWin) {
    pts[winner] += isDecider() ? decider : target;
    won[winner] += 1;
  }
  return { sets: won, points: pts };
}

export interface ForfeitInput {
  sport: SportId | string;
  /** a walkover (no play), or a match closed by hand as conceded / awarded */
  kind: 'walkover' | 'conceded' | 'awarded';
  winner: Side;
  /** the score on the board when it was closed (absent for a walkover) */
  board?: Pair | null;
  /** the live state (volleyball's FIVB completion reads it) */
  state?: unknown;
  /** the tournament's format for this sport merged with the match's own */
  format?: Record<string, unknown> | null;
}

/**
 * The score the table counts for a walkover / forfeit, or undefined when the
 * board score stands (or the sport / tournament has no walkover score).
 *
 *  - walkover: the rule's score (volleyball: sets-to-win – 0 and target-0 a set);
 *  - conceded / awarded with play on the board: the rule's score unless the
 *    winner's margin on the board is already as big (FIFA); basketball conceded
 *    = FIBA Art. 21 (the score stands if the winner is ahead, else 2-0);
 *    volleyball = FIVB 6.4.3 completion.
 */
export function forfeitFor(i: ForfeitInput): MatchResult['forfeit'] | undefined {
  const rule = walkoverRuleFor(i.sport, i.format);
  if (!rule) return undefined;
  const loser: Side = i.winner === 'home' ? 'away' : 'home';
  const label = i.kind === 'walkover' ? 'walkover' : 'forfeit';
  if (rule.sets) {
    const done = i.kind !== 'walkover' ? volleyballCompletion(i.state, i.winner) : null;
    if (done) return { score: done.sets, sets: done.sets, points: done.points, rule: `FIVB 6.4.3 (${label})` };
    // a walkover / no play: sets-to-win (or the custom score) – 0, target-0 a set
    const sw = rule.custom ? rule.win : setsToWinOf(i.format);
    const sl = rule.custom ? rule.loss : 0;
    const per = perSetOf(i.format);
    return { score: sideFirst(i.winner, sw, sl), sets: sideFirst(i.winner, sw, sl), points: sideFirst(i.winner, sw * per, 0), rule: `${rule.custom ? 'tournament' : rule.source} ${sw}-${sl} (${label})` };
  }
  const ruleScore = sideFirst(i.winner, rule.win, rule.loss);
  const tag = `${rule.custom ? 'tournament' : rule.source} ${rule.win}-${rule.loss} (${label})`;
  if (i.kind === 'walkover' || !fin(i.board)) return { score: ruleScore, rule: tag };
  const margin = i.board[i.winner] - i.board[loser];
  if (i.sport === 'basketball' && i.kind === 'conceded' && !rule.custom) {
    return margin > 0 ? undefined : { score: sideFirst(i.winner, 2, 0), rule: 'FIBA Art. 21 2-0 (default)' };
  }
  return margin >= rule.win - rule.loss ? undefined : { score: ruleScore, rule: tag };
}

/** "Counted 3-0 in the table (FIFA 3-0 walkover)" — under a result line. */
export function forfeitNote(r: Pick<MatchResult, 'forfeit'> | null | undefined, homeName: string, awayName: string): string | null {
  const f = r?.forfeit;
  if (!f) return null;
  const sets = f.sets ? ` sets${f.points ? `, ${f.points.home}-${f.points.away} points` : ''}` : '';
  return `Counted ${homeName} ${f.score.home}-${f.score.away} ${awayName}${sets} in the table · ${f.rule}`;
}

/* ------------------------------ SD-140 ------------------------------ */

/**
 * SD-140 (founder, 2026-10-11) — the format the walkover / forfeit score reads.
 * A friendly (no tournament) always uses the federation default: an override
 * on the match's own format doesn't count there (only an organiser sets a
 * tournament's score). In a tournament: the sport's format under the match's
 * own (as SD-126 built it).
 */
export function walkoverFormatFor(
  tournamentFormat: Record<string, unknown> | null | undefined,
  matchFormat: Record<string, unknown> | null | undefined,
  inTournament: boolean,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(tournamentFormat ?? {}), ...(matchFormat ?? {}) };
  if (!inTournament) delete merged.walkoverScore;
  return merged;
}

/** The bits of a match the team-side helpers read. */
type TeamScoreMatch = { score?: Pair | null; walkover?: boolean; result?: Pick<MatchResult, 'kind' | 'reason' | 'forfeit'> | null };

/** A match decided as a walkover (no play): the `__walkover` flag, or a
 *  conceded result whose reason is "Walkover" (written before the flag lands). */
export function isWalkover(m: TeamScoreMatch): boolean {
  if (m.walkover) return true;
  return m.result?.kind === 'conceded' && /^walkover$/i.test((m.result.reason ?? '').trim());
}

/**
 * SD-140 — the score a TEAM is credited with: the walkover / forfeit score the
 * table counts (`result.forfeit`) when there is one, else the board score; a
 * walkover with no forfeit score (an old result, or "no score") has none.
 * Team pages, team records, team head-to-head and series aggregates read this.
 * Player stat lines and careers never do — a walkover's goals / points are the
 * team's only.
 */
export function teamScoreOf(m: TeamScoreMatch): Pair | undefined {
  const f = m.result?.forfeit?.score;
  if (fin(f)) return { home: f.home, away: f.away };
  if (isWalkover(m)) return undefined;
  return fin(m.score) ? { home: m.score.home, away: m.score.away } : undefined;
}

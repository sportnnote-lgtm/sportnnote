/**
 * Final-score helpers shared by every set/game sport (SD-01): tennis, padel,
 * badminton, table tennis, squash, pickleball, carrom.
 *
 * Once a match ends, the "current game" points are reset to 0-0, so a summary
 * built from them read "0–0" on the result alert, ticker, MiniScore and the
 * correction screen. These helpers turn the completed sets/games already in the
 * state into the line every published result uses — sets/games won as the big
 * score plus the per-set line ("21-18, 19-21, 21-15"; tennis "6-4, 3-6, 7-6(4)";
 * a match tiebreak "[10-8]"). Pure projections: nothing here changes the state,
 * so event logs replay to exactly the same scores.
 */
import type { ScoreSummary } from './types';

export type Pair = [number, number];
export type Side = 'home' | 'away';

export interface SetScoreOpts {
  /** the set ended in a tiebreak: its points [home, away] → "7-6(4)" */
  tb?: Pair | null;
  /** the whole set was a match (champions') tiebreak → "[10-8]" */
  matchTb?: boolean;
  /** read the score from the away side's point of view (history rows) */
  flip?: boolean;
}

/** One set/game: "6-4", "7-6(4)" (loser's tiebreak points), "[10-8]". */
export function setScore(g: Pair, opts: SetScoreOpts = {}): string {
  const [a, b] = opts.flip ? [g[1], g[0]] : [g[0], g[1]];
  if (opts.matchTb) {
    const t = opts.tb ?? g;
    const [x, y] = opts.flip ? [t[1], t[0]] : [t[0], t[1]];
    return `[${x}-${y}]`;
  }
  const base = `${a}-${b}`;
  if (!opts.tb) return base;
  return `${base}(${Math.min(opts.tb[0], opts.tb[1])})`;
}

/** The whole line, comma-separated: "6-4, 3-6, 7-6(4)". '' when nothing is complete. */
export function scoreLine(
  sets: ReadonlyArray<Pair> | undefined,
  opts: { tb?: ReadonlyArray<Pair | null | undefined>; matchTb?: ReadonlyArray<boolean>; perspective?: Side } = {},
): string {
  if (!Array.isArray(sets) || !sets.length) return '';
  const flip = opts.perspective === 'away';
  return sets.map((g, i) => setScore(g, { tb: opts.tb?.[i] ?? null, matchTb: !!opts.matchTb?.[i], flip })).join(', ');
}

/** The summary a finished set/game match shows everywhere: the sets/games won as
 *  the big score and the per-set line as the detail. */
export function finalSummary(won: { home: number; away: number }, line: string): ScoreSummary {
  return {
    homeScore: String(won.home),
    awayScore: String(won.away),
    statusLine: 'Match Over',
    ...(line ? { detailLine: line } : {}),
  };
}

/** "2–1 · 21-18, 19-21, 21-15" — the one-line result (full-time alert, share). */
export function resultText(won: { home: number; away: number }, line: string): string {
  return `${won.home}–${won.away}${line ? ` · ${line}` : ''}`;
}

// ------------------------------------------------------------- SD-20 ----
// The line score as data (the LineScoreboard grid, a retirement's unfinished
// set) and the result marks: "6-4, 3-2 ret.", "w/o", "21-15 def.", "abandoned".

/** One set/game cell: games/points per side; `tb` = the set's tiebreak points
 *  (7-6(4) / superscript 6⁴); `matchTb` = the whole set was a match tiebreak
 *  and `home`/`away` are its points ("[10-7]"). */
export interface LineCell { home: number; away: number; tb?: Pair | null; matchTb?: boolean }

/** A set/game sport's line score, built by the engine (`plugin.lineScore`). */
export interface LineScore {
  /** what a column is: tennis/padel/volleyball 'set', the rest 'game' */
  unit: 'set' | 'game';
  /** sets / games won */
  won: { home: number; away: number };
  /** the completed sets/games, in order */
  done: LineCell[];
  /** the set/game in play (null once the match has ended) */
  current: LineCell | null;
  ended: boolean;
  /** sets/games needed to win the match (best of 2n-1) */
  toWin: number;
}

/** Normalise a match tiebreak cell: an older padel snapshot stored the set as
 *  0-0 with the points only in `tb` — show the points either way. */
const mtbPoints = (c: LineCell): Pair => (c.tb && (c.home + c.away === 0 || (c.tb[0] === c.home && c.tb[1] === c.away)) ? c.tb : [c.home, c.away]);

/** A cell as text: "6-4", "7-6(4)", "[10-7]", "21-18". */
export function cellText(c: LineCell, flip = false): string {
  if (c.matchTb) return setScore(mtbPoints(c), { matchTb: true, flip });
  return setScore([c.home, c.away], { tb: c.tb ?? null, flip });
}

const hasScore = (c: LineCell | null | undefined): c is LineCell => !!c && (c.home > 0 || c.away > 0);

/** The line as text: the completed sets, plus (`partial`) the unfinished one when
 *  it has a score — "6-4, 3-2" for a retirement. Completed-only output equals the
 *  engine's `scoreLine`. */
export function lineText(ls: LineScore | null | undefined, opts: { perspective?: Side; partial?: boolean } = {}): string {
  if (!ls) return '';
  const flip = opts.perspective === 'away';
  const cells = [...(ls.done ?? []), ...(opts.partial && !ls.ended && hasScore(ls.current) ? [ls.current] : [])];
  return cells.map((c) => cellText(c, flip)).join(', ');
}

/** Superscript digits for a tiebreak loser's points (6⁴). */
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const sup = (n: number) => String(n).split('').map((d) => SUP[Number(d)] ?? d).join('');

/** A result mark as words for a board's status line ("Match Over · Retired"). */
export const MARK_WORD: Record<string, string> = {
  'ret.': 'Retired', 'def.': 'Default', 'w/o': 'Walkover', abandoned: 'Abandoned',
  conceded: 'Conceded', awarded: 'Awarded', 'no result': 'No result',
};

export interface LineGrid {
  /** one per set/game: "1", "2", … ("TB" for a match tiebreak); `highlight` = in play */
  columns: Array<{ label: string; highlight: boolean }>;
  home: string[];
  away: string[];
  /** set once the match has ended */
  winner: Side | null;
}

/** The LineScoreboard grid: rows = sides, a column per set/game, the one in play
 *  highlighted. A set won in a tiebreak shows the loser's tiebreak points as a
 *  superscript (7 / 6⁴); a match tiebreak column shows its points. */
export function lineGrid(ls: LineScore, opts: { closed?: { winner?: Side | null } } = {}): LineGrid {
  const cells: Array<{ c: LineCell; live: boolean }> = (ls.done ?? []).map((c) => ({ c, live: false }));
  // A match closed by hand: the unfinished set stays as played, nothing is live.
  if (opts.closed) {
    if (!ls.ended && hasScore(ls.current)) cells.push({ c: ls.current, live: false });
    ls = { ...ls, ended: true };
  } else if (!ls.ended && ls.current) cells.push({ c: ls.current, live: true });
  if (!cells.length) cells.push({ c: { home: 0, away: 0 }, live: !ls.ended });
  const side = (s: Side) => cells.map(({ c }) => {
    const i = s === 'home' ? 0 : 1;
    if (c.matchTb) return String(mtbPoints(c)[i]);
    const g = s === 'home' ? c.home : c.away;
    if (!c.tb) return String(g);
    const mine = c.tb[i], theirs = c.tb[1 - i];
    return mine < theirs ? `${g}${sup(mine)}` : String(g);
  });
  return {
    columns: cells.map(({ c, live }, i) => ({ label: c.matchTb ? 'TB' : String(i + 1), highlight: live })),
    home: side('home'),
    away: side('away'),
    winner: opts.closed ? (opts.closed.winner ?? null)
      : ls.ended ? (ls.won.home > ls.won.away ? 'home' : ls.won.away > ls.won.home ? 'away' : null) : null,
  };
}

/** How a match closed by hand is marked after its score. */
export interface ResultLike { kind: string; winner?: Side; reason?: string }

/**
 * The scoreline suffix for a match that didn't finish normally.
 *   racket (ITF / BWF / ITTF / WSF / FIP): conceded → "ret." (retired),
 *   awarded → "def." (default; "ret." when the reason says retired, the old
 *   retireMatch path), walkover → "w/o", abandoned / no result → "abandoned".
 *   generic (volleyball, carrom): "conceded" / "awarded" / "w/o" / "abandoned" / "no result".
 * null for a normal finish, a draw or a tie.
 */
export function resultMark(o: { result?: ResultLike | null; walkover?: boolean }, style: 'racket' | 'generic' = 'racket'): string | null {
  if (o.walkover) return 'w/o';
  const r = o.result;
  if (!r) return null;
  const racket = style === 'racket';
  switch (r.kind) {
    case 'conceded': return racket ? 'ret.' : 'conceded';
    case 'awarded': return racket ? (/retir/i.test(r.reason ?? '') ? 'ret.' : 'def.') : 'awarded';
    case 'abandoned': return 'abandoned';
    case 'no_result': return racket ? 'abandoned' : 'no result';
    default: return null;
  }
}

/** "6-4, 3-2 ret." · "w/o" (no score) · "abandoned" when nothing was played. */
export function markedLine(line: string, mark: string | null): string {
  if (!mark) return line;
  if (mark === 'w/o') return 'w/o';
  return line ? `${line} ${mark}` : mark;
}

/** What a set/game plugin offers the result surfaces. */
export interface LinePlugin {
  scoreLine?: (state: never, perspective?: Side) => string;
  lineScore?: (state: never) => LineScore | null;
  /** ITF-style "ret." / "def." (racket sports) vs plain words */
  retireTerms?: boolean;
}

/** A snapshot from an older engine must never break a result row. */
function safe<T>(f: () => T, fallback: T): T {
  try { return f() ?? fallback; } catch { return fallback; }
}

/**
 * THE scoreline every result surface shows for a set/game match (card, bracket,
 * share, H2H, history, search): the completed sets ("6-4, 3-6, 7-6(4)"); for a
 * match closed by hand the unfinished set too plus the mark ("6-4, 3-2 ret.");
 * a walkover "w/o" (also a retirement before a point was played). '' for a
 * sport without a line score or nothing to show.
 */
export function matchScoreLine(
  p: LinePlugin,
  state: unknown,
  o: { result?: ResultLike | null; walkover?: boolean; perspective?: Side } = {},
): string {
  if (!p?.scoreLine) return '';
  const mark = resultMark(o, p.retireTerms ? 'racket' : 'generic');
  if (mark === 'w/o') return 'w/o';
  if (!state) return mark ?? '';
  const st = state as never;
  const ls = p.lineScore ? safe(() => p.lineScore!(st), null) : null;
  if (mark) {
    const line = ls ? lineText(ls, { perspective: o.perspective, partial: true }) : safe(() => p.scoreLine!(st, o.perspective), '');
    // Retired before a point was played = a walkover (ITF / BWF).
    if (!line && mark === 'ret.' && ls) return 'w/o';
    return markedLine(line, mark);
  }
  return safe(() => p.scoreLine!(st, o.perspective), '');
}

/** The final board for a set/game match — sets/games won as the big score and
 *  the marked line — so a match closed by hand mid-set never shows the live
 *  points ("40", "Ad") as its result. null when the plugin has no line score. */
export function finalBoard(
  p: LinePlugin,
  state: unknown,
  o: { result?: ResultLike | null; walkover?: boolean } = {},
): { homeScore: string; awayScore: string; line: string } | null {
  if (!p?.lineScore) return null;
  // A walkover has no score — just "w/o".
  if (o.walkover) return { homeScore: '', awayScore: '', line: 'w/o' };
  if (!state) return null;
  const ls = safe(() => p.lineScore!(state as never), null);
  if (!ls) return null;
  return { homeScore: String(ls.won.home), awayScore: String(ls.won.away), line: matchScoreLine(p, state, o) };
}

/** The line score of a points-per-game sport (badminton, TT, squash, pickleball,
 *  carrom, volleyball): every completed game/set + the one in play. */
export function pointsLineScore(
  unit: 'set' | 'game',
  s: { games?: ReadonlyArray<Pair>; current?: { home: number; away: number }; won?: { home: number; away: number }; ended?: boolean; toWin?: number } | null | undefined,
): LineScore | null {
  if (!s || !Array.isArray(s.games)) return null;
  const ended = !!s.ended;
  return {
    unit,
    won: { home: s.won?.home ?? 0, away: s.won?.away ?? 0 },
    done: s.games.map(([home, away]) => ({ home, away })),
    current: ended ? null : { home: s.current?.home ?? 0, away: s.current?.away ?? 0 },
    ended,
    toWin: s.toWin ?? 1,
  };
}

/** "2–1 (6-4, 3-6, [10-7])" — a compact result for narrow rows (series legs,
 *  results lists): the big score + the line in brackets; "w/o" alone. */
export function compactResult(score: { home: number; away: number } | null | undefined, line: string): string {
  if (line === 'w/o') return 'w/o';
  const big = score ? `${score.home}–${score.away}` : '';
  if (!line) return big;
  return big ? `${big} (${line})` : line;
}

/** The text between the two sides of a bracket cell: "● LIVE" while in play, the
 *  scoreline once decided ("6-4, 3-6, [10-7]", "6-4, 3-2 ret.", "w/o"), else
 *  "vs" (nothing decided yet) or '' (decided, no line — the scores say it). */
export function bracketCellText(o: { live: boolean; decided: boolean; line: string }): string {
  if (o.live) return '● LIVE';
  if (o.line) return o.line;
  return o.decided ? '' : 'vs';
}

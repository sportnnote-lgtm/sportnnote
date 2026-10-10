/**
 * Padel scoring engine (pure): tennis scoring with golden point, short sets and
 * an optional match-tiebreak decider; serve tracking via the shared serve.ts.
 * Kept RN-free so node tests can replay matches through it.
 */
import type { LiveEvent } from '../liveEvents';
import type { ScoreAction, ScoreSummary } from '../types';
import { serveInfo as serveInfoOf, gamesPlayed as gamesPlayedOf } from '../serve.ts';
import { scoreLine as lineOf, finalSummary, type Pair } from '../scoreline.ts';

const SETS_TO_WIN = 2;

export interface PadelState {
  pts: { home: number; away: number };
  games: { home: number; away: number };
  sets: Array<[number, number]>;
  setsWon: { home: number; away: number };
  /** sets a side must win to take the match (format: setsToWin) */
  setsToWin: number;
  /** games to win a set, win by 2 (format: gamesPerSet) — 6 standard, 4 short */
  gamesPerSet: number;
  /** golden point: at 40-40 the next point wins the game (no advantage) */
  goldenPoint: boolean;
  /** decider: play the last set as a normal set, or a match tiebreak to 10 */
  matchTbDecider: boolean;
  /** SD-01 per completed set: tiebreak points [home, away] when it ended in a
   *  tiebreak (7-6(4) / match tiebreak [10-7]), else null. Derived — rebuilt on
   *  replay; absent on snapshots saved before SD-01 (see `setTiebreaks`). */
  tb?: Array<[number, number] | null>;
  /** doubles (2 a side, padel's norm) vs singles — drives the serve display */
  doubles: boolean;
  /** which side served game 1; serve alternates every game after that */
  firstServer: 'home' | 'away';
  events: LiveEvent[];
  seq: number;
  ended: boolean;
}

export const init = (config?: Record<string, unknown>): PadelState => ({
  pts: { home: 0, away: 0 },
  games: { home: 0, away: 0 },
  sets: [],
  setsWon: { home: 0, away: 0 },
  setsToWin: Number(config?.setsToWin ?? SETS_TO_WIN),
  gamesPerSet: Number(config?.gamesPerSet ?? 6),
  goldenPoint: (config?.deuce ?? 'advantage') === 'golden',
  matchTbDecider: (config?.decider ?? 'set') === 'match10',
  tb: [],
  doubles: Number(config?.playersPerSide ?? 2) >= 2,
  firstServer: (config?.firstServer as 'home' | 'away') ?? 'home',
  events: [],
  seq: 0,
  ended: false,
});

export const other = (side: 'home' | 'away') => (side === 'home' ? 'away' : 'home');
/** The deciding set = both sides one set short of the match. */
const isDecider = (s: PadelState) => s.setsWon.home === s.setsToWin - 1 && s.setsWon.away === s.setsToWin - 1;
/** A match tiebreak replaces the entire deciding set with one tiebreak to 10. */
export const matchTbActive = (s: PadelState) => s.matchTbDecider && isDecider(s);
/** In a tiebreak: the deciding match-tiebreak, or a normal set's games-all tiebreak. */
export const inTiebreak = (s: PadelState) => matchTbActive(s) || (s.games.home === s.gamesPerSet && s.games.away === s.gamesPerSet);
const tbTarget = (s: PadelState) => (matchTbActive(s) ? 10 : 7);
/** Completed games so far — the current game's 0-based index. (Shared serve.ts.) */
export const gamesPlayed = (s: PadelState) => gamesPlayedOf(s);
/** Who is serving right now: side + (doubles) which of the pair (slot 0/1). */
export const serveInfo = (s: PadelState) => serveInfoOf(s, inTiebreak(s));

/** Point display: 0/15/30/40 with Ad, or raw points in a tiebreak. */
export function disp(s: PadelState, side: 'home' | 'away'): string {
  if (inTiebreak(s)) return String(s.pts[side]);
  const me = s.pts[side];
  const them = s.pts[other(side)];
  if (me >= 3 && them >= 3) {
    if (me === them) return '40';
    return me > them ? 'Ad' : '40';
  }
  return ['0', '15', '30', '40'][Math.min(me, 3)];
}

function winSet(s: PadelState, side: 'home' | 'away', games: { home: number; away: number }, events: LiveEvent[], seq: number, tbPts: [number, number] | null = null): PadelState {
  const sets = [...s.sets, [games.home, games.away] as [number, number]];
  const tb = [...(s.tb ?? []), tbPts];
  const setsWon = { ...s.setsWon, [side]: s.setsWon[side] + 1 };
  const ended = setsWon[side] >= s.setsToWin;
  events.push({ id: ++seq, stamp: 'Set', icon: '🎉', label: `Set ${sets.length} won`, detail: `${games.home}-${games.away}`, side });
  if (ended) events.push({ id: ++seq, stamp: 'Match', icon: '🏆', label: 'Match won', detail: `${setsWon.home}-${setsWon.away} sets`, side });
  return { ...s, pts: { home: 0, away: 0 }, games: { home: 0, away: 0 }, sets, setsWon, tb, events, seq, ended };
}

function scorePoint(s: PadelState, side: 'home' | 'away', who: string | undefined): PadelState {
  let seq = s.seq;
  const events = [...s.events];
  const o = other(side);
  const tb = inTiebreak(s);
  const matchTb = matchTbActive(s);
  const pts = { ...s.pts, [side]: s.pts[side] + 1 };
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  events.push({
    id: ++seq,
    stamp: matchTb ? 'Match TB' : `Set ${setNo}${tb ? ' · TB' : ''}`,
    icon: '🟡',
    label: tb ? `${matchTb ? 'Match tiebreak' : 'Tiebreak'} ${pts.home}-${pts.away}` : 'Point',
    detail: who,
    side,
    kind: 'point', playerName: who, set: setNo, points: 1,
  });

  if (tb) {
    const target = tbTarget(s);
    const tbWon = pts[side] >= target && pts[side] - pts[o] >= 2;
    if (!tbWon) return { ...s, pts, events, seq };
    // A normal set's tiebreak makes the set 7-6; a match tiebreak ends the match
    // without games on the board.
    const games = matchTb ? { ...s.games } : { ...s.games, [side]: s.gamesPerSet + 1 };
    return winSet(s, side, games, events, seq, [pts.home, pts.away]);
  }

  // Game won: win by 2, OR — under golden point — the sudden-death point at 40-40.
  const gameWon = pts[side] >= 4 && (pts[side] - pts[o] >= 2 || (s.goldenPoint && pts[o] >= 3));
  if (!gameWon) return { ...s, pts, events, seq };

  const games = { ...s.games, [side]: s.games[side] + 1 };
  events.push({ id: ++seq, stamp: 'Game', icon: '✅', label: `Game ${side === 'home' ? 'home' : 'away'}`, detail: `${games.home}-${games.away}`, side });

  const setDone = games[side] >= s.gamesPerSet && games[side] - games[o] >= 2;
  if (!setDone) return { ...s, pts: { home: 0, away: 0 }, games, events, seq };
  return winSet(s, side, games, events, seq);
}

export const reducer = (s: PadelState, a: ScoreAction): PadelState => {
  // Who serves first — settable only before the first point; serve alternates
  // from there. No `side` on this action.
  if (a.type === 'SET_FIRST_SERVER') {
    const played = s.games.home || s.games.away || s.pts.home || s.pts.away || s.sets.length;
    const side = a.payload?.side as 'home' | 'away' | undefined;
    if (played || (side !== 'home' && side !== 'away')) return s;
    return { ...s, firstServer: side };
  }
  if (s.ended || !a.side) return s;
  if (a.type === 'POINT') return scorePoint(s, a.side, a.attribution?.playerName);
  return s;
};


// ------------------------------------------------------------ scoreline ----

/** Tiebreak points per completed set. Uses `s.tb`; older snapshots have none, so
 *  count them from the log (tiebreak points are stamped "Set N · TB" / "Match TB"). */
export function setTiebreaks(s: PadelState): Array<Pair | null> {
  const sets = s.sets ?? [];
  if (Array.isArray(s.tb) && s.tb.length === sets.length) return s.tb;
  return sets.map((_, i) => {
    const isMtb = s.matchTbDecider && i === s.setsToWin * 2 - 2;
    const stamp = isMtb ? 'Match TB' : `Set ${i + 1} · TB`;
    const t: Pair = [0, 0];
    for (const e of s.events ?? []) {
      if (e.stamp !== stamp || e.kind !== 'point') continue;
      if (e.side === 'home') t[0] += 1; else if (e.side === 'away') t[1] += 1;
    }
    return t[0] + t[1] > 0 ? t : null;
  });
}

/** "6-4, 3-6, [10-7]" — completed sets; set tiebreaks as 7-6(4), a match tiebreak bracketed. */
export function scoreLine(s: PadelState, perspective?: 'home' | 'away'): string {
  if (!s || !Array.isArray(s.sets)) return '';
  const matchTb = s.sets.map((_, i) => !!s.matchTbDecider && i === s.setsToWin * 2 - 2);
  return lineOf(s.sets, { tb: setTiebreaks(s), matchTb, perspective });
}

/** Scoreboard summary: live = current-game points; ended = sets won + the set line. */
export function summary(s: PadelState): ScoreSummary {
  if (s.ended) return finalSummary(s.setsWon, scoreLine(s));
  const line = scoreLine(s);
  return {
    homeScore: disp(s, 'home'),
    awayScore: disp(s, 'away'),
    statusLine: matchTbActive(s)
      ? 'Match tiebreak'
      : `Set ${s.setsWon.home + s.setsWon.away + 1}${inTiebreak(s) ? ' · TIEBREAK' : ''} · ${s.setsToWin === 1 ? 'single set' : `best of ${s.setsToWin * 2 - 1}`}`,
    detailLine: `Games ${s.games.home}-${s.games.away}${s.goldenPoint ? ' · golden pt' : ''}${line ? ' · ' + line : ''}`,
  };
}

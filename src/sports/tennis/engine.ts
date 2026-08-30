/**
 * Tennis scoring engine (pure) — best of 3/5 sets; games to 6 (win by 2, a 7th
 * settles 6-6); points 0/15/30/40 with deuce & advantage; set/match tiebreaks;
 * and serve tracking (first-server choice → per-game alternation, tiebreak-aware,
 * with doubles pair rotation). Kept RN-free so it's unit-testable.
 */
import type { LiveEvent } from '../liveEvents';
import type { ScoreAction } from '../types';
import { replayPoints, type PointInput } from '../rallyEdit.ts';
import { serveInfo as serveInfoOf, gamesPlayed as gamesPlayedOf } from '../serve.ts';

export const SETS_TO_WIN = 2;

export interface TennisState {
  pts: { home: number; away: number };
  games: { home: number; away: number };
  sets: Array<[number, number]>;
  setsWon: { home: number; away: number };
  /** sets a side must win to take the match (format: setsToWin) */
  setsToWin: number;
  /** games needed to win a normal set (6 std · 4 Fast4 · 8 pro-set) */
  gamesPerSet: number;
  /** must a set be won by two clear games? (Fast4 = false: first to N) */
  setWinByTwo: boolean;
  /** game score that triggers a set tiebreak (usually = gamesPerSet; Fast4 = 3) */
  tiebreakAt: number;
  /** is a set tiebreak played at all? (false = advantage set, win by 2 forever) */
  setTiebreak: boolean;
  /** points to win the set tiebreak (7 std · 5 Fast4) */
  tiebreakPoints: number;
  /** no-advantage scoring — a single deciding point at deuce */
  noAd: boolean;
  /** if > 0, the deciding set is a first-to-N match tiebreak (Grand Slam = 10) */
  finalSetTiebreak: number;
  /** doubles (2 a side) vs singles — drives the serve display & rotation */
  doubles: boolean;
  /** which side served game 1; serve alternates every game after that */
  firstServer: 'home' | 'away';
  events: LiveEvent[];
  seq: number;
  ended: boolean;
}

export const init = (config?: Record<string, unknown>): TennisState => {
  const gamesPerSet = Number(config?.gamesPerSet ?? 6);
  return {
    pts: { home: 0, away: 0 },
    games: { home: 0, away: 0 },
    sets: [],
    setsWon: { home: 0, away: 0 },
    setsToWin: Number(config?.setsToWin ?? SETS_TO_WIN),
    gamesPerSet,
    setWinByTwo: config?.setWinByTwo !== false, // default true
    tiebreakAt: Number(config?.tiebreakAt ?? gamesPerSet),
    setTiebreak: config?.setTiebreak !== false, // default true
    tiebreakPoints: Number(config?.tiebreakPoints ?? 7),
    noAd: Boolean(config?.noAd ?? false),
    finalSetTiebreak: Number(config?.finalSetTiebreak ?? 0),
    doubles: Number(config?.playersPerSide ?? 1) >= 2,
    firstServer: (config?.firstServer as 'home' | 'away') ?? 'home',
    events: [],
    seq: 0,
    ended: false,
  };
};

export const other = (side: 'home' | 'away') => (side === 'home' ? 'away' : 'home');
/** The deciding set = both sides one set from the match. */
const isDeciderSet = (s: TennisState) => s.setsWon.home === s.setsToWin - 1 && s.setsWon.away === s.setsToWin - 1;
/** The deciding set is played as a single match tiebreak (champions' tiebreak). */
const isMatchTB = (s: TennisState) => isDeciderSet(s) && s.finalSetTiebreak > 0;
/** In a tiebreak: either the whole deciding set, or a set-ending tiebreak at N-N. */
export const inTiebreak = (s: TennisState) => isMatchTB(s) || (s.setTiebreak && s.games.home === s.tiebreakAt && s.games.away === s.tiebreakAt);
const tbTarget = (s: TennisState) => (isMatchTB(s) ? s.finalSetTiebreak : s.tiebreakPoints);

/** Completed games so far — the current game's 0-based index. (Shared serve.ts.) */
export const gamesPlayed = (s: TennisState) => gamesPlayedOf(s);
/** Who is serving right now: side + (doubles) which of the pair (slot 0/1). */
export const serveInfo = (s: TennisState) => serveInfoOf(s, inTiebreak(s));

/** Tennis point display: 0/15/30/40 with Deuce/Ad, or raw points in a tiebreak. */
export function disp(s: TennisState, side: 'home' | 'away'): string {
  if (inTiebreak(s)) return String(s.pts[side]); // tiebreak: 0,1,2,3…
  const me = s.pts[side];
  const them = s.pts[other(side)];
  if (me >= 3 && them >= 3) {
    if (me === them || s.noAd) return '40'; // no-ad has no advantage state
    return me > them ? 'Ad' : '40';
  }
  return ['0', '15', '30', '40'][Math.min(me, 3)];
}

/** Finish a set for `side` with the given game score; advance or end the match. */
function winSet(s: TennisState, side: 'home' | 'away', games: { home: number; away: number }, events: LiveEvent[], seq: number): TennisState {
  const sets = [...s.sets, [games.home, games.away] as [number, number]];
  const setsWon = { ...s.setsWon, [side]: s.setsWon[side] + 1 };
  const ended = setsWon[side] >= s.setsToWin;
  events.push({ id: ++seq, stamp: 'Set', icon: '🎉', label: `Set ${sets.length} won`, detail: `${games.home}-${games.away}`, side });
  if (ended) events.push({ id: ++seq, stamp: 'Match', icon: '🏆', label: 'Match won', detail: `${setsWon.home}-${setsWon.away} sets`, side });
  return { ...s, pts: { home: 0, away: 0 }, games: { home: 0, away: 0 }, sets, setsWon, events, seq, ended };
}

function scorePoint(s: TennisState, side: 'home' | 'away', who: string | undefined, ace: boolean): TennisState {
  let seq = s.seq;
  const events = [...s.events];
  const o = other(side);
  const tb = inTiebreak(s);
  const pts = { ...s.pts, [side]: s.pts[side] + 1 };
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  // Structured fields (kind/playerName/set/points) let the per-set box score tally
  // points & aces per player, filtered by set — the timeline ignores them.
  events.push({ id: ++seq, stamp: `Set ${setNo}${tb ? ' · TB' : ''}`, icon: ace ? '🎯' : '🎾', label: ace ? 'Ace' : tb ? `Tiebreak ${pts.home}-${pts.away}` : 'Point', detail: who, side, kind: ace ? 'ace' : 'point', playerName: who, set: setNo, points: 1 });

  if (tb) {
    // First to the tiebreak target, win by 2. A match tiebreak records its own
    // score as the set (e.g. 10-8); a set tiebreak makes the games tiebreakAt+1.
    const tbWon = pts[side] >= tbTarget(s) && pts[side] - pts[o] >= 2;
    if (!tbWon) return { ...s, pts, events, seq };
    const games = isMatchTB(s) ? { home: pts.home, away: pts.away } : { ...s.games, [side]: s.tiebreakAt + 1 };
    return winSet(s, side, games, events, seq);
  }

  const gameWon = pts[side] >= 4 && pts[side] - pts[o] >= (s.noAd ? 1 : 2);
  if (!gameWon) return { ...s, pts, events, seq };

  const games = { ...s.games, [side]: s.games[side] + 1 };
  events.push({ id: ++seq, stamp: 'Game', icon: '✅', label: `Game ${side === 'home' ? 'home' : 'away'}`, detail: `${games.home}-${games.away}`, side });

  // Set won at gamesPerSet games — by two clear games if setWinByTwo (e.g. 6-4,
  // 7-5), else first-to-N (Fast4 4-2). At tiebreakAt-tiebreakAt the set goes to a
  // tiebreak instead (handled above on the next point) unless tiebreaks are off.
  const setDone = games[side] >= s.gamesPerSet && (!s.setWinByTwo || games[side] - games[o] >= 2);
  if (!setDone) return { ...s, pts: { home: 0, away: 0 }, games, events, seq };
  return winSet(s, side, games, events, seq);
}

/** Reset the match to love-all keeping its format (sets/games/tiebreak rules) —
 *  the clean slate an EDIT_LOG replay rebuilds the corrected point list onto. */
const clearMatch = (s: TennisState): TennisState => ({
  ...s, pts: { home: 0, away: 0 }, games: { home: 0, away: 0 }, sets: [], setsWon: { home: 0, away: 0 }, events: [], seq: 0, ended: false,
});

export const reducer = (s: TennisState, a: ScoreAction): TennisState => {
  // Timeline correction: STAT_ADJUST only reconciles player profiles (no match
  // effect); EDIT_LOG replays a corrected point list so games/sets re-derive.
  if (a.type === 'STAT_ADJUST') return s;
  if (a.type === 'EDIT_LOG') return replayPoints(reducer, clearMatch(s), (a.payload?.points as PointInput[]) ?? []);
  // Who serves first — settable only before the first point (like a tennis
  // toss); serve alternates from there. No `side` on this action.
  if (a.type === 'SET_FIRST_SERVER') {
    const played = s.games.home || s.games.away || s.pts.home || s.pts.away || s.sets.length;
    const side = a.payload?.side as 'home' | 'away' | undefined;
    if (played || (side !== 'home' && side !== 'away')) return s;
    return { ...s, firstServer: side };
  }
  if (s.ended || !a.side) return s;
  if (a.type === 'POINT') return scorePoint(s, a.side, a.attribution?.playerName, false);
  if (a.type === 'ACE') return scorePoint(s, a.side, a.attribution?.playerName, true);
  return s;
};

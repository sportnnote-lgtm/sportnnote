/**
 * Tennis scoring engine (pure) — best of 3/5 sets; games to 6 (win by 2, a 7th
 * settles 6-6); points 0/15/30/40 with deuce & advantage; set/match tiebreaks;
 * and serve tracking (first-server choice → per-game alternation, tiebreak-aware,
 * with doubles pair rotation). Kept RN-free so it's unit-testable.
 */
import type { LiveEvent } from '../liveEvents';
import type { ScoreAction } from '../types';
import { replayPoints, type PointInput } from '../rallyEdit.ts';
import { serveInfo as serveInfoOf, gamesPlayed as gamesPlayedOf, withServeOrder, type ServeOrder } from '../serve.ts';
import { scoreLine as lineOf, finalSummary, type Pair, type LineScore } from '../scoreline.ts';
import type { ScoreSummary } from '../types';
import { applyPointDetail, detailFlags, initDetailFlags } from '../pointDetail.ts';
import { setSportCue, type Cue } from '../courtCues.ts';

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
  /** SD-115 — ITF Fast4: the set tiebreak goes to sudden death at N-N (4 →
   *  first to 5, the next point at 4-4 wins). Absent / 0 = win by 2 (every
   *  match created before SD-115, so old logs replay unchanged). Not applied to
   *  a match tiebreak or a Grand Slam deciding-set tiebreak. */
  tbSuddenDeathAt?: number;
  /** no-advantage scoring — a single deciding point at deuce */
  noAd: boolean;
  /** if > 0, the deciding set is replaced by a first-to-N match tiebreak
   *  (champions' tiebreak, e.g. 10). Wins over `finalSetTBAt`. */
  finalSetTiebreak: number;
  /** SD-02 Grand Slam deciding set: if > 0 (and no match tiebreak), the deciding
   *  set is played in games and at N-N goes to a 10-point tiebreak (win by 2).
   *  Absent on older matches → 0, so their stored format keeps its meaning. */
  finalSetTBAt?: number;
  /** SD-02 per completed set: the tiebreak points [home, away] when the set
   *  ended in a tiebreak (7-6(4)), else null. Derived — rebuilt on every replay;
   *  absent on snapshots saved before SD-02 (see `setTiebreaks`). */
  tb?: Array<Pair | null>;
  /** doubles (2 a side) vs singles — drives the serve display & rotation */
  doubles: boolean;
  /** which side served game 1; serve alternates every game after that */
  firstServer: 'home' | 'away';
  /** SD-115 — the scorer has picked who serves first (SET_FIRST_SERVER). Until
   *  then the point buttons stay disabled, so there's no silent "home" default.
   *  Absent on older matches (they already have points, so it never blocks). */
  serverPicked?: boolean;
  /** SD-104 — doubles serving order picked per set (SET_SERVE_ORDER); absent →
   *  roster order. Kept across an EDIT_LOG replay. See serve.ts. */
  serveOrder?: ServeOrder;
  /** SD-107 — optional point detail (how each point was won) is being
   *  captured; absent / false = off (D8). Format key / SET_DETAIL. */
  pointDetail?: boolean;
  /** SD-107 — 1st / 2nd serve tracking: points served while on carry
   *  `serve` (1, or 2 after a 1st-serve fault / a double fault). */
  serveDetail?: boolean;
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
    ...(Number(config?.tbSuddenDeathAt) > 0 ? { tbSuddenDeathAt: Number(config?.tbSuddenDeathAt) } : {}),
    noAd: Boolean(config?.noAd ?? false),
    finalSetTiebreak: Number(config?.finalSetTiebreak ?? 0),
    finalSetTBAt: Number(config?.finalSetTBAt ?? 0),
    tb: [],
    doubles: Number(config?.playersPerSide ?? 1) >= 2,
    firstServer: (config?.firstServer as 'home' | 'away') ?? 'home',
    ...initDetailFlags(config),
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
/** Grand Slam deciding set: games as usual, a 10-point tiebreak at finalSetTBAt-all. */
const isSlamDecider = (s: TennisState) => isDeciderSet(s) && !isMatchTB(s) && (s.finalSetTBAt ?? 0) > 0;
/** Games-all score that starts this set's tiebreak (null = no tiebreak in this set). */
const tbAtFor = (s: TennisState): number | null => (isSlamDecider(s) ? s.finalSetTBAt! : s.setTiebreak ? s.tiebreakAt : null);
/** Points a Grand Slam deciding-set tiebreak is played to. */
export const SLAM_DECIDER_TB_POINTS = 10;
/** In a tiebreak: either the whole deciding set, or a set-ending tiebreak at N-N. */
export const inTiebreak = (s: TennisState) => {
  if (isMatchTB(s)) return true;
  const at = tbAtFor(s);
  return at != null && s.games.home === at && s.games.away === at;
};
const tbTarget = (s: TennisState) => (isMatchTB(s) ? s.finalSetTiebreak : isSlamDecider(s) ? SLAM_DECIDER_TB_POINTS : s.tiebreakPoints);

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
function winSet(s: TennisState, side: 'home' | 'away', games: { home: number; away: number }, events: LiveEvent[], seq: number, tbPts: Pair | null = null): TennisState {
  const sets = [...s.sets, [games.home, games.away] as [number, number]];
  const tb = [...(s.tb ?? []), tbPts];
  const setsWon = { ...s.setsWon, [side]: s.setsWon[side] + 1 };
  const ended = setsWon[side] >= s.setsToWin;
  events.push({ id: ++seq, stamp: 'Set', icon: '🎉', label: `Set ${sets.length} won`, detail: `${games.home}-${games.away}`, side });
  if (ended) events.push({ id: ++seq, stamp: 'Match', icon: '🏆', label: 'Match won', detail: `${setsWon.home}-${setsWon.away} sets`, side });
  return { ...s, pts: { home: 0, away: 0 }, games: { home: 0, away: 0 }, sets, setsWon, tb, events, seq, ended };
}

function scorePoint(s: TennisState, side: 'home' | 'away', who: string | undefined, ace: boolean, whoId?: string, df?: { playerId?: string; playerName?: string }, serve?: 1 | 2): TennisState {
  let seq = s.seq;
  const events = [...s.events];
  const o = other(side);
  const tb = inTiebreak(s);
  const pts = { ...s.pts, [side]: s.pts[side] + 1 };
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  // Structured fields (kind/playerName/set/points) let the per-set box score tally
  // points & aces per player, filtered by set — the timeline ignores them.
  // SD-104: a double fault is a plain point for the receiver (so every count of
  // points stays as before) carrying a `df` marker naming the faulting server.
  // SD-107: `serve` only on points served while 1st / 2nd serve tracking was on.
  const sv = serve ? { serve } : {};
  if (df) events.push({ id: ++seq, stamp: `Set ${setNo}${tb ? ' · TB' : ''}`, icon: '⚠️', label: tb ? `Double fault · ${pts.home}-${pts.away}` : 'Double fault', detail: df.playerName, side, kind: 'point', df, set: setNo, points: 1, ...sv });
  else events.push({ id: ++seq, stamp: `Set ${setNo}${tb ? ' · TB' : ''}`, icon: ace ? '🎯' : '🎾', label: ace ? 'Ace' : tb ? `Tiebreak ${pts.home}-${pts.away}` : 'Point', detail: who, side, kind: ace ? 'ace' : 'point', playerName: who, ...(whoId ? { playerId: whoId } : {}), set: setNo, points: 1, ...sv });

  if (tb) {
    // First to the tiebreak target, win by 2. A match tiebreak records its own
    // score as the set (e.g. 10-8); a set tiebreak makes the games tiebreakAt+1.
    // SD-115: a set tiebreak with sudden death (Fast4: at 4-4 the next point wins).
    const sd = !isMatchTB(s) && !isSlamDecider(s) ? s.tbSuddenDeathAt ?? 0 : 0;
    const tbWon = pts[side] >= tbTarget(s) && (pts[side] - pts[o] >= 2 || (sd > 0 && pts[o] >= sd));
    if (!tbWon) return { ...s, pts, events, seq };
    const games = isMatchTB(s) ? { home: pts.home, away: pts.away } : { ...s.games, [side]: (tbAtFor(s) ?? s.tiebreakAt) + 1 };
    return winSet(s, side, games, events, seq, [pts.home, pts.away]);
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
  ...s, pts: { home: 0, away: 0 }, games: { home: 0, away: 0 }, sets: [], setsWon: { home: 0, away: 0 }, tb: [], events: [], seq: 0, ended: false,
});

export const reducer = (s: TennisState, a: ScoreAction): TennisState => {
  // Timeline correction: STAT_ADJUST only reconciles player profiles (no match
  // effect); EDIT_LOG replays a corrected point list so games/sets re-derive.
  if (a.type === 'STAT_ADJUST') return s;
  if (a.type === 'EDIT_LOG') {
    // SD-107: each corrected point carries its own 1st / 2nd serve, so replay
    // with serve tracking off (a point from before it was switched on stays
    // untracked), then restore the setting.
    const r = replayPoints(reducer, clearMatch({ ...s, serveDetail: undefined }), (a.payload?.points as PointInput[]) ?? []);
    const { serveDetail: _drop, ...rest } = r;
    return s.serveDetail === undefined ? rest : { ...rest, serveDetail: s.serveDetail };
  }
  // SD-107 — capture settings (from the next point) and a point's detail
  // (annotates the last point; allowed after the match point too).
  if (a.type === 'SET_DETAIL') { const f = detailFlags(a.payload, s); return f ? { ...s, ...f } : s; }
  if (a.type === 'POINT_DETAIL') { const ev = applyPointDetail(s.events, a.payload); return ev ? { ...s, events: ev } : s; }
  // Who serves first — settable only before the first point (like a tennis
  // toss); serve alternates from there. No `side` on this action.
  // SD-104 — doubles: which player of a pair serves its first game of this set
  // (ITF / FIP: each pair chooses at the start of every set). Pre-first-point of
  // the set only; no score effect and no timeline event.
  if (a.type === 'SET_SERVE_ORDER') return withServeOrder(s, a.payload as Record<string, unknown> | undefined);
  // SD-115: a `v:2` payload may FIX the first server mid-match — serve is only
  // derived (first server + games played), so the score never changes; the
  // serve / hold / break figures re-derive from the corrected opener.
  if (a.type === 'SET_FIRST_SERVER') {
    const played = s.games.home || s.games.away || s.pts.home || s.pts.away || s.sets.length;
    const side = a.payload?.side as 'home' | 'away' | undefined;
    if (side !== 'home' && side !== 'away') return s;
    if (played && (a.payload?.v !== 2 || s.ended)) return s;
    return { ...s, firstServer: side, serverPicked: true };
  }
  if (s.ended || !a.side) return s;
  // SD-19: the credited player's id rides on the point (absolute statTotals).
  // SD-104: a double fault dispatched with `payload.df` (new UI / voice) marks the
  // point; the faulting server rides on attribution2 (live) or the persisted
  // `_attr2` (replay from the log). Older double faults (no flag) are plain points.
  // SD-107: the 1st / 2nd serve — given on a replayed point, else 1 (2 for a
  // double fault) while tracking is on; untracked points carry none.
  const given = a.payload?.serve === 1 || a.payload?.serve === 2 ? a.payload.serve : undefined;
  const isDf = a.type === 'POINT' && a.payload?.df === true;
  const serve: 1 | 2 | undefined = given ?? (s.serveDetail ? (isDf ? 2 : 1) : undefined);
  if (isDf) {
    const f = a.attribution2 ?? (a.payload?._attr2 as ScoreAction['attribution2']);
    return scorePoint(s, a.side, undefined, false, undefined, { ...(f?.playerId ? { playerId: f.playerId } : {}), ...(f?.playerName ? { playerName: f.playerName } : {}) }, serve);
  }
  if (a.type === 'POINT') return scorePoint(s, a.side, a.attribution?.playerName, false, a.attribution?.playerId || undefined, undefined, serve);
  if (a.type === 'ACE') return scorePoint(s, a.side, a.attribution?.playerName, true, a.attribution?.playerId || undefined, undefined, serve);
  return s;
};

// ------------------------------------------------------------ scoreline ----

/** Tiebreak points per completed set. Uses `s.tb`; a snapshot saved before SD-02
 *  has none, so count each set's tiebreak points from its event log instead
 *  (every tiebreak point is stamped "Set N · TB"). */
export function setTiebreaks(s: TennisState): Array<Pair | null> {
  const sets = s.sets ?? [];
  if (Array.isArray(s.tb) && s.tb.length === sets.length) return s.tb;
  return sets.map((_, i) => {
    const stamp = `Set ${i + 1} · TB`;
    const t: Pair = [0, 0];
    for (const e of s.events ?? []) {
      if (e.stamp !== stamp || (e.kind !== 'point' && e.kind !== 'ace')) continue;
      if (e.side === 'home') t[0] += 1; else if (e.side === 'away') t[1] += 1;
    }
    return t[0] + t[1] > 0 ? t : null;
  });
}

/** Which completed sets were a whole-set match (champions') tiebreak → "[10-8]". */
export const matchTbSets = (s: TennisState): boolean[] =>
  (s.sets ?? []).map((_, i) => s.finalSetTiebreak > 0 && i === s.setsToWin * 2 - 2);

/** "6-4, 3-6, 7-6(4)" — the completed sets, tiebreak points included. */
export function scoreLine(s: TennisState, perspective?: 'home' | 'away'): string {
  if (!s || !Array.isArray(s.sets)) return '';
  return lineOf(s.sets, { tb: setTiebreaks(s), matchTb: matchTbSets(s), perspective });
}

/** SD-20 — the line score: completed sets (tiebreak points, a match tiebreak's
 *  points) + the set in play (its games; a match tiebreak's points). */
export function lineScore(s: TennisState): LineScore | null {
  if (!s || !Array.isArray(s.sets)) return null;
  const tbs = setTiebreaks(s);
  const mtb = matchTbSets(s);
  const ended = !!s.ended;
  return {
    unit: 'set',
    won: { home: s.setsWon?.home ?? 0, away: s.setsWon?.away ?? 0 },
    done: s.sets.map(([home, away], i) => ({ home, away, tb: tbs[i] ?? null, ...(mtb[i] ? { matchTb: true } : {}) })),
    current: ended ? null : isMatchTB(s)
      ? { home: s.pts?.home ?? 0, away: s.pts?.away ?? 0, matchTb: true }
      : { home: s.games?.home ?? 0, away: s.games?.away ?? 0 },
    ended,
    toWin: s.setsToWin,
  };
}

/** Scoreboard summary: live = current-game points; ended = sets won + the set line. */
export function summary(s: TennisState): ScoreSummary {
  if (s.ended) return finalSummary(s.setsWon, scoreLine(s));
  const line = scoreLine(s);
  return {
    homeScore: disp(s, 'home'),
    awayScore: disp(s, 'away'),
    statusLine: `Set ${s.setsWon.home + s.setsWon.away + 1}${inTiebreak(s) ? ' · TIEBREAK' : ''} · ${s.setsToWin === 1 ? 'single set' : `best of ${s.setsToWin * 2 - 1}`}`,
    detailLine: `Games ${s.games.home}-${s.games.away}${line ? ' · ' + line : ''}`,
  };
}

/** SD-17 standings units: games won by each side over the match (ATP / FIP
 *  "% of games won", games difference). A set tiebreak counts as the 7-6 it
 *  produced; a match (champions') tiebreak counts as ONE game to its winner
 *  (ATP rule), however its points are stored. Plus the games of an unfinished
 *  set. Sets come from the match score. */
export function standingsUnits(s: TennisState): { games: { home: number; away: number } } | null {
  if (!s || !Array.isArray(s.sets)) return null;
  const mtb = matchTbSets(s);
  const tbs = setTiebreaks(s);
  const games = { home: s.games?.home ?? 0, away: s.games?.away ?? 0 };
  s.sets.forEach(([h, a], i) => {
    if (mtb[i]) {
      const tb = tbs[i];
      const homeWon = tb ? tb[0] > tb[1] : h > a;
      if (homeWon) games.home += 1; else games.away += 1;
    } else { games.home += h; games.away += a; }
  });
  return { games };
}

// ------------------------------------------------- SD-117c · court cues --

/** SD-117c — "Change ends" due after the last point (ITF Rule 10; derived). */
export const tennisCue = (s: TennisState): Cue | null =>
  setSportCue({ ended: s.ended, pts: s.pts, games: s.games, sets: s.sets, matchGames: standingsUnits(s)?.games ?? { home: 0, away: 0 }, inTiebreak: inTiebreak(s) });

/** SD-117c — what the tiebreak in play is: a set tiebreak (to 7, Fast4 to 5
 *  with sudden death), a Grand Slam deciding-set tiebreak (to 10) or a match
 *  tiebreak replacing the deciding set (to N). null = not in a tiebreak. */
export function tiebreakInfo(s: TennisState): { kind: 'set' | 'decider' | 'match'; target: number; suddenDeathAt?: number; deciderTarget?: number } | null {
  if (!inTiebreak(s)) return null;
  if (isMatchTB(s)) return { kind: 'match', target: s.finalSetTiebreak };
  if (isSlamDecider(s)) return { kind: 'decider', target: SLAM_DECIDER_TB_POINTS };
  const sd = s.tbSuddenDeathAt ?? 0;
  const deciderTarget = s.finalSetTiebreak > 0 ? s.finalSetTiebreak : (s.finalSetTBAt ?? 0) > 0 ? SLAM_DECIDER_TB_POINTS : undefined;
  return { kind: 'set', target: s.tiebreakPoints, ...(sd > 0 ? { suddenDeathAt: sd } : {}), ...(deciderTarget && deciderTarget !== s.tiebreakPoints ? { deciderTarget } : {}) };
}

/** "Tiebreak to 7, win by 2 (10 in the deciding set) · 1 serve, then 2 each". */
export function tiebreakBanner(s: TennisState): string | null {
  const t = tiebreakInfo(s);
  if (!t) return null;
  const head = t.kind === 'match' ? `Match tiebreak to ${t.target}` : t.kind === 'decider' ? `Deciding-set tiebreak to ${t.target}` : `Tiebreak to ${t.target}`;
  const rule = t.suddenDeathAt ? `sudden death at ${t.suddenDeathAt}-${t.suddenDeathAt}` : 'win by 2';
  const dec = t.deciderTarget ? ` (${t.deciderTarget} in the deciding set)` : '';
  return `${head}, ${rule}${dec} · first server 1 point, then 2 each`;
}

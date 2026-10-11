/**
 * Pure scoring engine for the rally/handout racquet sports (pickleball, squash,
 * table tennis) — no React Native, so node tests can replay real matches through
 * it. `rallyCore.tsx` builds each sport's plugin (controls, summary) on top.
 */
import type { LiveEvent } from './liveEvents';
import type { ScoreAction, ScoreSummary } from './types';
import { scoreLine as lineOf, finalSummary, pointsLineScore, type LineScore } from './scoreline.ts';
import { pointRows, type EditRow, type PointInput } from './rallyEdit.ts';
import { applyPointDetail, detailFlags, initDetailFlags } from './pointDetail.ts';
import { applyRacketExtras, replayKeepingMarks, withStamps, type ConductOps } from './conduct.ts';

export interface RallyState {
  current: { home: number; away: number };
  games: Array<[number, number]>;
  gamesWon: { home: number; away: number };
  /** points to win a game */
  target: number;
  /** margin needed: 2 (win by two) or 1 (hard cap) */
  winBy: number;
  /** games a side must win to take the match */
  gamesToWin: number;
  /** true = serve-based scoring (only the server scores) */
  sideOut: boolean;
  /** doubles → two servers per side-out (server 1 then 2); singles → one */
  doubles: boolean;
  /** which side currently holds serve (side-out only) */
  serving: 'home' | 'away';
  /** which server is up: 1 or 2 (doubles side-out only) */
  serverNo: 1 | 2;
  /** who served first in game 1 — decided by the toss (table tennis, ITTF
   *  2.13.1). Absent on older matches → home. */
  opening?: 'home' | 'away';
  /** SD-115 — the scorer has picked who serves first (SET_FIRST_SERVER); the
   *  point buttons stay disabled until then (no silent "home" default). */
  serverPicked?: boolean;
  /** SD-06 — per team, the player who starts the current game in the RIGHT-hand
   *  court (doubles), set pre-serve by `SET_START_RIGHT`. Absent → roster order
   *  (the first listed player). Carries over to the next game until changed. */
  startRight?: { home?: string; away?: string };
  /** SD-06 — derived (side-out doubles): is the current server the serving
   *  team's right-court starter (true) or the partner (false)? Absent on older
   *  snapshots → treated as true. Never affects the score. */
  srvStarter?: boolean;
  /** SD-107 — optional point detail (how each rally was won) is being
   *  captured; absent / false = off (D8). Format key / SET_DETAIL. */
  pointDetail?: boolean;
  events: LiveEvent[];
  seq: number;
  ended: boolean;
}

export const other = (side: 'home' | 'away'): 'home' | 'away' => (side === 'home' ? 'away' : 'home');

/** First to `target`, by the required margin (`winBy`). winBy 1 = first to target. */
export function gameWinner(h: number, a: number, target: number, winBy: number): 'home' | 'away' | null {
  if (h >= target && h - a >= winBy) return 'home';
  if (a >= target && a - h >= winBy) return 'away';
  return null;
}

/** What the engine needs from a sport's options. */
export interface RallyEngineOpts {
  /** SD-53 — the sport (conduct schedule, timeouts, lets) */
  id?: 'pickleball' | 'squash' | 'tabletennis';
  icon: string;
  sideOutValue: string;
  sideOutLabel: string;
  defaults: { playersPerSide: number; target: number; winBy: number; gamesToWin: number };
}

export function makeRallyEngine(opts: RallyEngineOpts) {
  const init = (config?: Record<string, unknown>): RallyState => ({
    current: { home: 0, away: 0 },
    games: [],
    gamesWon: { home: 0, away: 0 },
    target: Number(config?.pointsPerGame ?? opts.defaults.target),
    winBy: Number(config?.winBy ?? opts.defaults.winBy),
    gamesToWin: Number(config?.gamesToWin ?? opts.defaults.gamesToWin),
    sideOut: (config?.scoring ?? 'rally') === opts.sideOutValue,
    doubles: Number(config?.playersPerSide ?? opts.defaults.playersPerSide) >= 2,
    serving: config?.firstServe === 'away' ? 'away' : 'home',
    opening: config?.firstServe === 'away' ? 'away' : 'home',
    serverNo: 2, // start-of-game "second server" exception: the first team's fault is a side-out
    srvStarter: true, // the first server of a game serves from the right
    ...initDetailFlags(config),
    events: [],
    seq: 0,
    ended: false,
  });

  /** SD-21 — back to 0-0 of game 1 with the format, toss and right-court picks
   *  kept: the clean slate an EDIT_LOG replay rebuilds the corrected rallies onto. */
  const clearMatch = (s: RallyState): RallyState => ({
    ...s,
    current: { home: 0, away: 0 }, games: [], gamesWon: { home: 0, away: 0 },
    serving: s.opening ?? 'home', serverNo: 2, srvStarter: true,
    events: [], seq: 0, ended: false,
  });

  /** After a point: game / match won → the next game (the winner serves). */
  const finish = (s: RallyState, current: { home: number; away: number }, events: LiveEvent[], seq: number, gameNo: number): RallyState => {
    const winner = gameWinner(current.home, current.away, s.target, s.winBy);
    if (!winner) return { ...s, current, events, seq };

    const games = [...s.games, [current.home, current.away] as [number, number]];
    const gamesWon = { ...s.gamesWon, [winner]: s.gamesWon[winner] + 1 };
    const ended = gamesWon[winner] >= s.gamesToWin;
    events.push({ id: ++seq, stamp: 'Game', icon: '🎉', label: `Game ${gameNo} won`, detail: `${current.home}-${current.away}`, side: winner });
    if (ended) events.push({ id: ++seq, stamp: 'Match', icon: '🏆', label: 'Match won', detail: `${gamesWon.home}-${gamesWon.away} games`, side: winner });
    // New game: the winner serves first, again under the start-of-game exception.
    return { ...s, current: { home: 0, away: 0 }, games, gamesWon, serving: winner, serverNo: 2, srvStarter: true, events, seq, ended };
  };

  // SD-53 — a penalty point goes straight onto `side`'s score (also in side-out
  // scoring: it isn't a rally, so serve doesn't change hands mid-game).
  const conductOps: ConductOps<RallyState> = {
    sport: opts.id ?? 'squash',
    point: (s, side) => {
      const gameNo = s.games.length + 1;
      const current = { ...s.current, [side]: s.current[side] + 1 };
      let seq = s.seq;
      const events = [...s.events];
      events.push({ id: ++seq, stamp: `Game ${gameNo}`, icon: opts.icon, label: 'Point', detail: `${current.home}-${current.away}`, side, kind: 'point', game: gameNo, points: 1 });
      return finish(s, current, events, seq, gameNo);
    },
    gameKey: (s) => `${s.games.length}${s.ended ? 'E' : ''}`,
    where: (s) => ({ stamp: `Game ${s.games.length + 1}`, game: s.games.length + 1 }),
    target: (s) => s.target,
  };

  const core = (s: RallyState, a: ScoreAction): RallyState => {
    // SD-21 — timeline correction. STAT_ADJUST only reconciles player profiles (no
    // match effect); EDIT_LOG replays the corrected rally list (each entry = who
    // won the rally), so score, games, server and side-outs all re-derive.
    if (a.type === 'STAT_ADJUST') return s;
    // SD-53: conduct / timeout / let records are put back after the replay.
    if (a.type === 'EDIT_LOG') return replayKeepingMarks(reducer, clearMatch(s), (a.payload?.points as PointInput[]) ?? [], s.events);
    // SD-53 / SD-54 / SD-63 — conduct penalties, timeouts, squash lets
    { const x = applyRacketExtras(s, a, conductOps); if (x) return x; }
    // SD-06 — who starts this game in the right-hand court, per team. Pre-serve
    // only (the game is still 0-0); no score effect and no timeline event.
    if (a.type === 'SET_START_RIGHT') {
      const side = a.payload?.side;
      const playerId = a.payload?.playerId;
      if (s.ended || (side !== 'home' && side !== 'away') || typeof playerId !== 'string' || !playerId) return s;
      // SD-115: a `v:2` payload may fix the pick mid-game — the server is only
      // derived from it (court positions), so the score never changes.
      if ((s.current.home !== 0 || s.current.away !== 0) && a.payload?.v !== 2) return s;
      return { ...s, startRight: { ...s.startRight, [side]: playerId } };
    }
    // SD-104 — who serves first (the toss), chosen on the scoring screen before
    // the match's first rally: sets the opening server (table tennis' game-by-game
    // alternation) and the side holding serve (squash / side-out). No score
    // effect, no timeline event; ignored once any rally is logged.
    if (a.type === 'SET_FIRST_SERVER') {
      const side = a.payload?.side;
      if (s.ended || (side !== 'home' && side !== 'away')) return s;
      if (s.events.length || s.games.length || s.current.home || s.current.away) {
        // SD-115: a `v:2` payload may fix the opener mid-match under RALLY scoring
        // only — serve is derived there (TT rotation / the rally winner serves),
        // so the score never changes. In side-out scoring the server decides who
        // can score, so a wrong opener is fixed by correcting the timeline.
        if (a.payload?.v !== 2 || s.sideOut) return s;
        const anyPoint = s.events.some((e) => e.kind === 'point');
        return { ...s, opening: side, serving: anyPoint ? s.serving : side, serverPicked: true };
      }
      return { ...s, opening: side, serving: side, serverPicked: true };
    }
    // SD-107 — capture setting (from the next point) and a point's detail
    // (annotates the last point; allowed after the match point too).
    if (a.type === 'SET_DETAIL') { const f = detailFlags(a.payload, s); return f ? { ...s, ...f } : s; }
    if (a.type === 'POINT_DETAIL') { const ev = applyPointDetail(s.events, a.payload); return ev ? { ...s, events: ev } : s; }
    if (a.type !== 'POINT' || !a.side || s.ended) return s;
    const gameNo = s.games.length + 1;

    // Side-out scoring: the action says who WON the rally.
    if (s.sideOut && a.side !== s.serving) {
      // The serving side faulted.
      let seq = s.seq;
      const events = [...s.events];
      if (s.doubles && s.serverNo === 1) {
        // Hand serve to the 2nd server on the same team — not a side-out yet.
        // `side` stays the serving (losing) team as before; `wonBy` (SD-21) records the rally winner.
        events.push({ id: ++seq, stamp: `Game ${gameNo}`, icon: '🔁', label: '2nd server', detail: 'serve → partner', side: s.serving, kind: 'rally', wonBy: a.side, game: gameNo });
        return { ...s, serverNo: 2, srvStarter: !(s.srvStarter ?? true), events, seq };
      }
      events.push({ id: ++seq, stamp: `Game ${gameNo}`, icon: '🔁', label: opts.sideOutLabel, detail: `serve → ${a.side}`, side: a.side, kind: 'rally', wonBy: a.side, game: gameNo });
      // Server 1 at a side-out is whoever stands in the right court: the starter
      // when the team's score is even, the partner when it's odd.
      return { ...s, serving: a.side, serverNo: 1, srvStarter: s.current[a.side] % 2 === 0, events, seq };
    }

    const scorer = s.sideOut ? s.serving : a.side; // side-out: only the server scores
    const who = a.attribution?.playerName;
    // SD-19: keep the credited player's id on the point (absolute statTotals).
    const pid = a.attribution?.playerId ? { playerId: a.attribution.playerId } : {};
    const current = { ...s.current, [scorer]: s.current[scorer] + 1 };
    let seq = s.seq;
    const events = [...s.events];
    events.push({ id: ++seq, stamp: `Game ${gameNo}`, icon: opts.icon, label: 'Point', detail: `${current.home}-${current.away}${who ? ` · ${who}` : ''}`, side: scorer, kind: 'point', playerName: who, ...pid, game: gameNo, points: 1 });
    return finish(s, current, events, seq, gameNo);
  };
  // SD-54 — every new event carries the step's `payload.at` (durations)
  const reducer = withStamps(core);

  return { init, reducer };
}

// ------------------------------------------------- SD-21 · point editor --

/** The editable rallies of a rally-engine log, in order: every point, plus every
 *  side-out / 2nd-server rally (side-out scoring). Logs from before SD-21 carry
 *  those rallies without `kind`/`wonBy`, so they're inferred from the 🔁 event:
 *  "2nd server" → `side` is the serving team, which LOST the rally; a side-out /
 *  hand-out → `side` is the receiving team, which WON it. */
export function rallyRows(events: LiveEvent[]): EditRow[] {
  const legacy = (events ?? []).map((e): LiveEvent => {
    if (e.kind || e.icon !== '🔁' || !e.side) return e;
    const wonBy = e.label === '2nd server' ? other(e.side) : e.side;
    const g = /^Game (\d+)$/.exec(e.stamp);
    return { ...e, kind: 'rally', wonBy, game: g ? Number(g[1]) : undefined };
  });
  return pointRows(legacy);
}

/** The rally list a log replays from (see `rallyRows`). */
export const rallyInputs = (events: LiveEvent[]): PointInput[] => rallyRows(events).map((r) => r.p);

// ------------------------------------------------- SD-06 · court positions --
// USA Pickleball rules. Doubles: each team's players switch courts only when
// their team scores, so the game's right-court starter stands on the right
// whenever the team's score is even. The first server of every service turn
// serves from the right. Singles: the server is on the right with an even score.
// Rally scoring uses the same positions; the server is the serving team's
// right-court player. Everything here is derived from the state (the log).

/** Rally scoring with the "rally winner serves" rule: who serves next. */
export function rallyServingSide(s: RallyState): 'home' | 'away' {
  if (s.sideOut) return s.serving;
  for (let i = (s.events?.length ?? 0) - 1; i >= 0; i--) {
    const e = s.events[i];
    if (e.kind === 'point') return e.side as 'home' | 'away';
  }
  return s.serving;
}

export interface ServeSpot {
  side: 'home' | 'away';
  /** doubles: the server is the team's right-court starter (true) or the
   *  partner (false). Singles: always true. */
  starter: boolean;
  court: 'right' | 'left';
  /** the score call: "4-2-1" (side-out doubles), else "4-2" — server first */
  call: string;
}

/** Who serves and from which court, as a pure function of the state. */
export function serveSpot(s: RallyState): ServeSpot {
  const side = rallyServingSide(s);
  const own = s.current[side];
  const even = own % 2 === 0;
  const call2 = `${own}-${s.current[other(side)]}`;
  if (!s.doubles) return { side, starter: true, court: even ? 'right' : 'left', call: call2 };
  if (!s.sideOut) return { side, starter: even, court: 'right', call: call2 };
  const starter = s.srvStarter ?? true;
  return { side, starter, court: starter === even ? 'right' : 'left', call: `${call2}-${s.serverNo}` };
}

/** The ids of the team's starter (right court at 0) and partner, from the
 *  `SET_START_RIGHT` pick, else roster order. `roster` = the team's player ids. */
export function startPair(s: RallyState, side: 'home' | 'away', roster: string[]): { starter?: string; partner?: string } {
  const pair = roster.slice(0, 2);
  const picked = s.startRight?.[side];
  const starter = picked && roster.includes(picked) ? picked : pair[0];
  const partner = roster.find((id) => id !== starter);
  return { starter, partner };
}

/** The player in the RIGHT-hand court for `side` right now (doubles). */
export function rightCourtId(s: RallyState, side: 'home' | 'away', roster: string[]): string | undefined {
  const { starter, partner } = startPair(s, side, roster);
  return s.current[side] % 2 === 0 ? starter : partner;
}

/** The serving player's id (doubles: by court position; singles: the player). */
export function serverId(s: RallyState, rosters: { home: string[]; away: string[] }): string | undefined {
  const spot = serveSpot(s);
  const roster = rosters[spot.side];
  if (!s.doubles) return roster[0];
  const { starter, partner } = startPair(s, spot.side, roster);
  return spot.starter ? starter : partner;
}

/** SD-01 — the completed games, "11-7, 9-11, 11-5". */
export function rallyScoreLine(s: RallyState, perspective?: 'home' | 'away'): string {
  return lineOf(s?.games, { perspective });
}

/** SD-20 — the line score: every game + the one in play (LineScoreboard, "ret."). */
export const rallyLineScore = (s: RallyState): LineScore | null =>
  pointsLineScore('game', s && { games: s.games, current: s.current, won: s.gamesWon, ended: s.ended, toWin: s.gamesToWin });

/** Scoreboard summary for pickleball / squash / table tennis. Live = the current
 *  game's points; once ended = games won + every game's score (not the reset 0–0). */
export function rallySummary(s: RallyState, serveTag: string, opts: { rallyCall?: boolean } = {}): ScoreSummary {
  if (s.ended) return finalSummary(s.gamesWon, rallyScoreLine(s));
  const line = rallyScoreLine(s);
  // SD-117c (pickleball) — rally scoring has a call too: "Serving 4-2", the
  // server's score first (once someone serves: after the toss or a rally).
  const rallyCall = opts.rallyCall && !s.sideOut && (s.serverPicked || s.events.length > 0) ? ` · Serving ${serveSpot(s).call}` : '';
  return {
    homeScore: String(s.current.home),
    awayScore: String(s.current.away),
    // SD-06: in side-out scoring the score call ("4-2-1") is the headline.
    statusLine: `Game ${s.games.length + 1}${s.sideOut ? ` · ${serveTag} · ${serveSpot(s).call}` : rallyCall}`,
    detailLine:
      `Games — ${s.gamesWon.home}:${s.gamesWon.away}${line ? ` (${line})` : ''} · to ${s.target}${s.winBy === 2 ? ' (win by 2)' : ''} · ${s.gamesToWin === 1 ? 'single game' : `best of ${s.gamesToWin * 2 - 1}`}`,
  };
}

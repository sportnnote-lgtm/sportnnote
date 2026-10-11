/**
 * SD-22 (GEN-09) — the rally-stats engine: serve / return figures derived by
 * REPLAYING a match's point list through the sport's own pure reducer and
 * tagging every rally with who served it. No new capture: a finished, live or
 * corrected match (EDIT_LOG / AMEND already applied to `state.events`) gives
 * the same figures, and old logs work.
 *
 * Who served each rally (all derived, never stored):
 *   tennis / padel  serve.ts `serveInfo` — alternates by game, tiebreak turns,
 *                   doubles slot (SD-103 partner rotation in a tiebreak)
 *   badminton       the last rally winner (the first server before any point)
 *   table tennis    ITTF order (`ttServer`: 2 each, 1 each from 10-10; 21-pt: 5 each, 1 each from 20-20)
 *   squash / pickleball, rally scoring   the last rally winner
 *   side-out scoring (pickleball side-out, squash English)  the side holding
 *                   serve (`state.serving`), server 1 / 2 in doubles
 *   volleyball      SD-58: the toss (SET_SERVE) + the rally winner; the
 *                   serving player from the rotation (position I, rotating on
 *                   every side-out — volleyball/rotation.ts). Only for a match
 *                   that recorded the toss (older ones: null — no panel).
 *
 * Per side, per set/game and for the whole match:
 *   rallies won · points scored · service / return points played + won ·
 *   aces (tennis, credited) · service games held / broken, return games ·
 *   break points (receiver one point from the game, not in a tiebreak) faced /
 *   saved, opportunities / converted · golden (deciding) points played / won
 *   (padel golden point, tennis no-ad) · game / set / match points: chances,
 *   converted, faced, saved · longest run of points · biggest lead (points in a
 *   game; tennis / padel: games in a set) · side-out scoring: side-outs won
 *   (squash: hand-outs), service turns (hand-ins), 2nd-server handovers.
 * Per player (the SERVING player; doubles only where the app already names
 * the server — tennis / padel by slot, pickleball by court position): service
 * points played / won, service games / held, break points faced / saved.
 *
 * "Chance" = this rally would end the game / set / match if X won it — found
 * by asking the reducer itself (so golden point, caps, win-by-1, tiebreaks and
 * side-out "only the server scores" are all exactly the engine's rules).
 *
 * PURE (no React Native). Cost: 3 reducer steps per rally on a state with an
 * empty event list, so O(points).
 */
import type { ScoreAction } from './types';
import { pointInputs, type PointInput } from './rallyEdit.ts';
import { makeRallyEngine, rallyInputs, startPair, type RallyState } from './rallyEngine.ts';
import { ttServer } from './tabletennis/serve.ts';
import * as tennis from './tennis/engine.ts';
import * as padel from './padel/engine.ts';
import * as badminton from './badminton/engine.ts';
import * as volleyball from './volleyball/engine.ts';
import { rallyServers, serveTracked as vbServeTracked } from './volleyball/rotation.ts';

type RacketServeSport = 'tennis' | 'padel' | 'badminton' | 'tabletennis' | 'squash' | 'pickleball';
export type ServeSport = RacketServeSport | 'volleyball';
type Side = 'home' | 'away';
const SIDES: Side[] = ['home', 'away'];
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** One side's figures over a block (the match, or one set / game). */
export interface SideServe {
  /** rallies won (side-out: incl. those that only won the serve back) */
  won: number;
  /** points on the scoreboard */
  scored: number;
  srvPlayed: number;
  srvWon: number;
  rcvPlayed: number;
  rcvWon: number;
  /** tennis: aces (an ACE point) */
  aces: number;
  /** tennis / padel, tiebreaks excluded, finished games only */
  svcGames: number;
  held: number;
  rtnGames: number;
  breaks: number;
  /** break points: as receiver (opportunities / converted), as server (faced / saved) */
  bpOpps: number;
  bpWon: number;
  bpFaced: number;
  bpSaved: number;
  /** golden / no-ad deciding points played, won */
  golden: number;
  goldenWon: number;
  /** game (or bigger), set (or bigger) and match points: own chances / converted, opponent's faced / saved */
  gpOpps: number; gpWon: number; gpFaced: number; gpSaved: number;
  spOpps: number; spWon: number; spFaced: number; spSaved: number;
  mpOpps: number; mpWon: number; mpFaced: number; mpSaved: number;
  /** longest run of points scored in a row */
  run: number;
  /** biggest lead: points in a game (game sports) or games in a set (tennis / padel) */
  maxLead: number;
  /** side-out scoring: serve won back (squash: hand-outs won) */
  sideOuts: number;
  /** side-out scoring: service turns (hand-ins), the first of each game included */
  turns: number;
  /** side-out doubles: rallies lost by server 1 (serve → partner) */
  handovers: number;
  /** tennis: double faults served (points marked `df`) */
  dfs: number;
  /** SD-107 tennis 1st / 2nd serve (points carrying `serve` only): service
   *  points tracked, 1st serves in, won on the 1st serve, 2nd-serve points
   *  (double faults included), won on the 2nd serve */
  s1Pts: number; s1In: number; s1Won: number; s2Pts: number; s2Won: number;
}

/** The serving player's figures (keyed by player id). */
export interface PlayerServe {
  side: Side;
  srvPlayed: number;
  srvWon: number;
  svcGames: number;
  held: number;
  bpFaced: number;
  bpSaved: number;
  /** SD-107 — 1st / 2nd serve (tracked points only) */
  s1Pts: number; s1In: number; s1Won: number; s2Pts: number; s2Won: number;
}

export interface ServeBlock {
  /** rallies played */
  rallies: number;
  home: SideServe;
  away: SideServe;
  players: Record<string, PlayerServe>;
}

export interface ServeStats {
  sport: ServeSport;
  /** the period unit: tennis / padel 'set', else 'game' */
  unit: 'set' | 'game';
  /** side-out scoring (only the server scores) */
  sideOut: boolean;
  doubles: boolean;
  /** padel golden point / tennis no-ad: deciding points exist */
  golden: boolean;
  match: ServeBlock;
  /** index = period - 1 (set / game number) */
  periods: ServeBlock[];
  /** every served rally has a named server (per-player figures complete) */
  serverKnown: boolean;
  /** the replay reproduced the state's score (false = a snapshot whose log
   *  doesn't rebuild it — figures are from the log) */
  consistent: boolean;
  /** SD-107 — some point carried a 1st / 2nd serve (tennis serve tracking) */
  serveTracked: boolean;
  /** SD-107 — who served the last rally and who won it (the point-detail row
   *  offers service options by it); absent before the first rally */
  last?: { server: Side; winner: Side };
}

/** Player ids per side, in roster order (doubles slot 0 / 1). */
export type ServeRosters = { home?: string[]; away?: string[] };

const zeroSide = (): SideServe => ({
  won: 0, scored: 0, srvPlayed: 0, srvWon: 0, rcvPlayed: 0, rcvWon: 0, aces: 0,
  svcGames: 0, held: 0, rtnGames: 0, breaks: 0, bpOpps: 0, bpWon: 0, bpFaced: 0, bpSaved: 0,
  golden: 0, goldenWon: 0,
  gpOpps: 0, gpWon: 0, gpFaced: 0, gpSaved: 0, spOpps: 0, spWon: 0, spFaced: 0, spSaved: 0,
  mpOpps: 0, mpWon: 0, mpFaced: 0, mpSaved: 0,
  run: 0, maxLead: 0, sideOuts: 0, turns: 0, handovers: 0,
  dfs: 0, s1Pts: 0, s1In: 0, s1Won: 0, s2Pts: 0, s2Won: 0,
});
const zeroBlock = (): ServeBlock => ({ rallies: 0, home: zeroSide(), away: zeroSide(), players: {} });

// The rally engine's scoring doesn't depend on the plugin's labels.
const RALLY = makeRallyEngine({ icon: '', sideOutValue: '__n/a__', sideOutLabel: '', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });

type AnyState = tennis.TennisState | padel.PadelState | badminton.BadmintonState | RallyState | volleyball.VolleyballState;
/** 0 none · 1 game · 2 set · 3 match */
type Level = 0 | 1 | 2 | 3;

interface Adapter {
  family: 'set' | 'game';
  clear: (s: AnyState) => AnyState;
  inputs: (s: AnyState) => PointInput[];
  reduce: (s: AnyState, a: ScoreAction) => AnyState;
  /** who serves the next rally (+ doubles slot / named player) */
  server: (s: AnyState, lastWinner: Side | undefined, rosters: ServeRosters) => { side: Side; id?: string; tb: boolean };
  period: (s: AnyState) => number;
  /** what winning a rally from `a` to `b` completed */
  level: (a: AnyState, b: AnyState) => Level;
  /** points on the board (side-out: did the rally score?) */
  total: (s: AnyState) => number;
  /** the score a final state must match */
  key: (s: AnyState) => string;
}

// ------------------------------------------------------- tennis / padel --

type SetState = tennis.TennisState | padel.PadelState;
const setsDone = (s: SetState) => (s.sets ?? []).length;
const gamesDone = (s: SetState) => (s.sets ?? []).reduce((n, g) => n + g[0] + g[1], 0) + (s.games?.home ?? 0) + (s.games?.away ?? 0);
const setLevel = (a: AnyState, b: AnyState): Level => {
  const x = a as SetState, y = b as SetState;
  if (y.ended && !x.ended) return 3;
  if (setsDone(y) > setsDone(x)) return 2;
  if (gamesDone(y) > gamesDone(x)) return 1;
  return 0;
};
const clearSet = (s: AnyState): AnyState => ({
  ...(s as SetState), pts: { home: 0, away: 0 }, games: { home: 0, away: 0 }, sets: [], setsWon: { home: 0, away: 0 }, tb: [], events: [], seq: 0, ended: false,
}) as AnyState;
const setKey = (s: AnyState) => { const x = s as SetState; return JSON.stringify([x.sets ?? [], x.games, x.pts, !!x.ended]); };

function setAdapter(eng: { reducer: (s: never, a: ScoreAction) => unknown; serveInfo: (s: never) => { side: Side; slot: 0 | 1 }; inTiebreak: (s: never) => boolean }): Adapter {
  return {
    family: 'set',
    clear: clearSet,
    inputs: (s) => pointInputs(s.events ?? []),
    reduce: (s, a) => eng.reducer(s as never, a) as AnyState,
    server: (s, _w, rosters) => {
      const x = s as SetState;
      const { side, slot } = eng.serveInfo(s as never);
      const roster = rosters[side] ?? [];
      const id = x.doubles ? roster[slot] : roster.length === 1 ? roster[0] : undefined;
      return { side, id, tb: eng.inTiebreak(s as never) };
    },
    period: (s) => setsDone(s as SetState) + 1,
    level: setLevel,
    total: (s) => gamesDone(s as SetState) * 1000 + (s as SetState).pts.home + (s as SetState).pts.away,
    key: setKey,
  };
}

// --------------------------------------------- badminton / rally engine --

type GameState = badminton.BadmintonState | RallyState;
const gameLevel = (a: AnyState, b: AnyState): Level => {
  const x = a as GameState, y = b as GameState;
  if (y.ended && !x.ended) return 3;
  if ((y.games ?? []).length > (x.games ?? []).length) return 1;
  return 0;
};
const gameTotal = (s: AnyState) => {
  const x = s as GameState;
  return (x.games ?? []).reduce((n, g) => n + g[0] + g[1], 0) + x.current.home + x.current.away;
};
const gameKey = (s: AnyState) => { const x = s as GameState; return JSON.stringify([x.games ?? [], x.current, !!x.ended]); };

const badmintonAdapter: Adapter = {
  family: 'game',
  clear: (s) => ({ ...(s as badminton.BadmintonState), current: { home: 0, away: 0 }, games: [], gamesWon: { home: 0, away: 0 }, events: [], seq: 0, ended: false }),
  inputs: (s) => pointInputs(s.events ?? []),
  reduce: (s, a) => badminton.reducer(s as badminton.BadmintonState, a),
  server: (s, w, rosters) => {
    const side = w ?? (s as badminton.BadmintonState).firstServer ?? 'home';
    const roster = rosters[side] ?? [];
    // BWF doubles: who of the pair serves depends on the receiving positions,
    // which aren't captured (BD-05) — side only.
    return { side, id: !(s as badminton.BadmintonState).doubles && roster.length === 1 ? roster[0] : undefined, tb: false };
  },
  period: (s) => ((s as GameState).games ?? []).length + 1,
  level: gameLevel,
  total: gameTotal,
  key: gameKey,
};

function rallyAdapter(sport: 'tabletennis' | 'squash' | 'pickleball'): Adapter {
  return {
    family: 'game',
    clear: (s) => {
      const x = s as RallyState;
      return { ...x, current: { home: 0, away: 0 }, games: [], gamesWon: { home: 0, away: 0 }, serving: x.opening ?? 'home', serverNo: 2, srvStarter: true, events: [], seq: 0, ended: false };
    },
    inputs: (s) => rallyInputs(s.events ?? []),
    reduce: (s, a) => RALLY.reducer(s as RallyState, a),
    server: (s, w, rosters) => {
      const x = s as RallyState;
      const side: Side = x.sideOut ? x.serving
        : sport === 'tabletennis' ? ttServer(x.current.home, x.current.away, x.games.length, x.opening ?? 'home', x.target)
        : w ?? x.serving;
      const roster = rosters[side] ?? [];
      let id: string | undefined;
      if (!x.doubles) id = roster.length === 1 ? roster[0] : undefined;
      else if (sport === 'pickleball' && roster.length >= 2) {
        // SD-06 court positions (USA Pickleball): side-out → the derived starter
        // flag; rally scoring → the right-court player (starter on an even score).
        const { starter, partner } = startPair(x, side, roster);
        const isStarter = x.sideOut ? (x.srvStarter ?? true) : x.current[side] % 2 === 0;
        id = isStarter ? starter : partner;
      }
      // TT doubles (ITTF 2.14 order) and squash doubles: the pair's server isn't named — side only.
      return { side, id, tb: false };
    },
    period: (s) => ((s as GameState).games ?? []).length + 1,
    level: gameLevel,
    total: gameTotal,
    key: gameKey,
  };
}

// ------------------------------------------------------------ volleyball --

type VbState = volleyball.VolleyballState;
const vbSetsDone = (s: AnyState) => ((s as VbState).sets ?? []).length;

/** SD-58 — per match: the server of every rally is derived up front from the
 *  full log (toss + rotation + subs), then handed out in rally order. */
function volleyballAdapter(s0: VbState): Adapter {
  const seq = rallyServers(s0);
  let i = 0;
  return {
    family: 'game',
    clear: (s) => ({ ...(s as VbState), current: { home: 0, away: 0 }, setsWon: { home: 0, away: 0 }, sets: [], events: [], seq: 0, ended: false }),
    inputs: (s) => pointInputs(s.events ?? []),
    reduce: (s, a) => volleyball.reducer(s as VbState, a),
    server: (_s, w) => {
      const r = seq[i++];
      return { side: r?.side ?? w ?? 'home', id: r?.serverId, tb: false };
    },
    period: (s) => vbSetsDone(s) + 1,
    level: (a, b) => ((b as VbState).ended && !(a as VbState).ended ? 3 : vbSetsDone(b) > vbSetsDone(a) ? 1 : 0),
    total: (s) => { const x = s as VbState; return x.sets.reduce((n, g) => n + g[0] + g[1], 0) + x.current.home + x.current.away; },
    key: (s) => { const x = s as VbState; return JSON.stringify([x.sets ?? [], x.current, !!x.ended]); },
  };
}

const ADAPTERS: Record<RacketServeSport, Adapter> = {
  tennis: setAdapter(tennis as never),
  padel: setAdapter(padel as never),
  badminton: badmintonAdapter,
  tabletennis: rallyAdapter('tabletennis'),
  squash: rallyAdapter('squash'),
  pickleball: rallyAdapter('pickleball'),
};

export const SERVE_SPORTS = Object.keys(ADAPTERS) as RacketServeSport[];
export const isServeSport = (s: string): s is RacketServeSport => s in ADAPTERS;

/** Lead after the rally: points in the game (the finished game's final score
 *  when it just ended), or games in the set for tennis / padel. Null = no lead
 *  to measure (a match tiebreak's points aren't games). */
function leadAfter(fam: 'set' | 'game', prev: AnyState, next: AnyState, lvl: Level, matchTb: boolean): { home: number; away: number } | null {
  if (fam === 'game') {
    const y = next as GameState;
    // volleyball keeps its finished sets in `sets`
    const done = (y.games ?? (next as VbState).sets) as Array<[number, number]>;
    if (lvl >= 1) { const g = done[done.length - 1]; return g ? { home: g[0], away: g[1] } : null; }
    return y.current;
  }
  if (lvl === 0) return null; // games only move when a game ends
  const y = next as SetState;
  if (lvl >= 2) {
    if (matchTb) return null;
    const g = y.sets[y.sets.length - 1];
    return g ? { home: g[0], away: g[1] } : null;
  }
  return y.games;
}

/**
 * Replay `state`'s point list and derive the serve / return figures. `rosters`
 * = player ids per side in roster order (names the serving player). Null when
 * the state isn't a match of `sport` (no events).
 */
export function serveStats(sport: ServeSport, state: unknown, rosters: ServeRosters = {}): ServeStats | null {
  const s0 = state as AnyState | null;
  if (!s0 || !Array.isArray((s0 as { events?: unknown }).events)) return null;
  // SD-58 — volleyball only once the toss is recorded (older matches: no panel)
  const ad = sport === 'volleyball' ? (vbServeTracked(s0 as VbState) ? volleyballAdapter(s0 as VbState) : null) : ADAPTERS[sport];
  if (!ad) return null;
  const fam = ad.family;
  const inputs = ad.inputs(s0);
  let cur = ad.clear(s0);
  const match = zeroBlock();
  const periods: ServeBlock[] = [];
  const doubles = !!(s0 as { doubles?: boolean }).doubles;
  const sideOut = fam === 'game' && !!(s0 as RallyState).sideOut;
  const golden = sport === 'padel' ? !!(s0 as padel.PadelState).goldenPoint : sport === 'tennis' ? !!(s0 as tennis.TennisState).noAd : false;
  let lastWinner: Side | undefined;
  let serverKnown = true;
  let serveTracked = false;
  let last: ServeStats['last'];
  // runs: whole match + the current period's
  const run = { side: null as Side | null, n: 0, pSide: null as Side | null, pn: 0 };
  let lastPeriod = 0;
  let lastTurn: Side | null = null;

  for (const p of inputs) {
    const base = { ...cur, events: [] } as AnyState;
    const per = ad.period(base);
    if (per !== lastPeriod) { run.pSide = null; run.pn = 0; lastTurn = null; lastPeriod = per; }
    const blk = (periods[per - 1] ??= zeroBlock());
    const both = (fn: (b: ServeBlock) => void) => { fn(match); fn(blk); };
    const srv = ad.server(base, lastWinner, rosters);
    const S = srv.side, R = opp(S);
    // What each side would complete by winning this rally (the engine's own rules).
    const lv: Record<Side, Level> = {
      home: ad.level(base, ad.reduce(base, { type: 'POINT', side: 'home' })),
      away: ad.level(base, ad.reduce(base, { type: 'POINT', side: 'away' })),
    };
    const next = ad.reduce(base, { type: p.kind === 'ace' && fam === 'set' ? 'ACE' : 'POINT', side: p.side });
    const W = p.side;
    const scored = ad.total(next) > ad.total(base);
    const scorer: Side | null = !scored ? null : sideOut ? (base as RallyState).serving : W;
    // a whole-set match tiebreak starts at 0-0 in games (a set tiebreak at N-N)
    const matchTb = fam === 'set' && srv.tb && (base as SetState).games.home === 0 && (base as SetState).games.away === 0;
    if (!srv.id) serverKnown = false;
    const pl = (b: ServeBlock) => (srv.id ? (b.players[srv.id] ??= { side: S, srvPlayed: 0, srvWon: 0, svcGames: 0, held: 0, bpFaced: 0, bpSaved: 0, s1Pts: 0, s1In: 0, s1Won: 0, s2Pts: 0, s2Won: 0 }) : null);
    if (p.serve) serveTracked = true;

    both((b) => {
      b.rallies += 1;
      b[W].won += 1;
      if (scorer) b[scorer].scored += 1;
      b[S].srvPlayed += 1; b[R].rcvPlayed += 1;
      if (W === S) b[S].srvWon += 1; else b[R].rcvWon += 1;
      const ps = pl(b);
      if (ps) { ps.srvPlayed += 1; if (W === S) ps.srvWon += 1; }
      if (p.kind === 'ace') b[W].aces += 1;
      if (p.df) b[S].dfs += 1;
      // SD-58 — volleyball: a missed serve is the server's error
      if (sport === 'volleyball' && p.kind === 'serveerror') b[S].dfs += 1;
      // SD-107 — 1st / 2nd serve, on tracked points only (a double fault is a 2nd-serve point lost)
      if (p.serve) {
        const won = W === S;
        for (const x of [b[S], ps]) {
          if (!x) continue;
          x.s1Pts += 1;
          if (p.serve === 1) { x.s1In += 1; if (won) x.s1Won += 1; } else { x.s2Pts += 1; if (won) x.s2Won += 1; }
        }
      }
      // game / set / match points
      for (const X of SIDES) {
        const O = opp(X), r = lv[X];
        if (r >= 1) { b[X].gpOpps += 1; b[O].gpFaced += 1; if (W === X) b[X].gpWon += 1; else b[O].gpSaved += 1; }
        if (r >= 2 && fam === 'set') { b[X].spOpps += 1; b[O].spFaced += 1; if (W === X) b[X].spWon += 1; else b[O].spSaved += 1; }
        if (r >= 3) { b[X].mpOpps += 1; b[O].mpFaced += 1; if (W === X) b[X].mpWon += 1; else b[O].mpSaved += 1; }
      }
      if (fam === 'set' && !srv.tb) {
        // break point: the receiver is one rally from the game
        if (lv[R] >= 1) {
          b[R].bpOpps += 1; b[S].bpFaced += 1;
          if (W === R) b[R].bpWon += 1; else b[S].bpSaved += 1;
          if (ps) { ps.bpFaced += 1; if (W === S) ps.bpSaved += 1; }
        }
        const pts = (base as SetState).pts;
        if (golden && pts.home >= 3 && pts.home === pts.away) { b.home.golden += 1; b.away.golden += 1; b[W].goldenWon += 1; }
        // a finished service game
        if (lv[W] >= 1) {
          b[S].svcGames += 1; b[R].rtnGames += 1;
          if (W === S) b[S].held += 1; else b[R].breaks += 1;
          if (ps) { ps.svcGames += 1; if (W === S) ps.held += 1; }
        }
      }
      if (sideOut) {
        const x = base as RallyState, y = next as RallyState;
        if (lv[W] === 0 && y.serving !== x.serving) b[y.serving].sideOuts += 1;
        if (doubles && x.serverNo === 1 && W !== x.serving) b[x.serving].handovers += 1;
      }
    });
    // service turns (side-out): a new turn when the serving side changes, or a new game starts
    if (sideOut && lastTurn !== S) { match[S].turns += 1; blk[S].turns += 1; lastTurn = S; }
    // runs of points scored
    if (scorer) {
      run.n = run.side === scorer ? run.n + 1 : 1; run.side = scorer;
      run.pn = run.pSide === scorer ? run.pn + 1 : 1; run.pSide = scorer;
      match[scorer].run = Math.max(match[scorer].run, run.n);
      blk[scorer].run = Math.max(blk[scorer].run, run.pn);
    }
    // biggest lead
    const lead = leadAfter(fam, base, next, lv[W], matchTb);
    if (lead) {
      for (const X of SIDES) {
        const d = lead[X] - lead[opp(X)];
        if (d > 0) { match[X].maxLead = Math.max(match[X].maxLead, d); blk[X].maxLead = Math.max(blk[X].maxLead, d); }
      }
    }
    last = { server: S, winner: W };
    lastWinner = W; // rally scoring: the rally winner serves next (side-out reads state.serving)
    cur = next;
  }
  // A period with no rally yet (the next game at 0-0) isn't listed.
  for (let i = 0; i < periods.length; i++) periods[i] ??= zeroBlock();
  const consistent = ad.key(cur) === ad.key({ ...s0, events: [] } as AnyState);
  return { sport, unit: fam === 'set' ? 'set' : 'game', sideOut, doubles, golden, match, periods, serverKnown, consistent, serveTracked, ...(last ? { last } : {}) };
}

// -------------------------------------------------- career keys (SD-19) --

/** Keys every racket line gets from the replay. `srvPts` / `srvPtsWon` are the
 *  SERVING player's; `rcvPts` / `rcvPtsWon` the side's (doubles: both players). */
export const SERVE_KEYS = ['srvPts', 'srvPtsWon', 'rcvPts', 'rcvPtsWon'] as const;
/** Tennis / padel add holds / breaks and break points. Server-side keys
 *  (svcGames, svcHeld, bpFaced, bpSaved) are the serving player's; return-side
 *  keys (rtnGames, breaks, bpOpps, bpWon) the side's. */
export const SERVE_SET_KEYS = ['svcGames', 'svcHeld', 'bpFaced', 'bpSaved', 'rtnGames', 'breaks', 'bpOpps', 'bpWon'] as const;
const SERVER_KEYS = new Set(['srvPts', 'srvPtsWon', 'svcGames', 'svcHeld', 'bpFaced', 'bpSaved', 'srv1Pts', 'srv1In', 'srv1Won', 'srv2Pts', 'srv2Won']);

/**
 * The career keys for one player of `side`. Coverage-aware (D8): when the
 * serving player isn't known for every rally (badminton / TT / squash doubles,
 * or no roster), the server-side keys are left out for EVERY player of the
 * match (statTotals rule 4: unknown, not 0) — the side's return keys stay.
 */
export function serveCareerKeys(st: ServeStats | null, side: Side, playerId: string): Record<string, number> {
  if (!st) return {};
  const m = st.match;
  const me = m[side];
  const out: Record<string, number> = { rcvPts: me.rcvPlayed, rcvPtsWon: me.rcvWon };
  if (st.unit === 'set') Object.assign(out, { rtnGames: me.rtnGames, breaks: me.breaks, bpOpps: me.bpOpps, bpWon: me.bpWon });
  if (st.serverKnown) {
    const p = m.players[playerId];
    const own = p && p.side === side ? p : null;
    out.srvPts = own?.srvPlayed ?? 0;
    out.srvPtsWon = own?.srvWon ?? 0;
    if (st.unit === 'set') Object.assign(out, { svcGames: own?.svcGames ?? 0, svcHeld: own?.held ?? 0, bpFaced: own?.bpFaced ?? 0, bpSaved: own?.bpSaved ?? 0 });
    // SD-107 — 1st / 2nd serve keys, only for a match that tracked them (D8)
    if (st.serveTracked) Object.assign(out, { srv1Pts: own?.s1Pts ?? 0, srv1In: own?.s1In ?? 0, srv1Won: own?.s1Won ?? 0, srv2Pts: own?.s2Pts ?? 0, srv2Won: own?.s2Won ?? 0 });
  }
  return out;
}
export const isServerKey = (k: string) => SERVER_KEYS.has(k);

// ---------------------------------------------------- panel rows (pure) --

/** One row of the two-column match-stats panel. `hv` / `av` = the comparable
 *  number (a % or a count) for the bar; the strings are what's shown. */
export interface ServeRow { key: string; label: string; home: string; away: string; hv: number; av: number }

const frac = (n: number, d: number) => (d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : '–');
const pctOf = (n: number, d: number) => (d ? (100 * n) / d : 0);

/** The rows for `block` (the match or one period), in ATP / BWF order. Rows
 *  that can't apply are left out (golden points without the rule, saved
 *  points when none were faced, side-out rows in rally scoring). */
export function serveRows(st: ServeStats, block: ServeBlock): ServeRow[] {
  const h = block.home, a = block.away;
  const rows: ServeRow[] = [];
  const ratio = (key: string, label: string, n: (x: SideServe) => number, d: (x: SideServe) => number) =>
    rows.push({ key, label, home: frac(n(h), d(h)), away: frac(n(a), d(a)), hv: pctOf(n(h), d(h)), av: pctOf(n(a), d(a)) });
  const count = (key: string, label: string, v: (x: SideServe) => number) =>
    rows.push({ key, label, home: String(v(h)), away: String(v(a)), hv: v(h), av: v(a) });
  const saved = (key: string, label: string, n: (x: SideServe) => number, d: (x: SideServe) => number) => {
    if (d(h) + d(a) > 0) ratio(key, label, n, d);
  };
  const leadUnit = st.unit === 'set' ? 'Biggest lead (games)' : 'Biggest lead';
  if (st.sport === 'volleyball') {
    // SD-58 — FIVB VIS style: side-out % = points won on receive
    ratio('tot', 'Total points won', (x) => x.won, () => block.rallies);
    ratio('srv', 'Points won on serve', (x) => x.srvWon, (x) => x.srvPlayed);
    ratio('rcv', 'Side-out % (won on receive)', (x) => x.rcvWon, (x) => x.rcvPlayed);
    count('aces', 'Aces', (x) => x.aces);
    count('se', 'Serve errors', (x) => x.dfs);
    count('run', 'Most points in a row', (x) => x.run);
    count('lead', leadUnit, (x) => x.maxLead);
    saved('sps', 'Set points saved', (x) => x.gpSaved, (x) => x.gpFaced);
    saved('mps', 'Match points saved', (x) => x.mpSaved, (x) => x.mpFaced);
    return rows;
  }
  if (st.unit === 'set') {
    if (st.sport === 'tennis') count('aces', 'Aces', (x) => x.aces);
    if (st.sport === 'tennis' && h.dfs + a.dfs > 0) count('dfs', 'Double faults', (x) => x.dfs);
    // SD-107 — 1st / 2nd serve (ATP order), when the match tracked them
    if (h.s1Pts + a.s1Pts > 0) {
      ratio('s1in', '1st serve in', (x) => x.s1In, (x) => x.s1Pts);
      ratio('s1won', '1st serve points won', (x) => x.s1Won, (x) => x.s1In);
      ratio('s2won', '2nd serve points won', (x) => x.s2Won, (x) => x.s2Pts);
    }
    ratio('srv', 'Service points won', (x) => x.srvWon, (x) => x.srvPlayed);
    ratio('rcv', 'Return points won', (x) => x.rcvWon, (x) => x.rcvPlayed);
    ratio('tot', 'Total points won', (x) => x.won, () => block.rallies);
    ratio('held', 'Service games held', (x) => x.held, (x) => x.svcGames);
    ratio('brk', 'Return games won', (x) => x.breaks, (x) => x.rtnGames);
    ratio('bps', 'Break points saved', (x) => x.bpSaved, (x) => x.bpFaced);
    ratio('bpc', 'Break points converted', (x) => x.bpWon, (x) => x.bpOpps);
    if (st.golden) ratio('gold', st.sport === 'padel' ? 'Golden points won' : 'Deciding points won', (x) => x.goldenWon, (x) => x.golden);
    saved('sps', 'Set points saved', (x) => x.spSaved, (x) => x.spFaced);
    saved('mps', 'Match points saved', (x) => x.mpSaved, (x) => x.mpFaced);
    count('run', 'Most points in a row', (x) => x.run);
    count('lead', leadUnit, (x) => x.maxLead);
    return rows;
  }
  if (st.sideOut) {
    const squash = st.sport === 'squash';
    ratio('rallies', 'Rallies won', (x) => x.won, () => block.rallies);
    ratio('srv', 'Points on serve', (x) => x.srvWon, (x) => x.srvPlayed);
    ratio('rcv', 'Receive rallies won', (x) => x.rcvWon, (x) => x.rcvPlayed);
    count('so', squash ? 'Hand-outs won' : 'Side-outs', (x) => x.sideOuts);
    count('turns', squash ? 'Hand-ins (service turns)' : 'Service turns', (x) => x.turns);
    rows.push({
      key: 'ppt', label: 'Points per service turn',
      home: h.turns ? (h.scored / h.turns).toFixed(1) : '–', away: a.turns ? (a.scored / a.turns).toFixed(1) : '–',
      hv: h.turns ? h.scored / h.turns : 0, av: a.turns ? a.scored / a.turns : 0,
    });
    if (st.doubles && st.sport === 'pickleball') count('ho', 'Serve to 2nd server', (x) => x.handovers);
  } else {
    ratio('tot', 'Total points won', (x) => x.won, () => block.rallies);
    ratio('srv', 'Points won on serve', (x) => x.srvWon, (x) => x.srvPlayed);
    ratio('rcv', 'Points won on receive', (x) => x.rcvWon, (x) => x.rcvPlayed);
  }
  count('run', 'Most points in a row', (x) => x.run);
  count('lead', leadUnit, (x) => x.maxLead);
  saved('gps', 'Game points saved', (x) => x.gpSaved, (x) => x.gpFaced);
  saved('mps', 'Match points saved', (x) => x.mpSaved, (x) => x.mpFaced);
  return rows;
}

/** The serving player's line for the panel: "18/26 (69%) · 4/5 held". */
export function playerServeLine(st: ServeStats, p: PlayerServe): string {
  const pts = frac(p.srvWon, p.srvPlayed);
  return st.unit === 'set' && p.svcGames ? `${pts} · ${p.held}/${p.svcGames} held` : pts;
}

/**
 * Pure scoring engine for the rally/handout racquet sports (pickleball, squash,
 * table tennis) — no React Native, so node tests can replay real matches through
 * it. `rallyCore.tsx` builds each sport's plugin (controls, summary) on top.
 */
import type { LiveEvent } from './liveEvents';
import type { ScoreAction } from './types';

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
    events: [],
    seq: 0,
    ended: false,
  });

  const reducer = (s: RallyState, a: ScoreAction): RallyState => {
    if (a.type !== 'POINT' || !a.side || s.ended) return s;
    const gameNo = s.games.length + 1;

    // Side-out scoring: the action says who WON the rally.
    if (s.sideOut && a.side !== s.serving) {
      // The serving side faulted.
      let seq = s.seq;
      const events = [...s.events];
      if (s.doubles && s.serverNo === 1) {
        // Hand serve to the 2nd server on the same team — not a side-out yet.
        events.push({ id: ++seq, stamp: `Game ${gameNo}`, icon: '🔁', label: '2nd server', detail: 'serve → partner', side: s.serving });
        return { ...s, serverNo: 2, events, seq };
      }
      events.push({ id: ++seq, stamp: `Game ${gameNo}`, icon: '🔁', label: opts.sideOutLabel, detail: `serve → ${a.side}`, side: a.side });
      return { ...s, serving: a.side, serverNo: 1, events, seq };
    }

    const scorer = s.sideOut ? s.serving : a.side; // side-out: only the server scores
    const who = a.attribution?.playerName;
    const current = { ...s.current, [scorer]: s.current[scorer] + 1 };
    let seq = s.seq;
    const events = [...s.events];
    events.push({ id: ++seq, stamp: `Game ${gameNo}`, icon: opts.icon, label: 'Point', detail: `${current.home}-${current.away}${who ? ` · ${who}` : ''}`, side: scorer, kind: 'point', playerName: who, game: gameNo, points: 1 });

    const winner = gameWinner(current.home, current.away, s.target, s.winBy);
    if (!winner) return { ...s, current, events, seq };

    const games = [...s.games, [current.home, current.away] as [number, number]];
    const gamesWon = { ...s.gamesWon, [winner]: s.gamesWon[winner] + 1 };
    const ended = gamesWon[winner] >= s.gamesToWin;
    events.push({ id: ++seq, stamp: 'Game', icon: '🎉', label: `Game ${gameNo} won`, detail: `${current.home}-${current.away}`, side: winner });
    if (ended) events.push({ id: ++seq, stamp: 'Match', icon: '🏆', label: 'Match won', detail: `${gamesWon.home}-${gamesWon.away} games`, side: winner });
    // New game: the winner serves first, again under the start-of-game exception.
    return { ...s, current: { home: 0, away: 0 }, games, gamesWon, serving: winner, serverNo: 2, events, seq, ended };
  };

  return { init, reducer };
}

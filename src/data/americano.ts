/** Americano (padel/pickleball) — individuals who rotate partners every round; each
 *  game is played to a points target and every point you win is added to YOUR personal
 *  total. Final ranking is an individual leaderboard, not a team table. Pure + tested.
 *
 *  Scheduling uses the circle method to rotate partnerships each round (so you keep
 *  getting new partners), then groups two partnerships into a 2-v-2 game. An odd
 *  player, or a leftover partnership when the count isn't a multiple of 4, rests that
 *  round. */

export interface AmericanoGame {
  round: number;
  court: number;
  a: [string, string];
  b: [string, string];
}
export interface AmericanoRound {
  round: number;
  games: AmericanoGame[];
  resting: string[];
}

const BYE = '__bye__';

/** A rotation schedule for `rounds` rounds. Partnerships rotate via the circle
 *  method; two partnerships make one game; anyone left over rests that round. */
export function americanoSchedule(playerIds: string[], rounds: number): AmericanoRound[] {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (ids.length < 4) return [];
  const arr = ids.length % 2 === 1 ? [...ids, BYE] : [...ids];
  const n = arr.length;
  const half = n / 2;
  let list = [...arr];
  const out: AmericanoRound[] = [];
  for (let r = 0; r < rounds; r++) {
    // Partnerships for this round (circle method): list[i] partners list[n-1-i].
    const partnerships: [string, string][] = [];
    const resting: string[] = [];
    for (let i = 0; i < half; i++) {
      const p: [string, string] = [list[i], list[n - 1 - i]];
      if (p.includes(BYE)) resting.push(p[0] === BYE ? p[1] : p[0]);
      else partnerships.push(p);
    }
    // Group two partnerships into a 2-v-2 game; a leftover partnership rests.
    const games: AmericanoGame[] = [];
    for (let g = 0; g + 1 < partnerships.length; g += 2) {
      games.push({ round: r + 1, court: g / 2 + 1, a: partnerships[g], b: partnerships[g + 1] });
    }
    if (partnerships.length % 2 === 1) resting.push(...partnerships[partnerships.length - 1]);
    out.push({ round: r + 1, games, resting: resting.filter((x) => x !== BYE) });
    // Rotate everyone but the first fixed position.
    list = [list[0], list[n - 1], ...list.slice(1, n - 1)];
  }
  return out;
}

/** Everyone partners everyone once = n-1 rounds (n even). A sensible default cap so
 *  a big field doesn't schedule dozens of rounds. */
export function suggestedAmericanoRounds(n: number): number {
  if (n < 4) return 0;
  const full = n % 2 === 0 ? n - 1 : n;
  return Math.min(full, 12);
}

export interface AmericanoStanding { id: string; name: string; points: number; games: number }

/** Per-player leaderboard: points = sum of your side's score in every game you
 *  played; games = how many you played. Ranked by points, then fewest games (so a
 *  higher rate ranks above someone who simply played more), then name. */
export function americanoStandings(
  players: { id: string; name: string }[],
  schedule: AmericanoRound[],
  scores: Record<string, { a: number; b: number }>,
): AmericanoStanding[] {
  const pts = new Map<string, number>();
  const gp = new Map<string, number>();
  for (const p of players) { pts.set(p.id, 0); gp.set(p.id, 0); }
  for (const rnd of schedule) {
    for (const g of rnd.games) {
      const s = scores[gameKey(g)];
      if (!s) continue;
      for (const id of g.a) { pts.set(id, (pts.get(id) ?? 0) + s.a); gp.set(id, (gp.get(id) ?? 0) + 1); }
      for (const id of g.b) { pts.set(id, (pts.get(id) ?? 0) + s.b); gp.set(id, (gp.get(id) ?? 0) + 1); }
    }
  }
  return players
    .map((p) => ({ id: p.id, name: p.name, points: pts.get(p.id) ?? 0, games: gp.get(p.id) ?? 0 }))
    .sort((x, y) => y.points - x.points || x.games - y.games || x.name.localeCompare(y.name));
}

/** Stable key for a game's stored score. */
export function gameKey(g: { round: number; court: number }): string {
  return `${g.round}-${g.court}`;
}

// ── Persistence ────────────────────────────────────────────────────────────
// The whole Americano state rides the tournament's formats[sport] JSONB (zero
// migration), JSON-encoded under one key. The schedule is frozen once generated so
// entered scores stay attached even if the field changes.
import type { SportFormat } from '../core/types';

export interface AmericanoState {
  target: number; // points a game is played to (e.g. 24)
  rounds: number;
  players: { id: string; name: string }[];
  schedule: AmericanoRound[];
  scores: Record<string, { a: number; b: number }>;
}

const STATE_KEY = 'americano';

export function emptyAmericano(): AmericanoState {
  return { target: 24, rounds: 0, players: [], schedule: [], scores: {} };
}

export function readAmericano(fmt?: Record<string, unknown> | null): AmericanoState {
  const raw = fmt?.[STATE_KEY];
  if (typeof raw !== 'string' || !raw) return emptyAmericano();
  try {
    const p = JSON.parse(raw);
    return {
      target: typeof p.target === 'number' ? p.target : 24,
      rounds: typeof p.rounds === 'number' ? p.rounds : 0,
      players: Array.isArray(p.players) ? p.players : [],
      schedule: Array.isArray(p.schedule) ? p.schedule : [],
      scores: p.scores && typeof p.scores === 'object' ? p.scores : {},
    };
  } catch {
    return emptyAmericano();
  }
}

export function writeAmericano(fmt: SportFormat | undefined, state: AmericanoState): SportFormat {
  return { ...(fmt ?? {}), [STATE_KEY]: JSON.stringify(state) };
}

export function newAmericanoPlayer(name: string): { id: string; name: string } {
  return { id: `ap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim() };
}


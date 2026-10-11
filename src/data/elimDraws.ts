/**
 * SD-125 — the two extra draws a knockout can run, both pure:
 *
 *  1. **Double elimination** (pickleball pools → double elim; any sport). Lose
 *     twice and you're out.
 *     • Winners' bracket `wb1 … wbK`: a normal seeded draw (byes to top seeds).
 *     • Losers' bracket `lb1 … lb(2K−2)`: lb1 pairs the wb1 losers; then it
 *       alternates a "drop-in" round (lb survivors v the next winners'-round
 *       losers) and a plain round (survivors v survivors). Drop-ins are placed
 *       reversed, then reversed within each half, alternately (`dropIndex`), so
 *       a team doesn't meet a side it already played straight away.
 *     • Grand final `gf`: winners' champion v losers' champion. With the
 *       optional **bracket reset** (default on), a losers'-side win forces
 *       `gf2`, because the winners' champion hasn't lost yet.
 *  2. **Plate** (consolation) for first-round losers (`pl1 …`): a separate
 *     single-elimination mini-draw. It gives no medal places — just a
 *     "Plate winner".
 *
 * Every match carries its bracket slot (`__koSlot`); the round-1 matches carry
 * the seed list (`__deSeeds` / `__plSeeds`, JSON) and the reset choice, so the
 * whole draw is rebuilt from the matches alone (no new table, no migration —
 * and each division's matches carry their own draw). Results come from the
 * normal pairing resolution, so series / team ties (SD-48) and the organiser's
 * "Advances" pick (SD-120) work in both draws.
 */
import type { Match } from '../core/types';
import {
  bracketSeedOrder, pairingsInStage, pairingSlot, pairingWinnerId, KO_SLOT_KEY,
  type KnockoutPairing, type KnockoutRound,
} from './bracket.ts';

export const DE_SEEDS_KEY = '__deSeeds';
export const DE_RESET_KEY = '__deReset';
export const PLATE_SEEDS_KEY = '__plSeeds';

/** One side of a draw node: a team, a bye (nobody — the other side walks
 *  through, no match is created), or not known yet. */
export type DrawSide = { kind: 'team'; id: string } | { kind: 'bye' } | { kind: 'tbd' };
const BYE: DrawSide = { kind: 'bye' };
const TBD: DrawSide = { kind: 'tbd' };
const team = (id: string): DrawSide => ({ kind: 'team', id });

/** One match slot of a draw. `pairing` is set once the match (or tie) exists. */
export interface DrawNode {
  stage: string;
  slot: number;
  home: DrawSide;
  away: DrawSide;
  pairing?: KnockoutPairing;
  winner: DrawSide;
  loser: DrawSide;
}
export interface DrawRound { stage: string; label: string; nodes: DrawNode[] }
/** A match the draw is ready to create (both sides known, not created yet). */
export interface ReadyPair { stage: string; slot: number; homeId: string; awayId: string }

const nextPow2 = (n: number) => { let p = 1; while (p < n) p *= 2; return p; };

/** The created pairings of a set of matches, keyed `stage#slot`. A pairing with
 *  no saved slot takes its index in kickoff order. */
function indexPairings(matches: Match[], isStage: (s: string) => boolean): Map<string, KnockoutPairing> {
  const byStage = new Map<string, Match[]>();
  for (const m of matches) {
    if (!m.stage || !isStage(m.stage)) continue;
    byStage.set(m.stage, [...(byStage.get(m.stage) ?? []), m]);
  }
  const out = new Map<string, KnockoutPairing>();
  for (const [stage, ms] of byStage) {
    pairingsInStage(stage, ms).forEach((p, i) => out.set(`${stage}#${pairingSlot(p) ?? i}`, p));
  }
  return out;
}

/** Resolve a node from its two sides and (if created) its pairing. */
function node(stage: string, slot: number, home: DrawSide, away: DrawSide, idx: Map<string, KnockoutPairing>): DrawNode {
  const pairing = idx.get(`${stage}#${slot}`);
  const base = { stage, slot, home, away, pairing };
  if (home.kind === 'bye' && away.kind === 'bye') return { ...base, winner: BYE, loser: BYE };
  if (home.kind === 'bye') return { ...base, winner: away, loser: BYE };
  if (away.kind === 'bye') return { ...base, winner: home, loser: BYE };
  if (home.kind === 'tbd' || away.kind === 'tbd' || !pairing) return { ...base, winner: TBD, loser: TBD };
  const w = pairingWinnerId(pairing);
  if (!w) return { ...base, winner: TBD, loser: TBD };
  const l = w === pairing.homeId ? pairing.awayId : pairing.homeId;
  return { ...base, winner: team(w), loser: team(l) };
}

const readyOf = (rounds: DrawRound[]): ReadyPair[] => {
  const out: ReadyPair[] = [];
  for (const r of rounds) for (const n of r.nodes) {
    if (!n.pairing && n.home.kind === 'team' && n.away.kind === 'team') out.push({ stage: n.stage, slot: n.slot, homeId: n.home.id, awayId: n.away.id });
  }
  return out;
};

/** Single-elimination tree from a seed list: `prefix1 … prefixK`. */
function singleTree(prefix: string, seeds: string[], idx: Map<string, KnockoutPairing>, label: (r: number, k: number) => string): DrawRound[] {
  const P = nextPow2(Math.max(2, seeds.length));
  const K = Math.log2(P);
  const pos = bracketSeedOrder(P);
  const side = (s: number): DrawSide => (s <= seeds.length ? team(seeds[s - 1]) : BYE);
  const rounds: DrawRound[] = [];
  let prev: DrawNode[] = [];
  for (let r = 1; r <= K; r++) {
    const stage = `${prefix}${r}`;
    const nodes: DrawNode[] = [];
    const count = P >> r;
    for (let i = 0; i < count; i++) {
      nodes.push(r === 1
        ? node(stage, i, side(pos[2 * i]), side(pos[2 * i + 1]), idx)
        : node(stage, i, prev[2 * i].winner, prev[2 * i + 1].winner, idx));
    }
    rounds.push({ stage, label: label(r, K), nodes });
    prev = nodes;
  }
  return rounds;
}

function readSeeds(matches: Match[], stage: string, key: string): string[] | null {
  for (const m of matches) {
    if (m.stage !== stage) continue;
    const raw = (m.format as Record<string, unknown> | undefined)?.[key];
    if (typeof raw !== 'string') continue;
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
    } catch { /* not a seed list */ }
  }
  return null;
}

/* ------------------------------ Double elimination ------------------------ */

/** Which winners'-round loser the i-th losers'-bracket survivor meets in a
 *  drop-in round: the whole order reversed after winners' rounds 2, 4, 6 …,
 *  reversed within each half after rounds 3, 5 …. A dropped team lands away
 *  from the part of the draw it came through, so a top-seeds-win draw has no
 *  rematch before the losers' semi-final (checked by simulation for 8–64
 *  entrants; with random results a few rematches are unavoidable). */
export function dropIndex(wbRound: number, count: number, i: number): number {
  if (count <= 1) return 0;
  if (wbRound % 2 === 0) return count - 1 - i;
  const h = count / 2;
  return i < h ? h - 1 - i : count - 1 - (i - h);
}

export interface DoubleElimState {
  seeds: string[];
  /** grand-final bracket reset: a losers'-side win in `gf` forces `gf2` */
  reset: boolean;
  winners: DrawRound[];
  losers: DrawRound[];
  final: DrawNode;
  /** the reset match — present only when it's needed */
  reset2?: DrawNode;
  championId?: string;
  ready: ReadyPair[];
  /** decided places: 1st/2nd from the grand final, 3rd = losers' final loser,
   *  4th = losers' semi loser, then each earlier losers' round shares a band */
  places: { teamId: string; position: number; shared: number }[];
}

const wbLabel = (r: number, k: number) => (r === k ? "Winners' final" : r === k - 1 ? "Winners' semi-finals" : `Winners' round ${r}`);
const lbLabel = (r: number, m: number) => (r === m ? "Losers' final" : r === m - 1 ? "Losers' semi-final" : `Losers' round ${r}`);

/** The double-elimination draw a tournament's matches describe, or null when
 *  they hold none (no `wb1` match with a seed list). */
export function doubleElimState(matches: Match[]): DoubleElimState | null {
  const seeds = readSeeds(matches, 'wb1', DE_SEEDS_KEY);
  if (!seeds || seeds.length < 3) return null;
  const reset = !matches.some((m) => m.stage === 'wb1' && (m.format as Record<string, unknown> | undefined)?.[DE_RESET_KEY] === false);
  const idx = indexPairings(matches, (s) => /^(wb|lb)\d+$/.test(s) || s === 'gf' || s === 'gf2');
  const winners = singleTree('wb', seeds, idx, wbLabel);
  const K = winners.length;
  const M = 2 * K - 2;
  const losers: DrawRound[] = [];
  let prev: DrawNode[] = [];
  for (let r = 1; r <= M; r++) {
    const stage = `lb${r}`;
    const nodes: DrawNode[] = [];
    if (r === 1) {
      const wl = winners[0].nodes.map((n) => n.loser);
      for (let i = 0; i < wl.length / 2; i++) nodes.push(node(stage, i, wl[2 * i], wl[2 * i + 1], idx));
    } else if (r % 2 === 0) {
      // drop-in: survivors v the losers of winners' round r/2 + 1
      const wbR = r / 2 + 1;
      const dropped = winners[wbR - 1].nodes.map((n) => n.loser);
      for (let i = 0; i < prev.length; i++) nodes.push(node(stage, i, prev[i].winner, dropped[dropIndex(wbR, dropped.length, i)], idx));
    } else {
      for (let i = 0; i < prev.length / 2; i++) nodes.push(node(stage, i, prev[2 * i].winner, prev[2 * i + 1].winner, idx));
    }
    losers.push({ stage, label: lbLabel(r, M), nodes });
    prev = nodes;
  }
  const wbChamp = winners[K - 1].nodes[0].winner;
  const lbChamp = losers.length ? losers[M - 1].nodes[0].winner : TBD;
  const final = node('gf', 0, wbChamp, lbChamp, idx);
  let reset2: DrawNode | undefined;
  let championId: string | undefined;
  let runnerUpId: string | undefined;
  if (final.winner.kind === 'team' && final.loser.kind === 'team') {
    const lbWon = lbChamp.kind === 'team' && final.winner.id === lbChamp.id;
    if (lbWon && reset) {
      reset2 = node('gf2', 0, final.home, final.away, idx);
      if (reset2.winner.kind === 'team' && reset2.loser.kind === 'team') { championId = reset2.winner.id; runnerUpId = reset2.loser.id; }
    } else { championId = final.winner.id; runnerUpId = final.loser.id; }
  }

  const ready = readyOf([...winners, ...losers, { stage: 'gf', label: 'Grand final', nodes: [final] }, ...(reset2 ? [{ stage: 'gf2', label: 'Grand final (reset)', nodes: [reset2] }] : [])]);

  const places: DoubleElimState['places'] = [];
  if (championId && runnerUpId) {
    places.push({ teamId: championId, position: 1, shared: 1 }, { teamId: runnerUpId, position: 2, shared: 1 });
  }
  let next = 3;
  for (let r = M; r >= 1; r--) {
    const real = losers[r - 1].nodes.filter((n) => n.home.kind !== 'bye' && n.away.kind !== 'bye');
    for (const n of real) if (n.loser.kind === 'team') places.push({ teamId: n.loser.id, position: next, shared: real.length });
    next += real.length;
  }
  return { seeds, reset, winners, losers, final, reset2, championId, ready, places };
}

/** The round-1 (winners' round 1) matches to create for a new double-elimination
 *  draw, with the format keys each one carries. Needs at least 3 entrants. */
export function doubleElimOpeners(seedIds: string[], reset = true): (ReadyPair & { extra: Record<string, string | number | boolean> })[] {
  if (seedIds.length < 3) return [];
  const st = doubleElimState(seedIds.length ? [fakeSeedMatch(seedIds, reset)] : []);
  if (!st) return [];
  return st.ready.filter((r) => r.stage === 'wb1').map((r) => ({
    ...r, extra: { [KO_SLOT_KEY]: r.slot, [DE_SEEDS_KEY]: JSON.stringify(seedIds), [DE_RESET_KEY]: reset },
  }));
}

/** A placeholder wb1 match carrying only the seed list — lets the openers
 *  reuse the state builder. Never saved. */
function fakeSeedMatch(seedIds: string[], reset: boolean): Match {
  return {
    id: '__seed__', sport: 'football', stage: 'wb1', status: 'scheduled', startsAt: '',
    homeTeam: { id: '__x__', name: '' }, awayTeam: { id: '__y__', name: '' },
    format: { [DE_SEEDS_KEY]: JSON.stringify(seedIds), [DE_RESET_KEY]: reset, [KO_SLOT_KEY]: -1 },
  } as unknown as Match;
}

/* ---------------------------------- Plate ---------------------------------- */

export interface PlateState {
  seeds: string[];
  rounds: DrawRound[];
  winnerId?: string;
  ready: ReadyPair[];
}

const plLabel = (r: number, k: number) => (r === k ? 'Plate final' : r === k - 1 ? 'Plate semi-finals' : `Plate round ${r}`);

/** The plate draw in a tournament's matches, or null when there is none. */
export function plateState(matches: Match[]): PlateState | null {
  const seeds = readSeeds(matches, 'pl1', PLATE_SEEDS_KEY);
  if (!seeds || seeds.length < 2) return null;
  const idx = indexPairings(matches, (s) => /^pl\d+$/.test(s));
  const rounds = singleTree('pl', seeds, idx, plLabel);
  const last = rounds[rounds.length - 1].nodes[0].winner;
  return { seeds, rounds, winnerId: last.kind === 'team' ? last.id : undefined, ready: readyOf(rounds) };
}

/** The plate's entrants: the losers of the main draw's first round, in bracket
 *  order — once every first-round tie is decided (else null). */
export function plateEntrants(firstRound: KnockoutRound | undefined): string[] | null {
  if (!firstRound) return null;
  const ps = firstRound.pairings;
  if (!ps.length) return null;
  const losers: string[] = [];
  for (const p of ps) {
    const w = pairingWinnerId(p);
    if (!w) return null;
    losers.push(w === p.homeId ? p.awayId : p.homeId);
  }
  return losers;
}

/** The plate's first-round matches to create (byes to the first entrants when
 *  the count isn't a power of two), with their format keys. */
export function plateOpeners(entrantIds: string[]): (ReadyPair & { extra: Record<string, string | number | boolean> })[] {
  if (entrantIds.length < 2) return [];
  const idx = new Map<string, KnockoutPairing>();
  const rounds = singleTree('pl', entrantIds, idx, plLabel);
  return readyOf(rounds.slice(0, 1)).map((r) => ({ ...r, extra: { [KO_SLOT_KEY]: r.slot, [PLATE_SEEDS_KEY]: JSON.stringify(entrantIds) } }));
}

// Test/inspection hook (parity with the other engines).
(globalThis as unknown as Record<string, unknown>).__sportfolioElimDraws = { doubleElimState, doubleElimOpeners, plateState, plateEntrants, plateOpeners, dropIndex };

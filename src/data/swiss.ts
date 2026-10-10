/** Swiss-system pairing (pure, dependency-free). Everyone plays a fixed number of
 *  rounds; nobody is eliminated. Final ranking is the standings table (points,
 *  then tie-breakers) — no bracket.
 *
 *  SD-26 — an in-app approximation of the FIDE Dutch system (C.04.3), labelled
 *  "not FIDE-certified" in the app (decision D7):
 *   • players are ranked by score, then pairing number (initial seed order);
 *   • each score group (with anyone floated down from above) is split in half
 *     and the top half meets the bottom half (S1 v S2: 1 v 5, 2 v 6 …), trying
 *     the Dutch transpositions / exchanges in order when that would repeat a
 *     game or clash on colours;
 *   • an odd group floats its lowest player down to the next group;
 *   • nobody meets the same opponent twice (unless the field has run out of
 *     new opponents — then a repeat is the last resort);
 *   • colours follow each player's history: absolute (colour difference
 *     beyond ±1, or the same colour twice running) → never broken; strong
 *     (difference ±1) and mild (alternate) → granted where possible, the
 *     pairing with the fewest broken preferences wins; then the FIDE colour
 *     allocation (both preferences, the stronger one, alternate to the last
 *     round where they differed, the higher-ranked player's);
 *   • an odd field: the bye goes to the lowest-ranked player who has not had
 *     one (nor a forfeit win), as long as the rest can still be paired;
 *   • round 1: seed order, top half v bottom half, a coin toss gives the top
 *     seed's colour and boards alternate.
 *  Not modelled: the full C.04.3 quality criteria (upfloat / downfloat
 *  history, top-scorer exceptions, the exact exchange order), accelerated
 *  pairings, requested byes. The caller schedules `pairings` (home = the
 *  higher-ranked player, `white` = who has White) and records `byeId`. */
import type { GeneratedPairing } from './fixtures';

/** Order-independent key for a pair, to detect rematches. */
export const pairKey = (a: string, b: string) => [a, b].sort().join('|');

export type Colour = 'W' | 'B';

/** A Swiss pairing: home is the higher-ranked player; `white` says who has
 *  White (chess writes it into the fixture; other sports ignore it). */
export interface SwissPairing extends GeneratedPairing { white: 'home' | 'away' }

export interface SwissRound {
  pairings: SwissPairing[];
  /** the entrant sitting out this round (odd field), if any */
  byeId?: string;
  /** set when no pairing met every rule: 'colours' = someone gets a colour
   *  against an absolute preference (three in a row / imbalance > 2);
   *  'repeat' = a rematch was unavoidable */
  relaxed?: 'colours' | 'repeat';
}

/** One entrant as the pairing sees them. */
export interface SwissPlayer {
  id: string;
  /** current score (points, bye points included) */
  score: number;
  /** pairing number: 1 = top seed */
  rank: number;
  /** everyone they have already been paired with */
  opponents: Set<string>;
  /** colours of the games played over the board, oldest first */
  colours: Colour[];
  /** had a pairing-allocated bye or a forfeit win (FIDE: no second bye) */
  hadBye: boolean;
}

interface Pref { colour?: Colour; strength: 0 | 1 | 2 | 3; diff: number }

/** FIDE C.04.1 colour preference: absolute (|W − B| > 1, or the same colour
 *  in the last two games), strong (|W − B| = 1), mild (alternate), none. */
export function colourPreference(colours: Colour[]): Pref {
  if (!colours.length) return { strength: 0, diff: 0 };
  const diff = colours.filter((c) => c === 'W').length - colours.filter((c) => c === 'B').length;
  const last = colours[colours.length - 1];
  const other: Colour = last === 'W' ? 'B' : 'W';
  if (diff < -1) return { colour: 'W', strength: 3, diff };
  if (diff > 1) return { colour: 'B', strength: 3, diff };
  if (colours.length >= 2 && colours[colours.length - 2] === last) return { colour: other, strength: 3, diff };
  if (diff === -1) return { colour: 'W', strength: 2, diff };
  if (diff === 1) return { colour: 'B', strength: 2, diff };
  return { colour: other, strength: 1, diff };
}

/** How strict a pairing attempt is: 0 = no repeats, no absolute colour clash;
 *  1 = colour clashes allowed; 2 = repeats allowed too (last resort). */
type Level = 0 | 1 | 2;

interface Ctx { level: Level; prefs: Map<string, Pref> }

function compatible(a: SwissPlayer, b: SwissPlayer, c: Ctx): boolean {
  if (a.id === b.id) return false;
  if (c.level < 2 && a.opponents.has(b.id)) return false;
  if (c.level < 1) {
    const pa = c.prefs.get(a.id)!, pb = c.prefs.get(b.id)!;
    if (pa.strength === 3 && pb.strength === 3 && pa.colour === pb.colour) return false;
  }
  return true;
}

/** The cost of a pair: broken colour preferences (mild 1, strong 4,
 *  absolute 40) and a repeat (1000). */
function pairCost(a: SwissPlayer, b: SwissPlayer, c: Ctx): number {
  let cost = a.opponents.has(b.id) ? 1000 : 0;
  const pa = c.prefs.get(a.id)!, pb = c.prefs.get(b.id)!;
  if (pa.colour && pa.colour === pb.colour) {
    const weaker = Math.min(pa.strength, pb.strength);
    cost += weaker === 3 ? 40 : weaker === 2 ? 4 : 1;
  }
  return cost;
}

/** Can these players all be paired (any order) under the level's rules? */
function canPairAll(ps: SwissPlayer[], c: Ctx): boolean {
  if (ps.length % 2) return false;
  const n = ps.length;
  const memo = n <= 30 ? new Set<number>() : null;
  let budget = 200000;
  const go = (mask: number, used: boolean[]): boolean => {
    let i = 0;
    while (i < n && used[i]) i++;
    if (i === n) return true;
    if (memo?.has(mask)) return false;
    if (--budget < 0) return true; // give up proving infeasible: assume it pairs
    used[i] = true;
    for (let j = i + 1; j < n; j++) {
      if (used[j] || !compatible(ps[i], ps[j], c)) continue;
      used[j] = true;
      if (go(mask | (1 << i) | (1 << j), used)) { used[j] = false; used[i] = false; return true; }
      used[j] = false;
    }
    used[i] = false;
    memo?.add(mask);
    return false;
  };
  return go(0, new Array(n).fill(false));
}

/** Combinations of `k` of 0..n-1 in lexicographic order (the S1 line-ups to
 *  try: first the natural top half, then exchanges with the bottom half). */
function* combos(n: number, k: number): Generator<number[]> {
  const idx = Array.from({ length: k }, (_, i) => i);
  if (k > n) return;
  while (true) {
    yield [...idx];
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

interface BracketResult { pairs: [SwissPlayer, SwissPlayer][]; down: SwissPlayer[]; cost: number }

/** Pair one bracket (sorted best first): as many pairs as possible, S1 v S2
 *  in Dutch order, the fewest broken colour preferences, the leftovers float
 *  down — and only if everyone below can still be paired. */
function pairBracket(br: SwissPlayer[], rest: SwissPlayer[], last: boolean, c: Ctx, nFloat = 0): BracketResult | null {
  // A heterogeneous bracket (players floated down from above): each floater
  // meets the best resident it can (S1 = floaters, S2 = residents), then the
  // remaining residents are paired as a normal bracket.
  if (nFloat > 0 && nFloat <= br.length - nFloat) {
    const mdps = br.slice(0, nFloat), res = br.slice(nFloat);
    let best: BracketResult | null = null;
    let nodes = 0;
    const used = new Array(res.length).fill(false);
    const pairs: [SwissPlayer, SwissPlayer][] = [];
    const go = (i: number, cost: number): boolean => {
      if (++nodes > 20000) return true;
      if (best && cost >= best.cost) return false;
      if (i === mdps.length) {
        const sub = pairBracket(res.filter((_, j) => !used[j]), rest, last, c);
        if (!sub || (best && cost + sub.cost >= best.cost)) return false;
        best = { pairs: [...pairs, ...sub.pairs], down: sub.down, cost: cost + sub.cost };
        return best.cost === 0;
      }
      for (let j = 0; j < res.length; j++) {
        if (used[j] || !compatible(mdps[i], res[j], c)) continue;
        const pc = pairCost(mdps[i], res[j], c);
        used[j] = true; pairs.push([mdps[i], res[j]]);
        const stop = go(i + 1, cost + pc);
        used[j] = false; pairs.pop();
        if (stop) return true;
      }
      return false;
    };
    go(0, 0);
    if (best) return best;
  }
  const n = br.length;
  for (let p = Math.floor(n / 2); p >= (last ? n / 2 : 0); p--) {
    let best: BracketResult | null = null;
    let nodes = 0;
    let s1Tries = 0;
    for (const s1Idx of combos(n, p)) {
      if (++s1Tries > 400 || nodes > 40000) break;
      const inS1 = new Set(s1Idx);
      const s1 = s1Idx.map((i) => br[i]);
      const s2 = br.filter((_, i) => !inS1.has(i));
      const used = new Array(s2.length).fill(false);
      const pairs: [SwissPlayer, SwissPlayer][] = [];
      let cost = 0;
      const assign = (i: number): boolean => {
        if (++nodes > 40000) return true;
        if (i === p) {
          const down = s2.filter((_, j) => !used[j]);
          if (last && down.length) return false;
          if (best && cost >= best.cost) return false;
          if (!canPairAll([...down, ...rest], c)) return false;
          best = { pairs: [...pairs], down, cost };
          return cost === 0; // perfect: stop searching
        }
        // S1[i]'s Dutch partner is S2[i]; then the next ones down, then up.
        const order = [...s2.keys()].sort((x, y) => (x >= i ? 0 : 1) - (y >= i ? 0 : 1) || (x >= i ? x - y : y - x));
        for (const j of order) {
          if (used[j] || !compatible(s1[i], s2[j], c)) continue;
          const pc = pairCost(s1[i], s2[j], c);
          if (best && cost + pc >= best.cost) continue;
          used[j] = true; pairs.push([s1[i], s2[j]]); cost += pc;
          const stop = assign(i + 1);
          used[j] = false; pairs.pop(); cost -= pc;
          if (stop) return true;
        }
        return false;
      };
      if (assign(0) && best && (best as { cost: number }).cost === 0) break;
    }
    if (best) return best;
  }
  return null;
}

/** Pair a sorted, even field bracket by bracket (score groups, floaters). */
function pairField(field: SwissPlayer[], c: Ctx): [SwissPlayer, SwissPlayer][] | null {
  if (!canPairAll(field, c)) return null;
  const groups: SwissPlayer[][] = [];
  for (const p of field) {
    const g = groups[groups.length - 1];
    if (g && g[0].score === p.score) g.push(p); else groups.push([p]);
  }
  const out: [SwissPlayer, SwissPlayer][] = [];
  let down: SwissPlayer[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const br = [...down, ...groups[gi]];
    const rest = groups.slice(gi + 1).flat();
    const res = pairBracket(br, rest, gi === groups.length - 1, c, down.length);
    if (!res) return null;
    out.push(...res.pairs);
    down = res.down;
  }
  return down.length ? null : out;
}

const byRank = (a: SwissPlayer, b: SwissPlayer) => b.score - a.score || a.rank - b.rank;

/** FIDE colour allocation for a pair (C.04.3 E): `a` is the higher-ranked.
 *  Returns who gets White. `board` (0-based) and `initial` decide when
 *  neither player has a preference (round 1: the coin toss, boards alternate). */
export function allocateColours(a: SwissPlayer, b: SwissPlayer, board: number, initial: Colour): 'a' | 'b' {
  const pa = colourPreference(a.colours), pb = colourPreference(b.colours);
  const give = (x: 'a' | 'b', col: Colour): 'a' | 'b' => (col === 'W' ? x : x === 'a' ? 'b' : 'a');
  if (!pa.colour && !pb.colour) return give('a', board % 2 === 0 ? initial : initial === 'W' ? 'B' : 'W');
  if (pa.colour && !pb.colour) return give('a', pa.colour);
  if (pb.colour && !pa.colour) return give('b', pb.colour);
  if (pa.colour !== pb.colour) return give('a', pa.colour!);
  // Same preference: the stronger one (both absolute: the wider difference).
  if (pa.strength !== pb.strength) return pa.strength > pb.strength ? give('a', pa.colour!) : give('b', pb.colour!);
  if (pa.strength === 3 && Math.abs(pa.diff) !== Math.abs(pb.diff))
    return Math.abs(pa.diff) > Math.abs(pb.diff) ? give('a', pa.colour!) : give('b', pb.colour!);
  // Alternate to the most recent game where their colours differed.
  for (let k = 1; k <= Math.min(a.colours.length, b.colours.length); k++) {
    const ca = a.colours[a.colours.length - k], cb = b.colours[b.colours.length - k];
    if (ca !== cb) return give('a', ca === 'W' ? 'B' : 'W');
  }
  return give('a', pa.colour!);
}

/**
 * Pair one Swiss round (Dutch approximation, see the header). `initial` is the
 * coin-toss colour of the top board's higher-ranked player when neither has a
 * preference (round 1).
 */
export function swissPairRound(players: SwissPlayer[], round: number, initial: Colour = 'W'): SwissRound {
  const sorted = [...players].sort(byRank);
  const prefs = new Map(sorted.map((p) => [p.id, colourPreference(p.colours)]));
  const levels: Level[] = [0, 1, 2];
  let byeId: string | undefined;
  let pairs: [SwissPlayer, SwissPlayer][] | null = null;
  let relaxed: SwissRound['relaxed'];
  for (const level of levels) {
    const c: Ctx = { level, prefs };
    if (sorted.length % 2 === 1) {
      // Bye: the lowest-ranked without one whose absence leaves a pairable field.
      const order = [...sorted].reverse();
      const cands = [...order.filter((p) => !p.hadBye), ...(level === 2 ? order.filter((p) => p.hadBye) : [])];
      for (const cand of cands) {
        const rest = sorted.filter((p) => p !== cand);
        const res = pairField(rest, c);
        if (res) { byeId = cand.id; pairs = res; break; }
      }
    } else {
      pairs = pairField(sorted, c);
    }
    if (pairs) { relaxed = level > 0 ? (level === 1 ? 'colours' : 'repeat') : undefined; break; }
  }
  if (!pairs) return { pairings: [], byeId, relaxed: 'repeat' };
  // Boards: higher score first, then the higher-ranked player's pairing number.
  const boards = pairs
    .map(([x, y]) => (byRank(x, y) <= 0 ? [x, y] : [y, x]) as [SwissPlayer, SwissPlayer])
    .sort((p, q) => byRank(p[0], q[0]));
  return {
    byeId, ...(relaxed ? { relaxed } : {}),
    pairings: boards.map(([a, b], i) => ({ homeId: a.id, awayId: b.id, round, white: allocateColours(a, b, i, initial) === 'a' ? 'home' : 'away' })),
  };
}

/** Round 1: seed order, top half v bottom half (1 v h+1, 2 v h+2 …). An odd
 *  field gives the bye to the lowest seed (FIDE). `initial` = the coin toss:
 *  the top seed's colour; boards alternate. */
export function swissRound1(seedIds: string[], initial: Colour = 'W'): SwissRound {
  const ids = [...new Set(seedIds)];
  return swissPairRound(ids.map((id, i) => ({ id, score: 0, rank: i + 1, opponents: new Set(), colours: [], hadBye: false })), 1, initial);
}

/**
 * A later round from a plain ranking (no scores or colours known — every
 * entrant in one group, ranked by `orderedIds`). `played` holds pairKeys
 * already contested; `priorByes` are entrants who've had a bye. Kept for
 * callers without the full history; the screen uses `swissPairRound`.
 */
export function swissNextRound(orderedIds: string[], played: Set<string>, round: number, priorByes: Set<string> = new Set()): SwissRound {
  const ids = [...new Set(orderedIds)];
  const opp = new Map(ids.map((id) => [id, new Set<string>()]));
  for (const k of played) {
    const [a, b] = k.split('|');
    opp.get(a)?.add(b); opp.get(b)?.add(a);
  }
  return swissPairRound(ids.map((id, i) => ({ id, score: 0, rank: i + 1, opponents: opp.get(id)!, colours: [], hadBye: priorByes.has(id) })), round);
}

/** Recommended number of rounds for a field size (enough to separate a clear
 *  winner): ceil(log2(n)), min 3. */
export function suggestedSwissRounds(n: number): number {
  return Math.max(3, Math.ceil(Math.log2(Math.max(2, n))));
}

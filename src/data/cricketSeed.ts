/**
 * Seeded ball-by-ball event logs for the DEMO's *completed* cricket matches.
 *
 * Cricket match state (scorecard, ratings, result) is rebuilt by replaying an
 * append-only event log through the sport's pure reducer — exactly like the
 * football World Cup seeds. A completed match with no log replays to the empty
 * initial state (`ended: false`), so its Summary shows the pre-match placeholder
 * even though the fixture reads FINAL. This module deterministically GENERATES a
 * full, coherent innings log for each completed cricket fixture so it replays to
 * the real final total with `ended: true` — a populated batting/bowling card,
 * an MVP and player ratings included.
 *
 * The generator only emits actions the reducer understands (`SET_STRIKER`,
 * `SET_NONSTRIKER`, `RUNS`, `WICKET`); the reducer itself handles strike
 * rotation, over changes, the innings switch and the match end. `cricketSeed`'s
 * companion test replays every log through the real plugin and asserts the exact
 * totals — so a drift in the reducer or a bad script fails CI, never the demo.
 */
import type { MatchEventRecord, MatchSquads } from '../core/types';

interface P { id: string; name: string }

// House cricket squads (8-a-side, matching the demo rosters in demoStore).
const RED: P[] = [
  { id: 'p-aarav', name: 'Aarav Mehta' }, { id: 'p-rohan', name: 'Rohan Nair' },
  { id: 'p-neil', name: 'Neil Kapoor' }, { id: 'p-vikram', name: 'Vikram Rao' },
  { id: 'p-suresh', name: 'Suresh Pillai' }, { id: 'p-manoj', name: 'Manoj Kumar' },
  { id: 'p-deepak', name: 'Deepak Shetty' }, { id: 'p-farhan', name: 'Farhan Khan' },
];
const BLUE: P[] = [
  { id: 'p-ishaan', name: 'Ishaan Verma' }, { id: 'p-veer', name: 'Veer Chauhan' },
  { id: 'p-sanjay', name: 'Sanjay Menon' }, { id: 'p-rahul', name: 'Rahul Dev' },
  { id: 'p-imran', name: 'Imran Sheikh' }, { id: 'p-gaurav', name: 'Gaurav Joshi' },
  { id: 'p-naveen', name: 'Naveen Reddy' }, { id: 'p-tarun', name: 'Tarun Bhat' },
];
const GREEN: P[] = [
  { id: 'p-gh-1', name: 'Rahul Gupta' }, { id: 'p-gh-2', name: 'Vikas Shetty' },
  { id: 'p-gh-3', name: 'Sandeep Rao' }, { id: 'p-gh-4', name: 'Manish Kumar' },
  { id: 'p-gh-5', name: 'Prakash Hegde' }, { id: 'p-gh-6', name: 'Girish Naik' },
  { id: 'p-gh-7', name: 'Suhas Pai' }, { id: 'p-gh-8', name: 'Lokesh Gowda' },
];
const GOLD: P[] = [
  { id: 'p-yh-1', name: 'Imran Pasha' }, { id: 'p-yh-2', name: 'Naveen Shetty' },
  { id: 'p-yh-3', name: 'Ravi Teja' }, { id: 'p-yh-4', name: 'Sunil Rao' },
  { id: 'p-yh-5', name: 'Ganesh Hegde' }, { id: 'p-yh-6', name: 'Mahesh Naik' },
  { id: 'p-yh-7', name: 'Deepa Shetty' }, { id: 'p-yh-8', name: 'Kiran Joshi' },
];

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Per-ball scoring outcomes for one innings that sum EXACTLY to `target` over
 *  `n` deliveries, shaped like a real innings. Each ball is sampled from a
 *  weighted menu (0/1/2/3/4/6) whose weights shift toward the boundary as the
 *  required run rate climbs — but a **single stays the most common scoring
 *  shot** at every rate, so the ball-by-ball reads naturally (not a wall of
 *  twos or sixes). A seeded PRNG keeps it varied yet reproducible; a final pass
 *  nudges a few balls up/down the allowed ladder to land the exact total. */
function makeScores(n: number, target: number): number[] {
  const rate = target / n;
  // Deterministic PRNG (LCG) — varied per innings via target/n, no Math.random.
  let s = (target * 131 + n * 17 + 1013904223) >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

  // Outcome weights: dots thin out and boundaries thicken as the rate rises,
  // but singles (p1, the remainder) stay dominant among scoring shots.
  const pDot = clamp(0.34 - rate * 0.09, 0.06, 0.34);
  const p4 = clamp(0.04 + rate * 0.075, 0.04, 0.26);
  const p6 = clamp(0.005 + rate * 0.035, 0.005, 0.13);
  const p2 = 0.18, p3 = 0.035; // twos comfortably out-weigh threes (as in real cricket)
  const p1 = Math.max(0.05, 1 - pDot - p2 - p3 - p4 - p6);
  const menu: [number, number][] = [[0, pDot], [1, p1], [2, p2], [3, p3], [4, p4], [6, p6]];
  const sample = (): number => {
    let r = rnd();
    for (const [v, p] of menu) if ((r -= p) <= 0) return v;
    return 1;
  };

  const scores = Array.from({ length: n }, sample);
  // Land the exact target by nudging scattered balls one step along the allowed
  // outcome ladder (0→1→2→3→4→6) — never creating an impossible 5.
  const UP: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 6, 6: 6 };
  const DN: Record<number, number> = { 6: 4, 4: 3, 3: 2, 2: 1, 1: 0, 0: 0 };
  let diff = target - scores.reduce((a, b) => a + b, 0);
  for (let guard = 0; diff !== 0 && guard < n * 80; guard++) {
    const j = Math.floor(rnd() * n);
    if (diff > 0) { const nv = UP[scores[j]], d = nv - scores[j]; if (d > 0 && d <= diff) { scores[j] = nv; diff -= d; } }
    else { const nv = DN[scores[j]], d = scores[j] - nv; if (d > 0 && d <= -diff) { scores[j] = nv; diff += d; } }
  }
  // The correction pass can push 2s up to 3s; real cricket has more 2s than 3s.
  // Trade a three+single for two twos (sum-preserving) until 2s ≥ 3s.
  const tally = (v: number) => scores.reduce((c, x) => c + (x === v ? 1 : 0), 0);
  for (let guard = 0; tally(3) > tally(2) && guard < n; guard++) {
    const i3 = scores.indexOf(3), i1 = scores.indexOf(1);
    if (i3 < 0 || i1 < 0) break;
    scores[i3] = 2;
    scores[i1] = 2;
  }
  return scores;
}

interface InningsPlan {
  side: 'home' | 'away';
  batters: P[];      // batting order (needs ≥ wickets + 2)
  bowlers: P[];      // opposition bowlers (rotate per over, no two in a row)
  overs: number;
  ballsPerOver: number;
  target: number;    // exact runs to make this innings
  wickets: number;   // wickets to lose (< batters.length - 1)
}

/** Emit a coherent innings as reducer events, returning the running seq. */
function buildInnings(plan: InningsPlan, seq: number, out: MatchEventRecord[]): number {
  const { side, batters, bowlers, overs, ballsPerOver, target, wickets } = plan;
  const totalBalls = overs * ballsPerOver;
  const scoringBalls = totalBalls - wickets;
  const scores = makeScores(scoringBalls, target);

  // Wicket-fall positions, spread roughly evenly through the innings (never on
  // the very last ball, so the incoming batter always faces a delivery).
  const wicketAt = new Set<number>();
  for (let w = 1; w <= wickets; w++) {
    wicketAt.add(Math.min(totalBalls - 2, Math.round((totalBalls * w) / (wickets + 1))));
  }

  const push = (type: string, payload: Record<string, unknown>) =>
    out.push({ seq: ++seq, type, side, payload, attribution: null });

  // Openers.
  let strikerPos = 0;
  const crease: P[] = [batters[0], batters[1]];
  let nextBat = 2;
  push('SET_STRIKER', { id: crease[0].id, name: crease[0].name });
  push('SET_NONSTRIKER', { id: crease[1].id, name: crease[1].name });

  let scoreIdx = 0;
  let ballsInOver = 0;
  let bowlerIdx = -1;
  let bowler: P = bowlers[0];
  const pickBowler = () => {
    // Next bowler in rotation, never the same one two overs running.
    bowlerIdx = (bowlerIdx + 1) % bowlers.length;
    bowler = bowlers[bowlerIdx];
  };
  pickBowler();

  for (let ball = 0; ball < totalBalls; ball++) {
    if (ballsInOver === ballsPerOver) { ballsInOver = 0; pickBowler(); }
    const striker = crease[strikerPos];
    const overEnd = ballsInOver + 1 === ballsPerOver;

    if (wicketAt.has(ball)) {
      // Make sure the reducer dismisses the batter we intend (state striker).
      push('SET_STRIKER', { id: striker.id, name: striker.name });
      const nb = batters[nextBat++];
      const caught = ball % 2 === 0;
      push('WICKET', {
        kind: caught ? 'caught' : 'bowled',
        bowlerId: bowler.id, bowlerName: bowler.name,
        fielderName: caught ? bowlers[(bowlerIdx + 1) % bowlers.length].name : undefined,
        newBatId: nb.id, newBatName: nb.name,
      });
      crease[strikerPos] = nb; // new batter takes the striker's end
      ballsInOver += 1;
      continue;
    }

    const r = scores[scoreIdx++];
    push('RUNS', { runs: r, strikerId: striker.id, strikerName: striker.name, bowlerId: bowler.id, bowlerName: bowler.name });
    // Strike rotation mirrors the reducer: odd runs and over-ends swap ends (both
    // together cancel out — XOR).
    if ((r % 2 === 1) !== overEnd) strikerPos ^= 1;
    ballsInOver += 1;
  }
  return seq;
}

interface MatchPlan {
  id: string;
  overs: number;
  players: number; // players/side (drives the reducer's wickets limit)
  first: { side: 'home' | 'away'; batters: P[]; bowlers: P[]; runs: number; wickets: number };
  second: { side: 'home' | 'away'; batters: P[]; bowlers: P[]; runs: number; wickets: number };
}

// Bowlers = the opposition's lower order (5 bowlers), so figures look plausible.
const attack = (squad: P[]): P[] => squad.slice(3, 8);

function buildMatch(m: MatchPlan): MatchEventRecord[] {
  const events: MatchEventRecord[] = [];
  const bpo = 6;
  let seq = buildInnings(
    { side: m.first.side, batters: m.first.batters, bowlers: m.first.bowlers, overs: m.overs, ballsPerOver: bpo, target: m.first.runs, wickets: m.first.wickets },
    0, events,
  );
  buildInnings(
    { side: m.second.side, batters: m.second.batters, bowlers: m.second.bowlers, overs: m.overs, ballsPerOver: bpo, target: m.second.runs, wickets: m.second.wickets },
    seq, events,
  );
  return events;
}

// The four completed cricket fixtures (home bats first and defends its total).
//  ck1/ck2: Annual Sports Meet (t1) — 10 overs, 8-a-side.
//  s6/s7:   Karnataka State Cup (t3) — 15 overs, 11-a-side (8 named batters).
const PLANS: MatchPlan[] = [
  { id: 'ck1', overs: 10, players: 8, first: { side: 'home', batters: RED, bowlers: attack(GOLD), runs: 118, wickets: 5 }, second: { side: 'away', batters: GOLD, bowlers: attack(RED), runs: 104, wickets: 6 } },
  { id: 'ck2', overs: 10, players: 8, first: { side: 'home', batters: BLUE, bowlers: attack(GREEN), runs: 124, wickets: 5 }, second: { side: 'away', batters: GREEN, bowlers: attack(BLUE), runs: 110, wickets: 6 } },
  { id: 's6', overs: 15, players: 11, first: { side: 'home', batters: RED, bowlers: attack(BLUE), runs: 156, wickets: 6 }, second: { side: 'away', batters: BLUE, bowlers: attack(RED), runs: 142, wickets: 6 } },
  { id: 's7', overs: 15, players: 11, first: { side: 'home', batters: GOLD, bowlers: attack(GREEN), runs: 133, wickets: 5 }, second: { side: 'away', batters: GREEN, bowlers: attack(GOLD), runs: 121, wickets: 6 } },
];

/** matchId → replayable event log, one per completed cricket fixture. */
export const CRICKET_MATCH_EVENTS: Record<string, MatchEventRecord[]> =
  Object.fromEntries(PLANS.map((p) => [p.id, buildMatch(p)]));

/** The fixtures covered, with their expected final totals (drives the test). */
export const CRICKET_SEED_EXPECT = PLANS.map((p) => ({
  id: p.id, overs: p.overs, players: p.players,
  home: p.first.side === 'home' ? p.first.runs : p.second.runs,
  away: p.first.side === 'home' ? p.second.runs : p.first.runs,
  homeWkts: p.first.side === 'home' ? p.first.wickets : p.second.wickets,
  awayWkts: p.first.side === 'home' ? p.second.wickets : p.first.wickets,
}));

// The live demo fixture (m8, Red vs Blue, 10-over t1): Red batting first, part-way
// through the innings, so the cricket live view opens onto a real in-progress card
// instead of 0/0.
export const LIVE = { id: 'm8', runs: 78, wickets: 3, balls: 45, overs: 10, players: 8 };

/** Mirrors buildInnings but sets a bowler per over (so the live view shows the
 *  current bowler), stops mid-over, and pins the current striker/non-striker so
 *  the card shows who's at the crease. */
function buildLiveInnings(): MatchEventRecord[] {
  const out: MatchEventRecord[] = [];
  const bpo = 6;
  const batters = RED, bowlers = attack(BLUE);
  const scoringBalls = LIVE.balls - LIVE.wickets;
  const scores = makeScores(scoringBalls, LIVE.runs);
  const wicketAt = new Set([12, 24, 33]); // spread, none on an over boundary or the tail
  let seq = 0;
  const push = (type: string, payload: Record<string, unknown>) =>
    out.push({ seq: ++seq, type, side: 'home', payload, attribution: null });

  let strikerPos = 0;
  const crease: P[] = [batters[0], batters[1]];
  let nextBat = 2;
  push('SET_STRIKER', { id: crease[0].id, name: crease[0].name });
  push('SET_NONSTRIKER', { id: crease[1].id, name: crease[1].name });

  let scoreIdx = 0, ballsInOver = 0, bowlerIdx = -1;
  const nextBowler = () => { bowlerIdx = (bowlerIdx + 1) % bowlers.length; return bowlers[bowlerIdx]; };
  let bowler = nextBowler();
  push('SET_BOWLER', { id: bowler.id, name: bowler.name });

  for (let ball = 0; ball < LIVE.balls; ball++) {
    if (ballsInOver === bpo) { ballsInOver = 0; bowler = nextBowler(); push('SET_BOWLER', { id: bowler.id, name: bowler.name }); }
    const striker = crease[strikerPos];
    const overEnd = ballsInOver + 1 === bpo;
    if (wicketAt.has(ball)) {
      push('SET_STRIKER', { id: striker.id, name: striker.name });
      const nb = batters[nextBat++];
      const caught = ball % 2 === 0;
      push('WICKET', {
        kind: caught ? 'caught' : 'bowled', bowlerId: bowler.id, bowlerName: bowler.name,
        fielderName: caught ? bowlers[(bowlerIdx + 1) % bowlers.length].name : undefined,
        newBatId: nb.id, newBatName: nb.name,
      });
      crease[strikerPos] = nb;
      if (overEnd) strikerPos ^= 1;
      ballsInOver += 1;
      continue;
    }
    const r = scores[scoreIdx++];
    push('RUNS', { runs: r, strikerId: striker.id, strikerName: striker.name, bowlerId: bowler.id, bowlerName: bowler.name });
    if ((r % 2 === 1) !== overEnd) strikerPos ^= 1;
    ballsInOver += 1;
  }
  // Pin the current crease so the live card shows who's batting now.
  push('SET_STRIKER', { id: crease[strikerPos].id, name: crease[strikerPos].name });
  push('SET_NONSTRIKER', { id: crease[1 - strikerPos].id, name: crease[1 - strikerPos].name });
  return out;
}

/** matchId → replayable event log for the in-progress live cricket fixture. */
export const CRICKET_LIVE_EVENTS: Record<string, MatchEventRecord[]> = { [LIVE.id]: buildLiveInnings() };

/** Matchday XIs for the live fixture (m8) so its Info reads "✓ XI set" — the 8
 *  Red/Blue players already in the seeded scorecard, in batting order. */
export const CRICKET_LIVE_SQUADS: Record<string, MatchSquads> = {
  [LIVE.id]: {
    home: { starters: RED.map((p) => p.id), subs: [] },
    away: { starters: BLUE.map((p) => p.id), subs: [] },
  },
};

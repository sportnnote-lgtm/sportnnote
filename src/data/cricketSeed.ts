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
import type { MatchEventRecord } from '../core/types';

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

/** Scoring outcomes (per legal ball) that sum EXACTLY to `target` over
 *  `scoringBalls` deliveries. Starts every ball at a single, then upgrades to
 *  boundaries until the target is met — deterministic and exact. */
function makeScores(scoringBalls: number, target: number): number[] {
  const scores = new Array(scoringBalls).fill(1);
  let rem = target - scoringBalls; // singles baseline
  // Scatter the upgrades across the innings (stride by an odd step) so runs
  // don't all land on the openers — keeps the batting card believable.
  const step = 7;
  let k = 0;
  while (rem > 0) {
    const i = (k * step) % scoringBalls;
    const add = rem >= 5 ? 5 : rem >= 3 ? 3 : rem; // 1→6, 1→4, or a small bump
    scores[i] += add;
    rem -= add;
    k += 1;
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
  { id: 'ck1', overs: 10, players: 8, first: { side: 'home', batters: RED, bowlers: attack(GOLD), runs: 148, wickets: 5 }, second: { side: 'away', batters: GOLD, bowlers: attack(RED), runs: 132, wickets: 6 } },
  { id: 'ck2', overs: 10, players: 8, first: { side: 'home', batters: BLUE, bowlers: attack(GREEN), runs: 165, wickets: 5 }, second: { side: 'away', batters: GREEN, bowlers: attack(BLUE), runs: 150, wickets: 6 } },
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

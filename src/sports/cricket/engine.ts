/**
 * Cricket engine — the pure, JSX-free core of the cricket plugin: the state
 * shape, initial state, and the ball-by-ball reducer (with its scorecard,
 * super-over and result helpers). Split out of index.tsx so it can be unit- and
 * replay-tested under `node --test` (which can't type-strip the .tsx component
 * file), mirroring kabaddi's rules.ts and the DLS module. index.tsx re-imports
 * everything it needs from here.
 */
import type { ScoreAction } from '../types';
import type { LiveEvent } from '../liveEvents';
// NB: explicit .ts extension — lets Node's test runner load this engine (it does
// not do extensionless resolution); tsc (bundler resolution) and Metro both
// accept it too.
import { resourcePct, revisedTarget } from './dls.ts';

interface Innings {
  runs: number;
  wickets: number;
  balls: number;
  extras: number;
}
interface BatCard {
  name: string;
  side: 'home' | 'away';
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  /** left the field injured (not out — may resume later) */
  retired?: boolean;
  /** how they got out, e.g. "b Varun"; or "retired hurt"; undefined while batting */
  dismissal?: string;
}
interface BowlCard {
  name: string;
  side: 'home' | 'away';
  runs: number;
  balls: number;
  wickets: number;
  dots: number;
  /** wides + no-balls conceded — a small rating penalty */
  extras: number;
}

/** A record of each dismissal, for the post-match performance ratings. */
interface DismissalRecord {
  kind: DismissalKind;
  outId?: string;
  bowlerId?: string;
  fielderId?: string;
  fielderName?: string;
}

export interface CricketState {
  oversLimit: number;
  wicketsLimit: number;
  innings: 1 | 2;
  battingSide: 'home' | 'away';
  target?: number;
  scores: { home: Innings; away: Innings };
  batting: Record<string, BatCard>;
  bowling: Record<string, BowlCard>;
  thisOver: string[];
  ballsInOver: number;
  /** the two batsmen currently at the crease (auto-rotated on odd runs / over end) */
  strikerId?: string;
  strikerName?: string;
  nonStrikerId?: string;
  nonStrikerName?: string;
  /** current bowler; cleared at the end of an over so a new one must be named */
  bowlerId?: string;
  bowlerName?: string;
  /** who bowled the previous over (can't bowl two in a row) */
  lastOverBowlerId?: string;
  /** the next legal delivery is a free hit (set by a no-ball) */
  freeHit: boolean;
  /** captain & wicket-keeper per side, assigned before the game starts */
  captains: Partial<Record<'home' | 'away', { id: string; name: string }>>;
  keepers: Partial<Record<'home' | 'away', { id: string; name: string }>>;
  /** the toss: who won it and what they chose. Drives who bats first (innings 1).
   *  Settable only before the first delivery; unset = home bats first by default. */
  toss?: { winner: 'home' | 'away'; decision: 'bat' | 'bowl' };
  /** every dismissal in the match — drives the post-match ratings */
  dismissals: DismissalRecord[];
  /** IPL-style Impact Player is allowed this match (format toggle) */
  impactEnabled: boolean;
  /** the one Impact substitution each side may use; records who came in for whom */
  impactUsed: Partial<Record<'home' | 'away', { inId: string; inName: string; outId: string; outName: string }>>;
  /** players who can take no further part (subbed out by an Impact Player) */
  unavailable: string[];
  /** powerplay length in overs (0 = none) — fielding restrictions apply within it */
  powerplayOvers: number;
  /** how a tied match is settled: a Super Over, or the tie stands / is shared */
  tieBreak: 'super_over' | 'shared';
  /** balls per over — 6 standard, 10 for The Hundred */
  ballsPerOver: number;
  /** ball used — leather (match) or tennis (box/turf). Informational. */
  ballType: 'leather' | 'tennis';
  /** rain revises the target by Duckworth–Lewis–Stern (limited-overs only). */
  dls: boolean;
  /** DLS resources lost (%) to interruptions in each innings — drives the revise. */
  r1Lost: number;
  r2Lost: number;
  events: LiveEvent[];
  seq: number;
  ended: boolean;
  potm?: string;
  /** regulation ended level — awaiting the scorer's call (Super Over or accept the tie). */
  pendingTie?: boolean;
  /** marks a nested Super-Over mini-innings, so a level SO ends outright (parent decides). */
  isSuperOver?: boolean;
  /** the live Super-Over tie-breaker, if one is under way / decided the match. */
  superOver?: SuperOverState;
}

/** A Super Over: a self-contained 1-over, 2-wicket mini-match run through this
 *  same reducer. The parent match is frozen at its tied totals while `state` (the
 *  nested innings) is live; repeated until a round is won. */
export interface SuperOverState {
  round: number;
  /** which side batted first THIS round (alternates each round). */
  battingFirst: 'home' | 'away';
  /** runs each side made in prior, tied rounds. */
  history: { round: number; home: number; away: number }[];
  /** the nested mini-match (oversLimit 1, wicketsLimit 2). */
  state: CricketState;
}

export type DismissalKind = 'bowled' | 'caught' | 'lbw' | 'stumped' | 'runout' | 'hitwicket' | 'retired' | 'timedout';

const blankInnings = (): Innings => ({ runs: 0, wickets: 0, balls: 0, extras: 0 });

const init = (config?: Record<string, unknown>): CricketState => ({
  oversLimit: Number(config?.overs ?? 20),
  // players/side − 1 wickets (box cricket / 7-a-side etc. fall out of this)
  wicketsLimit: Math.max(1, Number(config?.playersPerSide ?? 11) - 1),
  innings: 1,
  battingSide: 'home',
  scores: { home: blankInnings(), away: blankInnings() },
  batting: {},
  bowling: {},
  thisOver: [],
  ballsInOver: 0,
  freeHit: false,
  captains: {},
  keepers: {},
  dismissals: [],
  impactEnabled: Boolean(config?.impactPlayer ?? false),
  impactUsed: {},
  unavailable: [],
  powerplayOvers: Number(config?.powerplayOvers ?? 0),
  tieBreak: (config?.tieBreak as CricketState['tieBreak']) ?? 'super_over',
  ballsPerOver: Number(config?.ballsPerOver ?? 6),
  ballType: (config?.ballType as CricketState['ballType']) ?? 'leather',
  dls: Boolean(config?.dls ?? false),
  r1Lost: 0,
  r2Lost: 0,
  events: [],
  seq: 0,
  ended: false,
});

/** Overs bowled so far in the current innings (for the powerplay window). */
export const oversBowled = (s: CricketState) => Math.floor(s.scores[s.battingSide].balls / s.ballsPerOver);
/** True while the innings is inside its powerplay (fielding restrictions). */
export const inPowerplay = (s: CricketState) =>
  s.powerplayOvers > 0 && !s.ended && oversBowled(s) < s.powerplayOvers;

/** Auto commentary for a delivery. */
function commentary(kind: 'runs' | 'wicket' | 'extra', value: number, batter?: string, bowler?: string): string {
  const b = batter ?? 'the batter';
  if (kind === 'wicket') return `${bowler ? bowler + ' strikes — ' : ''}${b} departs`;
  if (kind === 'extra') return 'extra, free run';
  if (value === 0) return `${b} defends, no run`;
  if (value === 4) return `FOUR! ${b} finds the boundary`;
  if (value === 6) return `SIX! ${b} goes downtown`;
  return `${b} works it for ${value}`;
}

/** Scorecard dismissal text, e.g. "c Veer b Ishaan", "lbw b Ishaan", "run out (Veer)". */
function composeDismissal(kind: DismissalKind, bowler?: string, fielder?: string, keeper?: string): string {
  const b = bowler ?? 'bowler';
  switch (kind) {
    case 'bowled': return `b ${b}`;
    case 'lbw': return `lbw b ${b}`;
    case 'hitwicket': return `hit wkt b ${b}`;
    case 'stumped': return `st ${keeper ?? '†wk'} b ${b}`;
    case 'caught': return fielder && fielder === bowler ? `c & b ${b}` : `c ${fielder ?? 'fielder'} b ${b}`;
    case 'runout': return `run out${fielder ? ` (${fielder})` : ''}`;
    case 'retired': return 'retired hurt';
    case 'timedout': return 'timed out';
    default: return 'out';
  }
}
const WICKET_LABEL: Record<DismissalKind, string> = {
  bowled: 'BOWLED', caught: 'CAUGHT', lbw: 'LBW', stumped: 'STUMPED', runout: 'RUN OUT', hitwicket: 'HIT WICKET',
  retired: 'RETIRED HURT', timedout: 'TIMED OUT',
};
/** Dismissals that aren't credited to the bowler. */
const NO_BOWLER: DismissalKind[] = ['runout', 'retired', 'timedout'];
/** "Dismissals" that involve no delivery (happen between balls). */
const NO_DELIVERY: DismissalKind[] = ['retired', 'timedout'];

// Overs bowled, e.g. 6 balls → "1.0" (used for over counts: totals, RR, figures).
export const oversStr = (balls: number, bpo = 6) => `${Math.floor(balls / bpo)}.${balls % bpo}`;

/** Overs faced by each side for Net Run Rate. A side bowled out is charged its
 *  full quota (the standard NRR rule), not the fraction it actually batted. */
export function nrrOvers(s: CricketState): { home: number; away: number } {
  const facedOvers = (inn: Innings) =>
    inn.wickets >= s.wicketsLimit ? s.oversLimit : inn.balls / s.ballsPerOver;
  return { home: facedOvers(s.scores.home), away: facedOvers(s.scores.away) };
}
/** NRR overs for a match ended by hand with "Count in NRR (all overs)": each
 *  side is charged its full quota, however far the match got (parity #04). */
export const manualNrrOvers = (s: CricketState): { home: number; away: number } =>
  ({ home: s.oversLimit, away: s.oversLimit });
// Delivery notation for ball-by-ball: the Nth ball reads over.ball with ball 1–bpo,
// so the last ball of an over is "0.6" (not "1.0"). `balls` includes this delivery.
export const ballStamp = (balls: number, bpo = 6) =>
  `${Math.floor((balls - 1) / bpo)}.${((balls - 1) % bpo) + 1}`;
export const runRate = (runs: number, balls: number, bpo = 6) => (balls === 0 ? '0.00' : ((runs / balls) * bpo).toFixed(2));
const other = (s: 'home' | 'away') => (s === 'home' ? 'away' : 'home');

/** Make sure a batsman sent to the crease has a (0*) card so they show as
 *  batting (not "yet to bat"). A retired-hurt batsman resuming keeps their runs
 *  but is no longer marked retired. */
const ensureCard = (batting: Record<string, BatCard>, id: string, name: string, side: 'home' | 'away'): Record<string, BatCard> => {
  const prev = batting[id];
  if (!prev) return { ...batting, [id]: { name, side, runs: 0, balls: 0, fours: 0, sixes: 0, out: false } };
  if (prev.retired) return { ...batting, [id]: { ...prev, retired: false, dismissal: undefined } };
  return batting;
};

/** Swap which batsman is on strike. */
const swapStrike = <T extends Pick<CricketState, 'strikerId' | 'strikerName' | 'nonStrikerId' | 'nonStrikerName'>>(s: T): T => ({
  ...s,
  strikerId: s.nonStrikerId,
  strikerName: s.nonStrikerName,
  nonStrikerId: s.strikerId,
  nonStrikerName: s.strikerName,
});

/** Fresh crease + bowler (used when a new innings starts). */
const clearCrease = {
  strikerId: undefined, strikerName: undefined, nonStrikerId: undefined, nonStrikerName: undefined,
  bowlerId: undefined, bowlerName: undefined, lastOverBowlerId: undefined, freeHit: false,
};

function inningsComplete(s: CricketState, inn: Innings): boolean {
  return inn.balls >= s.oversLimit * s.ballsPerOver || inn.wickets >= s.wicketsLimit;
}

interface BallInfo {
  strikerId?: string;
  strikerName?: string;
  bowlerId?: string;
  bowlerName?: string;
}
const ballInfo = (a: ScoreAction): BallInfo => ({
  strikerId: a.payload?.strikerId as string | undefined,
  strikerName: a.payload?.strikerName as string | undefined,
  bowlerId: a.payload?.bowlerId as string | undefined,
  bowlerName: a.payload?.bowlerName as string | undefined,
});

const reducer = (s: CricketState, a: ScoreAction): CricketState => {
  if (s.ended && a.type !== 'END' && a.type !== 'POTM') return s;

  // ── Rain (DLS) ────────────────────────────────────────────────────────────
  // Cut the overs; in the chase, revise the target by the resources lost.
  if (a.type === 'RAIN') {
    const newOvers = Math.floor(Number(a.payload?.overs ?? s.oversLimit));
    const inn = s.scores[s.battingSide];
    const oversDone = Math.floor(inn.balls / s.ballsPerOver);
    if (!s.dls || newOvers <= oversDone || newOvers >= s.oversLimit) return s;
    const lost = Math.max(0, resourcePct(s.oversLimit - oversDone, inn.wickets) - resourcePct(newOvers - oversDone, inn.wickets));
    let next: CricketState = { ...s, oversLimit: newOvers };
    if (s.innings === 1) {
      next = { ...next, r1Lost: s.r1Lost + lost };
    } else {
      const r2Lost = s.r2Lost + lost;
      const team1Runs = s.scores[other(s.battingSide)].runs;
      next = { ...next, r2Lost, target: revisedTarget(team1Runs, 100 - s.r1Lost, 100 - r2Lost) };
    }
    return {
      ...next, seq: s.seq + 1,
      events: [...s.events, { id: s.seq + 1, stamp: '☔', icon: '☔', label: `Rain — overs cut to ${newOvers}${s.innings === 2 ? ` · target ${next.target}` : ''}`, detail: undefined, side: s.battingSide }],
    };
  }

  // ── Super Over ────────────────────────────────────────────────────────────
  // Starting one freezes the parent match and spins up a nested mini-innings.
  if (a.type === 'START_SUPER_OVER') return startSuperOver(s);
  // While a Super Over is live, route every scoring action into the nested match
  // (run through this very reducer) so all the ball-by-ball logic is reused.
  if (s.superOver && !s.superOver.state.ended) {
    const inner = reducer(s.superOver.state, a);
    if (!inner.ended) return { ...s, superOver: { ...s.superOver, state: inner } };
    return resolveSuperOver(s, inner); // the round just ended — decide or await the next
  }

  const bat = s.battingSide;
  const cur = s.scores[bat];
  let seq = s.seq;
  const info = ballInfo(a);

  // Start of a fresh over? (a legal ball arrives after 6 were bowled)
  const newOver = s.ballsInOver >= s.ballsPerOver;
  const baseOver = newOver ? [] : s.thisOver;
  const baseBalls = newOver ? 0 : s.ballsInOver;

  const settle = (state: CricketState): CricketState => {
    const c = state.scores[state.battingSide];
    if (state.innings === 2 && state.target !== undefined && c.runs >= state.target) return { ...state, ended: true };
    if (!inningsComplete(state, c)) return state;
    if (state.innings === 1) {
      return { ...state, innings: 2, battingSide: other(state.battingSide), target: revisedTarget(c.runs, 100 - state.r1Lost, 100), thisOver: [], ballsInOver: 0, ...clearCrease };
    }
    // Second innings done without reaching the target: a loss — or a level score.
    // A level regulation match pauses for the scorer's call (Super Over or accept
    // the tie); a level Super Over just ends so the parent can decide the next step.
    const level = state.scores.home.runs === state.scores.away.runs;
    if (level && !state.isSuperOver) return { ...state, pendingTie: true };
    return { ...state, ended: true };
  };

  // Apply a delta to one batter's card (creating it if needed). Generic over the
  // batter id so WICKET can update both the striker (ball faced) and a run-out
  // non-striker (marked out) on the same evolving batting record.
  const applyBat = (
    batting: Record<string, BatCard>, id: string | undefined, name: string | undefined,
    delta: { runs?: number; balls?: number; fours?: number; sixes?: number; out?: boolean; dismissal?: string; retired?: boolean }
  ): Record<string, BatCard> => {
    if (!id) return batting;
    const prev: BatCard = batting[id] ?? { name: name ?? '', side: bat, runs: 0, balls: 0, fours: 0, sixes: 0, out: false };
    return {
      ...batting,
      [id]: {
        ...prev,
        name: prev.name || name || '',
        side: prev.side ?? bat,
        runs: prev.runs + (delta.runs ?? 0),
        balls: prev.balls + (delta.balls ?? 0),
        fours: prev.fours + (delta.fours ?? 0),
        sixes: prev.sixes + (delta.sixes ?? 0),
        out: delta.out ?? prev.out,
        retired: delta.retired ?? prev.retired,
        dismissal: delta.dismissal ?? prev.dismissal,
      },
    };
  };
  const bumpBat = (delta: { runs?: number; balls?: number; fours?: number; sixes?: number; out?: boolean; dismissal?: string }) =>
    applyBat(s.batting, info.strikerId, info.strikerName, delta);
  const bumpBowl = (delta: { runs?: number; balls?: number; wickets?: number; extras?: number }): Record<string, BowlCard> => {
    if (!info.bowlerId) return s.bowling;
    const prev: BowlCard = s.bowling[info.bowlerId] ?? { name: info.bowlerName ?? '', side: other(bat), runs: 0, balls: 0, wickets: 0, dots: 0, extras: 0 };
    // a dot ball = a legal delivery the bowler conceded no runs off
    const dot = (delta.balls ?? 0) > 0 && (delta.runs ?? 0) === 0 ? 1 : 0;
    return { ...s.bowling, [info.bowlerId]: { ...prev, name: prev.name || info.bowlerName || '', side: prev.side ?? other(bat), runs: prev.runs + (delta.runs ?? 0), balls: prev.balls + (delta.balls ?? 0), wickets: prev.wickets + (delta.wickets ?? 0), dots: prev.dots + dot, extras: prev.extras + (delta.extras ?? 0) } };
  };

  const overEnd = baseBalls + 1 >= s.ballsPerOver;
  // End-of-(legal)-ball housekeeping: strike rotation, over change (clear the
  // bowler & remember who bowled it so they can't bowl two in a row), and
  // consuming the free hit (any legal delivery clears it).
  const afterLegalBall = (next: CricketState, rotate: boolean): CricketState => {
    let r = rotate ? swapStrike(next) : next;
    if (overEnd) r = { ...r, lastOverBowlerId: s.bowlerId, bowlerId: undefined, bowlerName: undefined };
    return settle({ ...r, freeHit: false });
  };

  switch (a.type) {
    case 'RUNS': {
      const r = Number(a.payload?.runs ?? 0);
      const balls = cur.balls + 1;
      seq += 1;
      const next: CricketState = {
        ...s,
        scores: { ...s.scores, [bat]: { ...cur, runs: cur.runs + r, balls } },
        batting: bumpBat({ runs: r, balls: 1, fours: r === 4 ? 1 : 0, sixes: r === 6 ? 1 : 0 }),
        bowling: bumpBowl({ runs: r, balls: 1 }),
        thisOver: [...baseOver, r === 4 ? '4' : r === 6 ? '6' : String(r)],
        ballsInOver: baseBalls + 1,
        events: [...s.events, { id: seq, stamp: ballStamp(balls, s.ballsPerOver), icon: '🏏', label: r === 4 ? 'FOUR' : r === 6 ? 'SIX' : `${r} run${r === 1 ? '' : 's'}`, detail: commentary('runs', r, info.strikerName, info.bowlerName), side: bat, tone: r === 4 || r === 6 ? 'boundary' : undefined }],
        seq,
      };
      // Strike rotation: odd runs swap ends, and the end of an over swaps ends.
      // Both happening (a single off the last ball) cancel out — hence XOR.
      return afterLegalBall(next, (r % 2 === 1) !== overEnd);
    }
    case 'BYES':
    case 'LEGBYES': {
      const r = Math.max(1, Number(a.payload?.runs ?? 1));
      const isLeg = a.type === 'LEGBYES';
      const balls = cur.balls + 1;
      seq += 1;
      const next: CricketState = {
        ...s,
        // byes/leg-byes are team extras — not the batter's runs, not charged to the bowler
        scores: { ...s.scores, [bat]: { ...cur, runs: cur.runs + r, extras: cur.extras + r, balls } },
        batting: applyBat(s.batting, s.strikerId, s.strikerName, { balls: 1 }),
        bowling: bumpBowl({ balls: 1 }),
        thisOver: [...baseOver, (isLeg ? 'lb' : 'b') + (r > 1 ? r : '')],
        ballsInOver: baseBalls + 1,
        events: [...s.events, { id: seq, stamp: ballStamp(balls, s.ballsPerOver), icon: '➕', label: `${isLeg ? 'Leg bye' : 'Bye'}${r > 1 ? ` ${r}` : ''}`, detail: undefined, side: bat, tone: 'extra' }],
        seq,
      };
      return afterLegalBall(next, (r % 2 === 1) !== overEnd);
    }
    case 'WICKET': {
      const kind = (String(a.payload?.kind ?? 'bowled') as DismissalKind);
      const batterOut: 'striker' | 'nonstriker' = a.payload?.batterOut === 'nonstriker' ? 'nonstriker' : 'striker';
      const keeper = s.keepers[other(bat)]?.name;
      const dismissal = composeDismissal(kind, info.bowlerName, a.payload?.fielderName as string | undefined, keeper);
      const outId = batterOut === 'nonstriker' ? s.nonStrikerId : s.strikerId;
      const outName = batterOut === 'nonstriker' ? s.nonStrikerName : s.strikerName;
      const newBatId = a.payload?.newBatId as string | undefined;
      const newBatName = a.payload?.newBatName as string | undefined;
      // The new batsman fills whichever end the departing batsman vacated.
      const creaseFor = (id?: string, name?: string) =>
        batterOut === 'nonstriker' ? { nonStrikerId: id, nonStrikerName: name } : { strikerId: id, strikerName: name };

      // Retired hurt / timed out — no delivery is bowled, no bowler involved.
      if (NO_DELIVERY.includes(kind)) {
        const isWicket = kind !== 'retired'; // retired hurt doesn't count as a wicket
        seq += 1;
        let batting = applyBat(s.batting, outId, outName, kind === 'retired' ? { retired: true, dismissal } : { out: true, dismissal });
        if (newBatId) batting = applyBat(batting, newBatId, newBatName, { retired: false });
        const next: CricketState = {
          ...s,
          scores: { ...s.scores, [bat]: { ...cur, wickets: cur.wickets + (isWicket ? 1 : 0) } },
          batting,
          dismissals: isWicket ? [...s.dismissals, { kind, outId }] : s.dismissals,
          events: [...s.events, { id: seq, stamp: oversStr(cur.balls, s.ballsPerOver), icon: '🚑', label: WICKET_LABEL[kind], detail: `${outName ?? 'Batter'} ${dismissal}`, side: other(bat), tone: 'wicket' }],
          seq,
          ...creaseFor(newBatId, newBatName),
        };
        return settle(next);
      }

      // Deliveries (bowled/caught/lbw/stumped/hit wicket/run out).
      const isRunOut = kind === 'runout';
      const completed = isRunOut ? Math.max(0, Number(a.payload?.runs ?? 0)) : 0; // runs off the bat before a run-out
      const balls = cur.balls + 1;
      seq += 1;
      // The striker faces the delivery (and is credited any completed runs); the
      // dismissed batsman (striker, or a run-out non-striker) is marked out.
      let batting = applyBat(s.batting, s.strikerId, s.strikerName, { balls: 1, runs: completed });
      batting = applyBat(batting, outId, outName, { out: true, dismissal });
      if (newBatId) batting = applyBat(batting, newBatId, newBatName, { retired: false });

      // A stumping is credited to the keeper; otherwise to the named fielder.
      const fielderId = kind === 'stumped' ? s.keepers[other(bat)]?.id : (a.payload?.fielderId as string | undefined);
      const fielderName = kind === 'stumped' ? keeper : (a.payload?.fielderName as string | undefined);

      const next: CricketState = {
        ...s,
        scores: { ...s.scores, [bat]: { ...cur, runs: cur.runs + completed, wickets: cur.wickets + 1, balls } },
        batting,
        bowling: bumpBowl({ balls: 1, runs: completed, wickets: NO_BOWLER.includes(kind) ? 0 : 1 }),
        dismissals: [...s.dismissals, { kind, outId, bowlerId: info.bowlerId, fielderId, fielderName }],
        thisOver: [...baseOver, completed > 0 ? `${completed}+W` : 'W'],
        ballsInOver: baseBalls + 1,
        events: [...s.events, { id: seq, stamp: ballStamp(balls, s.ballsPerOver), icon: '🎯', label: WICKET_LABEL[kind], detail: `${outName ?? 'Batter'} ${dismissal}${completed > 0 ? ` (${completed} run${completed === 1 ? '' : 's'})` : ''}`, side: other(bat), tone: 'wicket' }],
        seq,
        ...creaseFor(newBatId, newBatName),
      };
      // Completed-run parity and over-end both swap strike (run-out crossing approximated).
      return afterLegalBall(next, (completed % 2 === 1) !== overEnd);
    }
    case 'PENALTY': {
      // A 5-run penalty (illegal fielding, ball hitting a helmet, slow over-rate…):
      // runs added to the batting side, not a ball, not charged to any bowler.
      const r = Math.max(1, Number(a.payload?.runs ?? 5));
      seq += 1;
      return settle({
        ...s,
        scores: { ...s.scores, [bat]: { ...cur, runs: cur.runs + r, extras: cur.extras + r } },
        events: [...s.events, { id: seq, stamp: oversStr(cur.balls, s.ballsPerOver), icon: '➕', label: `Penalty — ${r} runs`, detail: undefined, side: bat, tone: 'extra' }],
        seq,
      });
    }
    case 'EXTRA': {
      const kind = String(a.payload?.kind ?? 'Wide');
      const isNoBall = kind === 'No ball';
      seq += 1;
      // Neither a wide nor a no-ball is a legal ball (no over progress).
      const overReset = s.ballsInOver >= s.ballsPerOver ? [] : s.thisOver;

      // Run-out off the extra: a wicket falls without a legal ball being bowled
      // (the over does NOT advance). The +1 penalty stands; any completed runs
      // count (off the bat on a no-ball, as extras on a wide); no bowler credit.
      if (a.payload?.runout) {
        const completed = Math.max(0, Number(a.payload?.runs ?? 0));
        const batterOut: 'striker' | 'nonstriker' = a.payload?.batterOut === 'nonstriker' ? 'nonstriker' : 'striker';
        const outId = batterOut === 'nonstriker' ? s.nonStrikerId : s.strikerId;
        const outName = batterOut === 'nonstriker' ? s.nonStrikerName : s.strikerName;
        const newBatId = a.payload?.newBatId as string | undefined;
        const newBatName = a.payload?.newBatName as string | undefined;
        const fielderId = a.payload?.fielderId as string | undefined;
        const fielderName = a.payload?.fielderName as string | undefined;
        const dismissal = composeDismissal('runout', undefined, fielderName);
        let batting = s.batting;
        if (isNoBall) batting = applyBat(batting, s.strikerId, s.strikerName, { runs: completed, balls: 1 });
        batting = applyBat(batting, outId, outName, { out: true, dismissal });
        if (newBatId) batting = applyBat(batting, newBatId, newBatName, { retired: false });
        const crease = batterOut === 'nonstriker'
          ? { nonStrikerId: newBatId, nonStrikerName: newBatName }
          : { strikerId: newBatId, strikerName: newBatName };
        const sym = `${completed > 0 ? completed : ''}${isNoBall ? 'nb' : 'wd'}+W`;
        let next: CricketState = {
          ...s,
          scores: { ...s.scores, [bat]: { ...cur, runs: cur.runs + 1 + completed, extras: cur.extras + (isNoBall ? 1 : 1 + completed), wickets: cur.wickets + 1 } },
          batting,
          bowling: bumpBowl({ runs: 1 + completed, extras: isNoBall ? 1 : 1 + completed }),
          dismissals: [...s.dismissals, { kind: 'runout', outId, fielderId, fielderName }],
          thisOver: [...overReset, sym],
          events: [...s.events, { id: seq, stamp: ballStamp(cur.balls + 1, s.ballsPerOver), icon: '🎯', label: `${isNoBall ? 'No ball' : 'Wide'} — RUN OUT`, detail: `${outName ?? 'Batter'} ${dismissal}${completed > 0 ? ` (${completed} run${completed === 1 ? '' : 's'})` : ''}`, side: other(bat), tone: 'wicket' }],
          seq,
          freeHit: isNoBall ? true : s.freeHit,
          ...crease,
        };
        if (completed % 2 === 1) next = swapStrike(next);
        return settle(next);
      }
      if (isNoBall) {
        // No-ball: +1 penalty, PLUS runs off the bat (credited to the striker) AND/OR
        // byes run without hitting (team extras, not charged to the bowler). The
        // striker faces a no-ball (counts as a ball faced) and gets a free hit next.
        const offBat = Math.max(0, Number(a.payload?.runs ?? 0));
        const byes = Math.max(0, Number(a.payload?.byes ?? 0));
        const total = 1 + offBat + byes;
        const ran = offBat + byes; // runs run between the wickets → strike parity
        const batting = applyBat(s.batting, s.strikerId, s.strikerName, { runs: offBat, balls: 1, fours: offBat === 4 ? 1 : 0, sixes: offBat === 6 ? 1 : 0 });
        const sym = `${ran > 0 ? ran : ''}nb`;
        const label = `No ball${offBat > 0 ? ` + ${offBat}` : ''}${byes > 0 ? ` + ${byes} bye${byes === 1 ? '' : 's'}` : ''} — free hit`;
        let next: CricketState = {
          ...s,
          // extras conceded = the +1 penalty + any byes (off-bat runs are the batter's)
          scores: { ...s.scores, [bat]: { ...cur, runs: cur.runs + total, extras: cur.extras + 1 + byes } },
          batting,
          bowling: bumpBowl({ runs: 1 + offBat, extras: 1 }), // bowler charged penalty + off-bat, not byes
          thisOver: [...overReset, sym],
          events: [...s.events, { id: seq, stamp: ballStamp(cur.balls + 1, s.ballsPerOver), icon: '➕', label, detail: undefined, side: bat, tone: 'extra' }],
          seq,
          freeHit: true,
        };
        if (ran % 2 === 1) next = swapStrike(next); // crossed an odd number of times
        return settle(next);
      }
      // Wide: +1 penalty PLUS any runs the batsmen run (byes on the wide, or a wide
      // to the boundary = 4). All are extras charged to the bowler; no ball is faced.
      const wideRuns = Math.max(0, Number(a.payload?.runs ?? 0));
      const total = 1 + wideRuns;
      const sym = wideRuns > 0 ? `${total}wd` : 'wd';
      let next: CricketState = {
        ...s,
        scores: { ...s.scores, [bat]: { ...cur, runs: cur.runs + total, extras: cur.extras + total } },
        bowling: bumpBowl({ runs: total, extras: total }),
        thisOver: [...overReset, sym],
        events: [...s.events, { id: seq, stamp: ballStamp(cur.balls + 1, s.ballsPerOver), icon: '➕', label: wideRuns > 0 ? `Wide + ${wideRuns}` : 'Wide', detail: undefined, side: bat, tone: 'extra' }],
        seq,
        freeHit: s.freeHit,
      };
      if (wideRuns % 2 === 1) next = swapStrike(next);
      return settle(next);
    }
    case 'SET_STRIKER': {
      const id = String(a.payload?.id ?? '');
      const name = String(a.payload?.name ?? '');
      if (!id || s.unavailable.includes(id)) return s;
      return { ...s, strikerId: id, strikerName: name, batting: ensureCard(s.batting, id, name, bat) };
    }
    case 'SET_NONSTRIKER': {
      const id = String(a.payload?.id ?? '');
      const name = String(a.payload?.name ?? '');
      if (!id || s.unavailable.includes(id)) return s;
      return { ...s, nonStrikerId: id, nonStrikerName: name, batting: ensureCard(s.batting, id, name, bat) };
    }
    case 'IMPACT_SUB': {
      // IPL-style Impact Player: one per side, all match. The named substitute
      // comes in to bat/bowl; the player they replace takes no further part.
      const side = a.payload?.side as 'home' | 'away';
      const inId = String(a.payload?.inId ?? '');
      const inName = String(a.payload?.inName ?? '');
      const outId = String(a.payload?.outId ?? '');
      const outName = String(a.payload?.outName ?? '');
      if (!s.impactEnabled || (side !== 'home' && side !== 'away') || !inId || !outId) return s;
      if (s.impactUsed[side]) return s; // already used this side's Impact Player
      seq += 1;
      return {
        ...s,
        impactUsed: { ...s.impactUsed, [side]: { inId, inName, outId, outName } },
        unavailable: [...s.unavailable, outId],
        events: [...s.events, { id: seq, stamp: oversStr(cur.balls, s.ballsPerOver), icon: '⚡', label: 'IMPACT PLAYER', detail: `${inName} in for ${outName}`, side }],
        seq,
      };
    }
    case 'CONCUSSION_SUB': {
      // A like-for-like injury/concussion replacement (NOT the IPL Impact Player):
      // not format-gated, allowed any time; the injured player takes no further
      // part and the replacement can bat/bowl (their card is created when they do).
      const side = a.payload?.side as 'home' | 'away';
      const inName = String(a.payload?.inName ?? '');
      const outId = String(a.payload?.outId ?? '');
      const outName = String(a.payload?.outName ?? '');
      if ((side !== 'home' && side !== 'away') || !outId) return s;
      seq += 1;
      return {
        ...s,
        unavailable: [...s.unavailable, outId],
        events: [...s.events, { id: seq, stamp: oversStr(cur.balls, s.ballsPerOver), icon: '🚑', label: 'CONCUSSION SUB', detail: `${inName} replaces ${outName} (injury)`, side }],
        seq,
      };
    }
    case 'SWAP_STRIKE':
      return swapStrike(s);
    case 'SET_BOWLER': {
      const id = String(a.payload?.id ?? '');
      const name = String(a.payload?.name ?? '');
      if (!id || id === s.lastOverBowlerId || s.unavailable.includes(id)) return s; // no bowling two in a row, no subbed-out players
      const card: BowlCard = { name, side: other(bat), runs: 0, balls: 0, wickets: 0, dots: 0, extras: 0 };
      const bowling = s.bowling[id] ? s.bowling : { ...s.bowling, [id]: card };
      return { ...s, bowlerId: id, bowlerName: name, bowling };
    }
    case 'SET_TOSS': {
      // The toss decides who bats first — only before ball one (innings 1, no
      // deliveries yet), so it can be corrected during setup but not mid-match.
      const played = s.innings > 1 || s.scores.home.balls > 0 || s.scores.away.balls > 0;
      if (played) return s;
      const winner = a.payload?.winner as 'home' | 'away';
      const decision = (a.payload?.decision as 'bat' | 'bowl') ?? 'bat';
      if (winner !== 'home' && winner !== 'away') return s;
      const battingSide = decision === 'bat' ? winner : other(winner);
      return { ...s, toss: { winner, decision }, battingSide };
    }
    case 'SET_CAPTAIN': {
      const side = a.payload?.side as 'home' | 'away';
      const id = String(a.payload?.id ?? '');
      if (!side || !id) return s;
      return { ...s, captains: { ...s.captains, [side]: { id, name: String(a.payload?.name ?? '') } } };
    }
    case 'SET_KEEPER': {
      const side = a.payload?.side as 'home' | 'away';
      const id = String(a.payload?.id ?? '');
      if (!side || !id) return s;
      return { ...s, keepers: { ...s.keepers, [side]: { id, name: String(a.payload?.name ?? '') } } };
    }
    case 'POTM':
      return { ...s, potm: String(a.payload?.name ?? '') };
    case 'END_INNINGS':
      if (s.innings === 1) return { ...s, innings: 2, battingSide: other(bat), target: revisedTarget(cur.runs, 100 - s.r1Lost, 100), thisOver: [], ballsInOver: 0, ...clearCrease };
      return { ...s, ended: true };
    case 'END':
      return { ...s, ended: true };
    default:
      return s;
  }
};

/** Winner of a completed Super-Over round (more runs wins); null = still level. */
function superOverWinner(inn: CricketState): 'home' | 'away' | null {
  if (inn.scores.home.runs > inn.scores.away.runs) return 'home';
  if (inn.scores.away.runs > inn.scores.home.runs) return 'away';
  return null;
}

/** Begin a Super Over: freeze the parent, open a fresh 1-over / 2-wicket innings.
 *  Round 1 — the side that batted second in the match bats first; then it
 *  alternates each subsequent (tied) round. Captains/keepers carry over so the
 *  scorer isn't re-prompted for setup. */
function startSuperOver(s: CricketState): CricketState {
  const battingFirst = s.superOver ? other(s.superOver.battingFirst) : s.battingSide;
  const history = s.superOver
    ? [...s.superOver.history, { round: s.superOver.round, home: s.superOver.state.scores.home.runs, away: s.superOver.state.scores.away.runs }]
    : [];
  const round = (s.superOver?.round ?? 0) + 1;
  const inner: CricketState = {
    ...init({ overs: 1, playersPerSide: 3 }), // oversLimit 1, wicketsLimit 2
    isSuperOver: true,
    battingSide: battingFirst,
    captains: s.captains,
    keepers: s.keepers,
  };
  return { ...s, ended: false, pendingTie: true, superOver: { round, battingFirst, history, state: inner } };
}

/** A Super-Over round just ended: a decided round ends the match; a level round
 *  leaves the tie pending so the scorer can start the next round (or accept it). */
function resolveSuperOver(s: CricketState, inner: CricketState): CricketState {
  const decided = superOverWinner(inner) !== null;
  return { ...s, superOver: { ...s.superOver!, state: inner }, ended: decided };
}

function resultLine(s: CricketState): string {
  // Decided by a Super Over.
  if (s.superOver) {
    const inn = s.superOver.state;
    const w = superOverWinner(inn);
    if (w) {
      const margin = Math.abs(inn.scores.home.runs - inn.scores.away.runs);
      const roundTag = s.superOver.round > 1 ? ` (Super Over ${s.superOver.round})` : '';
      return `Won the Super Over by ${margin} run${margin === 1 ? '' : 's'}${roundTag}`;
    }
  }
  const chase = s.scores[s.battingSide];
  const defend = s.scores[other(s.battingSide)];
  if (chase.runs >= (s.target ?? Infinity)) {
    const w = s.wicketsLimit - chase.wickets;
    return `Won by ${w} wkt${w === 1 ? '' : 's'}`;
  }
  const margin = defend.runs - chase.runs;
  if (margin === 0) return 'Match tied';
  return `Won by ${margin} run${margin === 1 ? '' : 's'}`;
}

export { init, reducer, other, resultLine, superOverWinner, WICKET_LABEL, NO_BOWLER, composeDismissal };
export type { Innings };

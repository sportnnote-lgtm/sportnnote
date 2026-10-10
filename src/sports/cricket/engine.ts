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
import { resourcePct, resourcePctV1, revisedTarget } from './dls.ts';
import { rulesFromConfig, rulesOf, effectiveRules, patchRules, describeRulesChange, type CricketRules } from './rules.ts';

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
  /** parity #17 — 0-based over indices this bowler delivered any ball of (a
   *  part-over counts toward the quota). Absent on older states = []. */
  overs?: number[];
}

/** A record of each dismissal, for the post-match performance ratings. */
interface DismissalRecord {
  kind: DismissalKind;
  outId?: string;
  bowlerId?: string;
  fielderId?: string;
  fielderName?: string;
  /** a run-out's 2nd fielder (parity #16) — scorecard text & record only, no stat */
  fielder2Id?: string;
  fielder2Name?: string;
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
  /** parity #17 — EVERY bowler who delivered any part of the previous over (an
   *  interrupted over's starter and finisher both sit out the next). Older states: `?? []`. */
  lastOverBowlerIds?: string[];
  /** parity #17 — bowlers who delivered a ball of the current over so far. */
  overBowlers?: string[];
  /** parity #17 — bowlers suspended this innings (Law 41); can't bowl again. */
  barredBowlers?: string[];
  /** parity #17 — max overs per bowler (0 = none); `bowlerQuotaAuto` = from overs ÷ 5. */
  bowlerQuota?: number;
  bowlerQuotaAuto?: boolean;
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
  /** parity #18 — overs each innings was SCHEDULED for (changed only by an agreed
   *  SET_OVERS / SET_TARGET; a RAIN cut moves `oversLimit` and is charged to rXLost).
   *  Older states: `?? oversLimit`. `inn2Overs` is set when the chase starts. */
  inn1Overs?: number;
  inn2Overs?: number;
  /** how the chase target was last revised: by DLS (rain) or typed in by hand. */
  revision?: 'dls' | 'manual';
  /** a manual target was set — built-in DLS is off for the rest of the match. */
  dlsLocked?: boolean;
  /** 2 once the match has seen a `v: 2` RAIN / SET_OVERS / SET_TARGET: the
   *  Standard Edition table, ball-accurate losses and par-based margins. Absent =
   *  legacy maths (REVIEW Decision 8), so stored DLS results replay identically. */
  dlsV?: 2;
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
  /** local rules (parity #14) — from the format, changed mid-match by SET_RULES.
   *  Optional so older saved states still read; use `rulesOf(s)`. */
  rules?: CricketRules;
  /** parity #19 — one record per scored delivery / penalty, for the scorecard
   *  (FoW, partnerships, overs, maidens) and the absolute stat sync. DERIVED:
   *  rebuilt by replaying the event log, never persisted (`snapshot` drops it),
   *  so an older or persisted state has none — selectors then return nothing. */
  log?: BallRec[];
  /** parity #20 — bonus / negative runs (ADJUST), in order. Not extras. Older states: `?? []`. */
  adj?: Adjustment[];
  /** parity #20 — dropped catches and runs saved / missed (FIELD_NOTE). Score-neutral. Older states: `?? []`. */
  fieldNotes?: FieldNote[];
  /** SD-113 — innings the scorer closed because no batter was left to come in
   *  (short squad, subs, a retired-hurt batter who can't resume) before
   *  `wicketsLimit`. Set only by a `v: 2` wicket with `noBatterLeft: true`;
   *  absent on older states (REVIEW Decision 8). Counts as all out (NRR too). */
  closedNoBatter?: Partial<Record<'home' | 'away', true>>;
}

/** A bonus (+) or deduction (−) to one side's total (parity #20). */
export interface Adjustment {
  side: 'home' | 'away';
  runs: number;
  reason?: string;
  /** overs of the batting innings when it was applied, e.g. "4.3" */
  at: string;
}

export type FieldNoteKind = 'drop' | 'saved' | 'missed';
/** A fielding note tied to the last ball (parity #20): a dropped catch, or runs
 *  saved / missed in the field. Credits one fielder stat; never the score. */
export interface FieldNote {
  kind: FieldNoteKind;
  fielderId: string;
  fielderName?: string;
  /** runs saved / missed (a drop's optional "runs it cost") */
  runs?: number;
  /** the batter who faced (was dropped) and the bowler, from the last ball */
  batterId?: string;
  bowlerId?: string;
  /** the fielding side (the fielder's team) */
  side: 'home' | 'away';
  /** the ball it belongs to, e.g. "4.3" */
  at: string;
}

/** One scored ball (or penalty / no-delivery dismissal) — parity #19. Pushed by
 *  the reducer for RUNS, BYES/LEGBYES, WICKET, EXTRA and PENALTY; ids are the
 *  crease as the ball was bowled (before any strike swap). Run splits mirror the
 *  innings / BowlCard accounting: `bat + wd + nb` is exactly what the bowler is
 *  charged; `b`, `lb`, `pen` are team extras the bowler isn't. */
export interface BallRec {
  inn: 1 | 2;
  side: 'home' | 'away';
  /** counted as a ball of the over (incl. a wide / no-ball made legal by local rules) */
  legal: boolean;
  /** runs off the bat (credited to the striker) */
  bat: number;
  /** wide runs (penalty + any run) / the no-ball penalty */
  wd: number;
  nb: number;
  b: number;
  lb: number;
  pen?: number;
  /** parity #20 — a bonus / deduction (ADJUST): team runs, not extras */
  adj?: number;
  /** parity #20 — a penalty / adjustment to the side NOT batting at the time
   *  (its innings' totals; no crease, no bowler) */
  cross?: true;
  /** team runs / wickets / legal balls of this innings AFTER the ball */
  tr: number;
  tw: number;
  lb6: number;
  strikerId?: string;
  nonStrikerId?: string;
  bowlerId?: string;
  bowlerName?: string;
  out?: { id: string; name: string; kind: DismissalKind };
  /** the over-strip chip (absent for a penalty / retired / timed out) */
  sym?: string;
  /** a wide / no-ball delivery (counted even when its penalty is 0) */
  ext?: 'wd' | 'nb';
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

export type DismissalKind = 'bowled' | 'caught' | 'lbw' | 'stumped' | 'runout' | 'hitwicket' | 'retired' | 'timedout'
  // parity #16 — none of these is the bowler's wicket
  | 'retiredout' | 'mankad' | 'hittwice' | 'obstruct';

/** How a run-out's / obstruction's completed runs are scored (parity #16):
 *  off the bat (default — legacy), or as byes / leg byes (team extras). */
export type RunsAs = 'bat' | 'bye' | 'legbye';
/** Where the wicket was broken (parity #16) — the new batter takes that end. */
export type WicketEnd = 'striker' | 'bowler';

const blankInnings = (): Innings => ({ runs: 0, wickets: 0, balls: 0, extras: 0 });

/** The limited-overs bowling quota (parity #17): overs ÷ 5, rounded up (a part
 *  over counts); none for a Test / timeless match (100+ overs). */
export const autoQuota = (overs: number): number => (overs >= 100 ? 0 : Math.ceil(overs / 5));

/** Re-derive an AUTO quota for a new overs limit (rain cut — and #18's SET_OVERS).
 *  A quota fixed in the format (`bowlerMaxOvers`) is left alone. */
export const recomputeQuota = (s: CricketState, newOvers: number): CricketState =>
  (s.bowlerQuotaAuto ? { ...s, bowlerQuota: autoQuota(newOvers) } : s);

const quotaFromConfig = (config?: Record<string, unknown>) => {
  const fixed = Math.max(0, Math.floor(Number(config?.bowlerMaxOvers ?? 0) || 0));
  return fixed > 0
    ? { bowlerQuota: fixed, bowlerQuotaAuto: false }
    : { bowlerQuota: autoQuota(Number(config?.overs ?? 20)), bowlerQuotaAuto: true };
};

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
  rules: rulesFromConfig(config),
  ...quotaFromConfig(config),
  lastOverBowlerIds: [],
  overBowlers: [],
  barredBowlers: [],
  r1Lost: 0,
  r2Lost: 0,
  inn1Overs: Number(config?.overs ?? 20),
  log: [],
  adj: [],
  fieldNotes: [],
  events: [],
  seq: 0,
  ended: false,
});

/** Overs bowled so far in the current innings (for the powerplay window). */
export const oversBowled = (s: CricketState) => Math.floor(s.scores[s.battingSide].balls / s.ballsPerOver);
/** True while the innings is inside its powerplay (fielding restrictions). */
export const inPowerplay = (s: CricketState) =>
  s.powerplayOvers > 0 && !s.ended && oversBowled(s) < s.powerplayOvers;

/** Auto commentary for a delivery. `isBoundary` (parity #15): only a real
 *  boundary reads "FOUR!"/"SIX!" — an all-run 4 or overthrows read as runs. */
function commentary(kind: 'runs' | 'wicket' | 'extra', value: number, batter?: string, bowler?: string, isBoundary = value === 4 || value === 6, overthrows = 0, allRun = false): string {
  const b = batter ?? 'the batter';
  if (kind === 'wicket') return `${bowler ? bowler + ' strikes — ' : ''}${b} departs`;
  if (kind === 'extra') return 'extra, free run';
  if (value === 0) return `${b} defends, no run`;
  if (isBoundary && value === 4) return `FOUR! ${b} finds the boundary`;
  if (isBoundary && value === 6) return `SIX! ${b} goes downtown`;
  if (overthrows > 0) return `${b} gets ${value} — ${overthrows} of them overthrows`;
  if (allRun) return `${b} runs ${value} — all run`;
  return `${b} works it for ${value}`;
}

// ─── Run entry helpers (parity #15) ───────────────────────────────────────────

/** Runs on one ball: a whole number 0–99 (typo guard). Used for every runs payload. */
export const clampRuns = (n: unknown): number => Math.min(99, Math.max(0, Math.floor(Number(n) || 0)));

/** Was this many off-the-bat runs a boundary? An explicit `boundary` flag wins;
 *  a MISSING flag is a legacy event → a 4 or 6 is a boundary (replays unchanged).
 *  Only a 4 or 6 can be a boundary, and overthrows are never a batter's four. */
export const isBoundaryHit = (r: number, boundary: unknown, overthrows = 0): boolean =>
  (r === 4 || r === 6) && overthrows <= 0 && (boundary === undefined || boundary === null ? true : boundary === true);

/** Over-strip chip for runs off the bat: a boundary '4'/'6'; overthrows '5ot';
 *  an all-run 4/6 '4r'/'6r'; otherwise the number. */
export function runSymbol(r: number, isBoundary: boolean, overthrows = 0): string {
  if (isBoundary && (r === 4 || r === 6)) return String(r);
  if (overthrows > 0) return `${r}ot`;
  if (r === 4 || r === 6) return `${r}r`;
  return String(r);
}

/** The extra penalty for a wide / no-ball (standard 1; local rules — #14 — may
 *  change it). The one place the "1 +" lives. */
export const penalty = (kind: 'wide' | 'noball', rules?: Pick<CricketRules, 'wideRuns' | 'noBallRuns'>): number =>
  kind === 'noball' ? (rules?.noBallRuns ?? 1) : (rules?.wideRuns ?? 1);

/** Runs conceded on a single ball, decoded from its over-strip symbol
 *  (e.g. '4'→4, '5ot'→5, '4r'→4, '2+W'→2, 'wd'→1, '3wd'→3, '2nb'→3, 'lb2'→2,
 *  'W'/'0'→0). `rules`: the penalties in force (#14; default standard). A wide
 *  with runs already carries its total ('3wd'); a no-ball carries the runs only. */
export function ballRuns(sym: string, rules?: Pick<CricketRules, 'wideRuns' | 'noBallRuns'>): number {
  // A wicket on an extra (parity #16): 'wd+W' / '1wd+W' / '2nb+W' carry the runs
  // completed only (the penalty is implied); '2b+W' / '2lb+W' are byes; '2+W' off the bat.
  if (sym.endsWith('+W')) {
    const base = sym.slice(0, -2);
    const n = parseInt(base, 10) || 0;
    if (base.endsWith('wd')) return penalty('wide', rules) + n;
    if (base.endsWith('nb')) return penalty('noball', rules) + n;
    return n;
  }
  if (sym.endsWith('nb')) return penalty('noball', rules) + (parseInt(sym, 10) || 0);
  if (sym === 'wd') return penalty('wide', rules);
  if (sym.startsWith('lb')) return parseInt(sym.slice(2), 10) || 1;
  if (sym.startsWith('b')) return parseInt(sym.slice(1), 10) || 1;
  return parseInt(sym, 10) || 0; // '4', '5ot', '4r', '2+W', 'W', '3wd'
}

/** Theme-free tone of an over-strip chip: a wicket, a real boundary ('4'/'6'
 *  only — not '4r'/'5ot'), an extra, or plain runs. UI maps it to a colour. */
export function symbolTone(sym: string): 'wicket' | 'boundary' | 'extra' | 'plain' {
  if (sym === 'W' || sym.endsWith('W')) return 'wicket';
  if (sym === '4' || sym === '6') return 'boundary';
  if (sym.endsWith('wd') || sym.endsWith('nb') || sym.startsWith('b') || sym.startsWith('lb')) return 'extra';
  return 'plain';
}

/** Scorecard dismissal text, e.g. "c Veer b Ishaan", "lbw b Ishaan", "run out (Veer)",
 *  "run out (Veer/Dev)" with a 2nd fielder, "run out (Ishaan)" for a Mankad. */
function composeDismissal(kind: DismissalKind, bowler?: string, fielder?: string, keeper?: string, fielder2?: string): string {
  const b = bowler ?? 'bowler';
  switch (kind) {
    case 'bowled': return `b ${b}`;
    case 'lbw': return `lbw b ${b}`;
    case 'hitwicket': return `hit wkt b ${b}`;
    case 'stumped': return `st ${keeper ?? '†wk'} b ${b}`;
    case 'caught': return fielder && fielder === bowler ? `c & b ${b}` : `c ${fielder ?? 'fielder'} b ${b}`;
    case 'runout': {
      const fs = [fielder, fielder2].filter(Boolean);
      return `run out${fs.length ? ` (${fs.join('/')})` : ''}`;
    }
    // A Mankad is a run-out by the bowler (2022 Laws) — never the bowler's wicket.
    case 'mankad': return `run out (${b})`;
    case 'retired': return 'retired hurt';
    case 'retiredout': return 'retired out';
    case 'timedout': return 'timed out';
    case 'hittwice': return 'hit the ball twice';
    case 'obstruct': return 'obstructing the field';
    default: return 'out';
  }
}
const WICKET_LABEL: Record<DismissalKind, string> = {
  bowled: 'BOWLED', caught: 'CAUGHT', lbw: 'LBW', stumped: 'STUMPED', runout: 'RUN OUT', hitwicket: 'HIT WICKET',
  retired: 'RETIRED HURT', timedout: 'TIMED OUT',
  retiredout: 'RETIRED OUT', mankad: 'MANKAD', hittwice: 'HIT TWICE', obstruct: 'OBSTRUCTING',
};
/** The same kinds in sentence case — the button / chip names everywhere a
 *  scorer picks a dismissal (live panel and over editor). WICKET_LABEL stays
 *  upper case: it's the timeline headline. */
export const DISMISSAL_NAME: Record<DismissalKind, string> = {
  bowled: 'Bowled', caught: 'Caught', lbw: 'LBW', stumped: 'Stumped', runout: 'Run out', hitwicket: 'Hit wicket',
  retired: 'Retired hurt', timedout: 'Timed out',
  retiredout: 'Retired out', mankad: 'Mankad', hittwice: 'Hit twice', obstruct: 'Obstructing',
};
/** Dismissals that aren't credited to the bowler. */
const NO_BOWLER: DismissalKind[] = ['runout', 'retired', 'timedout', 'retiredout', 'mankad', 'hittwice', 'obstruct'];
/** "Dismissals" that involve no delivery (happen between balls). */
const NO_DELIVERY: DismissalKind[] = ['retired', 'timedout', 'retiredout', 'mankad'];
/** Wickets that can fall on a wide / a no-ball (parity #16), routed through EXTRA. */
export const WIDE_WICKETS: DismissalKind[] = ['runout', 'stumped', 'hitwicket', 'obstruct'];
export const NOBALL_WICKETS: DismissalKind[] = ['runout', 'hittwice', 'obstruct'];
/** Kinds whose completed runs count (and so take `runsAs`). */
export const RUNS_KINDS: DismissalKind[] = ['runout', 'obstruct'];

type Crease = Pick<CricketState, 'strikerId' | 'strikerName' | 'nonStrikerId' | 'nonStrikerName'>;
/** Who is where after a wicket broken at `end` (parity #16): the new batter
 *  takes the end where the wicket was broken, the survivor the other; then the
 *  ends swap if the over just ended. `s` is the crease the ball was bowled
 *  with. The live UI previews "Next ball: X faces" with this too. */
export function creaseAfterWicket(
  s: Crease, batterOut: 'striker' | 'nonstriker', end: WicketEnd,
  newBat: { id?: string; name?: string } | undefined, overEnd: boolean,
): Crease {
  const survivor = batterOut === 'nonstriker'
    ? { id: s.strikerId, name: s.strikerName }
    : { id: s.nonStrikerId, name: s.nonStrikerName };
  const nb = { id: newBat?.id, name: newBat?.name };
  const [atStriker, atBowler] = end === 'striker' ? [nb, survivor] : [survivor, nb];
  const [st, ns] = overEnd ? [atBowler, atStriker] : [atStriker, atBowler];
  return { strikerId: st.id, strikerName: st.name, nonStrikerId: ns.id, nonStrikerName: ns.name };
}

/** Over-strip chip for a wicket ball with completed runs (parity #16):
 *  'W', '2+W' (off the bat), '2b+W' / '2lb+W' (byes / leg byes). */
export const wicketSymbol = (completed: number, runsAs: RunsAs = 'bat'): string =>
  completed > 0 ? `${completed}${runsAs === 'bye' ? 'b' : runsAs === 'legbye' ? 'lb' : ''}+W` : 'W';
const asRunsAs = (v: unknown): RunsAs => (v === 'bye' || v === 'legbye' ? v : 'bat');
const asEnd = (v: unknown): WicketEnd | undefined => (v === 'striker' || v === 'bowler' ? v : undefined);
const runsText = (n: number, runsAs: RunsAs) =>
  `${n} ${runsAs === 'bye' ? `bye${n === 1 ? '' : 's'}` : runsAs === 'legbye' ? `leg bye${n === 1 ? '' : 's'}` : `run${n === 1 ? '' : 's'}`}`;

type Attr = NonNullable<ScoreAction['attribution']>;
/** The stat credits for a wicket (parity #16) — one rule shared by the live UI
 *  and the #06 ball editor. `attribution`: the bowler's wicket (bowler kinds),
 *  fielder 1's run-out, or the bowler's run-out for a Mankad. `attribution2`:
 *  the catch / stumping, or — the ONLY owner of it (REVIEW Decision 6) — the
 *  striker's completed runs off the bat on a run-out / obstruction. Fielder 2
 *  gets no stat. */
export function wicketAttribution(o: {
  kind: DismissalKind;
  bowler?: { id?: string; name?: string };
  fielder?: { id?: string; name?: string };
  keeper?: { id?: string; name?: string };
  striker?: { id?: string; name?: string };
  runs?: number;
  runsAs?: RunsAs;
  /** on a wide, completed runs are wides — never the batter's */
  wide?: boolean;
}): { attribution?: Attr; attribution2?: Attr } {
  const { kind, bowler, fielder, keeper, striker } = o;
  const credit = (p: { id?: string; name?: string } | undefined, stat: string, by?: number): Attr | undefined =>
    p?.id ? { playerId: p.id, stat, ...(by !== undefined ? { by } : {}), playerName: p.name } : undefined;
  const runs = o.runs ?? 0;
  const strikerRuns = RUNS_KINDS.includes(kind) && !o.wide && (o.runsAs ?? 'bat') === 'bat' && runs > 0
    ? credit(striker, 'runs', runs) : undefined;
  if (kind === 'runout') return { attribution: credit(fielder, 'runouts'), attribution2: strikerRuns };
  if (kind === 'obstruct') return { attribution2: strikerRuns };
  if (kind === 'mankad') return { attribution: credit(bowler, 'runouts') };
  if (NO_BOWLER.includes(kind)) return {};
  return {
    attribution: credit(bowler, 'wickets', 1),
    attribution2: kind === 'caught' ? credit(fielder, 'catches') : kind === 'stumped' ? credit(keeper, 'stumpings') : undefined,
  };
}

// Overs bowled, e.g. 6 balls → "1.0" (used for over counts: totals, RR, figures).
export const oversStr = (balls: number, bpo = 6) => `${Math.floor(balls / bpo)}.${balls % bpo}`;

/** SD-13 — a side has no batter left to come in: all out, or its wickets plus
 *  the retired-hurt batters who never resumed use up the order (ICC: a side
 *  that can't continue its innings counts as all out for NRR). */
export function noBatterLeft(s: CricketState, side: 'home' | 'away'): boolean {
  // SD-113 — the scorer closed it: nobody on the roster could come in.
  if (s.closedNoBatter?.[side]) return true;
  const inn = s.scores[side];
  if (inn.wickets >= s.wicketsLimit) return true;
  const retired = Object.values(s.batting ?? {}).filter((c) => c.side === side && c.retired && !c.out).length;
  return retired > 0 && inn.wickets + retired >= s.wicketsLimit;
}

/** SD-13 — the chase was played to a revised target (ICC NRR: DLS or a target
 *  set by hand). v2 matches only (REVIEW Decision 8): a legacy (no `dlsV`)
 *  match keeps its stored maths. */
const revisedChase = (s: CricketState): boolean =>
  s.dlsV === 2 && s.innings === 2 && s.target !== undefined && (s.revision === 'dls' || s.revision === 'manual');

/** Overs faced by each side for Net Run Rate (ICC playing conditions, SD-13):
 *  • a side all out — or with no batter left to come in — is charged its full
 *    quota, not the fraction it actually batted;
 *  • v2 matches (`dlsV`): the side batting first keeps its OWN quota (the
 *    overs it was scheduled when its innings ran), not a later cut that only
 *    hit the chase; and in a chase to a revised target, the side batting first
 *    is credited with the overs the chasing side was allotted (with
 *    `nrrRuns`' target − 1).
 *  Legacy matches (no `dlsV`) compute exactly as before, except that the
 *  "no batter left" innings now counts as all out (the bug fix). */
export function nrrOvers(s: CricketState): { home: number; away: number } {
  const facedOvers = (side: 'home' | 'away', quota: number) =>
    noBatterLeft(s, side) ? quota : s.scores[side].balls / s.ballsPerOver;
  if (s.dlsV !== 2 || s.innings !== 2) {
    return { home: facedOvers('home', s.oversLimit), away: facedOvers('away', s.oversLimit) };
  }
  const t2 = s.battingSide;
  const t1 = other(t2);
  // The chase's allotment is the final length (a rain cut / agreed change in
  // innings 2 moves `oversLimit`).
  const t2Overs = facedOvers(t2, s.oversLimit);
  // Team 1's own quota: its scheduled length (`inn1Overs`, which an agreed
  // SET_OVERS in innings 1 updates) unless rain cut innings 1 — then the
  // reduced length it finished on, i.e. what the chase started with.
  const t1Quota = s.r1Lost === 0 ? (s.inn1Overs ?? s.oversLimit) : s.oversLimit;
  const t1Overs = revisedChase(s) ? s.oversLimit : facedOvers(t1, t1Quota);
  return t1 === 'home' ? { home: t1Overs, away: t2Overs } : { home: t2Overs, away: t1Overs };
}

/** Runs each side is credited with for NRR (SD-13), or null when they are
 *  just the scores. ICC: in a chase to a revised target, the side batting
 *  first is credited with target − 1 (off the chase's allotted overs — see
 *  `nrrOvers`); the chasing side keeps its actual runs. v2 matches only. */
export function nrrRuns(s: CricketState): { home: number; away: number } | null {
  if (!revisedChase(s)) return null;
  const t2 = s.battingSide;
  const credited = s.target! - 1;
  return t2 === 'home' ? { home: s.scores.home.runs, away: credited } : { home: credited, away: s.scores.away.runs };
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
  lastOverBowlerIds: [] as string[], overBowlers: [] as string[], barredBowlers: [] as string[],
};

// ─── Bowling rules (parity #17) ───────────────────────────────────────────────

/** Has a ball of the current over been delivered? (Then the bowler is locked —
 *  only a mid-over replacement may take over.) Older states: from the ball count. */
export const midOver = (s: CricketState): boolean =>
  s.overBowlers ? s.overBowlers.length > 0 : s.ballsInOver > 0 && s.ballsInOver < s.ballsPerOver;

/** 0-based index of the over the next ball belongs to. */
const currentOverIx = (s: CricketState) => Math.floor(s.scores[s.battingSide].balls / s.ballsPerOver);

/** Overs (incl. part-overs) a bowler has bowled this innings. */
export const oversUsed = (s: CricketState, id: string): number => s.bowling[id]?.overs?.length ?? 0;

export type BowlBlock = 'last-over' | 'quota' | 'barred' | 'unavailable' | 'this-over';
/** May `id` bowl (or take over) the current over? Order: hard blocks first, the
 *  quota last — it is the only one a `force` can override. */
export function canBowl(s: CricketState, id: string): { ok: boolean; reason?: BowlBlock } {
  if (s.unavailable.includes(id)) return { ok: false, reason: 'unavailable' };
  if ((s.barredBowlers ?? []).includes(id)) return { ok: false, reason: 'barred' };
  const last = s.lastOverBowlerIds ?? [];
  if (id === s.lastOverBowlerId || last.includes(id)) return { ok: false, reason: 'last-over' };
  if (midOver(s) && id !== s.bowlerId && (s.overBowlers ?? []).includes(id)) return { ok: false, reason: 'this-over' };
  const q = s.bowlerQuota ?? 0;
  const overs = s.bowling[id]?.overs ?? [];
  if (q > 0 && overs.length >= q && !overs.includes(currentOverIx(s))) return { ok: false, reason: 'quota' };
  return { ok: true };
}

/** Overs used up, all out by `wicketsLimit`, or (SD-113, roster-aware) the
 *  scorer confirmed no batter was left to come in — `closedNoBatter`, which only
 *  a `v: 2` wicket sets, so legacy logs close exactly as before. */
function inningsComplete(s: CricketState, inn: Innings, side: 'home' | 'away' = s.battingSide): boolean {
  return inn.balls >= s.oversLimit * s.ballsPerOver || inn.wickets >= s.wicketsLimit || !!s.closedNoBatter?.[side];
}

/** SD-113 (R2) — a Law 28 / 41 five-run penalty riding on one delivery
 *  (`payload.pen`, `v: 2` only): the ball is applied, then the penalty, as one
 *  logged action (one entry, one Undo). Null for anything else. */
export interface BallPenalty { runs: number; against: 'batting' | 'fielding'; reason?: string; teamName?: string }
export function ballPenaltyOf(a: ScoreAction): BallPenalty | null {
  const p = a.payload;
  if (!p || p.v !== 2 || !p.pen || typeof p.pen !== 'object') return null;
  if (!BALL_TYPES.has(a.type)) return null;
  // Retired / timed out / Mankad aren't deliveries — no ball to ride on.
  if (a.type === 'WICKET' && NO_DELIVERY.includes(String(p.kind ?? 'bowled') as DismissalKind)) return null;
  const q = p.pen as Record<string, unknown>;
  const runs = Math.floor(Number(q.runs ?? 5));
  if (!Number.isFinite(runs) || runs < 1 || runs > 99) return null;
  return {
    runs,
    against: q.against === 'batting' ? 'batting' : 'fielding',
    ...(textOf(q.reason) ? { reason: textOf(q.reason) } : {}),
    ...(textOf(q.teamName) ? { teamName: textOf(q.teamName) } : {}),
  };
}

export interface BallInfo {
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

/** Ball actions — each carries the striker/bowler it was bowled with. */
const BALL_TYPES = new Set(['RUNS', 'BYES', 'LEGBYES', 'WICKET', 'EXTRA']);

/** Parity #06 — each ball's RECORDED striker is the truth. If the payload names
 *  the batter currently at the non-striker's end, swap ends before applying it
 *  (an edited earlier ball can change the derived rotation). Live-recorded logs
 *  always stamp the current striker, so this is a no-op for them. */
export const alignCrease = (s: CricketState, info: BallInfo): CricketState =>
  info.strikerId && s.nonStrikerId && info.strikerId === s.nonStrikerId && info.strikerId !== s.strikerId ? swapStrike(s) : s;

// ─── Overs & target (parity #18) ──────────────────────────────────────────────

/** Round away float dust (42.6 stays 42.6) so a target never floors a hair low. */
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
/** 6-ball overs remaining in an innings of `overs` (×bpo balls) with `balls` bowled. */
const uLeft = (overs: number, balls: number, bpo: number) => Math.max(0, (overs * bpo - balls) / 6);

/** DLS resources (%) each side has — Standard Edition (v2 matches only):
 *  scheduled overs' full resources less what interruptions took. */
export function dlsResources(s: CricketState): { r1: number; r2: number } {
  const bpo = s.ballsPerOver;
  return {
    r1: r6(resourcePct(((s.inn1Overs ?? s.oversLimit) * bpo) / 6, 0) - s.r1Lost),
    r2: r6(resourcePct(((s.inn2Overs ?? s.oversLimit) * bpo) / 6, 0) - s.r2Lost),
  };
}

/** The chase's target when innings 2 starts (`settle` / END_INNINGS). Legacy:
 *  today's formula (team 2 assumed 100%). v2: DLS only if innings 1 was cut —
 *  team 2's resources are its full (possibly reduced) allocation. */
function chaseStart(s: CricketState, runs: number): Pick<CricketState, 'target' | 'inn2Overs'> {
  const inn2Overs = s.oversLimit;
  if (s.dlsV !== 2) return { inn2Overs, target: revisedTarget(runs, 100 - s.r1Lost, 100) };
  if (!(s.dls && s.r1Lost !== 0)) return { inn2Overs, target: runs + 1 };
  const { r1 } = dlsResources(s);
  return { inn2Overs, target: revisedTarget(runs, r1, r6(resourcePct((inn2Overs * s.ballsPerOver) / 6, 0))) };
}

/** Overs / target changes are off while a Super Over (or the call on a tie) is pending. */
const tieInPlay = (s: CricketState) => !!s.superOver || !!s.pendingTie || !!s.isSuperOver;

/** A legacy (no-`v`) rain cut has already been booked in this match, in the old
 *  resource units: a match live across the update keeps the legacy maths for
 *  the rest of the match rather than mixing units (later RAINs go legacy, and
 *  SET_OVERS only changes the length). */
const legacyRainBooked = (s: CricketState) => s.revision === 'dls' && s.dlsV !== 2;

/** A v:2 rain interruption: ball-accurate resources lost on the Standard Edition
 *  table; in the chase the target is revised from both sides' resources. */
function rainV2(s: CricketState, newOvers: number): CricketState {
  if (!s.dls || s.dlsLocked || tieInPlay(s)) return s;
  const bpo = s.ballsPerOver;
  const inn = s.scores[s.battingSide];
  if (!(newOvers * bpo > inn.balls && newOvers < s.oversLimit)) return s;
  const loss = Math.max(0, resourcePct(uLeft(s.oversLimit, inn.balls, bpo), inn.wickets) - resourcePct(uLeft(newOvers, inn.balls, bpo), inn.wickets));
  let next: CricketState = recomputeQuota({ ...s, oversLimit: newOvers, dlsV: 2, revision: 'dls' }, newOvers);
  if (s.innings === 1) {
    next = { ...next, r1Lost: r6(s.r1Lost + loss) };
  } else {
    next = { ...next, r2Lost: r6(s.r2Lost + loss) };
    const { r1, r2 } = dlsResources(next);
    next = { ...next, target: revisedTarget(s.scores[other(s.battingSide)].runs, r1, r2) };
    // The revised target may already be reached — the chase is won.
    if (inn.runs >= next.target!) next = { ...next, ended: true };
  }
  return {
    ...next, seq: s.seq + 1,
    events: [...s.events, { id: s.seq + 1, stamp: '☔', icon: '☔', label: `Rain — overs cut to ${newOvers}${s.innings === 2 ? ` · target ${next.target} (DLS)` : ''}`, detail: undefined, side: s.battingSide }],
  };
}

/** A trimmed non-empty string (≤ 80 chars), else undefined. */
const textOf = (v: unknown): string | undefined => {
  const x = typeof v === 'string' ? v.trim().slice(0, 80) : '';
  return x || undefined;
};
/** "the batting side" / "the fielding side" — event text when no team name rides along. */
const sideWord = (side: 'home' | 'away', bat: 'home' | 'away') => (side === bat ? 'the batting side' : 'the fielding side');

/** The last DELIVERY (parity #20) — what a fielding note attaches to: its stamp
 *  ("4.3"; a wide / no-ball shares the next legal ball's), the batter who faced,
 *  the bowler, and the side batting. From the ball log; null without one / before
 *  any ball (a persisted snapshot has no log — FIELD_NOTE then uses the crease). */
export function lastBall(s: Pick<CricketState, 'log' | 'batting' | 'ballsPerOver'>): {
  at: string; side: 'home' | 'away'; inn: 1 | 2;
  batterId?: string; batterName?: string; bowlerId?: string; bowlerName?: string;
} | null {
  const log = s.log ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    const r = log[i];
    if (r.sym === undefined || r.cross || r.out?.kind === 'mankad') continue;
    return {
      at: ballStamp(r.legal ? r.lb6 : r.lb6 + 1, s.ballsPerOver), side: r.side, inn: r.inn,
      batterId: r.strikerId, batterName: r.strikerId ? s.batting[r.strikerId]?.name : undefined,
      bowlerId: r.bowlerId, bowlerName: r.bowlerName,
    };
  }
  return null;
}

const step = (s: CricketState, a: ScoreAction): CricketState => {
  if (s.ended && a.type !== 'END' && a.type !== 'POTM') return s;

  // ── Change overs (parity #18) ─────────────────────────────────────────────
  // An agreed new length, up or down, any innings, DLS or not. No resource
  // credit and the target is unchanged. A new action type → no legacy gate;
  // it always moves the match onto the v2 maths (the UI sends `v: 2` anyway).
  if (a.type === 'SET_OVERS') {
    if (tieInPlay(s)) return s;
    const n = Math.floor(Number(a.payload?.overs));
    const inn = s.scores[s.battingSide];
    if (!Number.isFinite(n) || n < 1 || n > 999 || n * s.ballsPerOver <= inn.balls || n === s.oversLimit) return s;
    // The innings' scheduled length becomes n. If rain has already cut THIS
    // innings, its scheduled length stays and the change is booked at the
    // current ball instead (a cut adds to the loss, an extension gives some
    // back — the loss may go below 0), so R = used + remaining always holds;
    // R(n) − (losses against the old length) could go negative. With no loss
    // yet the two are the same thing.
    const lostNow = s.innings === 1 ? s.r1Lost : s.r2Lost;
    const bpo = s.ballsPerOver;
    const legacy = legacyRainBooked(s);
    const shift = legacy ? {}
      : lostNow !== 0
      ? { [s.innings === 1 ? 'r1Lost' : 'r2Lost']: r6(lostNow + resourcePct(uLeft(s.oversLimit, inn.balls, bpo), inn.wickets) - resourcePct(uLeft(n, inn.balls, bpo), inn.wickets)) }
      : s.innings === 1 ? { inn1Overs: n } : { inn2Overs: n };
    const next = recomputeQuota({ ...s, oversLimit: n, ...shift, ...(legacy ? {} : { dlsV: 2 as const }) }, n);
    return {
      ...next, seq: s.seq + 1,
      events: [...s.events, { id: s.seq + 1, stamp: oversStr(inn.balls, s.ballsPerOver), icon: '⏱', label: `Overs changed to ${n}`, detail: s.innings === 2 && s.target !== undefined ? `Target stays ${s.target}` : undefined, side: s.battingSide }],
    };
  }

  // ── Manual target (parity #18) ────────────────────────────────────────────
  // The chase only: the scorer types runs + overs (e.g. an official's sheet).
  // Built-in DLS is off for the rest of the match (later RAINs are ignored).
  if (a.type === 'SET_TARGET') {
    if (s.innings !== 2 || tieInPlay(s)) return s;
    const runs = Math.floor(Number(a.payload?.runs));
    const n = Math.floor(Number(a.payload?.overs));
    const inn = s.scores[s.battingSide];
    if (!Number.isFinite(runs) || !Number.isFinite(n) || runs < 1 || runs <= inn.runs || n < 1 || n > 999 || n * s.ballsPerOver <= inn.balls) return s;
    const next = recomputeQuota({ ...s, target: runs, oversLimit: n, inn2Overs: n, revision: 'manual', dlsLocked: true, dlsV: 2 }, n);
    return {
      ...next, seq: s.seq + 1,
      events: [...s.events, { id: s.seq + 1, stamp: oversStr(inn.balls, s.ballsPerOver), icon: '🎯', label: `Target set to ${runs} in ${n} ov`, detail: 'Revised target entered by hand — DLS off', side: s.battingSide }],
    };
  }

  // ── Rain (DLS) ────────────────────────────────────────────────────────────
  // Cut the overs; in the chase, revise the target by the resources lost.
  // `v: 2` (or a match already on v2) → Standard Edition maths; otherwise the
  // legacy path below, byte-for-byte, so stored results replay (Decision 8).
  if (a.type === 'RAIN') {
    const newOvers = Math.floor(Number(a.payload?.overs ?? s.oversLimit));
    if ((a.payload?.v === 2 || s.dlsV === 2) && !legacyRainBooked(s)) return rainV2(s, newOvers);
    const inn = s.scores[s.battingSide];
    const oversDone = Math.floor(inn.balls / s.ballsPerOver);
    if (!s.dls || newOvers <= oversDone || newOvers >= s.oversLimit) return s;
    const lost = Math.max(0, resourcePctV1(s.oversLimit - oversDone, inn.wickets) - resourcePctV1(newOvers - oversDone, inn.wickets));
    let next: CricketState = recomputeQuota({ ...s, oversLimit: newOvers, revision: 'dls' }, newOvers);
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

  // ── Local rules (parity #14) ──────────────────────────────────────────────
  // Handled before Super-Over routing: it changes the PARENT match only (a Super
  // Over is always played to standard rules). Applies from the next ball.
  if (a.type === 'SET_RULES') {
    const prev = rulesOf(s);
    const next = patchRules(prev, a.payload);
    const text = describeRulesChange(prev, next);
    if (!text) return s;
    const inn = s.scores[s.battingSide];
    return {
      ...s, rules: next, seq: s.seq + 1,
      events: [...s.events, { id: s.seq + 1, stamp: oversStr(inn.balls, s.ballsPerOver), icon: '⚙️', label: 'RULES', detail: text, side: s.battingSide }],
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

  const info = ballInfo(a);
  if (BALL_TYPES.has(a.type)) {
    const aligned = alignCrease(s, info);
    if (aligned !== s) return reducer(aligned, a);
  }

  const bat = s.battingSide;
  const cur = s.scores[bat];
  let seq = s.seq;
  // Who faced this delivery: the recorded striker (payload), else the crease.
  const strikerId = info.strikerId ?? s.strikerId;
  const strikerName = info.strikerId ? (info.strikerName ?? s.strikerName) : s.strikerName;

  // Start of a fresh over? (a legal ball arrives after 6 were bowled)
  const newOver = s.ballsInOver >= s.ballsPerOver;
  const baseOver = newOver ? [] : s.thisOver;
  const baseBalls = newOver ? 0 : s.ballsInOver;

  // SD-113 (A3/R1) — a v:2 wicket confirmed with "no batter left": the innings
  // closes on it even short of `wicketsLimit` (short squad, subs, a retired-hurt
  // batter who can't resume). Only a WICKET / a wicket off an extra may carry it.
  const closeNoBatter = a.payload?.v === 2 && a.payload?.noBatterLeft === true
    && (a.type === 'WICKET' || (a.type === 'EXTRA' && !!(a.payload?.wicket || a.payload?.runout)));
  const settle = (state0: CricketState): CricketState => {
    let state = state0;
    const c = state.scores[state.battingSide];
    if (state.innings === 2 && state.target !== undefined && c.runs >= state.target) return { ...state, ended: true };
    if (closeNoBatter && !state.closedNoBatter?.[state.battingSide] && !inningsComplete(state, c)) {
      const sq = state.seq + 1;
      state = {
        ...state,
        closedNoBatter: { ...state.closedNoBatter, [state.battingSide]: true },
        events: [...state.events, { id: sq, stamp: oversStr(c.balls, state.ballsPerOver), icon: '🏁', label: 'INNINGS CLOSED', detail: `No batter left to come in — ${c.runs}/${c.wickets}, counts as all out`, side: state.battingSide }],
        seq: sq,
      };
    }
    if (!inningsComplete(state, c)) return state;
    if (state.innings === 1) {
      return { ...state, innings: 2, battingSide: other(state.battingSide), ...chaseStart(state, c.runs), thisOver: [], ballsInOver: 0, ...clearCrease };
    }
    // Second innings done without reaching the target: a loss — or a level score.
    // A level regulation match pauses for the scorer's call (Super Over or accept
    // the tie); a level Super Over just ends so the parent can decide the next step.
    // v2 (#18): level means level with PAR (target − 1) — a revised target moves it.
    const level = state.dlsV === 2 && state.target !== undefined
      ? c.runs === state.target - 1
      : state.scores.home.runs === state.scores.away.runs;
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

  // Parity #17 — every delivery (legal or not) records that its bowler bowled
  // part of this over: the over index on their card (quota) and `overBowlers`
  // (next-over rule). Applied to the state a delivery branch builds, before
  // `afterLegalBall` rolls the over.
  const overIx = Math.floor(cur.balls / s.ballsPerOver);
  const touchBowler = (next: CricketState): CricketState => {
    const id = info.bowlerId;
    if (!id) return next;
    const card = next.bowling[id];
    const overs = card?.overs ?? [];
    const bowling = card && !overs.includes(overIx) ? { ...next.bowling, [id]: { ...card, overs: [...overs, overIx] } } : next.bowling;
    // (Not reset on `newOver`: the over end already emptied it, and a wide that
    // opens an over leaves `ballsInOver` at 6 — resetting then would forget its bowler.)
    const base = s.overBowlers ?? [];
    return { ...next, bowling, overBowlers: base.includes(id) ? base : [...base, id] };
  };

  const overEnd = baseBalls + 1 >= s.ballsPerOver;
  // End-of-(legal)-ball housekeeping: strike rotation, over change (clear the
  // bowler & remember who bowled it so they can't bowl two in a row), and
  // consuming the free hit (any legal delivery clears it — unless it is itself
  // a legal no-ball/wide under local rules, which may keep one: `freeHitAfter`).
  // An innings end still clears it (settle → clearCrease).
  const afterLegalBall = (next: CricketState, rotate: boolean, freeHitAfter = false): CricketState => {
    let r = rotate ? swapStrike(next) : next;
    if (overEnd) {
      // Everyone who bowled any part of this over sits out the next (Law 17.6/17.8).
      const ids = [...new Set([...(r.overBowlers ?? []), ...(s.bowlerId ? [s.bowlerId] : [])])];
      r = { ...r, lastOverBowlerId: s.bowlerId, lastOverBowlerIds: ids, overBowlers: [], bowlerId: undefined, bowlerName: undefined };
    }
    return settle({ ...r, freeHit: freeHitAfter });
  };
  // Rules in force for THIS ball (local rules, or standard in the last N overs).
  const R = effectiveRules(s);

  switch (a.type) {
    case 'RUNS': {
      // Payload { runs, boundary?, overthrows? } (parity #15). A missing
      // `boundary` is a legacy event: a 4 or 6 is a boundary.
      const r = clampRuns(a.payload?.runs);
      const ot = Math.min(r, clampRuns(a.payload?.overthrows));
      const isBoundary = isBoundaryHit(r, a.payload?.boundary, ot);
      const balls = cur.balls + 1;
      seq += 1;
      const runsLabel = `${r} run${r === 1 ? '' : 's'}`;
      const label = isBoundary ? (r === 4 ? 'FOUR' : 'SIX')
        : ot > 0 ? `${runsLabel} (incl. ${ot} overthrow${ot === 1 ? '' : 's'})`
        : r === 4 || r === 6 ? `${runsLabel} (all run)`
        : runsLabel;
      const next: CricketState = touchBowler({
        ...s,
        scores: { ...s.scores, [bat]: { ...cur, runs: cur.runs + r, balls } },
        batting: bumpBat({ runs: r, balls: 1, fours: isBoundary && r === 4 ? 1 : 0, sixes: isBoundary && r === 6 ? 1 : 0 }),
        bowling: bumpBowl({ runs: r, balls: 1 }),
        thisOver: [...baseOver, runSymbol(r, isBoundary, ot)],
        ballsInOver: baseBalls + 1,
        events: [...s.events, { id: seq, stamp: ballStamp(balls, s.ballsPerOver), icon: '🏏', label, detail: commentary('runs', r, info.strikerName, info.bowlerName, isBoundary, ot, a.payload?.boundary === false && r >= 4), side: bat, tone: isBoundary ? 'boundary' : undefined }],
        seq,
      });
      // Strike rotation: odd runs swap ends, and the end of an over swaps ends.
      // Both happening (a single off the last ball) cancel out — hence XOR.
      // (A boundary overthrow adds 4 — even — so parity = runs actually run.)
      return afterLegalBall(next, (r % 2 === 1) !== overEnd);
    }
    case 'BYES':
    case 'LEGBYES': {
      const r = Math.max(1, a.payload?.runs === undefined ? 1 : clampRuns(a.payload?.runs));
      const isLeg = a.type === 'LEGBYES';
      // Disabled by local rules → rejected here, so voice scoring can't bypass it.
      // (Legacy logs have standard rules, so they replay identically.)
      if (isLeg ? !rulesOf(s).legByes : !rulesOf(s).byes) return s;
      const balls = cur.balls + 1;
      seq += 1;
      const next: CricketState = touchBowler({
        ...s,
        // byes/leg-byes are team extras — not the batter's runs, not charged to the bowler
        scores: { ...s.scores, [bat]: { ...cur, runs: cur.runs + r, extras: cur.extras + r, balls } },
        batting: applyBat(s.batting, strikerId, strikerName, { balls: 1 }),
        bowling: bumpBowl({ balls: 1 }),
        thisOver: [...baseOver, (isLeg ? 'lb' : 'b') + (r > 1 ? r : '')],
        ballsInOver: baseBalls + 1,
        events: [...s.events, { id: seq, stamp: ballStamp(balls, s.ballsPerOver), icon: '➕', label: `${isLeg ? 'Leg bye' : 'Bye'}${r > 1 ? ` ${r}` : ''}`, detail: undefined, side: bat, tone: 'extra' }],
        seq,
      });
      return afterLegalBall(next, (r % 2 === 1) !== overEnd);
    }
    case 'WICKET': {
      const kind = (String(a.payload?.kind ?? 'bowled') as DismissalKind);
      // Hit the ball twice: only the striker. A Mankad: always the non-striker,
      // whoever the payload names (parity #16).
      const batterOut: 'striker' | 'nonstriker' = kind === 'mankad' ? 'nonstriker'
        : kind === 'hittwice' ? 'striker'
        : a.payload?.batterOut === 'nonstriker' ? 'nonstriker' : 'striker';
      const keeper = s.keepers[other(bat)]?.name;
      const fielder2Id = kind === 'runout' ? (a.payload?.fielder2Id as string | undefined) : undefined;
      const fielder2Name = kind === 'runout' ? (a.payload?.fielder2Name as string | undefined) : undefined;
      const dismissal = composeDismissal(kind, info.bowlerName, a.payload?.fielderName as string | undefined, keeper, fielder2Name);
      const outId = batterOut === 'nonstriker' ? s.nonStrikerId : strikerId;
      const outName = batterOut === 'nonstriker' ? s.nonStrikerName : strikerName;
      const newBatId = a.payload?.newBatId as string | undefined;
      const newBatName = a.payload?.newBatName as string | undefined;
      // The new batsman fills whichever end the departing batsman vacated.
      const creaseFor = (id?: string, name?: string) =>
        batterOut === 'nonstriker' ? { nonStrikerId: id, nonStrikerName: name } : { strikerId: id, strikerName: name };

      // Mankad (parity #16): the bowler runs out the non-striker before
      // delivering — a wicket, NOT a ball and not the bowler's wicket. A 'W'
      // chip in the over strip; a pending free hit is kept.
      if (kind === 'mankad') {
        seq += 1;
        let batting = applyBat(s.batting, outId, outName, { out: true, dismissal });
        if (newBatId) batting = applyBat(batting, newBatId, newBatName, { retired: false });
        const overReset = s.ballsInOver >= s.ballsPerOver ? [] : s.thisOver;
        return settle({
          ...s,
          scores: { ...s.scores, [bat]: { ...cur, wickets: cur.wickets + 1 } },
          batting,
          dismissals: [...s.dismissals, { kind, outId, bowlerId: info.bowlerId, fielderId: info.bowlerId, fielderName: info.bowlerName }],
          thisOver: [...overReset, 'W'],
          events: [...s.events, { id: seq, stamp: oversStr(cur.balls, s.ballsPerOver), icon: '🎯', label: WICKET_LABEL[kind], detail: `${outName ?? 'Batter'} ${dismissal} — left the crease early`, side: other(bat), tone: 'wicket' }],
          seq,
          ...creaseFor(newBatId, newBatName),
        });
      }

      // Retired hurt / retired out / timed out — no delivery is bowled, no bowler involved.
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
          events: [...s.events, { id: seq, stamp: oversStr(cur.balls, s.ballsPerOver), icon: kind === 'retiredout' ? '🚶' : '🚑', label: WICKET_LABEL[kind], detail: `${outName ?? 'Batter'} ${dismissal}`, side: other(bat), tone: 'wicket' }],
          seq,
          ...creaseFor(newBatId, newBatName),
        };
        return settle(next);
      }

      // Deliveries (bowled/caught/lbw/stumped/hit wicket/run out/hit twice/obstructing).
      // Run-outs and obstructions count the runs completed before the wicket.
      const takesRuns = RUNS_KINDS.includes(kind);
      const completed = takesRuns ? clampRuns(a.payload?.runs) : 0;
      // …off the bat (default, legacy), or as byes / leg byes (team extras).
      const runsAs = asRunsAs(a.payload?.runsAs);
      const offBat = runsAs === 'bat' ? completed : 0;
      // `end` matters only when the batters may have crossed (run-out / obstruction).
      const end = takesRuns ? asEnd(a.payload?.end) : undefined;
      const balls = cur.balls + 1;
      seq += 1;
      // The striker faces the delivery (and is credited any runs off the bat); the
      // dismissed batsman (striker, or a run-out non-striker) is marked out.
      let batting = applyBat(s.batting, strikerId, strikerName, { balls: 1, runs: offBat });
      batting = applyBat(batting, outId, outName, { out: true, dismissal });
      if (newBatId) batting = applyBat(batting, newBatId, newBatName, { retired: false });

      // A stumping is credited to the keeper; otherwise to the named fielder.
      const fielderId = kind === 'stumped' ? s.keepers[other(bat)]?.id : (a.payload?.fielderId as string | undefined);
      const fielderName = kind === 'stumped' ? keeper : (a.payload?.fielderName as string | undefined);
      const record: DismissalRecord = { kind, outId, bowlerId: info.bowlerId, fielderId, fielderName };
      if (fielder2Id || fielder2Name) { record.fielder2Id = fielder2Id; record.fielder2Name = fielder2Name; }

      const next: CricketState = touchBowler({
        ...s,
        scores: { ...s.scores, [bat]: { ...cur, runs: cur.runs + completed, wickets: cur.wickets + 1, balls, ...(offBat !== completed ? { extras: cur.extras + completed } : {}) } },
        batting,
        // byes / leg byes aren't charged to the bowler
        bowling: bumpBowl({ balls: 1, runs: offBat, wickets: NO_BOWLER.includes(kind) ? 0 : 1 }),
        dismissals: [...s.dismissals, record],
        thisOver: [...baseOver, wicketSymbol(completed, runsAs)],
        ballsInOver: baseBalls + 1,
        events: [...s.events, { id: seq, stamp: ballStamp(balls, s.ballsPerOver), icon: '🎯', label: WICKET_LABEL[kind], detail: `${outName ?? 'Batter'} ${dismissal}${completed > 0 ? ` (${runsText(completed, runsAs)})` : ''}`, side: other(bat), tone: 'wicket' }],
        seq,
        ...creaseFor(newBatId, newBatName),
      });
      // Where the wicket was broken settles who faces next (parity #16).
      if (end) {
        const crease = creaseAfterWicket({ strikerId, strikerName, nonStrikerId: s.nonStrikerId, nonStrikerName: s.nonStrikerName }, batterOut, end, { id: newBatId, name: newBatName }, overEnd);
        return afterLegalBall({ ...next, ...crease }, false);
      }
      // Legacy: completed-run parity and over-end both swap strike (run-out crossing approximated).
      return afterLegalBall(next, (completed % 2 === 1) !== overEnd);
    }
    case 'PENALTY': {
      // A penalty (illegal fielding, ball hitting a helmet, short run…): runs to
      // the side NOT penalised, as extras — not a ball, not charged to any bowler.
      // `against` (parity #20) defaults to 'fielding' = today: to the batting side.
      // Runs against the batting side go to the fielding side's innings, even if
      // it hasn't batted yet; in innings 2 that is the side that batted first —
      // the target rises by the same runs (even after a #18 revision).
      const r = Math.max(1, Number(a.payload?.runs ?? 5));
      const against = a.payload?.against === 'batting' ? 'batting' : 'fielding';
      const to = against === 'fielding' ? bat : other(bat);
      const inn = s.scores[to];
      const reason = textOf(a.payload?.reason);
      const team = textOf(a.payload?.teamName);
      // A legacy payload (no `against` / reason / name) keeps today's event exactly.
      const legacy = a.payload?.against === undefined && !reason && !team;
      const raise = s.innings === 2 && to !== bat && s.target !== undefined;
      const target = raise ? s.target! + r : s.target;
      seq += 1;
      return settle({
        ...s,
        scores: { ...s.scores, [to]: { ...inn, runs: inn.runs + r, extras: inn.extras + r } },
        ...(raise ? { target } : {}),
        events: [...s.events, legacy
          ? { id: seq, stamp: oversStr(cur.balls, s.ballsPerOver), icon: '➕', label: `Penalty — ${r} runs`, detail: undefined, side: bat, tone: 'extra' }
          : { id: seq, stamp: oversStr(cur.balls, s.ballsPerOver), icon: '⚖️', label: `${r} penalty run${r === 1 ? '' : 's'} to ${team ?? sideWord(to, bat)}${reason ? ` — ${reason}` : ''}`, detail: raise ? `Target now ${target}` : undefined, side: to, tone: 'extra' }],
        seq,
      });
    }
    case 'ADJUST': {
      // Bonus / negative runs (parity #20) — local rules such as +2 for hitting
      // the net or −5 per dismissal. Added to the side's total (may go below 0);
      // NOT extras. Same target rule as a penalty; settle() — a bonus can win a chase.
      const side = a.payload?.side;
      if (side !== 'home' && side !== 'away') return s;
      const r = Math.trunc(Number(a.payload?.runs));
      if (!Number.isFinite(r) || r === 0 || Math.abs(r) > 999) return s;
      const inn = s.scores[side];
      const reason = textOf(a.payload?.reason);
      const team = textOf(a.payload?.teamName) ?? sideWord(side, bat);
      const raise = s.innings === 2 && side !== bat && s.target !== undefined;
      const target = raise ? s.target! + r : s.target;
      const at = oversStr(cur.balls, s.ballsPerOver);
      seq += 1;
      return settle({
        ...s,
        scores: { ...s.scores, [side]: { ...inn, runs: inn.runs + r } },
        adj: [...(s.adj ?? []), { side, runs: r, ...(reason ? { reason } : {}), at }],
        ...(raise ? { target } : {}),
        events: [...s.events, {
          id: seq, stamp: at, icon: r > 0 ? '➕' : '➖',
          label: `${r > 0 ? `Bonus ${r}` : `${-r} deducted`} — ${team}${reason ? ` (${reason})` : ''}`,
          detail: raise ? `Target now ${target}` : undefined, side,
        }],
        seq,
      });
    }
    case 'FIELD_NOTE': {
      // A dropped catch / runs saved / runs missed (parity #20): one fielder,
      // tied to the last ball (its batter & bowler). Never changes the score.
      const kind = a.payload?.kind as FieldNoteKind;
      if (kind !== 'drop' && kind !== 'saved' && kind !== 'missed') return s;
      const fielderId = textOf(a.payload?.fielderId);
      if (!fielderId) return s;
      const fielderName = textOf(a.payload?.fielderName);
      const runs = clampRuns(a.payload?.runs);
      if (kind !== 'drop' && runs < 1) return s;
      const ref = lastBall(s);
      const note: FieldNote = {
        kind, fielderId, ...(fielderName ? { fielderName } : {}), ...(runs > 0 ? { runs } : {}),
        batterId: ref ? ref.batterId : s.strikerId,
        bowlerId: ref ? ref.bowlerId : s.bowlerId,
        side: ref ? other(ref.side) : other(bat),
        at: ref ? ref.at : oversStr(cur.balls, s.ballsPerOver),
      };
      const batterName = ref ? ref.batterName : s.strikerName;
      const bowlerName = ref ? ref.bowlerName : s.bowlerName;
      const who = fielderName ?? 'Fielder';
      const runsTxt = `${runs} run${runs === 1 ? '' : 's'}`;
      seq += 1;
      return {
        ...s,
        fieldNotes: [...(s.fieldNotes ?? []), note],
        events: [...s.events, {
          id: seq, stamp: note.at, icon: '🧤',
          label: kind === 'drop'
            ? `Dropped — ${who}${batterName ? ` (${batterName}${bowlerName ? ` off ${bowlerName}` : ''})` : ''}`
            : `${runsTxt} ${kind === 'saved' ? 'saved' : 'missed'} — ${who}`,
          detail: kind === 'drop' && runs > 0 ? `Cost ${runsTxt}` : undefined,
          side: note.side, playerName: fielderName,
        }],
        seq,
      };
    }
    case 'EXTRA': {
      const kind = String(a.payload?.kind ?? 'Wide');
      const isNoBall = kind === 'No ball';
      seq += 1;
      // Local rules (#14): the penalty (standard 1) and whether it counts as a
      // ball (standard: never — no over progress). Standard rules → today's maths.
      const pen = penalty(isNoBall ? 'noball' : 'wide', R);
      const legal = isNoBall ? R.noBallLegal : R.wideLegal;
      const penTag = pen === 1 ? '' : ` (${pen} run${pen === 1 ? '' : 's'})`;
      // A free hit after a no-ball (if the rules give one); a pending free hit
      // carries over a wide.
      const fhAfter = isNoBall ? R.freeHit || s.freeHit : s.freeHit;
      const overReset = s.ballsInOver >= s.ballsPerOver ? [] : s.thisOver;
      // A legal extra advances the innings ball count, the bowler's balls and the over.
      const legalBits = (next: CricketState): CricketState =>
        legal ? { ...next, scores: { ...next.scores, [bat]: { ...next.scores[bat], balls: cur.balls + 1 } }, ballsInOver: baseBalls + 1 } : next;

      // A wicket off the extra (parity #16): `wicket` names the kind; a legacy
      // `runout: true` still means a run-out. A wide allows run out / stumped /
      // hit wicket / obstructing; a no-ball run out / hit twice / obstructing.
      // No legal ball unless local rules count it; the penalty stands; completed
      // runs count (on a wide as wides; on a no-ball off the bat, or as byes /
      // leg byes with `runsAs`). Stumped / hit wicket are the bowler's wicket.
      const wk = (a.payload?.wicket ? String(a.payload.wicket) : a.payload?.runout ? 'runout' : undefined) as DismissalKind | undefined;
      if (wk) {
        if (!(isNoBall ? NOBALL_WICKETS : WIDE_WICKETS).includes(wk)) return s;
        const legacy = !a.payload?.wicket; // `runout: true` — replays exactly as before
        const completed = RUNS_KINDS.includes(wk) ? clampRuns(a.payload?.runs) : 0;
        const runsAs = isNoBall ? asRunsAs(a.payload?.runsAs) : 'bat';
        const offBat = isNoBall && runsAs === 'bat' ? completed : 0; // the batter's runs
        const batterOut: 'striker' | 'nonstriker' = wk === 'stumped' || wk === 'hitwicket' || wk === 'hittwice' ? 'striker'
          : a.payload?.batterOut === 'nonstriker' ? 'nonstriker' : 'striker';
        const outId = batterOut === 'nonstriker' ? s.nonStrikerId : strikerId;
        const outName = batterOut === 'nonstriker' ? s.nonStrikerName : strikerName;
        const newBatId = a.payload?.newBatId as string | undefined;
        const newBatName = a.payload?.newBatName as string | undefined;
        const keeper = s.keepers[other(bat)];
        const fielderId = wk === 'stumped' ? keeper?.id : (a.payload?.fielderId as string | undefined);
        const fielderName = wk === 'stumped' ? keeper?.name : (a.payload?.fielderName as string | undefined);
        const fielder2Id = wk === 'runout' ? (a.payload?.fielder2Id as string | undefined) : undefined;
        const fielder2Name = wk === 'runout' ? (a.payload?.fielder2Name as string | undefined) : undefined;
        const dismissal = legacy ? composeDismissal('runout', undefined, fielderName) : composeDismissal(wk, info.bowlerName, fielderName, keeper?.name, fielder2Name);
        const bowlersWicket = !NO_BOWLER.includes(wk);
        let batting = s.batting;
        if (isNoBall) batting = applyBat(batting, strikerId, strikerName, { runs: offBat, balls: 1 });
        batting = applyBat(batting, outId, outName, { out: true, dismissal });
        if (newBatId) batting = applyBat(batting, newBatId, newBatName, { retired: false });
        const end = RUNS_KINDS.includes(wk) ? asEnd(a.payload?.end) : undefined;
        const crease = end
          ? creaseAfterWicket({ strikerId, strikerName, nonStrikerId: s.nonStrikerId, nonStrikerName: s.nonStrikerName }, batterOut, end, { id: newBatId, name: newBatName }, legal && overEnd)
          : batterOut === 'nonstriker'
            ? { nonStrikerId: newBatId, nonStrikerName: newBatName }
            : { strikerId: newBatId, strikerName: newBatName };
        const sym = `${completed > 0 ? completed : ''}${isNoBall ? 'nb' : 'wd'}+W`;
        // extras: the penalty + wides run (wide) or byes / leg byes (no-ball)
        const extras = pen + completed - offBat;
        const record: DismissalRecord = legacy
          ? { kind: 'runout', outId, fielderId, fielderName }
          : { kind: wk, outId, bowlerId: info.bowlerId, fielderId, fielderName };
        if (fielder2Id || fielder2Name) { record.fielder2Id = fielder2Id; record.fielder2Name = fielder2Name; }
        const tail = completed > 0 ? ` (${runsText(completed, isNoBall ? runsAs : 'bat')})` : '';
        let next: CricketState = legalBits(touchBowler({
          ...s,
          scores: { ...s.scores, [bat]: { ...cur, runs: cur.runs + pen + completed, extras: cur.extras + extras, wickets: cur.wickets + 1 } },
          batting,
          // the bowler is charged the penalty + wides / off-bat runs, not byes
          bowling: bumpBowl({ runs: pen + (isNoBall ? offBat : completed), extras: isNoBall ? pen : pen + completed, ...(bowlersWicket ? { wickets: 1 } : {}), ...(legal ? { balls: 1 } : {}) }),
          dismissals: [...s.dismissals, record],
          thisOver: [...overReset, sym],
          events: [...s.events, { id: seq, stamp: ballStamp(cur.balls + 1, s.ballsPerOver), icon: '🎯', label: `${isNoBall ? 'No ball' : 'Wide'}${penTag} — ${WICKET_LABEL[wk]}`, detail: `${outName ?? 'Batter'} ${dismissal}${tail}`, side: other(bat), tone: 'wicket' }],
          seq,
          freeHit: fhAfter,
          ...crease,
        }));
        if (end) {
          // creaseAfterWicket already settled the ends (incl. a legal over end)
          if (legal) return afterLegalBall(next, false, fhAfter);
          return settle(next);
        }
        if (legal) return afterLegalBall(next, (completed % 2 === 1) !== overEnd, fhAfter);
        if (completed % 2 === 1) next = swapStrike(next);
        return settle(next);
      }
      if (isNoBall) {
        // No-ball: the penalty, PLUS runs off the bat (credited to the striker) AND/OR
        // byes run without hitting (team extras, not charged to the bowler). The
        // striker faces a no-ball (counts as a ball faced) and gets a free hit next.
        const offBat = clampRuns(a.payload?.runs);
        const byes = clampRuns(a.payload?.byes);
        const total = pen + offBat + byes;
        const ran = offBat + byes; // runs run between the wickets → strike parity
        // `boundary?` (parity #15): same legacy fallback as RUNS — a 4/6 off the
        // bat without the flag is a boundary; `boundary: false` = all run.
        const nbBoundary = isBoundaryHit(offBat, a.payload?.boundary);
        const batting = applyBat(s.batting, strikerId, strikerName, { runs: offBat, balls: 1, fours: nbBoundary && offBat === 4 ? 1 : 0, sixes: nbBoundary && offBat === 6 ? 1 : 0 });
        const sym = `${ran > 0 ? ran : ''}nb`;
        // `runsAs: 'legbye'` on a no-ball's byes = leg byes off the no-ball (the
        // scorecard's ball record already splits b / lb by it); legacy = byes.
        const byeWord = asRunsAs(a.payload?.runsAs) === 'legbye' ? 'leg bye' : 'bye';
        const label = `No ball${penTag}${offBat > 0 ? ` + ${offBat}` : ''}${byes > 0 ? ` + ${byes} ${byeWord}${byes === 1 ? '' : 's'}` : ''}${R.freeHit ? ' — free hit' : ''}`;
        let next: CricketState = legalBits(touchBowler({
          ...s,
          // extras conceded = the penalty + any byes (off-bat runs are the batter's)
          scores: { ...s.scores, [bat]: { ...cur, runs: cur.runs + total, extras: cur.extras + pen + byes } },
          batting,
          bowling: bumpBowl({ runs: pen + offBat, extras: pen, ...(legal ? { balls: 1 } : {}) }), // bowler charged penalty + off-bat, not byes
          thisOver: [...overReset, sym],
          events: [...s.events, { id: seq, stamp: ballStamp(cur.balls + 1, s.ballsPerOver), icon: '➕', label, detail: undefined, side: bat, tone: 'extra' }],
          seq,
          freeHit: fhAfter,
        }));
        if (legal) return afterLegalBall(next, (ran % 2 === 1) !== overEnd, fhAfter);
        if (ran % 2 === 1) next = swapStrike(next); // crossed an odd number of times
        return settle(next);
      }
      // Wide: the penalty PLUS any runs the batsmen run (byes on the wide, or a wide
      // to the boundary = 4). All are extras charged to the bowler; no ball is faced.
      const wideRuns = clampRuns(a.payload?.runs);
      const total = pen + wideRuns;
      const sym = wideRuns > 0 ? `${total}wd` : 'wd';
      let next: CricketState = legalBits(touchBowler({
        ...s,
        scores: { ...s.scores, [bat]: { ...cur, runs: cur.runs + total, extras: cur.extras + total } },
        bowling: bumpBowl({ runs: total, extras: total, ...(legal ? { balls: 1 } : {}) }),
        thisOver: [...overReset, sym],
        events: [...s.events, { id: seq, stamp: ballStamp(cur.balls + 1, s.ballsPerOver), icon: '➕', label: `Wide${penTag}${wideRuns > 0 ? ` + ${wideRuns}` : ''}`, detail: undefined, side: bat, tone: 'extra' }],
        seq,
        freeHit: fhAfter,
      }));
      if (legal) return afterLegalBall(next, (wideRuns % 2 === 1) !== overEnd, fhAfter);
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
      // Parity #17 (REVIEW Decision 8): the quota / this-over / whole-last-over /
      // suspended checks REJECT only a `v: 2` payload (the live UI). A legacy one
      // (old logs, #06 rewrites that keep their `v`) replays exactly as before.
      const check = canBowl(s, id);
      const forced = a.payload?.v === 2 && !check.ok && check.reason === 'quota' && a.payload?.force === true;
      if (a.payload?.v === 2 && !check.ok && !forced) return s;
      const card: BowlCard = { name, side: other(bat), runs: 0, balls: 0, wickets: 0, dots: 0, extras: 0 };
      const bowling = s.bowling[id] ? s.bowling : { ...s.bowling, [id]: card };
      let next: CricketState = { ...s, bowlerId: id, bowlerName: name, bowling };
      const stamp = oversStr(cur.balls, s.ballsPerOver);
      const events = [...s.events];
      if (forced) {
        seq += 1;
        const q = s.bowlerQuota ?? 0;
        events.push({ id: seq, stamp, icon: '⚠️', label: 'Quota override', detail: `${name} bowls beyond the ${q}-over quota`, side: other(bat) });
      }
      // A mid-over replacement (injury / suspension): the balls so far stay with
      // the old bowler; the new one finishes the over. Both sit out the next.
      const reason = a.payload?.reason;
      const oldId = s.bowlerId;
      if (midOver(s) && oldId && oldId !== id && (reason === 'injury' || reason === 'suspended' || reason === 'other')) {
        seq += 1;
        const oldName = s.bowlerName ?? s.bowling[oldId]?.name ?? 'the bowler';
        events.push({ id: seq, stamp, icon: '🚑', label: 'BOWLER REPLACED', detail: `${name} completes ${oldName}'s over (${reason})`, side: other(bat) });
        if (reason === 'suspended') next = { ...next, barredBowlers: [...(s.barredBowlers ?? []), oldId] };
      }
      return seq === s.seq ? next : { ...next, events, seq };
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
      const name = String(a.payload?.name ?? '');
      const keepers = { ...s.keepers, [side]: { id, name } };
      // A mid-match change (parity #13) is logged once a ball has been bowled;
      // pre-match picks stay silent. Display-only (the event shifts ids, not maths).
      const started = s.scores.home.balls + s.scores.away.balls > 0 || s.thisOver.length > 0 || s.innings > 1;
      const prev = s.keepers[side];
      if (!started || prev?.id === id) return { ...s, keepers };
      seq += 1;
      return {
        ...s,
        keepers,
        events: [...s.events, { id: seq, stamp: oversStr(cur.balls, s.ballsPerOver), icon: '🧤', label: 'NEW KEEPER', detail: prev?.name ? `${name} takes the gloves from ${prev.name}` : `${name} keeps wicket`, side }],
        seq,
      };
    }
    case 'POTM':
      return { ...s, potm: String(a.payload?.name ?? '') };
    case 'END_INNINGS':
      if (s.innings === 1) return { ...s, innings: 2, battingSide: other(bat), ...chaseStart(s, cur.runs), thisOver: [], ballsInOver: 0, ...clearCrease };
      return { ...s, ended: true };
    case 'END':
      return { ...s, ended: true };
    default:
      return s;
  }
};

// ─── Ball log (parity #19) ────────────────────────────────────────────────────

const LOGGED = new Set(['RUNS', 'BYES', 'LEGBYES', 'WICKET', 'EXTRA', 'PENALTY', 'ADJUST']);

/** The over-strip chip a logged action produced — the same symbols the reducer
 *  pushes to `thisOver` (which an innings end clears, so it is rebuilt here). */
function logSymbol(a: ScoreAction, wd: number): string | undefined {
  const p = a.payload ?? {};
  switch (a.type) {
    case 'RUNS': {
      const r = clampRuns(p.runs);
      const ot = Math.min(r, clampRuns(p.overthrows));
      return runSymbol(r, isBoundaryHit(r, p.boundary, ot), ot);
    }
    case 'BYES':
    case 'LEGBYES': {
      const r = Math.max(1, p.runs === undefined ? 1 : clampRuns(p.runs));
      return (a.type === 'LEGBYES' ? 'lb' : 'b') + (r > 1 ? r : '');
    }
    case 'WICKET': {
      const kind = String(p.kind ?? 'bowled') as DismissalKind;
      if (kind === 'mankad') return 'W';
      if (NO_DELIVERY.includes(kind)) return undefined;
      return wicketSymbol(RUNS_KINDS.includes(kind) ? clampRuns(p.runs) : 0, asRunsAs(p.runsAs));
    }
    case 'EXTRA': {
      const isNoBall = String(p.kind ?? 'Wide') === 'No ball';
      const wk = (p.wicket ? String(p.wicket) : p.runout ? 'runout' : undefined) as DismissalKind | undefined;
      if (wk) {
        const completed = RUNS_KINDS.includes(wk) ? clampRuns(p.runs) : 0;
        return `${completed > 0 ? completed : ''}${isNoBall ? 'nb' : 'wd'}+W`;
      }
      if (isNoBall) {
        const ran = clampRuns(p.runs) + clampRuns(p.byes);
        return `${ran > 0 ? ran : ''}nb`;
      }
      return clampRuns(p.runs) > 0 ? `${wd}wd` : 'wd';
    }
    default:
      return undefined;
  }
}

/** Build the BallRec for an action `step` just applied (`s` → `next`), from the
 *  innings / card deltas — so the record can never disagree with the scorecard. */
function ballRec(s: CricketState, a: ScoreAction, next: CricketState): BallRec {
  // A penalty / adjustment may go to the side NOT batting (parity #20): its
  // record belongs to that side's innings, with no crease or bowler.
  const scoreOnly = a.type === 'PENALTY' || a.type === 'ADJUST';
  const fielding = other(s.battingSide);
  const cross = scoreOnly && next.scores[fielding].runs !== s.scores[fielding].runs;
  const side = cross ? fielding : s.battingSide;
  const pre = s.scores[side];
  const post = next.scores[side];
  if (cross) {
    const d = post.runs - pre.runs;
    const dExt = post.extras - pre.extras;
    const rec: BallRec = {
      inn: s.innings === 1 ? 2 : 1, side, legal: false, bat: 0, wd: 0, nb: 0, b: 0, lb: 0,
      tr: post.runs, tw: post.wickets, lb6: post.balls, cross: true,
    };
    if (dExt) rec.pen = dExt;
    if (d - dExt) rec.adj = d - dExt;
    return rec;
  }
  const dRuns = post.runs - pre.runs;
  const dExt = post.extras - pre.extras;
  const adj = a.type === 'ADJUST' ? dRuns : 0;
  let wd = 0, nb = 0, b = 0, lb = 0, pen = 0;
  let ext: BallRec['ext'];
  const runsAs = asRunsAs(a.payload?.runsAs);
  if (a.type === 'BYES') b = dExt;
  else if (a.type === 'LEGBYES') lb = dExt;
  else if (a.type === 'PENALTY') pen = dExt;
  else if (a.type === 'WICKET') { if (runsAs === 'legbye') lb = dExt; else b = dExt; }
  else if (a.type === 'EXTRA') {
    if (String(a.payload?.kind ?? 'Wide') === 'No ball') {
      ext = 'nb';
      nb = Math.min(dExt, penalty('noball', effectiveRules(s)));
      if (runsAs === 'legbye') lb = dExt - nb; else b = dExt - nb;
    } else { ext = 'wd'; wd = dExt; }
  }
  const info = ballInfo(a);
  let out: BallRec['out'];
  if (next.dismissals.length > s.dismissals.length) {
    const d = next.dismissals[next.dismissals.length - 1];
    if (d.outId) out = { id: d.outId, name: next.batting[d.outId]?.name ?? '', kind: d.kind };
  } else {
    const id = Object.keys(next.batting).find((k) => next.batting[k].retired && !s.batting[k]?.retired);
    if (id) out = { id, name: next.batting[id].name, kind: 'retired' };
  }
  const rec: BallRec = {
    inn: s.innings, side, legal: post.balls > pre.balls,
    bat: dRuns - dExt - adj, wd, nb, b, lb,
    tr: post.runs, tw: post.wickets, lb6: post.balls,
    strikerId: info.strikerId ?? s.strikerId,
    nonStrikerId: s.nonStrikerId,
    bowlerId: info.bowlerId ?? s.bowlerId,
    bowlerName: info.bowlerId ? (info.bowlerName ?? s.bowlerName) : s.bowlerName,
  };
  if (pen) rec.pen = pen;
  if (adj) rec.adj = adj;
  if (out) rec.out = out;
  const sym = logSymbol(a, wd);
  if (sym !== undefined) rec.sym = sym;
  if (ext) rec.ext = ext;
  return rec;
}

/** The cricket reducer: `step` plus one BallRec per scored action. A Super Over
 *  (routed into the nested state) and an `alignCrease` re-entry log in their
 *  own recursive call, so a record is never pushed twice. A state without a
 *  `log` (a persisted snapshot) gets none — a partial log would mislead. */
const reducer = (s: CricketState, a: ScoreAction): CricketState => {
  const pen = ballPenaltyOf(a);
  if (pen) return withBallPenalty(s, a, pen);
  const next = step(s, a);
  if (next === s || !s.log || !LOGGED.has(a.type) || next.seq <= s.seq || next.log !== s.log) return next;
  return { ...next, log: [...s.log, ballRec(s, a, next)] };
};

/** SD-113 (R2) — apply a ball, then the penalty that rode on it. `against` is
 *  relative to the side batting when the ball was bowled: if that ball ended
 *  the innings, it is flipped so the runs still reach the same team (in the
 *  chase, runs to the side that batted first raise the target, as PENALTY
 *  does). If the ball ended the match, the penalty is still booked and the
 *  result re-settled from the new totals. */
function withBallPenalty(s: CricketState, a: ScoreAction, pen: BallPenalty): CricketState {
  const { pen: _pen, ...rest } = a.payload ?? {};
  const afterBall = reducer(s, { ...a, payload: rest });
  if (afterBall === s) return s;
  const live = (x: CricketState) => (x.superOver && !x.superOver.state.ended ? x.superOver.state : x);
  const flipped = live(afterBall).battingSide !== live(s).battingSide;
  const against = flipped ? (pen.against === 'batting' ? 'fielding' : 'batting') : pen.against;
  const penAction: ScoreAction = {
    type: 'PENALTY', side: a.side,
    payload: { runs: pen.runs, against, ...(pen.reason ? { reason: pen.reason } : {}), ...(pen.teamName ? { teamName: pen.teamName } : {}) },
  };
  const finished = !afterBall.superOver && (afterBall.ended || (afterBall.pendingTie && !s.pendingTie));
  if (!finished) {
    const next = reducer(afterBall, penAction);
    return next;
  }
  const reopened = reducer({ ...afterBall, ended: false, pendingTie: undefined }, penAction);
  return reopened;
}

/** The state to persist in `matches.state` (parity #19): without the derived
 *  `log` (incl. a Super Over's) — `getMatches` reads every match's state. */
export function snapshotState(s: CricketState): CricketState {
  const { log: _log, ...rest } = s;
  if (!rest.superOver) return rest;
  const { log: _inner, ...inner } = rest.superOver.state;
  return { ...rest, superOver: { ...rest.superOver, state: inner } };
}

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

/**
 * Who won and how (parity #18) — the ONE place the result is decided; the
 * result line, `plugin.result`, the final banner and `settle`'s level check
 * agree through it. A Super Over decides first. Reaching the target wins by
 * wickets; otherwise the margin is from PAR (target − 1), 0 = tied. A revised
 * target adds " (DLS)" / " (revised target)". Legacy matches (no `dlsV`) keep
 * today's `defend − chase` and no suffix, so stored results read the same.
 * `winner` null = tied / undecided.
 */
export function outcome(s: CricketState): { winner: 'home' | 'away' | null; text: string } {
  const so = s.superOver ? superOverWinner(s.superOver.state) : null;
  if (s.superOver && so) {
    const inn = s.superOver.state;
    const margin = Math.abs(inn.scores.home.runs - inn.scores.away.runs);
    const roundTag = s.superOver.round > 1 ? ` (Super Over ${s.superOver.round})` : '';
    return { winner: so, text: `Won the Super Over by ${margin} run${margin === 1 ? '' : 's'}${roundTag}` };
  }
  const v2 = s.dlsV === 2;
  const tag = !v2 ? '' : s.revision === 'dls' ? ' (DLS)' : s.revision === 'manual' ? ' (revised target)' : '';
  const chaseSide = s.battingSide;
  const chase = s.scores[chaseSide];
  const defend = s.scores[other(chaseSide)];
  if (chase.runs >= (s.target ?? Infinity)) {
    const w = s.wicketsLimit - chase.wickets;
    return { winner: s.superOver ? null : chaseSide, text: `Won by ${w} wkt${w === 1 ? '' : 's'}${tag}` };
  }
  const par = v2 ? (s.target ?? defend.runs + 1) - 1 : defend.runs;
  const margin = par - chase.runs;
  if (margin === 0) return { winner: null, text: `Match tied${tag}` };
  return { winner: s.superOver ? null : other(chaseSide), text: `Won by ${margin} run${margin === 1 ? '' : 's'}${tag}` };
}

/** The result text, e.g. "Won by 16 runs (DLS)". */
const resultLine = (s: CricketState): string => outcome(s).text;

export { init, reducer, other, resultLine, superOverWinner, WICKET_LABEL, NO_BOWLER, NO_DELIVERY, composeDismissal };
export type { Innings, DismissalRecord };

/** Everyone who has taken part so far (parity #13 squad lock): batted, was out,
 *  retired or is at the crease, bowled, or took a catch / run-out / stumping
 *  (incl. a run-out's 2nd fielder; a Mankad's fielder is the bowler), or has a
 *  fielding note (parity #20). Includes a Super Over's players. These can't be dropped from the squad. */
export function involvedPlayerIds(s: CricketState): string[] {
  const ids = new Set<string>();
  const walk = (x: CricketState) => {
    Object.keys(x.batting ?? {}).forEach((id) => ids.add(id));
    Object.keys(x.bowling ?? {}).forEach((id) => ids.add(id));
    for (const id of [x.strikerId, x.nonStrikerId]) if (id) ids.add(id);
    for (const d of x.dismissals ?? []) for (const id of [d.outId, d.bowlerId, d.fielderId, d.fielder2Id]) if (id) ids.add(id);
    for (const n of x.fieldNotes ?? []) ids.add(n.fielderId);
    if (x.superOver?.state) walk(x.superOver.state);
  };
  walk(s);
  return [...ids];
}

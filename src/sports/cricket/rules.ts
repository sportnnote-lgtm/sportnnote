/**
 * Cricket local rules (parity #14) — wide / no-ball values, byes, free hit,
 * "normal rules in the last N overs". Pure and JSX-free so node tests load it
 * (note the `.ts` extensions, as in engine.ts).
 *
 * The match's baseline comes from its format (`rulesFromConfig`); mid-match
 * changes are SET_RULES events (payloads use the same CONFIG keys), so past
 * balls keep the rules they were bowled under.
 */
import type { FormatField, LiveSettings } from '../types';
import type { CricketState } from './engine.ts';

export interface CricketRules {
  wideRuns: number;
  wideLegal: boolean;
  noBallRuns: number;
  noBallLegal: boolean;
  stdLastOvers: number;
  byes: boolean;
  legByes: boolean;
  freeHit: boolean;
  /** SD-133 (CK-11) — offer the wagon wheel + shot type after each scoring
   *  shot. A capture setting, not a playing rule (ignored by `isStandard`). */
  wagonWheel: boolean;
  /** SD-133 — local "retire at N runs" (school / sixes cricket): a batter who
   *  reaches N retires not out. Absent / 0 = off. Only present when set, so
   *  older states keep their exact shape. */
  retireAt?: number;
  /** …and may come back once everyone else has batted (default yes). */
  retireBack?: boolean;
}

export const STANDARD_RULES: CricketRules = {
  wideRuns: 1, wideLegal: false, noBallRuns: 1, noBallLegal: false,
  stdLastOvers: 0, byes: true, legByes: true, freeHit: true, wagonWheel: false,
};

/** Config (format / SET_RULES payload) keys. Two differ from CricketRules:
 *  byesAllowed ⇄ byes, legByesAllowed ⇄ legByes. The rest are identical. */
export const RULE_CONFIG_KEYS = ['wideRuns', 'wideLegal', 'noBallRuns', 'noBallLegal', 'freeHit', 'stdLastOvers', 'byesAllowed', 'legByesAllowed', 'wagonWheel', 'retireAt', 'retireBack'] as const;

const clamp05 = (v: unknown, d: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : d;
};
const bool = (v: unknown, d: boolean) => (v === undefined || v === null ? d : v === true || v === 'true' || v === 1);
/** SD-133 — the retire limit: a whole number 1–500, else off (0). */
const retireOf = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(500, n) : 0;
};

/** Format / SET_RULES config → rules (missing keys = standard; numbers clamped 0–5). */
export function rulesFromConfig(config?: Record<string, unknown> | null): CricketRules {
  const c = config ?? {};
  return {
    wideRuns: clamp05(c.wideRuns, STANDARD_RULES.wideRuns),
    wideLegal: bool(c.wideLegal, STANDARD_RULES.wideLegal),
    noBallRuns: clamp05(c.noBallRuns, STANDARD_RULES.noBallRuns),
    noBallLegal: bool(c.noBallLegal, STANDARD_RULES.noBallLegal),
    stdLastOvers: clamp05(c.stdLastOvers, STANDARD_RULES.stdLastOvers),
    byes: bool(c.byesAllowed, STANDARD_RULES.byes),
    legByes: bool(c.legByesAllowed, STANDARD_RULES.legByes),
    freeHit: bool(c.freeHit, STANDARD_RULES.freeHit),
    wagonWheel: bool(c.wagonWheel, STANDARD_RULES.wagonWheel),
    // SD-133 — only when on (older states: no keys).
    ...(retireOf(c.retireAt) > 0 ? { retireAt: retireOf(c.retireAt), retireBack: bool(c.retireBack, true) } : {}),
  };
}

/** Rules → config keys (the inverse of rulesFromConfig). */
export function rulesToConfig(r: CricketRules = STANDARD_RULES): Record<string, number | boolean> {
  return {
    wideRuns: r.wideRuns, wideLegal: r.wideLegal, noBallRuns: r.noBallRuns, noBallLegal: r.noBallLegal,
    freeHit: r.freeHit, stdLastOvers: r.stdLastOvers, byesAllowed: r.byes, legByesAllowed: r.legByes,
    wagonWheel: r.wagonWheel,
    ...(r.retireAt ? { retireAt: r.retireAt, retireBack: r.retireBack !== false } : {}),
  };
}

/** Rules after a SET_RULES patch (config keys; unknown keys ignored, values sanitised). */
export function patchRules(r: CricketRules, patch?: Record<string, unknown> | null): CricketRules {
  const known: Record<string, unknown> = {};
  for (const k of RULE_CONFIG_KEYS) if (patch && k in patch) known[k] = patch[k];
  return rulesFromConfig({ ...rulesToConfig(r), ...known });
}

export const rulesOf = (s: Pick<CricketState, 'rules'>): CricketRules => s.rules ?? STANDARD_RULES;

/** Inside the last `stdLastOvers` overs? (then wides/no-balls revert to standard) */
export function inStandardWindow(s: Pick<CricketState, 'rules' | 'oversLimit' | 'scores' | 'battingSide' | 'ballsPerOver'>): boolean {
  const r = rulesOf(s);
  if (r.stdLastOvers <= 0) return false;
  const bowled = Math.floor(s.scores[s.battingSide].balls / s.ballsPerOver);
  return bowled >= s.oversLimit - r.stdLastOvers;
}

/** The rules in force for the NEXT ball. */
export function effectiveRules(s: Pick<CricketState, 'rules' | 'oversLimit' | 'scores' | 'battingSide' | 'ballsPerOver'>): CricketRules {
  const r = rulesOf(s);
  if (!inStandardWindow(s)) return r;
  return { ...r, wideRuns: STANDARD_RULES.wideRuns, wideLegal: STANDARD_RULES.wideLegal, noBallRuns: STANDARD_RULES.noBallRuns, noBallLegal: STANDARD_RULES.noBallLegal };
}

/** Standard playing rules? The wagon wheel is a capture setting, not a rule. */
export const isStandard = (r: CricketRules) =>
  (Object.keys(STANDARD_RULES) as (keyof CricketRules)[]).every((k) => k === 'wagonWheel' || r[k] === STANDARD_RULES[k])
  && !r.retireAt;

const runsWord = (n: number) => `${n} run${n === 1 ? '' : 's'}`;

/** Short chip text for non-standard rules: "Wd 2 · NB = ball · no byes". */
export function rulesChip(r: CricketRules): string {
  const parts: string[] = [];
  if (r.wideRuns !== 1) parts.push(`Wd ${r.wideRuns}`);
  if (r.wideLegal) parts.push('Wd = ball');
  if (r.noBallRuns !== 1) parts.push(`NB ${r.noBallRuns}`);
  if (r.noBallLegal) parts.push('NB = ball');
  if (!r.freeHit) parts.push('no free hit');
  if (!r.byes) parts.push('no byes');
  if (!r.legByes) parts.push('no leg byes');
  if (r.stdLastOvers > 0) parts.push(`normal last ${r.stdLastOvers}`);
  if (r.retireAt) parts.push(`retire at ${r.retireAt}`);
  return parts.join(' · ');
}

/** Timeline text for a rules change: "Wide 2 runs · counts as a ball". */
export function describeRulesChange(prev: CricketRules, next: CricketRules): string {
  const parts: string[] = [];
  if (prev.wideRuns !== next.wideRuns || prev.wideLegal !== next.wideLegal) {
    const w: string[] = [];
    if (prev.wideRuns !== next.wideRuns) w.push(`Wide ${runsWord(next.wideRuns)}`);
    if (prev.wideLegal !== next.wideLegal) w.push(next.wideLegal ? (w.length ? 'counts as a ball' : 'Wide counts as a ball') : (w.length ? 'not a ball' : 'Wide not a ball'));
    parts.push(w.join(' · '));
  }
  if (prev.noBallRuns !== next.noBallRuns || prev.noBallLegal !== next.noBallLegal) {
    const n: string[] = [];
    if (prev.noBallRuns !== next.noBallRuns) n.push(`No-ball ${runsWord(next.noBallRuns)}`);
    if (prev.noBallLegal !== next.noBallLegal) n.push(next.noBallLegal ? (n.length ? 'counts as a ball' : 'No-ball counts as a ball') : (n.length ? 'not a ball' : 'No-ball not a ball'));
    parts.push(n.join(' · '));
  }
  if (prev.freeHit !== next.freeHit) parts.push(next.freeHit ? 'Free hit on' : 'No free hit');
  if (prev.byes !== next.byes) parts.push(next.byes ? 'Byes allowed' : 'No byes');
  if (prev.legByes !== next.legByes) parts.push(next.legByes ? 'Leg byes allowed' : 'No leg byes');
  if (prev.stdLastOvers !== next.stdLastOvers) parts.push(next.stdLastOvers > 0 ? `Normal rules in the last ${next.stdLastOvers} over${next.stdLastOvers === 1 ? '' : 's'}` : 'Local rules all innings');
  // SD-133
  if ((prev.retireAt ?? 0) !== (next.retireAt ?? 0)) parts.push(next.retireAt ? `Batters retire at ${next.retireAt}` : 'No retire limit');
  else if (next.retireAt && (prev.retireBack !== false) !== (next.retireBack !== false)) parts.push(next.retireBack !== false ? 'Retired batters may return' : 'Retired batters can’t return');
  if (prev.wagonWheel !== next.wagonWheel) parts.push(next.wagonWheel ? 'Wagon wheel on' : 'Wagon wheel off');
  return parts.join(' · ');
}

/** "Before ball 1": innings 1, no deliveries and no extras. The toss and setup
 *  picks (batters, bowler, keeper) don't count — so rules set now become the
 *  match's format baseline rather than a SET_RULES event. */
export function cricketBeforeStart(s: CricketState): boolean {
  if (s.superOver || s.innings !== 1) return false;
  const { home, away } = s.scores;
  return home.balls + away.balls === 0 && home.extras + away.extras === 0 && home.runs + away.runs === 0
    && home.wickets + away.wickets === 0 && s.thisOver.length === 0;
}

/** Shared by formatFields (advanced) and liveSettings.fields. */
export const LOCAL_RULE_FIELDS: FormatField[] = [
  { key: 'wideRuns', label: 'Runs for a wide', type: 'count', default: 1, min: 0, max: 5, advanced: true },
  { key: 'wideLegal', label: 'Wide counts as a ball', type: 'toggle', default: false, advanced: true },
  { key: 'noBallRuns', label: 'Runs for a no-ball', type: 'count', default: 1, min: 0, max: 5, advanced: true },
  { key: 'noBallLegal', label: 'No-ball counts as a ball', type: 'toggle', default: false, advanced: true },
  { key: 'freeHit', label: 'Free hit after a no-ball', type: 'toggle', default: true, advanced: true },
  { key: 'stdLastOvers', label: 'Normal wide/no-ball rules in the last N overs', type: 'count', default: 0, min: 0, max: 5, hint: '0 = never', advanced: true },
  { key: 'byesAllowed', label: 'Byes allowed', type: 'toggle', default: true, advanced: true },
  { key: 'legByesAllowed', label: 'Leg byes allowed', type: 'toggle', default: true, advanced: true },
  // SD-133 — school / sixes cricket: retire at N runs (0 = off)
  { key: 'retireAt', label: 'Batters retire at (runs)', type: 'number', default: 0, min: 0, max: 500, advanced: true, hint: '0 = off · e.g. 25 in school cricket — the batter retires not out' },
  { key: 'retireBack', label: 'Retired batters may bat again', type: 'toggle', default: true, advanced: true, hint: 'once everyone else has batted' },
  // SD-133 (CK-11) — wagon wheel + shot type after each scoring shot (optional taps)
  { key: 'wagonWheel', label: 'Wagon wheel (where each shot went)', type: 'toggle', default: false, advanced: true, hint: 'an optional field tap after each scoring shot' },
];

export const LOCAL_RULE_DEFAULTS: Record<string, number | boolean> = { ...rulesToConfig(STANDARD_RULES), retireAt: 0, retireBack: true };

/** Cricket's live settings (event mode): before ball 1 a change patches the
 *  match format; after it, Apply logs SET_RULES (from the next ball). */
export const CRICKET_LIVE_SETTINGS: LiveSettings<CricketState> = {
  title: '⚙️ Match rules',
  hint: 'Local rules for this match — wides, no-balls, byes.',
  mode: 'event',
  actionType: 'SET_RULES',
  fields: LOCAL_RULE_FIELDS,
  read: (s) => {
    const r = rulesOf(s);
    return { ...rulesToConfig(r), retireAt: r.retireAt ?? 0, retireBack: r.retireBack !== false };
  },
  beforeStart: cricketBeforeStart,
  defaults: LOCAL_RULE_DEFAULTS,
};

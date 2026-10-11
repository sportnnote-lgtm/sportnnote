/**
 * SD-141 — competition rules for event sports (founder decision 2026-10-11:
 * "all the factors … as options to be chosen and customised prior to beginning
 * the tournament by the organisers"). Pure, no runtime imports (every engine
 * module may import it).
 *
 * Every rule choice the results engine used to make on its own — a house
 * default, or a rule we read from memory and marked "verify" — is listed here
 * with the standard default and a one-line explanation. The organiser picks
 * them on the Competition rules screen before the meet starts; once any result
 * exists for the sport in the tournament they are read-only.
 *
 * Storage: the tournament's `formats[sport]` (one key per rule; a rule that
 * already had a key — `liftMedals`, `sinclair`, `handTimed`, `splits`, `ageOn`
 * — keeps it). Rules the engine needs while scoring (`phase: true`) are also
 * copied onto every phase of that sport as `PhaseFormat.rules` (only values
 * that differ from the default), so ranking code reads them from the phase /
 * its discipline (`phaseDiscipline` carries them as `def.rules`). A phase with
 * no `rules` — every event made before SD-141 — reads the defaults, which are
 * exactly the behaviour before SD-141.
 */

export type RuleValue = string | number | boolean;
/** The rules a phase carries (`PhaseFormat.rules`, `DisciplineDef.rules`): only non-default values. */
export type CompRules = Record<string, RuleValue>;

export type RulesSport = 'athletics' | 'swimming' | 'weightlifting' | 'shooting' | 'archery' | 'rowing' | 'canoe' | 'cycling';

export interface RuleChoice { value: RuleValue; label: string }

export interface RuleDef {
  /** the `formats[sport]` key */
  key: string;
  sports: RulesSport[];
  /** section on the screen */
  group: string;
  label: string;
  /** one or two sentences: what it changes */
  help: string;
  /** chips · free text (a list) · the age cut-off picker · the entries caps */
  kind: 'choice' | 'text' | 'age' | 'caps';
  choices?: RuleChoice[];
  default: RuleValue;
  /** where the default comes from; "verify" = read from memory, not from the rule book */
  source: string;
  /** the engine reads it while scoring — copied onto the sport's phases */
  phase?: boolean;
  /** an existing key other screens already set (kept, not duplicated) */
  existing?: boolean;
  /** shown only when another rule has a value */
  showIf?: { key: string; value: RuleValue };
}

const yesNo = (yes: string, no: string): RuleChoice[] => [{ value: true, label: yes }, { value: false, label: no }];

export const COMPETITION_RULES: RuleDef[] = [
  /* ------------------------------- weightlifting ------------------------------- */
  {
    key: 'wlOrder', sports: ['weightlifting'], group: 'Lifting order', label: 'Calling order', kind: 'choice', phase: true, default: 'iwf',
    choices: [{ value: 'iwf', label: 'IWF: bar → attempt → progression → earlier lifter → lot' }, { value: 'simple', label: 'Bar → attempt → lot number' }],
    help: 'Who lifts next when two lifters want the same weight. The IWF order also looks at the bigger jump and who lifted earlier; the simple order goes straight to the lot number.',
    source: 'IWF TCRR 6.6.6 as remembered (verify)',
  },
  {
    key: 'wlStep', sports: ['weightlifting'], group: 'Lifting order', label: 'Increase after a good lift', kind: 'choice', phase: true, default: 1,
    choices: [{ value: 1, label: '+1 kg (IWF)' }, { value: 2, label: '+2 kg' }, { value: 5, label: '+5 kg' }],
    help: 'The smallest jump to the next attempt after a good lift. The app also declares this jump automatically.',
    source: 'IWF TCRR: at least 1 kg (verify)',
  },
  {
    key: 'wlRepeat', sports: ['weightlifting'], group: 'Lifting order', label: 'After a no lift', kind: 'choice', phase: true, default: 'same',
    choices: [{ value: 'same', label: 'May repeat the same weight (IWF)' }, { value: 'up', label: 'Must go up by the increase' }],
    help: 'Whether a lifter may take the same weight again after a failed attempt.',
    source: 'IWF TCRR (verify)',
  },
  {
    key: 'wlClasses', sports: ['weightlifting'], group: 'Categories', label: 'Bodyweight categories', kind: 'choice', phase: true, default: 'auto',
    choices: [
      { value: 'auto', label: 'By age group (IWF 2025 senior / junior, IWF youth, school list)' },
      { value: 'iwf2025', label: 'IWF 2025 senior for everyone' },
      { value: 'youth', label: 'IWF youth for everyone' },
      { value: 'school', label: 'School list for everyone' },
      { value: 'custom', label: 'Our own list' },
    ],
    help: 'The categories offered when you add a session and checked at the weigh-in. The school list is a house choice — use your federation’s list if it differs.',
    source: 'IWF categories from 1 June 2025 (revised 7 May 2025); school list = house choice',
  },
  {
    key: 'wlClassesM', sports: ['weightlifting'], group: 'Categories', label: 'Our list — men / boys (upper limits, kg)', kind: 'text', phase: true, default: '',
    showIf: { key: 'wlClasses', value: 'custom' },
    help: 'Upper limits in kg, lightest first, separated by commas: "49, 55, 61, 67, 73". The last one also makes a "+" category.',
    source: 'organiser',
  },
  {
    key: 'wlClassesF', sports: ['weightlifting'], group: 'Categories', label: 'Our list — women / girls (upper limits, kg)', kind: 'text', phase: true, default: '',
    showIf: { key: 'wlClasses', value: 'custom' },
    help: 'Upper limits in kg, lightest first: "40, 45, 49, 55, 59".',
    source: 'organiser',
  },
  {
    key: 'liftMedals', sports: ['weightlifting'], group: 'Medals', label: 'Snatch and clean & jerk medals', kind: 'choice', existing: true, default: false,
    choices: yesNo('Snatch, C&J and total (World Championships)', 'Total only (Olympic Games)'),
    help: 'Medals and points for each lift as well as the total.',
    source: 'IWF World Championships / Olympic practice',
  },
  {
    key: 'sinclair', sports: ['weightlifting'], group: 'Medals', label: 'Best lifter (Sinclair)', kind: 'choice', existing: true, default: false,
    choices: yesNo('Show Sinclair totals', 'Off'),
    help: 'Compares lifters across bodyweight categories: total × the Sinclair coefficient for the bodyweight.',
    source: 'IWF Sinclair',
  },
  {
    key: 'sinclairPeriod', sports: ['weightlifting'], group: 'Medals', label: 'Sinclair coefficients', kind: 'choice', phase: true, default: '2021',
    showIf: { key: 'sinclair', value: true },
    choices: [{ value: '2021', label: '2021–2024 Olympiad' }, { value: '2017', label: '2017–2020 Olympiad' }],
    help: 'Which published coefficients the Sinclair totals use. The 2025–2028 values were not published when this was built.',
    source: 'IWF (verify the current Olympiad’s values at iwf.sport)',
  },

  /* --------------------------------- athletics --------------------------------- */
  {
    key: 'falseStart', sports: ['athletics'], group: 'Starts', label: 'False starts (track races)', kind: 'choice', phase: true, default: 'zero',
    choices: [{ value: 'zero', label: 'Zero tolerance — disqualified (TR 16.8)' }, { value: 'one', label: 'One per race, the next disqualifies' }],
    help: 'Zero tolerance is the World Athletics rule. Many school and masters meets allow one false start per race: it is charged to the race and anyone after that is disqualified.',
    source: 'World Athletics TR 16.8; one-per-race = school / masters practice (verify your board)',
  },
  {
    key: 'ceFalseStart', sports: ['athletics'], group: 'Starts', label: 'False starts in combined events', kind: 'choice', phase: true, default: 'one',
    choices: [{ value: 'one', label: 'One per race, the next disqualifies (TR 39.8.3)' }, { value: 'zero', label: 'Zero tolerance' }],
    help: 'Decathlon, heptathlon and pentathlon races have their own false-start rule.',
    source: 'World Athletics TR 39.8.3 as remembered (verify)',
  },
  {
    key: 'windLimit', sports: ['athletics'], group: 'Records', label: 'Wind limit for records and PBs', kind: 'choice', phase: true, default: '2.0',
    choices: [{ value: '2.0', label: '+2.0 m/s (World Athletics)' }, { value: 'none', label: 'No wind rule' }],
    help: '100 m, 200 m, sprint hurdles, long and triple jump: a following wind over the limit is "wind-assisted" (w) — the mark counts for the result but not for records or PBs.',
    source: 'World Athletics TR 29 / CR 31',
  },
  {
    key: 'handTimed', sports: ['athletics'], group: 'Records', label: 'Hand times for records', kind: 'choice', existing: true, default: false,
    choices: yesNo('Hand-timed meet: hand times count (shown "h")', 'Only fully automatic times count'),
    help: 'A meet with stopwatches and no wind gauge. New events pick this up when you add them.',
    source: 'World Athletics CR 31 (automatic timing for records)',
  },
  {
    key: 'handConvert', sports: ['athletics'], group: 'Records', label: 'Hand-time conversion', kind: 'choice', phase: true, default: 'stats',
    choices: [{ value: 'stats', label: 'Show ≈ electronic (+0.24 s / +0.14 s)' }, { value: 'none', label: 'Don’t convert' }],
    help: 'A hand time next to its usual electronic equivalent, for statistics only — the official mark stays the hand time.',
    source: 'ranking-list practice (statistics only)',
  },
  {
    key: 'ageOn', sports: ['athletics', 'swimming'], group: 'Entries', label: 'Age cut-off', kind: 'age', existing: true, default: 'dec31',
    help: 'The day ages are counted on for the age groups.',
    source: 'World Athletics / World Aquatics: 31 December; school boards publish their own',
  },
  {
    key: 'lateLanes', sports: ['athletics', 'swimming'], group: 'Entries', label: 'Lane for a late entry', kind: 'choice', phase: true, default: 'outside',
    choices: [{ value: 'outside', label: 'Outside lanes first (worst seeded lanes)' }, { value: 'inside', label: 'Lowest free lane first' }],
    help: 'Where an athlete added after the start list goes in a heat that still has a free lane.',
    source: 'house choice',
  },
  {
    key: 'caps', sports: ['athletics', 'swimming'], group: 'Entries', label: 'Events per athlete', kind: 'caps', default: '',
    help: 'The most individual events and relays one athlete may enter (the entries desk warns when someone goes over).',
    source: 'school board circulars',
  },
  {
    key: 'xcScorers', sports: ['athletics'], group: 'Cross-country & road teams', label: 'Team scorers (N)', kind: 'choice', default: 'auto',
    choices: [{ value: 'auto', label: 'By age (4 for U10–U20, 6 senior)' }, { value: 3, label: 'First 3' }, { value: 4, label: 'First 4' }, { value: 5, label: 'First 5' }, { value: 6, label: 'First 6' }],
    help: 'How many of a team’s finishers add up to its score. New races start with this.',
    source: 'World XC senior 6, U20 4 as remembered (verify); schools usually 4',
  },
  {
    key: 'xcSize', sports: ['athletics'], group: 'Cross-country & road teams', label: 'Team runners (M)', kind: 'choice', default: 6,
    choices: [{ value: 6, label: 'Up to 6' }, { value: 7, label: 'Up to 7' }, { value: 8, label: 'Up to 8' }, { value: 0, label: 'No limit' }],
    help: 'A team’s first M finishers count as the team; later ones run as individuals.',
    source: 'house choice (6 usual)',
  },
  {
    key: 'xcBasis', sports: ['athletics'], group: 'Cross-country & road teams', label: 'Counting places', kind: 'choice', default: 'teams',
    choices: [{ value: 'teams', label: 'Complete teams only (non-scorers displace)' }, { value: 'overall', label: 'Overall places' }, { value: 'scorers', label: 'Scorers only' }],
    help: '"Displace" re-numbers the places among complete teams and lets a team’s 5th–6th runners push others back (school / NFHS practice); "overall" uses everyone’s finishing place.',
    source: 'NFHS / NCAA practice vs World XC as remembered (verify)',
  },
  {
    key: 'xcTieBreak', sports: ['athletics'], group: 'Cross-country & road teams', label: 'Equal team scores', kind: 'choice', default: 'last',
    choices: [{ value: 'last', label: 'Higher last scorer wins' }, { value: 'next', label: 'Higher next runner wins (the 6th runner rule)' }],
    help: 'The last-scorer rule compares each team’s last scoring runner; the next-runner rule (NFHS) compares the first non-scoring runner — a team without one loses.',
    source: 'World Athletics as remembered / NFHS 6th-runner rule (verify)',
  },
  {
    key: 'roadCertified', sports: ['athletics'], group: 'Cross-country & road teams', label: 'Road course', kind: 'choice', default: false,
    choices: yesNo('Certified, measured (records allowed)', 'Not certified (no records)'),
    help: 'Only a measured, certified road course can set a meet or school record. PBs count on any course. Cross-country never sets records.',
    source: 'World Athletics TR 55.2 / CR 31',
  },
  {
    key: 'ceTie', sports: ['athletics'], group: 'Combined events', label: 'Equal totals', kind: 'choice', phase: true, default: 'tr39',
    choices: [{ value: 'tr39', label: 'More events won head-to-head, then best single score (TR 39.12)' }, { value: 'share', label: 'Share the place' }],
    help: 'How two athletes on the same total are separated.',
    source: 'World Athletics TR 39.12 as remembered (verify)',
  },
  {
    key: 'ceDns', sports: ['athletics'], group: 'Combined events', label: 'Missing an event', kind: 'choice', phase: true, default: 'out',
    choices: [{ value: 'out', label: 'Out of the competition (TR 39.10)' }, { value: 'zero', label: '0 points, may carry on' }],
    help: 'An athlete who doesn’t start an event: out of the final classification (World Athletics), or 0 points for it and carry on (a school choice).',
    source: 'World Athletics TR 39.10 as remembered (verify)',
  },

  /* --------------------------------- swimming --------------------------------- */
  {
    key: 'swimFalseStart', sports: ['swimming'], group: 'Starts', label: 'False starts', kind: 'choice', phase: true, default: 'one',
    choices: [{ value: 'one', label: 'One-start rule — disqualified (SW 4.4)' }, { value: 'recall', label: 'Recall the first, the next disqualifies' }],
    help: 'World Aquatics disqualifies on the first false start. Some age-group meets recall the heat once.',
    source: 'World Aquatics SW 4.4; recall = age-group practice',
  },
  {
    key: 'splits', sports: ['swimming'], group: 'Timing', label: '50 m splits', kind: 'choice', existing: true, default: true,
    choices: yesNo('Record splits', 'No splits'),
    help: 'Record the time at every 50 m in races over 50 m. New events pick this up when you add them.',
    source: 'house default',
  },
  {
    key: 'laneNumbering', sports: ['swimming'], group: 'Timing', label: 'Lanes in a 10-lane pool', kind: 'choice', phase: true, default: 'zero',
    choices: [{ value: 'zero', label: '0–9 (SW 3.1.2)' }, { value: 'one', label: '1–10' }],
    help: 'How the lanes are numbered when the pool has 10 lanes.',
    source: 'World Aquatics SW 3.1.2',
  },

  /* ---------------------------------- archery ---------------------------------- */
  {
    key: 'archTie', sports: ['archery'], group: 'Ties', label: 'Equal ranking-round scores', kind: 'choice', phase: true, default: 'tens',
    choices: [{ value: 'tens', label: 'Most 10s (X included), then most X (World Archery)' }, { value: 'xs', label: 'Most X, then most 10s' }],
    help: 'The count that separates equal scores in the ranking round.',
    source: 'World Archery Book 3 as remembered (verify)',
  },
  {
    key: 'archShootOff', sports: ['archery'], group: 'Ties', label: 'Level shoot-off arrow', kind: 'choice', phase: true, default: 'closest',
    choices: [{ value: 'closest', label: 'Closest to the centre wins (World Archery)' }, { value: 'repeat', label: 'Shoot another arrow' }],
    help: 'A match-play shoot-off where both arrows score the same.',
    source: 'World Archery as remembered (verify)',
  },
  {
    key: 'archBracket', sports: ['archery'], group: 'Match play', label: 'Bracket size', kind: 'choice', default: 'auto',
    choices: [{ value: 'auto', label: 'Biggest that fits (4–32)' }, { value: 8, label: '8' }, { value: 16, label: '16' }, { value: 32, label: '32' }, { value: 0, label: 'No match play' }],
    help: 'How many archers the ranking round sends to match play. New events start with this.',
    source: 'house choice',
  },

  /* --------------------------------- shooting --------------------------------- */
  {
    key: 'shootTie', sports: ['shooting'], group: 'Ties', label: 'Equal match scores', kind: 'choice', phase: true, default: 'issf',
    choices: [{ value: 'issf', label: 'Inner tens, then series and shots back (ISSF)' }, { value: 'inner', label: 'Inner tens only' }],
    help: 'How equal qualification / match scores are separated. With "inner tens only" a tie still level shares the place (or is shot off for a medal).',
    source: 'ISSF GTR as remembered (verify)',
  },
  {
    key: 'shootFinal', sports: ['shooting'], group: 'Finals', label: 'Final size', kind: 'choice', default: 'auto',
    choices: [{ value: 'auto', label: 'By entries (8 from 10 shooters, smaller at a small meet)' }, { value: 8, label: '8' }, { value: 6, label: '6' }, { value: 0, label: 'No final' }],
    help: 'Finalists for an elimination final. New events start with this.',
    source: 'ISSF final of 8; smaller finals = house choice',
  },
  {
    key: 'shootOff', sports: ['shooting'], group: 'Finals', label: 'Equal medal places with no final', kind: 'choice', phase: true, default: 'shoot-off',
    choices: [{ value: 'shoot-off', label: 'Shoot-off' }, { value: 'share', label: 'Share the place' }],
    help: 'A match with no final that ends level for a medal place.',
    source: 'house choice',
  },

  /* ---------------------------------- cycling ---------------------------------- */
  {
    key: 'cycGap', sports: ['cycling'], group: 'Road race times', label: 'New time group after a gap of', kind: 'choice', phase: true, default: 1,
    choices: [{ value: 1, label: '1 s (UCI)' }, { value: 2, label: '2 s' }, { value: 3, label: '3 s' }, { value: 0, label: 'Every rider their own time' }],
    help: 'Riders finishing together get the group’s time ("s.t."); a gap of this much starts a new group.',
    source: 'UCI 2.3.039 as remembered (verify)',
  },
  {
    key: 'cycGcTie', sports: ['cycling'], group: 'Stage races', label: 'Equal GC times', kind: 'choice', phase: true, default: 'uci',
    choices: [{ value: 'uci', label: 'Time-trial hundredths, then stage places, then last stage (UCI)' }, { value: 'places', label: 'Stage places, then last stage' }],
    help: 'How riders on the same overall time are separated.',
    source: 'UCI 2.6.015 as remembered (verify)',
  },
  {
    key: 'cycSprintPts', sports: ['cycling'], group: 'Points race', label: 'Points per sprint', kind: 'choice', phase: true, default: '5,3,2,1',
    choices: [{ value: '5,3,2,1', label: '5-3-2-1 (UCI)' }, { value: '4,3,2,1', label: '4-3-2-1' }, { value: '3,2,1', label: '3-2-1' }],
    help: 'Points for the first riders at each intermediate sprint.',
    source: 'UCI points race',
  },
  {
    key: 'cycFinishDouble', sports: ['cycling'], group: 'Points race', label: 'Final sprint', kind: 'choice', phase: true, default: true,
    choices: yesNo('Double points (UCI)', 'Same points'),
    help: 'Whether the sprint at the finish is worth double.',
    source: 'UCI points race',
  },

  /* ------------------------------- rowing / canoe ------------------------------- */
  {
    key: 'crewProgression', sports: ['rowing', 'canoe'], group: 'Progression', label: 'Progression table', kind: 'choice', default: 'standard',
    choices: [{ value: 'standard', label: 'Federation table (repechage / semi-finals)' }, { value: 'ab', label: 'Heats straight to Finals A / B' }],
    help: 'The rounds offered first when you add a race with more crews than lanes. You can still pick another on the race.',
    source: 'World Rowing / ICF progression tables as remembered (verify)',
  },
  {
    key: 'crewLanes', sports: ['rowing', 'canoe'], group: 'Progression', label: 'Lanes after the first round', kind: 'choice', phase: true, default: 'centre',
    choices: [{ value: 'centre', label: 'Best in the centre (3 4 2 5 1 6)' }, { value: 'sequential', label: 'Best in lane 1, then 2, 3 …' }],
    help: 'How crews are given lanes in repechages, semi-finals and finals.',
    source: 'World Rowing / ICF lane allocation',
  },
];

/** The rule definitions for one sport, in screen order. */
export const rulesFor = (sport: string): RuleDef[] => COMPETITION_RULES.filter((r) => r.sports.includes(sport as RulesSport));

const DEFS = new Map(COMPETITION_RULES.map((r) => [r.key, r]));
export const ruleDef = (key: string): RuleDef | undefined => DEFS.get(key);

/** A phase-level rule (from `PhaseFormat.rules` / `def.rules`), or its default. */
export function ruleOf(rules: CompRules | null | undefined, key: string): RuleValue {
  const v = rules?.[key];
  return v !== undefined ? v : (DEFS.get(key)?.default ?? '');
}

/** A tournament-level rule (from `formats[sport]`), or its default. */
export function sportRule(fmt: Record<string, unknown> | null | undefined, key: string): RuleValue {
  const v = fmt?.[key];
  if (v === undefined || v === null || v === '') return DEFS.get(key)?.default ?? '';
  return v as RuleValue;
}

/** The values the phases of a sport carry: every `phase` rule set to something other than its default. */
export function phaseRules(sport: string, fmt: Record<string, unknown> | null | undefined): CompRules {
  const out: CompRules = {};
  for (const r of rulesFor(sport)) {
    if (!r.phase) continue;
    const v = fmt?.[r.key];
    if (v === undefined || v === null || v === '' || v === r.default) continue;
    out[r.key] = v as RuleValue;
  }
  return out;
}

/** Is the rule shown (its `showIf` rule has the value)? */
export function ruleShown(r: RuleDef, values: Record<string, unknown>): boolean {
  if (!r.showIf) return true;
  const v = values[r.showIf.key] ?? DEFS.get(r.showIf.key)?.default;
  return v === r.showIf.value;
}

/** "Zero tolerance — disqualified (TR 16.8)" — the label of a rule's value. */
export function ruleValueLabel(r: RuleDef, v: unknown): string {
  if (r.kind === 'text') return String(v ?? '') || '—';
  const c = r.choices?.find((x) => x.value === v) ?? r.choices?.find((x) => x.value === r.default);
  return c?.label ?? String(v ?? '');
}

/** Rules whose value differs from the standard default (for the summary line). */
export function changedRules(sport: string, fmt: Record<string, unknown> | null | undefined): RuleDef[] {
  return rulesFor(sport).filter((r) => r.kind === 'choice' && fmt?.[r.key] !== undefined && fmt?.[r.key] !== null && fmt?.[r.key] !== '' && fmt?.[r.key] !== r.default);
}

/* ------------------------------- the lock ------------------------------- */

/** Rules are read-only once any result exists for the sport in the tournament:
 *  a round that went live or was locked, or any mark / attempt / status other
 *  than a scratch. `hasResult` is safety.ts hasAnyResult (passed in — no import). */
export function rulesLocked(
  phases: { status: string; results: unknown[] }[],
  hasResult: (results: unknown[]) => boolean,
): boolean {
  return phases.some((p) => p.status === 'live' || p.status === 'completed' || hasResult(p.results));
}

/* ------------------------- small engine helpers ------------------------- */

/** Parse "49, 55, 61" into ascending kg limits (null when empty or invalid). */
export function parseClassList(text: unknown): number[] | null {
  const parts = String(text ?? '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  for (let i = 1; i < nums.length; i++) if (nums[i] <= nums[i - 1]) return null;
  return nums;
}

/** A 10-lane pool numbered 0–9 (SW 3.1.2) unless the organiser chose 1–10. */
export const zeroLanes = (lanes: number | undefined, rules?: CompRules | null): boolean => lanes === 10 && ruleOf(rules, 'laneNumbering') !== 'one';

/**
 * SD-141: what a false start does now in this race. `warned` = the heats in
 * which a false start has already been charged to the race. Combined events
 * read `ceFalseStart` (default one per race, TR 39.8.3); other track races and
 * swimming read `falseStart` / `swimFalseStart` (default: disqualified).
 */
export function falseStartStep(rules: CompRules | null | undefined, heat: number, warned: number[] | undefined, kind: 'track' | 'combined' | 'swim'): 'warn' | 'dq' {
  const mode = kind === 'combined' ? ruleOf(rules, 'ceFalseStart') : kind === 'swim' ? ruleOf(rules, 'swimFalseStart') : ruleOf(rules, 'falseStart');
  const allowsOne = mode === 'one' ? kind !== 'swim' : mode === 'recall';
  if (!allowsOne) return 'dq';
  return (warned ?? []).includes(heat) ? 'dq' : 'warn';
}

/** Cycling: intermediate-sprint points table from the rule ("5,3,2,1"). */
export function sprintTable(rules: CompRules | null | undefined): number[] {
  const t = String(ruleOf(rules, 'cycSprintPts')).split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  return t.length ? t : [5, 3, 2, 1];
}

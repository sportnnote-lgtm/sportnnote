/**
 * SD-15 (GEN-02) — the per-sport stat schema is the single source of truth.
 *
 * - every sport has a valid schema; keys shared by sports mean the same;
 * - every stat key a plugin writes (attribution / extra / statTotals / round
 *   lines, found by scanning src/sports + running the pure credit helpers) is
 *   declared — an undeclared key fails here;
 * - the old maps (weights, labels, awards, slots, leader categories, headline
 *   order, profile labels, team score unit) and everything computed from them
 *   (award candidates, default awards, leaders, match ratings, award formulas,
 *   summaries, cricket career) equal the GOLDEN values captured from the code
 *   before the refactor (tests/stat-schema.golden.json), except the listed
 *   label fixes;
 * - the schema shape can express hockey, handball and timed / measured sports.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Player, SportId, StatLine } from '../src/core/types.ts';
import {
  STAT_SCHEMAS, STAT_SPORTS, statDef, labelLong, labelShort, lineKeys, statSchema,
} from '../src/sports/statSchemas.ts';
import {
  validateSchema, careerFromSchema, aggregateStat, statDefIn, betterOf, shortOf, oneOf, compactOf, compactOneOf,
  type SportStatSchema,
} from '../src/sports/statSchema.ts';
import { SHARED_STATS } from '../src/sports/sharedStats.ts';
import {
  STAT_WEIGHTS, STAT_LABELS, SPORT_AWARDS, TOURNAMENT_AWARD_SLOTS, statLabel, awardFormula, awardIcon,
  rankAwardCandidates, defaultAwards, matchRatings, awardsFor,
} from '../src/data/ratings.ts';
import { statLabelShort, sportSummary } from '../src/data/stats.ts';
import { STAT_CATEGORIES, leaderStat, categoryLeaders } from '../src/data/standings.ts';
import { computeTeamStats } from '../src/data/teamStats.ts';
import { cricketCareer, bestBowling, highestScore } from '../src/data/cricketCareer.ts';
import { volleyballCredits } from '../src/sports/volleyball/engine.ts';
import { eventCredits } from '../src/sports/basketball/credits.ts';
import { defaultCredits } from '../src/sports/rallyEdit.ts';
import { roundStats } from '../src/sports/golf/engine.ts';
import { FIELD_NOTE_STAT } from '../src/sports/cricket/scorecard.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/stat-schema.golden.json'), 'utf8'));
/** JSON shape (drops `undefined` fields), to compare with the golden file. */
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const SPORTS = golden.SPORTS ?? Object.keys(golden.STAT_WEIGHTS) as SportId[];

/** Label fixes made on purpose (the old maps inflected these wrongly: "1 wins",
 *  "1 fouls"). Everything else must match the golden output exactly. */
const COMPACT_ONE_FIXES: Record<string, string> = {
  wins: 'win', draws: 'draw', losses: 'loss', boards: 'board', queens: 'queen',
  holesWon: 'hole won', birdies: 'birdie', eagles: 'eagle', rounds: 'round',
};
const SHORT_ONE_FIXES: Record<string, string> = { fouls: 'foul', catches: 'catch' };

/** SD-27 (GEN-14) changed these sports' leaders, award slots and MVP weights on
 *  purpose (rank by average with minimums, racket results not rally points,
 *  FIBA EFF, FIVB per-set awards, chess score). Their new outputs are pinned in
 *  tests/leaders-awards.test.mts. Cricket, football and golf still equal the
 *  golden values here (football: the Golden Boot tie-break and two appended
 *  leader categories are the listed exceptions). */
const SD27_CHANGED = new Set(['basketball', 'volleyball', 'kabaddi', 'chess', 'carrom', 'tennis', 'badminton', 'tabletennis', 'squash', 'padel', 'pickleball']);
const KEPT = (SPORTS as string[]).filter((sp) => !SD27_CHANGED.has(sp));
const pick = <T,>(o: Record<string, T>) => Object.fromEntries(KEPT.map((sp) => [sp, o[sp]]));

describe('SD-15 — every sport has a valid schema', () => {
  test('14 sports, one schema each, keyed by its own sport', () => {
    assert.deepEqual([...STAT_SPORTS].sort(), [...SPORTS, 'athletics', 'hockey', 'swimming', 'weightlifting', 'handball', 'shooting'].sort()); // SD-90 athletics, SD-101 hockey, SD-94 swimming, SD-97 weightlifting, SD-102 handball, SD-96 shooting went live after the golden snapshot
    for (const sp of STAT_SPORTS) assert.equal(STAT_SCHEMAS[sp].sport, sp);
  });
  test('every reference resolves (sections, box, leaders, headline, awards, aggregations)', () => {
    for (const sp of STAT_SPORTS) assert.deepEqual(validateSchema(STAT_SCHEMAS[sp]), [], sp);
  });
  test('every stat and section has a real label; every sport leads, heads and awards something', () => {
    for (const sp of STAT_SPORTS) {
      const s = STAT_SCHEMAS[sp];
      for (const d of s.stats) assert.ok(d.label && d.label !== d.key, `${sp}.${d.key} needs a label`);
      for (const sec of s.sections ?? []) assert.ok(sec.title && sec.rows.length > 0, `${sp} section ${sec.id}`);
      assert.ok(s.leaders.length > 0 && s.headline.length > 0 && s.awards.length > 0, sp);
    }
  });
  test('a key shared by several sports has the same labels everywhere', () => {
    const seen = new Map<string, { sp: string; labels: string[] }>();
    for (const sp of STAT_SPORTS) {
      for (const d of STAT_SCHEMAS[sp].stats) {
        const labels = [d.label, shortOf(d), oneOf(d), compactOf(d), compactOneOf(d)];
        const prev = seen.get(d.key);
        if (prev) assert.deepEqual(labels, prev.labels, `${d.key}: ${sp} vs ${prev.sp}`);
        else seen.set(d.key, { sp, labels });
      }
    }
  });
  test('the plugin contract carries the schema (types) and shared keys are appearance / medal keys', () => {
    assert.deepEqual(SHARED_STATS.map((s) => s.key), ['apps', 'starts', 'golds', 'silvers']);
    assert.equal(statSchema('cricket')?.careerView, 'sections');
  });
});

/* ------------------------- every written key is declared ------------------------- */

const SPORT_DIRS = new Set<string>(STAT_SPORTS);
/** Files shared by the rally / racket sports (and volleyball). */
const RALLY_SPORTS: SportId[] = ['badminton', 'pickleball', 'padel', 'squash', 'tabletennis', 'tennis', 'volleyball'];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}
/** quoted identifiers, minus those only compared against (`=== 'draw'`) */
const ids = (s: string) => [...s.replace(/[!=]==\s*'\w+'/g, '').matchAll(/'([a-zA-Z][a-zA-Z0-9]*)'/g)].map((m) => m[1]);
const objKeys = (body: string) => [...body.matchAll(/(?:^|[{,]\s*)([a-zA-Z][a-zA-Z0-9]*)\s*:/g)].map((m) => m[1]);
/** Stat keys a source file writes: attribution `stat:` values, `extra: {…}`
 *  keys, credit()/attribution() helpers, the STAT_KEY / GOAL_STAT /
 *  FIELD_NOTE_STAT maps, chess outcomes and statTotals object literals. */
function writtenKeys(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\bstat:\s*([^,}\n]+)/g)) out.push(...ids(m[1]));
  for (const m of src.matchAll(/\b(?:credit|attribution)\([^,()]+,\s*'(\w+)'/g)) out.push(m[1]);
  for (const m of src.matchAll(/\bextra:\s*\{([^}]*)\}/g)) out.push(...objKeys(m[1]));
  for (const m of src.matchAll(/\b(?:STAT_KEY|GOAL_STAT|FIELD_NOTE_STAT)\b[^=\n]*=\s*\{([^}]*)\}/g)) out.push(...ids(m[1]));
  for (const m of src.matchAll(/\bconst outcome\s*=([^;\n]+)/g)) out.push(...ids(m[1]));
  for (const m of src.matchAll(/Object\.assign\((?:[^(){},]|\([^()]*\))+,\s*\{([^}]*)\}/g)) out.push(...objKeys(m[1]));
  for (const m of src.matchAll(/\bstats:\s*\{([^}]*)\}/g)) out.push(...objKeys(m[1]));
  return out.filter((k) => !/^(playerId|playerName|by|stat|tracked|extra|side|type|payload)$/.test(k));
}

describe('SD-15 — every stat key a plugin writes is declared', () => {
  const files = walk(path.join(ROOT, 'src/sports')).filter((f) => !/[/\\](stats|statSchemas?|sharedStats|rallyStats)\.ts$/.test(f));
  const found = new Map<SportId | '*', Set<string>>();
  const add = (sp: SportId | '*', ks: string[]) => { const s = found.get(sp) ?? new Set(); ks.forEach((k) => s.add(k)); found.set(sp, s); };
  for (const f of files) {
    const rel = path.relative(path.join(ROOT, 'src/sports'), f).split(path.sep);
    const keys = writtenKeys(fs.readFileSync(f, 'utf8'));
    if (!keys.length) continue;
    if (rel.length > 1 && SPORT_DIRS.has(rel[0])) add(rel[0] as SportId, keys);
    else if (/^(rally|Rally|PointBoxScore)/.test(rel[0])) RALLY_SPORTS.forEach((sp) => add(sp, keys));
    else add('*', keys); // voice parsers, amend … — any sport
  }
  // credit helpers and absolute line writers, run for real
  add('volleyball', ['point', 'ace', 'block', 'attack', 'opperror'].flatMap((k) => Object.keys(volleyballCredits(k as never))));
  // SD-31 / SD-40: basketball's credit table (every play type, tracked shots, typed rebounds)
  add('basketball', (['score', 'miss', 'freethrow', 'rebound', 'assist', 'steal', 'block', 'turnover', 'foul', 'eject'] as const).flatMap((type) =>
    [{ points: 3, fga: true as const, made: true, reboundType: 'off' as const }, { points: 2, reboundType: 'def' as const }]
      .flatMap((x) => Object.keys(eventCredits({ id: 1, quarter: 1, minute: 0, side: 'home', type, ...x }, false)))));
  for (const sp of RALLY_SPORTS) add(sp, ['point', 'rally'].flatMap((k) => Object.keys(defaultCredits(k as never))));
  add('golf', Object.keys(roundStats({ strokes: [3, 4, 5, 6, 2], putts: [1, 2, 2, 1, 1], gir: [true, false, true, true, true], fir: [true, false, null, true, null], penalties: [0, 1, 0, 0, 0] } as never,
    [3, 4, 4, 5, 4].map((par, i) => ({ number: i + 1, par, strokeIndex: i + 1 })) as never, [0, 0, 0, 0, 0])));
  add('cricket', Object.values(FIELD_NOTE_STAT));

  test('the scan finds what the plugins write (sanity)', () => {
    assert.ok((found.get('football')?.size ?? 0) >= 20, `football: ${[...(found.get('football') ?? [])]}`);
    assert.ok((found.get('cricket')?.size ?? 0) >= 15, `cricket: ${[...(found.get('cricket') ?? [])]}`);
    assert.ok(found.get('basketball')?.has('freeThrowsAtt'));
    assert.ok(found.get('golf')?.has('puttHoles'));
    assert.ok(found.get('chess')?.has('wins') && found.get('chess')?.has('losses'));
    assert.ok(found.get('tennis')?.has('doubleFaults'));
    assert.ok(found.get('kabaddi')?.has('tacklePoints'));
  });
  test('per-sport keys are declared on that sport\'s schema', () => {
    for (const [sp, keys] of found) {
      if (sp === '*') continue;
      const declared = lineKeys(sp);
      const unknown = [...keys].filter((k) => !declared.has(k));
      assert.deepEqual(unknown, [], `${sp} writes undeclared stat keys`);
    }
  });
  test('keys from shared writers (voice, amend) are declared on some sport', () => {
    const unknown = [...(found.get('*') ?? [])].filter((k) => !statDef(k));
    assert.deepEqual(unknown, []);
  });
});

/* ------------------------------ golden: the old maps ------------------------------ */

describe('SD-15 — the old maps are derived views, equal to the golden values', () => {
  test('MVP weights (non-zero, in the same order — order breaks ties)', () => {
    for (const sp of KEPT) {
      const want = (golden.STAT_WEIGHTS[sp] as [string, number][]).filter(([, w]) => w !== 0);
      assert.deepEqual(Object.entries(STAT_WEIGHTS[sp as SportId]), want, sp);
    }
  });
  test('per-match rating labels (STAT_LABELS)', () => assert.deepEqual(STAT_LABELS, golden.STAT_LABELS));
  test('per-match role awards (SPORT_AWARDS)', () => assert.deepEqual(pick(SPORT_AWARDS), pick(golden.SPORT_AWARDS)));
  test('tournament award slots', () => assert.deepEqual(pick(TOURNAMENT_AWARD_SLOTS), pick(golden.TOURNAMENT_AWARD_SLOTS)));
  test('leaderboard categories + headline leader', () => {
    // SD-16 appended cricket's records categories after the original three
    // SD-27 appended football's goals per 90 and save % after the golden ones
    const now = pick({
      ...STAT_CATEGORIES,
      cricket: STAT_CATEGORIES.cricket.slice(0, golden.STAT_CATEGORIES.cricket.length),
      football: STAT_CATEGORIES.football.slice(0, golden.STAT_CATEGORIES.football.length),
    });
    assert.deepEqual(now, pick(golden.STAT_CATEGORIES));
    assert.deepEqual(STAT_CATEGORIES.football.slice(golden.STAT_CATEGORIES.football.length).map((c) => c.key), ['goalsPer90', 'savePct']);
    assert.deepEqual(STAT_CATEGORIES.cricket.slice(golden.STAT_CATEGORIES.cricket.length).map((c) => c.label),
      ['Highest score', 'Best bowling', 'Best batting average', 'Best strike rate', 'Best economy', 'Most 50s', 'Most 100s']);
    for (const sp of KEPT) assert.deepEqual(leaderStat(sp as SportId), golden.leaderStat[sp]);
  });
  test('headline order', () => {
    for (const sp of SPORTS) assert.deepEqual(statSchema(sp as SportId)?.headline, golden.HEADLINE_ORDER[sp], sp);
  });
  test('profile long labels (every key the profile map had)', () => {
    for (const [k, v] of Object.entries(golden.PROFILE_LABELS)) assert.equal(labelLong(k), v, k);
  });
  test('team score unit', () => {
    for (const sp of SPORTS) assert.equal(statSchema(sp as SportId)?.scoreUnit, golden.UNIT[sp], sp);
    const m = { id: 'm1', sport: 'volleyball', status: 'completed', winner: 'home', score: { home: 3, away: 1 }, homeTeam: { id: 't', name: 'T' }, awayTeam: { id: 'u', name: 'U' } };
    assert.equal(computeTeamStats('t', [m as never]).unit, 'sets');
  });
  test('compact labels (statLabel) — equal where the old map had the key; fixes listed', () => {
    for (const [k, [one, two, zero]] of Object.entries(golden.statLabel as Record<string, string[]>)) {
      const now = [statLabel(k, 1), statLabel(k, 2), statLabel(k, 0)];
      if (k in golden.STAT_LABELS) {
        assert.deepEqual(now, [COMPACT_ONE_FIXES[k] ?? one, two, zero], k);
      } else if (statDef(k)) {
        assert.notEqual(now[1], undefined); // was the raw key; now the schema's label
      } else {
        assert.deepEqual(now, [k, k, k], k); // undeclared → raw key, as before
      }
    }
  });
  test('short labels (statLabelShort) — equal where the old map had the key; fixes listed', () => {
    for (const [k, [one, two, none]] of Object.entries(golden.statLabelShort as Record<string, string[]>)) {
      const now = [statLabelShort(k, 1), statLabelShort(k, 2), statLabelShort(k)];
      if (k in golden.STAT_LABEL) assert.deepEqual(now, [SHORT_ONE_FIXES[k] ?? (k in golden.STAT_LABEL_ONE ? one : two), two, none], k);
      else if (statDef(k)) assert.ok(now[1] && now[1] === labelShort(k, 2), k);
      else assert.deepEqual(now, [k, k, k], k);
    }
    // the gaps the schema closes: no raw camelCase on a notification line
    assert.equal(statLabelShort('yellowCards', 1), 'yellow card');
    assert.equal(statLabelShort('ballsFaced', 2), 'balls faced');
    assert.equal(statLabel('wins', 1), 'win');
  });
});

/* -------------------------- golden: what renders from them -------------------------- */

describe('SD-15 — leaders, awards, ratings and summaries render as before', () => {
  const lines = golden.lines as StatLine[];
  const players = golden.players as Player[];
  test('award formulas and icons', () => {
    for (const sp of SPORTS) {
      for (const [slot, text] of Object.entries(golden.awardFormula[sp] as Record<string, string>)) {
        // SD-27: the Golden Boot names its tie-break chain (FB-11)
        if (SD27_CHANGED.has(sp) || (sp === 'football' && (slot === 'goals' || slot === 'someCustomKey'))) continue;
        assert.equal(awardFormula(sp as SportId, slot === 'someCustomKey' ? 'goals' : slot), text, `${sp}/${slot}`);
      }
      for (const [k, icon] of Object.entries(golden.awardIcon[sp] as Record<string, string>)) assert.equal(awardIcon(sp as SportId, k), icon);
    }
  });
  test('award candidates for every slot (incl. Golden Glove keepers + tie-breaks, cricket details)', () => {
    for (const sp of KEPT) {
      for (const [slot, want] of Object.entries(golden.rankAwardCandidates[sp])) {
        assert.deepEqual(plain(rankAwardCandidates(lines, players, sp as SportId, slot)), want, `${sp}/${slot}`);
      }
    }
  });
  test('default awards', () => {
    for (const sp of KEPT) assert.deepEqual(plain(defaultAwards(lines, players, sp as SportId)), golden.defaultAwards[sp], sp);
  });
  test('tournament leaders (incl. keepers-only clean sheets)', () => {
    for (const sp of KEPT) {
      const now = plain(categoryLeaders(lines, players, sp as SportId));
      // SD-16: cricket's records categories follow the golden ones (tested in aggregate-engine.test.mts);
      // SD-27: so do football's goals per 90 / save %
      const old = sp === 'cricket' ? now.filter((c) => ['runs', 'wickets', 'catches'].includes(c.key))
        : sp === 'football' ? now.filter((c) => !['goalsPer90', 'savePct'].includes(c.key)) : now;
      assert.deepEqual(old, golden.categoryLeaders[sp], sp);
    }
  });
  test('per-match ratings, MVP and role awards', () => {
    for (const sp of KEPT) {
      const r = matchRatings(lines.filter((l) => l.sport === sp), sp as SportId, players.slice(0, 2), players.slice(2));
      assert.deepEqual(plain(r), golden.matchRatings[sp], sp);
      assert.deepEqual(plain(awardsFor(r.players, sp as SportId)), golden.awardsFor[sp], sp);
    }
  });
  test('profile / discover one-line summaries', () => {
    for (const sp of SPORTS) {
      const totals: Record<string, number> = {};
      for (const l of lines) if (l.sport === sp) for (const [k, v] of Object.entries(l.stats)) totals[k] = (totals[k] ?? 0) + v;
      const b = { sport: sp as SportId, matches: 2, wins: 1, draws: 0, losses: 1, ties: 0, noResults: 0, starts: 0, startsKnown: 0, totals };
      assert.equal(sportSummary(b), golden.sportSummary[sp], sp);
    }
  });
});

describe('SD-15 — cricket is the proof spec: its career renders identically from the schema', () => {
  test('Batting / Bowling / Fielding on every fixture (legacy lines, no bowling, bowling only, empty)', () => {
    for (const [name, ls] of Object.entries(golden.cricketFixtures as Record<string, StatLine[]>)) {
      assert.deepEqual(cricketCareer(ls), golden.cricketCareer[name], name);
    }
  });
  test('the career is the schema: sections, rows and labels come from cricket/stats.ts', () => {
    const c = careerFromSchema(STAT_SCHEMAS.cricket, (golden.cricketFixtures.mixed as StatLine[]).filter((l) => l.sport === 'cricket'));
    assert.deepEqual(Object.keys(c), ['batting', 'bowling', 'fielding']);
    assert.deepEqual(c.bowling.map((r) => r.label), ['Overs', 'Wickets', 'Runs', 'Maidens', 'Dots', 'Econ', 'Avg', 'SR', 'Best']);
    assert.equal(bestBowling(golden.cricketFixtures.mixed), golden.cricketCareer.mixed.bowling.find((r: { key: string }) => r.key === 'best').value);
    assert.equal(highestScore(golden.cricketFixtures.mixed), golden.cricketCareer.mixed.batting.find((r: { key: string }) => r.key === 'highest').value);
  });
});

/* ------------------------- expressiveness: new sports (not live) ------------------------- */

const L = (stats: Record<string, number>, i = Math.random()): StatLine => ({ id: `l${i}`, matchId: `m${i}`, playerId: 'p', sport: 'football', stats, won: false });

/** FIH hockey — goals by type, penalty corners won / converted, GK saves %,
 *  green / yellow / red cards with timed suspensions (SD-101). */
const hockey: SportStatSchema<'hockey'> = {
  sport: 'hockey',
  stats: [
    { key: 'goals', label: 'Goals', short: 'goals', one: 'goal', group: 'attack', weight: 10, matchSummary: true },
    { key: 'fieldGoals', label: 'Field goals', group: 'attack' },
    { key: 'pcGoals', label: 'Penalty-corner goals', short: 'PC goals', group: 'attack' },
    { key: 'strokeGoals', label: 'Penalty-stroke goals', group: 'attack' },
    { key: 'pcWon', label: 'Penalty corners won', short: 'PCs won', group: 'attack', weight: 1 },
    { key: 'pcTaken', label: 'Penalty corners taken', group: 'attack' },
    { key: 'pcConversion', label: 'PC conversion', source: 'derived', group: 'attack', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'pcGoals', den: 'pcTaken', scale: 100, dp: 0, qualifier: { den: 5 } } },
    { key: 'shots', label: 'Shots', group: 'attack' },
    { key: 'saves', label: 'Saves', group: 'goalkeeping', weight: 2, eligible: 'goalkeeper' },
    { key: 'shotsFaced', label: 'Shots faced', group: 'goalkeeping' },
    { key: 'savePct', label: 'Save %', source: 'derived', group: 'goalkeeping', eligible: 'goalkeeper', format: { unit: 'percent', dp: 1 },
      agg: { kind: 'rate', num: 'saves', den: 'shotsFaced', scale: 100, dp: 1, qualifier: { games: 3 } } },
    { key: 'greenCards', label: 'Green cards', group: 'discipline', weight: -1, suspension: { minutes: 2 } },
    { key: 'yellowCards', label: 'Yellow cards', group: 'discipline', weight: -3, suspension: { minutes: 5, maxMinutes: 10 } },
    { key: 'redCards', label: 'Red cards', group: 'discipline', weight: -8, suspension: { permanent: true } },
    { key: 'suspensionMinutes', label: 'Minutes suspended', short: 'mins suspended', group: 'discipline', format: { unit: 'minutes', better: 'lower' } },
    { key: 'goalsPerGame', label: 'Goals per game', source: 'derived', group: 'attack', format: { unit: 'decimal', dp: 2 },
      agg: { kind: 'perGame', key: 'goals', dp: 2, qualifier: { games: 3 } } },
  ],
  sections: [
    { id: 'attack', title: 'Attack', rows: ['goals', 'fieldGoals', 'pcGoals', 'strokeGoals', 'pcConversion', 'goalsPerGame'].map((stat) => ({ stat })) },
    { id: 'goalkeeping', title: 'Goalkeeping', rows: [{ stat: 'saves' }, { stat: 'savePct', label: 'Save %' }] },
    { id: 'discipline', title: 'Discipline', rows: ['greenCards', 'yellowCards', 'redCards', 'suspensionMinutes'].map((stat) => ({ stat })) },
  ],
  box: [{ title: 'Per quarter', columns: ['goals', 'shots', 'pcWon', 'greenCards', 'yellowCards'] }],
  leaders: ['goals', 'pcGoals', 'savePct'],
  headline: ['goals', 'pcGoals', 'saves'],
  awards: [
    { stat: 'goals', icon: '🏑', label: 'Top scorer' },
    { stat: 'savePct', icon: '🧤', label: 'Best goalkeeper', tieBreak: [{ key: 'saves', better: 'higher' }] },
  ],
  scoreUnit: 'goals',
};

/** IHF handball — goals by type, 7-m throws, 2-minute suspensions, GK save %. */
const handball: SportStatSchema<'handball'> = {
  sport: 'handball',
  stats: [
    { key: 'goals', label: 'Goals', group: 'attack', weight: 5 },
    ...['sixM', 'wing', 'nineM', 'fastBreak'].map((k) => ({ key: `${k}Goals`, label: `${k} goals`, group: 'attack' })),
    { key: 'sevenMGoals', label: '7 m goals', group: 'attack' },
    { key: 'sevenMTaken', label: '7 m throws', group: 'attack' },
    { key: 'sevenMPct', label: '7 m %', source: 'derived', group: 'attack', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'sevenMGoals', den: 'sevenMTaken', scale: 100, dp: 0, qualifier: { den: 5 } } },
    { key: 'shots', label: 'Shots', group: 'attack' },
    { key: 'shotPct', label: 'Shooting %', source: 'derived', group: 'attack', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'goals', den: 'shots', scale: 100, dp: 0 } },
    { key: 'saves', label: 'Saves', group: 'goalkeeping', eligible: 'goalkeeper' },
    { key: 'shotsFaced', label: 'Shots faced', group: 'goalkeeping' },
    { key: 'savePct', label: 'Save %', source: 'derived', group: 'goalkeeping', eligible: 'goalkeeper', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'saves', den: 'shotsFaced', scale: 100, dp: 0 } },
    { key: 'twoMinutes', label: '2-minute suspensions', short: '2 min', group: 'discipline', weight: -1, suspension: { minutes: 2 } },
    { key: 'disqualifications', label: 'Disqualifications', group: 'discipline', suspension: { permanent: true } },
    { key: 'mostGoalsInGame', label: 'Most goals in a game', source: 'derived', group: 'attack', agg: { kind: 'max', key: 'goals' } },
  ],
  sections: [
    { id: 'attack', title: 'Attack', rows: [{ stat: 'goals' }, { stat: 'sevenMPct' }, { stat: 'shotPct' }, { stat: 'mostGoalsInGame' }] },
    { id: 'goalkeeping', title: 'Goalkeeping', rows: [{ stat: 'saves' }, { stat: 'savePct' }] },
    { id: 'discipline', title: 'Discipline', rows: [{ stat: 'twoMinutes' }, { stat: 'disqualifications' }] },
  ],
  box: [{ title: 'Per half', columns: ['goals', 'shots', 'sevenMGoals', 'saves', 'twoMinutes'] }],
  leaders: ['goals', 'savePct', 'sevenMPct'],
  headline: ['goals', 'saves'],
  awards: [{ stat: 'goals', icon: '🤾', label: 'Top scorer' }, { stat: 'savePct', icon: '🧤', label: 'Best goalkeeper' }, { stat: 'sevenMPct', icon: '🎯', label: '7 m specialist' }],
};

/** Athletics — timed / measured marks: lower-is-better times, higher-is-better
 *  distances / heights / kg / points; personal bests as best-figure stats. */
const pb = (key: string, label: string, unit: 'time' | 'distance' | 'height' | 'mass' | 'points', dp: number) => ({
  key: `pb_${key}`, label, source: 'derived' as const, group: 'bests', format: { unit, dp },
  agg: { kind: 'best' as const, over: key, by: [{ key, better: betterOf({ unit }) }], render: (s: Record<string, number>) => (s[key] ?? 0).toFixed(dp) },
});
const athletics: SportStatSchema<'athletics'> = {
  sport: 'athletics',
  events: [
    { key: 'm100', label: '100 m', format: { unit: 'time', dp: 2 } },
    { key: 'longJump', label: 'Long jump', format: { unit: 'distance', dp: 2 }, attempts: 6 },
    { key: 'highJump', label: 'High jump', format: { unit: 'height', dp: 2 } },
    { key: 'snatch', label: 'Snatch (weightlifting)', format: { unit: 'mass', dp: 0 }, attempts: 3 },
    { key: 'decathlon', label: 'Decathlon', format: { unit: 'points', dp: 0 } },
  ],
  filters: Object.fromEntries(['m100', 'longJump', 'highJump', 'snatch', 'decathlon'].map((k) => [k, (l: StatLine) => l.stats?.[k] != null])),
  stats: [
    { key: 'm100', label: '100 m', format: { unit: 'time', dp: 2 } },
    { key: 'longJump', label: 'Long jump', format: { unit: 'distance', dp: 2 } },
    { key: 'highJump', label: 'High jump', format: { unit: 'height', dp: 2 } },
    { key: 'snatch', label: 'Snatch', format: { unit: 'mass', dp: 0 } },
    { key: 'decathlon', label: 'Decathlon', format: { unit: 'points', dp: 0 } },
    { key: 'golds', label: 'Golds', group: 'medals' },
    pb('m100', '100 m PB', 'time', 2), pb('longJump', 'Long jump PB', 'distance', 2), pb('highJump', 'High jump PB', 'height', 2),
    pb('snatch', 'Snatch PB', 'mass', 0), pb('decathlon', 'Decathlon PB', 'points', 0),
  ],
  sections: [
    { id: 'bests', title: 'Personal bests', rows: ['pb_m100', 'pb_longJump', 'pb_highJump', 'pb_snatch', 'pb_decathlon'].map((stat) => ({ stat })) },
    { id: 'medals', title: 'Medals', rows: [{ stat: 'golds' }] },
  ],
  leaders: ['pb_m100', 'pb_longJump'],
  headline: ['golds'],
  awards: [{ stat: 'golds', icon: '🥇', label: 'Most golds' }],
};

describe('SD-15 — the schema shape expresses hockey, handball and timed / measured sports', () => {
  test('the three sample schemas are valid (all now live sports)', () => {
    for (const s of [hockey, handball, athletics] as SportStatSchema<string>[]) assert.deepEqual(validateSchema(s), [], s.sport);
    assert.ok((STAT_SPORTS as string[]).includes('handball')); // athletics went live with SD-90, hockey with SD-101, handball with SD-102
  });
  test('hockey: PC conversion and GK save % as rates; timed suspensions declared; per-game (SD-16)', () => {
    const c = careerFromSchema(hockey, [
      L({ goals: 2, pcGoals: 1, pcTaken: 4, saves: 0, shotsFaced: 0, greenCards: 1, suspensionMinutes: 2 }),
      L({ goals: 1, pcGoals: 1, pcTaken: 2, saves: 8, shotsFaced: 10, yellowCards: 1, suspensionMinutes: 5 }),
    ]);
    const v = (sec: string, k: string) => c[sec].find((r) => r.key === k)?.value;
    assert.equal(v('attack', 'pcConversion'), '33%');
    assert.equal(v('goalkeeping', 'savePct'), '80.0%');
    assert.equal(v('discipline', 'suspensionMinutes'), '7');
    assert.equal(v('attack', 'goalsPerGame'), '1.50'); // perGame — the SD-16 aggregate engine (3 goals / 2 games)
    assert.deepEqual(statDefIn(hockey, 'yellowCards')?.suspension, { minutes: 5, maxMinutes: 10 });
    assert.equal(statDefIn(hockey, 'redCards')?.suspension?.permanent, true);
  });
  test('handball: 7 m %, save %, 2-minute suspensions', () => {
    const c = careerFromSchema(handball, [L({ goals: 6, shots: 9, sevenMGoals: 3, sevenMTaken: 4, twoMinutes: 1 }), L({ saves: 12, shotsFaced: 30 })]);
    const v = (sec: string, k: string) => c[sec].find((r) => r.key === k)?.value;
    assert.equal(v('attack', 'sevenMPct'), '75%');
    assert.equal(v('attack', 'shotPct'), '67%');
    assert.equal(v('goalkeeping', 'savePct'), '40%');
    assert.equal(v('discipline', 'twoMinutes'), '1');
    assert.equal(statDefIn(handball, 'twoMinutes')?.suspension?.minutes, 2);
  });
  test('athletics: lower-is-better time, higher-is-better distance / height / kg / points', () => {
    assert.equal(betterOf({ unit: 'time' }), 'lower');
    assert.equal(betterOf({ unit: 'distance' }), 'higher');
    const lines = [
      L({ m100: 11.02, longJump: 6.41 }), L({ m100: 10.85, highJump: 1.92 }), L({ m100: 10.91, longJump: 6.88, snatch: 120 }),
      L({ longJump: 6.5, highJump: 2.01, snatch: 125, decathlon: 7420 }), L({ golds: 1 }), L({ golds: 2 }),
    ];
    const c = careerFromSchema(athletics, lines);
    assert.deepEqual(c.bests.map((r) => [r.label, r.value]), [
      ['100 m PB', '10.85'], ['Long jump PB', '6.88'], ['High jump PB', '2.01'], ['Snatch PB', '125'], ['Decathlon PB', '7420'],
    ]);
    assert.equal(c.medals[0].value, '3');
    assert.equal(aggregateStat(athletics, statDefIn(athletics, 'pb_m100')!, []), '–'); // no mark → dash, never 0
  });
});

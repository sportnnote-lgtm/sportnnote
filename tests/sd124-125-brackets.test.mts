/**
 * SD-124 — bracket seeding: cross-over from groups (A1 v B2 …), seeded straight
 * knockouts with byes to the top seeds, saved bracket slots (`__koSlot`) so the
 * next round pairs the right winners, and per-game comparison of best-placed
 * teams when groups differ in size.
 * SD-125 — double elimination (winners' / losers' brackets, grand final with an
 * optional reset) and the plate for first-round losers; places for both.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  advancement, advancementBasis, crossoverFits, crossoverTies, seededTies, seededRound, seedFromGroups, seedKnockout, type GroupTable, type Qualifier,
} from '../src/data/groups.ts';
import { knockoutStageRounds, nextRoundPairs, stageChampionId, bracketSeedOrder, KO_SLOT_KEY, isEliminationStage, stageLabel } from '../src/data/bracket.ts';
import { doubleElimState, doubleElimOpeners, plateState, plateEntrants, plateOpeners, dropIndex } from '../src/data/elimDraws.ts';
import { sportPlaces } from '../src/data/bracketPlaces.ts';
import { defaultStandingsConfig, type TeamStanding } from '../src/data/standings.ts';
import { seriesLegFormat, advancePatch } from '../src/data/series.ts';
import { structureFromFormat, structureToFormat, describeStructure } from '../src/data/structureConfig.ts';
import type { Match } from '../src/core/types.ts';

let n = 0;
const mk = (stage: string, h: string, a: string, opts: { slot?: number; win?: 'home' | 'away' | 'draw'; startsAt?: string; format?: Record<string, unknown> } = {}): Match => ({
  id: `m${++n}`, sport: 'football', stage, startsAt: opts.startsAt ?? '',
  status: opts.win ? 'completed' : 'scheduled', winner: opts.win,
  score: opts.win ? { home: opts.win === 'home' ? 1 : 0, away: opts.win === 'away' ? 1 : 0 } : undefined,
  homeTeam: { id: h, name: h }, awayTeam: { id: a, name: a },
  format: { ...(opts.slot !== undefined ? { [KO_SLOT_KEY]: opts.slot } : {}), ...(opts.format ?? {}) },
  state: null,
}) as unknown as Match;

const q = (teamId: string, group: string, rank: number): Qualifier => ({ teamId, name: teamId, group, rank, via: 'direct' });
const pairs = (ties: { homeId: string; awayId: string }[]) => ties.map((t) => `${t.homeId}-${t.awayId}`);

/** Play a single-elimination bracket to the end from saved slots: `beats`
 *  decides each tie; kickoffs are deliberately REVERSED so only the slots keep
 *  the bracket order. Returns every pairing played, by stage. */
function playOut(first: { homeId: string; awayId: string; slot: number }[], stage: string, beats: (a: string, b: string) => string, byes: string[] = []) {
  const all: Match[] = [];
  let round = first.map((t, i) => {
    const w = beats(t.homeId, t.awayId);
    return mk(stage, t.homeId, t.awayId, { slot: t.slot, win: w === t.homeId ? 'home' : 'away', startsAt: `2026-01-${String(30 - i).padStart(2, '0')}` });
  });
  if (byes.length) round = round.map((m) => ({ ...m, byes }));
  const log: Record<string, string[]> = { [stage]: round.map((m) => `${m.homeTeam.id}-${m.awayTeam.id}`) };
  all.push(...round);
  for (let guard = 0; guard < 10; guard++) {
    const rounds = knockoutStageRounds(all);
    const next = nextRoundPairs(rounds[rounds.length - 1]);
    if (!next) break;
    const ms = next.map((p, i) => {
      const w = beats(p.homeId, p.awayId);
      return mk(p.stage, p.homeId, p.awayId, { slot: i, win: w === p.homeId ? 'home' : 'away', startsAt: `2026-02-${String(28 - i).padStart(2, '0')}` });
    });
    log[next[0].stage] = ms.map((m) => `${m.homeTeam.id}-${m.awayTeam.id}`);
    all.push(...ms);
  }
  return { log, champion: stageChampionId(knockoutStageRounds(all)), all };
}

/* -------------------------------- SD-124 ---------------------------------- */

describe('SD-124 cross-over seeding from groups', () => {
  const groupsOf = (names: string[]) => names.flatMap((g) => [q(`${g}1`, g, 1), q(`${g}2`, g, 2)]);

  test('2 groups: A1 v B2, B1 v A2 (A1 and B1 in opposite halves)', () => {
    const qs = groupsOf(['A', 'B']);
    assert.ok(crossoverFits(qs));
    assert.deepEqual(pairs(crossoverTies(qs)), ['A1-B2', 'B1-A2']);
  });

  test('4 groups: the EURO 1996–2012 quarter-final table', () => {
    assert.deepEqual(pairs(crossoverTies(groupsOf(['A', 'B', 'C', 'D']))), ['A1-B2', 'C1-D2', 'B1-A2', 'D1-C2']);
  });

  test('8 groups: the FIFA World Cup 2018/2022 Round of 16 in bracket order', () => {
    // 49 A1–B2, 50 C1–D2, 53 E1–F2, 54 G1–H2 | 51 B1–A2, 52 D1–C2, 55 F1–E2, 56 H1–G2
    assert.deepEqual(pairs(crossoverTies(groupsOf(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']))),
      ['A1-B2', 'C1-D2', 'E1-F2', 'G1-H2', 'B1-A2', 'D1-C2', 'F1-E2', 'H1-G2']);
  });

  for (const G of [2, 4, 8]) {
    test(`${G} groups: winners & runners-up of one group, and A1 & B1, can only meet in the final`, () => {
      const names = 'ABCDEFGH'.slice(0, G).split('');
      const sr = seedFromGroups(groupsOf(names));
      assert.equal(sr.method, 'crossover');
      // group winners always win; later rounds the alphabetically-first team wins
      const rank = (id: string) => (id.endsWith('1') ? 0 : 10) + id.charCodeAt(0);
      const { log, champion } = playOut(sr.ties, sr.stage, (a, b) => (rank(a) < rank(b) ? a : b));
      assert.equal(champion, 'A1');
      assert.deepEqual(log.final, ['A1-B1']);
      for (const [stage, ps] of Object.entries(log)) {
        if (stage === 'final') continue;
        for (const p of ps) { const [x, y] = p.split('-'); assert.notEqual(x[0], y[0], `${stage}: ${p} is a same-group meeting before the final`); }
      }
    });
  }

  test('top 4 of 2 groups seeds the standard A1 v B4, B2 v A3 | B1 v A4, A2 v B3', () => {
    const qs = [q('A1', 'A', 1), q('B1', 'B', 1), q('A2', 'A', 2), q('B2', 'B', 2), q('A3', 'A', 3), q('B3', 'B', 3), q('A4', 'A', 4), q('B4', 'B', 4)];
    const sr = seedFromGroups(qs);
    assert.equal(sr.method, 'seeded');
    assert.deepEqual(pairs(sr.ties), ['A1-B4', 'B2-A3', 'B1-A4', 'A2-B3']);
  });

  test('a seeded round 1 keeps same-group teams apart where it can', () => {
    // 3 groups, top 2 + 2 best thirds = 8: W1..W3, R1..R3, T1, T2
    const qs = [q('A1', 'A', 1), q('B1', 'B', 1), q('C1', 'C', 1), q('C2', 'C', 2), q('B2', 'B', 2), q('A2', 'A', 2), { ...q('A3', 'A', 3), via: 'best' as const }, { ...q('B3', 'B', 3), via: 'best' as const }];
    const sr = seedFromGroups(qs);
    for (const t of sr.ties) assert.notEqual(t.homeId[0], t.awayId[0]);
    assert.equal(sr.ties.length, 4);
  });

  test('legacy draw order (seedKnockout) is unchanged — still offered as "Draw order"', () => {
    const qs = groupsOf(['A', 'B']);
    assert.equal(seedKnockout(qs).length, 2);
  });
});

describe('SD-124 seeded straight knockout', () => {
  const seeds = (k: number) => Array.from({ length: k }, (_, i) => `s${i + 1}`);
  const chalk = (a: string, b: string) => (+a.slice(1) < +b.slice(1) ? a : b);

  test('standard positions: 8 → 1v8, 4v5, 2v7, 3v6', () => {
    assert.deepEqual(bracketSeedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
    assert.deepEqual(pairs(seededTies(seeds(8))), ['s1-s8', 's4-s5', 's2-s7', 's3-s6']);
  });

  for (const k of [4, 8, 16, 32]) {
    test(`${k} seeds: 1 and 2 meet only in the final; 1–4 only from the semi-finals`, () => {
      const sr = seededRound(seeds(k));
      const { log, champion } = playOut(sr.ties, sr.stage, chalk);
      assert.equal(champion, 's1');
      assert.deepEqual(log.final, ['s1-s2']);
      if (k >= 4) assert.deepEqual(log.sf, ['s1-s4', 's2-s3']);
    });
  }

  test('6 entrants: seeds 1 and 2 bye; 3v6, 4v5 play; then 1 v W(4v5), 2 v W(3v6)', () => {
    const sr = seededRound(seeds(6));
    assert.deepEqual(sr.byeIds, ['s1', 's2']);
    assert.deepEqual(pairs(sr.ties), ['s3-s6', 's4-s5']);
    assert.equal(sr.stage, 'qf');
    const { log, champion } = playOut(sr.ties, sr.stage, chalk, sr.byeIds);
    assert.deepEqual(log.sf, ['s1-s4', 's2-s3']);
    assert.equal(champion, 's1');
  });

  test('saved slots beat kickoff order (a rescheduled tie still feeds the right half)', () => {
    const r = knockoutStageRounds([
      mk('qf', 's2', 's7', { slot: 2, win: 'home', startsAt: '2026-01-01' }),
      mk('qf', 's1', 's8', { slot: 0, win: 'home', startsAt: '2026-01-04' }),
      mk('qf', 's3', 's6', { slot: 3, win: 'home', startsAt: '2026-01-02' }),
      mk('qf', 's4', 's5', { slot: 1, win: 'home', startsAt: '2026-01-03' }),
    ]);
    assert.deepEqual(nextRoundPairs(r[0])?.map((p) => `${p.homeId}-${p.awayId}`), ['s1-s4', 's2-s3']);
  });

  test('old rounds without slots keep kickoff order', () => {
    const r = knockoutStageRounds([
      mk('sf', 'x', 'y', { win: 'home', startsAt: '2026-01-02' }),
      mk('sf', 'p', 'q', { win: 'away', startsAt: '2026-01-01' }),
    ]);
    assert.deepEqual(nextRoundPairs(r[0])?.map((p) => `${p.homeId}-${p.awayId}`), ['q-x']);
  });
});

describe('SD-124 best-placed teams per game when groups differ in size', () => {
  const row = (teamId: string, played: number, points: number, diff: number, gf = 5): TeamStanding => ({
    teamId, name: teamId, played, won: 0, lost: 0, drawn: 0, nr: 0, for: gf, against: gf - diff, diff, points, forUnits: 0, againstUnits: 0, adjust: 0,
  });
  const filler = (p: string, k: number) => Array.from({ length: k }, (_, i) => row(`${p}${i + 1}`, 5, 15 - i, 5));

  test('a 3rd in a 6-team group (7 pts / 5 games) ranks below a 3rd in a 5-team group (6 pts / 4 games)', () => {
    const tables: GroupTable[] = [
      { name: 'A', rows: [...filler('A', 2), row('A3', 5, 7, 1), ...filler('Ax', 3)] },
      { name: 'B', rows: [...filler('B', 2), row('B3', 4, 6, 1), ...filler('Bx', 2)] },
    ];
    assert.equal(advancementBasis(tables), 'perGame');
    const qs = advancement(tables, 2, 1, defaultStandingsConfig('football'));
    assert.equal(qs[qs.length - 1].teamId, 'B3'); // 1.5 per game beats 1.4
  });

  test('level on points per game → goal difference per game decides', () => {
    const tables: GroupTable[] = [
      { name: 'A', rows: [...filler('A', 2), row('A3', 4, 6, 4), ...filler('Ax', 1)] },     // GD 1.0 / game
      { name: 'B', rows: [...filler('B', 2), row('B3', 2, 3, 3), ...filler('Bx', 3)] },     // GD 1.5 / game
    ];
    const qs = advancement(tables, 2, 1, defaultStandingsConfig('football'));
    assert.equal(qs[qs.length - 1].teamId, 'B3');
  });

  test('equal groups keep the totals (unchanged)', () => {
    const tables: GroupTable[] = [
      { name: 'A', rows: [...filler('A', 2), row('A3', 3, 7, 1)] },
      { name: 'B', rows: [...filler('B', 2), row('B3', 2, 6, 1)] },
    ];
    assert.equal(advancementBasis(tables), 'total');
    const qs = advancement(tables, 2, 1, defaultStandingsConfig('football'));
    assert.equal(qs[qs.length - 1].teamId, 'A3'); // 7 > 6 on totals
  });
});

/* -------------------------------- SD-125 ---------------------------------- */

/** Run a double-elimination draw: create every ready match, decide it with
 *  `beats`, until nothing is left to create. */
function runDE(k: number, beats: (a: string, b: string) => string, reset = true) {
  const seeds = Array.from({ length: k }, (_, i) => `s${i + 1}`);
  const ms: Match[] = doubleElimOpeners(seeds, reset).map((o) => mk(o.stage, o.homeId, o.awayId, { slot: o.slot, format: o.extra }));
  const met = new Map<string, string>();
  const rematches: string[] = [];
  for (let guard = 0; guard < 200; guard++) {
    for (const m of ms) {
      if (m.status !== 'scheduled') continue;
      const w = beats(m.homeTeam.id, m.awayTeam.id);
      Object.assign(m, { status: 'completed', winner: w === m.homeTeam.id ? 'home' : 'away', score: { home: 1, away: 0 } });
      const key = [m.homeTeam.id, m.awayTeam.id].sort().join('-');
      if (met.has(key)) rematches.push(`${m.stage}:${key}`);
      met.set(key, m.stage!);
    }
    const st = doubleElimState(ms)!;
    if (!st.ready.length) return { st, ms, rematches };
    for (const r of st.ready) ms.push(mk(r.stage, r.homeId, r.awayId, { slot: r.slot }));
  }
  throw new Error('double elimination did not finish');
}
const chalk = (a: string, b: string) => (+a.slice(1) < +b.slice(1) ? a : b);

describe('SD-125 double elimination', () => {
  test('8 entrants, top seeds win: 14 matches, no reset, s1 champion', () => {
    const { st, ms } = runDE(8, chalk);
    assert.equal(st.championId, 's1');
    assert.equal(ms.length, 14); // 2N − 2 without a reset
    assert.equal(st.reset2, undefined);
    assert.deepEqual(st.winners.map((r) => r.stage), ['wb1', 'wb2', 'wb3']);
    assert.deepEqual(st.losers.map((r) => r.stage), ['lb1', 'lb2', 'lb3', 'lb4']);
    assert.deepEqual(st.losers.map((r) => r.nodes.length), [2, 2, 1, 1]);
  });

  test('drop-ins avoid early rematches: none before the losers\' semi-final (top seeds win, 8–32)', () => {
    for (const k of [8, 12, 16, 24, 32]) {
      const { st, rematches } = runDE(k, chalk);
      const M = st.losers.length;
      const early = rematches.filter((r) => r.startsWith('lb') && +r.split(':')[0].slice(2) < M - 1);
      assert.deepEqual(early, [], `${k} entrants`);
    }
    // the drop pattern itself: reversed, then reversed within halves
    assert.deepEqual([0, 1, 2, 3].map((i) => dropIndex(2, 4, i)), [3, 2, 1, 0]);
    assert.deepEqual([0, 1, 2, 3].map((i) => dropIndex(3, 4, i)), [1, 0, 3, 2]);
  });

  test('grand final: a losers\'-side win forces the reset; the reset decides', () => {
    // s2 beats s1 only in the grand final (s1 unbeaten until then)
    let gfPlayed = false;
    const beats = (a: string, b: string) => {
      if ((a === 's1' && b === 's2') || (a === 's2' && b === 's1')) {
        if (!gfPlayed) { gfPlayed = true; return 's1'; } // winners' final: s1
        return 's2';
      }
      return chalk(a, b);
    };
    const { st, ms } = runDE(4, beats);
    assert.ok(st.reset2, 'reset match created');
    assert.equal(ms.filter((m) => m.stage === 'gf2').length, 1);
    assert.equal(st.championId, 's2');
    assert.deepEqual(st.places.slice(0, 2).map((p) => [p.teamId, p.position]), [['s2', 1], ['s1', 2]]);
  });

  test('reset off: one grand final decides it', () => {
    let first = true;
    const beats = (a: string, b: string) => {
      if ([a, b].sort().join() === 's1,s2') { if (first) { first = false; return 's1'; } return 's2'; }
      return chalk(a, b);
    };
    const { st, ms } = runDE(4, beats, false);
    assert.equal(st.reset2, undefined);
    assert.equal(ms.filter((m) => m.stage === 'gf2').length, 0);
    assert.equal(st.championId, 's2');
  });

  test('byes: 6 entrants run to a champion; byes never create a match', () => {
    const { st, ms } = runDE(6, chalk);
    assert.equal(st.championId, 's1');
    assert.ok(ms.every((m) => m.homeTeam.id.startsWith('s') && m.awayTeam.id.startsWith('s')));
    assert.equal(ms.length, 10); // 2N − 2
  });

  test('places: 1st/2nd grand final, 3rd losers\' final loser, 4th losers\' semi loser, then shared bands', () => {
    const { st } = runDE(8, chalk);
    const at = (id: string) => st.places.find((p) => p.teamId === id);
    assert.deepEqual([at('s1')?.position, at('s2')?.position, at('s3')?.position, at('s4')?.position], [1, 2, 3, 4]);
    assert.deepEqual([at('s5')?.position, at('s5')?.shared, at('s7')?.position, at('s7')?.shared], [5, 2, 7, 2]);
  });

  test('the medal table takes double-elimination places', () => {
    const { ms } = runDE(8, chalk);
    const sp = sportPlaces(ms, 'football', defaultStandingsConfig('football'));
    assert.equal(sp.basis, 'structure');
    assert.deepEqual(sp.places.slice(0, 4).map((p) => [p.teamId, p.position]), [['s1', 1], ['s2', 2], ['s3', 3], ['s4', 4]]);
  });

  test('the organiser\'s "Advances" pick moves a stalled double-elimination match on', () => {
    const seeds = ['a', 'b', 'c', 'd'];
    const open = doubleElimOpeners(seeds);
    const ms = open.map((o) => mk(o.stage, o.homeId, o.awayId, { slot: o.slot, format: o.extra }));
    // a v d drawn with no decider → the organiser sends d through
    Object.assign(ms[0], { status: 'completed', winner: 'draw', score: { home: 1, away: 1 } });
    ms[0].format = { ...(ms[0].format ?? {}), ...advancePatch('d', 'Toss after floodlight failure') };
    Object.assign(ms[1], { status: 'completed', winner: 'home', score: { home: 2, away: 0 } });
    const st = doubleElimState(ms)!;
    const wb2 = st.ready.find((r) => r.stage === 'wb2');
    const lb1 = st.ready.find((r) => r.stage === 'lb1');
    assert.deepEqual([wb2?.homeId, wb2?.awayId], ['d', 'b']);
    assert.deepEqual([lb1?.homeId, lb1?.awayId], ['a', 'c']);
  });

  test('team ties / series: a best-of-3 tie in the winners\' bracket counts once', () => {
    const open = doubleElimOpeners(['a', 'b', 'c', 'd']);
    const ms: Match[] = [];
    // slot 0 (a v d) as a best-of-3 series a wins 2–1
    for (const [leg, w] of [[1, 'home'], [2, 'away'], [3, 'home']] as const) {
      ms.push(mk('wb1', 'a', 'd', { slot: 0, win: w, format: { ...open[0].extra, ...seriesLegFormat({ id: 'S1', format: 'best_of', legs: 3, leg, teamAId: 'a' }) } }));
    }
    ms.push(mk('wb1', 'b', 'c', { slot: 1, win: 'away', format: open[1].extra }));
    const st = doubleElimState(ms)!;
    assert.equal(st.winners[0].nodes[0].winner.kind === 'team' && st.winners[0].nodes[0].winner.id, 'a');
    assert.deepEqual(st.ready.map((r) => `${r.stage}:${r.homeId}-${r.awayId}`).sort(), ['lb1:d-b', 'wb2:a-c']);
  });

  test('double elimination and plate stages are knockout stages (deciders on, out of tables)', () => {
    for (const s of ['wb1', 'lb3', 'gf', 'gf2', 'pl1']) assert.ok(isEliminationStage(s), s);
    assert.equal(stageLabel('lb2'), "Losers' round 2");
    assert.equal(stageLabel('qf'), 'Quarter-finals');
  });
});

describe('SD-125 plate for first-round losers', () => {
  const main = () => {
    const sr = seededRound(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']);
    return sr.ties.map((t) => mk('qf', t.homeId, t.awayId, { slot: t.slot, win: 'home' }));
  };

  test('entrants are the first-round losers in bracket order, once round 1 is done', () => {
    const ms = main();
    assert.deepEqual(plateEntrants(knockoutStageRounds(ms)[0]), ['s8', 's5', 's7', 's6']);
    const pending = [...ms.slice(0, 3), mk('qf', 's3', 's6', { slot: 3 })];
    assert.equal(plateEntrants(knockoutStageRounds(pending)[0]), null);
  });

  test('the plate runs to a plate winner and never changes the medal places', () => {
    const ms = main();
    const entrants = plateEntrants(knockoutStageRounds(ms)[0])!;
    const all = [...ms, ...plateOpeners(entrants).map((o) => mk(o.stage, o.homeId, o.awayId, { slot: o.slot, format: o.extra, win: 'away' }))];
    let st = plateState(all)!;
    assert.equal(st.rounds.length, 2);
    for (const r of st.ready) all.push(mk(r.stage, r.homeId, r.awayId, { slot: r.slot, win: 'home' }));
    st = plateState(all)!;
    assert.ok(st.winnerId);
    const sp = sportPlaces(all, 'football', defaultStandingsConfig('football'));
    assert.equal(sp.plateWinnerId, st.winnerId);
    // QF losers still share 5th; no plate result moves them
    for (const id of entrants) assert.equal(sp.places.find((p) => p.teamId === id)?.position, 5);
  });

  test('3 first-round losers: a bye for the first, a plate final after', () => {
    const open = plateOpeners(['x', 'y', 'z']);
    assert.equal(open.length, 1);
    assert.deepEqual([open[0].homeId, open[0].awayId], ['y', 'z']);
  });
});

describe('SD-124/125 structure options', () => {
  test('old configs read and write exactly as before; new keys only once chosen', () => {
    const old = structureFromFormat({ structShape: 'knockout' })!;
    assert.equal(old.bracket, undefined);
    assert.equal('structBracket' in structureToFormat(old), false);
    const de = structureFromFormat({ structShape: 'knockout', structBracket: 'double', structReset: false })!;
    assert.equal(de.bracket, 'double');
    assert.match(describeStructure(de), /Double elimination/);
    const plate = structureFromFormat({ structShape: 'knockout', structPlate: true })!;
    assert.match(describeStructure(plate), /plate for first-round losers/);
  });
});

/**
 * SD-138 — tournament history: live group tables that stay viewable as final
 * (qualified / eliminated markers), knockout round progress, how a level tie
 * was decided, and one team's journey (group finish → each knockout round →
 * final place) across single / double elimination, plates, two-legged ties
 * and team ties. The medal table stays empty until the knockout starts (SD-123).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { groupViews, groupHeading, teamJourney, roundProgress, deciderFromStatus, finishLabel, journeysOf } from '../src/data/tournamentHistory.ts';
import { medalStandings } from '../src/data/medalStandings.ts';
import { defaultStandingsConfig } from '../src/data/standings.ts';
import { seriesLegFormat, advancePatch } from '../src/data/series.ts';
import { pairingsInStage } from '../src/data/bracket.ts';
import type { Match, SportId, TournamentScoring } from '../src/core/types.ts';

let n = 0;
let clock = 0;
type Opt = { stage?: string; group?: string; format?: Record<string, unknown>; status?: string; winner?: 'home' | 'away' | 'draw'; tournamentId?: string };
function m(sport: SportId, home: string, away: string, hs: number, as: number, o: Opt = {}): Match {
  clock += 1;
  const status = o.status ?? 'completed';
  return {
    id: `h${n++}`, sport, status, tournamentId: o.tournamentId ?? 't1',
    startsAt: `2026-10-11T${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}:00Z`,
    ...(status === 'completed' ? { winner: o.winner ?? (hs > as ? 'home' : hs < as ? 'away' : 'draw'), score: { home: hs, away: as } } : {}),
    ...(status === 'live' ? { score: { home: hs, away: as } } : {}),
    homeTeam: { id: home, name: home }, awayTeam: { id: away, name: away },
    stage: o.stage, group: o.group, format: o.format, state: null,
  } as unknown as Match;
}
const F = 'football' as const;
const cfg = defaultStandingsConfig(F);
const g = (grp: string, h: string, a: string, hs: number, as: number, status?: string) => m(F, h, a, hs, as, { group: grp, stage: 'group', status });

/** Group A (A, B, C, D) and Group B (E, F, G, H), every result in. */
const groupsDone = (): Match[] => [
  g('A', 'A', 'B', 3, 0), g('A', 'A', 'C', 3, 0), g('A', 'A', 'D', 3, 0), g('A', 'B', 'C', 1, 0), g('A', 'B', 'D', 1, 0), g('A', 'C', 'D', 1, 0),
  g('B', 'E', 'F', 1, 0), g('B', 'E', 'G', 1, 0), g('B', 'E', 'H', 1, 0), g('B', 'F', 'G', 1, 0), g('B', 'F', 'H', 1, 0), g('B', 'G', 'H', 1, 0),
];

describe('live group tables', () => {
  test('while a group plays: every entrant listed, live rows, provisional, no markers', () => {
    const ms = [g('A', 'A', 'B', 2, 0), g('A', 'C', 'D', 1, 1, 'live'), g('A', 'A', 'C', 0, 0, 'scheduled'), g('A', 'B', 'D', 0, 0, 'scheduled')];
    const [v] = groupViews(ms, F, cfg);
    assert.equal(v.status, 'live');
    assert.equal(groupHeading(v), 'Group A · live');
    assert.deepEqual(v.rows.map((r) => r.name).sort(), ['A', 'B', 'C', 'D']); // C, D listed before a result
    assert.deepEqual(v.rows.filter((r) => r.live).map((r) => r.name).sort(), ['C', 'D']);
    assert.equal(v.rows[0].name, 'A');
    assert.ok(v.rows.every((r) => !r.mark));
    assert.deepEqual([v.played, v.total, v.live.length], [1, 4, 1]);
  });
  test('between matches: "3 of 6 played"', () => {
    const ms = groupsDone().slice(0, 3).concat(groupsDone().slice(3, 6).map((x) => ({ ...x, status: 'scheduled', winner: undefined, score: undefined }) as Match));
    const [v] = groupViews(ms, F, cfg);
    assert.equal(groupHeading(v), 'Group A · 3 of 6 played');
  });
  test('group done, knockout not started: final, markers from the saved top-2 rule', () => {
    const vs = groupViews(groupsDone(), F, cfg, { advanceTopN: 2 });
    assert.deepEqual(vs.map(groupHeading), ['Group A — final', 'Group B — final']);
    assert.deepEqual(vs[0].rows.map((r) => [r.name, r.mark]), [['A', 'qualified'], ['B', 'qualified'], ['C', 'eliminated'], ['D', 'eliminated']]);
    assert.equal(vs[0].marksFrom, 'rule');
  });
  test('no saved rule and no knockout yet: final, but no guessing who goes through', () => {
    const vs = groupViews(groupsDone(), F, cfg);
    assert.equal(vs[0].status, 'final');
    assert.ok(vs[0].rows.every((r) => !r.mark));
  });
  test('one group still playing: no rule markers anywhere yet', () => {
    const ms = groupsDone();
    ms[11] = { ...ms[11], status: 'scheduled', winner: undefined, score: undefined } as Match;
    const vs = groupViews(ms, F, cfg, { advanceTopN: 2 });
    assert.equal(vs[0].status, 'final');
    assert.ok(vs.every((v) => v.rows.every((r) => !r.mark)));
  });
  test('knockout started: markers come from who actually reached it (organiser picks win)', () => {
    // The organiser sent A, C, E, F through (C instead of B).
    const ms = [...groupsDone(), m(F, 'A', 'F', 0, 0, { stage: 'sf', status: 'scheduled' }), m(F, 'E', 'C', 0, 0, { stage: 'sf', status: 'scheduled' })];
    const [a] = groupViews(ms, F, cfg, { advanceTopN: 2 });
    assert.equal(a.marksFrom, 'next-stage');
    assert.deepEqual(a.rows.map((r) => [r.name, r.mark]), [['A', 'qualified'], ['B', 'eliminated'], ['C', 'qualified'], ['D', 'eliminated']]);
  });
  test('best-placed qualifiers are marked as such', () => {
    // 3 groups of 3; top 1 + the best 2nd-placed team.
    const ms = [
      g('A', 'A1', 'A2', 3, 0), g('A', 'A1', 'A3', 3, 0), g('A', 'A2', 'A3', 5, 0),
      g('B', 'B1', 'B2', 3, 0), g('B', 'B1', 'B3', 3, 0), g('B', 'B2', 'B3', 1, 0),
      g('C', 'C1', 'C2', 3, 0), g('C', 'C1', 'C3', 3, 0), g('C', 'C2', 'C3', 1, 0),
    ];
    const vs = groupViews(ms, F, cfg, { advanceTopN: 1, advanceBest: 1 });
    const a2 = vs[0].rows.find((r) => r.name === 'A2')!;
    assert.deepEqual([a2.mark, a2.via], ['qualified', 'best']);
    assert.equal(vs[1].rows.find((r) => r.name === 'B2')!.mark, 'eliminated');
  });
  test('the Super round is a phase too, marked once the knockout starts', () => {
    const ms = [
      ...groupsDone(),
      m(F, 'A', 'E', 1, 0, { stage: 'super' }), m(F, 'B', 'F', 1, 0, { stage: 'super' }), m(F, 'A', 'B', 1, 0, { stage: 'super' }),
      m(F, 'E', 'F', 1, 0, { stage: 'super' }), m(F, 'A', 'F', 1, 0, { stage: 'super' }), m(F, 'B', 'E', 1, 0, { stage: 'super' }),
      m(F, 'A', 'B', 0, 0, { stage: 'final', status: 'scheduled' }),
    ];
    const vs = groupViews(ms, F, cfg, { advanceTopN: 2 });
    const grpA = vs.find((v) => v.key === 'group:A')!;
    assert.deepEqual(grpA.rows.map((r) => r.mark), ['qualified', 'qualified', 'eliminated', 'eliminated']); // reached the Super round
    const sup = vs.find((v) => v.key === 'super')!;
    assert.deepEqual(sup.rows.map((r) => [r.name, r.mark]), [['A', 'qualified'], ['B', 'qualified'], ['E', 'eliminated'], ['F', 'eliminated']]);
  });
});

describe('team journey', () => {
  const full = (): Match[] => [
    ...groupsDone(),
    m(F, 'A', 'F', 2, 0, { stage: 'sf' }), m(F, 'E', 'B', 2, 1, { stage: 'sf' }),
    m(F, 'B', 'F', 1, 0, { stage: 'third' }),
    m(F, 'E', 'A', 1, 1, { stage: 'final', winner: 'home' }),
  ];
  test('group finish → semi → final → runners-up, with the decider from the sport', () => {
    const j = teamJourney(full(), F, 'A', cfg, { advanceTopN: 2, decider: (x) => (x.stage === 'final' ? 'E win 4–3 on pens' : undefined) })!;
    assert.deepEqual(j.phases.map((p) => [p.title, p.position, p.of, p.status, p.mark]), [['Group A', 1, 4, 'final', 'qualified']]);
    assert.deepEqual(j.steps.map((s) => [s.label, s.opponentName, s.outcome, s.score]), [['Semi-finals', 'F', 'won', '2–0'], ['Final', 'E', 'lost', '1–1']]);
    assert.equal(j.steps[1].decider, 'E win 4–3 on pens');
    assert.deepEqual(j.finish, { position: 2, shared: 1, label: 'Runners-up' });
    assert.equal(j.state, 'done');
    assert.equal(j.summary, 'Group A 1st → SF won → Final lost → Runners-up');
  });
  test('champion and 3rd-place match winner', () => {
    assert.equal(teamJourney(full(), F, 'E', cfg)!.state, 'champion');
    const b = teamJourney(full(), F, 'B', cfg)!;
    assert.deepEqual(b.steps.map((s) => [s.stage, s.outcome]), [['sf', 'lost'], ['third', 'won']]);
    assert.equal(b.finish!.label, '3rd');
  });
  test('out in the groups: banded place, marked eliminated', () => {
    const j = teamJourney(full(), F, 'C', cfg)!;
    assert.equal(j.steps.length, 0);
    assert.equal(j.phases[0].mark, 'eliminated');
    assert.equal(j.finish!.label, '=5th');
  });
  test('a live final: both finalists still alive, no place yet', () => {
    const ms = full().slice(0, -1).concat(m(F, 'E', 'A', 1, 0, { stage: 'final', status: 'live' }));
    const j = teamJourney(ms, F, 'A', cfg)!;
    assert.deepEqual([j.steps[1].outcome, j.steps[1].score, j.finish, j.state], ['live', '0–1', undefined, 'alive']);
  });
  test('while the groups play: position so far, still alive', () => {
    const ms = [g('A', 'A', 'B', 2, 0), g('A', 'C', 'D', 0, 0, 'scheduled')];
    const j = teamJourney(ms, F, 'B', cfg)!;
    assert.equal(j.state, 'alive');
    assert.match(j.summary, /Group A \dth \(so far\)|Group A \d(st|nd|rd) \(so far\)/);
  });
  test('organiser decision is the decider', () => {
    const fin = m(F, 'E', 'A', 0, 0, { stage: 'final', status: 'completed', winner: 'draw', format: advancePatch('A', 'Floodlights failed', 'Ravi') as Record<string, unknown> });
    const ms = [...full().slice(0, -1), fin];
    const j = teamJourney(ms, F, 'A', cfg)!;
    assert.deepEqual([j.steps[1].outcome, j.steps[1].decider], ['won', 'Organiser decision — Floodlights failed']);
    assert.equal(j.state, 'champion');
  });
  test('two-legged tie: one step, aggregate from this side, each leg listed', () => {
    const id = 'qf-AB';
    const leg = (h: string, a: string, hs: number, as: number, leg: number) =>
      m(F, h, a, hs, as, { stage: 'qf', format: seriesLegFormat({ id, format: 'aggregate', legs: 2, leg, teamAId: 'A' }) as Record<string, unknown> });
    const ms = [leg('A', 'B', 2, 1, 1), leg('B', 'A', 1, 0, 2)];
    const j = teamJourney(ms, F, 'B', cfg, { decider: (x) => (x.homeTeam.id === 'B' && x.awayTeam.id === 'A' ? 'B win 5–4 on pens' : undefined) })!;
    assert.equal(j.steps.length, 1);
    assert.deepEqual([j.steps[0].score, j.steps[0].legs], ['2–2 agg', ['L1 1–2', 'L2 1–0']]);
    assert.equal(j.steps[0].decider, 'B win 5–4 on pens');
  });
  test('team tie in a knockout: rubbers fold into one step', () => {
    const T = 'tabletennis' as const;
    const tie = (A: string, B: string, res: string, stage: string): Match[] =>
      [...res].map((r, i) => m(T, A, B, r === 'A' ? 3 : 1, r === 'A' ? 1 : 3, {
        stage, format: seriesLegFormat({ id: `tie-${A}-${B}`, format: 'rubbers', legs: 3, leg: i + 1, teamAId: A }) as Record<string, unknown>,
      }));
    const ms = [...tie('Blue', 'Gold', 'AAB', 'sf'), ...tie('Red', 'Green', 'ABA', 'sf'), ...tie('Blue', 'Red', 'ABB', 'final')];
    const j = teamJourney(ms, T, 'Red', defaultStandingsConfig(T))!;
    assert.deepEqual(j.steps.map((s) => [s.label, s.outcome, s.score]), [['Semi-finals', 'won', '2–1 in rubbers'], ['Final', 'won', '2–1 in rubbers']]);
    assert.deepEqual(j.steps[1].legs, ['R1 1–3', 'R2 3–1', 'R3 3–1']);
    assert.equal(j.state, 'champion');
  });
  test('double elimination: a first loss is not the end; steps in playing order', () => {
    const ms = [
      m(F, 'A', 'B', 1, 0, { stage: 'wb1' }), m(F, 'C', 'D', 1, 0, { stage: 'wb1' }),
      m(F, 'B', 'D', 2, 0, { stage: 'lb1' }), m(F, 'A', 'C', 1, 0, { stage: 'wb2' }),
      m(F, 'C', 'B', 0, 0, { stage: 'lb2', status: 'scheduled' }),
    ];
    const j = teamJourney(ms, F, 'B', cfg)!;
    assert.deepEqual(j.steps.map((s) => [s.label, s.outcome]), [["Winners' round 1", 'lost'], ["Losers' round 1", 'won'], ["Losers' round 2", 'upcoming']]);
    assert.equal(j.state, 'alive');
    const d = teamJourney(ms, F, 'D', cfg)!;
    assert.equal(d.state, 'out'); // lost twice
  });
  test('plate rounds are listed after the main draw', () => {
    const ms = [m(F, 'A', 'B', 1, 0, { stage: 'qf' }), m(F, 'B', 'D', 2, 1, { stage: 'pl1' })];
    const j = teamJourney(ms, F, 'B', cfg)!;
    assert.deepEqual(j.steps.map((s) => [s.label, s.outcome]), [['Quarter-finals', 'lost'], ['Plate round 1', 'won']]);
  });
  test('an entrant with no fixture in the sport has no journey', () => {
    assert.equal(teamJourney(full(), F, 'Z', cfg), null);
  });
});

describe('knockout round progress + deciders', () => {
  test('"2 of 4 decided · 1 live"', () => {
    const ms = [
      m(F, 'A', 'B', 1, 0, { stage: 'qf' }), m(F, 'C', 'D', 1, 0, { stage: 'qf' }),
      m(F, 'E', 'F', 0, 0, { stage: 'qf', status: 'live' }), m(F, 'G', 'H', 0, 0, { stage: 'qf', status: 'scheduled' }),
    ];
    assert.equal(roundProgress(pairingsInStage('qf', ms)).text, '2 of 4 decided · 1 live');
    assert.equal(roundProgress(pairingsInStage('qf', ms.slice(0, 2))).text, 'All 2 decided');
    assert.equal(roundProgress(pairingsInStage('qf', ms.slice(2, 3))).text, '● Live');
    assert.equal(roundProgress(pairingsInStage('qf', ms.slice(3, 4))).text, 'To play');
  });
  test('the sport’s own words, with names', () => {
    assert.equal(deciderFromStatus('Home win 4–3 on pens', 'Kites', 'Owls'), 'Kites win 4–3 on pens');
    assert.equal(deciderFromStatus('Away win 3–2 in the shoot-out', 'Kites', 'Owls'), 'Owls win 3–2 in the shoot-out');
    assert.equal(deciderFromStatus('Won the Super Over by 4 runs', 'Kites', 'Owls', 'Owls'), 'Owls won the Super Over by 4 runs');
    assert.equal(deciderFromStatus('1½–½ · Away through (Armageddon)', 'Asha', 'Bina'), '1½–½ · Bina through (Armageddon)');
    assert.equal(deciderFromStatus('Final · OT1', 'A', 'B'), 'After overtime (OT1)');
    assert.equal(deciderFromStatus('Full Time (after extra time)', 'A', 'B'), 'After extra time');
    assert.equal(deciderFromStatus('Full Time · Golden Raid', 'A', 'B'), 'Golden Raid');
    assert.equal(deciderFromStatus('Full Time', 'A', 'B'), undefined);
    assert.equal(deciderFromStatus('Won by 16 runs', 'A', 'B', 'A'), undefined);
  });
  test('finish labels', () => {
    assert.deepEqual([finishLabel(1, 1), finishLabel(2, 1), finishLabel(3, 1), finishLabel(3, 2), finishLabel(5, 4), finishLabel(9, 8)], ['Champions', 'Runners-up', '3rd', 'Joint 3rd', '=5th', '=9th']);
  });
});

describe('medal table waits for the knockout (SD-123, kept)', () => {
  const PTS: TournamentScoring = { mode: 'position', positionPoints: [10, 7, 5, 3, 2, 2, 1, 1] };
  test('groups done, knockout not started → no places (saved structure)', () => {
    assert.deepEqual(medalStandings(groupsDone(), [F], PTS, { football: { structShape: 'groups' } as never }), []);
  });
  test('…and with no saved structure, two groups are never one flat league', () => {
    assert.deepEqual(medalStandings(groupsDone(), [F], PTS), []);
  });
  test('places appear as soon as knockout rounds are decided', () => {
    const ms = [...groupsDone(), m(F, 'A', 'F', 2, 0, { stage: 'sf' }), m(F, 'E', 'B', 2, 1, { stage: 'sf' })];
    const t = medalStandings(ms, [F], PTS);
    assert.ok(t.length > 0);
    assert.equal(t.find((r) => r.name === 'A'), undefined); // finalists wait for the final
    assert.equal(t.find((r) => r.name === 'C')!.perSport[0].position, 5); // group exits are banded
  });
  test('a single league is unchanged', () => {
    const ms = [m('volleyball', 'A', 'B', 3, 0), m('volleyball', 'A', 'C', 3, 0), m('volleyball', 'B', 'C', 3, 1)];
    assert.deepEqual(medalStandings(ms, ['volleyball'], PTS).map((r) => r.name), ['A', 'B', 'C']);
  });
});

describe('journeys of an entrant', () => {
  test('one row per tournament × sport, latest first', () => {
    const ms = [m(F, 'A', 'B', 1, 0, { tournamentId: 't1' }), m(F, 'A', 'C', 1, 0, { tournamentId: 't2' }), m(F, 'D', 'A', 1, 0, { tournamentId: 't2' }), m(F, 'B', 'C', 1, 0, { tournamentId: 't3' })];
    assert.deepEqual(journeysOf(ms, ['A']).map((x) => x.tournamentId), ['t2', 't1']);
  });
});

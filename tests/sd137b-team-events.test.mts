/**
 * SD-137b — team events for the results-engine sports: archery team (3) and
 * mixed team (1 + 1) — team ranking from the members' ranking-round scores and
 * team match play (6 / 4 arrows a set, first to 5, 3 / 2-arrow shoot-off);
 * shooting teams of 3 (the members' match scores added) and the ISSF mixed
 * team medal matches (first to 16); cycling team pursuit / team sprint
 * (qualifying → finals, team rows credit every rider); athletics 4 × 200 m and
 * mixed relays (2 + 2, optional fixed order). Team results credit each member
 * (stat lines, careers) and the house (medal table); records per team discipline.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, eventAwards, outcomeText, updateRecords, matchOutcome, bracketState, archMatch, archLines, archeryCareer, phaseNameOf,
  parseArrow, archTeamOf, archTeamKey, matchSpecOf, TEAM_SPEC, MIXED_SPEC, INDIVIDUAL_SPEC, archRoundOf, bracketEntrant, setMatchSoRound,
  shootEventOf, shootTeamOf, shootTeamKey, SHOOT_EVENTS, shootLines, qualView, shootingCareer,
  shootMatchOutcome, shootMatchState, rankShootMatches, shootMatchEntrant, setShootSeries, setShootSo, isShootMatchRows,
  CYC_EVENTS, CYC_TEAM_EVENTS, cycEventOf, cycKind, cycPlan, cycLines, cyclingCareer, cycRange, cycPhaseName, isPursuitKind,
  teamTotals, withTeamScores, fillFromIndividuals, setMemberScore, memberLookup, bestOfHouse, isTeamEventKey, teamLines, teamCareer, memberScoresText,
  mixedRelayError, relayExtrasFor, trackEventsFor, markRange, ruleDef, rulesFor,
  type Arrow, type ArchSide, type EntryResult, type ResultEntry, type RankedEntry,
} from '../src/data/results/index.ts';

const arrows = (t: string): Arrow[] => t.split(' ').map((x) => parseArrow(x)!);
const sideOf = (ends: string[], so: string = '', closer: boolean[] = []): ArchSide => ({ ends: ends.map(arrows), ...(so ? { so: arrows(so) } : {}), ...(closer.length ? { closer } : {}) });
const team = (id: string, house: string, members: string[], result: EntryResult = {}): ResultEntry =>
  ({ id, name: `${house} A`, heat: 1, team: { id: `t-${house}`, name: house }, result: { name: `${house} A`, members: members.map((m) => ({ playerId: m, name: `Archer ${m}` })), ...result } });

describe('team disciplines', () => {
  test('archery team / mixed team keys ride on the round', () => {
    const t = archTeamOf('arch.r70.team')!;
    assert.equal(t.size, 3); assert.equal(t.kind, 'team'); assert.equal(t.round.key, 'arch.r70');
    assert.equal(archTeamOf('arch.c50.mixed')!.size, 2);
    assert.equal(archTeamKey('arch.r70', 'mixed'), 'arch.r70.mixed');
    const d = disciplineOf('arch.r70.team')!;
    assert.equal(d.sport, 'archery'); assert.equal(d.teamSize, 3); assert.equal(d.tie, 'inner-count');
    assert.equal(archRoundOf('arch.r70.team')!.key, 'arch.r70');
    assert.equal(archTeamOf('arch.r70'), undefined);
    assert.deepEqual(matchSpecOf('arch.r70'), INDIVIDUAL_SPEC);
    assert.deepEqual(matchSpecOf('arch.r70.team'), { arrows: 6, ends: 4, win: 5, so: 3 });
    assert.deepEqual(matchSpecOf('arch.b50.mixed'), { arrows: 4, ends: 4, win: 5, so: 2 });
    assert.equal(phaseNameOf({ discipline: 'arch.r70.team', phase: 'qualification', plan: [{ phase: 'qualification' }, { phase: 'final' }] }), 'Team ranking');
    assert.equal(phaseNameOf({ discipline: 'arch.r70.team', phase: 'final', plan: [{ phase: 'qualification' }, { phase: 'final' }] }), 'Team match play');
    assert.equal(phaseNameOf({ discipline: 'arch.r70', phase: 'final', plan: [{ phase: 'qualification' }, { phase: 'final' }] }), 'Match play');
  });
  test('shooting teams of 3 from the individual events; the ISSF list itself is unchanged', () => {
    assert.equal(SHOOT_EVENTS.length, 9);
    const t = shootTeamOf('shoot.10map.team')!;
    assert.equal(t.teamSize, 3); assert.equal(t.label, '10 m Air Pistol Team'); assert.equal(t.final, undefined);
    assert.equal(shootEventOf('shoot.10map.team')!.scoring, 'integer');
    assert.equal(shootTeamKey('shoot.10mar'), 'shoot.10mar.team');
    assert.equal(shootTeamOf('shoot.10marx.team'), undefined, 'no team of a mixed team');
    const d = disciplineOf('shoot.10mar.team')!;
    assert.equal(d.teamSize, 3); assert.equal(d.dp, 1); assert.equal(d.tie, 'issf');
  });
  test('cycling team pursuit / team sprint, without changing the individual list', () => {
    assert.equal(CYC_EVENTS.length, 19);
    assert.equal(CYC_TEAM_EVENTS.length, 3);
    assert.equal(cycKind('cyc.tp.4000'), 'tp'); assert.equal(cycKind('cyc.ts.750'), 'ts');
    assert.equal(disciplineOf('cyc.tp.4000')!.teamSize, 4); assert.equal(disciplineOf('cyc.ts.750')!.teamSize, 3);
    assert.equal(disciplineOf('cyc.tp.4000')!.dp, 3);
    assert.ok(isPursuitKind('tp') && isPursuitKind('ip') && !isPursuitKind('ts'));
    assert.deepEqual(cycRange('cyc.tp.4000'), { min: 218, max: 420 });
    assert.ok(markRange('cyc.ts.750'));
    assert.equal(cycPhaseName({ discipline: 'cyc.tp.4000', phase: 'qualification', plan: [{ phase: 'qualification' }, { phase: 'final' }] }), 'Qualifying');
    assert.ok(isTeamEventKey('cyc.tp.4000') && isTeamEventKey('arch.r70.mixed') && isTeamEventKey('shoot.10mar.team') && !isTeamEventKey('ath.4x100') && !isTeamEventKey('arch.r70'));
  });
  test('athletics 4 × 200 m (optional), mixed relays 2 + 2 with an optional fixed order', () => {
    const d = disciplineOf('ath.4x200')!;
    assert.equal(d.teamSize, 4); assert.equal(d.lanes, 8);
    assert.deepEqual(markRange('ath.4x200'), { min: 78, max: 240 });
    assert.deepEqual(relayExtrasFor({ age: 'U14', gender: 'M' }).map((e) => [e.discipline, e.optional]), [['ath.4x200', true]]);
    // the D9 programme is unchanged
    assert.ok(!trackEventsFor({ age: 'U14', gender: 'M' }).some((e) => e.discipline === 'ath.4x200'));
    assert.equal(mixedRelayError(['M', 'F', 'F', 'M'], 'World Athletics'), null);
    assert.match(mixedRelayError(['M', 'M', 'M', 'F'], 'World Athletics')!, /2 men and 2 women \(World Athletics\)/);
    assert.equal(mixedRelayError(['M', 'F', 'M', 'F'], 'World Athletics', 'MWMW'), null);
    assert.match(mixedRelayError(['M', 'F', 'F', 'M'], 'World Athletics', 'MWMW')!, /leg 3 should be a man/);
    // swimming keeps its rule reference
    assert.match(mixedRelayError(['F', 'F', 'F', 'M'])!, /SW 10\.11/);
  });
  test('new competition rules have standard defaults', () => {
    assert.equal(ruleDef('mixedOrder')!.default, 'team');
    assert.equal(ruleDef('archTeamBracket')!.default, 'auto');
    assert.equal(ruleDef('teamPick')!.default, 'declared');
    assert.equal(ruleDef('shootMixedFinal')!.default, 'matches');
    assert.equal(ruleDef('cycTeamFinals')!.default, 'finals');
    assert.ok(rulesFor('shooting').some((r) => r.key === 'teamPick') && rulesFor('archery').some((r) => r.key === 'teamPick'));
  });
});

describe('team scores from the members', () => {
  test('archery: the three ranking scores, 10s and X added; incomplete teams have no total', () => {
    const r = withTeamScores({}, [{ mark: 650, tens: 30, xs: 12 }, { mark: 640, tens: 26, xs: 9 }, { mark: 610, tens: 20, xs: 5 }], 'arch.r70.team');
    assert.equal(r.mark, 1900); assert.equal(r.tens, 76); assert.equal(r.xs, 26);
    const part = withTeamScores({}, [{ mark: 650 }, { mark: 640 }, {}], 'arch.r70.team');
    assert.equal(part.mark, undefined);
  });
  test('shooting decimal sums in tenths and the series added position by position', () => {
    const t = teamTotals([{ mark: 630.1, series: [105.1, 104.9] }, { mark: 628.4, series: [104.2, 104.3] }, { mark: 0.3, series: [0.1, 0.2] }], 3, true);
    assert.equal(t.mark, 1258.8);
    assert.deepEqual(t.series, [209.4, 209.4]);
    const uneven = teamTotals([{ mark: 1, series: [1] }, { mark: 1, series: [1, 0] }, { mark: 1 }], 3);
    assert.equal(uneven.series, undefined);
  });
  test('fill from the individual events; a typed score survives; the text line', () => {
    const lookup = memberLookup([
      { id: 'a', athleteId: 'p1', name: 'A', heat: 1, result: { mark: 600, tens: 20, xs: 8 } },
      { id: 'b', athleteId: 'p2', name: 'B', heat: 1, result: { mark: 590, tens: 18, xs: 4 } },
      { id: 'c', athleteId: 'p2', name: 'B', heat: 1, result: { mark: 580 } },
      { id: 'd', athleteId: 'p9', name: 'Z', heat: 1, result: { status: 'DNS' } },
      // a bracket row reads as its ranking score
      { id: 'e', athleteId: 'p4', name: 'D', heat: 1, result: { seed: 1, mp: {}, qual: { mark: 620, tens: 25, xs: 10 } } },
    ]);
    assert.equal(lookup.get('p2')!.mark, 590);
    assert.equal(lookup.get('p4')!.mark, 620);
    assert.ok(!lookup.has('p9'));
    let r: EntryResult = { members: [{ playerId: 'p1', name: 'Asha Rao' }, { playerId: 'p2', name: 'Bina K' }, { playerId: 'p3', name: 'Chitra M' }] };
    r = setMemberScore(r, 2, { mark: 570, tens: 15, xs: 3 }, 'arch.r70.team');
    const f = fillFromIndividuals(r, lookup, 'arch.r70.team');
    assert.equal(f.found, 2); assert.deepEqual(f.missing, []);
    assert.equal(f.result.mark, 1760); assert.equal(f.result.tens, 53);
    assert.equal(memberScoresText(f.result), 'Asha 600 · Bina 590 · Chitra 570');
    // a typed correction is never overwritten by "take"
    const typed = fillFromIndividuals(setMemberScore(f.result, 0, { mark: 605, tens: 21, xs: 8 }, 'arch.r70.team'), lookup, 'arch.r70.team');
    assert.equal(typed.result.ms![0].mark, 605); assert.equal(typed.result.mark, 1765);
    const g = fillFromIndividuals({ members: [{ playerId: 'p7', name: 'Gita' }] }, lookup, 'arch.r70.mixed');
    assert.deepEqual(g.missing, ['Gita']);
  });
  test('best of each house (mixed: best man + best woman)', () => {
    const c = [
      { playerId: 'a', teamKey: 'Red', mark: 600, gender: 'M' }, { playerId: 'b', teamKey: 'Red', mark: 640, gender: 'F' },
      { playerId: 'c', teamKey: 'Red', mark: 620, gender: 'M' }, { playerId: 'd', teamKey: 'Red', mark: 500, gender: 'F' },
      { playerId: 'e', teamKey: 'Blue', mark: 610, gender: 'M' }, { playerId: 'f', teamKey: 'Blue', gender: 'M' },
    ];
    assert.deepEqual(bestOfHouse(c, 3).get('Red'), ['b', 'c', 'a']);
    assert.ok(!bestOfHouse(c, 3).has('Blue'), 'Blue has only one scorer');
    assert.deepEqual(bestOfHouse(c, 2, true).get('Red'), ['c', 'b']);
    // profile genders read 'Male' / 'Female'
    assert.deepEqual(bestOfHouse(c.map((x) => ({ ...x, gender: x.gender === 'M' ? 'Male' : 'Female' })), 2, true).get('Red'), ['c', 'b']);
  });
});

describe('archery team ranking and match play', () => {
  const R70T = disciplineOf('arch.r70.team')!;
  test('team ranking: total, then 10s, then X (WA)', () => {
    const rows = [
      team('r', 'Red', ['p1', 'p2', 'p3'], { mark: 1900, tens: 70, xs: 20 }),
      team('b', 'Blue', ['p4', 'p5', 'p6'], { mark: 1900, tens: 72, xs: 10 }),
      team('g', 'Green', ['p7', 'p8', 'p9'], { mark: 1880, tens: 80, xs: 30 }),
    ];
    assert.deepEqual(rankEntries(rows, R70T).map((r) => `${r.label}:${r.id}`), ['1:b', '2:r', '3:g']);
  });
  test('team match: 6-arrow sets, first to 5 points (4 sets at most)', () => {
    const fmt = 'sets' as const;
    const A = sideOf(['10 10 9 9 9 9', '10 10 10 9 9 9', '9 9 9 9 9 9']);
    const B = sideOf(['10 9 9 9 9 8', '10 10 10 9 9 9', '9 9 9 9 9 8']);
    const o = matchOutcome(A, B, fmt, true, true, false, TEAM_SPEC);
    assert.equal(o.a, 5); assert.equal(o.b, 1); assert.equal(o.winner, 'a'); assert.ok(o.done);
    // individual rules would still be going (first to 6, 3-arrow ends ignore nothing here)
    assert.equal(matchOutcome(A, B, fmt).done, false);
  });
  test('4–4 → a 3-arrow shoot-off: the higher total, then the arrow closest to the centre', () => {
    const fmt = 'sets' as const;
    const ends = ['10 10 10 10 10 10', '9 9 9 9 9 9', '10 10 10 10 10 10', '9 9 9 9 9 9'];
    const endsB = ['9 9 9 9 9 9', '10 10 10 10 10 10', '9 9 9 9 9 9', '10 10 10 10 10 10'];
    let o = matchOutcome(sideOf(ends), sideOf(endsB), fmt, true, true, false, TEAM_SPEC);
    assert.equal(o.a, 4); assert.equal(o.b, 4); assert.deepEqual(o.soNeed, { round: 1, kind: 'arrows' });
    // one shoot-off arrow each is not a round yet
    o = matchOutcome(sideOf(ends, '10'), sideOf(endsB, '9'), fmt, true, true, false, TEAM_SPEC);
    assert.deepEqual(o.soNeed, { round: 1, kind: 'arrows' });
    o = matchOutcome(sideOf(ends, '10 9 9'), sideOf(endsB, '10 10 8'), fmt, true, true, false, TEAM_SPEC);
    assert.deepEqual(o.soNeed, { round: 1, kind: 'closer' }, '28 v 28 → closest arrow');
    o = matchOutcome(sideOf(ends, '10 9 9', [false]), sideOf(endsB, '10 10 8', [true]), fmt, true, true, false, TEAM_SPEC);
    assert.equal(o.winner, 'b'); assert.equal(o.b, 5); assert.equal(o.a, 4); assert.deepEqual(o.soWon, { round: 1, closer: true });
    assert.equal(outcomeText(o, sideOf(ends, '10 9 9', [false]), sideOf(endsB, '10 10 8', [true])), '4–5 (SO 28–28*)');
    o = matchOutcome(sideOf(ends, '10 10 10'), sideOf(endsB, '10 10 9'), fmt, true, true, false, TEAM_SPEC);
    assert.equal(o.winner, 'a');
    // the setter keeps rounds of 3 together
    let r: EntryResult = { mp: { '1': sideOf(ends) } };
    r = setMatchSoRound(r, '1', 0, arrows('10 9 9'), 3);
    r = setMatchSoRound(r, '1', 1, arrows('8 8 8'), 3);
    assert.deepEqual(r.mp!['1'].so, arrows('10 9 9 8 8 8'));
    r = setMatchSoRound(r, '1', 1, null, 3);
    assert.deepEqual(r.mp!['1'].so, arrows('10 9 9'));
  });
  test('mixed team: 4-arrow sets, 2-arrow shoot-off; compound teams are cumulative over 4 ends', () => {
    const o = matchOutcome(sideOf(['10 10 10 10', '10 10 10 10', '10 10 10 9']), sideOf(['9 9 9 9', '9 9 9 9', '9 9 9 9']), 'sets', true, true, false, MIXED_SPEC);
    assert.equal(o.a, 6); assert.equal(o.winner, 'a'); assert.equal(o.ends.length, 3);
    const lvl = ['10 10 10 10', '9 9 9 9', '10 10 10 10', '9 9 9 9'], lvlB = ['9 9 9 9', '10 10 10 10', '9 9 9 9', '10 10 10 10'];
    assert.deepEqual(matchOutcome(sideOf(lvl, '10'), sideOf(lvlB, '10'), 'sets', true, true, false, MIXED_SPEC).soNeed, { round: 1, kind: 'arrows' });
    assert.equal(matchOutcome(sideOf(lvl, '10 10'), sideOf(lvlB, '10 9'), 'sets', true, true, false, MIXED_SPEC).winner, 'a');
    const c = matchOutcome(sideOf(['10 10 10 10 10 10', '10 10 10 10 10 9', '10 10 10 10 10 10', '10 10 10 10 10 10']), sideOf(['10 10 10 10 10 10', '10 10 10 10 10 10', '10 10 10 10 10 10', '10 10 10 10 10 10']), 'cumulative', true, true, false, TEAM_SPEC);
    assert.equal(c.a, 239); assert.equal(c.b, 240); assert.equal(c.winner, 'b');
  });
  test('a team bracket of 4: semis, bronze, gold; places, member lines, career, records on the team ranking', () => {
    const R = (house: string, ms: string[], seed: number, mp: Record<string, ArchSide>, qual: number) =>
      team(house, house, ms, { ...bracketEntrant({ mark: qual, tens: 60, xs: 20 }, seed), mp });
    const win = sideOf(['10 10 10 10 10 10', '10 10 10 10 10 10', '10 10 10 10 10 10']);
    const lose = sideOf(['9 9 9 9 9 9', '9 9 9 9 9 9', '9 9 9 9 9 9']);
    const rows = [
      R('Red', ['p1', 'p2', 'p3'], 1, { '1': win, '2': win }, 1950),
      R('Blue', ['p4', 'p5', 'p6'], 2, { '1': win, '2': lose }, 1940),
      R('Green', ['p7', 'p8', 'p9'], 3, { '1': lose, B: win }, 1900),
      R('Gold', ['q1', 'q2', 'q3'], 4, { '1': lose, B: lose }, 1890),
    ];
    const st = bracketState(rows, 'sets', archMatch('sets', undefined, 'arch.r70.team'));
    assert.ok(st.done);
    const ranked = rankEntries(rows, disciplineOf('arch.r70.team')!);
    assert.deepEqual(ranked.map((r) => `${r.label}:${r.id}`), ['1:Red', '2:Blue', '3:Green', '4:Gold']);
    assert.equal(ranked[0].bestText, 'W 6–0');
    const awards = eventAwards(ranked, { positionPoints: [10, 8, 6, 4] });
    assert.deepEqual(awards.map((a) => [a.team?.name, a.medal, a.points]), [['Red', 'gold', 10], ['Blue', 'silver', 8], ['Green', 'bronze', 6], ['Gold', undefined, 4]]);
    const lines = archLines({ discipline: 'arch.r70.team' }, ranked, 'bracket', awards);
    assert.equal(lines.length, 12, 'every member of every team');
    const p1 = lines.find((l) => l.playerId === 'p1')!;
    assert.deepEqual(p1.stats, { teamEv: 1, tmW: 2, tmL: 0, place: 1, golds: 1, posPoints: 10 });
    assert.ok(p1.won);
    assert.equal(lines.find((l) => l.playerId === 'p4')!.stats.tmL, 1);
    // the team ranking (closed with a bracket after it) writes nothing for teams
    assert.deepEqual(archLines({ discipline: 'arch.r70.team' }, rankEntries([team('x', 'X', ['p1', 'p2', 'p3'], { mark: 1800 })], disciplineOf('arch.r70.team')!), 'qual'), []);
    // the career: team events and medals (an individual medal too)
    const c = archeryCareer([{ eventId: 'f1', stats: p1.stats, date: '2026-10-01' }, { eventId: 'f2', stats: { brackets: 1, place: 2, silvers: 1, mW: 2, mL: 1 }, date: '2026-10-02' }], new Map(), '2026-01-01');
    assert.deepEqual(c.team, { events: 1, golds: 1, silvers: 0, bronzes: 0, won: 2, lost: 0 });
    assert.equal(c.golds, 1); assert.equal(c.silvers, 1);
    assert.match(c.history[1].text, /^team · 1st · team matches won 2, lost 0$/);
    // records: the team ranking score, per team discipline (not the individual round)
    const R70T = disciplineOf('arch.r70.team')!;
    const book = updateRecords(rankEntries(rows.map((e) => ({ ...e, result: { mark: e.result.qual!.mark, tens: 60, xs: 20 } })), R70T), R70T, 'Senior-M', [], '2026-10-11');
    assert.deepEqual(book.map((r) => [r.discipline, r.value, r.holder, r.team]), [['arch.r70.team', 1950, 'Red A', 'Red']]);
  });
});

describe('shooting teams of 3', () => {
  const T = disciplineOf('shoot.10map.team')!;
  test('ranked on the members added: total, then inner tens, then the last series', () => {
    const ms = (m: number, x: number, series: number[]) => ({ mark: m, xs: x, series });
    const mk = (id: string, list: { mark: number; xs: number; series: number[] }[]) => team(id, id, ['a', 'b', 'c'].map((s) => `${id}${s}`), withTeamScores({}, list, 'shoot.10map.team'));
    const rows = [
      mk('Red', [ms(570, 15, [95, 95, 95, 95, 95, 95]), ms(560, 10, [93, 93, 93, 93, 94, 94]), ms(550, 8, [91, 92, 92, 92, 92, 91])]),
      mk('Blue', [ms(570, 18, [95, 95, 95, 95, 95, 95]), ms(560, 10, [93, 93, 93, 93, 94, 94]), ms(550, 8, [91, 92, 92, 92, 92, 91])]),
      mk('Gold', [ms(571, 1, [95, 95, 95, 95, 95, 96]), ms(560, 1, [93, 93, 93, 93, 94, 94]), ms(550, 1, [91, 92, 92, 92, 92, 91])]),
    ];
    assert.equal(rows[0].result.mark, 1680); assert.equal(rows[1].result.xs, 36);
    assert.deepEqual(rankEntries(rows, T).map((r) => `${r.label}:${r.id}`), ['1:Gold', '2:Blue', '3:Red']);
    const ranked = rankEntries(rows, T);
    const lines = shootLines({ discipline: T.key }, ranked, 'match', eventAwards(ranked));
    assert.equal(lines.length, 9);
    assert.deepEqual(lines.find((l) => l.playerId === 'Golda')!.stats, { teamEv: 1, place: 1, golds: 1, posPoints: 8 });
    // a team record is the team's score, kept apart from the individual event
    const book = updateRecords(ranked, T, 'Junior-M', [], '2026-10-11');
    assert.deepEqual(book.map((r) => [r.discipline, r.value]), [['shoot.10map.team', 1681]]);
  });
  test('an individual event is unchanged (no team lines)', () => {
    const rows: ResultEntry[] = [{ id: 'i1', athleteId: 'p1', name: 'P', heat: 1, result: { mark: 95, series: [95], xs: 2 } }];
    const lines = shootLines({ discipline: 'shoot.10map', category: { shots: 10 } }, rankEntries(rows, disciplineOf('shoot.10map')!), 'match');
    assert.equal(lines[0].stats.teamEv, undefined);
    assert.equal(lines[0].stats.pts, 95);
  });
});

describe('ISSF mixed team medal matches', () => {
  const S = (shots: number[][], so: number[] = []): ArchSide => ({ ends: shots, ...(so.length ? { so } : {}) });
  test('2 points for the higher series, 1 each for a tie, first to 16', () => {
    const win = Array.from({ length: 8 }, () => [10.5, 10.4]);
    const lose = Array.from({ length: 8 }, () => [10.1, 10.2]);
    const o = shootMatchOutcome(S(win), S(lose));
    assert.equal(o.a, 16); assert.equal(o.b, 0); assert.equal(o.winner, 'a'); assert.ok(o.done);
    const half = shootMatchOutcome(S([[10.5, 10.4], [10.0, 10.0]]), S([[10.1, 10.2], [10.0, 10.0]]));
    assert.equal(half.a, 3); assert.equal(half.b, 1); assert.ok(!half.done);
    // 15–15 then a tied series → 16–16: shoot-off, one shot each
    const tieA = [...Array.from({ length: 15 }, () => [10, 10]), [10.1, 10.0]];
    const tieB = [...Array.from({ length: 15 }, () => [10, 10]), [10.0, 10.1]];
    const t = shootMatchOutcome(S(tieA), S(tieB));
    assert.equal(t.a, 16); assert.equal(t.b, 16); assert.equal(t.soNeed, 1);
    assert.equal(shootMatchOutcome(S(tieA, [10.4, 10.2]), S(tieB, [10.3, 10.3])).soNeed, 2, 'level again');
    const done = shootMatchOutcome(S(tieA, [10.4, 10.2, 10.9, 10.0]), S(tieB, [10.3, 10.3, 10.0, 10.0]));
    assert.equal(done.winner, 'a'); assert.equal(done.soWon, 2);
    let r: EntryResult = {};
    r = setShootSeries(r, 'G', 0, [10.4, 10.2]);
    r = setShootSeries(r, 'G', 1, [9.9, 10.0]);
    r = setShootSo(r, 'G', 0, [10.1, 10.1]);
    r = setShootSeries(r, 'G', 1, null);
    assert.deepEqual(r.mp!.G, { ends: [[10.4, 10.2]] });
  });
  test('gold 1 v 2, bronze 3 v 4: places, ranking, member lines, records from the qualification', () => {
    const q = [631.4, 630.0, 628.2, 627.5];
    const win = Array.from({ length: 8 }, () => [10.5, 10.5]);
    const lose = Array.from({ length: 8 }, () => [10.0, 10.0]);
    const rows = ['Red', 'Blue', 'Green', 'Gold'].map((h, i) => team(h, h, [`${h}1`, `${h}2`], { ...shootMatchEntrant({ mark: q[i], series: [q[i]] }, i + 1), mp: { [i < 2 ? 'G' : 'B']: S(i % 2 ? win : lose) } }));
    assert.ok(isShootMatchRows(rows));
    const st = shootMatchState(rows);
    assert.ok(st.done);
    assert.deepEqual([...st.places].sort((a, b) => a[1] - b[1]), [['Blue', 1], ['Red', 2], ['Gold', 3], ['Green', 4]]);
    const def = disciplineOf('shoot.10marx')!;
    const ranked = rankEntries(rows, def);
    assert.deepEqual(ranked.map((r) => `${r.label}:${r.id}`), ['1:Blue', '2:Red', '3:Gold', '4:Green']);
    assert.equal(rankShootMatches(rows)[0].bestText, 'W 16–0');
    const lines = shootLines({ discipline: def.key, shootMatch: true }, ranked, 'match', eventAwards(ranked));
    assert.equal(lines.length, 8);
    assert.deepEqual(lines.find((l) => l.playerId === 'Blue1')!.stats, { teamEv: 1, tmW: 1, tmL: 0, place: 1, golds: 1, posPoints: 8 });
    // the qualification phase of a medal-match event writes nothing for the teams
    assert.deepEqual(shootLines({ discipline: def.key, shootMatch: true }, rankEntries(rows.map((e) => ({ ...e, result: { ...e.result, mp: undefined, seed: undefined, mark: e.result.qual!.mark } })), def), 'qual'), []);
    // records read the qualification score
    assert.deepEqual(qualView(rows).map((e) => e.result.mark), q);
    // the career
    const c = shootingCareer([{ eventId: 'x', stats: lines.find((l) => l.playerId === 'Blue1')!.stats, date: '2026-10-11' }], new Map(), '2026-01-01');
    assert.deepEqual(c.team, { events: 1, golds: 1, silvers: 0, bronzes: 0, won: 1, lost: 0 });
    assert.match(c.history[0].text, /team · 1st · medal match won/);
  });
  test('three teams: gold match 1 v 2, the 3rd team takes bronze', () => {
    const rows = ['A', 'B', 'C'].map((h, i) => team(h, h, [`${h}1`, `${h}2`], { ...shootMatchEntrant({ mark: 600 - i }, i + 1), mp: {} }));
    const st = shootMatchState(rows);
    assert.equal(st.places.get('C'), 3);
    assert.equal(st.current?.key, 'G');
    assert.ok(!st.done);
  });
});

describe('cycling team pursuit / team sprint', () => {
  test('qualifying → finals for 4+ teams; one race for fewer', () => {
    assert.deepEqual(cycPlan('tp', 5).map((p) => p.phase), ['qualification', 'final']);
    assert.deepEqual(cycPlan('ts', 4)[1].races, ['A', 'B']);
    assert.deepEqual(cycPlan('tp', 3).map((p) => p.phase), ['final']);
  });
  test('a team row credits every rider (team medal, time key), a career counts the team final once', () => {
    const def = disciplineOf('cyc.tp.4000')!;
    const rows: ResultEntry[] = [
      { id: 'r', name: 'Red A', heat: 1, team: { name: 'Red' }, result: { mark: 250.123, members: ['a', 'b', 'c', 'd'].map((x) => ({ playerId: `r${x}`, name: x })), race: 'A' } },
      { id: 'b', name: 'Blue A', heat: 1, team: { name: 'Blue' }, result: { mark: 251.5, caught: true, members: ['a', 'b', 'c', 'd'].map((x) => ({ playerId: `b${x}`, name: x })), race: 'A' } },
    ];
    const ranked = rankEntries(rows, def);
    assert.deepEqual(ranked.map((r) => r.id), ['r', 'b']);
    const lines = cycLines({ discipline: def.key, phase: 'final' }, ranked, eventAwards(ranked));
    assert.equal(lines.length, 8);
    const ra = lines.find((l) => l.playerId === 'ra')!;
    assert.equal(ra.stats.teamEv, 1); assert.equal(ra.stats.golds, 1); assert.equal(ra.stats.m_cyc_tp_4000, 250.123); assert.equal(ra.stats.finals, 1);
    assert.equal(lines.find((l) => l.playerId === 'ba')!.stats.m_cyc_tp_4000, undefined, 'caught: no time for records');
    const c = cyclingCareer([{ eventId: 'q', stats: { races: 1, teamEv: 1, place: 1, mark: 252 }, date: '2026-10-01' }, { eventId: 'f', stats: ra.stats, date: '2026-10-01' }], new Map(), '2026-01-01');
    assert.equal(c.teamEvents, 1); assert.equal(c.teamGolds, 1);
    assert.equal(c.bests[0].key, 'cyc.tp.4000');
    assert.match(c.history[0].text, /^team · 1st/);
  });
  test('an individual pursuit is unchanged', () => {
    const def = disciplineOf('cyc.ip.3000')!;
    const rows: ResultEntry[] = [{ id: 'x', athleteId: 'p', name: 'P', heat: 1, result: { mark: 220 } }];
    const lines = cycLines({ discipline: def.key, phase: 'final' }, rankEntries(rows, def));
    assert.equal(lines[0].stats.teamEv, undefined);
  });
});

describe('team lines and the house table', () => {
  test('teamLines skips members without a player; teamCareer sums', () => {
    const r = { entry: { id: 't', name: 'T', heat: 1, result: { members: [{ playerId: 'a', name: 'A' }, { name: 'Guest' }] } }, position: 2 } as Pick<RankedEntry, 'entry' | 'position'>;
    const l = teamLines(r, { tmW: 1 }, { medal: 'silver', points: 7 });
    assert.equal(l.length, 1);
    assert.deepEqual(l[0].stats, { teamEv: 1, tmW: 1, place: 2, silvers: 1, posPoints: 7 });
    assert.deepEqual(teamCareer([{ stats: l[0].stats }, { stats: { golds: 1 } }]), { events: 1, golds: 0, silvers: 1, bronzes: 0, won: 1, lost: 0 });
  });
});

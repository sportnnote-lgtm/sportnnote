/**
 * SD-131 — event sports + golf stroke play on the shared platform:
 *  1. follower alerts for a locked final / a finished golf round (the pure rules
 *     shared with the notify-followers edge function, and the podium summary the
 *     app leaves on the row);
 *  2. a team / house page's event results (medals, points, finals, records);
 *  3. the sport-aware profile headline (Events · Finals · Medals · PBs).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { alertText, cleanMark, eventName, parseAlert, phaseKind, recordsSetBy } from '../supabase/functions/_shared/resultAlert.ts';
import { finalAlert, combinedAlert, golfAlert } from '../src/data/results/alerts.ts';
import { teamEventSummary, awardIsTeams, categoryFromKey } from '../src/data/results/teamResults.ts';
import { disciplineOf, rankEntries, groupMeet, type ResultEntry, type PhaseFormat, type MeetPhase } from '../src/data/results/index.ts';
import { profileHeadline } from '../src/data/profileHeadline.ts';
import type { StatLine } from '../src/core/types.ts';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const T1 = '33333333-3333-4333-8333-333333333333';

/* --------------------------------- alerts --------------------------------- */

describe('which completed field event pushes', () => {
  test('a final (no next planned round) pushes; a heat closing does not', () => {
    assert.equal(phaseKind('athletics', { results: { phase: 'final', phaseNo: 2, plan: [{ phase: 'heat' }, { phase: 'final' }] } }), 'final');
    assert.equal(phaseKind('athletics', { results: { phase: 'heat', phaseNo: 1, plan: [{ phase: 'heat' }, { phase: 'final' }] } }), null);
    assert.equal(phaseKind('swimming', { results: { phase: 'final', phaseNo: 1 } }), 'final');
  });
  test('a combined event pushes only after its last event', () => {
    const c = (index: number) => ({ results: { phase: 'final', phaseNo: index + 1, combined: { key: 'ath.ce_pen', index, events: ['a', 'b', 'c', 'd', 'e'] } } });
    assert.equal(phaseKind('athletics', c(2)), null);
    assert.equal(phaseKind('athletics', c(4)), 'final');
  });
  test('a golf round pushes; a non-golf event without a results phase does not', () => {
    assert.equal(phaseKind('golf', { scoring: 'stroke' }), 'golf');
    assert.equal(phaseKind('athletics', {}), null);
  });
});

describe('the stored podium is validated', () => {
  test('marks are short plain text; links and junk are dropped', () => {
    assert.equal(cleanMark('13.42'), '13.42');
    assert.equal(cleanMark('1:02.34'), '1:02.34');
    assert.equal(cleanMark('−3 (69)'), '−3 (69)');
    assert.equal(cleanMark('38 pts'), '38 pts');
    assert.equal(cleanMark('http://x.y/win'), undefined);
    assert.equal(cleanMark('a'.repeat(30)), undefined);
    assert.equal(cleanMark(13.42), undefined);
  });
  test('parseAlert keeps medals with a name or an id, cleans names and caps the list', () => {
    const a = parseAlert({ kind: 'final', event: 'U14 Girls 100 m', medals: [
      { medal: 'gold', playerId: P1, name: 'Asha  Rao https://evil.example', mark: '13.42' },
      { medal: 'silver', name: '', playerId: 'not-an-id!' },
      { medal: 'tin', name: 'X' },
      { medal: 'bronze', teamId: T1, name: '' },
    ] });
    assert.ok(a);
    assert.deepEqual(a!.medals.map((m) => [m.medal, m.name, m.playerId ?? m.teamId ?? '-', m.mark ?? '-']), [
      ['gold', 'Asha Rao', P1, '13.42'],
      ['bronze', '', T1, '-'],
    ]);
    assert.equal(parseAlert({ kind: 'x', medals: [] }), null);
    assert.equal(parseAlert(null), null);
    assert.equal(parseAlert({ kind: 'final', medals: Array.from({ length: 40 }, () => ({ medal: 'gold', name: 'A' })) })!.medals.length, 12);
  });
  test('event name drops the phase', () => {
    assert.equal(eventName('100 m U14 Girls — Final', {}), '100 m U14 Girls');
    assert.equal(eventName('whatever — Final', { results: { eventTitle: 'U14 Girls 100 m' } }), 'U14 Girls 100 m');
  });
  test('records set by this event (JSON text or an array)', () => {
    const book = [
      { scope: 'MR', discipline: 'ath.100m', category: 'U14-F', value: 13.42, holder: 'Asha Rao', eventKey: 'ev1' },
      { scope: 'SR', discipline: 'ath.100m', category: 'U14-F', value: 13.42, holder: 'Asha Rao', eventKey: 'ev1' },
      { scope: 'MR', discipline: 'ath.200m', category: 'U14-F', value: 28.1, holder: 'Old', eventKey: 'ev0' },
    ];
    assert.deepEqual(recordsSetBy(JSON.stringify(book), 'ev1').map((r) => r.scope), ['MR', 'SR']);
    assert.deepEqual(recordsSetBy(book, 'ev0'), [{ scope: 'MR', holder: 'Old' }]);
    assert.deepEqual(recordsSetBy('{bad', 'ev1'), []);
    assert.deepEqual(recordsSetBy(book, undefined), []);
  });
});

describe('alert wording', () => {
  test('the winner, the event, the mark and a meet record', () => {
    const t = alertText({ kind: 'final', event: 'U14 Girls 100 m', medals: [
      { medal: 'gold', name: 'Asha Rao', mark: '13.42' }, { medal: 'silver', name: 'Meera Iyer' }, { medal: 'bronze', name: 'Diya Shah' },
    ], records: [{ scope: 'MR', holder: 'Asha Rao' }], tournament: 'Sports Day 2026' });
    assert.equal(t!.title, '🥇 Asha Rao won U14 Girls 100 m in 13.42 — meet record');
    assert.equal(t!.body, '🥈 Meera Iyer · 🥉 Diya Shah · Sports Day 2026');
  });
  test('a shared gold, and a record set by someone else goes in the body', () => {
    const t = alertText({ kind: 'final', event: 'U17 Boys High Jump', medals: [
      { medal: 'gold', name: 'A' }, { medal: 'gold', name: 'B' },
    ], records: [{ scope: 'SR', holder: 'C' }] });
    assert.equal(t!.title, '🥇 A and B shared gold in U17 Boys High Jump');
    assert.equal(t!.body, 'School record by C');
  });
  test('no gold → no push', () => {
    assert.equal(alertText({ kind: 'final', event: 'X', medals: [{ medal: 'silver', name: 'A' }] }), null);
  });
  test('golf: a casual round is won; a tournament round is led', () => {
    assert.equal(alertText({ kind: 'golf', event: 'Saturday medal', medals: [{ medal: 'gold', name: 'Kabir', mark: '−3 (69)' }] })!.title, '⛳ Kabir won Saturday medal — −3 (69)');
    assert.equal(alertText({ kind: 'golf', event: 'Round 2', medals: [{ medal: 'gold', name: 'Kabir', mark: '38 pts' }], inTournament: true, tournament: 'Inter-school Golf' })!.title,
      '⛳ Round 2 finished — Kabir led the round on 38 pts');
  });
});

describe('the podium the app leaves on a locked final', () => {
  const D = disciplineOf('ath.100m')!;
  const e = (id: string, name: string, mark: number, athleteId?: string, team?: ResultEntry['team']): ResultEntry =>
    ({ id, name, heat: 1, athleteId, team, result: { mark, wind: 0.5 } });
  test('positions 1–3 with marks; a relay names its team', () => {
    const rows = rankEntries([e('a', 'Asha', 13.42, P1), e('b', 'Meera', 13.6, P2), e('c', 'Red House', 13.9, undefined, { id: T1, name: 'Red House' }), e('d', 'Diya', 14.2, 'p4')], D);
    const a = finalAlert(rows, '100 m U14 Girls');
    assert.equal(a.kind, 'final');
    assert.equal(a.event, '100 m U14 Girls');
    assert.deepEqual(a.medals.map((m) => [m.medal, m.name, m.playerId ?? m.teamId, m.mark]), [
      ['gold', 'Asha', P1, '13.42'], ['silver', 'Meera', P2, '13.60'], ['bronze', 'Red House', T1, '13.90'],
    ]);
    // round-trips through the edge function's validator
    assert.equal(parseAlert(JSON.parse(JSON.stringify(a)))!.medals.length, 3);
  });
  test('combined events read in points', () => {
    const a = combinedAlert([{ athleteId: P1, name: 'Asha', position: 1, total: 3120 }, { athleteId: P2, name: 'Meera', position: 2, total: 3001, out: true }]);
    assert.deepEqual(a.medals, [{ medal: 'gold', playerId: P1, name: 'Asha', mark: '3120 pts' }]);
  });
  test('golf: the round winner in the round\'s measure; a pending playoff names nobody', () => {
    const rows = [{ id: P1, position: 1, total: -3, grossTotal: 69 }, { id: P2, position: 2, total: 1, grossTotal: 73 }];
    assert.deepEqual(golfAlert(rows, () => 'K', { scoring: 'stroke' }).medals, [{ medal: 'gold', playerId: P1, name: 'K', mark: '−3 (69)' }]);
    assert.equal(golfAlert(rows, () => '', { scoring: 'stroke', net: true }).medals[0].mark, 'net −3');
    assert.equal(golfAlert([{ id: P1, position: 1, total: 38, grossTotal: 80 }], () => '', { scoring: 'stableford' }).medals[0].mark, '38 pts');
    const tied = [{ id: P1, position: 1, total: -2, grossTotal: 70, playoff: 'pending' as const }, { id: P2, position: 1, total: -2, grossTotal: 70, playoff: 'pending' as const }];
    assert.equal(golfAlert(tied, () => '', { scoring: 'stroke' }).medals.length, 0);
    const decided = [{ ...tied[0], playoff: 'lost' as const }, { ...tied[1], playoff: 'won' as const }];
    assert.deepEqual(golfAlert(decided, () => '', { scoring: 'stroke' }).medals.map((m) => m.playerId), [P2]);
  });
});

/* ------------------------------- team pages ------------------------------- */

describe('a house page\'s event results', () => {
  const fmt = (discipline: string, eventKey: string, eventTitle: string, phase: PhaseFormat['phase'] = 'final'): PhaseFormat =>
    ({ discipline, category: { age: 'U14', gender: 'F' }, phase, phaseNo: 1, heats: 1, eventKey, eventTitle });
  const ath = (id: string, name: string, mark: number, house: string, houseId?: string): ResultEntry =>
    ({ id, name, heat: 1, athleteId: `p-${id}`, team: { ...(houseId ? { id: houseId } : {}), name: house }, result: { mark, wind: 0.5 } });
  const phase = (id: string, f: PhaseFormat, entries: ResultEntry[], date = '2026-10-11T09:00:00Z'): MeetPhase => ({ id, format: f, status: 'completed', date, entries });
  const events = groupMeet([
    phase('f100', fmt('ath.100m', 'e100', '100 m U14 Girls'), [ath('a', 'Asha', 13.42, 'Red House', T1), ath('b', 'Meera', 13.6, 'Blue House'), ath('c', 'Diya', 13.9, 'Red House', T1), ath('d', 'Zoya', 14.1, 'Blue House')]),
    phase('f4x1', fmt('ath.4x100', 'e4x1', '4 × 100 m relay U14 Girls'), [
      { id: 'r1', name: 'Blue House', heat: 1, team: { name: 'Blue House' }, result: { mark: 55.1, members: [] } },
      { id: 'r2', name: 'Red House', heat: 1, team: { id: T1, name: 'Red House' }, result: { mark: 56.0, members: [] } },
    ], '2026-10-11T11:00:00Z'),
    { id: 'h200', format: fmt('ath.200m', 'e200', '200 m U14 Girls', 'heat'), status: 'completed', date: '2026-10-11T10:00:00Z', entries: [ath('e', 'Asha', 28, 'Red House', T1)] },
  ]);
  const meet = {
    tournamentId: 't1', tournamentName: 'Sports Day 2026', events,
    points: () => ({ positionPoints: [5, 3, 1] }),
    records: { athletics: [
      { scope: 'MR' as const, discipline: 'ath.100m', category: 'U14-F', value: 13.42, holder: 'Asha', team: 'Red House', eventKey: 'e100' },
      { scope: 'MR' as const, discipline: 'ath.4x100', category: 'U14-F', value: 55.1, holder: 'Blue House', team: 'Blue House', eventKey: 'e4x1' },
    ] },
  };
  test('medals, points, finals, latest results with marks and records held', () => {
    const [s] = teamEventSummary({ id: T1, name: 'Red House' }, [], [meet]);
    assert.equal(s.sport, 'athletics');
    assert.deepEqual([s.golds, s.silvers, s.bronzes, s.points, s.finals], [1, 1, 1, 9, 2]);
    assert.deepEqual(s.results.map((r) => [r.event, r.name, r.position, r.medal, r.mark ?? '-']), [
      ['4 × 100 m relay U14 Girls', 'Red House', 2, 'silver', '56.00'],
      ['100 m U14 Girls', 'Asha', 1, 'gold', '13.42'],
      ['100 m U14 Girls', 'Diya', 3, 'bronze', '13.90'],
    ]);
    assert.equal(s.results[1].phaseId, 'f100');
    assert.deepEqual(s.records, [{ scope: 'MR', holder: 'Asha', date: undefined, event: '100 m U14 Girls', mark: '13.42' }]);
  });
  test('a house matched by name when its snapshot has no id; a heat alone is no final', () => {
    const [s] = teamEventSummary({ id: 'blue-id', name: 'Blue House' }, [], [meet]);
    assert.deepEqual([s.golds, s.silvers, s.bronzes, s.finals], [1, 1, 0, 2]);
    assert.equal(s.records.length, 1);
    assert.deepEqual(teamEventSummary({ id: 'x', name: 'Green House' }, [], [meet]), []);
  });
  test('an athlete entered with no team scores for the squad they are in', () => {
    assert.equal(awardIsTeams({ team: undefined }, 'p1', { id: T1, name: 'Red' }, new Set(['p1'])), true);
    assert.equal(awardIsTeams({ team: undefined }, 'p2', { id: T1, name: 'Red' }, new Set(['p1'])), false);
    assert.equal(awardIsTeams({ team: { id: 'other', name: 'Red' } }, 'p1', { id: T1, name: 'Red' }, new Set(['p1'])), false);
  });
  test('category keys read back as labels', () => {
    assert.equal(categoryFromKey('U14-F'), 'U14 Girls');
    assert.equal(categoryFromKey('Senior-M-61 kg'), 'Senior Men 61 kg');
    assert.equal(categoryFromKey('U16-M-LCM'), 'U16 Boys');
  });
});

/* ---------------------------- profile headline ---------------------------- */

describe('the profile headline is sport-aware', () => {
  const line = (o: Partial<StatLine>): StatLine => ({ id: Math.random().toString(36), matchId: '', playerId: P1, sport: 'athletics', stats: {}, won: false, ...o } as StatLine);
  test('an athlete: events (heat + final once), finals, medals, PBs', () => {
    const lines = [
      line({ eventId: 'h1', opponent: '100 m U14 Girls — Heat 1', date: '2026-10-11T09:00:00Z', stats: { place: 1, m_100m: 13.6, races: 1 } }),
      line({ eventId: 'f1', opponent: '100 m U14 Girls — Final', date: '2026-10-11T11:00:00Z', stats: { place: 1, finals: 1, golds: 1, m_100m: 13.42, races: 1 } }),
      line({ eventId: 'f2', opponent: 'Long Jump U14 Girls — Final', date: '2026-10-11T12:00:00Z', stats: { place: 3, finals: 1, bronzes: 1, m_lj: 4.1, field: 1 } }),
      line({ sport: 'swimming', eventId: 'f3', opponent: '50 m Freestyle U14 Girls — Final', date: '2026-10-12T09:00:00Z', stats: { place: 5, finals: 1, m_sw_50free_lc: 35.2 } }),
    ];
    assert.deepEqual(profileHeadline(lines).map((t) => `${t.value} ${t.label}`), ['3 Events', '3 Finals', '2 Medals', '3 PBs']);
  });
  test('a stroke-play golfer: rounds, wins, best round', () => {
    const lines = [
      line({ sport: 'golf', eventId: 'g1', won: true, stats: { holes: 18, completeRounds: 1, strokes: 74 } }),
      line({ sport: 'golf', eventId: 'g2', stats: { holes: 18, completeRounds: 1, strokes: 71 } }),
    ];
    assert.deepEqual(profileHeadline(lines).map((t) => `${t.value} ${t.label}`), ['2 Rounds', '1 Wins', '71 Best round']);
  });
  test('a footballer keeps Apps / W-D-L / Win %; one who also runs adds Medals', () => {
    const fb = [line({ sport: 'football', matchId: 'm1', result: 'W', stats: { goals: 1 } }), line({ sport: 'football', matchId: 'm2', result: 'L', stats: {} })];
    assert.deepEqual(profileHeadline(fb).map((t) => `${t.value} ${t.label}`), ['2 Apps', '1-0-1 W-D-L', '50% Win %']);
    const both = [...fb, line({ eventId: 'f1', opponent: '100 m — Final', stats: { finals: 1, golds: 1 } })];
    assert.deepEqual(profileHeadline(both).map((t) => `${t.value} ${t.label}`), ['2 Apps', '1-0-1 W-D-L', '50% Win %', '1 Medal']);
  });
  test('nothing played yet reads zeros, as before', () => {
    assert.deepEqual(profileHeadline([]).map((t) => t.value), ['0', '0-0-0', '0%']);
  });
});

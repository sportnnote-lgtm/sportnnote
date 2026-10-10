/**
 * SD-18 — standings columns per sport (GEN-05): `tableColumns(sport, cfg,
 * participantKind, rows)` returns each sport's proper headers (football GD,
 * basketball PF/PA/±, volleyball Sets/SR/PR, kabaddi T + SD, racket G±/P±,
 * tennis S±/G± + ATP S%/G%, carrom board points, cricket kept from SD-12,
 * chess W-D-L + score + SB + registered tie-breaks), the chain's tie-break
 * columns, a "Player" header for individual events — and values that match
 * the `teamStandings` rows.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  teamStandings, standingsConfigFromFormat, defaultStandingsConfig, standingsPresets, setStandingsUnitsProvider,
  setStandingsPointsProvider, registerTieBreaker, type StandingsConfig, type StandingsUnits, type TeamStanding,
} from '../src/data/standings.ts';
import { tableColumns, columnsConfig, tieBreakNote, ratioText, pctText, halfText } from '../src/data/standingsColumns.ts';
import type { Match, SportId } from '../src/core/types.ts';

let n = 0;
function mt(sport: string, h: string, a: string, hs: number, as: number,
  o: { winner?: 'home' | 'away' | 'draw'; u?: StandingsUnits; nr?: boolean } = {}): Match {
  const winner = o.nr ? undefined : o.winner ?? (hs > as ? 'home' : as > hs ? 'away' : 'draw');
  return {
    id: `c${++n}`, sport, status: 'completed', startsAt: '', score: { home: hs, away: as }, winner,
    ...(o.nr ? { result: { kind: 'no_result' } } : {}),
    homeTeam: { id: h, name: h }, awayTeam: { id: a, name: a },
    state: o.u ? { u: o.u } : null,
  } as unknown as Match;
}
const fmtOf = (sport: string, id?: string) => standingsPresets(sport).find((p) => (id ? p.id === id : true))!.set as Record<string, unknown>;
const cfgOf = (sport: string, fmt?: Record<string, unknown>) => columnsConfig(sport, standingsConfigFromFormat(sport as SportId, fmt));
const labels = (sport: string, cfg: StandingsConfig, rows: TeamStanding[] = [], kind: 'team' | 'individual' | 'pairs' | 'both' = 'team') =>
  tableColumns(sport, cfg, kind, rows).columns.map((c) => c.label).join(' ');
/** row `id`'s figures, by header */
const valuesOf = (sport: string, cfg: StandingsConfig, rows: TeamStanding[], id: string) => {
  const t = rows.find((r) => r.teamId === id)!;
  return Object.fromEntries(tableColumns(sport, cfg, 'team', rows).columns.map((c) => [c.label, c.value(t, rows)]));
};

before(() => {
  setStandingsUnitsProvider((_sp, st) => ((st as { u?: StandingsUnits } | null)?.u ?? null));
  setStandingsPointsProvider(null);
});
after(() => setStandingsUnitsProvider(null));

describe('headers per sport', () => {
  test('football: P W D L GF GA GD Pts (D always — football draws)', () => {
    assert.equal(labels('football', defaultStandingsConfig('football')), 'P W D L GF GA GD Pts');
  });
  test('football FIFA preset adds the fair-play column (it is in the chain)', () => {
    assert.equal(labels('football', cfgOf('football', fmtOf('football', 'fifa'))), 'P W D L GF GA GD FP Pts');
  });
  test('basketball: P W L PF PA ± Pts (legacy and FIBA)', () => {
    assert.equal(labels('basketball', defaultStandingsConfig('basketball')), 'P W L PF PA ± Pts');
    assert.equal(labels('basketball', cfgOf('basketball', fmtOf('basketball'))), 'P W L PF PA ± Pts');
  });
  test('volleyball: P W L Sets SR PR Pts', () => {
    assert.equal(labels('volleyball', cfgOf('volleyball', fmtOf('volleyball'))), 'P W L Sets SR PR Pts');
    assert.equal(labels('volleyball', defaultStandingsConfig('volleyball')), 'P W L Sets SR PR Pts');
  });
  test('kabaddi: P W T L SD Pts, plus PF when the chain scores it', () => {
    assert.equal(labels('kabaddi', { win: 5, draw: 3, loss: 0, order: ['diff', 'wins', 'h2h'] }), 'P W T L SD Pts');
    assert.equal(labels('kabaddi', cfgOf('kabaddi', fmtOf('kabaddi'))), 'P W T L PF SD Pts');
  });
  test('games sports: P W L G± P± Pts; ITTF / WSF add nothing per-row (among-tied ratios)', () => {
    for (const sp of ['badminton', 'tabletennis', 'squash', 'pickleball', 'carrom'])
      assert.equal(labels(sp, cfgOf(sp, fmtOf(sp))), 'P W L G± P± Pts', sp);
  });
  test('carrom: P± is board points', () => {
    const c = tableColumns('carrom', cfgOf('carrom'), 'team').columns.find((x) => x.key === 'pointsDiff')!;
    assert.equal(c.title, 'board points difference');
  });
  test('tennis / padel: P W L S± G± Pts; the ATP chain adds S% and G%', () => {
    assert.equal(labels('padel', cfgOf('padel', fmtOf('padel'))), 'P W L S± G± Pts');
    assert.equal(labels('tennis', cfgOf('tennis', fmtOf('tennis'))), 'P W L S± G± S% G% Pts');
  });
  test('cricket keeps SD-12: P W L NR NRR Pts, with T once there is a tie', () => {
    const cfg = defaultStandingsConfig('cricket');
    assert.equal(labels('cricket', cfg), 'P W L NR NRR Pts');
    assert.equal(labels('cricket', cfgOf('cricket', fmtOf('cricket'))), 'P W L NR NRR Pts');
    const rows = teamStandings([mt('cricket', 'A', 'B', 150, 150, { winner: 'draw' })], 'cricket', cfg);
    assert.equal(labels('cricket', cfg, rows), 'P W T L NR NRR Pts');
  });
  test('chess: P W-D-L Pts SB (FIDE rank list, score then tie-breaks)', () => {
    assert.equal(labels('chess', defaultStandingsConfig('chess')), 'P W-D-L Pts SB');
  });
  test('a registered tie-breaker (Buchholz, SD-26) gets its column only while in the chain', () => {
    registerTieBreaker('bhTest', { label: 'Buchholz', column: { short: 'BH', value: (t) => t.points * 2 } });
    try {
      const cfg: StandingsConfig = { win: 1, draw: 0.5, loss: 0, order: ['bhTest', 'sb', 'wins'] };
      assert.equal(labels('chess', cfg), 'P W-D-L Pts BH SB');
      assert.equal(labels('chess', defaultStandingsConfig('chess')), 'P W-D-L Pts SB');
      const rows = teamStandings([mt('chess', 'A', 'B', 1, 0), mt('chess', 'A', 'C', 0.5, 0.5, { winner: 'draw' })], 'chess', cfg);
      assert.equal(valuesOf('chess', cfg, rows, 'A').BH, '3');
    } finally {
      registerTieBreaker('bhTest', null);
    }
  });
  test('NR appears once a match was abandoned; D once a basketball game is level', () => {
    const cfg = defaultStandingsConfig('basketball');
    const rows = teamStandings([mt('basketball', 'A', 'B', 0, 0, { nr: true }), mt('basketball', 'A', 'C', 80, 80, { winner: 'draw' })], 'basketball', cfg);
    assert.equal(labels('basketball', cfg, rows), 'P W D L NR PF PA ± Pts');
  });
});

describe('"Player" header for individual sports', () => {
  test('participant kind picks the name header', () => {
    const cfg = defaultStandingsConfig('badminton');
    assert.equal(tableColumns('badminton', cfg, 'individual').nameHeader, 'Player');
    assert.equal(tableColumns('badminton', cfg, 'pairs').nameHeader, 'Pair');
    assert.equal(tableColumns('badminton', cfg, 'both').nameHeader, 'Player');
    assert.equal(tableColumns('chess', defaultStandingsConfig('chess'), 'individual').nameHeader, 'Player');
    assert.equal(tableColumns('football', defaultStandingsConfig('football'), 'team').nameHeader, 'Team');
    assert.equal(tableColumns('football', defaultStandingsConfig('football')).nameHeader, 'Team');
  });
});

describe('values match the standings rows', () => {
  test('football: GF / GA / GD / Pts', () => {
    const cfg = defaultStandingsConfig('football');
    const rows = teamStandings([mt('football', 'A', 'B', 3, 1), mt('football', 'B', 'C', 2, 2), mt('football', 'C', 'A', 1, 0)], 'football', cfg);
    assert.deepEqual(valuesOf('football', cfg, rows, 'A'), { P: '2', W: '1', D: '0', L: '1', GF: '3', GA: '2', GD: '+1', Pts: '3' });
    assert.deepEqual(valuesOf('football', cfg, rows, 'B'), { P: '2', W: '0', D: '1', L: '1', GF: '3', GA: '5', GD: '-2', Pts: '1' });
  });
  test('basketball: PF / PA / ±', () => {
    const cfg = cfgOf('basketball', fmtOf('basketball'));
    const rows = teamStandings([mt('basketball', 'A', 'B', 88, 80), mt('basketball', 'B', 'A', 90, 70)], 'basketball', cfg);
    assert.deepEqual(valuesOf('basketball', cfg, rows, 'A'), { P: '2', W: '1', L: '1', PF: '158', PA: '170', '±': '-12', Pts: '3' });
  });
  test('volleyball FIVB: Sets W-L, SR and PR from the units (MAX when none lost)', () => {
    const cfg = cfgOf('volleyball', fmtOf('volleyball'));
    assert.equal(cfg.withUnits, true);
    const rows = teamStandings([
      mt('volleyball', 'A', 'B', 3, 2, { u: { points: { home: 110, away: 100 } } }),
      mt('volleyball', 'A', 'C', 3, 0, { u: { points: { home: 75, away: 50 } } }),
      mt('volleyball', 'C', 'B', 1, 3, { u: { points: { home: 80, away: 95 } } }),
    ], 'volleyball', cfg);
    const a = rows.find((r) => r.teamId === 'A')!;
    assert.deepEqual(valuesOf('volleyball', cfg, rows, 'A'), { P: '2', W: '2', L: '0', Sets: '6-2', SR: '3.000', PR: (185 / 150).toFixed(3), Pts: String(a.points) });
    assert.equal(valuesOf('volleyball', cfg, rows, 'C').Sets, '1-6');
    // a side that has lost no set
    const r2 = teamStandings([mt('volleyball', 'X', 'Y', 3, 0)], 'volleyball', cfg);
    assert.equal(valuesOf('volleyball', cfg, r2, 'X').SR, 'MAX');
    assert.equal(valuesOf('volleyball', cfg, r2, 'X').PR, '—'); // no rally points recorded
  });
  test('kabaddi PKL: T and SD, with the losing bonus in Pts', () => {
    const cfg = cfgOf('kabaddi', fmtOf('kabaddi'));
    const rows = teamStandings([mt('kabaddi', 'A', 'B', 35, 30), mt('kabaddi', 'B', 'C', 28, 28, { winner: 'draw' })], 'kabaddi', cfg);
    assert.deepEqual(valuesOf('kabaddi', cfg, rows, 'B'), { P: '2', W: '0', T: '1', L: '1', PF: '58', SD: '-5', Pts: '4' });
  });
  test('badminton BWF: G± from the games score, P± from the rally points', () => {
    const cfg = cfgOf('badminton', fmtOf('badminton'));
    const rows = teamStandings([
      mt('badminton', 'A', 'B', 2, 1, { u: { points: { home: 60, away: 55 } } }),
      mt('badminton', 'C', 'A', 2, 0, { u: { points: { home: 42, away: 30 } } }),
    ], 'badminton', cfg);
    assert.deepEqual(valuesOf('badminton', cfg, rows, 'A'), { P: '2', W: '1', L: '1', 'G±': '-1', 'P±': '-7', Pts: '2' });
  });
  test('tennis ATP: S± from the sets score, G± / S% / G% from the units', () => {
    const cfg = cfgOf('tennis', fmtOf('tennis'));
    const rows = teamStandings([
      mt('tennis', 'A', 'B', 2, 1, { u: { games: { home: 16, away: 14 } } }),
      mt('tennis', 'A', 'C', 0, 2, { u: { games: { home: 5, away: 12 } } }),
    ], 'tennis', cfg);
    assert.deepEqual(valuesOf('tennis', cfg, rows, 'A'), {
      P: '2', W: '1', L: '1', 'S±': '-1', 'G±': '-5', 'S%': pctText(2, 3), 'G%': pctText(21, 26), Pts: '2',
    });
  });
  test('cricket: NRR to two places, "—" without overs', () => {
    const cfg = defaultStandingsConfig('cricket');
    const rows = teamStandings([mt('cricket', 'A', 'B', 160, 150)], 'cricket', cfg);
    assert.equal(valuesOf('cricket', cfg, rows, 'A').NRR, '—');
    const t = { ...rows[0], nrr: 0.4567 };
    assert.equal(tableColumns('cricket', cfg, 'team', [t]).columns.find((c) => c.key === 'nrr')!.value(t, [t]), '+0.46');
  });
  test('chess: W-D-L and half points', () => {
    const cfg = defaultStandingsConfig('chess');
    const rows = teamStandings([mt('chess', 'A', 'B', 1, 0), mt('chess', 'A', 'C', 0.5, 0.5, { winner: 'draw' }), mt('chess', 'B', 'C', 0, 1)], 'chess', cfg);
    const a = valuesOf('chess', cfg, rows, 'A');
    assert.equal(a['W-D-L'], '1-1-0');
    assert.equal(a.Pts, '1½');
    assert.equal(a.SB, halfText(rows.find((r) => r.teamId === 'A')!.sb!));
  });
});

describe('helpers', () => {
  test('ratio / percent / half-point text', () => {
    assert.equal(ratioText(3, 2), '1.500');
    assert.equal(ratioText(3, 0), 'MAX');
    assert.equal(ratioText(0, 0), '—');
    assert.equal(pctText(2, 1), '66.7');
    assert.equal(pctText(0, 0), '—');
    assert.equal(halfText(2.5), '2½');
    assert.equal(halfText(0.5), '½');
    assert.equal(halfText(3), '3');
  });
  test('columnsConfig turns units on only for sports whose columns need them', () => {
    assert.equal(columnsConfig('volleyball', defaultStandingsConfig('volleyball')).withUnits, true);
    assert.equal(columnsConfig('badminton', defaultStandingsConfig('badminton')).withUnits, true);
    assert.equal(columnsConfig('carrom', defaultStandingsConfig('carrom')).withUnits, true);
    assert.equal(columnsConfig('football', defaultStandingsConfig('football')).withUnits, undefined);
    assert.equal(columnsConfig('cricket', defaultStandingsConfig('cricket')).withUnits, undefined);
  });
  test('withUnits never changes the order', () => {
    const ms = [
      mt('badminton', 'A', 'B', 2, 1, { u: { points: { home: 60, away: 58 } } }),
      mt('badminton', 'B', 'C', 2, 0, { u: { points: { home: 42, away: 20 } } }),
      mt('badminton', 'C', 'A', 2, 1, { u: { points: { home: 61, away: 59 } } }),
    ];
    const plain = standingsConfigFromFormat('badminton', fmtOf('badminton'));
    const ids = (c: StandingsConfig) => teamStandings(ms, 'badminton', c).map((r) => r.teamId).join('');
    assert.equal(ids(columnsConfig('badminton', plain)), ids(plain));
  });
  test('tie-break note spells out the chain (BWF two vs three-way, FIVB wins first)', () => {
    assert.equal(tieBreakNote('badminton', standingsConfigFromFormat('badminton', fmtOf('badminton'))),
      'Level: two → head-to-head, drawing of lots; three or more → games difference, points difference, drawing of lots.');
    assert.match(tieBreakNote('volleyball', standingsConfigFromFormat('volleyball', fmtOf('volleyball')))!, /^Ranked by wins, then points\. Level on both → set ratio, point ratio/);
    assert.equal(tieBreakNote('cricket', defaultStandingsConfig('cricket')), 'Level on points → head-to-head, net run rate, runs scored.');
  });
});

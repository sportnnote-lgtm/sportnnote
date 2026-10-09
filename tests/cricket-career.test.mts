/**
 * Parity #19 — cricket career figures computed on read from stat lines:
 * batting Avg / SR / Highest / 50s, bowling Econ / Avg / SR / Best, fielding,
 * with "–" for a zero denominator and older (pre-#19) lines kept out of rates.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cricketCareer, bestBowling, highestScore, rate, careerOvers } from '../src/data/cricketCareer.ts';
import type { StatLine } from '../src/core/types.ts';

let i = 0;
const line = (stats: Record<string, number>, sport: StatLine['sport'] = 'cricket'): StatLine =>
  ({ id: `l${++i}`, matchId: `m${i}`, playerId: 'p', sport, stats, won: false });
const val = (sec: { key: string; value: string }[], key: string) => sec.find((s) => s.key === key)?.value;

describe('#19 — cricket career', () => {
  const lines = [
    line({ runs: 54, ballsFaced: 40, fours: 6, sixes: 1, innings: 1, notOut: 0, catches: 1, stumpings: 0, runouts: 0 }),
    line({ runs: 20, ballsFaced: 10, fours: 2, sixes: 0, innings: 1, notOut: 1, catches: 0, stumpings: 0, runouts: 1 }),
    line({ runs: 102, ballsFaced: 70, fours: 10, sixes: 3, innings: 1, notOut: 0, wickets: 3, ballsBowled: 24, runsConceded: 12, maidens: 1, dots: 15, catches: 0, stumpings: 0, runouts: 0 }),
    line({ wickets: 3, ballsBowled: 18, runsConceded: 20, maidens: 0, dots: 8, catches: 2, stumpings: 0, runouts: 0 }),
    line({ runs: 99 }, 'football'), // another sport — ignored
  ];

  test('batting: Avg = runs ÷ (innings − not out), SR, highest, 50s / 100s', () => {
    const c = cricketCareer(lines);
    assert.equal(val(c.batting, 'runs'), '176');
    assert.equal(val(c.batting, 'innings'), '3');
    assert.equal(val(c.batting, 'notOut'), '1');
    assert.equal(val(c.batting, 'avg'), '88.00'); // 176 / 2
    assert.equal(val(c.batting, 'sr'), (17600 / 120).toFixed(2)); // 146.67
    assert.equal(val(c.batting, 'highest'), '102');
    assert.equal(val(c.batting, 'fifties'), '1');
    assert.equal(val(c.batting, 'hundreds'), '1');
    assert.equal(val(c.batting, 'fours'), '18');
  });

  test('bowling: overs, Econ = runs ÷ balls × 6, Avg, SR, Best (most wickets, then fewest runs)', () => {
    const c = cricketCareer(lines);
    assert.equal(val(c.bowling, 'overs'), '7.0');
    assert.equal(val(c.bowling, 'wickets'), '6');
    assert.equal(val(c.bowling, 'runsConceded'), '32');
    assert.equal(val(c.bowling, 'maidens'), '1');
    assert.equal(val(c.bowling, 'econ'), '4.57'); // 32 / 42 × 6
    assert.equal(val(c.bowling, 'bowlAvg'), '5.33');
    assert.equal(val(c.bowling, 'bowlSr'), '7.0');
    assert.equal(val(c.bowling, 'best'), '3/12');
  });

  test('fielding totals', () => {
    const c = cricketCareer(lines);
    assert.equal(val(c.fielding, 'catches'), '3');
    assert.equal(val(c.fielding, 'runouts'), '1');
    assert.equal(val(c.fielding, 'stumpings'), '0');
  });

  test('zero denominators read "–"', () => {
    const c = cricketCareer([line({ runs: 30, ballsFaced: 0, innings: 1, notOut: 1 })]);
    assert.equal(val(c.batting, 'avg'), '–'); // never out
    assert.equal(val(c.batting, 'sr'), '–'); // no balls faced
    assert.equal(val(c.bowling, 'econ'), '–');
    assert.equal(val(c.bowling, 'bowlAvg'), '–');
    assert.equal(val(c.bowling, 'bowlSr'), '–');
    assert.equal(val(c.bowling, 'best'), '–');
    assert.equal(val(c.batting, 'highest'), '30*');
    const empty = cricketCareer([]);
    assert.equal(val(empty.batting, 'highest'), '–');
    assert.equal(val(empty.bowling, 'overs'), '0.0');
    assert.equal(rate(1, 0), '–');
    assert.equal(careerOvers(13), '2.1');
  });

  test('best bowling tie-break and a not-out highest', () => {
    assert.equal(bestBowling([line({ wickets: 2, runsConceded: 10 }), line({ wickets: 2, runsConceded: 8 }), line({ wickets: 1, runsConceded: 0 })]), '2/8');
    assert.equal(highestScore([line({ runs: 40, innings: 1, notOut: 0 }), line({ runs: 40, innings: 1, notOut: 1 })]), '40*');
  });

  test('pre-#19 lines (runs / wickets only) count in totals but not in the rates', () => {
    const c = cricketCareer([line({ runs: 25 }), line({ wickets: 2 }), line({ runs: 10, ballsFaced: 10, innings: 1, notOut: 0 })]);
    assert.equal(val(c.batting, 'runs'), '35');
    assert.equal(val(c.batting, 'innings'), '2');
    assert.equal(val(c.batting, 'sr'), '100.00');
    assert.equal(val(c.batting, 'avg'), '10.00');
    assert.equal(val(c.bowling, 'wickets'), '2');
    assert.equal(val(c.bowling, 'bowlAvg'), '–');
  });
});

describe('#19 — profile history line', () => {
  test('compact figures, legacy lines still read', async () => {
    const { cricketMatchLine } = await import('../src/data/cricketCareer.ts');
    assert.equal(cricketMatchLine({ runs: 54, ballsFaced: 40, innings: 1, notOut: 1, wickets: 2, ballsBowled: 24, runsConceded: 18, catches: 1, stumpings: 0, runouts: 0 }), '54* (40) · 2/18 (4.0 ov) · 1 ct');
    assert.equal(cricketMatchLine({ runs: 71, wickets: 1 }), '71 runs · 1 wkt');
    assert.equal(cricketMatchLine({ wickets: 0, ballsBowled: 6, runsConceded: 0, maidens: 1, catches: 0, stumpings: 0, runouts: 0 }), '0/0 (1.0 ov)');
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixturesShareText, fixturesPrintHtml, type FixtureRow } from '../src/core/fixturesText.ts';

const rows: FixtureRow[] = [
  { startsAt: '2026-10-12T10:30:00Z', day: 'Mon, 12 Oct', time: '4:00 pm', home: 'Red', away: 'Blue', venue: 'Court 1', stage: 'Group A' },
  { startsAt: '2026-10-11T04:30:00Z', day: 'Sun, 11 Oct', time: '10:00 am', home: 'Gold', away: 'Green', sportIcon: '⚽' },
  { startsAt: '2026-10-11T06:30:00Z', day: 'Sun, 11 Oct', time: '12:00 pm', home: 'A & B', away: '<C>' },
];

test('WhatsApp fixtures: grouped by day, in time order, with stage/venue', () => {
  const t = fixturesShareText({ tournament: 'Hyd Open', rows, link: 'https://app.sportnnote.in/t/x' });
  assert.equal(t, [
    '🏆 Hyd Open — fixtures', '', '📅 Sun, 11 Oct', '10:00 am ⚽ Gold vs Green', '12:00 pm A & B vs <C>',
    '', '📅 Mon, 12 Oct', '4:00 pm Red vs Blue (Group A · Court 1)', '', 'Live scores & updates: https://app.sportnnote.in/t/x',
  ].join('\n'));
});

test('long lists are capped with a count', () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ ...rows[0], startsAt: `2026-10-12T${String(10 + (i % 10)).padStart(2, '0')}:00:00Z`, home: `T${i}` }));
  assert.match(fixturesShareText({ tournament: 'X', rows: many }), /…and 5 more$/);
});

test('printable page escapes names and has a result column', () => {
  const h = fixturesPrintHtml({ tournament: 'Hyd <Open>', rows });
  assert.match(h, /<title>Hyd &lt;Open&gt; — fixtures<\/title>/);
  assert.match(h, /&lt;C&gt;/);
  assert.doesNotMatch(h, /<C>/);
  assert.match(h, /<th>Result<\/th>/);
  assert.ok(h.indexOf('Sun, 11 Oct') < h.indexOf('Mon, 12 Oct'));
});

/** Parity #13 — match housekeeping: delete/reset verdict, clone draft, breaks. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteVerdict, cloneDraft, BREAK_KINDS, readBreak, breakLabel, DELETE_WINDOW_MIN } from '../src/data/matchHousekeeping.ts';
import { mergeMatchConfig } from '../src/core/matchConfig.ts';

const now = Date.parse('2026-10-09T12:00:00Z');
const ago = (min: number) => now - min * 60000;

test('deleteVerdict: pre-match is always delete', () => {
  for (const status of ['scheduled', 'postponed', 'cancelled'] as const) {
    assert.equal(deleteVerdict({ status }, now).verdict, 'delete');
    assert.equal(deleteVerdict({ status, tournamentId: 't1' }, now).verdict, 'delete');
  }
});

test('deleteVerdict: live — friendly deletes, tournament resets', () => {
  assert.equal(deleteVerdict({ status: 'live', lastActivityAt: ago(500) }, now).verdict, 'delete');
  assert.equal(deleteVerdict({ status: 'live', tournamentId: 't1', lastActivityAt: ago(500) }, now).verdict, 'reset');
});

test('deleteVerdict: completed at 29 vs 31 minutes', () => {
  const f29 = deleteVerdict({ status: 'completed', lastActivityAt: ago(29) }, now);
  assert.equal(f29.verdict, 'delete');
  assert.equal(f29.minutesLeft, 1);
  assert.equal(deleteVerdict({ status: 'completed', lastActivityAt: ago(31) }, now).verdict, 'none');
  assert.equal(deleteVerdict({ status: 'completed', tournamentId: 't1', lastActivityAt: ago(29) }, now).verdict, 'reset');
  assert.equal(deleteVerdict({ status: 'completed', tournamentId: 't1', lastActivityAt: ago(31) }, now).verdict, 'none');
  assert.equal(deleteVerdict({ status: 'completed', lastActivityAt: new Date(ago(6)).toISOString() }, now).minutesLeft, 24);
  assert.equal(DELETE_WINDOW_MIN, 30);
});

test('deleteVerdict: completed with no known activity → none', () => {
  assert.equal(deleteVerdict({ status: 'completed' }, now).verdict, 'none');
  assert.equal(deleteVerdict({ status: 'completed', lastActivityAt: null }, now).verdict, 'none');
});

const team = (id: string) => ({ id, name: id, sport: 'cricket' }) as never;

test('cloneDraft: merged config, internal keys dropped, nothing derived', () => {
  const tour = { overs: 20, playersPerSide: 11 };
  const m = {
    sport: 'cricket' as const, homeTeam: team('h'), awayTeam: team('a'), venueName: 'Oval', venueMapsUrl: 'https://maps/x', streamUrl: 'https://yt/x',
    format: { ballType: 'tennis', __walkover: true, __break: { kind: 'rain', since: 'x' }, __seriesId: 's1' } as never,
    officials: [{ slot: 'umpire1', name: 'Rao' }], result: { kind: 'draw', at: 'x' }, potm: 'p1', tournamentId: 't1',
  };
  const d = cloneDraft(m as never, tour);
  assert.deepEqual(d.format, { overs: 20, playersPerSide: 11, ballType: 'tennis' });
  assert.equal(d.homeTeamId, 'h'); assert.equal(d.awayTeamId, 'a');
  assert.equal(d.venueName, 'Oval'); assert.equal(d.streamUrl, 'https://yt/x'); assert.equal(d.sport, 'cricket');
  for (const k of ['officials', 'result', 'potm', 'tournamentId', 'stage', 'group']) assert.ok(!(k in d), k);
  // A friendly with no format → no format
  assert.equal(cloneDraft({ ...m, format: undefined } as never).format, undefined);
});

test('a tournament match keeps its overs after a __break write', () => {
  const tour = { overs: 20 };
  const fmt = { __break: { kind: 'drinks', since: '2026-10-09T11:00:00Z' } };
  assert.equal(mergeMatchConfig(tour, fmt)?.overs, 20);
  assert.ok(!('__break' in (mergeMatchConfig(tour, fmt) ?? {})));
});

test('breaks: kinds, read + label', () => {
  assert.deepEqual([...BREAK_KINDS], ['drinks', 'rain', 'interval', 'bad_light', 'injury', 'stumps', 'other']);
  assert.equal(readBreak({}), undefined);
  assert.equal(readBreak(null), undefined);
  const b = readBreak({ __break: { kind: 'rain', since: 'x' } })!;
  assert.equal(breakLabel(b), 'Rain break');
  assert.equal(readBreak({ __break: { kind: 'weird', since: 'x' } })!.kind, 'other');
  assert.equal(breakLabel({ kind: 'other', note: 'Power cut', since: 'x' }), 'Power cut');
  assert.equal(breakLabel({ kind: 'stumps', since: 'x' }), 'Stumps');
});

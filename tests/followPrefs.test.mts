/**
 * Alert choices per follow (parity #23) — the pure model shared by the bell,
 * the sheet, the client gates and the stored follows.prefs value.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ALERTS, wants, bellState, serializePrefs, normalizePrefs, prefsFromTicked, type AlertKey } from '../src/data/followPrefs.ts';

describe('followPrefs', () => {
  test('wants defaults on', () => {
    assert.equal(wants(undefined, 'scores'), true);
    assert.equal(wants(null, 'start'), true);
    assert.equal(wants({}, 'result'), true);
    assert.equal(wants({ scores: false }, 'scores'), false);
    assert.equal(wants({ scores: false }, 'start'), true);
  });

  test('bellState all / some / none', () => {
    assert.equal(bellState('player', undefined), 'all');
    assert.equal(bellState('player', {}), 'all');
    assert.equal(bellState('player', { scores: false }), 'some');
    assert.equal(bellState('player', { reminder: false, start: false, result: false, scores: false }), 'none');
    assert.equal(bellState('team', { start: false }), 'some');
    assert.equal(bellState('team', { start: false, result: false }), 'none');
    // a key the type doesn't show doesn't count
    assert.equal(bellState('tournament', { scores: false, reminder: false }), 'all');
  });

  test('no award switch is shown (nothing sends it yet)', () => {
    for (const list of Object.values(ALERTS)) assert.ok(!list.some((a) => a.key === 'award'));
  });

  test('player shows reminder/start/result/scores; team & tournament only start/result', () => {
    assert.deepEqual(ALERTS.player.map((a) => a.key), ['reminder', 'start', 'result', 'scores']);
    assert.deepEqual(ALERTS.team.map((a) => a.key), ['start', 'result']);
    assert.deepEqual(ALERTS.tournament.map((a) => a.key), ['start', 'result']);
    assert.equal(ALERTS.player.find((a) => a.key === 'scores')?.label, 'Goals, wickets & big moments');
  });

  test('all-on serialises to null; only OFF switches are kept', () => {
    assert.equal(serializePrefs({}), null);
    assert.equal(serializePrefs(undefined), null);
    assert.equal(serializePrefs({ scores: true } as unknown as Record<AlertKey, false>), null);
    assert.deepEqual(serializePrefs({ scores: false }), { scores: false });
    assert.deepEqual(normalizePrefs({ scores: false, junk: false, start: 'no' }), { scores: false });
  });

  test('prefsFromTicked round-trips the sheet', () => {
    const all = new Set<AlertKey>(['reminder', 'start', 'result', 'scores']);
    assert.equal(serializePrefs(prefsFromTicked('player', all)), null);
    assert.deepEqual(prefsFromTicked('player', new Set<AlertKey>(['reminder', 'start', 'result'])), { scores: false });
    assert.deepEqual(prefsFromTicked('team', new Set<AlertKey>()), { start: false, result: false });
    // ticking back on clears the OFF switch; keys the type doesn't show are kept
    assert.deepEqual(prefsFromTicked('team', new Set<AlertKey>(['start', 'result']), { start: false, award: false }), { award: false });
  });
});

describe('followStore alert choices', async () => {
  const { followStore } = await import('../src/data/followStore.ts');
  test('hydrate keeps prefs only for followed keys; wants needs a follow', () => {
    followStore.hydrate(['player:a', 'team:t'], { 'player:a': { scores: false }, 'player:zzz': { start: false } });
    assert.equal(followStore.wants('player', 'a', 'scores'), false);
    assert.equal(followStore.wants('player', 'a', 'start'), true);
    assert.equal(followStore.wants('player', 'zzz', 'start'), false); // not followed
    assert.deepEqual(followStore.prefsOf('player', 'zzz'), {});
    assert.equal(followStore.wants('team', 't', 'result'), true);
  });
  test('setPrefs and all-on clears', () => {
    followStore.setPrefs('team', 't', { result: false });
    assert.equal(followStore.wants('team', 't', 'result'), false);
    followStore.setPrefs('team', 't', {});
    assert.deepEqual(followStore.prefsOf('team', 't'), {});
  });
  test('unfollow + re-follow resets everything to on', () => {
    followStore.toggle('player', 'a'); // unfollow
    followStore.toggle('player', 'a'); // follow again
    assert.deepEqual(followStore.prefsOf('player', 'a'), {});
    assert.equal(followStore.wants('player', 'a', 'scores'), true);
  });
  test('a prefs change emits a new snapshot (bells re-render)', () => {
    const before = followStore.getSnapshot();
    followStore.setPrefs('player', 'a', { start: false });
    assert.notEqual(followStore.getSnapshot(), before);
  });
});

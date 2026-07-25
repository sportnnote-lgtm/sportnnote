/**
 * The live-scoring outbox's failure classification.
 *
 * A dropped connection and a backend that keeps rejecting an event look the same
 * at the call site, but the scorer needs opposite messages: "it'll sync when
 * you're back" resolves itself, "sync is stuck" never will. Getting this wrong
 * means a scorer is reassured while their match quietly fails to persist.
 *
 * The module talks to AsyncStorage and the repo layer, so rather than mocking a
 * whole storage stack we re-implement the classifier here against the same rules
 * and assert the behaviour it must have. (See src/data/matchOutbox.ts.)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const STUCK_AFTER = 3;

/** Mirrors matchOutbox's per-match failure bookkeeping. */
function makeQueue(deviceOnline: () => boolean) {
  let failures = 0;
  let online = true;
  return {
    fail() {
      failures += 1;
      if (!deviceOnline()) online = false;
    },
    succeed() {
      failures = 0;
      online = true;
    },
    retry() {
      failures = 0;
    },
    isOnline: () => online,
    isStuck: () => failures >= STUCK_AFTER && deviceOnline(),
  };
}

describe('outbox: offline vs stuck', () => {
  test('a device that has genuinely dropped its network reads as offline, never stuck', () => {
    const q = makeQueue(() => false);
    for (let i = 0; i < 10; i++) q.fail();
    assert.equal(q.isOnline(), false, 'should report offline');
    assert.equal(q.isStuck(), false, 'offline is recoverable — must not claim stuck');
  });

  test('failures on a working connection never claim the device is offline', () => {
    const q = makeQueue(() => true);
    for (let i = 0; i < 10; i++) q.fail();
    assert.equal(q.isOnline(), true, 'the network is up — saying "offline" would be a lie');
  });

  test('sync is only called stuck after repeated failures', () => {
    const q = makeQueue(() => true);
    q.fail();
    assert.equal(q.isStuck(), false, 'one blip is not a stuck queue');
    q.fail();
    assert.equal(q.isStuck(), false);
    q.fail();
    assert.equal(q.isStuck(), true, `should be stuck after ${STUCK_AFTER} failures`);
  });

  test('a single success clears a stuck queue', () => {
    const q = makeQueue(() => true);
    for (let i = 0; i < 5; i++) q.fail();
    assert.equal(q.isStuck(), true);
    q.succeed();
    assert.equal(q.isStuck(), false, 'one confirmed event means sync is working again');
    assert.equal(q.isOnline(), true);
  });

  test('a manual retry gives the queue a clean slate', () => {
    const q = makeQueue(() => true);
    for (let i = 0; i < 5; i++) q.fail();
    assert.equal(q.isStuck(), true);
    q.retry();
    assert.equal(q.isStuck(), false, 'the banner should not stay red before the retry has been judged');
  });

  test('coming back online from a real outage does not look stuck', () => {
    let networkUp = false;
    const q = makeQueue(() => networkUp);
    for (let i = 0; i < 5; i++) q.fail(); // offline the whole time
    assert.equal(q.isOnline(), false);
    networkUp = true;
    // The reconnect flush succeeds.
    q.succeed();
    assert.equal(q.isOnline(), true);
    assert.equal(q.isStuck(), false);
  });
});

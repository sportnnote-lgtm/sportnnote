import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResultHold, formatHold, withPending, withoutPending, parsePending, RESULT_HOLD_MS } from '../src/data/resultHold.ts';

// Fake clock: timers fire only when advance() passes their due time.
function fakeTimers() {
  let t = 1_000;
  let id = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    set: (fn: () => void, ms: number) => { due.set(++id, { at: t + ms, fn }); return id; },
    clear: (h: unknown) => { due.delete(h as number); },
    advance(ms: number) {
      t += ms;
      for (const [k, v] of [...due]) if (v.at <= t) { due.delete(k); v.fn(); }
    },
    pending: () => due.size,
  };
}

test('SD-111: the held result goes out once, when the 60 s run out', () => {
  const tm = fakeTimers();
  let sent = 0;
  const h = createResultHold(() => { sent++; }, tm);
  h.arm();
  assert.equal(h.sendsAt(), 1_000 + RESULT_HOLD_MS);
  tm.advance(59_000);
  assert.equal(sent, 0);
  tm.advance(1_000);
  assert.equal(sent, 1);
  assert.equal(h.sendsAt(), null);
  tm.advance(120_000);
  assert.equal(sent, 1);
});

test('SD-111: Undo inside the window cancels — nothing is ever sent', () => {
  const tm = fakeTimers();
  let sent = 0;
  const h = createResultHold(() => { sent++; }, tm);
  h.arm();
  tm.advance(30_000);
  h.pause(); // undo in flight
  tm.advance(40_000); // the clock does not run out during the undo
  assert.equal(sent, 0);
  h.cancel(); // the board is no longer decided
  tm.advance(120_000);
  assert.equal(sent, 0);
  assert.equal(h.sendsAt(), null);
  assert.equal(tm.pending(), 0);
});

test('SD-111: an undo that leaves the match decided resumes the same deadline', () => {
  const tm = fakeTimers();
  let sent = 0;
  const h = createResultHold(() => { sent++; }, tm);
  h.arm();
  const at = h.sendsAt();
  tm.advance(20_000);
  h.pause();
  tm.advance(5_000);
  h.resume();
  assert.equal(h.sendsAt(), at);
  tm.advance(34_999);
  assert.equal(sent, 0);
  tm.advance(1);
  assert.equal(sent, 1);
});

test('SD-111: arming again keeps the first deadline (no endless hold)', () => {
  const tm = fakeTimers();
  const h = createResultHold(() => {}, tm);
  h.arm();
  const at = h.sendsAt();
  tm.advance(10_000);
  h.arm();
  assert.equal(h.sendsAt(), at);
});

test('SD-111: leaving the screen / backgrounding sends at once; nothing held → no send', () => {
  const tm = fakeTimers();
  let sent = 0;
  const h = createResultHold(() => { sent++; }, tm);
  assert.equal(h.sendNow(), false);
  h.arm();
  assert.equal(h.sendNow(), true);
  assert.equal(sent, 1);
  tm.advance(RESULT_HOLD_MS);
  assert.equal(sent, 1); // the timer was cleared — no double send
});

test('SD-111: subscribers hear arm / cancel / send', () => {
  const tm = fakeTimers();
  const seen: (number | null)[] = [];
  const h = createResultHold(() => {}, tm);
  h.subscribe(() => seen.push(h.sendsAt()));
  h.arm(); h.cancel(); h.arm(); h.sendNow();
  assert.equal(seen.length, 4);
  assert.equal(seen[1], null);
  assert.equal(seen[3], null);
});

test('SD-111: countdown text', () => {
  assert.equal(formatHold(58_200), '0:59');
  assert.equal(formatHold(58_000), '0:58');
  assert.equal(formatHold(60_000), '1:00');
  assert.equal(formatHold(-5), '0:00');
});

test('SD-111: pending records — one per match, survive a round trip, junk dropped', () => {
  const a = { matchId: 'm1', sport: 'tennis', sendsAt: 1 };
  const b = { matchId: 'm2', sport: 'football', sendsAt: 2, homeTeamName: 'RED' };
  let l = withPending([], a);
  l = withPending(l, b);
  l = withPending(l, { ...a, sendsAt: 9 });
  assert.deepEqual(l.map((r) => [r.matchId, r.sendsAt]), [['m2', 2], ['m1', 9]]);
  assert.deepEqual(parsePending(JSON.stringify(l)), l);
  assert.deepEqual(withoutPending(l, 'm2').map((r) => r.matchId), ['m1']);
  assert.deepEqual(parsePending('not json'), []);
  assert.deepEqual(parsePending(JSON.stringify([{ nope: 1 }, a])), [a]);
  assert.deepEqual(parsePending(null), []);
});

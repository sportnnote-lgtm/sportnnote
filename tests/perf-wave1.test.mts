/** Perf audit wave 1 (docs/perf/audit.md): the getMyPlayerId memo (F-10), the
 *  auth-event rules (F-05/F-06/F-07), the reminder gather/batching/timing
 *  (F-08a–d) and the shared tournaments read (F-09). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerIdMemo } from '../src/data/myPlayerIdMemo.ts';
import { planAuthEvent, profileFromSession, confirmedLoginEmail } from '../src/core/authEvents.ts';
import { gatherReminderInputsWith, startReminderTicker, type ReminderReads, type TickerTimers } from '../src/data/reminderInputs.ts';
import { shareInflight } from '../src/data/shareInflight.ts';

const deferred = <T,>() => { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

describe('getMyPlayerId memo (F-10)', () => {
  test('one read per profile; later calls are served from memory', async () => {
    const m = createPlayerIdMemo(); let reads = 0;
    const load = async () => { reads++; return 'pl-1'; };
    assert.equal(await m.get('prof-a', load), 'pl-1');
    assert.equal(await m.get('prof-a', load), 'pl-1');
    assert.equal(reads, 1);
  });
  test('concurrent callers share one in-flight read', async () => {
    const m = createPlayerIdMemo(); let reads = 0; const d = deferred<string | null>();
    const load = () => { reads++; return d.promise; };
    const a = m.get('p', load), b = m.get('p', load);
    d.resolve('pl-9');
    assert.deepEqual(await Promise.all([a, b]), ['pl-9', 'pl-9']);
    assert.equal(reads, 1);
  });
  test('another profile (account switch) never gets the old id', async () => {
    const m = createPlayerIdMemo();
    await m.get('alice', async () => 'pl-alice');
    assert.equal(await m.get('bob', async () => 'pl-bob'), 'pl-bob');
    assert.equal(await m.get('bob', async () => 'WRONG'), 'pl-bob');
  });
  test('clear() (sign-out) forces a fresh read', async () => {
    const m = createPlayerIdMemo();
    await m.get('p', async () => 'old');
    m.clear();
    assert.equal(await m.get('p', async () => 'new'), 'new');
  });
  test('a read in flight when cleared cannot write back a stale id', async () => {
    const m = createPlayerIdMemo(); const d = deferred<string | null>();
    const pending = m.get('p', () => d.promise);
    m.clear();
    d.resolve('stale');
    assert.equal(await pending, 'stale'); // its own caller still gets an answer
    assert.equal(await m.get('p', async () => 'fresh'), 'fresh');
  });
  test('"no player yet" is not cached — a player created later is found', async () => {
    const m = createPlayerIdMemo();
    assert.equal(await m.get('p', async () => null), null);
    assert.equal(await m.get('p', async () => 'created-elsewhere'), 'created-elsewhere');
  });
  test('a failed read is not cached', async () => {
    const m = createPlayerIdMemo();
    await assert.rejects(m.get('p', async () => { throw new Error('offline'); }));
    assert.equal(await m.get('p', async () => 'pl'), 'pl');
  });
  test('set() after create/claim wins over an older in-flight read', async () => {
    const m = createPlayerIdMemo(); const d = deferred<string | null>();
    const pending = m.get('p', () => d.promise);
    m.set('p', 'claimed');
    d.resolve(null);
    await pending;
    assert.equal(await m.get('p', async () => 'WRONG'), 'claimed');
  });
});

describe('auth events (F-07): spinner only when there is no profile yet', () => {
  const none = { userId: null, hasProfile: false, loadingProfile: false };
  const shown = { userId: 'u1', hasProfile: true, loadingProfile: false };
  test('no session → signed out, whatever the event', () => {
    for (const e of ['SIGNED_OUT', 'INITIAL_SESSION', 'TOKEN_REFRESHED']) assert.equal(planAuthEvent(e, null, shown), 'signed-out');
  });
  test('first user / launch → load (blocking)', () => {
    assert.equal(planAuthEvent('INITIAL_SESSION', 'u1', none), 'switch');
    assert.equal(planAuthEvent('BOOT', 'u1', none), 'switch');
    assert.equal(planAuthEvent('SIGNED_IN', 'u1', none), 'switch');
  });
  test('a different user (account switch) → reload for them', () => {
    assert.equal(planAuthEvent('SIGNED_IN', 'u2', shown), 'switch');
    assert.equal(planAuthEvent('TOKEN_REFRESHED', 'u2', shown), 'switch');
  });
  test('duplicate start-up events while the first load runs are ignored', () => {
    const loading = { userId: 'u1', hasProfile: false, loadingProfile: true };
    assert.equal(planAuthEvent('INITIAL_SESSION', 'u1', loading), 'ignore');
    assert.equal(planAuthEvent('SIGNED_IN', 'u1', loading), 'ignore');
  });
  test('hourly TOKEN_REFRESHED / INITIAL_SESSION never reload a shown profile (minimise keeps place)', () => {
    assert.equal(planAuthEvent('TOKEN_REFRESHED', 'u1', shown), 'ignore');
    assert.equal(planAuthEvent('INITIAL_SESSION', 'u1', shown), 'ignore');
    assert.equal(planAuthEvent('MFA_CHALLENGE_VERIFIED', 'u1', shown), 'ignore');
  });
  test('web tab visible again (SIGNED_IN, same user) → silent refresh, no spinner', () => {
    assert.equal(planAuthEvent('SIGNED_IN', 'u1', shown), 'silent');
    assert.equal(planAuthEvent('USER_UPDATED', 'u1', shown), 'silent');
    assert.equal(planAuthEvent('PASSWORD_RECOVERY', 'u1', shown), 'silent');
  });
  test('same user but the profile never loaded → try again (blocking)', () => {
    assert.equal(planAuthEvent('TOKEN_REFRESHED', 'u1', { userId: 'u1', hasProfile: false, loadingProfile: false }), 'retry');
  });
});

describe('profile from session metadata (F-05) and the login email (F-06)', () => {
  test('name + role from sign-up metadata', () => {
    assert.deepEqual(profileFromSession({ id: 'u', user_metadata: { full_name: ' Asha Rao ', role: 'scorer' } }), { id: 'u', fullName: 'Asha Rao', handle: '', role: 'scorer' });
  });
  test('missing or unknown role/name → wait for profiles (null)', () => {
    assert.equal(profileFromSession({ id: 'u', user_metadata: { full_name: 'A' } }), null);
    assert.equal(profileFromSession({ id: 'u', user_metadata: { full_name: 'A', role: 'admin' } }), null);
    assert.equal(profileFromSession({ id: 'u', user_metadata: { role: 'player' } }), null);
    assert.equal(profileFromSession({ id: 'u', user_metadata: null }), null);
    assert.equal(profileFromSession(null), null);
  });
  test('confirmed login email comes from the session; placeholder / unconfirmed skipped', () => {
    assert.equal(confirmedLoginEmail({ id: 'u', email: 'a@b.in', email_confirmed_at: '2026-01-01' }), 'a@b.in');
    assert.equal(confirmedLoginEmail({ id: 'u', email: 'a@b.in', email_confirmed_at: null }), null);
    assert.equal(confirmedLoginEmail({ id: 'u', email: '919876543210@phone.sportnnote.in', email_confirmed_at: '2026-01-01' }), null);
    assert.equal(confirmedLoginEmail({ id: 'u' }), null);
  });
});

// ---- reminders -------------------------------------------------------------
const NOW = Date.parse('2026-10-12T10:00:00Z');
const at = (h: number) => new Date(NOW + h * 3600_000).toISOString();
const team = (id: string) => ({ id, name: `Team ${id}`, shortName: id.toUpperCase(), sport: 'football', colorHex: '#000', roster: [`${id}-p1`] });
const match = (id: string, h: number, status: string, home = 'a', away = 'b') =>
  ({ id, sport: 'football', status, startsAt: at(h), homeTeam: team(home), awayTeam: team(away), hostIds: ['host-1'] }) as never;

function fakeReads(matches: unknown[]) {
  const calls = { leaders: [] as string[][], squads: [] as string[][], players: 0, upcoming: 0 };
  const reads: ReminderReads = {
    upcomingMatches: async () => { calls.upcoming++; return matches as never; },
    tournaments: async () => [],
    organizations: async () => [],
    teamLeaders: async (ids) => { calls.leaders.push(ids); return Object.fromEntries(ids.map((i) => [i, { captainId: `${i}-cap` }])); },
    matchSquads: async (ids) => { calls.squads.push(ids); return Object.fromEntries(ids.map((i) => [i, { home: { starters: [], subs: [] }, away: { starters: [], subs: [] } }])); },
    players: async () => { calls.players++; return [{ id: 'a-p1', fullName: 'Ann' }] as never; },
    followedPlayerIds: () => new Set(['a-p1']),
  };
  return { reads, calls };
}

describe('reminder gather (F-08a/c/d)', () => {
  test('captains and squads are ONE batched read each, for future scheduled matches only', async () => {
    const { reads, calls } = fakeReads([
      match('m1', 2, 'scheduled', 'a', 'b'),
      match('m2', 5, 'scheduled', 'a', 'c'),   // team a again — deduped
      match('m3', 3, 'postponed', 'd', 'e'),   // not "scheduled": no prep reads
      match('m0', -1, 'scheduled', 'f', 'g'),  // already started (server clock skew) — dropped
    ]);
    const g = await gatherReminderInputsWith(reads, NOW);
    assert.equal(calls.leaders.length, 1);
    assert.deepEqual([...calls.leaders[0]].sort(), ['a', 'b', 'c']);
    assert.equal(calls.squads.length, 1);
    assert.deepEqual(calls.squads[0], ['m1', 'm2']);
    assert.deepEqual(g.matches.map((m) => m.id), ['m1', 'm2', 'm3']);
    assert.equal(g.leadersByTeam.a.captainId, 'a-cap');
    assert.equal(g.playerNameById['a-p1'], 'Ann');
    assert.ok(g.followedPlayerIds.has('a-p1'));
  });
  test('no upcoming matches → no leader/squad reads at all', async () => {
    const { reads, calls } = fakeReads([]);
    await gatherReminderInputsWith(reads, NOW);
    assert.equal(calls.leaders.length + calls.squads.length, 0);
    assert.equal(calls.players, 1);
  });
});

function fakeTimers() {
  let t = 0; const q: { at: number; fn: () => void; every?: number; id: number }[] = []; let id = 0;
  const timers: TickerTimers = {
    setTimeout: (fn, ms) => { q.push({ at: t + ms, fn, id: ++id }); return id; },
    clearTimeout: (h) => { const i = q.findIndex((x) => x.id === h); if (i >= 0) q.splice(i, 1); },
    setInterval: (fn, ms) => { q.push({ at: t + ms, fn, every: ms, id: ++id }); return id; },
    clearInterval: (h) => { const i = q.findIndex((x) => x.id === h); if (i >= 0) q.splice(i, 1); },
  };
  const advance = async (ms: number) => {
    const end = t + ms;
    for (;;) {
      q.sort((a, b) => a.at - b.at);
      const next = q[0];
      if (!next || next.at > end) break;
      t = next.at;
      if (next.every) next.at += next.every; else q.shift();
      next.fn();
      await new Promise((r) => setImmediate(r));
    }
    t = end;
  };
  return { timers, advance, pending: () => q.length };
}

describe('reminder ticker (F-08a/b/e): delayed first tick, every 5 min, on return, no overlap', () => {
  test('first tick after the delay (not at launch), then every 5 minutes', async () => {
    const f = fakeTimers(); let ticks = 0;
    const { stop } = startReminderTicker(async () => { ticks++; }, { firstDelayMs: 10_000, intervalMs: 300_000, timers: f.timers });
    await f.advance(9_999); assert.equal(ticks, 0);
    await f.advance(1); assert.equal(ticks, 1);
    await f.advance(230_000); assert.equal(ticks, 1); // 4 min — no 60 s tick any more
    await f.advance(60_000); assert.equal(ticks, 2); // t = 5 min
    await f.advance(300_000); assert.equal(ticks, 3); // t = 10 min
    stop();
    await f.advance(3_600_000); assert.equal(ticks, 3);
    assert.equal(f.pending(), 0);
  });
  test('returning to the app checks again — not before the launch run, not twice within a minute', async () => {
    const f = fakeTimers(); let ticks = 0; let clock = 0;
    const tk = startReminderTicker(async () => { ticks++; }, { firstDelayMs: 10_000, intervalMs: 300_000, minGapMs: 60_000, timers: f.timers, now: () => clock });
    tk.kick(); assert.equal(ticks, 0); // the delayed launch run covers opening the app
    await f.advance(10_000); clock = 10_000; assert.equal(ticks, 1);
    clock = 40_000; tk.kick(); await new Promise((r) => setImmediate(r)); assert.equal(ticks, 1); // < 1 min since
    clock = 130_000; tk.kick(); await new Promise((r) => setImmediate(r)); assert.equal(ticks, 2);
    tk.stop(); clock = 999_999; tk.kick(); assert.equal(ticks, 2);
  });
  test('a slow tick is never overlapped; a failing tick does not stop the engine', async () => {
    const f = fakeTimers(); let ticks = 0; let running = 0; let maxRunning = 0;
    const slow = deferred<void>();
    const { stop } = startReminderTicker(async () => {
      ticks++; running++; maxRunning = Math.max(maxRunning, running);
      try { if (ticks === 1) await slow.promise; if (ticks === 2) throw new Error('offline'); } finally { running--; }
    }, { firstDelayMs: 10_000, intervalMs: 60_000, timers: f.timers });
    await f.advance(60_000); // first tick still running at 60 s → skipped
    assert.equal(ticks, 1);
    slow.resolve(); await new Promise((r) => setImmediate(r));
    await f.advance(60_000); assert.equal(ticks, 2); // throws
    await f.advance(60_000); assert.equal(ticks, 3); // still ticking
    assert.equal(maxRunning, 1);
    stop();
  });
  test('stopped before the first tick (sign-out / account switch) → nothing runs', async () => {
    const f = fakeTimers(); let ticks = 0;
    const { stop } = startReminderTicker(async () => { ticks++; }, { firstDelayMs: 10_000, intervalMs: 60_000, timers: f.timers });
    stop();
    await f.advance(200_000);
    assert.equal(ticks, 0);
  });
});

describe('shared tournaments read (F-09)', () => {
  test('calls starting together share one read; later calls read afresh', async () => {
    let t = 0; let reads = 0;
    const read = shareInflight(async () => { reads++; return reads; }, 50, () => t);
    const [a, b] = await Promise.all([read(), read()]);
    assert.equal(reads, 1); assert.equal(a, b);
    t = 10; assert.equal(await read(), 2); // finished → fresh read
    assert.equal(reads, 2);
  });
  test('a read still in flight is shared only inside the window', async () => {
    let t = 0; let reads = 0; const d = deferred<number>();
    const read = shareInflight(() => { reads++; return reads === 1 ? d.promise : Promise.resolve(99); }, 50, () => t);
    const first = read();
    t = 49; const second = read();
    t = 50; const third = read();
    d.resolve(1);
    assert.deepEqual(await Promise.all([first, second, third]), [1, 1, 99]);
    assert.equal(reads, 2);
  });
});

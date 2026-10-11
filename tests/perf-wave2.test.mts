/** Perf audit wave 2 (docs/perf/audit.md): the short-lived read cache and its
 *  write-aware fetch (F-19), and edge-function region pinning abroad (F-22).
 *  The SQL side (home_feed, push_allowed_targets, phone_login_lookup_account,
 *  players_view) is proven old == new in the PGlite harness — see DEVLOG. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createReadCache, isWriteRequest, writeAwareFetch, READ_CACHE_TTL_MS } from '../src/data/readCache.ts';
import { outsideIndia, regionalFunctionPath, PINNED_FUNCTIONS } from '../src/core/functionRegion.ts';

const deferred = <T,>() => { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

describe('read cache (F-19)', () => {
  test('a second read within the TTL is served from memory', async () => {
    let t = 0; const c = createReadCache(10_000, () => t); let reads = 0;
    const load = async () => { reads++; return [1, 2]; };
    assert.deepEqual(await c.get('k', load), [1, 2]);
    t = 9_999;
    assert.deepEqual(await c.get('k', load), [1, 2]);
    assert.equal(reads, 1);
  });
  test('after the TTL (counted from when the read started) it reads again', async () => {
    let t = 0; const c = createReadCache(10_000, () => t); let reads = 0;
    const load = async () => ++reads;
    await c.get('k', load);
    t = 10_000;
    assert.equal(await c.get('k', load), 2);
  });
  test('concurrent callers share one read', async () => {
    const c = createReadCache(); const d = deferred<string>(); let reads = 0;
    const a = c.get('k', () => { reads++; return d.promise; });
    const b = c.get('k', () => { reads++; return d.promise; });
    d.resolve('x');
    assert.deepEqual(await Promise.all([a, b]), ['x', 'x']);
    assert.equal(reads, 1);
  });
  test('keys are separate', async () => {
    const c = createReadCache();
    assert.equal(await c.get('a', async () => 'A'), 'A');
    assert.equal(await c.get('b', async () => 'B'), 'B');
  });
  test('a write (invalidate) forces the next read to the server', async () => {
    const c = createReadCache(); let v = 'old';
    await c.get('k', async () => v);
    v = 'new'; c.invalidate();
    assert.equal(await c.get('k', async () => v), 'new');
  });
  test('a read in flight during a write is not stored, and later callers do not join it', async () => {
    const c = createReadCache(); const d = deferred<string>();
    const pending = c.get('k', () => d.promise);
    c.invalidate();
    let fresh = 0;
    const after = c.get('k', async () => { fresh++; return 'fresh'; });
    d.resolve('stale');
    assert.equal(await pending, 'stale'); // its own caller still gets an answer
    assert.equal(await after, 'fresh');
    assert.equal(await c.get('k', async () => 'WRONG'), 'fresh');
    assert.equal(fresh, 1);
  });
  test('a failed read is not cached', async () => {
    const c = createReadCache();
    await assert.rejects(c.get('k', async () => { throw new Error('offline'); }));
    assert.equal(await c.get('k', async () => 'ok'), 'ok');
  });
  test('the TTL is seconds, not minutes', () => {
    assert.ok(READ_CACHE_TTL_MS > 0 && READ_CACHE_TTL_MS <= 15_000);
  });
});

describe('write-aware fetch (F-19)', () => {
  const REST = 'https://x.supabase.co/rest/v1';
  test('reads are not writes; everything else is', () => {
    for (const m of ['GET', 'get', 'HEAD', 'OPTIONS', undefined]) assert.equal(isWriteRequest(m, `${REST}/matches`), false);
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) assert.equal(isWriteRequest(m, `${REST}/matches`), true);
    assert.equal(isWriteRequest('POST', `${REST}/rpc/set_match_state`), true);
    assert.equal(isWriteRequest('POST', 'https://x.supabase.co/functions/v1/send-invite'), true);
    assert.equal(isWriteRequest('POST', 'https://x.supabase.co/storage/v1/object/media/a.png'), true);
    assert.equal(isWriteRequest('POST', 'https://x.supabase.co/auth/v1/token?grant_type=refresh_token'), true);
    assert.equal(isWriteRequest('GET', `${REST}/rpc/home_feed`), false);
  });
  test('analytics posts do not empty the cache', () => {
    assert.equal(isWriteRequest('POST', `${REST}/rpc/track_events`), false);
    assert.equal(isWriteRequest('POST', `${REST}/rpc/report_client_error`), false);
    assert.equal(isWriteRequest('POST', `${REST}/rpc/track_events_extra`), true);
  });
  test('a write empties the cache before it is sent and after it finishes', async () => {
    const log: string[] = [];
    const f = writeAwareFetch(async (url: string) => { log.push(`send ${url}`); return 'res'; }, () => log.push('clear'));
    assert.equal(await f(`${REST}/matches`, { method: 'PATCH' }), 'res');
    assert.deepEqual(log, ['clear', `send ${REST}/matches`, 'clear']);
  });
  test('…even when the write fails', async () => {
    let clears = 0;
    const f = writeAwareFetch(async () => { throw new Error('offline'); }, () => clears++);
    await assert.rejects(f(`${REST}/matches`, { method: 'POST' }));
    assert.equal(clears, 2);
  });
  test('reads pass straight through', async () => {
    let clears = 0;
    const f = writeAwareFetch(async () => 'rows', () => clears++);
    assert.equal(await f(`${REST}/matches?select=*`), 'rows');
    assert.equal(await f(new URL(`${REST}/matches`)), 'rows');
    assert.equal(clears, 0);
  });
  test('Request-like inputs use their own method', async () => {
    let clears = 0;
    const f = writeAwareFetch(async () => 'ok', () => clears++);
    await f({ url: `${REST}/matches`, method: 'DELETE' });
    assert.equal(clears, 2);
  });
  test('end to end: a cached read, a write, then the read is fresh', async () => {
    const c = createReadCache(); let server = 'v1';
    const f = writeAwareFetch(async (_u: string, init?: { method?: string }) => { if (init?.method === 'PATCH') server = 'v2'; return server; }, () => c.invalidate());
    const read = () => c.get('matches', () => f(`${REST}/matches`));
    assert.equal(await read(), 'v1');
    await f(`${REST}/matches?id=eq.1`, { method: 'PATCH' });
    assert.equal(await read(), 'v2');
  });
});

describe('edge-function region pinning abroad (F-22)', () => {
  test('India is unchanged', () => {
    assert.equal(outsideIndia({ savedCountry: 'IN', deviceZone: 'Europe/London', country: 'IN' }), false);
    assert.equal(outsideIndia({ deviceZone: 'Asia/Kolkata', country: 'IN' }), false);
    assert.equal(outsideIndia({ deviceZone: 'Asia/Calcutta', country: 'IN' }), false);
    assert.equal(outsideIndia({ country: 'IN' }), false);
    assert.equal(regionalFunctionPath('phone-login', false), 'phone-login');
  });
  test('abroad: saved country, else device zone, else the region in force', () => {
    assert.equal(outsideIndia({ savedCountry: 'GB', deviceZone: 'Asia/Kolkata', country: 'GB' }), true);
    assert.equal(outsideIndia({ deviceZone: 'Asia/Dubai', country: 'AE' }), true);
    assert.equal(outsideIndia({ deviceZone: 'Europe/Berlin', country: 'IN' }), true); // unmapped zone: not India
    assert.equal(outsideIndia({ country: 'US' }), true);
  });
  test('pinned with the query parameter only (no x-region header → no CORS preflight change)', () => {
    assert.equal(regionalFunctionPath('phone-login', true), 'phone-login?forceFunctionRegion=ap-south-1');
    assert.equal(regionalFunctionPath('join?p=abc&format=json', true), 'join?p=abc&format=json&forceFunctionRegion=ap-south-1');
  });
  test('push senders are never pinned (they call global push services)', () => {
    for (const f of ['push-send', 'message-notify']) {
      assert.equal(PINNED_FUNCTIONS.has(f), false);
      assert.equal(regionalFunctionPath(f, true), f);
    }
  });
  test('every database-heavy function the app invokes goes through fnPath', () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
    walk(join(import.meta.dirname, '..', 'src'));
    const bare: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/functions\.invoke\(\s*'([a-z-]+)'/g)) {
        if (m[1] !== 'push-send' && m[1] !== 'message-notify') bare.push(`${f}: ${m[1]}`);
      }
    }
    assert.deepEqual(bare, []);
    // and the pinned list covers every function the app calls through fnPath
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/fnPath\(\s*[`']([a-z-]+)/g)) assert.ok(PINNED_FUNCTIONS.has(m[1]), m[1]);
    }
  });
});

describe('wave 2 migration', () => {
  const dir = join(import.meta.dirname, '..', 'supabase', 'migrations');
  const mig = readdirSync(dir).find((f) => f.includes('perf_wave2'));
  test('one migration, after the wave 1 one', () => {
    assert.ok(mig && mig > '20261022100000');
  });
  test('home_feed is security invoker; the definer functions keep a fixed search_path', () => {
    const sql = readFileSync(join(dir, mig!), 'utf8');
    assert.match(sql, /function home_feed\(\)\s+returns jsonb language sql stable security invoker/);
    for (const fn of ['phone_login_lookup_account', 'push_allowed_targets', 'my_roster_editable_team_ids']) {
      assert.match(sql, new RegExp(`function ${fn}\\([^)]*\\)[\\s\\S]{0,200}security definer set search_path = public`), fn);
    }
    assert.match(sql, /revoke all on function phone_login_lookup_account\(text\) from public, anon, authenticated/);
    assert.match(sql, /players_view with \(security_barrier = true\)/);
  });
});

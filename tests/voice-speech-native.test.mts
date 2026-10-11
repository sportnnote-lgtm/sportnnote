/**
 * SD-137b — real speech input on phones: the expo-speech-recognition adapter
 * (mocked module). Permission rationale + denial, interim → final, en-IN → en-US
 * fallback, no recognizer / error → typed fallback, hands-free restart, silence
 * stop, tap stop — and a spoken ending call is still gated (SD-137a).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeSpeechAdapter, SPEECH_MSG, MIC_RATIONALE, type SpeechModuleLike } from '../src/core/speechNative.ts';
import { voiceEnding, voiceRoute } from '../src/sports/voiceMatch.ts';
import { hockeyVoice, hockeyVoiceEnds } from '../src/sports/voiceParsers.ts';
import * as hockey from '../src/sports/hockey/engine.ts';
import type { Player } from '../src/core/types.ts';

type Perm = { granted: boolean; canAskAgain?: boolean };
function mockModule(o: { perm?: Perm; afterRequest?: Perm; available?: boolean; onDevice?: boolean; installed?: string[] } = {}) {
  const listeners: Record<string, ((e: any) => void)[]> = {};
  const calls = { start: [] as Record<string, unknown>[], stop: 0, abort: 0, request: 0 };
  let perm = o.perm ?? { granted: true };
  const mod: SpeechModuleLike = {
    start: (opts) => { calls.start.push(opts); },
    stop: () => { calls.stop++; },
    abort: () => { calls.abort++; },
    addListener: (ev, fn) => {
      (listeners[ev] ??= []).push(fn);
      return { remove: () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); } };
    },
    getPermissionsAsync: async () => perm,
    requestPermissionsAsync: async () => { calls.request++; perm = o.afterRequest ?? { granted: true }; return perm; },
    isRecognitionAvailable: () => o.available ?? true,
    supportsOnDeviceRecognition: () => o.onDevice ?? false,
    getSupportedLocales: async () => ({ locales: ['en-IN', 'en-US'], installedLocales: o.installed ?? [] }),
  };
  const emit = (ev: string, e: any = {}) => (listeners[ev] ?? []).slice().forEach((f) => f(e));
  const count = (ev: string) => (listeners[ev] ?? []).length;
  return { mod, calls, emit, count };
}
function sink() {
  const out = { results: [] as [string, number | undefined][], interim: [] as string[], ended: [] as (string | undefined)[] };
  return {
    out,
    cb: {
      onResult: (t: string, c?: number) => { out.results.push([t, c]); },
      onInterim: (t: string) => { out.interim.push(t); },
      onEnd: (m?: string) => { out.ended.push(m); },
    },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const noTimer = { setTimer: () => 0, clearTimer: () => {} };

describe('permission', () => {
  test('first use: rationale, then the system prompt, then listening', async () => {
    const m = mockModule({ perm: { granted: false, canAskAgain: true } });
    const asked: string[] = [];
    const s = sink();
    createNativeSpeechAdapter(m.mod, { ...noTimer, explain: async (msg) => { asked.push(msg); return true; } })(s.cb);
    await tick(); await tick();
    assert.deepEqual(asked, [MIC_RATIONALE]);
    assert.match(MIC_RATIONALE, /never records or uploads/);
    assert.equal(m.calls.request, 1);
    assert.equal(m.calls.start.length, 1);
    assert.equal(m.calls.start[0].lang, 'en-IN');
    assert.equal(m.calls.start[0].interimResults, true);
    assert.deepEqual(m.calls.start[0].recordingOptions, { persist: false });
    assert.deepEqual(s.out.ended, []);
  });

  test('denied at the system prompt → explain, typed fallback, no listening', async () => {
    const m = mockModule({ perm: { granted: false, canAskAgain: true }, afterRequest: { granted: false, canAskAgain: false } });
    const s = sink();
    createNativeSpeechAdapter(m.mod, { ...noTimer, explain: async () => true })(s.cb);
    await tick(); await tick();
    assert.equal(m.calls.start.length, 0);
    assert.deepEqual(s.out.ended, [SPEECH_MSG.denied]);
    assert.match(SPEECH_MSG.denied, /type calls below/);
    assert.equal(m.count('result') + m.count('error') + m.count('end'), 0, 'listeners removed');
  });

  test('blocked for good (can’t ask again) → no prompt, explain Settings', async () => {
    const m = mockModule({ perm: { granted: false, canAskAgain: false } });
    const s = sink();
    let explained = false;
    createNativeSpeechAdapter(m.mod, { ...noTimer, explain: async () => { explained = true; return true; } })(s.cb);
    await tick();
    assert.equal(explained, false);
    assert.equal(m.calls.request, 0);
    assert.deepEqual(s.out.ended, [SPEECH_MSG.denied]);
    assert.match(SPEECH_MSG.denied, /Settings/);
  });

  test('“Not now” on the rationale → no system prompt, typed fallback', async () => {
    const m = mockModule({ perm: { granted: false, canAskAgain: true } });
    const s = sink();
    createNativeSpeechAdapter(m.mod, { ...noTimer, explain: async () => false })(s.cb);
    await tick(); await tick();
    assert.equal(m.calls.request, 0);
    assert.equal(m.calls.start.length, 0);
    assert.deepEqual(s.out.ended, [SPEECH_MSG.notNow]);
  });
});

describe('listening', () => {
  test('interim words stream, the final phrase is handed over with its confidence', async () => {
    const m = mockModule();
    const s = sink();
    createNativeSpeechAdapter(m.mod, noTimer)(s.cb);
    await tick();
    m.emit('result', { isFinal: false, results: [{ transcript: 'goal', confidence: 0 }] });
    m.emit('result', { isFinal: false, results: [{ transcript: 'goal Rao', confidence: 0 }] });
    m.emit('result', { isFinal: true, results: [{ transcript: ' goal Rao ', confidence: 0.91 }] });
    assert.deepEqual(s.out.interim.filter(Boolean), ['goal', 'goal Rao']);
    assert.equal(s.out.interim.at(-1), '', 'interim cleared on the final');
    assert.deepEqual(s.out.results, [['goal Rao', 0.91]]);
  });

  test('unknown confidence (-1 / 0) is passed as undefined (trusted, like the web)', async () => {
    const m = mockModule();
    const s = sink();
    createNativeSpeechAdapter(m.mod, noTimer)(s.cb);
    await tick();
    m.emit('result', { isFinal: true, results: [{ transcript: 'four', confidence: -1 }] });
    assert.deepEqual(s.out.results, [['four', undefined]]);
  });

  test('hands-free: a session that ends (silence after a call / no-speech) starts again', async () => {
    const m = mockModule();
    const s = sink();
    createNativeSpeechAdapter(m.mod, noTimer)(s.cb);
    await tick();
    m.emit('error', { error: 'no-speech' });
    m.emit('end');
    assert.equal(m.calls.start.length, 2);
    assert.deepEqual(s.out.ended, []);
  });

  test('en-IN not on this phone → en-US', async () => {
    const m = mockModule();
    const s = sink();
    createNativeSpeechAdapter(m.mod, noTimer)(s.cb);
    await tick();
    m.emit('error', { error: 'language-not-supported' });
    m.emit('end');
    assert.equal(m.calls.start[1].lang, 'en-US');
    assert.deepEqual(s.out.ended, []);
  });

  test('on-device when the model is installed (Android); drops to the phone’s service if it fails', async () => {
    const m = mockModule({ onDevice: true, installed: ['en-IN'] });
    const s = sink();
    createNativeSpeechAdapter(m.mod, { ...noTimer, os: 'android' })(s.cb);
    await tick(); await tick();
    assert.equal(m.calls.start[0].requiresOnDeviceRecognition, true);
    m.emit('error', { error: 'service-not-allowed' });
    m.emit('end');
    assert.equal(m.calls.start[1].requiresOnDeviceRecognition, false);
    assert.equal(m.calls.start[1].lang, 'en-IN');
    const m2 = mockModule({ onDevice: true, installed: [] });
    createNativeSpeechAdapter(m2.mod, { ...noTimer, os: 'android' })(sink().cb);
    await tick(); await tick();
    assert.equal(m2.calls.start[0].requiresOnDeviceRecognition, false, 'no model → not on-device');
  });

  test('silence for the timeout → stops by itself and says so', async () => {
    const m = mockModule();
    const s = sink();
    let fire: (() => void) | null = null;
    createNativeSpeechAdapter(m.mod, { setTimer: (fn) => { fire = fn; return 1; }, clearTimer: () => { fire = null; } })(s.cb);
    await tick();
    assert.ok(fire);
    (fire as unknown as () => void)();
    assert.deepEqual(s.out.ended, [SPEECH_MSG.silence]);
    assert.equal(m.calls.abort, 1);
    m.emit('end');
    assert.equal(m.calls.start.length, 1, 'no restart after stopping');
  });

  test('🛑 tap stops: recognizer aborted, listeners gone, no restart, nothing more delivered', async () => {
    const m = mockModule();
    const s = sink();
    const stop = createNativeSpeechAdapter(m.mod, noTimer)(s.cb);
    await tick();
    stop();
    assert.equal(m.calls.abort, 1);
    assert.equal(m.count('result') + m.count('error') + m.count('end'), 0);
    m.emit('result', { isFinal: true, results: [{ transcript: 'six' }] });
    assert.deepEqual(s.out.results, []);
  });

  test('stop before permission resolves → never starts the mic', async () => {
    const m = mockModule();
    const stop = createNativeSpeechAdapter(m.mod, noTimer)(sink().cb);
    stop();
    await tick(); await tick();
    assert.equal(m.calls.start.length, 0);
  });
});

describe('errors → typed fallback', () => {
  test('no recognizer on the phone', async () => {
    const m = mockModule({ available: false });
    const s = sink();
    createNativeSpeechAdapter(m.mod, noTimer)(s.cb);
    await tick();
    assert.equal(m.calls.start.length, 0);
    assert.deepEqual(s.out.ended, [SPEECH_MSG.noRecognizer]);
  });

  for (const [code, msg] of [
    ['not-allowed', SPEECH_MSG.denied], ['service-not-allowed', SPEECH_MSG.noRecognizer], ['network', SPEECH_MSG.network],
    ['audio-capture', SPEECH_MSG.busy], ['client', SPEECH_MSG.failed],
  ] as const) {
    test(`mid-session “${code}”`, async () => {
      const m = mockModule();
      const s = sink();
      createNativeSpeechAdapter(m.mod, noTimer)(s.cb);
      await tick();
      m.emit('error', { error: code });
      m.emit('end');
      assert.deepEqual(s.out.ended, [msg]);
      assert.equal(m.calls.start.length, 1, 'no restart after a hard error');
    });
  }

  test('start() throwing (module half-present) → typed fallback, no crash', async () => {
    const m = mockModule();
    m.mod.start = () => { throw new Error('boom'); };
    const s = sink();
    createNativeSpeechAdapter(m.mod, noTimer)(s.cb);
    await tick();
    assert.deepEqual(s.out.ended, [SPEECH_MSG.failed]);
  });
});

describe('a spoken ending call is still gated (SD-137a)', () => {
  const P = (id: string, fullName: string, jerseyNo?: number) => ({ id, fullName, sports: [], ...(jerseyNo ? { jerseyNo } : {}) }) as unknown as Player;
  const HOME = [P('h1', 'Asha Rao', 7)];
  const AWAY = [P('a1', 'Divya Nair', 10)];

  test('“end quarter” heard by the phone → asks in Auto mode, waits in Confirm mode; a goal applies in Auto', async () => {
    const m = mockModule();
    const heard: [string, number | undefined][] = [];
    createNativeSpeechAdapter(m.mod, noTimer)({ onResult: (t, c) => heard.push([t, c]), onInterim: () => {} });
    await tick();
    m.emit('result', { isFinal: true, results: [{ transcript: 'end quarter', confidence: 0.97 }] });
    m.emit('result', { isFinal: true, results: [{ transcript: 'goal Rao', confidence: 0.97 }] });
    assert.equal(heard.length, 2, 'the adapter only hands over text');

    let state = hockey.init({ periods: 4, periodMinutes: 15 });
    state = hockey.reducer(state, { type: 'CLOCK', payload: { run: true, at: 1_000_000 - 300_000 } });
    const voice = { parse: hockeyVoice, ends: hockeyVoiceEnds };
    const route = ([t, c]: [string, number | undefined], auto: boolean) => {
      const actions = voice.parse(t, { state, homeName: 'Red House', awayName: 'Blue House', homeRoster: HOME, awayRoster: AWAY, now: 1_000_000 });
      assert.ok(actions && actions.length, `parsed “${t}”`);
      return voiceRoute(auto, c, voiceEnding(voice, actions!, state));
    };
    assert.equal(route(heard[0], true), 'ask');
    assert.equal(route(heard[0], false), 'pending');
    assert.equal(route(heard[1], true), 'apply');
    assert.equal(route(heard[1], false), 'pending');
  });

  test('low confidence waits for a tap even in Auto mode', () => {
    assert.equal(voiceRoute(true, 0.3, null), 'pending');
    assert.equal(voiceRoute(true, 0.3, { action: 'fullTime' }), 'pending');
    assert.equal(voiceRoute(true, undefined, { action: 'fullTime' }), 'ask');
  });
});

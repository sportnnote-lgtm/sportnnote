/** SD-137b — the phone app's speech adapter around expo-speech-recognition.
 *
 *  PURE: no react-native / expo imports, so it runs under `node --test` with a
 *  mocked module. The startup wiring (speechSetup.native.ts) looks the native
 *  module up (an APK built before it was added has none → typed-only, unchanged)
 *  and passes it in here together with a rationale prompt.
 *
 *  What it does on 🎤:
 *   1. checks a recognizer exists on the phone (else: explain, fall back to typing);
 *   2. first use → a short rationale, then the system mic prompt; denied → explain;
 *   3. listens in the caller's languages (SD-151: by device region — en-GB, en-AU,
 *      en-US; Indian English en-IN by default), falling back to the next one if
 *      the phone's recognizer doesn't have it; on-device recognition when the phone has it;
 *   4. streams interim words to the panel and hands each FINAL phrase (with its
 *      confidence) to the voice panel — which parses it and runs the usual
 *      Confirm / Auto + SD-137a ending gate. This file never applies anything;
 *   5. keeps listening hands-free between calls; stops on 🛑 tap, or by itself
 *      after a stretch of silence.
 *
 *  Audio is never recorded to a file or sent anywhere by SportnNote — only the
 *  recognized text comes back. The phone's own speech service does the work
 *  (Google's on most Android phones, which may use its servers). */
import type { NativeSpeechAdapter, SpeechCallbacks } from './speech';

/** The slice of ExpoSpeechRecognitionModule this adapter uses. */
export interface SpeechModuleLike {
  start(options: Record<string, unknown>): void;
  stop(): void;
  abort?(): void;
  addListener(event: string, listener: (e: any) => void): { remove(): void };
  getPermissionsAsync(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  requestPermissionsAsync(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  isRecognitionAvailable?(): boolean;
  supportsOnDeviceRecognition?(): boolean;
  getSupportedLocales?(o: Record<string, unknown>): Promise<{ locales: string[]; installedLocales: string[] }>;
}

export interface NativeSpeechOptions {
  /** Preferred language first; the next ones are fallbacks. */
  langs?: string[];
  /** 'ios' | 'android' — decides on-device + permission behaviour. */
  os?: string;
  /** Show the "why we need the mic" note before the system prompt. Resolve
   *  true to go ahead, false if the scorer says "not now". */
  explain?: (message: string) => Promise<boolean>;
  /** Stop listening after this long without hearing anything (ms). */
  silenceStopMs?: number;
  /** Scorer-facing words for proper nouns (player surnames, team names). */
  contextualStrings?: () => string[];
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

export const MIC_RATIONALE =
  'Voice scoring listens through the microphone while 🎤 is on, so you can call the play instead of tapping. '
  + 'Only the words come back to the app — SportnNote never records or uploads your audio. '
  + 'Your phone’s speech service turns speech into text (on most Android phones that’s Google).';

export const SPEECH_MSG = {
  denied: 'Microphone is off for SportnNote — type calls below, or allow the microphone in the phone’s Settings → Apps → SportnNote → Permissions.',
  notNow: 'Voice is off — type calls below. Tap 🎤 again any time.',
  noRecognizer: 'This phone has no speech recognizer turned on — type calls below. (Android: install or enable “Speech Recognition & Synthesis” / the Google app.)',
  network: 'Speech needs a connection on this phone — type calls below, or try again when you’re online.',
  failed: 'Voice stopped — type calls below, or tap 🎤 to try again.',
  silence: 'Stopped listening after a quiet spell — tap 🎤 to start again.',
  busy: 'The microphone is busy in another app — close it and tap 🎤 again.',
} as const;

const DEFAULT_SILENCE_MS = 45_000;

/** Build the adapter that `registerNativeSpeech` takes. */
export function createNativeSpeechAdapter(mod: SpeechModuleLike, opts: NativeSpeechOptions = {}): NativeSpeechAdapter {
  const langs = opts.langs?.length ? opts.langs : ['en-IN', 'en-US'];
  const setTimer = opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const silenceMs = opts.silenceStopMs ?? DEFAULT_SILENCE_MS;
  let explained = false; // the rationale is shown once per app run (first use)

  return (cb: SpeechCallbacks) => {
    let alive = true; // false once stopped (tap, error or silence)
    let running = false; // a recognizer session is in flight
    let langIdx = 0;
    let onDevice = false;
    let heardThisSession = false;
    let idle: unknown = null;
    const subs: { remove(): void }[] = [];

    const finish = (message?: string) => {
      if (!alive) return;
      alive = false;
      if (idle != null) { clearTimer(idle); idle = null; }
      subs.splice(0).forEach((s) => { try { s.remove(); } catch { /* noop */ } });
      if (running) { try { mod.abort ? mod.abort() : mod.stop(); } catch { /* noop */ } }
      running = false;
      cb.onInterim('');
      cb.onEnd?.(message);
    };

    const armIdle = () => {
      if (idle != null) clearTimer(idle);
      idle = setTimer(() => { idle = null; finish(SPEECH_MSG.silence); }, silenceMs);
    };

    const begin = () => {
      if (!alive) return;
      heardThisSession = false;
      running = true;
      try {
        mod.start({
          lang: langs[langIdx],
          interimResults: true,
          continuous: true,
          maxAlternatives: 1,
          requiresOnDeviceRecognition: onDevice,
          addsPunctuation: false,
          contextualStrings: opts.contextualStrings?.().slice(0, 100),
          // short phrases ("four", "goal Rao") — the search model suits them
          androidIntentOptions: { EXTRA_LANGUAGE_MODEL: 'web_search' },
          iosTaskHint: 'confirmation',
          recordingOptions: { persist: false },
        });
      } catch {
        finish(SPEECH_MSG.failed);
      }
    };

    subs.push(mod.addListener('result', (e: { isFinal?: boolean; results?: { transcript?: string; confidence?: number }[] }) => {
      if (!alive) return;
      const r = e?.results?.[0];
      const t = (r?.transcript ?? '').trim();
      if (!t) return;
      heardThisSession = true;
      armIdle();
      if (e.isFinal) {
        cb.onInterim('');
        const c = typeof r?.confidence === 'number' && r.confidence > 0 ? r.confidence : undefined;
        cb.onResult(t, c);
      } else cb.onInterim(t);
    }));

    subs.push(mod.addListener('error', (e: { error?: string }) => {
      if (!alive) return;
      const code = e?.error ?? '';
      switch (code) {
        case 'aborted':
        case 'no-speech':
        case 'speech-timeout':
          return; // 'end' follows → we start again (silence timer decides when to stop)
        case 'language-not-supported':
          // phone can't do on-device / this language → try the next option
          if (onDevice) { onDevice = false; return; }
          if (!heardThisSession && langIdx < langs.length - 1) { langIdx++; return; }
          return finish(SPEECH_MSG.noRecognizer);
        case 'not-allowed':
          return finish(SPEECH_MSG.denied);
        case 'service-not-allowed':
          if (onDevice) { onDevice = false; return; }
          return finish(SPEECH_MSG.noRecognizer);
        case 'network':
          if (onDevice) { onDevice = false; return; }
          return finish(SPEECH_MSG.network);
        case 'busy':
        case 'audio-capture':
          return finish(SPEECH_MSG.busy);
        default:
          return finish(SPEECH_MSG.failed);
      }
    }));

    subs.push(mod.addListener('end', () => {
      running = false;
      if (!alive) return;
      cb.onInterim('');
      begin(); // hands-free: the next call starts listening again
    }));

    void (async () => {
      try {
        if (mod.isRecognitionAvailable && !mod.isRecognitionAvailable()) return finish(SPEECH_MSG.noRecognizer);
        let perm = await mod.getPermissionsAsync();
        if (!alive) return;
        if (!perm.granted) {
          if (perm.canAskAgain === false) return finish(SPEECH_MSG.denied);
          if (!explained && opts.explain) {
            const ok = await opts.explain(MIC_RATIONALE);
            if (!alive) return;
            if (!ok) return finish(SPEECH_MSG.notNow);
          }
          explained = true;
          perm = await mod.requestPermissionsAsync();
          if (!alive) return;
          if (!perm.granted) return finish(SPEECH_MSG.denied);
        }
        onDevice = await pickOnDevice(mod, opts.os, langs[langIdx]);
        if (!alive) return;
        armIdle();
        begin();
      } catch {
        finish(SPEECH_MSG.failed);
      }
    })();

    // 🛑 tap: stop listening; nothing pending is applied by us
    return () => {
      if (!alive) return;
      alive = false;
      if (idle != null) { clearTimer(idle); idle = null; }
      subs.splice(0).forEach((s) => { try { s.remove(); } catch { /* noop */ } });
      if (running) { try { mod.abort ? mod.abort() : mod.stop(); } catch { /* noop */ } }
      running = false;
    };
  };
}

/** On-device when the phone can do it for this language: iOS reports it
 *  directly; Android only once the language model is downloaded. */
async function pickOnDevice(mod: SpeechModuleLike, os: string | undefined, lang: string): Promise<boolean> {
  try {
    if (!mod.supportsOnDeviceRecognition?.()) return false;
    if (os === 'ios') return true;
    if (os === 'android' && mod.getSupportedLocales) {
      const l = await mod.getSupportedLocales({});
      return (l.installedLocales ?? []).some((x) => x.toLowerCase().replace('_', '-') === lang.toLowerCase());
    }
  } catch { /* fall through */ }
  return false;
}

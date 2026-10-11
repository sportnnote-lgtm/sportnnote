/** Voice input. On web it uses the Web Speech API (Chrome/Edge) directly. On
 *  native (iOS/Android) the browser API doesn't exist, so the phone app registers
 *  an adapter around expo-speech-recognition at startup (speechSetup.native.ts →
 *  speechNative.ts). An APK built before that module was added has no native side,
 *  nothing is registered, `supported` stays false and the UI falls back to typed
 *  commands. Keeping the native module out of this file's imports means web
 *  bundling and `tsc` stay clean.
 *
 *  The adapter contract: `adapter({ onResult, onInterim, onEnd })` begins
 *  listening and returns a `stop` cleanup. `onEnd(message?)` tells the hook the
 *  adapter stopped by itself (permission denied, no recognizer, silence) so the
 *  button flips back and the panel can say why. The adapter only ever delivers
 *  TEXT — parsing and the Confirm / SD-137a ending gate stay in VoiceScorer. */
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { speechLangs } from './chatRegion';

export interface SpeechHook {
  supported: boolean;
  listening: boolean;
  interim: string;
  /** why listening stopped by itself (or couldn't start) — shown in the panel */
  notice: string;
  start: () => void;
  stop: () => void;
}

export interface SpeechCallbacks {
  /** a final phrase (+ recognizer confidence 0..1 when the phone reports one) */
  onResult: (text: string, confidence?: number) => void;
  /** words heard so far in the current phrase ('' clears) */
  onInterim: (text: string) => void;
  /** the adapter stopped on its own; `message` says why (shown to the scorer) */
  onEnd?: (message?: string) => void;
}

/** A native recognizer: begin listening, return a cleanup that stops it. */
export type NativeSpeechAdapter = (cb: SpeechCallbacks) => () => void;

let nativeAdapter: NativeSpeechAdapter | null = null;
/** Called once at app startup on phones (see header). */
export function registerNativeSpeech(adapter: NativeSpeechAdapter): void {
  nativeAdapter = adapter;
}

export function useSpeech(onResult: (text: string, confidence?: number) => void): SpeechHook {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [notice, setNotice] = useState('');
  const recRef = useRef<any>(null);
  const nativeStopRef = useRef<(() => void) | null>(null);
  const wantRef = useRef(false); // whether the user wants to keep listening
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const g: any = globalThis;
  const SR = Platform.OS === 'web' ? (g.SpeechRecognition || g.webkitSpeechRecognition) : undefined;
  const supported = Platform.OS === 'web' ? !!SR : !!nativeAdapter;

  const start = () => {
    if (wantRef.current) return;
    setNotice('');
    // Native path: delegate to the registered adapter.
    if (Platform.OS !== 'web') {
      if (!nativeAdapter) return;
      wantRef.current = true;
      setListening(true);
      let ended = false;
      const stopFn = nativeAdapter({
        onResult: (t, c) => { setInterim(''); if (t.trim()) onResultRef.current(t.trim(), c); },
        onInterim: (t) => setInterim(t),
        onEnd: (msg) => {
          ended = true;
          wantRef.current = false;
          nativeStopRef.current = null;
          setListening(false);
          setInterim('');
          if (msg) setNotice(msg);
        },
      });
      // the adapter may end synchronously (e.g. no recognizer) — don't keep a stale stop
      nativeStopRef.current = ended ? null : stopFn;
      return;
    }
    // Web path: Web Speech API, restarted on `end` so a long session keeps going.
    if (!SR) return;
    const rec = new SR();
    rec.lang = speechLangs()[0]; // SD-151: en-GB / en-AU / en-US by region, en-IN default
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let finalT = '';
      let interimT = '';
      let finalConf: number | undefined; // 0..1 from the last final result (0/absent ⇒ unknown)
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { finalT += r[0].transcript; finalConf = r[0].confidence; }
        else interimT += r[0].transcript;
      }
      setInterim(interimT);
      if (finalT.trim()) {
        setInterim('');
        onResultRef.current(finalT.trim(), finalConf);
      }
    };
    rec.onend = () => {
      if (wantRef.current) { try { rec.start(); } catch { /* already starting */ } }
      else setListening(false);
    };
    rec.onerror = () => { /* mic denied / no-speech — onend will follow */ };
    recRef.current = rec;
    wantRef.current = true;
    setListening(true);
    try { rec.start(); } catch { /* noop */ }
  };

  const stop = () => {
    wantRef.current = false;
    setListening(false);
    setInterim('');
    try { recRef.current?.stop(); } catch { /* noop */ }
    try { nativeStopRef.current?.(); } catch { /* noop */ }
    nativeStopRef.current = null;
  };

  useEffect(() => () => {
    wantRef.current = false;
    try { recRef.current?.stop(); } catch { /* noop */ }
    try { nativeStopRef.current?.(); } catch { /* noop */ }
  }, []);

  return { supported, listening, interim, notice, start, stop };
}

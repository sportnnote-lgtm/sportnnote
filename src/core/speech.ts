/** Voice input. On web it uses the Web Speech API (Chrome/Edge) directly. On
 *  native (iOS/Android) the browser API doesn't exist, so a dev build registers a
 *  thin adapter around a native speech module — see "Native setup" below. Until an
 *  adapter is registered, `supported` is false on native and the UI falls back to
 *  typed commands. Keeping the native module out of this file's imports means web
 *  bundling and `tsc` stay clean whether or not the native package is installed.
 *
 *  ── Native setup (one-time, needs a dev/EAS build — not Expo Go) ──
 *   1. `npx expo install expo-speech-recognition`
 *      (add its config plugin to app.json `plugins`; the mic/speech usage strings
 *      are already in app.json under ios.infoPlist / android.permissions).
 *   2. In App startup, register an adapter:
 *
 *        import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
 *        import { registerNativeSpeech } from './src/core/speech';
 *
 *        registerNativeSpeech((onResult, onInterim) => {
 *          const subs = [
 *            ExpoSpeechRecognitionModule.addListener('result', (e) => {
 *              const t = e.results?.[0]?.transcript ?? '';
 *              if (e.isFinal) onResult(t); else onInterim(t);
 *            }),
 *            ExpoSpeechRecognitionModule.addListener('end', () => onInterim('')),
 *          ];
 *          ExpoSpeechRecognitionModule.requestPermissionsAsync().then(() =>
 *            ExpoSpeechRecognitionModule.start({ lang: 'en-US', continuous: true, interimResults: true }));
 *          return () => { ExpoSpeechRecognitionModule.stop(); subs.forEach((s) => s.remove()); };
 *        });
 *
 *  The adapter contract: `start(onResult, onInterim)` begins listening and returns
 *  a `stop` cleanup function. That's all the hook below needs. */
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export interface SpeechHook {
  supported: boolean;
  listening: boolean;
  interim: string;
  start: () => void;
  stop: () => void;
}

/** A native recognizer: begin listening, return a cleanup that stops it. */
export type NativeSpeechAdapter = (
  onResult: (text: string) => void,
  onInterim: (text: string) => void,
) => () => void;

let nativeAdapter: NativeSpeechAdapter | null = null;
/** Called once from a dev build to enable native speech (see header). */
export function registerNativeSpeech(adapter: NativeSpeechAdapter): void {
  nativeAdapter = adapter;
}

export function useSpeech(onResult: (text: string) => void): SpeechHook {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
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
    // Native path: delegate to the registered adapter.
    if (Platform.OS !== 'web') {
      if (!nativeAdapter) return;
      wantRef.current = true;
      setListening(true);
      nativeStopRef.current = nativeAdapter(
        (t) => { setInterim(''); if (t.trim()) onResultRef.current(t.trim()); },
        (t) => setInterim(t),
      );
      return;
    }
    // Web path: Web Speech API, restarted on `end` so a long session keeps going.
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let finalT = '';
      let interimT = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalT += r[0].transcript;
        else interimT += r[0].transcript;
      }
      setInterim(interimT);
      if (finalT.trim()) {
        setInterim('');
        onResultRef.current(finalT.trim());
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

  return { supported, listening, interim, start, stop };
}

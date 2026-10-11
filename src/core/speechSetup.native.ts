/** SD-137b — turn on spoken voice scoring in the PHONE APP (the web build uses
 *  speechSetup.ts, a no-op: web keeps the browser's Web Speech API).
 *
 *  expo-speech-recognition is a native module: an APK built before it was added
 *  (APK 37 and older) doesn't have it, so we look for the native side first and,
 *  without it, register nothing — voice stays typed-only there, exactly as before
 *  (safe for an OTA update). */
import { Alert, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { registerNativeSpeech } from './speech';
import { createNativeSpeechAdapter, type SpeechModuleLike } from './speechNative';
import { speechLangs } from './chatRegion';

let done = false;
export function setupNativeSpeech(): void {
  if (done) return;
  done = true;
  let mod: SpeechModuleLike | null = null;
  try {
    mod = requireOptionalNativeModule<SpeechModuleLike>('ExpoSpeechRecognition');
  } catch { mod = null; }
  if (!mod) return;
  registerNativeSpeech(createNativeSpeechAdapter(mod, {
    // SD-151: by device region — en-GB (UK), en-AU (AU), en-US (US); en-IN default.
    langs: speechLangs(),
    os: Platform.OS,
    explain: (message) => new Promise<boolean>((resolve) => {
      Alert.alert('Use the microphone for voice scoring?', message, [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) });
    }),
  }));
}

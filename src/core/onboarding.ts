/** First-run onboarding flag. Persisted per-device in AsyncStorage (works
 *  logged-out / in demo). Bump the key to re-show the tour to everyone. */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sportnnote.onboarding.v1';

export async function hasSeenOnboarding(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(KEY)) === '1'; } catch { return false; }
}
export async function markOnboardingSeen(): Promise<void> {
  try { await AsyncStorage.setItem(KEY, '1'); } catch { /* non-fatal */ }
}
/** Clear the flag so the tour shows again (e.g. a "Replay tour" action). */
export async function resetOnboarding(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch { /* non-fatal */ }
}

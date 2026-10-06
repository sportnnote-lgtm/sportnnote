/**
 * Open the system share sheet (WhatsApp, SMS, …) with a message. On the web the
 * sheet exists in mobile Safari/Chrome (navigator.share); where it doesn't
 * (desktop browsers) we open WhatsApp directly with the text pre-filled.
 */
import { Linking, Platform, Share } from 'react-native';
import { track } from './telemetry';

export async function shareMessage(message: string, what: 'match' | 'tournament' | 'golf'): Promise<void> {
  const web = Platform.OS === 'web' && typeof navigator !== 'undefined';
  try {
    if (web && typeof (navigator as { share?: unknown }).share !== 'function') {
      await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
    } else {
      await Share.share({ message });
    }
    track('share_link', { what });
  } catch (e) {
    // The user closing the sheet isn't a failure. Anything else on the web
    // (e.g. share blocked) → fall back to WhatsApp.
    if ((e as { name?: string })?.name === 'AbortError') return;
    if (web) void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
  }
}

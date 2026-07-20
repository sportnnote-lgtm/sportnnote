/** Turn a venue into a tappable Google Maps destination.
 *  Prefers an explicit maps link the organizer pasted; otherwise builds a
 *  Maps search query from the venue name so any venue is still navigable. */
import { Linking } from 'react-native';

/** Resolve the best Maps URL for a venue, or null if there's nothing to open. */
export function venueMapsUrl(venueName?: string | null, explicit?: string | null): string | null {
  const url = explicit?.trim();
  if (url) return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const name = venueName?.trim();
  if (name) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
  return null;
}

/** Open the venue in Maps (no-op when there's no resolvable location). */
export function openVenue(venueName?: string | null, explicit?: string | null): void {
  const url = venueMapsUrl(venueName, explicit);
  if (url) void Linking.openURL(url);
}

/** Save a text file the user can open — a browser download on web. Native has
 *  no file download; callers share the text there instead (see `ics.ts`). */
import { Platform } from 'react-native';

/** Web: trigger a download of `text` as `filename`. Returns false on native (or
 *  without a DOM) so the caller can fall back to `Share.share`. */
export function downloadText(filename: string, mime: string, text: string): boolean {
  if (Platform.OS !== 'web') return false;
  // Use globals via `any` so we don't pull DOM types into the RN build.
  const g: any = globalThis;
  if (!g.document || !g.Blob || !g.URL) return false;
  const blob = new g.Blob([text], { type: mime });
  const url = g.URL.createObjectURL(blob);
  const a = g.document.createElement('a');
  a.href = url;
  a.download = filename;
  g.document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been handled (some browsers read the URL async).
  setTimeout(() => g.URL.revokeObjectURL(url), 0);
  return true;
}

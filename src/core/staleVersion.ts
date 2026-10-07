/**
 * Version mismatch after a new web publish. An app opened on an older version
 * asks for screen files ("chunks") that the new version no longer has — the host
 * answers with the web page instead ("Unexpected token '<'"), or old and new
 * files get mixed ("Requiring unknown module"). The cure is to reload once and
 * pick up the newest version. Guarded so it can never loop.
 */
import { Platform } from 'react-native';

const KEY = 'sn.staleReloadAt';

export { isStaleVersionError } from './staleVersionMatch';

/** Reload the web app once (not again within 60 s). Returns true if reloading. */
export function reloadForNewVersion(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* storage blocked — still try once */ }
  window.location.reload();
  return true;
}

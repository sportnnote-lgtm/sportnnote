/**
 * Keep `profiles.time_zone` in step with the app's zone (SD-150). The column
 * has existed since migration 0001 and `notify-upcoming` reads it to word the
 * reminder emails, but until now no client wrote it, so every email said IST.
 *
 * On sign-in the local zone (seeded from the device on first run, or chosen in
 * Settings → Region) is written when it differs from the saved one, and every
 * later change is written too. Best effort: offline / RLS failures are ignored
 * and retried on the next sign-in or change.
 */
import { isSupabaseConfigured, supabase } from '../core/supabase';
import { isValidTimeZone, timeZoneStore } from '../core/time';

let stop: (() => void) | null = null;

/** The write that should happen, if any (pure, for tests). */
export function zoneToSave(local: string, saved: string | null | undefined): string | null {
  return isValidTimeZone(local) && local !== saved ? local : null;
}

async function write(profileId: string, zone: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const { error } = await supabase.from('profiles').update({ time_zone: zone }).eq('id', profileId);
    return !error;
  } catch { return false; }
}

/** Start syncing for a signed-in profile (replaces any previous sync). */
export function startProfileZoneSync(profileId: string, savedZone: string | null | undefined): void {
  stopProfileZoneSync();
  let saved = savedZone ?? null;
  const push = () => {
    const z = zoneToSave(timeZoneStore.get(), saved);
    if (!z) return;
    void write(profileId, z).then((ok) => { if (ok) saved = z; });
  };
  push();
  stop = timeZoneStore.subscribe(push);
}

export function stopProfileZoneSync(): void {
  if (stop) { stop(); stop = null; }
}

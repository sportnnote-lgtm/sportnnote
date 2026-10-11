/** The edge-function path to invoke for this user (perf F-22): pinned to the
 *  database's region (Mumbai) for people outside India, unchanged in India.
 *  See core/functionRegion.ts for the rules. */
import { deviceTimeZone, regionStore } from './region';
import { outsideIndia, regionalFunctionPath } from './functionRegion';

export function fnPath(name: string): string {
  try {
    const abroad = outsideIndia({ savedCountry: regionStore.prefs().country, deviceZone: deviceTimeZone(), country: regionStore.get().country });
    return regionalFunctionPath(name, abroad);
  } catch {
    return name; // never let region lookup break a call
  }
}

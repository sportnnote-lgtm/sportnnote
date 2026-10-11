/**
 * SD-139 — the shoot-out order on the timeline (football penalties, hockey
 * shoot-out, handball 7-metre throws). The scorer picks who goes first (after
 * the toss, or however the officials decide) and, where the rules allow a new
 * order, who goes first in sudden death; both picks are shown as timeline rows.
 * PURE.
 */
import type { LiveEvent } from './liveEvents';

export type Side = 'home' | 'away';
export interface ShootoutOrder { first?: Side; sdFirst?: Side }

/** Words for the rows: what the attempt is called ("shoot" / "throw" / "kick"). */
export interface OrderWords { what: string; verb: string }

/** Timeline rows for the order picks: "🪙 Shoot-out — India shoot first", then
 *  "🪙 Sudden death — Spain shoot first". Ids sit above every in-play row
 *  (a shoot-out follows the final whistle), so they read at the top. */
export function shootoutOrderRows(so: ShootoutOrder | null | undefined, names: { home?: string; away?: string } | undefined, words: OrderWords): LiveEvent[] {
  if (!so?.first) return [];
  const nm = (sd: Side) => names?.[sd] || (sd === 'home' ? 'Home' : 'Away');
  const rows: LiveEvent[] = [{
    id: 9e12, stamp: 'SO', icon: '🪙', label: `${words.what} — ${nm(so.first)} ${words.verb} first`, detail: 'Order picked by the scorer', side: so.first, kind: 'soOrder',
  }];
  if (so.sdFirst) {
    rows.push({ id: 9e12 + 1, stamp: 'SO', icon: '🪙', label: `Sudden death — ${nm(so.sdFirst)} ${words.verb} first`, detail: 'Order picked by the scorer', side: so.sdFirst, kind: 'soOrder' });
  }
  return rows;
}

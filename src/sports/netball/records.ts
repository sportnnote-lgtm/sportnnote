/** SD-146 — netball's per-match record candidates (SD-51 hook, set on the
 *  plugin by the registry through matchRecordHooks.ts). PURE: from the final
 *  state only. Highest team score, biggest win, the most goals by a player,
 *  and perfect shooting (every attempt scored, at least `PERFECT_MIN`). */
import { block, scoreItems, type MatchRecordItem, type MatchRecordsBlock } from '../matchRecords.ts';
import type { NetballState, Side } from './engine.ts';

/** attempts a perfect-shooting record needs (house minimum; the record types
 *  are listed in matchRecords.ts) */
export const PERFECT_MIN = 10;


export function netballMatchRecords(s: NetballState): MatchRecordsBlock | null {
  if (!s || !s.ended) return null;
  const items: MatchRecordItem[] = scoreItems(s.home, s.away, { teamHigh: true, biggestWin: true });
  const by = new Map<string, { side: Side; id?: string; name?: string; g: number; a: number }>();
  for (const e of s.events ?? []) {
    if ((e.type !== 'goal' && e.type !== 'miss') || !e.side || (!e.playerId && !e.playerName)) continue;
    const k = `${e.side}|${e.playerId ?? `n:${e.playerName}`}`;
    const r = by.get(k) ?? { side: e.side, ...(e.playerId ? { id: e.playerId } : {}), ...(e.playerName ? { name: e.playerName } : {}), g: 0, a: 0 };
    r.a++; if (e.type === 'goal') r.g++;
    by.set(k, r);
  }
  const shooters = [...by.values()].sort((x, y) => y.g - x.g);
  for (const r of shooters.slice(0, 2)) {
    if (r.g > 0) items.push({ type: 'playerGoals', value: r.g, text: `${r.g}/${r.a}`, side: r.side, playerId: r.id, playerName: r.name });
  }
  for (const r of shooters) {
    if (r.a >= PERFECT_MIN && r.g === r.a) items.push({ type: 'perfectShooting', value: r.g, text: `${r.g}/${r.a}`, side: r.side, playerId: r.id, playerName: r.name });
  }
  return block(items);
}

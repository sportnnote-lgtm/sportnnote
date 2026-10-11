/**
 * SD-147 — American football's `matchRecords(state)` hook (SD-51): the record
 * candidates of one finished game, from its final state only. Team high,
 * biggest win, most points in a game, longest touchdown (yards, when given),
 * most touchdowns by a player, longest field goal. PURE.
 * The record types are listed in ../matchRecords.ts (`american_football`).
 */
import { block, scoreItems, type MatchRecordItem, type MatchRecordsBlock } from '../matchRecords.ts';
import type { AFState, Side } from './engine.ts';

export function afMatchRecords(s: AFState): MatchRecordsBlock | null {
  if (!s || !s.ended || !Array.isArray(s.events)) return null;
  const items: MatchRecordItem[] = scoreItems(s.home, s.away, { teamHigh: true, mostGoals: true, biggestWin: true });
  const by = new Map<string, { side: Side; id?: string; name?: string; n: number }>();
  for (const e of s.events) {
    if (e.type === 'td') {
      if (e.yards != null && e.yards > 0 && (e.playerId || e.playerName)) {
        items.push({ type: 'longestTD', value: e.yards, text: `${e.yards} yds`, side: e.side, playerId: e.playerId, playerName: e.playerName, note: e.how === 'pass' ? 'pass' : e.how === 'run' ? 'run' : 'return' });
      }
      if (!e.playerId && !e.playerName) continue;
      const k = `${e.side}|${e.playerId ?? `n:${e.playerName}`}`;
      const cur = by.get(k) ?? { side: e.side, id: e.playerId, name: e.playerName, n: 0 };
      cur.n += 1;
      by.set(k, cur);
    }
    if (e.type === 'fg' && e.good && e.yards && (e.playerId || e.playerName)) {
      items.push({ type: 'longestFG', value: e.yards, text: `${e.yards} yds`, side: e.side, playerId: e.playerId, playerName: e.playerName });
    }
  }
  for (const x of by.values()) if (x.n >= 2) items.push({ type: 'playerTD', value: x.n, text: `${x.n} TDs`, side: x.side, playerId: x.id, playerName: x.name });
  return block(items);
}

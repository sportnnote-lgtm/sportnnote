/**
 * SD-145 — ice hockey's `matchRecords(state)` hook (SD-51): the record
 * candidates of one finished game, from its final state only. Biggest win,
 * most goals in a game, fastest goal (game clock), hat-tricks, shutouts and
 * most saves by a goalie. Shoot-out goals are never goals here. PURE.
 * The record types are listed in ../matchRecords.ts (`ice_hockey`).
 */
import { block, scoreItems, type MatchRecordItem, type MatchRecordsBlock } from '../matchRecords.ts';
import { eventWhen, isComplete, type IceHockeyState } from './engine.ts';
import { goalieSpells } from './totals.ts';

export function iceHockeyMatchRecords(s: IceHockeyState): MatchRecordsBlock | null {
  if (!s || !s.ended || !Array.isArray(s.events)) return null;
  const items: MatchRecordItem[] = scoreItems(s.home, s.away, { mostGoals: true, biggestWin: true });
  const goals = s.events.filter((e) => e.type === 'goal');
  const first = [...goals].sort((a, b) => a.sec - b.sec)[0];
  if (first && (first.playerId || first.playerName)) {
    items.push({ type: 'fastestGoal', value: first.sec, text: eventWhen(s, first), side: first.side, playerId: first.playerId, playerName: first.playerName });
  }
  const by = new Map<string, { side: 'home' | 'away'; id?: string; name?: string; n: number }>();
  for (const g of goals) {
    if (!g.playerId && !g.playerName) continue;
    const k = `${g.side}|${g.playerId ?? `n:${g.playerName}`}`;
    const cur = by.get(k) ?? { side: g.side, id: g.playerId, name: g.playerName, n: 0 };
    cur.n += 1;
    by.set(k, cur);
  }
  for (const x of by.values()) if (x.n >= 3) items.push({ type: 'hatTrick', value: x.n, text: `${x.n} goals`, side: x.side, playerId: x.id, playerName: x.name });
  if (isComplete(s)) {
    const spells = [...goalieSpells(s).values()];
    for (const g of spells) {
      if (!g.id && !g.name) continue;
      const only = spells.filter((x) => x.side === g.side && (x.secs > 0 || x.ga > 0 || x.saves > 0)).length === 1;
      if (only && g.ga === 0 && !goals.some((e) => e.side !== g.side)) {
        items.push({ type: 'shutout', value: g.saves, text: `${g.saves} saves`, side: g.side, playerId: g.id, playerName: g.name });
      }
      if (g.saves > 0) items.push({ type: 'mostSaves', value: g.saves, text: `${g.saves} saves`, side: g.side, playerId: g.id, playerName: g.name });
    }
  }
  return block(items);
}

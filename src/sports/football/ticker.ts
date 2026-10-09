/**
 * Football's score-ticker cells and flash (parity #25). Pure — reads the state.
 * The clock itself ticks in the overlay (the plugin's LiveClock).
 */
import { penScore, type FootballState } from './engine.ts';
import type { FootballEvent } from './events';
import { shortName, type TickerDetail, type TickerFlash } from '../ticker.ts';

const isGoal = (e: FootballEvent) => e.type === 'goal' || e.type === 'owngoal';

/** "Rahul S. 23', 67' · Dev K. 41' (OG)" — a side's goals, scorer by scorer. */
function scorers(events: FootballEvent[], side: 'home' | 'away'): string | undefined {
  const by = new Map<string, string[]>();
  for (const e of events) {
    if (!isGoal(e) || e.side !== side) continue;
    const who = `${shortName(e.playerName) || 'Goal'}${e.type === 'owngoal' ? ' (OG)' : ''}`;
    by.set(who, [...(by.get(who) ?? []), `${e.minute}'`]);
  }
  if (!by.size) return undefined;
  return [...by].map(([who, mins]) => `${who} ${mins.join(', ')}`).join(' · ');
}

export function footballTickerDetail(s: FootballState, names: { home: string; away: string }): TickerDetail {
  const d: TickerDetail = {};
  const h = scorers(s.events, 'home');
  const a = scorers(s.events, 'away');
  if (h) d.left = [`⚽ ${h}`];
  if (a) d.right = [`⚽ ${a}`];
  if (s.shootoutWinner) {
    const p = penScore(s);
    d.status = `${names[s.shootoutWinner]} win ${p.home}–${p.away} on pens`;
  }
  return d;
}

/** A new goal (or own goal) → "GOAL! Rahul S. 34'". */
export function footballTickerFlash(prev: FootballState, next: FootballState): TickerFlash | null {
  const last = next.events[next.events.length - 1];
  if (!last || !isGoal(last) || prev.events.some((e) => e.id === last.id)) return null;
  const who = shortName(last.playerName);
  return {
    kind: 'goal',
    text: `GOAL!${who ? ` ${who}` : ''} ${last.minute}'`,
    ...(last.type === 'owngoal' ? { sub: 'Own goal' } : {}),
    side: last.side,
  };
}

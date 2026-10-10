/**
 * SD-101 — hockey's score-ticker cells and goal flash (parity #25). PURE.
 */
import { clockFace, minuteText, periodName, soScore, type HockeyEvent, type HockeyState, type Side } from './engine.ts';
import { shortName, type TickerDetail, type TickerFlash } from '../ticker.ts';

const TYPE_MARK: Record<string, string> = { pc: ' (PC)', stroke: ' (PS)', field: '' };

/** "Asha R. 12', 40' (PC) · Team 55'" — a side's goals, scorer by scorer. */
export function hockeyScorers(s: HockeyState, side: Side): string | undefined {
  const by = new Map<string, string[]>();
  for (const e of s.events) {
    if (e.type !== 'goal' || e.side !== side) continue;
    const who = shortName(e.playerName) || 'Goal';
    by.set(who, [...(by.get(who) ?? []), `${minuteText(e.sec)}${TYPE_MARK[e.goalType ?? 'field']}`]);
  }
  if (!by.size) return undefined;
  return [...by].map(([who, mins]) => `${who} ${mins.join(', ')}`).join(' · ');
}

export function hockeyTickerDetail(s: HockeyState, names: { home: string; away: string }): TickerDetail {
  const d: TickerDetail = {};
  const h = hockeyScorers(s, 'home');
  const a = hockeyScorers(s, 'away');
  if (h) d.left = [`🏑 ${h}`];
  if (a) d.right = [`🏑 ${a}`];
  if (s.shootoutWinner) {
    const p = soScore(s);
    d.status = `${names[s.shootoutWinner]} win ${p.home}–${p.away} in the shoot-out`;
  } else if (s.shootout) {
    const p = soScore(s);
    d.status = `Shoot-out ${p.home}–${p.away}`;
  } else if (!s.ended) {
    d.detail = `${periodName(s, s.period)} · ${clockFace(s, Date.now())}`;
  }
  return d;
}

/** A new goal → "GOAL! Asha R. 34'" (PC / stroke as the second line). */
export function hockeyTickerFlash(prev: HockeyState, next: HockeyState): TickerFlash | null {
  const last: HockeyEvent | undefined = next.events[next.events.length - 1];
  if (!last || last.type !== 'goal' || prev.events.some((e) => e.id === last.id)) return null;
  const who = shortName(last.playerName);
  return {
    kind: 'goal',
    text: `GOAL!${who ? ` ${who}` : ''} ${minuteText(last.sec)}`,
    ...(last.goalType === 'pc' ? { sub: 'Penalty corner' } : last.goalType === 'stroke' ? { sub: 'Penalty stroke' } : {}),
    side: last.side,
  };
}

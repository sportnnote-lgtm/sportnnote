/**
 * SD-102 — handball's score-ticker cells and goal flash (parity #25). PURE.
 * Handball has many goals, so the ticker lists the top scorers with their
 * goal counts ("Asha R. 7 · Meera J. 5"), not every minute.
 */
import { clockFace, periodName, soScore, SHOT_LABEL, type HandballEvent, type HandballState, type Side } from './engine.ts';
import { shortName, type TickerDetail, type TickerFlash } from '../ticker.ts';

/** "Asha R. 7 · Meera J. 5 · Team 1" — a side's scorers, most goals first (top 3). */
export function handballScorers(s: HandballState, side: Side, top = 3): string | undefined {
  const by = new Map<string, number>();
  for (const e of s.events) {
    if (e.type !== 'goal' || e.side !== side) continue;
    const who = shortName(e.playerName) || 'Team';
    by.set(who, (by.get(who) ?? 0) + 1);
  }
  if (!by.size) return undefined;
  return [...by].sort((a, b) => b[1] - a[1]).slice(0, top).map(([who, n]) => `${who} ${n}`).join(' · ');
}

export function handballTickerDetail(s: HandballState, names: { home: string; away: string }): TickerDetail {
  const d: TickerDetail = {};
  const h = handballScorers(s, 'home');
  const a = handballScorers(s, 'away');
  if (h) d.left = [`🤾 ${h}`];
  if (a) d.right = [`🤾 ${a}`];
  if (s.shootoutWinner) {
    const p = soScore(s);
    d.status = `${names[s.shootoutWinner]} win ${p.home}–${p.away} on 7 m throws`;
  } else if (s.shootout) {
    const p = soScore(s);
    d.status = `7 m throws ${p.home}–${p.away}`;
  } else if (!s.ended) {
    d.detail = `${periodName(s, s.period)} · ${clockFace(s, Date.now())}`;
  }
  return d;
}

/** A new goal → "GOAL! Asha R. 41:20" (the shot type as the second line). */
export function handballTickerFlash(prev: HandballState, next: HandballState): TickerFlash | null {
  const last: HandballEvent | undefined = next.events[next.events.length - 1];
  if (!last || last.type !== 'goal' || prev.events.some((e) => e.id === last.id)) return null;
  const who = shortName(last.playerName);
  const m = Math.floor(last.sec / 60), sc = Math.floor(last.sec % 60);
  return {
    kind: 'goal',
    text: `GOAL!${who ? ` ${who}` : ''} ${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`,
    sub: SHOT_LABEL[last.shotType ?? 'nineM'],
    side: last.side,
  };
}

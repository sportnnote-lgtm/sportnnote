/**
 * SD-143 — rugby's score-ticker cells and try flash (parity #25). PURE.
 * The ticker lists each side's try scorers ("Rao 2 · Khan") and the live half.
 */
import { clockFace, minuteText, periodName, soScore, type RugbyEvent, type RugbyState, type Side } from './engine.ts';
import { shortName, type TickerDetail, type TickerFlash } from '../ticker.ts';

/** "Asha R. 2 · Meera J. · PT" — a side's try scorers, most first (top 3). */
export function rugbyTryScorers(s: RugbyState, side: Side, top = 3): string | undefined {
  const by = new Map<string, number>();
  for (const e of s.events) {
    if ((e.type !== 'try' && e.type !== 'pentry') || e.side !== side) continue;
    const who = e.type === 'pentry' ? 'PT' : shortName(e.playerName) || 'Team';
    by.set(who, (by.get(who) ?? 0) + 1);
  }
  if (!by.size) return undefined;
  return [...by].sort((a, b) => b[1] - a[1]).slice(0, top).map(([who, n]) => (n > 1 ? `${who} ${n}` : who)).join(' · ');
}

export function rugbyTickerDetail(s: RugbyState, names: { home: string; away: string }): TickerDetail {
  const d: TickerDetail = {};
  const h = rugbyTryScorers(s, 'home');
  const a = rugbyTryScorers(s, 'away');
  if (h) d.left = [`🏉 ${h}`];
  if (a) d.right = [`🏉 ${a}`];
  if (s.shootoutWinner) {
    const p = soScore(s);
    d.status = `${names[s.shootoutWinner]} win ${p.home}–${p.away} on the kicking competition`;
  } else if (s.shootout) {
    const p = soScore(s);
    d.status = `Kicking competition ${p.home}–${p.away}`;
  } else if (!s.ended) {
    d.detail = `${periodName(s, s.period)} · ${clockFace(s, Date.now())}`;
  }
  return d;
}

/** A new try → "TRY! Asha R. 23'" (a penalty try says so). */
export function rugbyTickerFlash(prev: RugbyState, next: RugbyState): TickerFlash | null {
  const last: RugbyEvent | undefined = next.events[next.events.length - 1];
  if (!last || (last.type !== 'try' && last.type !== 'pentry') || prev.events.some((e) => e.id === last.id)) return null;
  const who = last.type === 'pentry' ? 'Penalty try' : shortName(last.playerName);
  return { kind: 'goal', text: `TRY!${who ? ` ${who}` : ''} ${minuteText(next, last.period, last.psec)}`, sub: last.type === 'pentry' ? '7 points' : '5 points', side: last.side };
}

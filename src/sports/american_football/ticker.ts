/**
 * SD-147 — American football's score-ticker cells and touchdown flash (parity
 * #25). PURE. The ticker lists each side's touchdown scorers, the period and
 * clock, and — play by play — who has the ball and the down & distance.
 */
import { clockFace, downText, eventWhen, periodName, type AFEvent, type AFState, type Side } from './engine.ts';
import { shortName, type TickerDetail, type TickerFlash } from '../ticker.ts';

/** "Asha R. 2 · Meera J." — a side's touchdown scorers, most first (top 3). */
export function afTdScorers(s: AFState, side: Side, top = 3): string | undefined {
  const by = new Map<string, number>();
  for (const e of s.events) {
    if (e.type !== 'td' || e.side !== side) continue;
    const who = shortName(e.playerName) || 'Team';
    by.set(who, (by.get(who) ?? 0) + 1);
  }
  if (!by.size) return undefined;
  return [...by].sort((a, b) => b[1] - a[1]).slice(0, top).map(([who, n]) => (n > 1 ? `${who} ${n}` : who)).join(' · ');
}

export function afTickerDetail(s: AFState, names: { home: string; away: string }): TickerDetail {
  const d: TickerDetail = {};
  const h = afTdScorers(s, 'home');
  const a = afTdScorers(s, 'away');
  if (h) d.left = [`🏈 ${h}`];
  if (a) d.right = [`🏈 ${a}`];
  if (!s.ended) {
    const clock = clockFace(s, Date.now());
    d.detail = [periodName(s, s.period) + (clock ? ` · ${clock}` : ''), s.drive ? `${names[s.drive.off]} ball · ${downText(s, s.drive, true)}` : ''].filter(Boolean).join(' · ');
    if (s.drive) d.batting = s.drive.off;
  }
  return d;
}

/** A new touchdown → "TOUCHDOWN! Asha R. Q2 4:12"; a field goal → "FIELD GOAL". */
export function afTickerFlash(prev: AFState, next: AFState): TickerFlash | null {
  const last: AFEvent | undefined = next.events[next.events.length - 1];
  if (!last || prev.events.some((e) => e.id === last.id)) return null;
  if (last.type === 'td') {
    const who = shortName(last.playerName);
    return { kind: 'goal', text: `TOUCHDOWN!${who ? ` ${who}` : ''}`, sub: `${eventWhen(next, last)}${last.yards != null ? ` · ${last.yards} yds` : ''}`, side: last.side };
  }
  if (last.type === 'fg' && last.good) return { kind: 'four', text: `FIELD GOAL${last.yards ? ` ${last.yards} yds` : ''}`, sub: shortName(last.playerName) || undefined, side: last.side };
  if (last.type === 'safety') return { kind: 'wicket', text: 'SAFETY', sub: '2 points', side: last.side };
  return null;
}

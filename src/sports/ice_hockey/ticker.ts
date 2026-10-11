/**
 * SD-145 — ice hockey's score-ticker cells and goal flash (parity #25). PURE.
 * The ticker lists each side's scorers with the period ("Rao P1 · Khan P3")
 * and, live, the period, clock and any power play.
 */
import { baseSkaters, clockFace, penaltyBox, matchSec, periodName, skatersOn, soScore, type IceEvent, type IceHockeyState, type Side } from './engine.ts';
import { goalTags } from './timeline.ts';
import { shortName, type TickerDetail, type TickerFlash } from '../ticker.ts';

/** "Asha R. P1 · Meera J. P3 (PP)" — a side's goals in order (last 3). */
export function iceHockeyScorers(s: IceHockeyState, side: Side, top = 3): string | undefined {
  const goals = s.events.filter((e) => e.type === 'goal' && e.side === side);
  if (!goals.length) return undefined;
  return goals.slice(-top).map((e) => {
    const t = goalTags(e);
    return `${shortName(e.playerName) || 'Team'} ${periodName(s, e.period)}${t.length ? ` (${t.join(', ')})` : ''}`;
  }).join(' · ');
}

/** "5 v 4" while a side is short, else undefined. */
export function strengthText(s: IceHockeyState, now = Date.now()): string | undefined {
  if (s.ended) return undefined;
  const on = skatersOn(s, penaltyBox(s, matchSec(s, now)));
  const base = baseSkaters(s);
  return on.home !== base || on.away !== base ? `${on.home} v ${on.away}` : undefined;
}

export function iceHockeyTickerDetail(s: IceHockeyState, names: { home: string; away: string }): TickerDetail {
  const d: TickerDetail = {};
  const h = iceHockeyScorers(s, 'home');
  const a = iceHockeyScorers(s, 'away');
  if (h) d.left = [`🏒 ${h}`];
  if (a) d.right = [`🏒 ${a}`];
  if (s.shootoutWinner) {
    const p = soScore(s);
    d.status = `${names[s.shootoutWinner]} win ${p.home}–${p.away} in the shoot-out`;
  } else if (s.shootout) {
    const p = soScore(s);
    d.status = `Shoot-out ${p.home}–${p.away}`;
  } else if (!s.ended) {
    const st = strengthText(s);
    d.detail = `${periodName(s, s.period)} · ${clockFace(s, Date.now())}${st ? ` · ${st}` : ''}`;
  }
  return d;
}

/** A new goal → "GOAL! Asha R. P2 12:34" (PP / SH / EN as the second line). */
export function iceHockeyTickerFlash(prev: IceHockeyState, next: IceHockeyState): TickerFlash | null {
  const last: IceEvent | undefined = next.events[next.events.length - 1];
  if (!last || last.type !== 'goal' || prev.events.some((e) => e.id === last.id)) return null;
  const who = shortName(last.playerName);
  const tags = goalTags(last);
  return {
    kind: 'goal',
    text: `GOAL!${who ? ` ${who}` : ''} ${periodName(next, last.period)}`,
    sub: tags.length ? tags.join(' · ') : 'Even strength',
    side: last.side,
  };
}

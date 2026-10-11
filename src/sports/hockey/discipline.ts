/**
 * SD-126 — hockey cards for the tournament discipline table and suspension
 * rule (src/sports/discipline.ts). FIH Rules of Hockey 14.2: green = a 2-minute
 * suspension, yellow = 5–10 minutes, red = sent off for the rest of the match
 * (all played out in the match itself — engine.ts CARD_MINUTES). What a red
 * card costs AFTER the match is the tournament's regulations: FIH events
 * suspend a red-carded player for at least the next match (default 1 — verify
 * against your regulations). Yellow cards don't add up by default (organiser
 * option). Hockey logs no team-official cards.
 */
import type { SportDisciplineSpec, CardMark } from '../discipline';
import type { HockeyEvent } from './engine';

export const HOCKEY_DISCIPLINE: SportDisciplineSpec = {
  sport: 'hockey',
  columns: [
    { key: 'green', icon: '🟩', label: 'Green cards' },
    { key: 'yellow', icon: '🟨', label: 'Yellow cards' },
    { key: 'red', icon: '🟥', label: 'Red cards' },
  ],
  sendOffs: [{ key: 'banRed', ask: 'A red card means', reason: 'red card', def: 1 }],
  caution: { col: 'yellow', plural: 'yellow cards', def: 0 },
  source: 'FIH: a red card = at least the next match; green and yellow are served in the match',
  marks(m) {
    const ev = (m.state as { events?: unknown } | null | undefined)?.events;
    if (!Array.isArray(ev)) return [];
    const out: CardMark[] = [];
    for (const e of ev as HockeyEvent[]) {
      if (e?.type !== 'card' || (e.side !== 'home' && e.side !== 'away')) continue;
      const col = e.card === 'yellow' || e.card === 'red' ? e.card : 'green';
      out.push({
        side: e.side, ...(e.playerId ? { playerId: e.playerId } : {}), ...(e.playerName ? { playerName: e.playerName } : {}), col,
        ...(col === 'red' ? { off: 'banRed' } : {}), ...(col === 'yellow' ? { caution: true } : {}),
      });
    }
    return out;
  },
};

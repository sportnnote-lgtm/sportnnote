/**
 * SD-126 — kabaddi cards (SD-72) for the tournament discipline table and
 * suspension rule (src/sports/discipline.ts). AKFI / IKF: green = a warning,
 * yellow = a 2-minute suspension, red = out for the rest of the match. What a
 * red card costs after the match is the competition's call — the default sits
 * the player out the next match (verify against your rules); yellow cards don't
 * add up unless the organiser says so. Coaches' / officials' cards are listed,
 * never suspend a player.
 */
import type { SportDisciplineSpec, CardMark } from '../discipline';
import type { ExtraEntry } from './engine';

export const KABADDI_DISCIPLINE: SportDisciplineSpec = {
  sport: 'kabaddi',
  columns: [
    { key: 'green', icon: '🟩', label: 'Green cards' },
    { key: 'yellow', icon: '🟨', label: 'Yellow cards' },
    { key: 'red', icon: '🟥', label: 'Red cards' },
  ],
  sendOffs: [{ key: 'banRed', ask: 'A red card means', reason: 'red card', def: 1 }],
  caution: { col: 'yellow', plural: 'yellow cards', def: 0 },
  source: 'AKFI / IKF: cards are served in the match; a red card’s ban is the competition’s call',
  marks(m) {
    const ex = (m.state as { extras?: unknown } | null | undefined)?.extras;
    if (!Array.isArray(ex)) return [];
    const out: CardMark[] = [];
    for (const e of ex as ExtraEntry[]) {
      if (e?.x !== 'card' || !e.card || (e.side !== 'home' && e.side !== 'away')) continue;
      const col = e.card;
      if (e.official) { out.push({ side: e.side, official: e.playerName || 'Team official', col }); continue; }
      out.push({
        side: e.side, ...(e.playerId ? { playerId: e.playerId } : {}), ...(e.playerName ? { playerName: e.playerName } : {}), col,
        ...(col === 'red' ? { off: 'banRed' } : {}), ...(col === 'yellow' ? { caution: true } : {}),
      });
    }
    return out;
  },
};

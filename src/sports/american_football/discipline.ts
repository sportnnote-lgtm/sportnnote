/**
 * SD-147 — American football ejections for the tournament discipline table
 * and suspension rule (src/sports/discipline.ts). A player ejected
 * (disqualified) from a game: NFHS high-school associations typically bar
 * him from the team's next game; the NFL / NCAA decide case by case (NCAA
 * targeting in the second half carries into the next game). The default here
 * — 1 match — is a placeholder the organiser edits. Verify against your
 * association's rules.
 */
import type { SportDisciplineSpec, CardMark } from '../discipline';
import type { AFEvent } from './engine';

export const AF_DISCIPLINE: SportDisciplineSpec = {
  sport: 'american_football',
  columns: [{ key: 'eject', icon: '🚫', label: 'Ejections' }],
  sendOffs: [{ key: 'banEject', ask: 'An ejection means', reason: 'ejection', def: 1 }],
  source: 'NFHS (state associations) / NCAA: an ejected player misses the next game — set your own',
  marks(m) {
    const ev = (m.state as { events?: unknown } | null | undefined)?.events;
    if (!Array.isArray(ev)) return [];
    const out: CardMark[] = [];
    for (const e of ev as AFEvent[]) {
      if (e?.type !== 'eject' || (e.side !== 'home' && e.side !== 'away')) continue;
      out.push({ side: e.side, ...(e.playerId ? { playerId: e.playerId } : {}), ...(e.playerName ? { playerName: e.playerName } : {}), col: 'eject', off: 'banEject' });
    }
    return out;
  },
};

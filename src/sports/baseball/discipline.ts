/**
 * SD-144 — baseball / softball ejections for the tournament discipline table
 * and suspension rule (src/sports/discipline.ts). An umpire ejects a player,
 * coach or manager from the game (OBR 8.01(d)); what it means for the next
 * game is the competition's call — the default sits the player out 1 game
 * (WBSC event regulations / leagues commonly do; organiser-editable — verify).
 * Officials' ejections are listed, never suspend a player.
 */
import type { SportDisciplineSpec, CardMark } from '../discipline';
import type { BaseballEvent } from './engine';

export const BASEBALL_DISCIPLINE: SportDisciplineSpec = {
  sport: 'baseball',
  columns: [{ key: 'eject', icon: '🟥', label: 'Ejections' }],
  sendOffs: [{ key: 'banEject', ask: 'An ejection means', reason: 'ejection', def: 1 }],
  source: 'OBR 8.01(d): the umpire ejects; the competition decides any further ban',
  marks(m) {
    const ev = (m.state as { events?: unknown } | null | undefined)?.events;
    if (!Array.isArray(ev)) return [];
    const out: CardMark[] = [];
    for (const e of ev as BaseballEvent[]) {
      if (e?.type !== 'eject' || (e.side !== 'home' && e.side !== 'away')) continue;
      const who = e.official ? { official: e.official } : { ...(e.on?.id ? { playerId: e.on.id } : {}), ...(e.on?.name ? { playerName: e.on.name } : {}) };
      out.push({ side: e.side, ...who, col: 'eject', off: 'banEject' });
    }
    return out;
  },
};

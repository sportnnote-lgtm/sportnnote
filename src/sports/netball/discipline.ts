/**
 * SD-146 — netball sanctions for the tournament discipline table and
 * suspension rule (src/sports/discipline.ts). World Netball Rules of Netball
 * (2024 edition; cautions removed): a warning, a suspension (the team plays a
 * player short) and ordering off (no further part in the match). What an
 * ordering off means for the next match is the competition's call — the
 * default sits the player out 1 match until the disciplinary body decides
 * (organiser-editable; verify against your competition's regulations).
 * Officials' sanctions are listed, never suspend a player.
 */
import type { SportDisciplineSpec, CardMark } from '../discipline';
import type { NetballEvent } from './engine';

export const NETBALL_DISCIPLINE: SportDisciplineSpec = {
  sport: 'netball',
  columns: [
    { key: 'warning', icon: '🟨', label: 'Warnings' },
    { key: 'suspension', icon: '⏱', label: 'Suspensions' },
    { key: 'off', icon: '🟥', label: 'Ordered off' },
  ],
  sendOffs: [
    { key: 'banOff', ask: 'Being ordered off means', reason: 'ordered off', def: 1 },
  ],
  source: 'World Netball: an ordered-off player takes no further part; the competition decides any further ban',
  marks(m) {
    const ev = (m.state as { events?: unknown } | null | undefined)?.events;
    if (!Array.isArray(ev)) return [];
    const out: CardMark[] = [];
    for (const e of ev as NetballEvent[]) {
      if (e?.type !== 'sanction' || (e.side !== 'home' && e.side !== 'away')) continue;
      const who = e.official ? { official: e.official } : { ...(e.playerId ? { playerId: e.playerId } : {}), ...(e.playerName ? { playerName: e.playerName } : {}) };
      if (e.sanction === 'warning') out.push({ side: e.side, ...who, col: 'warning' });
      else if (e.sanction === 'suspension') out.push({ side: e.side, ...who, col: 'suspension' });
      else if (e.sanction === 'off') out.push({ side: e.side, ...who, col: 'off', off: 'banOff' });
    }
    return out;
  },
};

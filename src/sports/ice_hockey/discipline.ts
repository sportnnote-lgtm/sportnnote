/**
 * SD-145 — ice hockey penalties for the tournament discipline table and
 * suspension rule (src/sports/discipline.ts). Columns: minors (incl. double
 * and bench minors), majors, misconducts, game misconducts, match penalties.
 * A match penalty sends the player off and the case to the disciplinary body
 * (IIHF: suspended until it decides) — default 1 match; a game misconduct
 * (and a major + game misconduct) ends the player's game — default no further
 * ban (competitions differ: NFHS and many leagues sit the player out the next
 * game — verify yours; organiser-editable). Bench minors are listed against
 * the team, never suspend a player.
 */
import type { SportDisciplineSpec, CardMark } from '../discipline';
import type { IceEvent } from './engine';

export const ICE_HOCKEY_DISCIPLINE: SportDisciplineSpec = {
  sport: 'ice_hockey',
  columns: [
    { key: 'minor', icon: '2′', label: 'Minor penalties' },
    { key: 'major', icon: '5′', label: 'Major penalties' },
    { key: 'misconduct', icon: '10′', label: 'Misconducts' },
    { key: 'gm', icon: 'GM', label: 'Game misconducts' },
    { key: 'match', icon: 'MP', label: 'Match penalties' },
  ],
  sendOffs: [
    { key: 'banGm', ask: 'A game misconduct means', reason: 'game misconduct', def: 0 },
    { key: 'banMatch', ask: 'A match penalty means', reason: 'match penalty', def: 1 },
  ],
  source: 'IIHF: a match penalty goes to the disciplinary body; game misconduct bans differ by competition',
  marks(m) {
    const ev = (m.state as { events?: unknown } | null | undefined)?.events;
    if (!Array.isArray(ev)) return [];
    const out: CardMark[] = [];
    for (const e of ev as IceEvent[]) {
      if (e?.type !== 'pen' || (e.side !== 'home' && e.side !== 'away')) continue;
      const who = e.pen === 'bench' && !e.playerId ? { official: 'Bench' } : { ...(e.playerId ? { playerId: e.playerId } : {}), ...(e.playerName ? { playerName: e.playerName } : {}) };
      switch (e.pen) {
        case 'minor': case 'bench': case 'double': out.push({ side: e.side, ...who, col: 'minor' }); break;
        case 'major': out.push({ side: e.side, ...who, col: 'major' }); break;
        case 'majorGm':
          out.push({ side: e.side, ...who, col: 'major' });
          out.push({ side: e.side, ...who, col: 'gm', off: 'banGm' });
          break;
        case 'misconduct': out.push({ side: e.side, ...who, col: 'misconduct' }); break;
        case 'gm': out.push({ side: e.side, ...who, col: 'gm', off: 'banGm' }); break;
        case 'match': out.push({ side: e.side, ...who, col: 'match', off: 'banMatch' }); break;
      }
    }
    return out;
  },
};

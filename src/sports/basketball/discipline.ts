/**
 * SD-126 — basketball disqualifications for the tournament discipline table
 * and suspension rule (src/sports/discipline.ts). FIBA Official Basketball
 * Rules: unsportsmanlike (U) and technical (T) fouls, a disqualifying (D) foul,
 * and a disqualification by rule for 2 U / 2 T / T + U (Art. 36–38). Fouling
 * out (5 personal fouls) is not discipline and never suspends. FIBA leaves
 * further sanctions to the competition: by default a D foul — or an ejection
 * the scorer logged themself (fighting, flagrant-2) — costs the next game, and
 * a 2 U / 2 T / T + U disqualification costs nothing more (organiser-editable;
 * check your regulations). U fouls can add up to a ban if the organiser wants.
 */
import type { SportDisciplineSpec, CardMark } from '../discipline';
import type { BBEvent } from './events';

export const BASKETBALL_DISCIPLINE: SportDisciplineSpec = {
  sport: 'basketball',
  columns: [
    { key: 'U', icon: 'U', label: 'Unsportsmanlike fouls' },
    { key: 'T', icon: 'T', label: 'Technical fouls' },
    { key: 'D', icon: 'D', label: 'Disqualifying fouls' },
    { key: 'DQ', icon: '🟥', label: 'Ejections' },
  ],
  sendOffs: [
    { key: 'banRed', ask: 'A disqualifying (D) foul or ejection means', reason: 'disqualifying foul / ejection', def: 1 },
    { key: 'banEject', ask: 'A disqualification for 2 U / 2 T / T + U means', reason: 'disqualified (2 U / 2 T / T + U)', def: 0 },
  ],
  caution: { col: 'U', plural: 'unsportsmanlike fouls', def: 0 },
  source: 'FIBA: further sanctions are the competition’s call',
  marks(m) {
    const ev = (m.state as { events?: unknown } | null | undefined)?.events;
    if (!Array.isArray(ev)) return [];
    const out: CardMark[] = [];
    const whoOf = (e: BBEvent) => ({ ...(e.pid ? { playerId: e.pid } : {}), ...(e.playerName ? { playerName: e.playerName } : {}) });
    for (const e of ev as BBEvent[]) {
      if (!e || (e.side !== 'home' && e.side !== 'away') || !e.playerName) continue;
      if (e.type === 'eject') {
        const rule = e.reason === '2T' || e.reason === '2U' || e.reason === 'T+U';
        out.push({ side: e.side, ...whoOf(e), col: 'DQ', off: rule ? 'banEject' : 'banRed' });
      } else if (e.type === 'foul') {
        if (e.foulType === 'unsportsmanlike') out.push({ side: e.side, ...whoOf(e), col: 'U', caution: true });
        else if (e.foulType === 'technical') out.push({ side: e.side, ...whoOf(e), col: 'T' });
        else if (e.foulType === 'disqualifying') out.push({ side: e.side, ...whoOf(e), col: 'D', off: 'banRed' });
      }
    }
    return out;
  },
};

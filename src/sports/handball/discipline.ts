/**
 * SD-126 — handball sanctions for the tournament discipline table and
 * suspension rule (src/sports/discipline.ts). IHF Rules of the Game, Rule 16:
 * a warning (yellow), 2-minute suspensions (the 3rd = disqualification,
 * 16:6d), a disqualification (red) and a disqualification with a written
 * report (blue card, 16:8 comment). A red card without a report ends at the
 * final whistle (default: no further ban); with a report (blue) the
 * disciplinary body decides — the default sits the player out 1 match until it
 * does (organiser-editable; check your competition's regulations). Team
 * officials' sanctions are listed, never suspend a player.
 */
import type { SportDisciplineSpec, CardMark } from '../discipline';
import type { HandballEvent } from './engine';

export const HANDBALL_DISCIPLINE: SportDisciplineSpec = {
  sport: 'handball',
  columns: [
    { key: 'yellow', icon: '🟨', label: 'Warnings' },
    { key: 'twoMin', icon: '2′', label: '2-minute suspensions' },
    { key: 'red', icon: '🟥', label: 'Disqualifications' },
    { key: 'blue', icon: '🟦', label: 'Blue cards (written report)' },
  ],
  sendOffs: [
    { key: 'banRed', ask: 'A red card (no report) means', reason: 'red card', def: 0 },
    { key: 'banBlue', ask: 'A blue card (written report) means', reason: 'blue card (report)', def: 1 },
  ],
  source: 'IHF Rule 16: a red card ends with the match; a blue card goes to the disciplinary body',
  marks(m) {
    const ev = (m.state as { events?: unknown } | null | undefined)?.events;
    if (!Array.isArray(ev)) return [];
    const out: CardMark[] = [];
    for (const e of ev as HandballEvent[]) {
      if (e?.type !== 'card' || (e.side !== 'home' && e.side !== 'away')) continue;
      const who = e.official ? { official: e.official } : { ...(e.playerId ? { playerId: e.playerId } : {}), ...(e.playerName ? { playerName: e.playerName } : {}) };
      if (e.card === 'yellow') out.push({ side: e.side, ...who, col: 'yellow' });
      else if (e.card === 'twoMin') {
        out.push({ side: e.side, ...who, col: 'twoMin' });
        // the 3rd suspension is a disqualification (16:6d) — no report
        if (e.third) out.push({ side: e.side, ...who, col: 'red', off: 'banRed' });
      } else if (e.card === 'red') {
        out.push({ side: e.side, ...who, col: 'red', off: e.blue ? 'banBlue' : 'banRed' });
        if (e.blue) out.push({ side: e.side, ...who, col: 'blue' });
      }
    }
    return out;
  },
};

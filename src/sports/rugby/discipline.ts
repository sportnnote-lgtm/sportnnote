/**
 * SD-143 — rugby cards for the tournament discipline table and suspension
 * rule (src/sports/discipline.ts). World Rugby Law 9: a yellow card is a
 * temporary suspension served in the match (10 minutes; sevens 2); a red card
 * sends the player off and goes to the competition's judicial process
 * (World Rugby Regulation 17 — the length of a ban is set case by case). The
 * defaults here are placeholders the organiser edits: a full red = 1 match
 * out until the hearing says otherwise; a 20-minute red (global law trial) =
 * no automatic ban; yellow cards don't add up (many competitions cite a
 * player after 3 — set it here). Verify against your competition's rules.
 */
import type { SportDisciplineSpec, CardMark } from '../discipline';
import type { RugbyEvent } from './engine';

export const RUGBY_DISCIPLINE: SportDisciplineSpec = {
  sport: 'rugby',
  columns: [
    { key: 'yellow', icon: '🟨', label: 'Yellow cards (sin-bin)' },
    { key: 'red20', icon: '🟥20', label: '20-minute red cards' },
    { key: 'red', icon: '🟥', label: 'Red cards' },
  ],
  sendOffs: [
    { key: 'banRed', ask: 'A red card means', reason: 'red card', def: 1 },
    { key: 'banRed20', ask: 'A 20-minute red card means', reason: '20-minute red card', def: 0 },
  ],
  caution: { col: 'yellow', plural: 'yellow cards', def: 0 },
  source: 'World Rugby Law 9 / Regulation 17: yellow cards are served in the match; a red card goes to the judicial process',
  marks(m) {
    const ev = (m.state as { events?: unknown } | null | undefined)?.events;
    if (!Array.isArray(ev)) return [];
    const out: CardMark[] = [];
    for (const e of ev as RugbyEvent[]) {
      if (e?.type !== 'card' || (e.side !== 'home' && e.side !== 'away')) continue;
      const who = e.official ? { official: e.official } : { ...(e.playerId ? { playerId: e.playerId } : {}), ...(e.playerName ? { playerName: e.playerName } : {}) };
      if (e.card === 'yellow') out.push({ side: e.side, ...who, col: 'yellow', caution: true });
      else {
        if (e.second) out.push({ side: e.side, ...who, col: 'yellow', caution: true });
        out.push({ side: e.side, ...who, col: e.red20 ? 'red20' : 'red', off: e.red20 ? 'banRed20' : 'banRed' });
      }
    }
    return out;
  },
};

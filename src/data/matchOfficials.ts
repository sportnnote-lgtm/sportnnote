/** Per-match officials (parity #11) — umpires, referees, commentator … stored in
 *  `matches.officials` (its own column, never `format`; REVIEW Decision 3).
 *  Slots are sport-labelled, following the `teamRoles.ts` pattern; everything
 *  else is generic. Name-only officials are fine (playerId is optional). */
import type { SportId } from '../core/types';

export type MatchOfficial = { slot: string; playerId?: string; name: string };

export interface OfficialSlot {
  key: string;
  label: string;
  /** heading in the one-line summary: [singular, plural] */
  group: [string, string];
}

const COMMENTATOR: OfficialSlot = { key: 'commentator', label: 'Commentator', group: ['Commentary', 'Commentary'] };
const UMPIRES: [string, string] = ['Umpire', 'Umpires'];

export const OFFICIAL_SLOTS: Partial<Record<SportId, OfficialSlot[]>> = {
  cricket: [
    { key: 'umpire1', label: 'Umpire 1', group: UMPIRES },
    { key: 'umpire2', label: 'Umpire 2', group: UMPIRES },
    { key: 'third_umpire', label: 'Third umpire', group: ['Third umpire', 'Third umpires'] },
    { key: 'match_referee', label: 'Match referee', group: ['Referee', 'Referees'] },
    COMMENTATOR,
  ],
  football: [
    { key: 'referee', label: 'Referee', group: ['Referee', 'Referees'] },
    { key: 'ar1', label: 'Assistant referee 1', group: ['Assistant referee', 'Assistant referees'] },
    { key: 'ar2', label: 'Assistant referee 2', group: ['Assistant referee', 'Assistant referees'] },
    { key: 'fourth_official', label: 'Fourth official', group: ['Fourth official', 'Fourth officials'] },
    COMMENTATOR,
  ],
  basketball: [
    { key: 'crew_chief', label: 'Crew chief', group: ['Crew chief', 'Crew chiefs'] },
    { key: 'umpire1', label: 'Umpire 1', group: UMPIRES },
    { key: 'umpire2', label: 'Umpire 2', group: UMPIRES },
    { key: 'table_official', label: 'Table official', group: ['Table official', 'Table officials'] },
    COMMENTATOR,
  ],
  // FIH: two field umpires, plus the technical officer at the table
  hockey: [
    { key: 'umpire1', label: 'Umpire 1', group: UMPIRES },
    { key: 'umpire2', label: 'Umpire 2', group: UMPIRES },
    { key: 'technical_officer', label: 'Technical officer', group: ['Technical officer', 'Technical officers'] },
    COMMENTATOR,
  ],
  // IHF: a pair of referees, plus the timekeeper and scorekeeper at the table
  handball: [
    { key: 'referee1', label: 'Referee 1', group: ['Referee', 'Referees'] },
    { key: 'referee2', label: 'Referee 2', group: ['Referee', 'Referees'] },
    { key: 'timekeeper', label: 'Timekeeper', group: ['Timekeeper', 'Timekeepers'] },
    { key: 'scorekeeper', label: 'Scorekeeper', group: ['Scorekeeper', 'Scorekeepers'] },
    COMMENTATOR,
  ],
  kabaddi: [
    { key: 'referee', label: 'Referee', group: ['Referee', 'Referees'] },
    { key: 'umpire1', label: 'Umpire 1', group: UMPIRES },
    { key: 'umpire2', label: 'Umpire 2', group: UMPIRES },
    COMMENTATOR,
  ],
  volleyball: [
    { key: 'referee1', label: '1st referee', group: ['Referee', 'Referees'] },
    { key: 'referee2', label: '2nd referee', group: ['Referee', 'Referees'] },
    { key: 'line_judge', label: 'Line judge', group: ['Line judge', 'Line judges'] },
    COMMENTATOR,
  ],
};

const DEFAULT_SLOTS: OfficialSlot[] = [
  { key: 'referee', label: 'Referee/Umpire', group: ['Referee', 'Referees'] },
  COMMENTATOR,
];

/** The official slots for a sport (a Referee/Umpire + Commentator fallback). */
export function slotsFor(sport: SportId | string | undefined): OfficialSlot[] {
  return (sport && OFFICIAL_SLOTS[sport as SportId]) || DEFAULT_SLOTS;
}

/** Commentator slots aren't seeded with the tournament's referees. */
export function isCommentarySlot(key: string): boolean {
  return key === COMMENTATOR.key;
}

/** Clean whatever came back from the DB / demo store: drops non-objects, rows
 *  without a slot or a name, slots the sport doesn't have (any known slot when
 *  no sport is given) and duplicate slots (first wins). Order follows the
 *  sport's slot order. */
export function normalizeOfficials(raw: unknown, sport?: SportId | string): MatchOfficial[] {
  if (!Array.isArray(raw)) return [];
  const slots = sport ? slotsFor(sport) : [...Object.values(OFFICIAL_SLOTS).flat(), ...DEFAULT_SLOTS] as OfficialSlot[];
  const order = new Map<string, number>();
  slots.forEach((s, i) => { if (!order.has(s.key)) order.set(s.key, i); });
  const seen = new Set<string>();
  const out: MatchOfficial[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const slot = typeof o.slot === 'string' ? o.slot : '';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!slot || !name || !order.has(slot) || seen.has(slot)) continue;
    seen.add(slot);
    const row: MatchOfficial = { slot, name };
    if (typeof o.playerId === 'string' && o.playerId) row.playerId = o.playerId;
    out.push(row);
  }
  return out.sort((a, b) => order.get(a.slot)! - order.get(b.slot)!);
}

/** "Umpires: A, B · Referee: C · Commentary: D" — groups in slot order. */
export function officialsLine(list: MatchOfficial[], sport: SportId | string | undefined): string {
  const slots = slotsFor(sport);
  const clean = normalizeOfficials(list, sport);
  const groups: { label: [string, string]; names: string[] }[] = [];
  for (const s of slots) {
    const o = clean.find((x) => x.slot === s.key);
    if (!o) continue;
    const g = groups.find((x) => x.label[0] === s.group[0]);
    if (g) g.names.push(o.name);
    else groups.push({ label: s.group, names: [o.name] });
  }
  return groups.map((g) => `${g.names.length > 1 ? g.label[1] : g.label[0]}: ${g.names.join(', ')}`).join(' · ');
}

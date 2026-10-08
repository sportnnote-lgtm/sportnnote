/**
 * Tournament details helpers (parity #09). Pure — node tests load this.
 */
import type { EventCategory, Tournament } from '../core/types';

/** Not soft-deleted — the ONE predicate every list uses (tournament lists,
 *  getTournament, search, Discover, match feeds). */
export const isLiveTournament = (t?: Pick<Tournament, 'deletedAt'> | null): boolean => !!t && !t.deletedAt;

/** The sport-format keys shown inline as "{Sport} basics": every preset plus the
 *  fields a sport flags `onCreate` (cricket: ball type, pitch). */
export function inlineFieldKeys(fields: { key: string; type: string; onCreate?: boolean }[] | undefined): string[] {
  return (fields ?? []).filter((f) => f.type === 'preset' || f.onCreate).map((f) => f.key);
}

/** Prefill the event category from the hosting organisation's type. */
export function categoryFromOrgType(type?: string | null): EventCategory | undefined {
  const t = (type ?? '').trim().toLowerCase();
  if (!t) return undefined;
  if (t.includes('school')) return 'school';
  if (t.includes('universit')) return 'university';
  if (t.includes('college')) return 'college';
  if (t.includes('company') || t.includes('corporate') || t.includes('office')) return 'corporate';
  if (t.includes('club') || t.includes('community') || t.includes('society') || t.includes('apartment')) return 'community';
  return undefined;
}

/** Venue suggestions: the tournament's own grounds first, then venues used
 *  before — de-duplicated case-insensitively, first spelling kept. */
export function venueOptions(grounds: string[] | undefined, known: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of [...(grounds ?? []), ...known]) {
    const name = v?.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

/** Add a ground to the list (trimmed, no case-insensitive duplicates). */
export function addGround(grounds: string[], name: string): string[] {
  const n = name.trim();
  if (!n || grounds.some((g) => g.toLowerCase() === n.toLowerCase())) return grounds;
  return [...grounds, n];
}

export const EVENT_CATEGORIES: { key: EventCategory; label: string }[] = [
  { key: 'school', label: '🏫 School' }, { key: 'college', label: '🎓 College' }, { key: 'university', label: '🏛 University' },
  { key: 'corporate', label: '🏢 Corporate' }, { key: 'community', label: '🏘 Community' }, { key: 'open', label: '🌐 Open' },
  { key: 'other', label: 'Other' },
];

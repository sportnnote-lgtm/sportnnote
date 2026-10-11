/**
 * SD-154: school team levels. One school fields several squads in a sport —
 * US Varsity / JV / Freshman, UK / AU / Gulf "U13 A" and "U13 B", "1st XI".
 * The level is stored on the per-sport team row (`teams.level`) and shown
 * after the team's name in fixtures and tables: "Greenwood JV".
 *
 * Pure — no RN imports.
 */

/** Level suggestions, US style first when the region uses US terms. */
export const LEVELS_US = ['Varsity', 'JV', 'Freshman', 'Middle School'];
export const LEVELS_INTL = ['A', 'B', 'C', '1st team', '2nd team'];

export function levelSuggestions(country?: string): string[] {
  return country === 'US' ? [...LEVELS_US, 'A', 'B'] : [...LEVELS_INTL, 'Varsity', 'JV'];
}

/** "Greenwood" + "JV" → "Greenwood JV". A name that already says its level
 *  ("Greenwood JV", "U13 A Greenwood") is left alone. */
export function teamLabel(t: { name: string; level?: string | null }): string {
  const lv = (t.level ?? '').trim();
  if (!lv) return t.name;
  const esc = lv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(^|\\s|\\()${esc}($|\\s|\\))`, 'i').test(t.name)) return t.name;
  return `${t.name} ${lv}`;
}

/** Sort key: the main team first, then Varsity → JV → Freshman, A → B → C, then by name. */
export function levelRank(level?: string | null): number {
  const l = (level ?? '').trim().toLowerCase();
  if (!l) return 0;
  const order = ['varsity', 'jv', 'junior varsity', 'freshman', 'middle school', '1st team', 'a', '2nd team', 'b', 'c', 'd'];
  const i = order.indexOf(l);
  return i >= 0 ? i + 1 : 50;
}

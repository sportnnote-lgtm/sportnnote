/**
 * SD-130 — the championships Indian school meets award, per age group and
 * gender (U14 Boys, U17 Girls …):
 *   • the category's champion HOUSE (overall boys' / girls' championship) —
 *     position points from every final in the category, relays included;
 *   • the INDIVIDUAL champion — the athlete with the most position points from
 *     individual finals in the category (relays score for the house).
 * Ties: by default the athlete with more golds, then silvers, then bronzes
 * (the medal count); still level → joint champions. A meet can instead make
 * equal points joint champions straight away (`champTie: 'share'`). Pure.
 */
import type { Category } from './model.ts';
import { categoryLabel, disciplineOf } from './model.ts';
import { meetFieldResults, topAthletes, type MeetEvent, type TopAthlete, type PointsSettings } from './athletics.ts';

export type ChampTie = 'medals' | 'share';

export const CHAMP_TIE_OPTIONS: { value: ChampTie; label: string }[] = [
  { value: 'medals', label: 'More golds, then silvers, then bronzes' },
  { value: 'share', label: 'Joint champions' },
];

export interface HouseRow { team: string; colorHex?: string; points: number; golds: number; silvers: number; bronzes: number }

export interface CategoryChampions {
  /** "U14-M" (age + gender) */
  key: string;
  /** "U14 Boys" */
  label: string;
  /** the category's house table, best first */
  houses: HouseRow[];
  /** the champion house(s) — more than one when level on points and medals */
  houseChampions: HouseRow[];
  /** athletes by points (individual finals), best first */
  athletes: TopAthlete[];
  /** the individual champion(s) */
  champions: TopAthlete[];
  /** how the champion was decided when points were level ('medals' / 'shared'), else undefined */
  tieNote?: string;
  /** finals finished in the category */
  finals: number;
}

const AGE_ORDER = ['U8', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'U19', 'U20', 'U23', 'Open', 'School', 'Youth', 'Junior', 'Senior', 'Masters'];

/** The championship category of an event: age group + gender (bodyweight, pool length and match length aside). */
export const champKey = (c?: Category): string => `${c?.age ?? 'Open'}-${c?.gender ?? 'X'}`;

const medalCmp = (a: { golds: number; silvers: number; bronzes: number }, b: { golds: number; silvers: number; bronzes: number }) =>
  b.golds - a.golds || b.silvers - a.silvers || b.bronzes - a.bronzes;

/** The leaders of a list sorted best first: everyone level with the first under the tie rule. */
function winners<T extends { points: number; golds: number; silvers: number; bronzes: number }>(rows: T[], tie: ChampTie): { top: T[]; note?: string } {
  if (!rows.length || rows[0].points <= 0) return { top: [] };
  const level = rows.filter((r) => r.points === rows[0].points);
  if (level.length === 1) return { top: level };
  if (tie === 'share') return { top: level, note: 'Level on points — joint champions.' };
  const best = level.filter((r) => medalCmp(r, level[0]) === 0);
  return { top: best, note: best.length === 1 ? 'Level on points — decided on golds, then silvers, then bronzes.' : 'Level on points and medals — joint champions.' };
}

/** Houses' points and medals from finished finals (relays count). */
export function houseTable(events: MeetEvent[], cfg: PointsSettings = {}): HouseRow[] {
  const by = new Map<string, HouseRow>();
  for (const r of meetFieldResults(events, cfg)) {
    for (const a of r.awards) {
      const name = a.team?.name;
      if (!name) continue;
      const h = by.get(name) ?? { team: name, colorHex: a.team?.colorHex, points: 0, golds: 0, silvers: 0, bronzes: 0 };
      h.points = Math.round((h.points + a.points) * 100) / 100;
      if (a.medal === 'gold') h.golds += 1; else if (a.medal === 'silver') h.silvers += 1; else if (a.medal === 'bronze') h.bronzes += 1;
      by.set(name, h);
    }
  }
  return [...by.values()].sort((a, b) => b.points - a.points || medalCmp(a, b) || a.team.localeCompare(b.team));
}

/** Every category's champions (categories with at least one finished final), youngest first. */
export function categoryChampions(events: MeetEvent[], cfg: PointsSettings = {}, tie: ChampTie = 'medals'): CategoryChampions[] {
  const groups = new Map<string, { cat?: Category; events: MeetEvent[] }>();
  for (const e of events) {
    // a combined event's own events aren't separate finals; its total is
    if (!disciplineOf(e.discipline)) continue;
    const k = champKey(e.category);
    const g = groups.get(k) ?? { cat: e.category, events: [] };
    g.events.push(e);
    groups.set(k, g);
  }
  const out: CategoryChampions[] = [];
  for (const [key, g] of groups) {
    const houses = houseTable(g.events, cfg);
    const finals = meetFieldResults(g.events, cfg).length;
    if (!finals) continue;
    const athletes = topAthletes(g.events, cfg);
    const hw = winners(houses, tie);
    const aw = winners(athletes, tie);
    out.push({
      key, label: categoryLabel({ age: g.cat?.age, gender: g.cat?.gender }), houses, houseChampions: hw.top, athletes, champions: aw.top, tieNote: aw.note, finals,
    });
  }
  const ageIdx = (k: string) => { const i = AGE_ORDER.indexOf(k.split('-')[0]); return i < 0 ? 99 : i; };
  return out.sort((a, b) => ageIdx(a.key) - ageIdx(b.key) || a.key.localeCompare(b.key));
}

/** The meet's tie rule (`formats[sport].champTie`). */
export const champTieOf = (fmt?: Record<string, unknown>): ChampTie => (fmt?.champTie === 'share' ? 'share' : 'medals');

/** A share / notice-board text: "U14 Boys — Champion house: Red House (64 pts) · Individual champion: Asha Rao (Red House) 24 pts". */
export function championsText(list: CategoryChampions[], title?: string): string {
  const lines = list.map((c) => {
    const house = c.houseChampions.length ? `Champion house: ${c.houseChampions.map((h) => h.team).join(' & ')} (${c.houseChampions[0].points} pts)` : '';
    const ind = c.champions.length ? `Individual champion${c.champions.length > 1 ? 's' : ''}: ${c.champions.map((a) => `${a.name}${a.team ? ` (${a.team})` : ''}`).join(' & ')} ${c.champions[0].points} pts` : '';
    return `${c.label} — ${[house, ind].filter(Boolean).join(' · ')}`;
  });
  return [title ? `🏆 ${title} — champions` : '🏆 Champions', ...lines].join('\n');
}

/**
 * SD-131 — a team / house page for the event sports (athletics, swimming,
 * weightlifting, shooting, archery, rowing, canoe, cycling): per sport, the
 * medals and position points the team won, the finals it reached, its latest
 * results and the records its athletes hold. The same finals and points the
 * tournament's medal table counts (meetFieldResults), so the two never disagree.
 * PURE.
 */
import { disciplineOf, categoryLabel, type Category } from './model.ts';
import { formatMark } from './marks.ts';
import { rankEntries } from './rank.ts';
import { meetFieldResults, type MeetEvent, type PointsSettings } from './athletics.ts';
import type { RecordMark } from './records.ts';
import type { Award } from './medals.ts';

export interface TeamRef { id: string; name: string }

export interface TeamEventResult {
  /** the final's phase id (opens the result sheet) */
  phaseId: string;
  event: string;
  tournament?: string;
  date: string;
  /** the athlete / relay / crew */
  name: string;
  athleteId?: string;
  position: number;
  medal?: 'gold' | 'silver' | 'bronze';
  mark?: string;
  points: number;
}

export interface TeamRecord { scope: string; event: string; holder: string; mark: string; date?: string }

export interface TeamEventSportSummary {
  sport: string;
  golds: number;
  silvers: number;
  bronzes: number;
  points: number;
  /** finals with a placed entrant from this team */
  finals: number;
  /** latest first */
  results: TeamEventResult[];
  records: TeamRecord[];
}

export interface TeamMeetInput {
  tournamentId: string;
  tournamentName?: string;
  /** every event-sport event of the tournament (getMeet(…, 'all')) */
  events: MeetEvent[];
  /** points settings per sport (eventMeetSettings) */
  points: (sport: string) => PointsSettings;
  /** record book per sport (the tournament's formats[sport].records) */
  records?: Record<string, RecordMark[]>;
}

/**
 * Does this award score for the team? Its entry's team (id, or the name of a
 * snapshot with no id), else — an athlete entered with no team — a squad member.
 */
export function awardIsTeams(a: Pick<Award, 'team'>, athleteId: string | undefined, team: TeamRef, squad: Set<string>): boolean {
  if (a.team?.id) return a.team.id === team.id;
  if (a.team?.name) return a.team.name.trim().toLowerCase() === team.name.trim().toLowerCase();
  return !!athleteId && squad.has(athleteId);
}

const sportOfDiscipline = (d: string) => disciplineOf(d)?.sport;

/** The team's event-sport results across the meets it took part in. */
export function teamEventSummary(team: TeamRef, squadIds: string[], meets: TeamMeetInput[], o: { latest?: number } = {}): TeamEventSportSummary[] {
  const squad = new Set(squadIds);
  const by = new Map<string, TeamEventSportSummary>();
  const get = (sport: string) => {
    let s = by.get(sport);
    if (!s) { s = { sport, golds: 0, silvers: 0, bronzes: 0, points: 0, finals: 0, results: [], records: [] }; by.set(sport, s); }
    return s;
  };
  for (const m of meets) {
    for (const ev of m.events) {
      const sport = sportOfDiscipline(ev.discipline);
      if (!sport) continue;
      const fr = meetFieldResults([ev], m.points(sport))[0];
      if (!fr) continue;
      // the final's rows: athlete ids and marks by entry
      // SD-93: a combined event's medals come with its last event
      const combined = ev.phases.some((p) => !!p.format.combined);
      const fin = combined
        ? [...ev.phases].sort((a, b) => b.format.phaseNo - a.format.phaseNo)[0]
        : ev.phases.find((p) => p.format.phase === 'final' && p.status === 'completed');
      const athleteOf = new Map<string, string | undefined>();
      for (const p of ev.phases) for (const e of p.entries) athleteOf.set(e.id, e.athleteId);
      const markOf = new Map<string, string>();
      const def = disciplineOf(ev.discipline);
      if (fin && def && !combined) for (const r of rankEntries(fin.entries, def)) if (r.bestText) markOf.set(r.id, r.bestText);
      const mine = fr.awards.filter((a) => awardIsTeams(a, athleteOf.get(a.entryId) ?? (combined ? a.entryId : undefined), team, squad));
      if (!mine.length) continue;
      const s = get(sport);
      s.finals += 1;
      for (const a of mine) {
        if (a.medal === 'gold') s.golds += 1; else if (a.medal === 'silver') s.silvers += 1; else if (a.medal === 'bronze') s.bronzes += 1;
        s.points += a.points;
        s.results.push({
          phaseId: fin?.id ?? '', event: ev.title, tournament: m.tournamentName, date: fin?.date ?? '',
          name: a.name, athleteId: athleteOf.get(a.entryId), position: a.position, medal: a.medal, points: a.points,
          ...(markOf.get(a.entryId) ? { mark: markOf.get(a.entryId) } : {}),
        });
      }
    }
    // records the team's athletes hold in this meet's book
    for (const [sport, book] of Object.entries(m.records ?? {})) {
      for (const r of book) {
        const owned = r.team ? r.team.trim().toLowerCase() === team.name.trim().toLowerCase() : false;
        if (!owned) continue;
        const d = disciplineOf(r.discipline);
        const cat = categoryFromKey(r.category);
        get(sport).records.push({
          scope: r.scope, holder: r.holder, date: r.date,
          event: [d?.label ?? r.discipline, cat].filter(Boolean).join(' '),
          mark: d ? formatMark(r.value, d) : String(r.value),
        });
      }
    }
  }
  const n = o.latest ?? 5;
  for (const s of by.values()) {
    s.points = Math.round(s.points * 100) / 100;
    s.results.sort((a, b) => b.date.localeCompare(a.date) || a.position - b.position);
    s.results = s.results.slice(0, n);
  }
  return [...by.values()].sort((a, b) => b.golds - a.golds || b.silvers - a.silvers || b.bronzes - a.bronzes || b.points - a.points || a.sport.localeCompare(b.sport));
}

/** "U14-F" → "U14 Girls" (categoryKey back to a label; unknown parts are dropped). */
export function categoryFromKey(key: string): string {
  const [age, gender] = key.split('-');
  const c: Category = { age: age && age !== 'open' ? age : undefined, gender: (gender === 'M' || gender === 'F' || gender === 'X') ? gender : undefined } as Category;
  const rest = key.split('-').slice(2).filter((x) => x && !/^(LCM|SCM|\d+sh)$/.test(x));
  const label = categoryLabel({ ...c, ...(rest[0] ? { weightClass: rest[0] } : {}) } as Category);
  return label === 'Open' && !age ? '' : label;
}

export const medalIcon = (m?: string) => (m === 'gold' ? '🥇' : m === 'silver' ? '🥈' : m === 'bronze' ? '🥉' : '');

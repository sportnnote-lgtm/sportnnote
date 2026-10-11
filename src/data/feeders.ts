/**
 * SD-154: feeder tournaments — competitions that qualify teams into another
 * (UK county → regional → national rounds; Singapore NSG zonal → national; US
 * conference → state playoffs; Gulf qualifiers). A FEEDER tournament carries a
 * link `{ tournamentId, topN, per }`: its top N per group (or overall / from the
 * final) go through to the RECEIVING tournament, where they show a "Qualified
 * from X" badge and the organiser adds them in one tap.
 *
 * Pure: who qualifies, from the feeder's matches. I/O lives in data/repos.ts.
 */
import type { Match, SportId } from '../core/types.ts';
import { teamStandings, defaultStandingsConfig, type StandingsConfig } from './standings.ts';
import { groupTables } from './groups.ts';
import { isEliminationStage } from './bracket.ts';

export interface QualifiesTo {
  /** the receiving tournament */
  tournamentId: string;
  /** its name, kept for the badge and the feeder page */
  tournamentName?: string;
  /** how many go through: per group, or overall / from the knockout */
  topN: number;
  /** 'group' = top N of every group; 'overall' = the top N of the whole event
   *  (the league table, or the knockout's final places) */
  per: 'group' | 'overall';
  /** only this sport's results count (a multi-sport feeder) */
  sport?: SportId;
}

export interface FeederQualifier {
  teamId: string;
  name: string;
  /** "Group A 1st", "Winner", "Runner-up", "League 3rd" */
  how: string;
  /** final position (1 = best) within its group / the event */
  rank: number;
  group?: string;
}

/** A stored link, or undefined when it isn't a usable one. */
export function readQualifiesTo(v: unknown): QualifiesTo | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const topN = Number(o.topN);
  if (typeof o.tournamentId !== 'string' || !o.tournamentId || !Number.isFinite(topN) || topN < 1) return undefined;
  return {
    tournamentId: o.tournamentId, topN: Math.min(64, Math.floor(topN)), per: o.per === 'overall' ? 'overall' : 'group',
    ...(typeof o.tournamentName === 'string' ? { tournamentName: o.tournamentName } : {}),
    ...(typeof o.sport === 'string' ? { sport: o.sport as SportId } : {}),
  };
}

const ORD = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

const side = (m: Match, which: 'home' | 'away') => (which === 'home' ? m.homeTeam : m.awayTeam);

/** The knockout's final places: winner, runner-up, then the third-place match
 *  (or both beaten semi-finalists, sharing 3rd). Empty until the final is done. */
export function knockoutPlaces(matches: Match[]): FeederQualifier[] {
  const done = (m: Match) => m.status === 'completed' && (m.winner === 'home' || m.winner === 'away');
  const final = matches.find((m) => (m.stage === 'final' || m.stage === 'gf2' || m.stage === 'gf') && done(m) && (m.stage !== 'gf' || !matches.some((x) => x.stage === 'gf2')));
  if (!final) return [];
  const w = side(final, final.winner as 'home' | 'away');
  const l = side(final, final.winner === 'home' ? 'away' : 'home');
  const out: FeederQualifier[] = [
    { teamId: w.id, name: w.name, how: 'Winner', rank: 1 },
    { teamId: l.id, name: l.name, how: 'Runner-up', rank: 2 },
  ];
  const third = matches.find((m) => m.stage === 'third' && done(m));
  if (third) {
    const t3 = side(third, third.winner as 'home' | 'away');
    const t4 = side(third, third.winner === 'home' ? 'away' : 'home');
    out.push({ teamId: t3.id, name: t3.name, how: '3rd', rank: 3 }, { teamId: t4.id, name: t4.name, how: '4th', rank: 4 });
  } else {
    for (const sf of matches.filter((m) => m.stage === 'sf' && done(m))) {
      const lo = side(sf, sf.winner === 'home' ? 'away' : 'home');
      if (!out.some((q) => q.teamId === lo.id)) out.push({ teamId: lo.id, name: lo.name, how: 'Semi-finalist', rank: 3 });
    }
  }
  return out;
}

/**
 * Who goes through from a feeder: top N of each group (by the group tables'
 * tie-breakers), or overall — the knockout's places when there is a finished
 * final, else the league table. Only finished results count; a group with
 * unplayed matches still gives its current top N (`provisional`).
 */
export function feederQualifiers(matches: Match[], sport: SportId, link: Pick<QualifiesTo, 'topN' | 'per'>, cfg: StandingsConfig = defaultStandingsConfig(sport)): { qualifiers: FeederQualifier[]; provisional: boolean } {
  const ms = matches.filter((m) => m.sport === sport && m.status !== 'cancelled');
  const n = Math.max(1, link.topN);
  const pending = (list: Match[]) => list.some((m) => m.status !== 'completed');
  if (link.per === 'group') {
    const grouped = ms.filter((m) => !!m.group && !isEliminationStage(m.stage));
    if (grouped.length) {
      const tables = groupTables(grouped, sport, cfg);
      const qualifiers = tables.flatMap((g) => g.rows.slice(0, n).map((r, i) => ({ teamId: r.teamId, name: r.name, how: `Group ${g.name} ${ORD(i + 1)}`, rank: i + 1, group: g.name })));
      return { qualifiers, provisional: pending(grouped) };
    }
  }
  const ko = knockoutPlaces(ms);
  if (ko.length) return { qualifiers: ko.filter((q) => q.rank <= n), provisional: false };
  const league = ms.filter((m) => !isEliminationStage(m.stage));
  const rows = teamStandings(league, sport, cfg, 'league');
  return {
    qualifiers: rows.slice(0, n).map((r, i) => ({ teamId: r.teamId, name: r.name, how: `${ORD(i + 1)} in the table`, rank: i + 1 })),
    provisional: pending(league) || ms.some((m) => isEliminationStage(m.stage) && m.status !== 'completed'),
  };
}

/** "Top 2 of each group go to National Finals" — the feeder's line. */
export function qualifiesLine(link: QualifiesTo): string {
  const to = link.tournamentName ?? 'the next round';
  return link.per === 'group'
    ? `Top ${link.topN} of each group go through to ${to}`
    : link.topN === 1 ? `The winner goes through to ${to}` : `The top ${link.topN} go through to ${to}`;
}

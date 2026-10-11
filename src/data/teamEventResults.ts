/**
 * SD-131 — what a team / house page shows for the event sports and golf stroke
 * play (TeamProfileScreen read matches only, so a house that won the sports day
 * said "No results yet").
 *
 *  - Event sports: every tournament where the team (field_entries.team_id, or
 *    the entry's team snapshot) or one of its squad has an entry → that meet's
 *    events → teamEventSummary (medals, points, finals, latest results, records)
 *    with the meet's own points settings — the same numbers as its medal table.
 *  - Golf stroke play: the squad's round lines (stat_lines with an event) →
 *    rounds played, round wins, best 18-hole score.
 */
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { demo } from './demoStore';
import { getPlayers, getStatLinesForPlayers, getTournaments } from './repos';
import { getMeet, getRecordBook, getResultsPhases, resultEntries } from './resultsStore';
import { getFieldEntries } from './golf';
import { eventMeetSettings, teamEventSummary, groupMeet, phaseOf, type TeamEventSportSummary, type TeamMeetInput, type RecordMark, type MeetPhase } from './results';
import { isEventSport, EVENT_SPORTS, eventPrefix } from '../sports/eventSports';
import { golfProfileSummary } from '../sports/golf/engine';

export interface TeamGolfSummary { rounds: number; wins: number; best18: number | null; best9: number | null }
export interface TeamEventResults { sports: TeamEventSportSummary[]; golf: TeamGolfSummary | null }

const live = () => isSupabaseConfigured && !!supabase;

/** Where the team (its id, or a house name on the entry) or one of its squad
 *  has a results-engine entry: the tournaments, and the event keys of casual
 *  events (no tournament — a friendly inter-school meet). */
async function whereEntered(team: { id: string; name: string }, squadIds: string[]): Promise<{ tids: string[]; casual: string[] }> {
  let phases: { id: string; tournamentId?: string | null; sport: string; eventKey?: string }[];
  if (!live()) {
    const squad = new Set(squadIds);
    const name = team.name.trim().toLowerCase();
    const evIds = new Set(demo.fieldEntries
      .filter((e) => {
        const t = (e.result as { team?: { id?: string; name?: string } } | null)?.team;
        return e.teamId === team.id || (!!e.playerId && squad.has(e.playerId)) || t?.id === team.id || (!t?.id && t?.name?.trim().toLowerCase() === name);
      })
      .map((e) => e.eventId));
    phases = demo.fieldEvents.filter((e) => evIds.has(e.id)).map((e) => ({ id: e.id, tournamentId: e.tournamentId, sport: e.sport, eventKey: phaseOf(e)?.eventKey }));
  } else {
    const sb = supabase!;
    const eventIds = new Set<string>();
    const add = (r: { data: unknown; error: unknown }) => { if (!r.error) for (const x of (r.data ?? []) as { event_id: string }[]) eventIds.add(x.event_id); };
    const res = await Promise.all([
      sb.from('field_entries').select('event_id').eq('team_id', team.id).limit(2000),   // after 0051
      sb.from('field_entries').select('event_id').eq('result->team->>id', team.id).limit(2000),
      sb.from('field_entries').select('event_id').eq('result->team->>name', team.name).limit(2000),
      squadIds.length ? sb.from('field_entries').select('event_id').in('player_id', squadIds.slice(0, 300)).limit(2000) : Promise.resolve({ data: [], error: null }),
    ]);
    res.forEach(add);
    const ids = [...eventIds];
    phases = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from('field_events').select('id, tournament_id, sport, format').in('id', ids.slice(i, i + 200));
      for (const r of (data ?? []) as { id: string; tournament_id: string | null; sport: string; format: { results?: { eventKey?: string } } | null }[]) {
        phases.push({ id: r.id, tournamentId: r.tournament_id, sport: r.sport, eventKey: r.format?.results?.eventKey });
      }
    }
  }
  const ev = phases.filter((p) => isEventSport(p.sport));
  return {
    tids: [...new Set(ev.filter((p) => p.tournamentId).map((p) => p.tournamentId!))],
    casual: [...new Set(ev.filter((p) => !p.tournamentId && p.eventKey).map((p) => p.eventKey!))],
  };
}

/** Casual events (no tournament) as one meet with each sport's default points. */
async function casualMeet(keys: string[], nameOf: (id: string) => string): Promise<TeamMeetInput | null> {
  if (!keys.length) return null;
  const phases = (await Promise.all(keys.slice(0, 40).map((k) => getResultsPhases({ eventKey: k })))).flat().filter((p) => !p.tournamentId);
  if (!phases.length) return null;
  const entries = await getFieldEntries(phases.map((p) => p.id));
  const mp: MeetPhase[] = phases.flatMap((p) => {
    const f = phaseOf(p);
    return f ? [{ id: p.id, format: f, status: p.status as MeetPhase['status'], date: p.startsAt, entries: resultEntries(entries.filter((e) => e.eventId === p.id), nameOf) }] : [];
  });
  const events = groupMeet(mp);
  // a casual event's records (no tournament) live in the demo store only
  const records: Record<string, RecordMark[]> = {};
  for (const sp of new Set(phases.map((p) => p.sport))) records[sp] = await getRecordBook(undefined, sp).catch(() => []);
  return { tournamentId: '', events, records, points: (s) => { const c = eventMeetSettings(s, undefined); return { positionPoints: c.positionPoints, relayFactor: c.relayFactor }; } };
}

export async function getTeamEventResults(team: { id: string; name: string }, squadIds: string[]): Promise<TeamEventResults> {
  const [{ tids, casual }, lines] = await Promise.all([
    whereEntered(team, squadIds).catch(() => ({ tids: [] as string[], casual: [] as string[] })),
    getStatLinesForPlayers(squadIds).catch(() => []),
  ]);
  let sports: TeamEventSportSummary[] = [];
  if (tids.length || casual.length) {
    const [players, tours] = await Promise.all([getPlayers(), getTournaments({ includeDeleted: true })]);
    const names = new Map(players.map((p) => [p.id, p.fullName]));
    const nameOf = (id: string) => names.get(id) ?? 'Athlete';
    const meets: TeamMeetInput[] = await Promise.all(tids.slice(0, 20).map(async (tid) => {
      const t = tours.find((x) => x.id === tid);
      const events = await getMeet(tid, nameOf, 'all');
      const used = [...new Set(events.map((e) => EVENT_SPORTS.find((s) => e.discipline.startsWith(eventPrefix(s)))).filter((s): s is (typeof EVENT_SPORTS)[number] => !!s))];
      const records: Record<string, RecordMark[]> = {};
      await Promise.all(used.map(async (s) => { records[s] = await getRecordBook(tid, s).catch(() => []); }));
      return {
        tournamentId: tid, tournamentName: t?.name, events, records,
        points: (s: string) => {
          const cfg = eventMeetSettings(s, t?.formats?.[s as keyof NonNullable<typeof t.formats>] as Record<string, unknown> | undefined);
          return { positionPoints: cfg.positionPoints, relayFactor: cfg.relayFactor };
        },
      };
    }));
    const friendly = await casualMeet(casual, nameOf).catch(() => null);
    sports = teamEventSummary(team, squadIds, friendly ? [...meets, friendly] : meets);
  }
  const golfLines = lines.filter((l) => l.sport === 'golf' && !!l.eventId);
  const g = golfLines.length ? golfProfileSummary(golfLines) : null;
  return {
    sports,
    golf: g ? { rounds: golfLines.length, wins: golfLines.filter((l) => l.won).length, best18: g.best18, best9: g.best9 } : null,
  };
}

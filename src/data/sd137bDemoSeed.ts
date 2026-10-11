/** SD-137b demo data — DEMO MODE ONLY (no Supabase configured): registers
 *  `__sportnnoteDemo.seedTeamEvents()` so a static demo export can show the
 *  team events without typing every individual score first. Made-up names.
 *  Everything goes through the normal repo / results layer.
 *   - "Lakeside Schools Target Meet": 4 houses × (3 boys + 1 girl, plus one
 *     more girl for the mixed events); archery Recurve 30 m School Boys and
 *     Girls ranking rounds (complete, no match play); shooting 10 m Air Pistol
 *     School Boys (40 shots, complete); a 10 m Air Rifle mixed team event
 *     (4 teams, medal matches) with its qualification entered.
 *  Then add the team events on the meet (Team (3), Mixed team, Team of 3,
 *  team pursuit) from the usual "＋ Event" screens. */
import { isSupabaseConfigured } from '../core/supabase';
import { createTournament, createTeam, invitePerson, setTeamRoster, addTournamentTeams, getTournaments } from './repos';
import { createResultsEvent, getPhaseEntries, saveEntryResult, setPhaseStatus } from './resultsStore';
import { parseEnd, setEnd, setSeries, type EntryResult } from './results';
import type { Player, Team } from '../core/types';

const NAME = 'Lakeside Schools Target Meet';
const HOUSES: [string, string, string][] = [['Teal House', 'TEA', '#1FB5A8'], ['Amber House', 'AMB', '#F2A33A'], ['Coral House', 'COR', '#F06A5B'], ['Slate House', 'SLA', '#6B7C93']];
const BOYS = [['Arnav', 'Bharat', 'Chirag'], ['Dhruv', 'Eshan', 'Farhan'], ['Gautam', 'Harsh', 'Imran'], ['Jatin', 'Kunal', 'Laksh']];
const GIRLS = [['Mira', 'Nandini'], ['Ojasvi', 'Pari'], ['Riya', 'Saanvi'], ['Tanvi', 'Uma']];
const SURNAME = ['Bhat', 'Desai', 'Kamath', 'Shetty'];

/** A deterministic ranking round of 12 ends of 6 for archer `k` (some X and 10s, a few weaker ends). */
function archEnds(k: number): string[] {
  const base = ['10 9 9 8 8 7', '9 9 8 8 7 7', 'X 10 9 9 8 8', '9 8 8 7 7 6'];
  return Array.from({ length: 12 }, (_, i) => base[(i + k) % 4]);
}

export async function seedTeamEvents(): Promise<string> {
  if (isSupabaseConfigured) return 'Demo mode only.';
  if ((await getTournaments()).some((t) => t.name === NAME)) return `Already seeded "${NAME}".`;
  const boys: Player[][] = [], girls: Player[][] = [];
  const teams: Team[] = [];
  for (let h = 0; h < HOUSES.length; h++) {
    const [name, short, color] = HOUSES[h];
    const b: Player[] = [], g: Player[] = [];
    for (const n of BOYS[h]) { const p = (await invitePerson({ name: `${n} ${SURNAME[h]}` })).player; Object.assign(p, { gender: 'Male', dob: '2011-05-10', houseName: name, houseColor: color }); b.push(p); }
    for (const n of GIRLS[h]) { const p = (await invitePerson({ name: `${n} ${SURNAME[h]}` })).player; Object.assign(p, { gender: 'Female', dob: '2011-08-22', houseName: name, houseColor: color }); g.push(p); }
    const t = await createTeam({ name, shortName: short, sport: 'archery', colorHex: color });
    await setTeamRoster(t.id, [...b, ...g].map((p) => p.id));
    boys.push(b); girls.push(g); teams.push(t);
  }
  const today = new Date().toISOString().slice(0, 10);
  const tour = await createTournament({
    name: NAME, hostName: 'Lakeside School', sports: ['archery', 'shooting', 'cycling', 'athletics'], startDate: today, endDate: today, structure: 'league', formats: {},
  } as never);
  await addTournamentTeams(tour.id, teams.map((t) => t.id));
  const teamOf = (h: number) => ({ id: teams[h].id, name: HOUSES[h][0], colorHex: HOUSES[h][2] });

  // archery: boys' and girls' ranking rounds, complete
  const arch = async (title: string, list: { p: Player; h: number }[], gender: 'M' | 'F') => {
    const ev = await createResultsEvent({
      discipline: 'arch.r30', category: { age: 'School', gender }, tournamentId: tour.id, title,
      entrants: list.map(({ p, h }) => ({ playerId: p.id, name: p.fullName, team: teamOf(h) })), plan: [{ phase: 'final', heats: 1 }], lanes: 'seeded',
    });
    const rows = await getPhaseEntries([ev.id]);
    for (const [k, e] of rows.entries()) {
      let r = (e.result ?? {}) as EntryResult;
      archEnds(k).forEach((t, i) => { const p = parseEnd(t, 6); if (!('error' in p)) r = setEnd(r, i, p.arrows); });
      await saveEntryResult(e.id, r);
    }
    await setPhaseStatus(ev.id, 'live');
  };
  await arch('Recurve 30 m School Boys', boys.flatMap((b, h) => b.map((p) => ({ p, h }))), 'M');
  await arch('Recurve 30 m School Girls', girls.flatMap((g, h) => g.map((p) => ({ p, h }))), 'F');

  // shooting: 10 m Air Pistol School Boys, 40 shots (4 series), complete
  const sh = await createResultsEvent({
    discipline: 'shoot.10map', category: { age: 'School', gender: 'M', shots: 40 }, tournamentId: tour.id, title: '10 m Air Pistol School Boys · 40 shots',
    entrants: boys.flatMap((b, h) => b.map((p) => ({ playerId: p.id, name: p.fullName, team: teamOf(h) }))), plan: [{ phase: 'final', heats: 1 }], lanes: 'seeded', shootEntry: 'series',
  });
  for (const [k, e] of (await getPhaseEntries([sh.id])).entries()) {
    let r = (e.result ?? {}) as EntryResult;
    for (let i = 0; i < 4; i++) r = setSeries(r, i, 'integer', { total: 88 + ((k * 3 + i * 5) % 9), xs: (k + i) % 4 });
    await saveEntryResult(e.id, r);
  }
  await setPhaseStatus(sh.id, 'live');

  // shooting: 10 m Air Rifle mixed team — 4 pairs, qualification entered; the best 4 shoot the medal matches
  const mx = await createResultsEvent({
    discipline: 'shoot.10marx', category: { age: 'School', gender: 'X', shots: 40 }, tournamentId: tour.id, title: '10 m Air Rifle Mixed Team School · 40 shots',
    entrants: HOUSES.map((_, h) => ({ name: `${HOUSES[h][0].split(' ')[0]} · ${boys[h][0].fullName.split(' ')[0]} / ${girls[h][0].fullName.split(' ')[0]}`, team: teamOf(h), members: [{ playerId: boys[h][0].id, name: boys[h][0].fullName }, { playerId: girls[h][0].id, name: girls[h][0].fullName }] })),
    plan: [{ phase: 'qualification', heats: 1, progression: { fillTo: 4 } }, { phase: 'final', heats: 1 }], lanes: 'seeded', shootEntry: 'series', shootMatch: true,
  });
  for (const [k, e] of (await getPhaseEntries([mx.id])).entries()) {
    let r = (e.result ?? {}) as EntryResult;
    for (let i = 0; i < 4; i++) r = setSeries(r, i, 'decimal', { total: Math.round((100 + ((k * 7 + i * 3) % 6) + k * 0.3) * 10) / 10 });
    await saveEntryResult(e.id, r);
  }
  await setPhaseStatus(mx.id, 'live');
  return `Seeded "${NAME}" — open it from Tournaments.`;
}

if (!isSupabaseConfigured) {
  const g = globalThis as unknown as Record<string, unknown>;
  g.__sportnnoteDemo = { ...((g.__sportnnoteDemo as object | undefined) ?? {}), seedTeamEvents };
}

/** SD-134 demo data — DEMO MODE ONLY (no Supabase configured): registers
 *  `__sportnnoteDemo.seedChessSwiss()` and `__sportnnoteDemo.seedGolfDivisions()`
 *  so a static demo export can show the Swiss round sheet, field management,
 *  category prizes and golf divisions without clicking through setup. Made-up
 *  names. Everything goes through the normal repo layer.
 *   - "Riverside Rapid Open": 7 players (ratings, genders, birth dates) + 1
 *     registered late entrant; Swiss, 4 rounds; round 1 paired and created
 *     (no results yet — enter them on the round sheet).
 *   - "Hillview Junior Golf Day": one 18-hole round, 8 juniors mid-round. */
import { isSupabaseConfigured } from '../core/supabase';
import { createTournament, createTeam, invitePerson, setTeamRoster, addTournamentTeams, createMatch, getTournaments, getMyPlayerId } from './repos';
import { createGolfCourse, createFieldEvent, addFieldEntries, saveCard, setFieldEventStatus } from './golf';
import { swissRound1 } from './swiss';
import { mergeStructure } from './structureConfig';
import { FIDE_SWISS_ORDER } from './standings';
import { BOARD_KEY } from '../sports/chess/roundSheet';
import type { Player, Team } from '../core/types';

const CHESS = 'Riverside Rapid Open';
const GOLF = 'Hillview Junior Golf Day';
const day = (d: number, h = 9) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };

async function person(name: string, short: string, sport: 'chess' | 'golf', extra: Partial<Player>): Promise<{ t: Team; p: Player }> {
  const p = (await invitePerson({ name })).player;
  Object.assign(p, extra);
  const t = await createTeam({ name, shortName: short, sport, colorHex: '#4DA3FF' });
  await setTeamRoster(t.id, [p.id]);
  return { t, p };
}

export async function seedChessSwiss(): Promise<string> {
  if (isSupabaseConfigured) return 'Demo mode only.';
  if ((await getTournaments()).some((t) => t.name === CHESS)) return `Already seeded "${CHESS}".`;
  const myId = await getMyPlayerId().catch(() => null);
  const people: [string, string, number | undefined, 'Female' | 'Male', string][] = [
    ['Aarav Menon', 'AAR', 1812, 'Male', '2008-04-11'],
    ['Diya Raman', 'DIY', 1745, 'Female', '2014-02-20'],
    ['Kabir Shah', 'KAB', 1630, 'Male', '2016-09-03'],
    ['Nisha Varma', 'NIS', 1588, 'Female', '2012-07-15'],
    ['Rohan Pillai', 'ROH', 1502, 'Male', '1960-01-30'],
    ['Tara Bose', 'TAR', undefined, 'Female', '2017-05-05'],
    ['Vivaan Rao', 'VIV', undefined, 'Male', '2015-11-21'],
    ['Zoya Khan', 'ZOY', 1420, 'Female', '2013-03-09'],
  ];
  const ents = [];
  for (const [name, short, rating, gender, dob] of people) {
    ents.push(await person(name, short, 'chess', { gender, dob, ...(rating ? { sportDetails: { chess: { ratings: { rapid: rating } } } } : {}) } as Partial<Player>));
  }
  const fmt = mergeStructure({ timeControl: 'rapid', tieBreak: FIDE_SWISS_ORDER.join(','), swissSeed: 'rating' }, {
    shape: 'swiss', groupCount: 2, advanceTopN: 2, advanceBest: 0, doubleRound: false, superPhase: false, manualStandings: false, swissRounds: 4,
  });
  const tour = await createTournament({
    name: CHESS, hostName: 'Riverside Chess Club', sports: ['chess'], startDate: day(0).slice(0, 10), endDate: day(1).slice(0, 10),
    structure: 'league', formats: { chess: fmt as Record<string, unknown> },
  } as never);
  await addTournamentTeams(tour.id, ents.map((e) => e.t.id));
  // Round 1: the first seven (Zoya registers late), seeded by rating
  const field = ents.slice(0, 7);
  const order = [...field].sort((a, b) => {
    const ra = (a.p.sportDetails?.chess as { ratings?: { rapid?: number } } | undefined)?.ratings?.rapid ?? -1;
    const rb = (b.p.sportDetails?.chess as { ratings?: { rapid?: number } } | undefined)?.ratings?.rapid ?? -1;
    return rb - ra || a.p.fullName.localeCompare(b.p.fullName);
  }).map((e) => e.t.id);
  const { pairings, byeId } = swissRound1(order, 'W');
  let i = 0;
  for (const pr of pairings) {
    await createMatch({
      tournamentId: tour.id, sport: 'chess', stage: 'swiss1', byes: byeId ? [byeId] : undefined,
      homeTeamId: pr.homeId, awayTeamId: pr.awayId, startsAt: day(0, 10), hostIds: myId ? [myId] : [],
      format: { timeControl: 'rapid', white: pr.white, [BOARD_KEY]: ++i },
    } as never);
  }
  return `Seeded "${CHESS}": 7 players, round 1 paired (${pairings.length} boards${byeId ? ', 1 bye' : ''}); Zoya Khan registered but not yet in the Swiss.`;
}

export async function seedGolfDivisions(): Promise<string> {
  if (isSupabaseConfigured) return 'Demo mode only.';
  if ((await getTournaments()).some((t) => t.name === GOLF)) return `Already seeded "${GOLF}".`;
  const myId = await getMyPlayerId().catch(() => null);
  const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4];
  const si = [7, 3, 15, 1, 11, 5, 17, 9, 13, 8, 16, 2, 12, 4, 10, 18, 6, 14];
  const course = await createGolfCourse({ name: 'Hillview Golf Club', city: 'Pune', holes: pars.map((par, k) => ({ n: k + 1, par, si: si[k] })), tees: [{ name: 'Default', courseRating: 70.1, slope: 121 }] });
  const tour = await createTournament({
    name: GOLF, hostName: 'Hillview Juniors', sports: ['golf'], startDate: day(0).slice(0, 10), endDate: day(0).slice(0, 10),
    structure: 'league', formats: { golf: { competition: 'stroke', holes: '18' } },
  } as never);
  const kids: [string, 'Male' | 'Female', string, number[]][] = [
    ['Arjun Nair', 'Male', '2015-05-02', [0, 1, 0, 1, 0, 0, 1, 1, 0]],
    ['Ishaan Gupta', 'Male', '2012-08-19', [0, 0, 0, 0, 1, 0, 0, 0, 0]],
    ['Meher Sethi', 'Female', '2016-01-14', [1, 1, 0, 1, 1, 0, 0, 1, 1]],
    ['Ananya Iyer', 'Female', '2011-10-30', [0, 1, 0, 0, 0, 1, 0, 0, 0]],
    ['Kian Dsouza', 'Male', '2010-03-07', [0, 0, -1, 0, 0, 0, 0, 1, 0]],
    ['Sara Thomas', 'Female', '2013-12-01', [1, 0, 0, 1, 0, 1, 0, 0, 1]],
    ['Reyansh Bhat', 'Male', '2016-07-22', [1, 2, 1, 1, 0, 1, 1, 1, 2]],
    ['Myra Joshi', 'Female', '2012-04-18', [0, 0, 1, 0, 1, 0, 0, 0, 1]],
  ];
  const ps: Player[] = [];
  for (const [name, gender, dob] of kids) { const p = (await invitePerson({ name })).player; Object.assign(p, { gender, dob }); ps.push(p); }
  const ev = await createFieldEvent({ tournamentId: tour.id, sport: 'golf', title: 'Round 1', roundNo: 1, startsAt: day(0, 7), hostIds: myId ? [myId] : [],
    format: { competition: 'stroke', scoring: 'stroke', holes: '18', courseId: course.id, tee: 'Default', net: false, tieBreak: 'countback', prizes: 'both', allowance: 95, maxScore: 'none' } });
  const entries = await addFieldEntries(ev.id, ps.map((p, k) => ({ playerId: p.id, groupNo: Math.floor(k / 4) + 1 })), 18);
  for (let k = 0; k < entries.length; k++) {
    const over = kids[k][3];
    const strokes = pars.map((par, h) => (h < 9 ? par + over[h] : null));
    await saveCard(entries[k].id, { strokes });
  }
  await setFieldEventStatus(ev.id, 'live');
  return `Seeded "${GOLF}": 8 juniors (4 boys, 4 girls) through 9 holes of round 1.`;
}

/** A carrom doubles match ready to score (the break-order picker shows before board 1). */
export async function seedCarromDoubles(): Promise<string> {
  if (isSupabaseConfigured) return 'Demo mode only.';
  const myId = await getMyPlayerId().catch(() => null);
  const pair = async (name: string, short: string, names: string[]) => {
    const t = await createTeam({ name, shortName: short, sport: 'carrom', colorHex: short === 'NOR' ? '#3DDC97' : '#FFB454' });
    const ps: Player[] = [];
    for (const n of names) ps.push((await invitePerson({ name: n })).player);
    await setTeamRoster(t.id, ps.map((p) => p.id));
    return t;
  };
  const a = await pair('North Wing Pair', 'NOR', ['Asha Kulkarni', 'Bilal Sheikh']);
  const b = await pair('South Wing Pair', 'SOU', ['Chitra Nair', 'Dev Malhotra']);
  const m = await createMatch({ sport: 'carrom', homeTeamId: a.id, awayTeamId: b.id, startsAt: day(0, 16), hostIds: myId ? [myId] : [],
    format: { playersPerSide: 2, target: 25, maxBoards: 8, gamesToWin: 1 } } as never);
  return m.id;
}

if (!isSupabaseConfigured) {
  const g = globalThis as unknown as Record<string, unknown>;
  g.__sportnnoteDemo = { ...((g.__sportnnoteDemo as object | undefined) ?? {}), seedChessSwiss, seedGolfDivisions, seedCarromDoubles };
}

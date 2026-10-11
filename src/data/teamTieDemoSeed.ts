/** SD-48 demo data — DEMO MODE ONLY (no Supabase configured): registers
 *  `__sportnnoteDemo.seedTeamTies()` so a static demo export can show team
 *  ties without clicking through dozens of rubbers. Made-up schools and
 *  players. Everything goes through the normal repo layer (createTeamTie,
 *  saveTieLineup, the event log + completion snapshot) — the same path a
 *  scorer's taps take — so the tie page, standings and careers read real data.
 *
 *  One "Lakeside Schools Team Cup" with:
 *   - badminton: a Sudirman-style tie, stop at the majority (3–1; rubber 5 not played)
 *   - table tennis: Group A of three houses, Swaythling (ABC v XYZ) — two ties
 *     finished, the third with lineups in and its rubbers ready to score
 *   - chess: a 4-board team match with a ½ (2½–1½) */
import { isSupabaseConfigured } from '../core/supabase';
import { getSport } from '../sports/registry';
import {
  createTournament, createTeam, invitePerson, setTeamRoster, addTournamentTeams, createTeamTie, saveTieLineup,
  getTieRubbers, appendMatchEvent, updateMatchSnapshot, matchStatTotals, syncMatchStatLines, settleTie, getTournaments,
  getMyPlayerId,
} from './repos';
import { TIE_PRESETS, TIE_POINTS, specFromPreset, type TieLineup, type TieSpec } from './teamTie';
import { readSeriesMeta } from './series';
import type { MatchEventRecord, Player, SportId, Team } from '../core/types';

const NAME = 'Lakeside Schools Team Cup';

async function team(name: string, short: string, sport: SportId, color: string, people: string[]): Promise<{ t: Team; p: Player[] }> {
  const t = await createTeam({ name, shortName: short, sport, colorHex: color });
  const p: Player[] = [];
  for (const n of people) p.push((await invitePerson({ name: n })).player);
  await setTeamRoster(t.id, p.map((x) => x.id));
  return { t, p };
}

/** Rally events (SET_FIRST_SERVER, then POINTs) that replay to these games. */
function rallyEvents(games: [number, number][], home: Player[], away: Player[]): MatchEventRecord[] {
  const out: MatchEventRecord[] = [{ seq: 1, type: 'SET_FIRST_SERVER', side: null, payload: { side: 'home' }, attribution: null }];
  let seq = 1, hi = 0, ai = 0;
  const emit = (side: 'home' | 'away') => {
    const r = side === 'home' ? home : away;
    const pl = r[(side === 'home' ? hi++ : ai++) % r.length];
    out.push({ seq: ++seq, type: 'POINT', side, payload: {}, attribution: { playerId: pl.id, stat: 'points', playerName: pl.fullName } });
  };
  for (const [h, a] of games) {
    const lo = Math.min(h, a);
    for (let i = 0; i < lo; i++) { emit('home'); emit('away'); }
    for (let i = 0; i < Math.abs(h - a); i++) emit(h > a ? 'home' : 'away');
  }
  return out;
}

/** Score one rubber through the event log and close it like the scorer's
 *  completion (snapshot → result, stat lines, appearances). */
async function play(matchId: string, sport: SportId, events: MatchEventRecord[], cfg: Record<string, unknown>, names: { home: string; away: string }) {
  const plugin = getSport(sport);
  let s = plugin.createInitialState(cfg);
  for (const e of events) {
    await appendMatchEvent(matchId, e);
    s = plugin.reducer(s, { type: e.type, side: e.side ?? undefined, payload: e.payload ?? undefined, attribution: e.attribution ?? undefined });
  }
  const done = plugin.isComplete(s as never);
  if (done && plugin.statTotals) {
    const totals = await matchStatTotals(matchId, sport, s).catch(() => null);
    if (totals) await syncMatchStatLines(matchId, sport, totals, names).catch(() => 0);
  }
  await updateMatchSnapshot(matchId, (plugin.snapshot?.(s as never) ?? s) as object, done);
}

const legOf = (m: { format?: Record<string, unknown> }) => Number(m.format?.__seriesLeg) || 0;

async function rubbersOf(seriesId: string) {
  return (await getTieRubbers(seriesId)).sort((a, b) => legOf(a as never) - legOf(b as never));
}

export async function seedTeamTies(): Promise<string> {
  if (isSupabaseConfigured) return 'Demo mode only.';
  if ((await getTournaments()).some((t) => t.name === NAME)) return `Already seeded "${NAME}".`;
  const myId = await getMyPlayerId().catch(() => null);
  const hosts = myId ? [myId] : [];
  const preset = (id: string) => TIE_PRESETS.find((p) => p.id === id)!;
  const tt = specFromPreset(preset('tt-swaythling'));
  const sud = specFromPreset(preset('bd-sudirman'));
  const ch = specFromPreset(preset('ch-4boards'));
  const day = (d: number, h = 9) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };

  const tour = await createTournament({
    name: NAME, hostName: 'Lakeside Sports Council', sports: ['badminton', 'tabletennis', 'chess'],
    startDate: day(-2).slice(0, 10), endDate: day(3).slice(0, 10), structure: 'league',
    formats: {
      badminton: { teamTie: JSON.stringify(sud), ...TIE_POINTS.badminton!.set },
      tabletennis: { teamTie: JSON.stringify(tt), ...TIE_POINTS.tabletennis!.set, pointsPerGame: 11, gamesToWin: 3 },
      chess: { teamTie: JSON.stringify(ch), ...TIE_POINTS.chess!.set },
    },
  });

  // ── Badminton: Sudirman-style, stop at the majority ──
  const bA = await team('Cedar Grove School', 'CED', 'badminton', '#3DDC97', ['Ishaan Verma', 'Meera Pillai', 'Rohan Desai', 'Kavya Iyer', 'Nikhil Bose', 'Tara Joshi']);
  const bB = await team('Maple Ridge School', 'MAP', 'badminton', '#4DA3FF', ['Arnav Kulkarni', 'Diya Shetty', 'Kabir Malhotra', 'Riya Banerjee', 'Dev Chawla', 'Sana Qureshi']);
  await addTournamentTeams(tour.id, [bA.t.id, bB.t.id]);
  const bd = await createTeamTie({ tournamentId: tour.id, sport: 'badminton', teamAId: bA.t.id, teamBId: bB.t.id, spec: sud, startsAt: day(-1, 10), hostIds: hosts, name: 'Cedar Grove v Maple Ridge' });
  const [i0, m0, k0, t0, n0, s0] = bA.p, [a0, d0, kb, rb, dv, sq] = bB.p;
  // (made-up names: Ishaan, Rohan, Nikhil / Meera, Kavya, Tara)
  const bdH: TieLineup = { pos: {}, pairs: { 0: [i0.id, m0.id], 1: [n0.id], 2: [t0.id], 3: [i0.id, k0.id], 4: [s0.id, m0.id] } };
  const bdA: TieLineup = { pos: {}, pairs: { 0: [a0.id, d0.id], 1: [kb.id], 2: [rb.id], 3: [a0.id, dv.id], 4: [sq.id, d0.id] } };
  await saveTieLineup(bd.seriesId, 'home', bdH);
  await saveTieLineup(bd.seriesId, 'away', bdA);
  const bdR = await rubbersOf(bd.seriesId);
  const bdGames: [number, number][][] = [[[21, 17], [21, 19]], [[18, 21], [21, 16], [21, 14]], [[15, 21], [19, 21]], [[21, 12], [23, 21]]];
  const bdPairs = [[0, 0], [1, 1], [2, 2], [3, 3]];
  for (let i = 0; i < 4; i++) {
    const [hi, ai] = bdPairs[i];
    const hp = (bdH.pairs[String(hi)] ?? []).map((id) => bA.p.find((p) => p.id === id)!);
    const ap = (bdA.pairs[String(ai)] ?? []).map((id) => bB.p.find((p) => p.id === id)!);
    await play(bdR[i].id, 'badminton', rallyEvents(bdGames[i], hp, ap), bdR[i].format ?? {}, { home: bA.t.name, away: bB.t.name });
  }
  await settleTie(bd.seriesId); // rubber 5 set aside: Cedar Grove already won 3–1

  // ── Table tennis: Group A of three houses, Swaythling ──
  const houses = [
    await team('Banyan House', 'BAN', 'tabletennis', '#FF8AC4', ['Aditi Rao', 'Farhan Ali', 'Gauri Menon', 'Hemant Sinha']),
    await team('Lotus House', 'LOT', 'tabletennis', '#FFB454', ['Ira Kapoor', 'Jai Mathur', 'Kiran Das', 'Lina Fernandes']),
    await team('Teak House', 'TEA', 'tabletennis', '#B98AFF', ['Manav Rao', 'Neha Gill', 'Om Prakash', 'Pia Sen']),
  ];
  await addTournamentTeams(tour.id, houses.map((h) => h.t.id));
  const pos = (ps: Player[], letters: string[]): TieLineup => ({ pos: Object.fromEntries(letters.map((l, i) => [l, ps[i].id])), pairs: {} });
  const ttTie = async (h: number, a: number, startsIn: number, results: ([number, number][] | null)[], abc: 'home' | 'away' = 'home') => {
    const spec: TieSpec = { ...tt, abc };
    const H = houses[h], A = houses[a];
    const t = await createTeamTie({ tournamentId: tour.id, sport: 'tabletennis', teamAId: H.t.id, teamBId: A.t.id, spec, group: 'A', stage: 'group', startsAt: day(startsIn, 9), hostIds: hosts, matchFormat: { pointsPerGame: 11, gamesToWin: 3 } });
    const hl = pos(H.p, abc === 'home' ? ['A', 'B', 'C'] : ['X', 'Y', 'Z']);
    const al = pos(A.p, abc === 'home' ? ['X', 'Y', 'Z'] : ['A', 'B', 'C']);
    await saveTieLineup(t.seriesId, 'home', hl);
    await saveTieLineup(t.seriesId, 'away', al);
    const rs = await rubbersOf(t.seriesId);
    for (let i = 0; i < results.length; i++) {
      const g = results[i];
      if (!g) continue;
      const m = rs[i];
      const meta = readSeriesMeta(m);
      const idx = (meta?.leg ?? i + 1) - 1;
      const letterH = (abc === 'home' ? spec.rubbers[idx].p : spec.rubbers[idx].q)[0];
      const letterA = (abc === 'home' ? spec.rubbers[idx].q : spec.rubbers[idx].p)[0];
      const hp = H.p.find((p) => p.id === hl.pos[letterH])!;
      const ap = A.p.find((p) => p.id === al.pos[letterA])!;
      await play(m.id, 'tabletennis', rallyEvents(g, [hp], [ap]), m.format ?? {}, { home: H.t.name, away: A.t.name });
    }
    await settleTie(t.seriesId);
    return t;
  };
  // Banyan 3–1 Lotus; Lotus 3–2 Teak; Teak v Banyan (ABC drawn to Teak) — lineups in, to play
  await ttTie(0, 1, -1, [[[11, 7], [11, 9], [11, 6]], [[9, 11], [11, 8], [8, 11], [7, 11]], [[11, 5], [11, 13], [11, 9], [11, 4]], [[11, 8], [12, 10], [11, 9]]]);
  await ttTie(1, 2, -1, [[[11, 6], [11, 8], [11, 3]], [[5, 11], [9, 11], [11, 9], [6, 11]], [[11, 9], [11, 7], [11, 13], [11, 8]], [[11, 13], [8, 11], [11, 9], [9, 11]], [[11, 9], [9, 11], [11, 7], [12, 10]]]);
  await ttTie(2, 0, 0, [], 'home');

  // ── Chess: 4 boards with a ½ ──
  const cA = await team('Oakwood Academy', 'OAK', 'chess', '#FF5C5C', ['Rhea Nanda', 'Siddharth Pai', 'Tanvi Ghosh', 'Uday Raman']);
  const cB = await team('Willow High', 'WIL', 'chess', '#3DDC97', ['Vani Krishnan', 'Yash Arora', 'Zoya Mirza', 'Aryan Puri']);
  const ratings = [1840, 1725, 1610, 1490, 1795, 1700, 1655, 1420];
  [...cA.p, ...cB.p].forEach((p, i) => { (p as { sportDetails?: Record<string, unknown> }).sportDetails = { chess: { ratings: { standard: ratings[i] } } }; });
  await addTournamentTeams(tour.id, [cA.t.id, cB.t.id]);
  const cm = await createTeamTie({ tournamentId: tour.id, sport: 'chess', teamAId: cA.t.id, teamBId: cB.t.id, spec: ch, startsAt: day(-1, 14), hostIds: hosts, name: 'Oakwood v Willow' });
  await saveTieLineup(cm.seriesId, 'home', pos(cA.p, ['1', '2', '3', '4']));
  await saveTieLineup(cm.seriesId, 'away', pos(cB.p, ['1', '2', '3', '4']));
  const cr = await rubbersOf(cm.seriesId);
  const chessRes: [string, string][] = [['home', 'resignation'], ['draw', 'agreement'], ['away', 'checkmate'], ['home', 'time']];
  for (let i = 0; i < 4; i++) {
    const [winner, method] = chessRes[i];
    await play(cr[i].id, 'chess', [{ seq: 1, type: 'RESULT', side: null, payload: { winner, method, moves: 30 + i * 7 }, attribution: null }], cr[i].format ?? {}, { home: cA.t.name, away: cB.t.name });
  }
  return `Seeded "${NAME}": badminton Sudirman tie (3–1, rubber 5 not played), TT Group A (2 ties played, Teak v Banyan to play), chess 4 boards (2½–1½).`;
}

// Demo builds only (no backend): a console handle for the static demo export.
if (!isSupabaseConfigured) {
  const g = globalThis as unknown as Record<string, unknown>;
  g.__sportnnoteDemo = { ...((g.__sportnnoteDemo as object | undefined) ?? {}), seedTeamTies };
}

/** DEV-ONLY live-data seeder. Registers `window.__sportfolioSeedDemo()` so we can
 *  populate the live backend with a realistic, user-owned dataset for testing &
 *  enhancing before launch. It goes through the normal repo layer, so everything
 *  is created as the signed-in user (correct ownership, RLS-valid) and uses real
 *  divisions (migration 0008).
 *
 *  Guarded by __DEV__ — it is NEVER present in a production (eas build) bundle.
 *  Before go-live, wipe every test row with the clean-slate SQL (see
 *  docs/seed-and-wipe.md); this seed is disposable by design. */
import {
  createTournament,
  createTeam,
  invitePerson,
  lookupPeople,
  setTeamLeaders,
  setTeamRoster,
  addTournamentTeams,
  getTournamentCategories,
  getTournaments,
  getTournamentEntries,
  getMatches,
  createMatch,
  updateMatchSnapshot,
  setMatchHosts,
  getMyPlayerId,
  createMyPlayer,
} from './repos';
import { supabase } from '../core/supabase';

const SEED_NAME = 'Inter-School Championship 2026';

// Two divisions' worth of teams (name, short, colour, captain).
const U14_BOYS: [string, string, string, string][] = [
  ['Lions', 'LIO', '#FF5C5C', 'Rahul Sharma'],
  ['Tigers', 'TIG', '#FFB454', 'Arjun Mehta'],
  ['Panthers', 'PAN', '#B98AFF', 'Vikram Singh'],
  ['Cheetahs', 'CHE', '#3DDC97', 'Karan Patel'],
];
const U16_GIRLS: [string, string, string, string][] = [
  ['Falcons', 'FAL', '#4DA3FF', 'Ananya Rao'],
  ['Hawks', 'HAW', '#FF8AC4', 'Sneha Nair'],
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function makeTeam(name: string, short: string, color: string, captainName: string) {
  const team = await createTeam({ name, shortName: short, sport: 'football', colorHex: color });
  try {
    const { player } = await invitePerson({ name: captainName });
    await setTeamLeaders(team.id, { captainId: player.id });
  } catch { /* captain is a nicety — a team without one is still valid */ }
  return team;
}

/** Seed a full demo tournament (football, two divisions, rostered teams) owned by
 *  the signed-in user. Idempotent by name unless `force` is passed. */
export async function seedDemo(opts: { hostName?: string; force?: boolean } = {}): Promise<string> {
  const already = (await getTournaments()).some((t) => t.name === SEED_NAME);
  if (already && !opts.force) return `Already seeded "${SEED_NAME}". Call __sportfolioSeedDemo({ force: true }) to add another copy.`;

  const now = new Date();
  const start = iso(now);
  const end = iso(new Date(now.getTime() + 6 * 864e5));

  const tournament = await createTournament({
    name: SEED_NAME,
    hostName: opts.hostName ?? 'Me',
    sports: ['football'],
    startDate: start,
    endDate: end,
    structure: 'league_knockout',
    isOpen: true,
    categories: [
      { label: 'U14 Boys', ageGroup: 'U14', gender: 'boys', sort: 0 },
      { label: 'U16 Girls', ageGroup: 'U16', gender: 'girls', sort: 1 },
    ],
  });

  const cats = await getTournamentCategories(tournament.id);
  const u14 = cats.find((c) => c.label === 'U14 Boys');
  const u16 = cats.find((c) => c.label === 'U16 Girls');

  const boys = [];
  for (const [n, s, c, cap] of U14_BOYS) boys.push(await makeTeam(n, s, c, cap));
  const girls = [];
  for (const [n, s, c, cap] of U16_GIRLS) girls.push(await makeTeam(n, s, c, cap));

  await addTournamentTeams(tournament.id, boys.map((t) => t.id), 'confirmed', u14?.id);
  await addTournamentTeams(tournament.id, girls.map((t) => t.id), 'confirmed', u16?.id);

  return `Seeded "${SEED_NAME}" — ${cats.length} divisions, ${boys.length} U14 Boys + ${girls.length} U16 Girls teams${cats.length ? '' : ' (divisions not stored — run migration 0008)'}. Open Organize → it appears under "Tournaments you're hosting".`;
}

/** The signed-in user's player id (creating it if needed). Demo → the sample player. */
async function currentPlayerId(): Promise<string | null> {
  if (!supabase) return getMyPlayerId();
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return null;
  return (await getMyPlayerId(uid)) ?? (await createMyPlayer(uid));
}

/** Add matches + a searchable/followable player ("Aarav Mehta" on Lions) to the
 *  seed tournament, so the Home-feed vs Matches-tab behaviour is testable:
 *   - MY matches (inside the user-hosted tournament) → Matches tab + Home.
 *   - Aarav's friendlies (no tournament, hosted by someone else) → Home ONLY
 *     when you follow Aarav; never on the Matches tab.
 *  Idempotent: no-op once the tournament has matches. */
export async function seedMatches(): Promise<string> {
  const tour = (await getTournaments()).find((t) => t.name === SEED_NAME);
  if (!tour) return `No "${SEED_NAME}" found — run __sportfolioSeedDemo() first.`;
  if ((await getMatches()).some((m) => m.tournamentId === tour.id)) return 'Matches already seeded for this tournament.';

  const entries = await getTournamentEntries(tour.id, 'football');
  const team = (n: string) => entries.find((e) => e.team.name === n)?.team;
  const lions = team('Lions'), tigers = team('Tigers'), panthers = team('Panthers'), cheetahs = team('Cheetahs');
  if (!lions || !tigers || !panthers || !cheetahs) return 'Seed teams missing — re-run __sportfolioSeedDemo().';

  // Aarav Mehta on Lions — searchable in Discover, followable on his profile.
  const aarav = (await lookupPeople('Aarav Mehta'))[0] ?? (await invitePerson({ name: 'Aarav Mehta' })).player;
  await setTeamRoster(lions.id, [aarav.id]);
  // A non-user host so the "followed-only" friendlies aren't counted as yours.
  const host = (await invitePerson({ name: 'Meera Iyer', phone: '+910000000001' })).player;

  const now = Date.now();
  const at = (days: number) => new Date(now + days * 864e5).toISOString();

  // MY matches — inside the user-hosted tournament (Matches tab + Home).
  const done = await createMatch({ tournamentId: tour.id, sport: 'football', homeTeamId: tigers.id, awayTeamId: panthers.id, startsAt: at(-2) });
  await updateMatchSnapshot(done.id, {}, true);    // completed
  const liveOwn = await createMatch({ tournamentId: tour.id, sport: 'football', homeTeamId: panthers.id, awayTeamId: cheetahs.id, startsAt: at(0) });
  await updateMatchSnapshot(liveOwn.id, {}, false); // live
  await createMatch({ tournamentId: tour.id, sport: 'football', homeTeamId: cheetahs.id, awayTeamId: tigers.id, startsAt: at(2) }); // upcoming

  // Aarav's FOLLOWED-ONLY matches — friendlies (no tournament, hosted by Meera).
  await createMatch({ sport: 'football', homeTeamId: lions.id, awayTeamId: cheetahs.id, startsAt: at(1), hostIds: [host.id] }); // upcoming
  // One LIVE, created as mine so I can flip it live, then handed off so it's not mine.
  try {
    const myId = await currentPlayerId();
    if (myId) {
      const liveFollow = await createMatch({ sport: 'football', homeTeamId: lions.id, awayTeamId: tigers.id, startsAt: at(0), hostIds: [myId] });
      await updateMatchSnapshot(liveFollow.id, {}, false); // live (I'm host → allowed)
      await setMatchHosts(liveFollow.id, [host.id]);        // hand off → no longer mine
    }
  } catch { /* live-followed is a nicety; the upcoming one already proves the feed */ }

  return 'Seeded matches + Aarav Mehta (Lions). Search "Aarav" → follow → his live + upcoming matches appear on Home; the Matches tab stays just your tournament games.';
}

// Register dev-only console hooks, mirroring the other __sportfolio* helpers.
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  const g = globalThis as unknown as Record<string, unknown>;
  g.__sportfolioSeedDemo = seedDemo;
  g.__sportfolioSeedMatches = seedMatches;
}

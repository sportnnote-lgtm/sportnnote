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
  setTeamLeaders,
  addTournamentTeams,
  getTournamentCategories,
  getTournaments,
} from './repos';

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

// Register a dev-only console hook, mirroring the other __sportfolio* helpers.
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  (globalThis as unknown as Record<string, unknown>).__sportfolioSeedDemo = seedDemo;
}

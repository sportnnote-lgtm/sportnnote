/** Demo seed for a real live game to stress-test live football scoring:
 *  England vs Croatia, FIFA World Cup 2026. The demo user (p-aarav) is the
 *  organizer/host and the designated scorer. Confirmed XIs + benches; England
 *  line up 4-2-3-1, Croatia 3-4-2-1. Edit anything from the lineup editor as the
 *  real teamsheet/formation changes. */
import type { Player, Tournament, Match, MatchLineup, MatchSquads, LineupSlot, Team } from '../core/types';
import { formationSlots } from '../sports/football/formation';

const ENG = '#0A3D91'; // England blue
const CRO = '#D6001C'; // Croatia red

// Full-international squad members are verified adults (so the eligibility gate
// doesn't hide them from the scoring roster). Edit details later as needed.
function pl(id: string, fullName: string, jerseyNo: number, position: string, country: 'England' | 'Croatia'): Player {
  return {
    id, fullName, jerseyNo, sports: ['football'],
    houseName: country, houseColor: country === 'England' ? ENG : CRO, city: country,
    dob: '1996-01-01', phone: `+1 555 01${String(jerseyNo).padStart(2, '0')}`, email: `${id}@natteam.example`,
    phoneVerified: true, emailVerified: true,
    sportDetails: { football: { position } },
  };
}

// ── England (4-2-3-1) — starters in slot order: GK, LB, CB, CB, RB, CDM, CDM, LW, CAM, RW, ST
const ENG_XI: Player[] = [
  pl('p-eng-1', 'Jordan Pickford', 1, 'GK', 'England'),
  pl('p-eng-2', "Nico O'Reilly", 12, 'LB', 'England'),
  pl('p-eng-3', 'Ezri Konsa', 6, 'CB', 'England'),
  pl('p-eng-4', 'John Stones', 5, 'CB', 'England'),
  pl('p-eng-5', 'Reece James', 2, 'RB', 'England'),
  pl('p-eng-6', 'Declan Rice', 4, 'CDM', 'England'),
  pl('p-eng-7', 'Elliott Anderson', 14, 'CDM', 'England'),
  pl('p-eng-8', 'Anthony Gordon', 17, 'LW', 'England'),
  pl('p-eng-9', 'Jude Bellingham', 10, 'CAM', 'England'),
  pl('p-eng-10', 'Noni Madueke', 11, 'RW', 'England'),
  pl('p-eng-11', 'Harry Kane', 9, 'ST', 'England'),
];
const ENG_SUBS: Player[] = [
  pl('p-eng-12', 'Bukayo Saka', 7, 'RW', 'England'),
  pl('p-eng-13', 'Ollie Watkins', 18, 'ST', 'England'),
  pl('p-eng-14', 'Ivan Toney', 22, 'ST', 'England'),
  pl('p-eng-15', 'Marcus Rashford', 19, 'LW', 'England'),
  pl('p-eng-16', 'Eberechi Eze', 25, 'CAM', 'England'),
  pl('p-eng-17', 'Morgan Rogers', 24, 'CAM', 'England'),
  pl('p-eng-18', 'Kobbie Mainoo', 16, 'CM', 'England'),
  pl('p-eng-19', 'Jordan Henderson', 8, 'CM', 'England'),
  pl('p-eng-20', 'Djed Spence', 15, 'LB', 'England'),
  pl('p-eng-21', 'Jarell Quansah', 3, 'CB', 'England'),
  pl('p-eng-22', 'Dan Burn', 13, 'CB', 'England'),
  pl('p-eng-23', 'Marc Guéhi', 26, 'CB', 'England'),
  pl('p-eng-24', 'Trevoh Chalobah', 20, 'CB', 'England'),
  pl('p-eng-25', 'Dean Henderson', 23, 'GK', 'England'),
  pl('p-eng-26', 'James Trafford', 21, 'GK', 'England'),
];

// ── Croatia (3-4-2-1) — slot order: GK, CB, CB, CB, LM, CM, CM, RM, CAM, CAM, ST
const CRO_XI: Player[] = [
  pl('p-cro-1', 'Dominik Livaković', 1, 'GK', 'Croatia'),
  pl('p-cro-2', 'Joško Gvardiol', 20, 'CB', 'Croatia'),
  pl('p-cro-3', 'Josip Šutalo', 6, 'CB', 'Croatia'),
  pl('p-cro-4', 'Luka Vušković', 23, 'CB', 'Croatia'),
  pl('p-cro-5', 'Ivan Perišić', 4, 'LM', 'Croatia'),
  pl('p-cro-6', 'Luka Modrić', 10, 'CM', 'Croatia'),
  pl('p-cro-7', 'Petar Sučić', 22, 'CM', 'Croatia'),
  pl('p-cro-8', 'Josip Stanišić', 2, 'RM', 'Croatia'),
  pl('p-cro-9', 'Martin Baturina', 7, 'CAM', 'Croatia'),
  pl('p-cro-10', 'Mario Pašalić', 15, 'CAM', 'Croatia'),
  pl('p-cro-11', 'Petar Musa', 17, 'ST', 'Croatia'),
];
const CRO_SUBS: Player[] = [
  pl('p-cro-12', 'Andrej Kramarić', 9, 'CAM', 'Croatia'),
  pl('p-cro-13', 'Igor Matanović', 18, 'ST', 'Croatia'),
  pl('p-cro-14', 'Luka Sučić', 26, 'CM', 'Croatia'),
  pl('p-cro-15', 'Toni Fruk', 24, 'CAM', 'Croatia'),
  pl('p-cro-16', 'Nikola Vlašić', 13, 'CAM', 'Croatia'),
  pl('p-cro-17', 'Marco Pašalić', 25, 'RW', 'Croatia'),
  pl('p-cro-18', 'Mateo Kovačić', 8, 'CM', 'Croatia'),
  pl('p-cro-19', 'Kristijan Jakić', 11, 'CM', 'Croatia'),
  pl('p-cro-20', 'Ante Budimir', 19, 'ST', 'Croatia'),
  pl('p-cro-21', 'Nikola Moro', 16, 'CM', 'Croatia'),
  pl('p-cro-22', 'Martin Erlić', 21, 'CB', 'Croatia'),
  pl('p-cro-23', 'Duje Ćaleta-Car', 5, 'CB', 'Croatia'),
  pl('p-cro-24', 'Marin Pongračić', 14, 'CB', 'Croatia'),
  pl('p-cro-25', 'Dominik Kotarski', 12, 'GK', 'Croatia'),
  pl('p-cro-26', 'Ivor Pandur', 28, 'GK', 'Croatia'),
];

export const WC_PLAYERS: Player[] = [...ENG_XI, ...ENG_SUBS, ...CRO_XI, ...CRO_SUBS];

// Place the XI onto a formation's slots by index (both ordered to match).
function place(formation: string, xi: Player[]): LineupSlot[] {
  return formationSlots(formation).map((slot, i) =>
    xi[i] ? { ...slot, playerId: xi[i].id, playerName: xi[i].fullName } : slot
  );
}

export const WC_LINEUP: MatchLineup = {
  home: place('4-2-3-1', ENG_XI),
  away: place('3-4-2-1', CRO_XI),
  homeFormation: '4-2-3-1',
  awayFormation: '3-4-2-1',
};

export const WC_SQUADS: MatchSquads = {
  home: { starters: ENG_XI.map((p) => p.id), subs: ENG_SUBS.map((p) => p.id) },
  away: { starters: CRO_XI.map((p) => p.id), subs: CRO_SUBS.map((p) => p.id) },
};

const engTeam: Team = { id: 'eng', name: 'England', shortName: 'ENG', sport: 'football', colorHex: ENG, roster: [...ENG_XI, ...ENG_SUBS].map((p) => p.id) };
const croTeam: Team = { id: 'cro', name: 'Croatia', shortName: 'CRO', sport: 'football', colorHex: CRO, roster: [...CRO_XI, ...CRO_SUBS].map((p) => p.id) };

export const WC_TOURNAMENT: Tournament = {
  id: 't-wc',
  name: 'FIFA World Cup 2026',
  hostName: 'Aarav Mehta',
  hostIds: ['p-aarav'], // the demo user organizes & manages this game
  sports: ['football'],
  startDate: '2026-06-17',
  endDate: '2026-07-19',
  structure: 'knockout',
  formats: { football: { playersPerSide: 11, subType: 'fixed', maxSubs: 5 } },
};

export const WC_MATCH: Match = {
  id: 'm-eng-cro',
  tournamentId: 't-wc',
  sport: 'football',
  status: 'live', // 1st half + Bellingham's 47' seeded (3–2); scorer continues from ~79'
  score: { home: 3, away: 2 },
  startsAt: '2026-06-17T19:00:00',
  venueName: 'AT&T Stadium, Arlington (Dallas), Texas',
  hostIds: ['p-aarav'],
  scorerId: 'p-aarav', // demo user scores it live
  managers: { home: 'Thomas Tuchel', away: 'Zlatko Dalić' },
  format: { playersPerSide: 11, subType: 'fixed', maxSubs: 5 },
  homeTeam: engTeam,
  awayTeam: croTeam,
  state: null,
};

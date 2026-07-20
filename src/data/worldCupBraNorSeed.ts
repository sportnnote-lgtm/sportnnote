/** Demo seed for a second real live game: Brazil vs Norway, FIFA World Cup 2026
 *  Round of 16 (5 Jul 2026, MetLife Stadium). Confirmed XIs + full benches with
 *  official shirt numbers, both in a 4-1-2-3. The demo user (p-aarav) is the
 *  organizer/host and designated scorer, so it opens ready to score. Positions/
 *  formation are editable from the lineup editor. Modelled on worldCupSeed.ts. */
import type { Player, Match, MatchLineup, MatchSquads, LineupSlot, Team } from '../core/types';
import { formationSlots } from '../sports/football/formation';

const BRA = '#FEDD00'; // Brazil yellow
const NOR = '#C8102E'; // Norway red
const FORMATION = '4-1-2-3';

function pl(id: string, fullName: string, jerseyNo: number, position: string, country: 'Brazil' | 'Norway'): Player {
  return {
    id, fullName, jerseyNo, sports: ['football'],
    houseName: country, houseColor: country === 'Brazil' ? BRA : NOR, city: country,
    dob: '1996-01-01', phone: `+1 555 ${id.replace(/\D/g, '').padStart(4, '0')}`, email: `${id}@natteam.example`,
    phoneVerified: true, emailVerified: true,
    sportDetails: { football: { position } },
  };
}

// ── Brazil (4-1-2-3) — slot order: GK, LB, CB, CB, RB, CDM, CM, CM, LW, ST, RW
const BRA_XI: Player[] = [
  pl('p-bra-1', 'Alisson', 1, 'GK', 'Brazil'),
  pl('p-bra-2', 'Douglas Santos', 16, 'LB', 'Brazil'),
  pl('p-bra-3', 'Gabriel Magalhães', 3, 'CB', 'Brazil'),
  pl('p-bra-4', 'Marquinhos', 4, 'CB', 'Brazil'), // captain
  pl('p-bra-5', 'Danilo', 13, 'RB', 'Brazil'),
  pl('p-bra-6', 'Casemiro', 5, 'CDM', 'Brazil'),
  pl('p-bra-7', 'Bruno Guimarães', 8, 'CM', 'Brazil'),
  pl('p-bra-8', 'Gabriel Martinelli', 22, 'CM', 'Brazil'),
  pl('p-bra-9', 'Vinícius Júnior', 7, 'LW', 'Brazil'),
  pl('p-bra-10', 'Matheus Cunha', 9, 'ST', 'Brazil'),
  pl('p-bra-11', 'Rayan', 26, 'RW', 'Brazil'),
];
const BRA_SUBS: Player[] = [
  pl('p-bra-12', 'Weverton', 12, 'GK', 'Brazil'),
  pl('p-bra-13', 'Ederson', 23, 'GK', 'Brazil'),
  pl('p-bra-14', 'Alex Sandro', 6, 'LB', 'Brazil'),
  pl('p-bra-15', 'Bremer', 14, 'CB', 'Brazil'),
  pl('p-bra-16', 'Leo Pereira', 15, 'CB', 'Brazil'),
  pl('p-bra-17', 'Roger Ibañez', 24, 'CB', 'Brazil'),
  pl('p-bra-18', 'Éderson Silva', 2, 'RB', 'Brazil'),
  pl('p-bra-19', 'Fabinho', 17, 'CM', 'Brazil'),
  pl('p-bra-20', 'Danilo Santos', 18, 'CM', 'Brazil'),
  pl('p-bra-21', 'Neymar Jr', 10, 'LW', 'Brazil'),
  pl('p-bra-22', 'Raphinha', 11, 'RW', 'Brazil'),
  pl('p-bra-23', 'Endrick', 19, 'ST', 'Brazil'),
  pl('p-bra-24', 'Luiz Henrique', 21, 'RW', 'Brazil'),
  pl('p-bra-25', 'Igor Thiago', 25, 'ST', 'Brazil'),
];

// ── Norway (4-1-2-3) — slot order: GK, LB, CB, CB, RB, CDM, CM, CM, LW, ST, RW
const NOR_XI: Player[] = [
  pl('p-nor-1', 'Ørjan Nyland', 1, 'GK', 'Norway'),
  pl('p-nor-2', 'David Møller Wolfe', 5, 'LB', 'Norway'),
  pl('p-nor-3', 'Kristoffer Ajer', 3, 'CB', 'Norway'),
  pl('p-nor-4', 'Torbjørn Heggem', 17, 'CB', 'Norway'),
  pl('p-nor-5', 'Julian Ryerson', 26, 'RB', 'Norway'),
  pl('p-nor-6', 'Sander Berge', 8, 'CDM', 'Norway'),
  pl('p-nor-7', 'Patrick Berg', 6, 'CM', 'Norway'),
  pl('p-nor-8', 'Martin Ødegaard', 10, 'CM', 'Norway'), // captain
  pl('p-nor-9', 'Antonio Nusa', 20, 'LW', 'Norway'),
  pl('p-nor-10', 'Erling Haaland', 9, 'ST', 'Norway'),
  pl('p-nor-11', 'Alexander Sørloth', 7, 'RW', 'Norway'),
];
const NOR_SUBS: Player[] = [
  pl('p-nor-12', 'Sander Tangvik', 12, 'GK', 'Norway'),
  pl('p-nor-13', 'Egil Selvik', 13, 'GK', 'Norway'),
  pl('p-nor-14', 'Leo Østigård', 4, 'CB', 'Norway'),
  pl('p-nor-15', 'Fredrik André Bjørkan', 15, 'LB', 'Norway'),
  pl('p-nor-16', 'Sondre Langås', 24, 'CM', 'Norway'),
  pl('p-nor-17', 'Henrik Falchener', 25, 'CB', 'Norway'),
  pl('p-nor-18', 'Morten Thorsby', 2, 'CM', 'Norway'),
  pl('p-nor-19', 'Fredrik Aursnes', 14, 'CM', 'Norway'),
  pl('p-nor-20', 'Kristian Thorstvedt', 18, 'CM', 'Norway'),
  pl('p-nor-21', 'Thelo Aasgaard', 19, 'CAM', 'Norway'),
  pl('p-nor-22', 'Andreas Schjelderup', 21, 'LW', 'Norway'),
  pl('p-nor-23', 'Oscar Bobb', 22, 'RW', 'Norway'),
  pl('p-nor-24', 'Jens Petter Hauge', 23, 'LW', 'Norway'),
  pl('p-nor-25', 'Jørgen Strand Larsen', 11, 'ST', 'Norway'),
];

export const BN_PLAYERS: Player[] = [...BRA_XI, ...BRA_SUBS, ...NOR_XI, ...NOR_SUBS];

// Place the XI onto a formation's slots by index (both ordered to match);
// flag the captain's slot for the armband badge.
function place(formation: string, xi: Player[], captainId: string): LineupSlot[] {
  return formationSlots(formation).map((slot, i) =>
    xi[i] ? { ...slot, playerId: xi[i].id, playerName: xi[i].fullName, isCaptain: xi[i].id === captainId } : slot
  );
}

export const BN_LINEUP: MatchLineup = {
  home: place(FORMATION, BRA_XI, 'p-bra-4'), // Marquinhos (C)
  away: place(FORMATION, NOR_XI, 'p-nor-8'), // Ødegaard (C)
  homeFormation: FORMATION,
  awayFormation: FORMATION,
};

export const BN_SQUADS: MatchSquads = {
  home: { starters: BRA_XI.map((p) => p.id), subs: BRA_SUBS.map((p) => p.id) },
  away: { starters: NOR_XI.map((p) => p.id), subs: NOR_SUBS.map((p) => p.id) },
};

const braTeam: Team = { id: 'bra', name: 'Brazil', shortName: 'BRA', sport: 'football', colorHex: BRA, roster: [...BRA_XI, ...BRA_SUBS].map((p) => p.id) };
const norTeam: Team = { id: 'nor', name: 'Norway', shortName: 'NOR', sport: 'football', colorHex: NOR, roster: [...NOR_XI, ...NOR_SUBS].map((p) => p.id) };

export const BN_MATCH: Match = {
  id: 'm-bra-nor',
  tournamentId: 't-wc',
  sport: 'football',
  status: 'live', // ready to score from kick-off (0–0, no events seeded)
  score: { home: 0, away: 0 },
  startsAt: '2026-07-05T16:00:00',
  venueName: 'MetLife Stadium, East Rutherford, New Jersey',
  hostIds: ['p-aarav'],
  scorerId: 'p-aarav', // demo user scores it live
  managers: { home: 'Carlo Ancelotti', away: 'Ståle Solbakken' },
  format: { playersPerSide: 11, subType: 'fixed', maxSubs: 5 },
  homeTeam: braTeam,
  awayTeam: norTeam,
  state: null,
};

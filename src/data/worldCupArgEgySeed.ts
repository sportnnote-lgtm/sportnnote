/** Demo seed for Argentina vs Egypt, FIFA World Cup 2026 Round of 16. Confirmed
 *  XIs + benches with official shirt numbers from the teamsheet — Argentina
 *  4-1-3-2, Egypt 4-2-3-1. The demo user (p-aarav) is host + scorer, so it opens
 *  ready to score. Positions/formation are editable from the lineup editor.
 *  Modelled on worldCupPorEspSeed.ts. */
import type { Player, Match, MatchLineup, MatchSquads, LineupSlot, Team } from '../core/types';
import { formationSlots } from '../sports/football/formation';

const ARG = '#75AADB'; // Argentina celeste
const EGY = '#CE1126'; // Egypt red

function pl(id: string, fullName: string, jerseyNo: number, position: string, country: 'Argentina' | 'Egypt'): Player {
  return {
    id, fullName, jerseyNo, sports: ['football'],
    houseName: country, houseColor: country === 'Argentina' ? ARG : EGY, city: country,
    dob: '1996-01-01', phone: `+1 555 ${id.replace(/\D/g, '').padStart(4, '0')}`, email: `${id}@natteam.example`,
    phoneVerified: true, emailVerified: true,
    sportDetails: { football: { position } },
  };
}

// ── Argentina (4-1-3-2) — slot order: GK, LB, CB, CB, RB, CDM, LM, CAM, RM, ST, ST
const ARG_XI: Player[] = [
  pl('p-arg-1', 'Emiliano Martinez', 23, 'GK', 'Argentina'),
  pl('p-arg-2', 'Nicolas Tagliafico', 3, 'LB', 'Argentina'),
  pl('p-arg-3', 'Lisandro Martinez', 6, 'CB', 'Argentina'),
  pl('p-arg-4', 'Cristian Romero', 13, 'CB', 'Argentina'),
  pl('p-arg-5', 'Nahuel Molina', 26, 'RB', 'Argentina'),
  pl('p-arg-6', 'Leandro Paredes', 5, 'CDM', 'Argentina'),
  pl('p-arg-7', 'Alexis Mac Allister', 20, 'LM', 'Argentina'),
  pl('p-arg-8', 'Enzo Fernandez', 24, 'CAM', 'Argentina'),
  pl('p-arg-9', 'Rodrigo De Paul', 7, 'RM', 'Argentina'),
  pl('p-arg-10', 'Julian Alvarez', 9, 'ST', 'Argentina'),
  pl('p-arg-11', 'Lionel Messi', 10, 'ST', 'Argentina'), // captain
];
const ARG_SUBS: Player[] = [
  pl('p-arg-12', 'Juan Musso', 1, 'GK', 'Argentina'),
  pl('p-arg-13', 'Geronimo Rulli', 12, 'GK', 'Argentina'),
  pl('p-arg-14', 'Marcos Senesi', 2, 'CB', 'Argentina'),
  pl('p-arg-15', 'Gonzalo Montiel', 4, 'RB', 'Argentina'),
  pl('p-arg-16', 'Nicolas Otamendi', 19, 'CB', 'Argentina'),
  pl('p-arg-17', 'Facundo Medina', 25, 'CB', 'Argentina'),
  pl('p-arg-18', 'Valentin Barco', 8, 'LB', 'Argentina'),
  pl('p-arg-19', 'Giovani Lo Celso', 11, 'CM', 'Argentina'),
  pl('p-arg-20', 'Exequiel Palacios', 14, 'CM', 'Argentina'),
  pl('p-arg-21', 'Nico Gonzalez', 15, 'LW', 'Argentina'),
  pl('p-arg-22', 'Thiago Almada', 16, 'CAM', 'Argentina'),
  pl('p-arg-23', 'Giuliano Simeone', 17, 'RW', 'Argentina'),
  pl('p-arg-24', 'Nico Paz', 18, 'CAM', 'Argentina'),
  pl('p-arg-25', 'Jose Manuel Lopez', 21, 'ST', 'Argentina'),
  pl('p-arg-26', 'Lautaro Martinez', 22, 'ST', 'Argentina'),
];

// ── Egypt (4-2-3-1) — slot order: GK, LB, CB, CB, RB, CDM, CDM, LW, CAM, RW, ST
const EGY_XI: Player[] = [
  pl('p-egy-1', 'Mostafa Shoubir', 23, 'GK', 'Egypt'),
  pl('p-egy-2', 'Karim Hafez', 15, 'LB', 'Egypt'),
  pl('p-egy-3', 'Yasser Ibrahim', 2, 'CB', 'Egypt'),
  pl('p-egy-4', 'Ramy Rabia', 5, 'CB', 'Egypt'),
  pl('p-egy-5', 'Mohamed Hany', 3, 'RB', 'Egypt'),
  pl('p-egy-6', 'Marawan Attia', 19, 'CDM', 'Egypt'),
  pl('p-egy-7', 'Mohanad Lashin', 17, 'CDM', 'Egypt'),
  pl('p-egy-8', 'Haissem Hassan', 12, 'LW', 'Egypt'),
  pl('p-egy-9', 'Emam Ashour', 8, 'CAM', 'Egypt'),
  pl('p-egy-10', 'Mohamed Salah', 10, 'RW', 'Egypt'), // captain
  pl('p-egy-11', 'Mostafa Zico', 11, 'ST', 'Egypt'),
];
const EGY_SUBS: Player[] = [
  pl('p-egy-12', 'Mohamed Elshenawy', 1, 'GK', 'Egypt'),
  pl('p-egy-13', 'Mahdy Soliman', 16, 'GK', 'Egypt'),
  pl('p-egy-14', 'Mohamed Alaa', 26, 'GK', 'Egypt'),
  pl('p-egy-15', 'Hossam Abdelmaguid', 4, 'CB', 'Egypt'),
  pl('p-egy-16', 'Tarek Alaa', 24, 'CB', 'Egypt'),
  pl('p-egy-17', 'Hamdy Fathy', 14, 'CM', 'Egypt'),
  pl('p-egy-18', 'Nabil Donga', 18, 'CM', 'Egypt'),
  pl('p-egy-19', 'Mahmoud Saber', 21, 'CM', 'Egypt'),
  pl('p-egy-20', 'Trezeguet', 7, 'LW', 'Egypt'),
  pl('p-egy-21', 'Hamza Abdelkarim', 9, 'ST', 'Egypt'),
  pl('p-egy-22', 'Ibrahim Adel', 20, 'RW', 'Egypt'),
  pl('p-egy-23', 'Omar Marmoush', 22, 'ST', 'Egypt'),
  pl('p-egy-24', 'Zizo', 25, 'LW', 'Egypt'),
];

export const AE_PLAYERS: Player[] = [...ARG_XI, ...ARG_SUBS, ...EGY_XI, ...EGY_SUBS];

function place(formation: string, xi: Player[], captainId: string): LineupSlot[] {
  return formationSlots(formation).map((slot, i) =>
    xi[i] ? { ...slot, playerId: xi[i].id, playerName: xi[i].fullName, isCaptain: xi[i].id === captainId } : slot
  );
}

export const AE_LINEUP: MatchLineup = {
  home: place('4-1-3-2', ARG_XI, 'p-arg-11'), // Messi (C)
  away: place('4-2-3-1', EGY_XI, 'p-egy-10'), // Salah (C)
  homeFormation: '4-1-3-2',
  awayFormation: '4-2-3-1',
};

export const AE_SQUADS: MatchSquads = {
  home: { starters: ARG_XI.map((p) => p.id), subs: ARG_SUBS.map((p) => p.id) },
  away: { starters: EGY_XI.map((p) => p.id), subs: EGY_SUBS.map((p) => p.id) },
};

const argTeam: Team = { id: 'arg', name: 'Argentina', shortName: 'ARG', sport: 'football', colorHex: ARG, roster: [...ARG_XI, ...ARG_SUBS].map((p) => p.id) };
const egyTeam: Team = { id: 'egy', name: 'Egypt', shortName: 'EGY', sport: 'football', colorHex: EGY, roster: [...EGY_XI, ...EGY_SUBS].map((p) => p.id) };

export const AE_MATCH: Match = {
  id: 'm-arg-egy',
  tournamentId: 't-wc',
  sport: 'football',
  status: 'live', // ready to score from kick-off (0–0, no events seeded)
  score: { home: 0, away: 0 },
  startsAt: '2026-07-07T21:30:00', // Round of 16 · Match 95
  venueName: 'Atlanta Stadium, Atlanta',
  hostIds: ['p-aarav'],
  scorerId: 'p-aarav',
  managers: { home: 'Lionel Scaloni', away: 'Hossam Hassan' },
  format: { playersPerSide: 11, subType: 'fixed', maxSubs: 5, knockout: true, halfMinutes: 45, extraTimeMinutes: 15, extraTimeSubs: 1 },
  homeTeam: argTeam,
  awayTeam: egyTeam,
  state: null,
};

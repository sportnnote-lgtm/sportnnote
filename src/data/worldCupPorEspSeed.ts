/** Demo seed for Portugal vs Spain, FIFA World Cup 2026 Round of 16 (6 Jul 2026,
 *  Dallas Stadium, Arlington). Confirmed XIs + full benches with official shirt
 *  numbers from the teamsheet — Portugal 4-2-3-1, Spain 4-1-2-3. The demo user
 *  (p-aarav) is host + scorer, so it opens ready to score. Positions/formation
 *  are editable from the lineup editor. Modelled on worldCupBraNorSeed.ts. */
import type { Player, Match, MatchLineup, MatchSquads, LineupSlot, Team } from '../core/types';
import { formationSlots } from '../sports/football/formation';

const POR = '#B0122A'; // Portugal red
const ESP = '#F4B400'; // Spain gold (distinct from Portugal's red on the scoreboard)

function pl(id: string, fullName: string, jerseyNo: number, position: string, country: 'Portugal' | 'Spain'): Player {
  return {
    id, fullName, jerseyNo, sports: ['football'],
    houseName: country, houseColor: country === 'Portugal' ? POR : ESP, city: country,
    dob: '1996-01-01', phone: `+1 555 ${id.replace(/\D/g, '').padStart(4, '0')}`, email: `${id}@natteam.example`,
    phoneVerified: true, emailVerified: true,
    sportDetails: { football: { position } },
  };
}

// ── Portugal (4-2-3-1) — slot order: GK, LB, CB, CB, RB, CDM, CDM, LW, CAM, RW, ST
const POR_XI: Player[] = [
  pl('p-por-1', 'Diogo Costa', 1, 'GK', 'Portugal'),
  pl('p-por-2', 'Nuno Mendes', 25, 'LB', 'Portugal'),
  pl('p-por-3', 'Rúben Dias', 3, 'CB', 'Portugal'),
  pl('p-por-4', 'Renato Veiga', 13, 'CB', 'Portugal'),
  pl('p-por-5', 'João Cancelo', 20, 'RB', 'Portugal'),
  pl('p-por-6', 'João Neves', 15, 'CDM', 'Portugal'),
  pl('p-por-7', 'Vitinha', 23, 'CDM', 'Portugal'),
  pl('p-por-8', 'João Félix', 11, 'LW', 'Portugal'),
  pl('p-por-9', 'Bruno Fernandes', 8, 'CAM', 'Portugal'),
  pl('p-por-10', 'Pedro Neto', 18, 'RW', 'Portugal'),
  pl('p-por-11', 'Cristiano Ronaldo', 7, 'ST', 'Portugal'), // captain
];
const POR_SUBS: Player[] = [
  pl('p-por-12', 'José Sá', 12, 'GK', 'Portugal'),
  pl('p-por-13', 'Rui Silva', 22, 'GK', 'Portugal'),
  pl('p-por-14', 'Nélson Semedo', 2, 'RB', 'Portugal'),
  pl('p-por-15', 'Tomás Araújo', 4, 'CB', 'Portugal'),
  pl('p-por-16', 'Diogo Dalot', 5, 'RB', 'Portugal'),
  pl('p-por-17', 'Gonçalo Inácio', 14, 'CB', 'Portugal'),
  pl('p-por-18', 'Samu Costa', 24, 'CM', 'Portugal'),
  pl('p-por-19', 'Matheus Nunes', 6, 'CM', 'Portugal'),
  pl('p-por-20', 'Bernardo Silva', 10, 'RW', 'Portugal'),
  pl('p-por-21', 'Rúben Neves', 21, 'CM', 'Portugal'),
  pl('p-por-22', 'Gonçalo Ramos', 9, 'ST', 'Portugal'),
  pl('p-por-23', 'Francisco Trincão', 16, 'RW', 'Portugal'),
  pl('p-por-24', 'Rafael Leão', 17, 'LW', 'Portugal'),
  pl('p-por-25', 'Gonçalo Guedes', 19, 'ST', 'Portugal'),
  pl('p-por-26', 'Francisco Conceição', 26, 'RW', 'Portugal'),
];

// ── Spain (4-1-2-3) — slot order: GK, LB, CB, CB, RB, CDM, CM, CM, LW, ST, RW
const ESP_XI: Player[] = [
  pl('p-esp-1', 'Unai Simón', 23, 'GK', 'Spain'),
  pl('p-esp-2', 'Marc Cucurella', 24, 'LB', 'Spain'),
  pl('p-esp-3', 'Aymeric Laporte', 14, 'CB', 'Spain'),
  pl('p-esp-4', 'Pau Cubarsí', 22, 'CB', 'Spain'),
  pl('p-esp-5', 'Pedro Porro', 12, 'RB', 'Spain'),
  pl('p-esp-6', 'Rodri', 16, 'CDM', 'Spain'), // captain
  pl('p-esp-7', 'Álex Baena', 15, 'CM', 'Spain'),
  pl('p-esp-8', 'Pedri', 20, 'CM', 'Spain'),
  pl('p-esp-9', 'Dani Olmo', 10, 'LW', 'Spain'),
  pl('p-esp-10', 'Mikel Oyarzabal', 21, 'ST', 'Spain'),
  pl('p-esp-11', 'Lamine Yamal', 19, 'RW', 'Spain'),
];
const ESP_SUBS: Player[] = [
  pl('p-esp-12', 'David Raya', 1, 'GK', 'Spain'),
  pl('p-esp-13', 'Joan García', 13, 'GK', 'Spain'),
  pl('p-esp-14', 'Marc Pubill', 2, 'RB', 'Spain'),
  pl('p-esp-15', 'Álex Grimaldo', 3, 'LB', 'Spain'),
  pl('p-esp-16', 'Eric García', 4, 'CB', 'Spain'),
  pl('p-esp-17', 'Marcos Llorente', 5, 'RB', 'Spain'),
  pl('p-esp-18', 'Mikel Merino', 6, 'CM', 'Spain'),
  pl('p-esp-19', 'Fabián Ruiz', 8, 'CM', 'Spain'),
  pl('p-esp-20', 'Gavi', 9, 'CM', 'Spain'),
  pl('p-esp-21', 'Martín Zubimendi', 18, 'CDM', 'Spain'),
  pl('p-esp-22', 'Ferran Torres', 7, 'ST', 'Spain'),
  pl('p-esp-23', 'Yeremy Pino', 11, 'RW', 'Spain'),
  pl('p-esp-24', 'Nico Williams', 17, 'LW', 'Spain'),
  pl('p-esp-25', 'Víctor Muñoz', 25, 'CM', 'Spain'),
  pl('p-esp-26', 'Borja Iglesias', 26, 'ST', 'Spain'),
];

export const PE_PLAYERS: Player[] = [...POR_XI, ...POR_SUBS, ...ESP_XI, ...ESP_SUBS];

function place(formation: string, xi: Player[], captainId: string): LineupSlot[] {
  return formationSlots(formation).map((slot, i) =>
    xi[i] ? { ...slot, playerId: xi[i].id, playerName: xi[i].fullName, isCaptain: xi[i].id === captainId } : slot
  );
}

export const PE_LINEUP: MatchLineup = {
  home: place('4-2-3-1', POR_XI, 'p-por-11'), // Ronaldo (C)
  away: place('4-1-2-3', ESP_XI, 'p-esp-6'),  // Rodri (C)
  homeFormation: '4-2-3-1',
  awayFormation: '4-1-2-3',
};

export const PE_SQUADS: MatchSquads = {
  home: { starters: POR_XI.map((p) => p.id), subs: POR_SUBS.map((p) => p.id) },
  away: { starters: ESP_XI.map((p) => p.id), subs: ESP_SUBS.map((p) => p.id) },
};

const porTeam: Team = { id: 'por', name: 'Portugal', shortName: 'POR', sport: 'football', colorHex: POR, roster: [...POR_XI, ...POR_SUBS].map((p) => p.id) };
const espTeam: Team = { id: 'esp', name: 'Spain', shortName: 'ESP', sport: 'football', colorHex: ESP, roster: [...ESP_XI, ...ESP_SUBS].map((p) => p.id) };

export const PE_MATCH: Match = {
  id: 'm-por-esp',
  tournamentId: 't-wc',
  sport: 'football',
  status: 'live', // ready to score from kick-off (0–0, no events seeded)
  score: { home: 1, away: 0 }, // ~12' in — replayed from seeded events
  startsAt: '2026-06-17T20:00:00', // seed-anchor day, so a LIVE match reads as today (see demoStore anchorDate)
  venueName: 'Dallas Stadium, Arlington (Dallas), Texas',
  hostIds: ['p-aarav'],
  scorerId: 'p-aarav',
  managers: { home: 'Roberto Martínez', away: 'Luis de la Fuente' },
  format: { playersPerSide: 11, subType: 'fixed', maxSubs: 5, knockout: true, halfMinutes: 45, extraTimeMinutes: 15, extraTimeSubs: 1 },
  homeTeam: porTeam,
  awayTeam: espTeam,
  state: null,
};

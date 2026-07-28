/**
 * In-memory sample data so the app is fully explorable in "demo mode" before a
 * Supabase project is connected. Once the backend is wired, these are replaced
 * by queries — the screens consume the same shapes either way.
 */
import type { Match, Team, Tournament } from './types';

const team = (id: string, name: string, shortName: string, sport: Team['sport'], color: string): Team => ({
  id, name, shortName, sport, colorHex: color,
});

export const TOURNAMENT: Tournament = {
  id: 't1',
  name: 'Annual Sports Meet 2026',
  hostName: 'Greenwood High School',
  hostOrgId: 'org-greenwood', // hosted by the school org — its members all manage it
  logoUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iIzNEREM5NyIvPjx0ZXh0IHg9IjYwIiB5PSI3NiIgZm9udC1zaXplPSI1MiIgZm9udC1mYW1pbHk9IkFyaWFsIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjMDYxMjBEIj5BU008L3RleHQ+PC9zdmc+',

  sports: ['football', 'cricket', 'basketball', 'badminton', 'tennis', 'volleyball', 'kabaddi'],
  // Ongoing right now (started a couple of days ago, runs through the week).
  startDate: '2026-06-12',
  endDate: '2026-06-20',
  structure: 'league_knockout',
  formats: {
    cricket: { overs: 10, playersPerSide: 8 },
    football: { playersPerSide: 7, subType: 'rolling', maxSubs: 5 },
  },
};

/** A single-sport league — exercises the "one sport → standings directly" path.
 *  Completed (finished earlier this month). */
export const TOURNAMENT_2: Tournament = {
  id: 't2',
  name: 'Bengaluru Premier League',
  hostName: 'BPL Football',
  hostOrgId: 'org-bpl',
  sports: ['football'],
  startDate: '2026-05-02',
  endDate: '2026-06-08',
  structure: 'league',
  formats: { football: { playersPerSide: 11, subType: 'rolling', maxSubs: 5 } },
};

/** A completed multi-sport meet earlier in the year — gives Aarav & co. some
 *  finished history to show in standings and profiles. */
export const TOURNAMENT_3: Tournament = {
  id: 't3',
  name: 'Spring Sports Carnival 2026',
  hostName: 'Greenwood High School',
  hostOrgId: 'org-greenwood',
  sports: ['football', 'basketball', 'cricket', 'volleyball'],
  startDate: '2026-04-05',
  endDate: '2026-04-19',
  structure: 'league',
  formats: { cricket: { overs: 15, playersPerSide: 11 }, football: { playersPerSide: 11, subType: 'rolling', maxSubs: 5 } },
};

/** Starts about a month out — an upcoming tournament with a fixture list but no
 *  results yet. */
export const TOURNAMENT_4: Tournament = {
  id: 't4',
  name: 'Inter-School Championship 2026',
  hostName: 'Karnataka Schools Sports Board',
  hostIds: ['p-aarav'], // upcoming meet the demo user is organizing
  isOpen: true, // accepting team registrations

  sports: ['football', 'basketball', 'cricket'],
  startDate: '2026-07-14',
  endDate: '2026-07-22',
  structure: 'league_knockout',
  formats: { cricket: { overs: 20, playersPerSide: 11 }, football: { playersPerSide: 11, subType: 'rolling', maxSubs: 5 } },
};

/** Last year's edition of the school meet — gives the Greenwood community a
 *  multi-year history under its bracket. */
export const TOURNAMENT_0: Tournament = {
  id: 't0',
  name: 'Annual Sports Meet 2025',
  hostName: 'Greenwood High School',
  hostOrgId: 'org-greenwood',
  sports: ['football', 'cricket', 'basketball', 'badminton'],
  startDate: '2025-06-10',
  endDate: '2025-06-18',
  structure: 'league_knockout',
};

/** An open tournament run by another community (BPL) — anyone can find it in
 *  Discover and request to register a team. */
export const TOURNAMENT_5: Tournament = {
  id: 't5',
  name: 'Bengaluru Open Cup 2026',
  hostName: 'BPL Football',
  hostOrgId: 'org-bpl',
  isOpen: true,
  sports: ['football'],
  startDate: '2026-08-02',
  endDate: '2026-08-16',
  structure: 'knockout',
  formats: { football: { playersPerSide: 7, substitutes: 5, subType: 'rolling' } },
};

/** A city-wide, multi-sport club league running right now — football, basketball
 *  & volleyball among four Bengaluru clubs. Exercises multi-sport standings with
 *  non-house teams plus a live match in the feed. */
export const TOURNAMENT_6: Tournament = {
  id: 't6',
  name: 'Bengaluru City Games 2026',
  hostName: 'BPL Sports',
  hostOrgId: 'org-bpl',
  sports: ['football', 'basketball', 'volleyball'],
  startDate: '2026-06-10',
  endDate: '2026-06-25',
  structure: 'league_knockout',
  formats: {
    football: { playersPerSide: 7, substitutes: 5, subType: 'rolling' },
    basketball: { playersPerSide: 5, substitutes: 5, foulsToFoulOut: 5, foulsForBonus: 5 },
    volleyball: { playersPerSide: 6, substitutes: 6, setsToWin: 2, pointsPerSet: 25 },
  },
};

/** A single-elimination football cup among the four BPL clubs — exercises the
 *  knockout bracket with extra-time / penalty-shootout deciders. */
export const TOURNAMENT_7: Tournament = {
  id: 't7',
  name: 'Karnataka State Cup 2026',
  hostName: 'Karnataka Schools Sports Board',
  hostIds: ['p-aarav'],
  sports: ['football'],
  startDate: '2026-06-14',
  endDate: '2026-06-28',
  structure: 'knockout',
  formats: { football: { playersPerSide: 11, substitutes: 5, subType: 'rolling', knockout: true } },
};

// Ordered ongoing → upcoming → completed for the Home switcher.
export const TOURNAMENTS: Tournament[] = [TOURNAMENT, TOURNAMENT_6, TOURNAMENT_7, TOURNAMENT_4, TOURNAMENT_5, TOURNAMENT_3, TOURNAMENT_2, TOURNAMENT_0];

const houses = {
  red: '#FF5C5C',
  blue: '#4DA3FF',
  green: '#3DDC97',
  gold: '#FFB454',
};

export const MATCHES: Match[] = [
  {
    id: 'm1', tournamentId: 't1', sport: 'football', status: 'live',
    startsAt: '2026-06-15T09:00:00',
    venueName: 'Kanteerava Stadium',
    venueMapsUrl: 'https://maps.app.goo.gl/8gE3y1Z9Qb2',
    hostIds: ['p-aarav'],
    scorerId: 'p-aarav', // the demo user is the designated scorer for this one
    score: { home: 2, away: 1 }, // mid-game — replayed from seeded events (see demoStore)
    managers: { home: 'Coach R. Menon', away: 'Coach S. Pillai' },
    homeTeam: team('rh', 'Red House', 'RED', 'football', houses.red),
    awayTeam: team('bh', 'Blue House', 'BLU', 'football', houses.blue),
    state: null,
  },
  {
    id: 'm2', tournamentId: 't1', sport: 'basketball', status: 'scheduled',
    startsAt: '2026-06-15T11:00:00',
    venueName: 'Indoor Sports Complex',
    hostIds: ['p-aarav'],
    scorerId: 'p-aarav', // demo user scores this — shows the foul-out rule live
    format: { playersPerSide: 5, substitutes: 5, foulsToFoulOut: 5 },
    homeTeam: team('gh', 'Green House', 'GRN', 'basketball', houses.green),
    awayTeam: team('yh', 'Gold House', 'GLD', 'basketball', houses.gold),
    state: null,
  },
  {
    id: 'm3', tournamentId: 't1', sport: 'badminton', status: 'scheduled',
    startsAt: '2026-06-16T10:00:00',
    venueName: 'Padukone Badminton Academy',
    hostIds: ['p-aarav'],
    scorerId: 'p-aarav', // demo user scores — shows the single-game-to-11 format ending the match
    format: { playersPerSide: 1, pointsPerGame: 11, gamesToWin: 1 },
    homeTeam: team('rh', 'Red House', 'RED', 'badminton', houses.red),
    awayTeam: team('gh', 'Green House', 'GRN', 'badminton', houses.green),
    state: null,
  },
  {
    id: 'm4', tournamentId: 't1', sport: 'kabaddi', status: 'scheduled',
    startsAt: '2026-06-16T16:00:00',
    venueName: 'Kanteerava Indoor Arena',
    hostIds: ['p-aarav'],
    scorerId: 'p-aarav', // demo user scores — shows rolling substitutions live
    format: { playersPerSide: 7, substitutes: 5, halfMinutes: 20 },
    homeTeam: team('bh', 'Blue House', 'BLU', 'kabaddi', houses.blue),
    awayTeam: team('yh', 'Gold House', 'GLD', 'kabaddi', houses.gold),
    state: null,
  },
  {
    id: 'm7', tournamentId: 't1', sport: 'tennis', status: 'scheduled',
    startsAt: '2026-06-17T13:00:00',
    venueName: 'KSLTA Tennis Courts',
    hostIds: ['p-aarav'],
    scorerId: 'p-aarav', // demo user scores — shows the 6-6 tiebreak
    format: { playersPerSide: 1, setsToWin: 2 },
    homeTeam: team('rh', 'Red House', 'RED', 'tennis', houses.red),
    awayTeam: team('bh', 'Blue House', 'BLU', 'tennis', houses.blue),
    state: null,
  },
  {
    id: 'm5', tournamentId: 't1', sport: 'volleyball', status: 'completed',
    startsAt: '2026-06-14T15:00:00',
    homeTeam: team('gh', 'Green House', 'GRN', 'volleyball', houses.green),
    awayTeam: team('rh', 'Red House', 'RED', 'volleyball', houses.red),
    winner: 'home', score: { home: 3, away: 1 },
    state: null,
  },
  {
    id: 'm8', tournamentId: 't1', sport: 'cricket', status: 'live',
    startsAt: '2026-06-17T09:30:00',
    venueName: 'Chinnaswamy Stadium',
    hostIds: ['p-aarav', 'p-ishaan'], // co-hosted
    scorerId: 'p-ishaan', // scored on another device — the demo user only views
    homeTeam: team('rh', 'Red House', 'RED', 'cricket', houses.red),
    awayTeam: team('bh', 'Blue House', 'BLU', 'cricket', houses.blue),
    state: null,
  },
  {
    id: 'm9', tournamentId: 't1', sport: 'cricket', status: 'scheduled',
    startsAt: '2026-06-18T16:00:00',
    venueName: 'Chinnaswamy Stadium',
    hostIds: ['p-aarav'],
    scorerId: 'p-aarav', // the demo user scores this one — shows the IPL-style rules live
    // per-match format: IPL-style Impact Player + a 3-over powerplay (8-a-side squads)
    format: { overs: 10, playersPerSide: 8, substitutes: 1, impactPlayer: true, powerplayOvers: 3 },
    homeTeam: team('rh', 'Red House', 'RED', 'cricket', houses.red),
    awayTeam: team('bh', 'Blue House', 'BLU', 'cricket', houses.blue),
    state: null,
  },
  {
    id: 'm10', tournamentId: 't1', sport: 'volleyball', status: 'scheduled',
    startsAt: '2026-06-19T15:00:00',
    venueName: 'Indoor Sports Complex',
    hostIds: ['p-aarav'],
    scorerId: 'p-aarav', // demo user scores — shows the deciding set drop to 15
    format: { playersPerSide: 6, substitutes: 6, setsToWin: 2, pointsPerSet: 25 },
    homeTeam: team('rh', 'Red House', 'RED', 'volleyball', houses.red),
    awayTeam: team('bh', 'Blue House', 'BLU', 'volleyball', houses.blue),
    state: null,
  },
];

// Completed results across sports so per-sport standings have real data.
const houseId = (k: 'red' | 'blue' | 'green' | 'gold') =>
  k === 'red' ? 'rh' : k === 'blue' ? 'bh' : k === 'green' ? 'gh' : 'yh';
const houseName2 = (k: 'red' | 'blue' | 'green' | 'gold') =>
  k === 'red' ? 'Red House' : k === 'blue' ? 'Blue House' : k === 'green' ? 'Green House' : 'Gold House';
const houseShort = (k: 'red' | 'blue' | 'green' | 'gold') =>
  k === 'red' ? 'RED' : k === 'blue' ? 'BLU' : k === 'green' ? 'GRN' : 'GLD';

function done(
  id: string,
  sport: Match['sport'],
  home: 'red' | 'blue' | 'green' | 'gold',
  away: 'red' | 'blue' | 'green' | 'gold',
  winner: Match['winner'],
  score: [number, number]
): Match {
  return {
    id, tournamentId: 't1', sport, status: 'completed', startsAt: '2026-06-13T10:00:00',
    homeTeam: team(houseId(home), houseName2(home), houseShort(home), sport, houses[home]),
    awayTeam: team(houseId(away), houseName2(away), houseShort(away), sport, houses[away]),
    winner, score: { home: score[0], away: score[1] }, state: null,
  };
}

MATCHES.push(
  done('f1', 'football', 'red', 'blue', 'home', [3, 1]),
  done('f2', 'football', 'green', 'gold', 'home', [2, 0]),
  done('f3', 'football', 'red', 'green', 'draw', [1, 1]),
  done('f4', 'football', 'gold', 'blue', 'home', [2, 1]),
  done('ck1', 'cricket', 'red', 'gold', 'home', [118, 104]),
  done('ck2', 'cricket', 'blue', 'green', 'home', [124, 110]),
  done('bk1', 'basketball', 'green', 'red', 'home', [72, 65]),
  done('bk2', 'basketball', 'gold', 'blue', 'away', [80, 88]),
);

// ---- Bengaluru Premier League (t2): four clubs, a completed football season --
const clubs = {
  falcons: { id: 'fc-falcons', name: 'Falcons FC', short: 'FAL', color: '#E0457B' },
  strikers: { id: 'fc-strikers', name: 'City Strikers', short: 'STR', color: '#2D9CDB' },
  titans: { id: 'fc-titans', name: 'Titan Athletic', short: 'TIT', color: '#8E6FE0' },
  rovers: { id: 'fc-rovers', name: 'Rovers United', short: 'ROV', color: '#27AE60' },
} as const;
type ClubKey = keyof typeof clubs;

function bpl(id: string, home: ClubKey, away: ClubKey, winner: Match['winner'], score: [number, number]): Match {
  const h = clubs[home];
  const a = clubs[away];
  return {
    id, tournamentId: 't2', sport: 'football', status: 'completed', startsAt: '2026-05-10T18:00:00',
    venueName: 'Bangalore Football Stadium',
    homeTeam: team(h.id, h.name, h.short, 'football', h.color),
    awayTeam: team(a.id, a.name, a.short, 'football', a.color),
    winner, score: { home: score[0], away: score[1] }, state: null,
  };
}

MATCHES.push(
  bpl('b1', 'falcons', 'strikers', 'home', [2, 1]),
  bpl('b2', 'titans', 'rovers', 'away', [0, 2]),
  bpl('b3', 'falcons', 'titans', 'home', [3, 2]),
  bpl('b4', 'rovers', 'strikers', 'draw', [1, 1]),
  bpl('b5', 'strikers', 'titans', 'home', [2, 0]),
  bpl('b6', 'rovers', 'falcons', 'away', [1, 4]),
  // one upcoming fixture so t2 has an "Up next" too
  {
    id: 'b7', tournamentId: 't2', sport: 'football', status: 'scheduled',
    startsAt: '2026-06-08T18:00:00', venueName: 'Bangalore Football Stadium',
    homeTeam: team(clubs.strikers.id, clubs.strikers.name, clubs.strikers.short, 'football', clubs.strikers.color),
    awayTeam: team(clubs.rovers.id, clubs.rovers.name, clubs.rovers.short, 'football', clubs.rovers.color),
    state: null,
  },
);

// ---- Generic house-team fixtures for the other house tournaments (t3, t4) ----
type HouseKey = 'red' | 'blue' | 'green' | 'gold';
const houseTeam = (k: HouseKey, sport: Match['sport']) =>
  team(houseId(k), houseName2(k), houseShort(k), sport, houses[k]);

function houseDone(
  id: string, tid: string, sport: Match['sport'], home: HouseKey, away: HouseKey,
  winner: Match['winner'], score: [number, number], startsAt: string, venueName?: string
): Match {
  return {
    id, tournamentId: tid, sport, status: 'completed', startsAt, venueName,
    homeTeam: houseTeam(home, sport), awayTeam: houseTeam(away, sport),
    winner, score: { home: score[0], away: score[1] }, state: null,
  };
}

function houseSched(
  id: string, tid: string, sport: Match['sport'], home: HouseKey, away: HouseKey,
  startsAt: string, venueName?: string
): Match {
  return {
    id, tournamentId: tid, sport, status: 'scheduled', startsAt, venueName,
    homeTeam: houseTeam(home, sport), awayTeam: houseTeam(away, sport), state: null,
  };
}

// Spring Sports Carnival (t3) — a completed multi-sport meet in April.
MATCHES.push(
  houseDone('s1', 't3', 'football', 'red', 'blue', 'home', [2, 1], '2026-04-06T10:00:00', 'Greenwood Main Ground'),
  houseDone('s2', 't3', 'football', 'green', 'gold', 'draw', [1, 1], '2026-04-06T12:00:00', 'Greenwood Main Ground'),
  houseDone('s3', 't3', 'football', 'red', 'green', 'home', [3, 2], '2026-04-12T10:00:00', 'Greenwood Main Ground'),
  houseDone('s4', 't3', 'basketball', 'gold', 'red', 'away', [58, 64], '2026-04-08T15:00:00', 'Greenwood Indoor Hall'),
  houseDone('s5', 't3', 'basketball', 'green', 'blue', 'home', [71, 60], '2026-04-09T15:00:00', 'Greenwood Indoor Hall'),
  houseDone('s6', 't3', 'cricket', 'red', 'blue', 'home', [156, 142], '2026-04-14T09:30:00', 'Greenwood Oval'),
  houseDone('s7', 't3', 'cricket', 'gold', 'green', 'home', [133, 121], '2026-04-15T09:30:00', 'Greenwood Oval'),
  houseDone('s8', 't3', 'volleyball', 'red', 'gold', 'home', [3, 1], '2026-04-17T16:00:00', 'Greenwood Indoor Hall'),
);

// Inter-School Championship (t4) — upcoming fixtures, no results yet.
MATCHES.push(
  houseSched('u1', 't4', 'football', 'red', 'green', '2026-07-15T17:00:00', 'Sree Kanteerava Stadium'),
  houseSched('u2', 't4', 'basketball', 'blue', 'gold', '2026-07-16T18:00:00', 'Koramangala Indoor Stadium'),
  houseSched('u3', 't4', 'cricket', 'red', 'blue', '2026-07-18T09:00:00', 'Chinnaswamy Stadium'),
);

// ---- Bengaluru City Games (t6): four multi-sport city clubs ----
const cgClubs = {
  ind: { id: 'cg-ind', name: 'Indiranagar United', short: 'IND', color: '#F2994A' },
  kor: { id: 'cg-kor', name: 'Koramangala Kings', short: 'KOR', color: '#2F80ED' },
  whf: { id: 'cg-whf', name: 'Whitefield Warriors', short: 'WHF', color: '#9B51E0' },
  jay: { id: 'cg-jay', name: 'Jayanagar Giants', short: 'JAY', color: '#219653' },
} as const;
type CgKey = keyof typeof cgClubs;
const cgTeam = (k: CgKey, sport: Match['sport']) => {
  const c = cgClubs[k];
  return team(c.id, c.name, c.short, sport, c.color);
};
function cgDone(id: string, sport: Match['sport'], home: CgKey, away: CgKey, winner: Match['winner'], score: [number, number], startsAt: string): Match {
  return {
    id, tournamentId: 't6', sport, status: 'completed', startsAt, venueName: 'Bengaluru Sports Hub',
    homeTeam: cgTeam(home, sport), awayTeam: cgTeam(away, sport),
    winner, score: { home: score[0], away: score[1] }, state: null,
  };
}
function cgSched(id: string, sport: Match['sport'], home: CgKey, away: CgKey, startsAt: string): Match {
  return {
    id, tournamentId: 't6', sport, status: 'scheduled', startsAt, venueName: 'Bengaluru Sports Hub',
    homeTeam: cgTeam(home, sport), awayTeam: cgTeam(away, sport), state: null,
  };
}
MATCHES.push(
  cgDone('cg1', 'football', 'ind', 'jay', 'home', [2, 1], '2026-06-11T18:00:00'),
  cgDone('cg2', 'football', 'kor', 'whf', 'home', [3, 2], '2026-06-11T20:00:00'),
  cgDone('cg3', 'basketball', 'whf', 'ind', 'home', [70, 66], '2026-06-12T18:00:00'),
  cgDone('cg4', 'basketball', 'kor', 'jay', 'home', [81, 77], '2026-06-12T20:00:00'),
  cgDone('cg5', 'volleyball', 'jay', 'kor', 'home', [3, 1], '2026-06-13T18:00:00'),
  cgDone('cg6', 'volleyball', 'ind', 'whf', 'home', [3, 2], '2026-06-13T20:00:00'),
  // Live right now — a basketball game mid-Q1, replayed from seeded events.
  {
    id: 'cg7', tournamentId: 't6', sport: 'basketball', status: 'live',
    startsAt: '2026-06-16T19:00:00', venueName: 'Bengaluru Sports Hub',
    hostIds: ['p-aarav'], scorerId: 'p-aarav',
    format: { playersPerSide: 5, substitutes: 5, foulsToFoulOut: 5, foulsForBonus: 5 },
    score: { home: 14, away: 11 },
    homeTeam: cgTeam('ind', 'basketball'), awayTeam: cgTeam('kor', 'basketball'),
    state: null,
  },
  cgSched('cg8', 'football', 'whf', 'ind', '2026-06-20T18:00:00'),
  cgSched('cg9', 'volleyball', 'kor', 'whf', '2026-06-20T20:00:00'),
);

// ---- Karnataka State Cup (t7): single-elimination football among BPL clubs ----
function cupMatch(id: string, home: ClubKey, away: ClubKey, status: Match['status'], startsAt: string, winner?: Match['winner'], score?: [number, number]): Match {
  const h = clubs[home];
  const a = clubs[away];
  return {
    id, tournamentId: 't7', sport: 'football', status, startsAt, venueName: 'Bangalore Football Stadium',
    homeTeam: team(h.id, h.name, h.short, 'football', h.color),
    awayTeam: team(a.id, a.name, a.short, 'football', a.color),
    winner, score: score ? { home: score[0], away: score[1] } : undefined, state: null,
  };
}
MATCHES.push(
  // Semi-finals decided; the final is live and level — heading to penalties.
  cupMatch('kc1', 'falcons', 'titans', 'completed', '2026-06-15T18:00:00', 'home', [2, 1]),
  cupMatch('kc2', 'strikers', 'rovers', 'completed', '2026-06-15T20:00:00', 'home', [1, 0]),
  {
    id: 'kc3', tournamentId: 't7', sport: 'football', status: 'live',
    startsAt: '2026-06-16T19:00:00', venueName: 'Bangalore Football Stadium',
    hostIds: ['p-aarav'], scorerId: 'p-aarav',
    // knockout final — level 1–1, so ending the match triggers a penalty shootout
    format: { playersPerSide: 11, substitutes: 5, subType: 'rolling', knockout: true },
    score: { home: 1, away: 1 },
    homeTeam: team(clubs.falcons.id, clubs.falcons.name, clubs.falcons.short, 'football', clubs.falcons.color),
    awayTeam: team(clubs.strikers.id, clubs.strikers.name, clubs.strikers.short, 'football', clubs.strikers.color),
    state: null,
  },
);

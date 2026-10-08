/**
 * WhatsApp-friendly share messages for a match, a tournament or a golf round.
 * Pure (no React Native) so it's unit-tested. The message carries the score
 * itself — useful to anyone who reads it — plus a short link that opens the
 * page in the app (app.sportnnote.in/m/<id>, /t/<id>, /g/<id>).
 */

export const SHARE_BASE = 'https://app.sportnnote.in';

export const matchLink = (matchId: string) => `${SHARE_BASE}/m/${matchId}`;
export const tournamentLink = (tournamentId: string) => `${SHARE_BASE}/t/${tournamentId}`;
export const golfLink = (eventId: string) => `${SHARE_BASE}/g/${eventId}`;
export const profileLink = (playerId: string) => `${SHARE_BASE}/p/${playerId}`;

export interface MatchShareInput {
  sportIcon: string;
  status: 'live' | 'final' | 'upcoming';
  home: string;
  away: string;
  homeScore?: string;
  awayScore?: string;
  /** e.g. "16.2 overs", "Set 2", "2nd half" */
  statusLine?: string;
  detailLine?: string;
  /** final only */
  winner?: 'home' | 'away' | 'draw';
  /** final only: a match closed by hand ("Match abandoned — Rain") — replaces the winner line */
  resultLine?: string;
  tournamentName?: string;
  /** upcoming only, already formatted for the reader ("Sat 12 Oct, 6:00 pm") */
  when?: string;
  venue?: string;
  matchId?: string;
}

const clean = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim();

export function matchShareText(m: MatchShareInput): string {
  const head = m.status === 'live' ? `${m.sportIcon} LIVE` : m.status === 'final' ? `${m.sportIcon} RESULT` : `${m.sportIcon} UPCOMING`;
  const lines: string[] = [m.tournamentName ? `${head} · ${clean(m.tournamentName)}` : head];

  const hasScore = !!(clean(m.homeScore) || clean(m.awayScore));
  if (m.status === 'upcoming' || !hasScore) {
    lines.push(`${clean(m.home)} vs ${clean(m.away)}`);
  } else {
    const row = (name?: string, score?: string) => [clean(name), clean(score)].filter(Boolean).join(' ');
    lines.push(row(m.home, m.homeScore), row(m.away, m.awayScore));
  }

  if (m.status === 'final' && m.resultLine) {
    lines.push(`🏁 ${clean(m.resultLine)}`);
  } else if (m.status === 'final' && m.winner) {
    lines.push(m.winner === 'draw' ? '🤝 Match drawn' : `🏆 ${clean(m.winner === 'home' ? m.home : m.away)} won`);
  }
  const detail = [clean(m.statusLine), clean(m.detailLine)].filter(Boolean).join(' · ');
  if (detail && m.status !== 'upcoming') lines.push(detail);
  if (m.status === 'upcoming') {
    const wv = [clean(m.when), clean(m.venue)].filter(Boolean).join(' · ');
    if (wv) lines.push(`📅 ${wv}`);
  }

  lines.push('');
  lines.push(m.matchId
    ? `${m.status === 'live' ? 'Follow live' : 'Details'} on SportnNote: ${matchLink(m.matchId)}`
    : 'Scored on SportnNote — sportnnote.in');
  return lines.join('\n');
}

export interface TournamentShareInput {
  name: string;
  sportLine?: string;
  /** top of the table, already formatted ("1. Red House — 9 pts") */
  standings?: string[];
  tournamentId: string;
}

export function tournamentShareText(t: TournamentShareInput): string {
  const lines = [`🏆 ${clean(t.name)}`];
  if (t.sportLine) lines.push(clean(t.sportLine));
  if (t.standings?.length) lines.push('', ...t.standings.slice(0, 5));
  lines.push('', `Fixtures, results & standings: ${tournamentLink(t.tournamentId)}`);
  return lines.join('\n');
}

export interface GolfShareInput {
  title: string;
  /** leaderboard rows already formatted ("1. A. Reddy −3 (thru 14)") */
  leaders: string[];
  final: boolean;
  eventId: string;
}

export function golfShareText(g: GolfShareInput): string {
  const lines = [`⛳ ${g.final ? 'RESULT' : 'LIVE'} · ${clean(g.title)}`];
  if (g.leaders.length) lines.push(...g.leaders.slice(0, 5));
  lines.push('', `${g.final ? 'Full leaderboard' : 'Live leaderboard'}: ${golfLink(g.eventId)}`);
  return lines.join('\n');
}

export interface ProfileShareInput {
  name: string;
  matches: number;
  wins: number;
  /** one line per sport, already formatted ("🏏 Cricket · 12 matches · 340 runs") */
  sports: string[];
  playerId: string;
}

/** "Here's my / their record across sports" — a player's profile to share. */
export function profileShareText(p: ProfileShareInput): string {
  const lines = [`🏅 ${clean(p.name)} on SportnNote`];
  if (p.matches > 0) {
    const rate = Math.round((100 * p.wins) / p.matches);
    lines.push(`${p.matches} ${p.matches === 1 ? 'match' : 'matches'} · ${p.wins} ${p.wins === 1 ? 'win' : 'wins'} (${rate}%)`);
  }
  if (p.sports.length) lines.push('', ...p.sports.slice(0, 8));
  lines.push('', `Full stats: ${profileLink(p.playerId)}`);
  return lines.join('\n');
}

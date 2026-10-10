/** SD-26 — the Swiss field as the pairing sees it, read from a tournament's
 *  Swiss fixtures (pure): each entrant's score, pairing number, opponents met,
 *  colour history (chess: from each game's `white`) and whether they have had
 *  a bye (or a chess forfeit win, which FIDE treats the same for byes). */
import type { Match, SportId } from '../core/types';
import { teamStandings, chessWhiteSide, isChessForfeit, isNoResultMatch, swissRoundOf, type StandingsConfig } from './standings.ts';
import type { Colour, SwissPlayer } from './swiss.ts';

/**
 * `seedOrder` is the organiser's seed list (round 1's order): its position is
 * the pairing number; entrants missing from it follow in standings order.
 */
export function swissField(
  matches: Match[], sport: SportId, cfg: StandingsConfig, seedOrder: string[] = [],
  teams?: { id: string; name: string }[],
): SwissPlayer[] {
  const swiss = matches.filter((m) => m.sport === sport && m.status !== 'cancelled' && swissRoundOf(m.stage) !== undefined);
  const rows = teamStandings(swiss, sport, cfg, 'swiss', teams);
  const ids = new Set<string>();
  for (const m of swiss) { ids.add(m.homeTeam.id); ids.add(m.awayTeam.id); for (const b of m.byes ?? []) ids.add(b); }
  const ranking = [...seedOrder.filter((id) => ids.has(id)), ...rows.map((r) => r.teamId).filter((id) => !seedOrder.includes(id))];
  for (const id of ids) if (!ranking.includes(id)) ranking.push(id);
  const score = new Map(rows.map((r) => [r.teamId, r.points]));
  const opponents = new Map([...ids].map((id) => [id, new Set<string>()]));
  const colours = new Map<string, { round: number; c: Colour }[]>([...ids].map((id) => [id, []]));
  const hadBye = new Set<string>();
  const inRound = new Set(swiss.flatMap((m) => [`${m.stage}|${m.homeTeam.id}`, `${m.stage}|${m.awayTeam.id}`]));
  for (const m of swiss) {
    const h = m.homeTeam.id, a = m.awayTeam.id;
    opponents.get(h)?.add(a); opponents.get(a)?.add(h);
    for (const b of m.byes ?? []) if (!inRound.has(`${m.stage}|${b}`)) hadBye.add(b);
    const done = m.status === 'completed' && (!!m.winner || isNoResultMatch(m));
    if (!done) continue;
    if (isChessForfeit(m)) {
      // FIDE C.04.1: a forfeit win counts like a bye; a forfeit has no colour.
      if (m.winner === 'home') hadBye.add(h); else if (m.winner === 'away') hadBye.add(a);
      continue;
    }
    if (sport !== 'chess' || isNoResultMatch(m)) continue;
    const w = chessWhiteSide(m);
    const round = swissRoundOf(m.stage)!;
    colours.get(h)?.push({ round, c: w === 'home' ? 'W' : 'B' });
    colours.get(a)?.push({ round, c: w === 'away' ? 'W' : 'B' });
  }
  return ranking.map((id, i) => ({
    id, score: score.get(id) ?? 0, rank: i + 1, opponents: opponents.get(id) ?? new Set(),
    colours: (colours.get(id) ?? []).sort((x, y) => x.round - y.round).map((x) => x.c),
    hadBye: hadBye.has(id),
  }));
}

/**
 * SD-131 — the three / four headline tiles on a player's profile, sport-aware.
 *
 * Apps / W-D-L / Win % are right for match sports and wrong for an athlete,
 * swimmer or lifter (a race has no win or loss) or a stroke-play golfer. Lines
 * from a field event (athletics, swimming … — `eventId` set) read as:
 *   Events · Finals · Medals · PBs
 * (events = distinct events entered: a heat and its final count once; PBs = the
 * events with a personal-best mark on record). A golfer with only stroke-play
 * rounds reads Rounds · Wins · Best round. A player with match AND event lines
 * keeps the match record (over match lines only) plus a Medals tile when they
 * have any. PURE.
 */
import type { StatLine } from '../core/types';
import { aggregate } from './stats.ts';
import { isEventSport } from '../sports/eventSports.ts';

export interface HeadTile { value: string; label: string }

const eventLine = (l: Pick<StatLine, 'sport' | 'eventId'>) => !!l.eventId && isEventSport(l.sport);
const golfRound = (l: Pick<StatLine, 'sport' | 'eventId'>) => !!l.eventId && l.sport === 'golf';

/** "100 m U14 Girls — Heat 2" on 2026-10-04 and "100 m U14 Girls — Final" the same day → one event. */
const eventKeyOf = (l: Pick<StatLine, 'opponent' | 'date' | 'eventId'>) =>
  l.opponent ? `${l.opponent.replace(/\s+—\s+[^—]+$/, '').trim()}|${(l.date ?? '').slice(0, 10)}` : String(l.eventId);

export function profileHeadline(lines: StatLine[]): HeadTile[] {
  const events = lines.filter(eventLine);
  const golf = lines.filter(golfRound);
  const matches = lines.filter((l) => !eventLine(l) && !golfRound(l));
  const sum = (ls: StatLine[], k: string) => ls.reduce((n, l) => n + (Number(l.stats?.[k]) || 0), 0);
  const medals = sum(events, 'golds') + sum(events, 'silvers') + sum(events, 'bronzes');

  if (!matches.length && events.length) {
    const pbs = new Set(events.flatMap((l) => Object.keys(l.stats ?? {}).filter((k) => k.startsWith('m_')))).size;
    const n = new Set(events.map(eventKeyOf)).size + golf.length;
    return [
      { value: String(n), label: n === 1 ? 'Event' : 'Events' },
      { value: String(sum(events, 'finals')), label: 'Finals' },
      { value: String(medals), label: medals === 1 ? 'Medal' : 'Medals' },
      { value: String(pbs), label: pbs === 1 ? 'PB' : 'PBs' },
    ];
  }
  if (!matches.length && golf.length) {
    const best = golf.filter((l) => l.stats?.completeRounds && l.stats?.holes === 18).map((l) => Number(l.stats.strokes)).filter(Number.isFinite);
    return [
      { value: String(golf.length), label: golf.length === 1 ? 'Round' : 'Rounds' },
      { value: String(golf.filter((l) => l.won).length), label: 'Wins' },
      { value: best.length ? String(Math.min(...best)) : '–', label: 'Best round' },
    ];
  }
  const s = aggregate(matches.length ? matches : lines);
  const out: HeadTile[] = [
    { value: String(s.matches), label: 'Apps' },
    { value: `${s.wins}-${s.draws}-${s.losses}`, label: 'W-D-L' },
    { value: `${Math.round(s.winRate * 100)}%`, label: 'Win %' },
  ];
  if (medals > 0) out.push({ value: String(medals), label: medals === 1 ? 'Medal' : 'Medals' });
  return out;
}

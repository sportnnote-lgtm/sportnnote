/**
 * SD-51 (GEN-21) — the tournament Records card: every completed match's
 * persisted record candidates (`matches.state.matchRecords`, written at
 * completion by `withMatchRecords`) ranked per record type across the
 * tournament, top 5 each, every row tapping through to its match.
 *
 * A match finished before SD-51 has no stored block until the one-off backfill
 * (`__sportnnoteAdmin.backfillMatchRecords`) runs; `derive` (the sport's hook
 * over the stored snapshot) stands in meanwhile — a cricket snapshot has no
 * ball log, so its partnerships appear only once the block is stored.
 * A match closed by hand (walkover, abandoned, conceded: `match.result`) sets
 * no records. PURE: node tests load it. Per-team records stay on the team page
 * (teamRecords.ts); this is the tournament-wide view.
 */
import type { Match, SportId } from '../core/types';
import { matchRecordTypes, readMatchRecords, type MatchRecordItem, type MatchRecordType, type MatchRecordsBlock } from '../sports/matchRecords.ts';

export interface RecordRow {
  item: MatchRecordItem;
  matchId: string;
  /** the team the record belongs to (team / player records) */
  teamName?: string;
  teamId?: string;
  /** "vs Blue House" (team / player) or "Red House v Blue House" (match records) */
  context: string;
  date: string;
}

export interface RecordSection {
  type: MatchRecordType;
  rows: RecordRow[];
}

export interface TournamentRecordsOpts {
  /** rows per record type (default 5) */
  cap?: number;
  /** a block for a match with none stored (the sport's hook over `match.state`) */
  derive?: (m: Match) => MatchRecordsBlock | null;
}

/** The block a match contributes: the stored one, else `derive`'s. Never throws. */
export function recordsOfMatch(m: Match, derive?: (m: Match) => MatchRecordsBlock | null): MatchRecordsBlock | null {
  if (m.status !== 'completed' || m.result) return null;
  const stored = readMatchRecords(m.state);
  if (stored) return stored;
  if (!derive) return null;
  try { return derive(m); } catch { return null; }
}

/** Ranked record sections for one sport of a tournament (empty types left out). */
export function tournamentRecords(sport: SportId, matches: Match[], opts: TournamentRecordsOpts = {}): RecordSection[] {
  const cap = opts.cap ?? 5;
  const types = matchRecordTypes(sport);
  if (!types.length) return [];
  const rows = new Map<string, RecordRow[]>();
  for (const m of matches) {
    if (m.sport !== sport) continue;
    const b = recordsOfMatch(m, opts.derive);
    if (!b) continue;
    for (const item of b.items) {
      const team = item.side === 'home' ? m.homeTeam : item.side === 'away' ? m.awayTeam : undefined;
      const opp = item.side === 'home' ? m.awayTeam : item.side === 'away' ? m.homeTeam : undefined;
      const row: RecordRow = {
        item, matchId: m.id, date: m.startsAt,
        ...(team ? { teamName: team.name, teamId: team.id } : {}),
        context: opp ? `vs ${opp.name}` : `${m.homeTeam.name} v ${m.awayTeam.name}`,
      };
      const list = rows.get(item.type) ?? [];
      list.push(row);
      rows.set(item.type, list);
    }
  }
  const out: RecordSection[] = [];
  for (const type of types) {
    const list = rows.get(type.key);
    if (!list?.length) continue;
    const sign = type.dir === 'low' ? -1 : 1;
    // better value first; a level record stays with whoever set it first
    list.sort((a, b) => sign * (b.item.value - a.item.value) || a.date.localeCompare(b.date) || a.matchId.localeCompare(b.matchId));
    out.push({ type, rows: list.slice(0, cap) });
  }
  return out;
}

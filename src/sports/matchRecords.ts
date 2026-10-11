/**
 * SD-51 (GEN-21 / CK-07) — per-match RECORDS: the bests a stat line can't sum
 * (a team's innings total, a partnership, a fastest goal, a comeback, a
 * longest tiebreak…). Each sport's `matchRecords(state)` hook
 * (matchRecordHooks.ts) turns a FINAL state into a small list of candidates;
 * `withMatchRecords` writes them into the completed snapshot as
 * `matches.state.matchRecords` (no new column), and the tournament Records card
 * (src/data/tournamentRecords.ts) ranks them across the tournament's matches.
 *
 * PURE (no React Native): node tests load it. The block is versioned (`v: 1`)
 * and compact — ids / names / one display string per candidate — so it is
 * cheap to read for every match of a tournament.
 */
import type { SportId } from '../core/types';
import type { LineCell, LineScore, Pair } from './scoreline.ts';
import { durations, fmtDuration } from './conduct.ts';
import type { LiveEvent } from './liveEvents';

export type Side = 'home' | 'away';

/** One record candidate from one match. */
export interface MatchRecordItem {
  /** the record type (`MATCH_RECORD_TYPES[sport][].key`) */
  type: string;
  /** what the ranking compares (direction from the type) */
  value: number;
  /** the figure as shown: "187/5 (20 ov)", "112 (68)", "4/21", "5–1", "17'" */
  text: string;
  /** the side it belongs to (the team that set it; the winner of a margin) */
  side?: Side;
  /** a player's record (link to their profile / stat line) */
  playerId?: string;
  playerName?: string;
  /** a partnership's other batter */
  partnerId?: string;
  partnerName?: string;
  /** a short qualifier: "3rd wkt", "checkmate" */
  note?: string;
}

export interface MatchRecordsBlock {
  v: 1;
  items: MatchRecordItem[];
}

/** The key the block rides under in `matches.state`. */
export const MATCH_RECORDS_KEY = 'matchRecords';

export interface MatchRecordType {
  key: string;
  label: string;
  /** 'high' = bigger is better (default); 'low' = smaller (fastest goal / win) */
  dir?: 'high' | 'low';
  /** whose record: a team (side), a player, or the match itself (both sides) */
  who: 'team' | 'player' | 'match';
}

const SET_SPORTS = ['tennis', 'padel', 'badminton', 'tabletennis', 'squash', 'pickleball', 'volleyball'] as const;
const TB_SPORTS = new Set<string>(['tennis', 'padel']);

const goalTypes = (word: string, hatTricks: boolean): MatchRecordType[] => [
  { key: 'biggestWin', label: 'Biggest wins', who: 'team' },
  { key: 'mostGoals', label: `Most ${word} in a match`, who: 'match' },
  { key: 'fastestGoal', label: `Fastest ${word.replace(/s$/, '')}`, dir: 'low', who: 'player' },
  hatTricks
    ? { key: 'hatTrick', label: 'Hat-tricks', who: 'player' }
    : { key: 'playerGoals', label: `Most ${word} by a player`, who: 'player' },
];

const setTypes = (sport: string): MatchRecordType[] => {
  const unit = sport === 'tennis' || sport === 'padel' || sport === 'volleyball' ? 'set' : 'game';
  return [
    { key: 'longestMatch', label: `Longest matches (${unit}s)`, who: 'match' },
    { key: 'longestTime', label: 'Longest matches (time)', who: 'match' },
    { key: 'comeback', label: 'Comebacks', who: 'team' },
    TB_SPORTS.has(sport)
      ? { key: 'longestTiebreak', label: 'Longest tiebreaks', who: 'match' }
      : { key: 'longestGame', label: `Longest ${unit}s`, who: 'match' },
  ];
};

/** Every sport's record types, in display order. Sports not listed (golf and
 *  the results-engine sports — they have their own records; carrom) have none. */
export const MATCH_RECORD_TYPES: Partial<Record<SportId, MatchRecordType[]>> = {
  cricket: [
    { key: 'teamHigh', label: 'Highest team totals', who: 'team' },
    { key: 'teamLow', label: 'Lowest team totals', dir: 'low', who: 'team' },
    { key: 'partnership', label: 'Highest partnerships', who: 'player' },
    { key: 'bestInnings', label: 'Best individual innings', who: 'player' },
    { key: 'bestBowling', label: 'Best bowling figures', who: 'player' },
    { key: 'marginRuns', label: 'Biggest wins (runs)', who: 'team' },
    { key: 'marginWkts', label: 'Biggest wins (wickets)', who: 'team' },
  ],
  football: goalTypes('goals', true),
  hockey: goalTypes('goals', true),
  handball: goalTypes('goals', false),
  basketball: [
    { key: 'teamHigh', label: 'Highest team scores', who: 'team' },
    { key: 'biggestWin', label: 'Biggest wins', who: 'team' },
    { key: 'playerHigh', label: 'Most points by a player', who: 'player' },
    { key: 'bigGame', label: '30-point games', who: 'player' },
    { key: 'tripleDouble', label: 'Triple-doubles', who: 'player' },
  ],
  kabaddi: [
    { key: 'teamHigh', label: 'Highest team scores', who: 'team' },
    { key: 'biggestWin', label: 'Biggest wins', who: 'team' },
    { key: 'raidPoints', label: 'Most raid points in a match', who: 'player' },
    { key: 'super10', label: 'Super 10s', who: 'player' },
    { key: 'high5', label: 'High 5s', who: 'player' },
  ],
  chess: [
    { key: 'fastestWin', label: 'Fastest wins (moves)', dir: 'low', who: 'team' },
  ],
  ...Object.fromEntries(SET_SPORTS.map((s) => [s, setTypes(s)])),
};

export const matchRecordTypes = (sport: SportId): MatchRecordType[] => MATCH_RECORD_TYPES[sport] ?? [];

/** A block from its items (null when there's nothing to record). */
export const block = (items: MatchRecordItem[]): MatchRecordsBlock | null => (items.length ? { v: 1, items } : null);

/** A stored block, validated (an older / foreign snapshot reads as none). */
export function readMatchRecords(state: unknown): MatchRecordsBlock | null {
  const b = (state as Record<string, unknown> | null | undefined)?.[MATCH_RECORDS_KEY] as MatchRecordsBlock | undefined;
  if (!b || typeof b !== 'object' || b.v !== 1 || !Array.isArray(b.items)) return null;
  const items = b.items.filter((i) => i && typeof i.type === 'string' && typeof i.value === 'number' && Number.isFinite(i.value) && typeof i.text === 'string');
  return { v: 1, items };
}

/**
 * The snapshot to write: the plugin's own `snapshot` (cricket drops its ball
 * log) plus — only for a COMPLETED match — the records derived from the FULL
 * state (before the snapshot drops anything). A still-open snapshot never
 * carries a block (an Undo after full time, a held result: SD-111), even one
 * left over in a state hydrated from an older snapshot. Never throws: a hook
 * that fails just leaves the block out.
 */
export function withMatchRecords<S>(
  plugin: { snapshot?: (s: S) => S; matchRecords?: (s: S) => MatchRecordsBlock | null },
  state: S,
  completed: boolean,
): object {
  const snap = ((plugin.snapshot?.(state) ?? state) ?? {}) as Record<string, unknown>;
  const { [MATCH_RECORDS_KEY]: _old, ...rest } = snap;
  if (!completed || !plugin.matchRecords) return rest;
  let rec: MatchRecordsBlock | null = null;
  try { rec = plugin.matchRecords(state); } catch { rec = null; }
  return rec ? { ...rest, [MATCH_RECORDS_KEY]: rec } : rest;
}

/* ------------------------------------------------------------ helpers -- */

export const otherSide = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Biggest-win / team-high items from a final regulation score. */
export function scoreItems(home: number, away: number, opts: { teamHigh?: boolean; mostGoals?: boolean; biggestWin?: boolean }): MatchRecordItem[] {
  const out: MatchRecordItem[] = [];
  const h = Number(home) || 0;
  const a = Number(away) || 0;
  const text = `${h}–${a}`;
  if (opts.teamHigh) {
    out.push({ type: 'teamHigh', value: h, text: String(h), side: 'home' });
    out.push({ type: 'teamHigh', value: a, text: String(a), side: 'away' });
  }
  if (opts.mostGoals && h + a > 0) out.push({ type: 'mostGoals', value: h + a, text });
  if (opts.biggestWin && h !== a) {
    const w: Side = h > a ? 'home' : 'away';
    // margin first, then the winner's total (a 6–2 beats a 4–0)
    out.push({ type: 'biggestWin', value: Math.abs(h - a) * 1000 + Math.max(h, a), text: w === 'home' ? text : `${a}–${h}`, side: w });
  }
  return out;
}

/* --------------------------------------------------- set / game sports -- */

/** A match tiebreak's points (an older padel snapshot kept them only in `tb`). */
const cellPoints = (c: LineCell): Pair =>
  (c.matchTb && c.tb && (c.home + c.away === 0) ? c.tb : [c.home, c.away]);

/**
 * The records every set / game sport shares, from its line score and stamped
 * events: longest match (sets / games played, then games or points in them),
 * longest by the clock (SD-54 stamps only), the comeback (the winner trailed by
 * N sets / games — "from 0-2 down"), and the longest tiebreak (tennis / padel)
 * or longest set / game by points (the rally sports, volleyball).
 */
export function setSportRecords(
  ls: LineScore | null | undefined,
  events: LiveEvent[] | undefined,
  opts: { tiebreaks: boolean },
): MatchRecordsBlock | null {
  if (!ls || !ls.ended || !Array.isArray(ls.done) || !ls.done.length) return null;
  const items: MatchRecordItem[] = [];
  const unit = ls.unit;
  const cells = ls.done;
  const line = cells.map((c) => {
    const [h, a] = cellPoints(c);
    if (c.matchTb) return `[${h}-${a}]`;
    return c.tb ? `${h}-${a}(${Math.min(c.tb[0], c.tb[1])})` : `${h}-${a}`;
  }).join(', ');
  const n = cells.length;
  const inside = cells.reduce((t, c) => { const [h, a] = cellPoints(c); return t + h + a; }, 0);
  items.push({ type: 'longestMatch', value: n * 10000 + inside, text: `${n} ${unit}${n === 1 ? '' : 's'} · ${line}` });

  const ms = durations(events ?? []).match;
  const t = fmtDuration(ms);
  if (ms != null && t && t !== '<1 min') items.push({ type: 'longestTime', value: Math.round(ms / 1000), text: `${t} · ${line}` });

  const winner: Side | null = ls.won.home > ls.won.away ? 'home' : ls.won.away > ls.won.home ? 'away' : null;
  if (winner) {
    let w = 0, l = 0, deficit = 0, at: [number, number] = [0, 0];
    for (const c of cells) {
      const [h, a] = cellPoints(c);
      if (h === a) continue;
      const cw: Side = h > a ? 'home' : 'away';
      if (cw === winner) w += 1; else l += 1;
      if (l - w > deficit) { deficit = l - w; at = [w, l]; }
    }
    if (deficit >= 1) {
      const won = winner === 'home' ? `${ls.won.home}–${ls.won.away}` : `${ls.won.away}–${ls.won.home}`;
      items.push({ type: 'comeback', value: deficit * 100 + n, text: `${won} from ${at[0]}-${at[1]} down`, side: winner });
    }
  }

  if (opts.tiebreaks) {
    for (const c of cells) {
      const tb = c.matchTb ? cellPoints(c) : c.tb;
      if (!tb) continue;
      const pts = tb[0] + tb[1];
      items.push({ type: 'longestTiebreak', value: pts, text: c.matchTb ? `[${tb[0]}-${tb[1]}] match tiebreak` : `${c.home}-${c.away} · tiebreak ${tb[0]}-${tb[1]}` });
    }
  } else {
    // the longest set / game of this match (one candidate per match)
    let best: LineCell | null = null;
    for (const c of cells) if (!best || c.home + c.away > best.home + best.away) best = c;
    if (best && best.home + best.away > 0) items.push({ type: 'longestGame', value: best.home + best.away, text: `${best.home}-${best.away}` });
  }
  return block(items);
}

/* ----------------------------------------------------------- backfill -- */

export interface RecordsDiff {
  /** the stored block differs from the recomputed one (incl. none ↔ some) */
  change: boolean;
  before: number;
  after: number;
  /** record types whose candidates change */
  types: string[];
}

/** SD-51 backfill planner: the stored block (in `prevState`) vs the one the
 *  replay derives (`next`). Same items in the same order = no write, so a
 *  second run changes nothing (idempotent). */
export function recordsDiff(prevState: unknown, next: MatchRecordsBlock | null): RecordsDiff {
  const prev = readMatchRecords(prevState);
  const a = prev?.items ?? [];
  const b = next?.items ?? [];
  const key = (i: MatchRecordItem) => JSON.stringify([i.type, i.value, i.text, i.side ?? null, i.playerId ?? null, i.playerName ?? null, i.partnerId ?? null, i.partnerName ?? null, i.note ?? null]);
  const types = new Set<string>();
  const byType = (xs: MatchRecordItem[]) => {
    const m = new Map<string, string[]>();
    for (const i of xs) m.set(i.type, [...(m.get(i.type) ?? []), key(i)]);
    return m;
  };
  const ma = byType(a);
  const mb = byType(b);
  for (const t of new Set([...ma.keys(), ...mb.keys()])) if (JSON.stringify(ma.get(t) ?? []) !== JSON.stringify(mb.get(t) ?? [])) types.add(t);
  // a stored block that isn't a valid v1 one (or extra junk) is rewritten too
  const raw = (prevState as Record<string, unknown> | null | undefined)?.[MATCH_RECORDS_KEY];
  const malformed = raw !== undefined && !prev;
  return { change: types.size > 0 || malformed || (!!prev && !next), before: a.length, after: b.length, types: [...types] };
}

/** The state with ONLY the records key replaced (or removed when `next` is null). */
export function stateWithRecords(prevState: unknown, next: MatchRecordsBlock | null): Record<string, unknown> {
  const { [MATCH_RECORDS_KEY]: _old, ...rest } = ((prevState ?? {}) as Record<string, unknown>);
  return next ? { ...rest, [MATCH_RECORDS_KEY]: next } : rest;
}

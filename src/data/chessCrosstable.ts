/**
 * SD-77 (CH-06) — the chess wall chart / crosstable, built from a ranked
 * standings table (`teamStandings` rows with their per-round `games`, SD-10 /
 * SD-26). PURE (no React Native) — node tests load it.
 *
 *  • Swiss: one row per player, one cell per round — the opponent's rank in
 *    this table, the colour and the result, as Swiss-Manager / Chess-Results
 *    print it: "4w1", "2b½", "6b0"; a forfeit "3+" / "3−" (FIDE writes
 *    unplayed results with + / −), a double forfeit "3−" on both rows, a
 *    pairing-allocated bye "bye" (its points under it), a round with no game
 *    and no bye "–" (absent), a game still to finish "…".
 *  • Round robin: the classic grid — one column per opponent by rank, each
 *    cell the result(s) against them ("1", "½", "0", "+", "−"); a double
 *    round robin shows both ("1 ½"). The diagonal is blank.
 *  • Then the score, the active tie-break columns (the same values as the
 *    rank list — Buchholz Cut-1, Buchholz, Sonneborn-Berger, progressive …),
 *    and — when anyone has a rating on the event's list — Rtg, ARO and TPR
 *    (SD-85, unofficial: see chessRatings.ts).
 */
import type { Match, StatLine } from '../core/types';
import type { StandingsConfig, TeamStanding } from './standings.ts';
import { sideOf } from './lineContext.ts';
import { tableColumns, halfText } from './standingsColumns.ts';
import { performance, type Performance } from './chessRatings.ts';

export interface CrossCell {
  /** Swiss: the round (1-based); round robin: the opponent's rank */
  col: number;
  text: string;
  /** spoken / long form: "Round 3: White v Priya — won" */
  title: string;
  oppId?: string;
  oppRank?: number;
  colour?: 'white' | 'black';
  /** the cell's game(s) ended — false for a game still to be played */
  done: boolean;
  /** 'played' | 'forfeit' | 'bye' | 'absent' | 'pending' | 'self' | 'none' */
  kind: 'played' | 'forfeit' | 'bye' | 'absent' | 'pending' | 'self' | 'none';
  /** points the cell scored (undefined for pending / none / self) */
  points?: number;
}

export interface CrossRow {
  rank: number;
  teamId: string;
  name: string;
  rating?: number;
  cells: CrossCell[];
  points: number;
  pointsText: string;
  /** tie-break values in `tbHeads` order */
  tbs: string[];
  perf: Performance;
}

export interface Crosstable {
  swiss: boolean;
  /** Swiss: rounds shown; round robin: players */
  cols: number;
  rows: CrossRow[];
  tbHeads: { key: string; label: string; title: string }[];
  /** any player has a rating on the event's list → Rtg / ARO / TPR shown */
  rated: boolean;
}

const RES = (r: string) => (r === 'win' ? '1' : r === 'draw' ? '½' : r === 'loss' ? '0' : 'nr');
const WORD = (r: string) => (r === 'win' ? 'won' : r === 'draw' ? 'drew' : r === 'loss' ? 'lost' : 'no result');
const FACTOR = (r: string) => (r === 'win' ? 1 : r === 'draw' ? 0.5 : 0);

export interface CrosstableInput {
  rows: TeamStanding[];
  cfg: StandingsConfig;
  /** rating on the event's list, by entrant (team) id */
  ratingOf?: (teamId: string) => number | undefined;
  /** Swiss rounds to show (default: the highest round in the data) */
  rounds?: number;
  /** `${teamId}|${round}` of games drawn but not finished */
  pending?: Set<string>;
}

export function buildCrosstable({ rows, cfg, ratingOf, rounds, pending }: CrosstableInput): Crosstable {
  const rankOf = new Map(rows.map((t, i) => [t.teamId, i + 1]));
  const nameOf = new Map(rows.map((t) => [t.teamId, t.name]));
  const swiss = rows.some((t) => (t.games ?? []).some((g) => g.round !== undefined));
  const maxRound = Math.max(0, ...rows.flatMap((t) => (t.games ?? []).map((g) => g.round ?? 0)), ...[...(pending ?? [])].map((k) => Number(k.split('|')[1]) || 0));
  const R = swiss ? Math.max(rounds ?? 0, maxRound) : rows.length;
  const tbCols = tableColumns('chess', cfg, 'individual', rows).columns.filter((c) => c.tieBreak);
  const rated = !!ratingOf && rows.some((t) => ratingOf(t.teamId) !== undefined);

  const out: CrossRow[] = rows.map((t, i) => {
    const games = t.games ?? [];
    const cells: CrossCell[] = [];
    if (swiss) {
      for (let r = 1; r <= R; r++) {
        const g = games.find((x) => x.round === r);
        if (!g) {
          const isPending = pending?.has(`${t.teamId}|${r}`);
          cells.push(isPending
            ? { col: r, text: '…', title: `Round ${r}: to be played`, done: false, kind: 'pending' }
            : r <= maxRound
              ? { col: r, text: '–', title: `Round ${r}: not paired (absent)`, done: true, kind: 'absent', points: 0 }
              : { col: r, text: '', title: `Round ${r}: not drawn yet`, done: false, kind: 'none' });
          continue;
        }
        if (g.kind === 'bye') {
          cells.push({ col: r, text: 'bye', title: `Round ${r}: bye (${halfText(g.points)})`, done: true, kind: 'bye', points: g.points });
          continue;
        }
        const oppRank = g.opponentId ? rankOf.get(g.opponentId) : undefined;
        const opp = g.opponentId ? nameOf.get(g.opponentId) ?? 'opponent' : 'opponent';
        if (g.kind === 'forfeit') {
          const won = g.result === 'win';
          cells.push({ col: r, text: `${oppRank ?? '?'}${won ? '+' : '−'}`, title: `Round ${r}: v ${opp} — ${won ? 'won by forfeit' : 'lost by forfeit'}`,
            oppId: g.opponentId, oppRank, done: true, kind: 'forfeit', points: g.points });
          continue;
        }
        const c = g.colour === 'black' ? 'b' : g.colour === 'white' ? 'w' : '';
        cells.push({
          col: r, text: `${oppRank ?? '?'}${c}${RES(g.result)}`,
          title: `Round ${r}: ${g.colour === 'black' ? 'Black v ' : g.colour === 'white' ? 'White v ' : 'v '}${opp} — ${WORD(g.result)}`,
          oppId: g.opponentId, oppRank, colour: g.colour, done: true, kind: 'played', points: g.points,
        });
      }
    } else {
      for (let j = 1; j <= rows.length; j++) {
        if (j === i + 1) { cells.push({ col: j, text: '', title: '', done: true, kind: 'self' }); continue; }
        const oppId = rows[j - 1].teamId;
        const vs = games.filter((g) => g.opponentId === oppId);
        if (!vs.length) { cells.push({ col: j, text: '', title: `v ${rows[j - 1].name}: not played yet`, done: false, kind: 'none', oppId, oppRank: j }); continue; }
        const text = vs.map((g) => (g.kind === 'forfeit' ? (g.result === 'win' ? '+' : '−') : RES(g.result))).join(' ');
        const title = `v ${rows[j - 1].name}: ${vs.map((g) => (g.kind === 'forfeit' ? `${WORD(g.result)} by forfeit` : `${g.colour ? `${g.colour === 'white' ? 'White' : 'Black'}, ` : ''}${WORD(g.result)}`)).join('; ')}`;
        cells.push({ col: j, text, title, oppId, oppRank: j, done: true, kind: vs.every((g) => g.kind === 'forfeit') ? 'forfeit' : 'played', points: vs.reduce((s, g) => s + g.points, 0) });
      }
    }
    const perf = performance(games.filter((g) => g.kind !== 'bye').map((g) => ({
      oppRating: g.opponentId && ratingOf ? ratingOf(g.opponentId) : undefined,
      score: FACTOR(g.result), unplayed: g.unplayed || g.result === 'nr',
    })));
    return {
      rank: i + 1, teamId: t.teamId, name: t.name, rating: ratingOf?.(t.teamId), cells,
      points: t.points, pointsText: halfText(t.points),
      tbs: tbCols.map((c) => c.value(t, rows)), perf,
    };
  });
  return { swiss, cols: R, rows: out, tbHeads: tbCols.map((c) => ({ key: c.key, label: c.label, title: c.title })), rated };
}

/** One player's tournament line, for the card under the crosstable:
 *  "R1 4w1 · R2 2b½ · R3 bye — 2½ pts · ARO 1612 · TPR 1735". */
export function playerLine(x: Crosstable, teamId: string): string {
  const r = x.rows.find((y) => y.teamId === teamId);
  if (!r) return '';
  const cells = r.cells.filter((c) => c.kind !== 'self' && c.kind !== 'none' && c.text)
    .map((c) => (x.swiss ? `R${c.col} ${c.text}` : `v${c.col} ${c.text}`));
  const tail = [`${r.pointsText} ${r.points === 1 ? 'pt' : 'pts'}`];
  if (r.perf.aro !== undefined) tail.push(`ARO ${r.perf.aro}`);
  if (r.perf.tpr !== undefined) tail.push(`TPR ${r.perf.tpr}`);
  return `${cells.join(' · ')}${cells.length ? ' — ' : ''}${tail.join(' · ')}`;
}

/** Which player each one-player entrant (team) is: a team whose roster is
 *  that one player, else the player whose stat lines sit on that side of the
 *  entrant's games. Unknown entrants are left out (no rating). */
export function entrantPlayers(
  teams: { id: string; roster?: string[] }[],
  matches: Match[],
  lines: StatLine[] = [],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of teams) if (t.roster?.length === 1) out.set(t.id, t.roster[0]);
  const byId = new Map(matches.map((m) => [m.id, m]));
  for (const l of lines) {
    const m = byId.get(l.matchId);
    if (!m || m.sport !== 'chess') continue;
    const side = sideOf(l, m);
    const teamId = side === 'home' ? m.homeTeam.id : side === 'away' ? m.awayTeam.id : undefined;
    if (teamId && !out.has(teamId)) out.set(teamId, l.playerId);
  }
  return out;
}

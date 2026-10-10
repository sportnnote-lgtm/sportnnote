/**
 * SD-18 — each sport's standings columns (GEN-05). Pure and RN-free: the
 * Standings screen's grid and the compact LeagueTable both read
 * `tableColumns(sport, cfg, participantKind, rows)`.
 *
 *   football / hockey / handball  P W D L GF GA GD Pts
 *   basketball (points sports)    P W L PF PA ± Pts
 *   volleyball                    P W L Sets SR PR Pts
 *   kabaddi                       P W T L SD Pts
 *   badminton / TT / squash /
 *   pickleball / carrom           P W L G± P± Pts
 *   tennis / padel                P W L S± G± Pts
 *   cricket (SD-12)               P W T L NR NRR Pts
 *   chess                         P W-D-L Pts SB …
 *
 * plus one column for every per-row tie-breaker of the active chain that the
 * base set doesn't already show (S% / G% for ATP, SR / PR, FP, SB, and any
 * registered tie-breaker with a column — chess Buchholz in SD-26). Criteria
 * computed among the tied only (head-to-head and its ratios) can't be a
 * column; `tieBreakNote` spells the order out instead.
 */
import type { SportId } from '../core/types';
import {
  customTieBreaker, scoreUnit, tableLabels, tieBreakerLabel,
  type StandingsConfig, type TeamStanding, type TieBreaker,
} from './standings.ts';

/** Who a table's rows are: a team, one player, or a doubles pair. 'both' is a
 *  sport's raw `participantKind` (singles by default, like `participantMode`). */
export type TableParticipant = 'team' | 'individual' | 'pairs' | 'both';

export interface StandingsColumn {
  /** stable id: 'played' | 'won' | 'drawn' | 'lost' | 'nr' | 'wdl' | 'for' |
   *  'against' | 'diff' | 'sets' | 'gamesDiff' | 'pointsDiff' | 'nrr' |
   *  'setRatio' | 'pointRatio' | 'setsPct' | 'gamesPct' | 'fairPlay' |
   *  'points' | 'sb' | 'tb:<key>' */
  key: string;
  /** compact header ("GD", "SR") */
  label: string;
  /** plain words, for screen readers and the legend */
  title: string;
  /** needs a wider cell (ratios, rates, "12-4") */
  wide?: boolean;
  /** the points column (bold, primary) */
  emphasis?: boolean;
  /** beyond P / W / D / L / for-against / NR / NRR / Pts — the compact
   *  LeagueTable lists these on an extra line */
  extra?: boolean;
  /** shown because the active tie-break chain uses it */
  tieBreak?: boolean;
  /** the row's figure as shown */
  value: (t: TeamStanding, rows: TeamStanding[]) => string;
}

export interface TableColumns {
  /** the name column's header */
  nameHeader: 'Team' | 'Player' | 'Pair';
  columns: StandingsColumn[];
}

const DASH = '—';
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
/** won ÷ lost to 3 places (FIVB style); nothing lost → "MAX", nothing at all → "—". */
export const ratioText = (won: number, lost: number) => (lost === 0 ? (won > 0 ? 'MAX' : DASH) : (won / lost).toFixed(3));
/** won ÷ (won + lost) as a percentage to 1 place. */
export const pctText = (won: number, lost: number) => (won + lost === 0 ? DASH : ((100 * won) / (won + lost)).toFixed(1));
/** chess-style half points: 2.5 → "2½", 0.5 → "½". */
export const halfText = (n: number) => {
  const whole = Math.trunc(n);
  const frac = Math.abs(n - whole);
  if (Math.abs(frac - 0.5) < 1e-9) return `${whole === 0 ? (n < 0 ? '−' : '') : whole}½`;
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '');
};

const SPORTS_WITH_DRAWS = new Set<string>(['football', 'hockey', 'handball', 'kabaddi']);

/** Does this sport's table need the SD-17 units (sets / games / rally points)
 *  for its base columns? */
function needsUnits(sport: SportId | string): boolean {
  if (sport === 'volleyball' || sport === 'carrom') return true;
  const u = scoreUnit(sport);
  return u === 'sets' || u === 'games';
}

/** The standings config a TABLE should be computed with: the organiser's, with
 *  `withUnits` on when the sport's columns show sets / games / rally points
 *  (SD-17 hook). Ranking is unchanged — only extra figures are filled in. */
export function columnsConfig(sport: SportId | string, cfg: StandingsConfig): StandingsConfig {
  return needsUnits(sport) && !cfg.withUnits ? { ...cfg, withUnits: true } : cfg;
}

const rallyDiff = (t: TeamStanding) => (t.rallyFor === undefined ? DASH : signed(t.rallyFor - (t.rallyAgainst ?? 0)));
const rallyRatio = (t: TeamStanding) => (t.rallyFor === undefined ? DASH : ratioText(t.rallyFor, t.rallyAgainst ?? 0));
const setsWon = (t: TeamStanding) => t.setsFor ?? t.for;
const setsLost = (t: TeamStanding) => t.setsAgainst ?? t.against;
const gamesDiff = (t: TeamStanding) => (t.gamesFor === undefined ? DASH : signed(t.gamesFor - (t.gamesAgainst ?? 0)));

/** Canonical left-to-right order (Pts last, except chess: score then its
 *  tie-break columns, as on a FIDE rank list). */
const ORDER = ['played', 'won', 'drawn', 'lost', 'wdl', 'nr', 'for', 'against', 'diff', 'sets', 'gamesDiff', 'pointsDiff',
  'nrr', 'setRatio', 'pointRatio', 'setsPct', 'gamesPct', 'fairPlay'];

/** A sport's standings columns for a config (its tie-break chain) and who the
 *  rows are. `rows` decides the conditional ones (a D column once someone has
 *  drawn, NR once a match was abandoned); values are read straight off the
 *  `teamStandings` rows. */
export function tableColumns(
  sport: SportId | string, cfg: StandingsConfig, participantKind: TableParticipant = 'team', rows: TeamStanding[] = [],
): TableColumns {
  const unit = scoreUnit(sport);
  const labels = tableLabels(sport as SportId);
  const chain = new Set<TieBreaker>([...cfg.order, ...(cfg.pairOrder ?? [])]);
  const cols = new Map<string, StandingsColumn>();
  const add = (c: StandingsColumn) => { if (!cols.has(c.key)) cols.set(c.key, c); };
  const chess = sport === 'chess';

  add({ key: 'played', label: 'P', title: 'played', value: (t) => String(t.played) });
  if (chess) {
    add({ key: 'wdl', label: 'W-D-L', title: 'won, drawn, lost', wide: true, value: (t) => `${t.won}-${t.drawn}-${t.lost}` });
  } else {
    add({ key: 'won', label: 'W', title: 'won', value: (t) => String(t.won) });
    // Draw sports always carry the column; cricket (T) and the rest only once
    // someone has one (SD-12 behaviour).
    if (SPORTS_WITH_DRAWS.has(sport) || rows.some((t) => t.drawn > 0))
      add({ key: 'drawn', label: labels.draw, title: labels.draw === 'T' ? 'tied' : 'drawn', value: (t) => String(t.drawn) });
    add({ key: 'lost', label: 'L', title: 'lost', value: (t) => String(t.lost) });
  }
  if (labels.alwaysNr || rows.some((t) => (t.nr ?? 0) > 0)) add({ key: 'nr', label: 'NR', title: 'no result', value: (t) => String(t.nr ?? 0) });

  // The sport's own score columns.
  const forCol = (label: string, title: string): StandingsColumn => ({ key: 'for', label, title, value: (t) => String(t.for) });
  if (sport === 'cricket') {
    add({ key: 'nrr', label: 'NRR', title: 'net run rate', wide: true, value: (t) => (t.nrr === undefined ? DASH : `${t.nrr >= 0 ? '+' : ''}${t.nrr.toFixed(2)}`) });
  } else if (chess) {
    // the score is the points column
  } else if (unit === 'goals') {
    add(forCol('GF', 'goals for'));
    add({ key: 'against', label: 'GA', title: 'goals against', value: (t) => String(t.against) });
    add({ key: 'diff', label: 'GD', title: 'goal difference', value: (t) => signed(t.diff) });
  } else if (sport === 'kabaddi') {
    add({ key: 'diff', label: 'SD', title: 'score difference', value: (t) => signed(t.diff) });
  } else if (sport === 'volleyball') {
    add({ key: 'sets', label: 'Sets', title: 'sets won-lost', wide: true, value: (t) => `${setsWon(t)}-${setsLost(t)}` });
    add({ key: 'setRatio', label: 'SR', title: 'set ratio', wide: true, extra: true, value: (t) => ratioText(setsWon(t), setsLost(t)) });
    add({ key: 'pointRatio', label: 'PR', title: 'point ratio', wide: true, extra: true, value: rallyRatio });
  } else if (unit === 'sets') {
    // tennis / padel: the match score is sets
    add({ key: 'diff', label: 'S±', title: 'sets difference', value: (t) => signed(t.diff) });
    add({ key: 'gamesDiff', label: 'G±', title: 'games difference', extra: true, value: gamesDiff });
  } else if (unit === 'games') {
    add({ key: 'diff', label: 'G±', title: 'games difference', value: (t) => signed(t.diff) });
    add({ key: 'pointsDiff', label: 'P±', title: sport === 'carrom' ? 'board points difference' : 'points difference', extra: true, value: rallyDiff });
  } else {
    add(forCol('PF', 'points for'));
    add({ key: 'against', label: 'PA', title: 'points against', value: (t) => String(t.against) });
    add({ key: 'diff', label: '±', title: 'points difference', value: (t) => signed(t.diff) });
  }

  // One column per per-row tie-breaker of the chain not already shown.
  const tb = (c: Omit<StandingsColumn, 'tieBreak' | 'extra'>) => add({ ...c, tieBreak: true, extra: true });
  for (const k of chain) {
    switch (k) {
      case 'for':
        // cricket keeps its SD-12 table; chess has no score; volleyball: the Sets column
        if (sport === 'cricket' || chess || sport === 'volleyball') break;
        if (unit === 'sets' || unit === 'games') tb({ key: 'for', label: unit === 'sets' ? 'SW' : 'GW', title: tieBreakerLabel('for', sport), value: (t) => String(t.for) });
        else if (sport === 'kabaddi') tb({ key: 'for', label: 'PF', title: 'points scored', value: (t) => String(t.for) });
        break;
      case 'diff':
        if (chess || sport === 'cricket' || sport === 'volleyball') break; // volleyball: the Sets column
        tb({ key: 'diff', label: '±', title: tieBreakerLabel('diff', sport), value: (t) => signed(t.diff) });
        break;
      case 'nrr':
        if (rows.some((t) => t.nrr !== undefined)) tb({ key: 'nrr', label: 'NRR', title: 'net run rate', wide: true, value: (t) => (t.nrr === undefined ? DASH : `${t.nrr >= 0 ? '+' : ''}${t.nrr.toFixed(2)}`) });
        break;
      case 'setRatio': tb({ key: 'setRatio', label: 'SR', title: 'set ratio', wide: true, value: (t) => ratioText(t.setsFor ?? 0, t.setsAgainst ?? 0) }); break;
      case 'setsPct': tb({ key: 'setsPct', label: 'S%', title: '% of sets won', wide: true, value: (t) => pctText(t.setsFor ?? 0, t.setsAgainst ?? 0) }); break;
      case 'gamesDiff': tb({ key: 'gamesDiff', label: 'G±', title: 'games difference', value: gamesDiff }); break;
      case 'gamesPct': tb({ key: 'gamesPct', label: 'G%', title: '% of games won', wide: true, value: (t) => pctText(t.gamesFor ?? 0, t.gamesAgainst ?? 0) }); break;
      case 'pointRatio': tb({ key: 'pointRatio', label: 'PR', title: 'point ratio', wide: true, value: rallyRatio }); break;
      case 'pointsDiff': tb({ key: 'pointsDiff', label: 'P±', title: tieBreakerLabel('pointsDiff', sport), value: rallyDiff }); break;
      case 'fairPlay': tb({ key: 'fairPlay', label: 'FP', title: 'fair play points', value: (t) => String(t.fairPlay ?? 0) }); break;
      default: break; // played / wins already shown; h2h* only among the tied; lots → ‡; sb + custom below
    }
  }

  const ordered = ORDER.filter((k) => cols.has(k)).map((k) => cols.get(k)!);
  const points: StandingsColumn = { key: 'points', label: 'Pts', title: 'points', emphasis: true, value: (t) => (chess ? halfText(t.points) : String(t.points)) };
  // Chess (FIDE rank list): Sonneborn-Berger and registered tie-breaks follow the score.
  const after: StandingsColumn[] = [];
  for (const k of chain) {
    if (k === 'sb') after.push({ key: 'sb', label: 'SB', title: 'Sonneborn-Berger', wide: true, tieBreak: true, extra: true, value: (t) => (t.sb === undefined ? DASH : halfText(t.sb)) });
    const custom = customTieBreaker(k);
    if (!custom) continue;
    if (custom.column) {
      const col = custom.column;
      after.push({ key: `tb:${k}`, label: col.short, title: custom.label, wide: true, tieBreak: true, extra: true,
        value: (t, all) => { const v = col.value(t, all); return v === null ? DASH : typeof v === 'number' ? halfText(v) : v; } });
    } else if (custom.seed) {
      const seed = custom.seed;
      after.push({ key: `tb:${k}`, label: custom.label.slice(0, 4), title: custom.label, wide: true, tieBreak: true, extra: true,
        value: (t) => { const v = seed(t); return v === null ? DASH : halfText(v); } });
    }
  }
  const columns = chess || after.length ? [...ordered, points, ...after] : [...ordered, points];
  const kind = participantKind === 'both' ? 'individual' : participantKind;
  return { nameHeader: kind === 'individual' ? 'Player' : kind === 'pairs' ? 'Pair' : 'Team', columns };
}

/** The tie-break order in plain words, for a line under the table — the
 *  criteria computed among the tied (head-to-head) have no column, so this is
 *  what explains the ordering. Absent when nothing beyond points ranks. */
export function tieBreakNote(sport: SportId | string, cfg: StandingsConfig): string | undefined {
  const words = (chain: TieBreaker[]) => chain.map((k) => tieBreakerLabel(k, sport)).join(', ');
  const first = cfg.rankBy === 'wins' ? 'Ranked by wins, then points. ' : '';
  if (!cfg.order.length && !cfg.pairOrder?.length) return first ? first.trim() : undefined;
  if (cfg.pairOrder?.length)
    return `${first}Level: two → ${words(cfg.pairOrder)}; three or more → ${words(cfg.order)}.`;
  return `${first}Level on ${cfg.rankBy === 'wins' ? 'both' : 'points'} → ${words(cfg.order)}.`;
}

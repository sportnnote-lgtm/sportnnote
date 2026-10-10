/**
 * Cross-sport player ratings for the match Summary tab. Each sport scores a
 * player's recorded stat line (the per-match counters written during scoring)
 * with its own weights, then we map the contribution to a 1–5 star rating
 * relative to the best performer in that match. Cricket ships its own richer,
 * state-based summary; every other sport uses this.
 */
import type { Match, Player, SportId, StatLine, TournamentAward } from '../core/types';
import { STAT_SPORTS, mvpWeights, matchSummaryLabels, labelCompact, matchAwards, tournamentAwards, eligibilityOf, awardDef, statSchema } from '../sports/statSchemas.ts';
import { aggregateValue, qualifierOf, qualifierText, rankPlayers, statDefIn, type Qualifier, type StatDef } from '../sports/statSchema.ts';
import { effectiveQualifier, withLineResults, type LeaderMins } from './leaderMinimums.ts';
import { cricketCareer } from './cricketCareer.ts';
import { isGoalkeeper } from '../sports/football/keepers.ts';

/** SD-15: every map below is a derived view of the per-sport stat schema
 *  (src/sports/<sport>/stats.ts) — edit the schema, not these. */

/** Points per unit of each stat, per sport (schema `weight`, in schema order).
 *  Negatives penalise (cards, fouls). Volleyball's `points` includes aces &
 *  blocks (SD-04), so theirs is the bonus on top. Per match, cricket uses its
 *  own Summary; its weights drive "Player of the Tournament". */
export const STAT_WEIGHTS: Record<SportId, Record<string, number>> = Object.fromEntries(
  STAT_SPORTS.map((sp) => [sp, mvpWeights(sp)]),
) as Record<SportId, Record<string, number>>;

/** Short (plural) labels for the per-player stat detail line — the keys the
 *  schema lists on the per-match rating line (`matchSummary`). */
export const STAT_LABELS: Record<string, string> = matchSummaryLabels();

/** Count-aware stat label — "1 goal" / "2 goals", invariant labels unchanged.
 *  Pass the sport for a sport-specific label (all sports agree today). */
export const statLabel = (stat: string, count: number, sport?: SportId): string => labelCompact(stat, count, sport);

/** Sport-specific "best in role" awards — the top player by a single stat
 *  (schema awards shown per match). */
export const SPORT_AWARDS: Record<SportId, { icon: string; label: string; stat: string }[]> = Object.fromEntries(
  STAT_SPORTS.map((sp) => [sp, matchAwards(sp).map((a) => ({ icon: a.icon, label: a.label, stat: a.stat }))]),
) as Record<SportId, { icon: string; label: string; stat: string }[]>;

export interface MatchRating {
  id: string;
  name: string;
  side: 'home' | 'away';
  points: number;
  rating: number; // 1–5
  detail: string; // e.g. "2 goals · 1 assist"
  stats: Record<string, number>;
}

const star = (r: number) => '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));
export const ratingStars = star;

/** Build ratings for a match from its stat lines + the two rosters. */
export function matchRatings(
  lines: StatLine[],
  sport: SportId,
  homeRoster: Player[],
  awayRoster: Player[]
): { players: MatchRating[]; mvp?: MatchRating } {
  const weights = STAT_WEIGHTS[sport] ?? {};
  const sideOf = (id: string): 'home' | 'away' | undefined =>
    homeRoster.some((p) => p.id === id) ? 'home' : awayRoster.some((p) => p.id === id) ? 'away' : undefined;
  const nameOf = (id: string) =>
    [...homeRoster, ...awayRoster].find((p) => p.id === id)?.fullName ?? 'Player';

  const raw = lines
    .map((l) => {
      const stats = l.stats ?? {};
      const points = Object.entries(stats).reduce((sum, [k, v]) => sum + v * (weights[k] ?? 0), 0);
      const detail = Object.entries(stats)
        .filter(([k, v]) => v !== 0 && STAT_LABELS[k])
        .sort((a, b) => Math.abs(b[1] * (weights[b[0]] ?? 0)) - Math.abs(a[1] * (weights[a[0]] ?? 0)))
        .slice(0, 6) // keep the line readable for busy players
        .map(([k, v]) => `${v} ${statLabel(k, v)}`)
        .join(' · ');
      return { id: l.playerId, name: nameOf(l.playerId), side: sideOf(l.playerId) ?? 'home', points, detail, stats };
    })
    .filter((p) => p.detail.length > 0);

  const top = Math.max(1, ...raw.map((p) => p.points));
  const players: MatchRating[] = raw
    .map((p) => {
      // Relative to the match's best; a contribution of 0/negative floors at 1.
      const r = p.points <= 0 ? 1 : Math.max(1, Math.min(5, Math.round((1.5 + (p.points / top) * 3.5) * 2) / 2));
      return { ...p, rating: r };
    })
    .sort((a, b) => b.points - a.points);

  return { players, mvp: players.find((p) => p.points > 0) };
}

export interface Award {
  icon: string;
  label: string;
  stat: string;
  player: MatchRating;
  value: number;
}

/** Top player for each of the sport's role awards (highest of that stat, > 0). */
export function awardsFor(players: MatchRating[], sport: SportId): Award[] {
  return (SPORT_AWARDS[sport] ?? [])
    .map((a) => {
      const ranked = players.filter((p) => (p.stats[a.stat] ?? 0) > 0).sort((x, y) => (y.stats[a.stat] ?? 0) - (x.stats[a.stat] ?? 0));
      const player = ranked[0];
      return player ? { ...a, player, value: player.stats[a.stat] ?? 0 } : null;
    })
    .filter((a): a is Award => !!a);
}

/* ------------------------- Tournament awards (parity #21) ------------------------- */

export interface AwardSlot {
  /** 'mvp' or the stat key it ranks by */
  slot: string;
  label: string;
  icon: string;
  stat?: string;
}

const MVP_SLOT: AwardSlot = { slot: 'mvp', label: 'Player of the Tournament', icon: '🏆' };

/** The fixed award slots per sport: Player of the Tournament + the schema's
 *  tournament awards (a tournament name such as "Golden Glove" keeps the same
 *  slot key, so awards already published keep matching their slot). SD-27: a
 *  slot may RANK by another stat (`rankBy`: basketball Top scorer by PPG). */
export const TOURNAMENT_AWARD_SLOTS: Record<SportId, AwardSlot[]> = Object.fromEntries(
  STAT_SPORTS.map((sp) => [
    sp,
    [MVP_SLOT, ...tournamentAwards(sp).map((a) => ({ slot: a.stat, label: a.tournamentLabel ?? a.label, icon: a.icon, stat: a.stat }))],
  ]),
) as Record<SportId, AwardSlot[]>;

/** Icon for an award (custom awards get a medal). A retired slot (racket "Top
 *  scorer", chess "Most wins") keeps its icon on awards already published. */
export const awardIcon = (sport: SportId, slot: string): string =>
  TOURNAMENT_AWARD_SLOTS[sport]?.find((x) => x.slot === slot)?.icon ?? awardDef(sport, slot)?.icon ?? '🏅';

/** Options shared by the award rankers. */
export interface AwardRankOptions {
  /** restrict to a tournament's matches */
  matchIds?: Iterable<string>;
  /** SD-27 — the matches, so each line's W / L is known (racket wins) */
  matches?: Match[];
  /** SD-27 — the organiser's minimums for this tournament (format `leaderMins`) */
  mins?: LeaderMins;
}

/** What a slot ranks by: the stat definition, its tie-breaks and who may win. */
interface SlotRank {
  def: StatDef;
  tieBreak: { key: string; better: 'higher' | 'lower' }[];
  keepers: boolean;
  /** the hand-written prose, if any */
  howRanked?: string;
}

/** The ranking a slot uses — undefined for a weighted MVP (summed weights). */
function slotRank(sport: SportId, slot: string): SlotRank | undefined {
  const schema = statSchema(sport);
  if (!schema) return undefined;
  if (slot === 'mvp') {
    const m = schema.mvp;
    const def = m && statDefIn(schema, m.stat);
    return m && def ? { def, tieBreak: m.tieBreak ?? def.tieBreak ?? [], keepers: false, howRanked: m.howRanked } : undefined;
  }
  const a = awardDef(sport, slot);
  const key = a?.rankBy ?? slot;
  const def: StatDef = statDefIn(schema, key) ?? { key, label: key };
  return {
    def, tieBreak: a?.tieBreak ?? def.tieBreak ?? [],
    keepers: eligibilityOf(sport, slot) === 'goalkeeper' || def.eligible === 'goalkeeper',
    howRanked: a?.howRanked,
  };
}

const isPlainTotal = (def: StatDef) => (def.agg?.kind ?? 'sum') === 'sum' && !(def.agg?.kind === 'sum' && (def.agg.keys || def.agg.key));

/** A figure with its name, short: "4 wins", "18.5 PPG", "80% win", "3/12". */
function statPhrase(sport: SportId, def: StatDef, value: number, text: string): string {
  const unit = def.format?.unit;
  if (unit === 'percent') return `${text} ${def.label.replace(/\s*%$/, '').toLowerCase()}`;
  if (unit === 'figure') return `${text} ${def.abbr ?? def.label.toLowerCase()}`;
  const k = def.agg?.kind ?? 'sum';
  if (k === 'perGame' || k === 'perSet' || k === 'rate' || unit === 'decimal') return `${text} ${def.abbr ?? def.label.toLowerCase()}`;
  return `${text} ${statLabel(def.key, value, sport)}`;
}

/** The text after "at least" for a qualifier ("3 matches"), or undefined. */
const minWords = (sport: SportId, def: StatDef, q: Qualifier | null | undefined): string | undefined => {
  const schema = statSchema(sport);
  const t = schema && q ? qualifierText(schema, def, q) : undefined;
  return t?.replace(/^min /, '');
};

/** The qualifier a slot ranks with in this tournament. */
const slotQualifier = (sport: SportId, def: StatDef, mins?: LeaderMins): Qualifier | null | undefined =>
  mins && def.key in mins ? effectiveQualifier(sport, def.key, mins) : qualifierOf(def);

/** How each slot is ranked — shown behind "How is this ranked?". Generated
 *  from the schema (the stat's aggregation, its minimum, the tie-break chain
 *  and who is eligible), unless the schema has hand-written prose. */
export function awardFormula(sport: SportId, slot: string, mins?: LeaderMins): string {
  const r = slotRank(sport, slot);
  if (!r) {
    // the weighted Player of the Tournament
    const w = Object.entries(STAT_WEIGHTS[sport] ?? {}).filter(([, v]) => v !== 0);
    const parts = w.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6).map(([k, v]) => `${statLabel(k, 2)} ${v > 0 ? '×' : '−'}${Math.abs(v)}`);
    return `Points summed over every match in this tournament${parts.length ? `: ${parts.join(', ')}` : ''}. Ties go by name. You choose the winner.`;
  }
  const q = slotQualifier(sport, r.def, mins);
  const min = minWords(sport, r.def, q);
  if (r.howRanked) return r.howRanked.replace('{min}', min ?? 'one game');
  return generatedFormula(sport, r, min);
}

function generatedFormula(sport: SportId, r: SlotRank, min: string | undefined): string {
  const { def } = r;
  const schema = statSchema(sport);
  const lbl = (k: string) => statLabel(k, 2, sport);
  // prose names a stat by its full label ("minutes played", not "mins")
  const long = (k: string) => { const d = schema && statDefIn(schema, k); return d ? d.label.toLowerCase() : lbl(k); };
  const keysText = (keys: string | string[]) => {
    const ks = Array.isArray(keys) ? keys : [keys];
    return ks.map((k, i) => (k.startsWith('-') ? `− ${long(k.slice(1))}` : `${i ? '+ ' : ''}${long(k)}`)).join(' ');
  };
  const a = def.agg ?? { kind: 'sum' as const };
  const plain = isPlainTotal(def) && !r.tieBreak.length && !r.keepers;
  // Unchanged from parity #21 where it was already right: a plain total.
  if (plain) return `Total ${lbl(def.key)} in this tournament's matches. Ties go by name. You choose the winner.`;
  let what: string;
  switch (a.kind) {
    case 'sum':
      what = a.keys && !a.scale ? `${def.label}: ${keysText(a.keys)}, over this tournament's matches`
        : a.keys ? `${def.label} over this tournament's matches`
        : `Most ${long(a.key ?? def.key)} in this tournament's matches`;
      break;
    case 'perGame': what = `${def.label}: total ${keysText(a.key)}, divided by games played`; break;
    case 'perSet': what = `${def.label}: total ${long(a.key)}, divided by the sets the player was on court for`; break;
    case 'rate': {
      const n = Array.isArray(a.num) ? null : statDefIn(schema!, a.num);
      const d = Array.isArray(a.den) ? null : statDefIn(schema!, a.den);
      what = n && d ? `${def.label}: ${long(n.key)} ÷ ${long(d.key)}${a.scale === 100 ? ' (as a %)' : a.scale ? ` × ${a.scale}` : ''}` : `${def.label} over this tournament's matches`;
      break;
    }
    case 'result':
      what = a.of ? `${def.label}: matches won ÷ matches with a result` : 'Most matches won in this tournament';
      break;
    case 'countIf': what = `Most ${long(def.key)} in this tournament's matches`; break;
    case 'max': what = `${def.label}, the best single match`; break;
    default: what = `${def.leaderLabel ?? def.label} in this tournament's matches`;
  }
  const ties = r.tieBreak.map((t) => {
    const td = schema && statDefIn(schema, t.key);
    if (!td) return t.key;
    const pct = td.format?.unit === 'percent' || ['rate', 'perGame', 'perSet'].includes(td.agg?.kind ?? '') || (td.agg?.kind === 'result' && !!td.agg.of);
    if (pct) return `the ${t.better === 'higher' ? 'higher' : 'lower'} ${td.label.toLowerCase()}`;
    return `${t.better === 'higher' ? 'more' : 'fewer'} ${long(t.key)}`;
  });
  return [
    r.keepers ? 'Goalkeepers only (anyone who kept goal in these matches, or is listed as a GK).' : '',
    `${what}.`,
    min ? `Players need at least ${min} to rank.` : '',
    `Ties: ${[...ties, 'by name'].join(', then ')}.`,
    'You choose the winner.',
  ].filter(Boolean).join(' ');
}

export interface AwardCandidate {
  playerId: string;
  name: string;
  teamName?: string;
  teamColor?: string;
  value: number;
  /** SD-27 — the figure as shown when it isn't a plain count ("18.5", "80%") */
  display?: string;
  /** matches with a stat line in this sport */
  games: number;
  detail: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const dashless = (parts: (string | false | undefined)[]) => parts.filter((p): p is string => !!p && !p.includes('–'));

/** Ranked players for one award slot, from this tournament's stat lines.
 *  'mvp' sums the sport's STAT_WEIGHTS over each player's lines — or, where the
 *  schema names an MVP stat (SD-27: racket matches won, chess score,
 *  basketball EFF per game), ranks by it. A stat slot ranks by its stat (or
 *  `rankBy`) through the aggregate engine: minimums, eligibility (Golden Glove:
 *  keepers), the award's tie-break chain, then name. Pass `matchIds` to
 *  restrict to a tournament's matches. */
export function rankAwardCandidates(
  lines: StatLine[], players: Player[], sport: SportId, slot: string, limit = 10,
  opts: AwardRankOptions = {},
): AwardCandidate[] {
  const ids = opts.matchIds ? new Set(opts.matchIds) : null;
  const mine = withLineResults(lines.filter((l) => l.sport === sport && (!ids || ids.has(l.matchId))), opts.matches);
  const byId = new Map(players.map((p) => [p.id, p] as const));
  const linesOf = new Map<string, StatLine[]>();
  for (const l of mine) (linesOf.get(l.playerId) ?? linesOf.set(l.playerId, []).get(l.playerId)!).push(l);
  const sum = (ls: StatLine[], k: string) => ls.reduce((a, l) => a + (Number(l.stats?.[k]) || 0), 0);
  const nameOf = (id: string) => byId.get(id)?.fullName ?? 'Player';
  const candidate = (playerId: string, value: number, games: number, detail: string, display?: string): AwardCandidate => {
    const p = byId.get(playerId);
    return {
      playerId, name: nameOf(playerId), teamName: p?.houseName, teamColor: p?.houseColor,
      value, ...(display !== undefined ? { display } : {}), games, detail,
    };
  };

  const rank = slotRank(sport, slot);
  if (!rank) {
    // the weighted Player of the Tournament (parity #21)
    const w = STAT_WEIGHTS[sport] ?? {};
    return [...linesOf.entries()]
      .map(([pid, ls]) => {
        const value = round1(ls.reduce((a, l) => a + Object.entries(l.stats ?? {}).reduce((s2, [k, v]) => s2 + (Number(v) || 0) * (w[k] ?? 0), 0), 0));
        const top = Object.keys(w)
          .map((k) => [k, sum(ls, k)] as const)
          .filter(([k, v]) => v > 0 && (w[k] ?? 0) > 0 && STAT_LABELS[k])
          .sort((a, b) => b[1] * (w[b[0]] ?? 0) - a[1] * (w[a[0]] ?? 0))
          .slice(0, 3)
          .map(([k, v]) => `${v} ${statLabel(k, v)}`);
        return { pid, value, games: ls.length, detail: [`${ls.length} m`, ...top].join(' · ') };
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value || nameOf(a.pid).localeCompare(nameOf(b.pid)))
      .slice(0, limit)
      .map((r) => candidate(r.pid, r.value, r.games, r.detail));
  }

  const schema = statSchema(sport)!;
  const { def } = rank;
  // Keepers: listed as a GK, or kept goal in one of these matches (a keeper
  // line carries goalsConceded). Older clean sheets credited to defenders
  // don't qualify (SD-09).
  const keepers = rank.keepers
    ? new Set([...linesOf.entries()]
        .filter(([pid, ls]) => isGoalkeeper(byId.get(pid)?.sportDetails?.football?.position) || ls.some((l) => l.stats && 'goalsConceded' in l.stats))
        .map(([pid]) => pid))
    : null;
  const ranked = rankPlayers(schema, def, mine, {
    qualifier: slotQualifier(sport, def, opts.mins),
    tieBreak: rank.tieBreak,
    eligible: keepers ? (id) => keepers.has(id) : undefined,
    finalTie: (a, b) => nameOf(a).localeCompare(nameOf(b)),
    limit,
  });
  const plain = isPlainTotal(def) && def.key === slot;
  const glove = rank.keepers && slot === 'cleanSheets';
  const career = (ls: StatLine[]) => {
    const c = cricketCareer(ls);
    const v = (sec: 'batting' | 'bowling', k: string) => c[sec].find((x) => x.key === k)?.value ?? '–';
    return { inns: v('batting', 'innings'), avg: v('batting', 'avg'), sr: v('batting', 'sr'), econ: v('bowling', 'econ'), bowlAvg: v('bowling', 'bowlAvg') };
  };
  return ranked.map((r) => {
    const ls = linesOf.get(r.playerId) ?? [];
    const games = ls.length;
    const m = `${games} m`;
    let detail: string;
    if (sport === 'cricket' && slot === 'runs') {
      const c = career(ls);
      detail = dashless([`${r.value} ${statLabel('runs', r.value)}`, `${c.inns} inns`, `avg ${c.avg}`, `SR ${c.sr}`]).join(' · ');
    } else if (sport === 'cricket' && slot === 'wickets') {
      const c = career(ls);
      detail = dashless([`${r.value} ${statLabel('wickets', r.value)}`, m, `econ ${c.econ}`, `avg ${c.bowlAvg}`]).join(' · ');
    } else if (glove) {
      const sv = sum(ls, 'saves');
      const tracked = ls.some((l) => l.stats && 'goalsConceded' in l.stats);
      detail = [`${r.value} ${statLabel('cleanSheets', r.value)}`, sv ? `${sv} ${statLabel('saves', sv)}` : '', tracked ? `${sum(ls, 'goalsConceded')} conceded` : '', m].filter(Boolean).join(' · ');
    } else if (plain) {
      detail = `${r.value} ${statLabel(slot, r.value)} · ${m}`;
    } else {
      // the figure, then the first tie-break figures, then games
      const extra = rank.tieBreak.slice(0, 2).flatMap((t) => {
        const td = statDefIn(schema, t.key);
        const v = td ? aggregateValue(schema, td, ls) : undefined;
        return td && v?.value !== undefined && v.tracked ? [statPhrase(sport, td, v.value, v.text)] : [];
      });
      detail = [statPhrase(sport, def, r.value, r.text), ...extra, m].join(' · ');
    }
    const shown = isPlainTotal(def) || def.agg?.kind === 'countIf' || (def.agg?.kind === 'result' && !def.agg.of) ? undefined : r.text;
    return candidate(r.playerId, Math.round(r.value * 100) / 100, games, detail, shown);
  });
}

/** Stable id for a fixed slot's award. */
export const awardId = (sport: SportId, slot: string) => `${sport}:${slot}`;

/** An award from a candidate (fills the label/sport/slot). */
export function awardFrom(sport: SportId, slot: string, label: string, c: AwardCandidate, id = awardId(sport, slot)): TournamentAward {
  return { id, slot, label, sport, playerId: c.playerId, playerName: c.name, teamName: c.teamName, value: c.value, detail: c.detail };
}

/** The suggested awards: the #1 candidate in each of the sport's slots (slots
 *  with no candidate are left out). */
export function defaultAwards(
  lines: StatLine[], players: Player[], sport: SportId, opts: AwardRankOptions = {},
): TournamentAward[] {
  return (TOURNAMENT_AWARD_SLOTS[sport] ?? []).flatMap((s) => {
    const top = rankAwardCandidates(lines, players, sport, s.slot, 1, opts)[0];
    return top ? [awardFrom(sport, s.slot, s.label, top)] : [];
  });
}

/* ------------------------ Player of the Match precedence ------------------------ */

export interface PotmProp {
  id: string;
  name: string;
  /** changed by officials (an override with `by`) */
  changed: boolean;
}
export interface ResolvedPotm {
  id?: string;
  name: string;
  source: 'stored' | 'legacy' | 'mvp';
  changed: boolean;
}

/** REVIEW Decision 10 — the stored matches.potm override, then the legacy
 *  cricket `s.potm` (a name, resolved to an id by the caller where possible),
 *  then the computed MVP. A #05/#06 correction that changes the MVP never
 *  replaces a stored override. */
export function resolvePotm(
  stored: PotmProp | undefined | null,
  legacy: { id?: string; name: string } | string | undefined | null,
  mvp: { id: string; name: string } | undefined | null,
): ResolvedPotm | undefined {
  if (stored && stored.name) return { id: stored.id, name: stored.name, source: 'stored', changed: !!stored.changed };
  const lg = typeof legacy === 'string' ? { name: legacy } : legacy;
  if (lg && lg.name) return { id: lg.id, name: lg.name, source: 'legacy', changed: false };
  if (mvp) return { id: mvp.id, name: mvp.name, source: 'mvp', changed: false };
  return undefined;
}

/**
 * SD-48 (GEN-17) — team ties: ONE team-v-team fixture made of N rubbers
 * (individual matches). Table tennis Swaythling / Corbillon / Olympic (ITTF),
 * badminton Thomas / Uber / Sudirman (BWF), tennis Davis Cup / BJK Cup (ITF),
 * team squash, chess board matches (½-point rubbers, match vs game points),
 * carrom / padel / pickleball team ties, or a custom list.
 *
 * Storage — no migration. A tie is the existing `rubbers` series (series.ts):
 * every rubber is a normal `matches` row between the two teams that shares a
 * `__seriesId`, and the tie's rules ride on each rubber's `format` jsonb:
 *   __tie          JSON TieSpec (same on every rubber)
 *   __seriesSlot   the rubber's label ("A v X", "Doubles", "Board 1")
 *   __tieKind      S | D | XD
 *   __tieHalf      true → a drawn rubber is ½–½ (chess)
 *   __tieDead      true → not played: the tie was decided first ("stop at the
 *                  majority"; the rubber is set to `cancelled`)
 *   __tieLineupH / __tieLineupA   JSON TieLineup of each team (home = team A)
 * The rubber's players are its normal matchday squad (`match_squads`): 1 for a
 * singles rubber, 2 for doubles, so it scores, credits and lands in careers
 * exactly like any singles / doubles match. Team A is always the home side.
 *
 * PURE — no React / Supabase, so node tests load it directly.
 */
import type { Match, SportFormat, SportId } from '../core/types';
import { SERIES_KEYS, seriesLegFormat, readSeriesMeta, deriveSeries, resolveSeries, type Series } from './series.ts';
import { isEliminationStage } from './bracket.ts';

/* --------------------------------- spec ---------------------------------- */

/** Singles, doubles, mixed doubles. */
export type RubberKind = 'S' | 'D' | 'XD';

/** One rubber of the tie. `p` = the position(s) the ABC (first-drawn) team
 *  plays in it, `q` = the XYZ team's. Empty = the players are nominated for
 *  this rubber when the lineup is entered (Thomas Cup "1st doubles"). */
export interface RubberSpec {
  k: RubberKind;
  p: string[];
  q: string[];
  /** a label instead of the generated one ("MS", "1st singles") */
  l?: string;
}

/** What happens once the tie is decided: the remaining rubbers are not played
 *  (ITTF / BWF knockouts), or played as dead rubbers (counted, BWF group play). */
export type DeadRubbers = 'stop' | 'play';

export interface TieSpec {
  v: 1;
  /** the preset id, or 'custom' */
  preset: string;
  rubbers: RubberSpec[];
  dead: DeadRubbers;
  /** SD-127 — pick `dead` from the stage when the tie is created: group /
   *  league ties play every rubber (they count for the rubbers / games / points
   *  tie-breaks — BWF, Davis Cup Finals groups), knockout ties stop at the
   *  majority. `dead` is the stage-less fallback. Set by the presets for new
   *  ties; an organiser's explicit Stop / Play clears it. Absent (every tie and
   *  tournament saved before SD-127) = `dead` as stored, unchanged. */
  deadByStage?: boolean;
  /** a drawn rubber counts ½ to each side (chess) */
  half: boolean;
  /** the side that plays the ABC letters (ITTF: decided by a draw before the
   *  match); the other side plays XYZ. Home = team A. */
  abc: 'home' | 'away';
  /** the positions each team names in its lineup: `p` for the ABC team, `q`
   *  for the XYZ team (A,B,C / X,Y,Z; 1,2 for Davis Cup; boards 1–4) */
  pos?: { p: string[]; q: string[] };
  /** chess: the positions are boards (colours alternate; order by rating) */
  boards?: boolean;
  /** minutes between rubber start times (0 = all at once, chess boards) */
  gap?: number;
  /** SD-121 — chess knockout: how a level team match is decided after board
   *  points (src/sports/chess/teamKo.ts). Absent = board count, as before. */
  koBreak?: 'board-count' | 'lowest-board';
}

export interface TiePreset {
  id: string;
  sport: SportId;
  label: string;
  /** one line on what it is + the source */
  note: string;
  spec: Omit<TieSpec, 'v' | 'preset' | 'abc'>;
}

const S = (p: string, q: string, l?: string): RubberSpec => ({ k: 'S', p: [p], q: [q], ...(l ? { l } : {}) });
const N = (k: RubberKind, l: string): RubberSpec => ({ k, p: [], q: [], l });
const ABC = { p: ['A', 'B', 'C'], q: ['X', 'Y', 'Z'] };
const boardsOf = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));

/** The federation presets per sport (first = default). Sources in the guide
 *  and the SD-48 report; formats people actually run, not invented ones. */
export const TIE_PRESETS: TiePreset[] = [
  // ITTF Handbook — team match systems (5-match Swaythling, Corbillon, Olympic).
  { id: 'tt-swaythling', sport: 'tabletennis', label: 'World Team Champs · 5 singles (ABC v XYZ)',
    note: 'A–X, B–Y, C–Z, A–Y, B–X; stops at 3 wins (ITTF team system)',
    spec: { rubbers: [S('A', 'X'), S('B', 'Y'), S('C', 'Z'), S('A', 'Y'), S('B', 'X')], dead: 'stop', half: false, pos: ABC, gap: 40 } },
  { id: 'tt-corbillon', sport: 'tabletennis', label: 'Corbillon · 4 singles + doubles',
    note: 'A–X, B–Y, doubles, A–Y, B–X; stops at 3 wins',
    spec: { rubbers: [S('A', 'X'), S('B', 'Y'), N('D', 'Doubles'), S('A', 'Y'), S('B', 'X')], dead: 'stop', half: false, pos: { p: ['A', 'B'], q: ['X', 'Y'] }, gap: 40 } },
  { id: 'tt-olympic', sport: 'tabletennis', label: 'Olympic · doubles + 4 singles',
    note: 'B/C–Y/Z doubles, A–X, C–Z, A–Y, B–X; stops at 3 wins',
    spec: { rubbers: [{ k: 'D', p: ['B', 'C'], q: ['Y', 'Z'] }, S('A', 'X'), S('C', 'Z'), S('A', 'Y'), S('B', 'X')], dead: 'stop', half: false, pos: ABC, gap: 40 } },
  // BWF Thomas & Uber Cup (3 singles + 2 doubles) and Sudirman Cup (5 events).
  { id: 'bd-thomas', sport: 'badminton', label: 'Thomas / Uber Cup · 3 singles + 2 doubles',
    note: '1st singles, 1st doubles, 2nd singles, 2nd doubles, 3rd singles',
    spec: { rubbers: [N('S', '1st singles'), N('D', '1st doubles'), N('S', '2nd singles'), N('D', '2nd doubles'), N('S', '3rd singles')], dead: 'stop', half: false, gap: 45 } },
  { id: 'bd-sudirman', sport: 'badminton', label: 'Sudirman Cup · 5 events (mixed team)',
    note: 'Mixed doubles, men’s singles, women’s singles, men’s doubles, women’s doubles',
    spec: { rubbers: [N('XD', 'Mixed doubles'), N('S', 'Men’s singles'), N('S', 'Women’s singles'), N('D', 'Men’s doubles'), N('D', 'Women’s doubles')], dead: 'stop', half: false, gap: 45 } },
  // ITF Davis Cup / Billie Jean King Cup.
  { id: 'tn-davis5', sport: 'tennis', label: 'Davis Cup tie · 4 singles + doubles',
    note: 'No.1 v No.2, No.2 v No.1, doubles, then the reverse singles No.1 v No.1, No.2 v No.2',
    spec: { rubbers: [S('1', '2'), S('2', '1'), N('D', 'Doubles'), S('1', '1', 'Reverse singles'), S('2', '2', 'Reverse singles')], dead: 'stop', half: false, pos: { p: ['1', '2'], q: ['1', '2'] }, gap: 150 } },
  { id: 'tn-finals', sport: 'tennis', label: 'Davis Cup / BJK Cup Finals · 2 singles + doubles',
    note: 'No.2 singles, No.1 singles, doubles; best of 3 rubbers',
    spec: { rubbers: [S('2', '2', 'No.2 singles'), S('1', '1', 'No.1 singles'), N('D', 'Doubles')], dead: 'stop', half: false, pos: { p: ['1', '2'], q: ['1', '2'] }, gap: 150 } },
  // Team squash: three strings in order of merit.
  { id: 'sq-teams', sport: 'squash', label: 'Team squash · 3 rubbers (order of merit)',
    note: 'No.1 v No.1, No.2 v No.2, No.3 v No.3; best of 3 rubbers',
    spec: { rubbers: [S('1', '1'), S('2', '2'), S('3', '3')], dead: 'stop', half: false, pos: { p: ['1', '2', '3'], q: ['1', '2', '3'] }, gap: 60 } },
  // FIDE team match (Olympiad style): boards, ½ points, colours alternate.
  { id: 'ch-4boards', sport: 'chess', label: 'Team match · 4 boards',
    note: 'All boards at once; win 1, draw ½; first-named team White on boards 1 and 3',
    spec: { rubbers: boardsOf(4).map((b) => S(b, b, `Board ${b}`)), dead: 'play', half: true, pos: { p: boardsOf(4), q: boardsOf(4) }, boards: true, gap: 0 } },
  { id: 'ch-6boards', sport: 'chess', label: 'Team match · 6 boards',
    note: 'All boards at once; win 1, draw ½; colours alternate by board',
    spec: { rubbers: boardsOf(6).map((b) => S(b, b, `Board ${b}`)), dead: 'play', half: true, pos: { p: boardsOf(6), q: boardsOf(6) }, boards: true, gap: 0 } },
  // Carrom / padel / pickleball: common club and school team formats.
  { id: 'cr-team', sport: 'carrom', label: 'Team tie · 2 singles + doubles',
    note: 'Singles, singles, doubles; best of 3 rubbers (check your event’s rules)',
    spec: { rubbers: [N('S', '1st singles'), N('S', '2nd singles'), N('D', 'Doubles')], dead: 'stop', half: false, gap: 45 } },
  { id: 'pd-team', sport: 'padel', label: 'Team tie · 3 doubles',
    note: 'Three pairs; best of 3 rubbers',
    spec: { rubbers: [N('D', '1st pair'), N('D', '2nd pair'), N('D', '3rd pair')], dead: 'stop', half: false, gap: 90 } },
  { id: 'pb-team', sport: 'pickleball', label: 'Team tie · 2 doubles + mixed',
    note: 'Doubles, doubles, mixed doubles; best of 3 rubbers',
    spec: { rubbers: [N('D', '1st doubles'), N('D', '2nd doubles'), N('XD', 'Mixed doubles')], dead: 'stop', half: false, gap: 45 } },
];

/** Sports that can run team ties. */
export const TIE_SPORTS = new Set<SportId>(['tabletennis', 'badminton', 'tennis', 'squash', 'chess', 'carrom', 'padel', 'pickleball']);
export const tiePresetsFor = (sport: SportId): TiePreset[] => TIE_PRESETS.filter((p) => p.sport === sport);

/** A spec from a preset (the ABC side is home until the draw says otherwise). */
export function specFromPreset(p: TiePreset, abc: 'home' | 'away' = 'home'): TieSpec {
  const spec: TieSpec = { v: 1, preset: p.id, abc, ...JSON.parse(JSON.stringify(p.spec)) };
  // SD-127: dead rubbers follow the stage (chess boards are always all played)
  return spec.boards ? spec : { ...spec, deadByStage: true };
}

/** SD-127 — the organiser's dead-rubber choice: by stage (the default), or an
 *  explicit Stop / Play for every tie. */
export type DeadRule = 'stage' | DeadRubbers;
export const deadRuleOf = (spec: TieSpec): DeadRule => (spec.deadByStage ? 'stage' : spec.dead);
export function withDeadRule(spec: TieSpec, rule: DeadRule): TieSpec {
  const { deadByStage: _drop, ...rest } = spec;
  return rule === 'stage' ? { ...rest, deadByStage: true } : { ...rest, dead: rule };
}

/** Is a tie at this stage a knockout one (stop at the majority)? Elimination
 *  stages are; group, Super Four, Swiss and league fixtures aren't. A tie with
 *  no stage and no tournament is a one-off contest — knockout style. */
export function isKnockoutTie(ctx: { stage?: string | null; tournamentId?: string | null }): boolean {
  if (isEliminationStage(ctx.stage)) return true;
  return !ctx.stage && !ctx.tournamentId;
}

/** The spec a NEW tie is created with: a "by stage" spec gets its concrete
 *  `dead` (group → play, knockout → stop). Explicit specs pass through. */
export function specForStage(spec: TieSpec, ctx: { stage?: string | null; tournamentId?: string | null }): TieSpec {
  if (!spec.deadByStage || spec.boards) return spec;
  const { deadByStage: _drop, ...rest } = spec;
  return { ...rest, dead: isKnockoutTie(ctx) ? 'stop' : 'play' };
}

/** A custom tie: nominated rubbers (no positions), as the organiser listed them. */
export function customSpec(sport: SportId, kinds: RubberKind[], dead: DeadRule = 'stage'): TieSpec {
  const chess = sport === 'chess';
  if (chess) {
    const b = boardsOf(kinds.length);
    return { v: 1, preset: 'custom', rubbers: b.map((x) => S(x, x, `Board ${x}`)), dead: 'play', half: true, abc: 'home', pos: { p: b, q: b }, boards: true, gap: 0 };
  }
  let s = 0, d = 0, x = 0;
  const ord = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
  const rubbers = kinds.map((k) => N(k, k === 'S' ? `${ord(++s)} singles` : k === 'D' ? `${ord(++d)} doubles` : `${ord(++x)} mixed`));
  const base: TieSpec = { v: 1, preset: 'custom', rubbers, dead: 'stop', half: false, abc: 'home', gap: 45 };
  return withDeadRule(base, dead);
}

/* ------------------------------ format keys ------------------------------ */

export const TIE_KEYS = {
  spec: '__tie',
  slot: '__seriesSlot',
  kind: '__tieKind',
  half: '__tieHalf',
  dead: '__tieDead',
  lineupH: '__tieLineupH',
  lineupA: '__tieLineupA',
} as const;

/** The positions the side plays in the spec (A,B,C or X,Y,Z…). */
export function sideLetters(spec: TieSpec, side: 'home' | 'away'): string[] {
  if (!spec.pos) return [];
  return side === spec.abc ? spec.pos.p : spec.pos.q;
}

/** A rubber's positions for each side. */
export function rubberPositions(spec: TieSpec, i: number): { home: string[]; away: string[] } {
  const r = spec.rubbers[i];
  if (!r) return { home: [], away: [] };
  return spec.abc === 'home' ? { home: r.p, away: r.q } : { home: r.q, away: r.p };
}

/** "A v X", "B/C v Y/Z", "Board 2", "Doubles" — the rubber's label. */
export function rubberLabel(spec: TieSpec, i: number): string {
  const r = spec.rubbers[i];
  if (!r) return `Rubber ${i + 1}`;
  if (spec.boards) return r.l ?? `Board ${i + 1}`;
  if (r.p.length && r.q.length) {
    const { home, away } = rubberPositions(spec, i);
    const numeric = /^\d+$/.test(home[0] ?? '');
    const pos = numeric ? `No.${home.join('/')} v No.${away.join('/')}` : `${home.join('/')} v ${away.join('/')}`;
    return r.l ? `${r.l} · ${pos}` : pos;
  }
  return r.l ?? (r.k === 'S' ? 'Singles' : r.k === 'D' ? 'Doubles' : 'Mixed doubles');
}

/** Players a side fields in a rubber. */
export const rubberSize = (k: RubberKind): number => (k === 'S' ? 1 : 2);

/** The rubber format keys (merge with the sport's match format). Chess boards
 *  alternate colours: the home team has White on odd boards (FIDE Olympiad
 *  practice: the first-named team White on boards 1 and 3). */
export function rubberFormat(spec: TieSpec, i: number, cfg: { seriesId: string; teamAId: string; name?: string }): SportFormat {
  const r = spec.rubbers[i];
  const f: SportFormat = {
    ...seriesLegFormat({ id: cfg.seriesId, format: 'rubbers', legs: spec.rubbers.length, leg: i + 1, teamAId: cfg.teamAId, name: cfg.name }),
    [TIE_KEYS.spec]: JSON.stringify(spec),
    [TIE_KEYS.slot]: rubberLabel(spec, i),
    [TIE_KEYS.kind]: r.k,
    playersPerSide: rubberSize(r.k),
  };
  if (spec.half) f[TIE_KEYS.half] = true;
  if (r.k === 'XD') f.category = 'mixed';
  if (spec.boards) f.white = i % 2 === 0 ? 'home' : 'away';
  return f;
}

/** The tie spec a rubber carries, or null (not a tie rubber / bad JSON). */
export function tieSpecFromFormat(f?: Record<string, unknown> | null): TieSpec | null {
  const raw = f?.[TIE_KEYS.spec];
  if (typeof raw !== 'string') return null;
  try {
    const s = JSON.parse(raw) as TieSpec;
    if (!s || s.v !== 1 || !Array.isArray(s.rubbers)) return null;
    const { deadByStage, ...rest } = s;
    return { ...rest, abc: s.abc === 'away' ? 'away' : 'home', dead: s.dead === 'play' ? 'play' : 'stop', half: !!s.half, ...(deadByStage === true ? { deadByStage: true } : {}) };
  } catch {
    return null;
  }
}
export const tieSpecOf = (m: Pick<Match, 'format'>): TieSpec | null => tieSpecFromFormat(m.format as Record<string, unknown> | undefined);
/** Is this match a rubber of an SD-48 team tie? */
export const isTieRubber = (m: Pick<Match, 'format'>): boolean => tieSpecOf(m) !== null;
/** Was this rubber left unplayed because the tie was already decided? */
export const isDeadUnplayed = (m: Match): boolean => m.status === 'cancelled' && (m.format as Record<string, unknown> | undefined)?.[TIE_KEYS.dead] === true;

/* -------------------------------- lineups -------------------------------- */

/** A team's lineup: who plays each position, and the players nominated for
 *  the rubbers without positions (key = rubber index). */
export interface TieLineup {
  pos: Record<string, string>;
  pairs: Record<string, string[]>;
  at?: string;
}

export function parseLineup(raw: unknown): TieLineup | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const l = JSON.parse(raw) as TieLineup;
    if (!l || typeof l !== 'object') return null;
    return { pos: l.pos && typeof l.pos === 'object' ? l.pos : {}, pairs: l.pairs && typeof l.pairs === 'object' ? l.pairs : {}, ...(l.at ? { at: l.at } : {}) };
  } catch {
    return null;
  }
}
export const lineupKey = (side: 'home' | 'away') => (side === 'home' ? TIE_KEYS.lineupH : TIE_KEYS.lineupA);
/** The lineup a side has submitted (read off any rubber), or null. */
export function lineupOf(rubbers: Match[], side: 'home' | 'away'): TieLineup | null {
  for (const m of rubbers) {
    const l = parseLineup((m.format as Record<string, unknown> | undefined)?.[lineupKey(side)]);
    if (l) return l;
  }
  return null;
}

/** The players a side fields in rubber `i` (undefined when the lineup doesn't
 *  name them yet). */
export function rubberPlayers(spec: TieSpec, i: number, side: 'home' | 'away', lineup: TieLineup | null): string[] | undefined {
  const r = spec.rubbers[i];
  if (!r || !lineup) return undefined;
  const pos = rubberPositions(spec, i)[side];
  const ids = pos.length ? pos.map((p) => lineup.pos[p]) : lineup.pairs[String(i)] ?? [];
  const want = rubberSize(r.k);
  const clean = ids.filter((x): x is string => typeof x === 'string' && !!x);
  return clean.length === want && new Set(clean).size === want ? clean : undefined;
}

/** What still blocks or looks wrong in a lineup. `errors` block saving it;
 *  `warnings` are shown but allowed (the referee decides). */
export function lineupProblems(spec: TieSpec, side: 'home' | 'away', lineup: TieLineup): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const letters = sideLetters(spec, side);
  const named = letters.map((l) => lineup.pos[l]).filter(Boolean);
  for (const l of letters) if (!lineup.pos[l]) errors.push(`${spec.boards ? `Board ${l}` : /^\d+$/.test(l) ? `No.${l}` : l}: pick a player`);
  if (new Set(named).size !== named.length) errors.push(spec.boards ? 'A player can sit on one board only' : 'Each position needs a different player');
  spec.rubbers.forEach((r, i) => {
    if (r.p.length) return;
    const ids = (lineup.pairs[String(i)] ?? []).filter(Boolean);
    const want = rubberSize(r.k);
    const label = rubberLabel(spec, i);
    if (ids.length < want) errors.push(`${label}: pick ${want === 1 ? 'a player' : 'two players'}`);
    else if (new Set(ids).size !== ids.length) errors.push(`${label}: pick two different players`);
  });
  // Singles played more than once (Thomas / Uber Cup: a player plays one
  // singles; ABC letters already keep their own counts).
  const singlesBy = new Map<string, number>();
  spec.rubbers.forEach((r, i) => {
    if (r.k !== 'S' || r.p.length) return;
    for (const id of lineup.pairs[String(i)] ?? []) singlesBy.set(id, (singlesBy.get(id) ?? 0) + 1);
  });
  if ([...singlesBy.values()].some((n) => n > 1)) warnings.push('Someone plays two singles — most team events allow one');
  return { errors, warnings };
}

/** Chess: sort the named players onto boards by rating (highest on board 1,
 *  unrated last) — the usual board-order rule for team events. */
export function boardsByRating(spec: TieSpec, side: 'home' | 'away', ids: string[], ratingOf: (id: string) => number | undefined): Record<string, string> {
  const sorted = [...ids].sort((a, b) => (ratingOf(b) ?? -1) - (ratingOf(a) ?? -1));
  const out: Record<string, string> = {};
  sideLetters(spec, side).forEach((l, i) => { if (sorted[i]) out[l] = sorted[i]; });
  return out;
}

/* ------------------------------- the result ------------------------------ */

/** "2½" for 2.5 — chess half points. */
export const fmtPts = (n: number): string => {
  const whole = Math.floor(n);
  const half = Math.abs(n - whole - 0.5) < 1e-9;
  return half ? (whole === 0 ? '½' : `${whole}½`) : String(n);
};

export type RubberState = 'scheduled' | 'live' | 'won' | 'drawn' | 'unplayed' | 'dead' | 'cancelled';

export interface TieStanding {
  /** team A (home) and team B points: rubbers won, ½ each for a chess draw */
  ptsA: number;
  ptsB: number;
  /** points needed to win: more than half of all rubbers */
  needed: number;
  decided: boolean;
  drawn: boolean;
  winnerId?: string;
  status: 'scheduled' | 'live' | 'decided';
  /** per rubber: what it shows on the tie page */
  rubbers: { m: Match; state: RubberState; dead: boolean }[];
  /** "Riverside lead 2–1 · first to 3" */
  summary: string;
}

/** A tie's running score, winner and each rubber's state. Pure over the rubbers'
 *  results (the series standing, with the tie's ½ points and dead rubbers). */
export function resolveTie(s: Series): TieStanding {
  const st = resolveSeries(s);
  const n = s.legsPlanned || s.legs.length || 1;
  const half = s.legs.some((m) => (m.format as Record<string, unknown> | undefined)?.[TIE_KEYS.half] === true);
  // more than half of all the rubbers: 3 of 5, 2½ of 4 boards (3 of 4 without ½s)
  const needed = half ? n / 2 + 0.5 : Math.floor(n / 2) + 1;
  // Walk the rubbers in order to know which came after the decision (dead).
  const decidedAt = majorityIndex(s);
  const rubbers = s.legs.map((m, i) => {
    const dead = decidedAt >= 0 && i > decidedAt;
    const state: RubberState = isDeadUnplayed(m) ? 'unplayed'
      : m.status === 'cancelled' ? 'cancelled'
      : m.status === 'live' ? 'live'
      : m.status === 'completed' ? (m.winner === 'draw' ? 'drawn' : m.winner ? 'won' : 'cancelled')
      : dead ? 'dead' : 'scheduled';
    return { m, state, dead };
  });
  const nameA = s.teamA?.shortName || s.teamA?.name || 'Team A';
  const nameB = s.teamB?.shortName || s.teamB?.name || 'Team B';
  const score = (x: number, y: number) => `${fmtPts(Math.max(x, y))}–${fmtPts(Math.min(x, y))}`;
  let summary: string;
  if (st.winnerId) summary = `${st.winnerId === s.teamAId ? nameA : nameB} win ${score(st.winsA, st.winsB)}`;
  else if (st.drawn) summary = `Tie drawn ${fmtPts(st.winsA)}–${fmtPts(st.winsB)}`;
  else if (st.winsA === st.winsB) summary = st.winsA === 0 ? `First to ${fmtPts(needed)}` : `Level ${fmtPts(st.winsA)}–${fmtPts(st.winsB)} · first to ${fmtPts(needed)}`;
  else summary = `${st.winsA > st.winsB ? nameA : nameB} lead ${score(st.winsA, st.winsB)} · first to ${fmtPts(needed)}`;
  return { ptsA: st.winsA, ptsB: st.winsB, needed, decided: st.decided, drawn: st.drawn, winnerId: st.winnerId, status: st.status, rubbers, summary };
}

const isNoResult = (m: Match) => m.result?.kind === 'no_result' || m.result?.kind === 'abandoned';
/** chess 0-0 double forfeit: recorded as a draw, worth nothing to either side */
const isDoubleForfeit = (m: Match) => (m.state as { method?: unknown } | null | undefined)?.method === 'double-forfeit';

/** SD-127 — a rubber's points to team A and team B: 1 for a win, ½ each for
 *  a drawn ½-point (chess) rubber unless it ended without a game. Mirrored in
 *  SQL by settle_team_tie (supabase/migrations/*_team_tie_ops.sql). */
function rubberPoints(m: Match, teamAId: string): [number, number] {
  if (m.status !== 'completed') return [0, 0];
  if (m.winner === 'draw') {
    const halfLeg = (m.format as Record<string, unknown> | undefined)?.[TIE_KEYS.half] === true;
    return halfLeg && !isNoResult(m) && !isDoubleForfeit(m) ? [0.5, 0.5] : [0, 0];
  }
  if (m.winner !== 'home' && m.winner !== 'away') return [0, 0];
  const aHome = m.homeTeam?.id === teamAId;
  return (m.winner === 'home') === aHome ? [1, 0] : [0, 1];
}

/** The index (in rubber order) of the rubber that took a side past half of
 *  all the rubbers, or -1 while no side has a majority. Rubbers after it are
 *  dead. */
export function majorityIndex(s: Series): number {
  const n = s.legsPlanned || s.legs.length || 1;
  let a = 0, b = 0;
  for (let i = 0; i < s.legs.length; i++) {
    const [x, y] = rubberPoints(s.legs[i], s.teamAId);
    a += x; b += y;
    if (a > n / 2 || b > n / 2) return i;
  }
  return -1;
}

/** SD-127 — what settling the tie changes, by rubber id. `stop`: "stop at
 *  the majority" mode, a side has a majority, and rubbers after the deciding
 *  one are still to play (scheduled / postponed) → set aside (cancelled +
 *  `__tieDead`). `restore`: no side has a majority (a correction undid it) →
 *  rubbers set aside earlier come back. Applying the plan and planning again
 *  gives an empty plan (idempotent). Restoring keys on the majority, not on
 *  "decided": a 3–1 corrected to 2–2 with rubber 5 set aside must play rubber
 *  5, not stand as a 2–2 draw. The server (settle_team_tie) runs the same rule. */
export interface TieSettlePlan { stop: string[]; restore: string[] }
export function tieSettlePlan(s: Series, spec: TieSpec): TieSettlePlan {
  const at = majorityIndex(s);
  if (at < 0) return { stop: [], restore: s.legs.filter(isDeadUnplayed).map((m) => m.id) };
  if (spec.dead !== 'stop') return { stop: [], restore: [] };
  return { stop: s.legs.filter((m, i) => i > at && (m.status === 'scheduled' || m.status === 'postponed')).map((m) => m.id), restore: [] };
}

/** The rubbers to set aside once the tie is decided in "stop" mode: still to
 *  play (scheduled / postponed), after the decision. Empty otherwise. */
export function rubbersToStop(s: Series, spec: TieSpec): Match[] {
  const ids = new Set(tieSettlePlan(s, spec).stop);
  return s.legs.filter((m) => ids.has(m.id));
}

/** Rubbers set aside earlier that must come back (a correction undid the
 *  majority). */
export function rubbersToRestore(s: Series): Match[] {
  return majorityIndex(s) < 0 ? s.legs.filter(isDeadUnplayed) : [];
}

/** Apply a settle plan to a local copy of the rubbers (demo mode / tests). */
export function applySettlePlan(legs: Match[], plan: TieSettlePlan): Match[] {
  const stop = new Set(plan.stop), back = new Set(plan.restore);
  return legs.map((m) => (stop.has(m.id) ? { ...m, status: 'cancelled' as const, format: { ...(m.format ?? {}), [TIE_KEYS.dead]: true } }
    : back.has(m.id) ? { ...m, status: 'scheduled' as const, format: { ...(m.format ?? {}), [TIE_KEYS.dead]: false } } : m));
}

/* ------------------------- who may enter a lineup ------------------------ */

/** SD-127 — may this person save `side`'s lineup? Mirrors save_tie_lineup.
 *  A tie host (match host / tournament manager) enters either side until that
 *  side's rubbers start. A side's captain / vice-captain / team admin enters
 *  their own side — sealed: once BOTH lineups are in they are exchanged and
 *  only the host can change them (no changing yours after seeing theirs). */
export type LineupRefusal = 'not_allowed' | 'exchanged' | 'started';
export function lineupEntryRule(ctx: { isHost: boolean; managesSide: boolean; sideIn: boolean; otherIn: boolean; started: boolean }): { ok: true } | { ok: false; reason: LineupRefusal } {
  if (!ctx.isHost && !ctx.managesSide) return { ok: false, reason: 'not_allowed' };
  if (ctx.started && ctx.sideIn) return { ok: false, reason: 'started' };
  if (!ctx.isHost && ctx.sideIn && ctx.otherIn) return { ok: false, reason: 'exchanged' };
  return { ok: true };
}
export const LINEUP_REFUSAL_TEXT: Record<LineupRefusal, string> = {
  not_allowed: 'Only this team’s captain, vice-captain, a team admin or the tie host can enter this lineup.',
  exchanged: 'Both lineups are in — ask the tie host to make a change.',
  started: 'The tie has started — the lineup can’t change now.',
};

/** Did THIS rubber's result decide the tie? (decided now, not decided with
 *  this rubber taken back to unfinished) — the one moment to announce the tie. */
export function decidedBy(s: Series, rubberId: string): boolean {
  if (!resolveTie(s).decided) return false;
  const before: Series = { ...s, legs: s.legs.map((m) => (m.id === rubberId ? { ...m, status: 'live' as const, winner: undefined } : m)) };
  return !resolveTie(before).decided;
}

/** "🏆 Riverside beat Hilltop 3–1" — the one tie-result line. */
export function tieResultText(s: Series): string {
  const t = resolveTie(s);
  const A = s.teamA?.name ?? 'Team A';
  const B = s.teamB?.name ?? 'Team B';
  if (t.drawn) return `🤝 ${A} and ${B} draw ${fmtPts(t.ptsA)}–${fmtPts(t.ptsB)}`;
  if (!t.winnerId) return `${A} ${fmtPts(t.ptsA)}–${fmtPts(t.ptsB)} ${B}`;
  const aWon = t.winnerId === s.teamAId;
  return `🏆 ${aWon ? A : B} beat ${aWon ? B : A} ${fmtPts(Math.max(t.ptsA, t.ptsB))}–${fmtPts(Math.min(t.ptsA, t.ptsB))}`;
}

/* -------------------------- one fixture, not N --------------------------- */

/** A tie as ONE fixture between the two teams (standings, team records,
 *  fixture lists): score = rubbers won (½ for chess draws), completed once the
 *  tie is decided. `tieRubbers` keeps the rubbers for the games / points
 *  tie-breaks. Team A is home. */
export interface TieMatch extends Match {
  tieId: string;
  tieRubbers: Match[];
}
export const isTieMatch = (m: Match): m is TieMatch => Array.isArray((m as Partial<TieMatch>).tieRubbers);
export const tieMatchId = (seriesId: string) => `tie:${seriesId}`;

/** Is this match a rubber of a `rubbers` series (an SD-48 tie, or an older
 *  "team tie (rubbers)" series)? Those count as one fixture. */
const isRubbersLeg = (m: Match) => readSeriesMeta(m)?.format === 'rubbers';

/** The tie as one synthetic match. */
export function tieAsMatch(s: Series): TieMatch {
  const t = resolveTie(s);
  const first = s.legs[0];
  const anyStarted = s.legs.some((m) => m.status === 'live' || m.status === 'completed');
  const allOff = s.legs.every((m) => m.status === 'cancelled');
  const status: Match['status'] = t.decided ? 'completed' : allOff ? 'cancelled' : anyStarted ? 'live' : first.status === 'postponed' ? 'postponed' : 'scheduled';
  const A = s.teamA ?? first.homeTeam;
  const B = s.teamB ?? first.awayTeam;
  const started = anyStarted || t.decided;
  return {
    id: tieMatchId(s.id),
    tieId: s.id,
    tieRubbers: s.legs,
    tournamentId: first.tournamentId,
    group: first.group,
    stage: first.stage,
    sport: first.sport,
    status,
    startsAt: s.legs.reduce((min, m) => (m.startsAt < min ? m.startsAt : min), first.startsAt),
    venueName: first.venueName,
    homeTeam: A,
    awayTeam: B,
    ...(started ? { score: { home: t.ptsA, away: t.ptsB } } : {}),
    ...(t.decided ? { winner: t.drawn ? 'draw' as const : t.winnerId === A.id ? 'home' as const : 'away' as const } : {}),
    hostIds: first.hostIds,
    format: { [SERIES_KEYS.id]: s.id, ...(s.name ? { [SERIES_KEYS.name]: s.name } : {}) },
    state: null,
  };
}

/** Replace every tie's rubbers with ONE fixture (at the first rubber's place
 *  in the list). Other matches pass through untouched, so a list without ties
 *  comes back as the same array. */
export function collapseTies(matches: Match[]): Match[] {
  if (!matches.some(isRubbersLeg)) return matches;
  const series = new Map(deriveSeries(matches.filter(isRubbersLeg)).map((s) => [s.id, s]));
  const out: Match[] = [];
  const done = new Set<string>();
  for (const m of matches) {
    if (!isRubbersLeg(m)) { out.push(m); continue; }
    const id = readSeriesMeta(m)!.id;
    if (done.has(id)) continue;
    done.add(id);
    const s = series.get(id);
    if (s) out.push(tieAsMatch(s));
  }
  return out;
}

/** The ties among a match list (rubbers grouped), with their spec. */
export function tiesIn(matches: Match[]): { series: Series; spec: TieSpec | null }[] {
  return deriveSeries(matches.filter(isRubbersLeg)).map((series) => ({ series, spec: series.legs.map(tieSpecOf).find(Boolean) ?? null }));
}

/** Knockout board count for a level chess team match (series.ts). */
export { boardCountWinner } from './series.ts';

/** Team-tie standings presets (written into the tournament's sport format
 *  when the organiser turns team ties on). Match points per TIE won; the
 *  tie-breaks per the federation's team-event ranking (see the guide). */
export const TIE_POINTS: Partial<Record<SportId, { id: string; label: string; note: string; set: Record<string, number | string | boolean> }>> = {
  // ITTF Handbook, team group ranking: 2 for a tie won, 1 lost (played), 0
  // not played; ties among the tied: match points, individual-matches ratio,
  // games ratio, points ratio — restarting among any still level.
  tabletennis: { id: 'ittf-team', label: 'ITTF team ranking', note: 'Tie won 2, lost 1; among the tied: match points, rubbers ratio, games ratio, points ratio',
    set: { winPoints: 2, drawPoints: 0, lossPoints: 1, tieBreak: 'h2h,rubbersRatio,h2hGames,h2hPoints,lots', tieRestart: true } },
  // BWF team championships: ties won; 2 level → head-to-head; 3+ → matches
  // (rubbers) difference, games difference, points difference.
  badminton: { id: 'bwf-team', label: 'BWF team ranking', note: 'Ties won; 2 level → head-to-head; 3+ → rubbers, games, points difference',
    set: { winPoints: 1, drawPoints: 0, lossPoints: 0, tieBreak: 'rubbersDiff,gamesDiff,pointsDiff,lots', tieBreak2: 'h2h,lots', tieRestart: true } },
  // ITF Davis Cup / BJK Cup Finals group stage: ties won; 2 → head-to-head;
  // 3+ → % rubbers won, % sets won, % games won.
  tennis: { id: 'itf-team', label: 'Davis Cup / BJK Cup ranking', note: 'Ties won; 2 level → head-to-head; 3+ → % rubbers, % sets, % games won',
    set: { winPoints: 1, drawPoints: 0, lossPoints: 0, tieBreak: 'rubbersPct,setsPct,gamesPct,lots', tieBreak2: 'h2h,lots', tieRestart: true } },
  squash: { id: 'wsf-team', label: 'Team squash ranking', note: 'Ties won; 2 level → head-to-head; 3+ → rubbers, games, points difference',
    set: { winPoints: 1, drawPoints: 0, lossPoints: 0, tieBreak: 'rubbersDiff,gamesDiff,pointsDiff,lots', tieBreak2: 'h2h,lots', tieRestart: true } },
  // FIDE team events (Olympiad since 2008): match points 2 / 1 / 0, then
  // game (board) points, then the direct encounter.
  chess: { id: 'fide-team', label: 'FIDE team (match points)', note: 'Match won 2, drawn 1, lost 0; ties: game points, direct encounter',
    set: { winPoints: 2, drawPoints: 1, lossPoints: 0, tieBreak: 'boardPoints,h2h,lots' } },
  carrom: { id: 'team-tie', label: 'Team ties', note: 'Ties won; 2 level → head-to-head; 3+ → rubbers, games, points difference',
    set: { winPoints: 1, drawPoints: 0, lossPoints: 0, tieBreak: 'rubbersDiff,gamesDiff,pointsDiff,lots', tieBreak2: 'h2h,lots', tieRestart: true } },
  padel: { id: 'team-tie', label: 'Team ties', note: 'Ties won; 2 level → head-to-head; 3+ → rubbers, sets, games difference',
    set: { winPoints: 1, drawPoints: 0, lossPoints: 0, tieBreak: 'rubbersDiff,diff,gamesDiff,lots', tieBreak2: 'h2h,lots', tieRestart: true } },
  pickleball: { id: 'team-tie', label: 'Team ties', note: 'Ties won; 2 level → head-to-head; 3+ → rubbers, games, points difference',
    set: { winPoints: 1, drawPoints: 0, lossPoints: 0, tieBreak: 'rubbersDiff,gamesDiff,pointsDiff,lots', tieBreak2: 'h2h,lots', tieRestart: true } },
};

/** The tournament's standing team-tie choice (`formats[sport].teamTie`, the
 *  spec JSON), when the organiser runs this sport as team ties. */
export const tournamentTieSpec = (fmt?: Record<string, unknown> | null): TieSpec | null => {
  const raw = fmt?.teamTie;
  return typeof raw === 'string' ? tieSpecFromFormat({ [TIE_KEYS.spec]: raw }) : null;
};

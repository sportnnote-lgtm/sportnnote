/**
 * Knockout bracket generation. Two shapes live here, both pure:
 *  1. `knockoutBracket(teams)` — the computed draw: seed a flat team list into
 *     the next power-of-two bracket with byes. Used as a preview/fallback when a
 *     tournament's knockout matches aren't stage-tagged.
 *  2. `knockoutStageRounds(matches)` — the *real* bracket: the actual scheduled
 *     knockout matches grouped by their `stage` tag (r32 → … → final), with real
 *     pairings, scores and results. This is what a staged/grouped tournament
 *     shows, and `nextRoundPairs` feeds its round-to-round progression.
 */
import type { Match } from '../core/types';

/** Knockout stages, biggest field → final. `stage` on a Match is one of these
 *  (or 'group' for a group-stage match, or absent for league/friendly). */
export const KO_STAGES = ['r128', 'r64', 'r32', 'r16', 'qf', 'sf', 'final'] as const;
export type KoStage = (typeof KO_STAGES)[number];
export const KO_STAGE_LABEL: Record<KoStage, string> = {
  r128: 'Round of 128', r64: 'Round of 64', r32: 'Round of 32', r16: 'Round of 16',
  qf: 'Quarter-finals', sf: 'Semi-finals', final: 'Final',
};
export const isKoStage = (s?: string | null): s is KoStage => !!s && (KO_STAGES as readonly string[]).includes(s);
/** Order index — larger = later round (closer to the final). */
export const koStageRank = (s: KoStage): number => KO_STAGES.indexOf(s);
/** The stage a round of N teams belongs to (2 → final, 4 → sf, …). */
export function stageForTeams(teams: number): KoStage {
  if (teams <= 2) return 'final';
  if (teams <= 4) return 'sf';
  if (teams <= 8) return 'qf';
  if (teams <= 16) return 'r16';
  if (teams <= 32) return 'r32';
  if (teams <= 64) return 'r64';
  return 'r128';
}
export interface BracketTeam {
  name: string;
  color?: string;
}
export interface BracketSlot {
  name: string;
  color?: string;
  bye?: boolean;
  tbd?: boolean;
}
export interface BracketMatch {
  home: BracketSlot;
  away: BracketSlot;
}
export interface BracketRound {
  name: string;
  matches: BracketMatch[];
}

/** Standard seed positions for a bracket of `size` (power of two). */
function seedOrder(size: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

const roundName = (matches: number): string =>
  matches === 1 ? 'Final' : matches === 2 ? 'Semi-finals' : matches === 4 ? 'Quarter-finals' : `Round of ${matches * 2}`;

/** Returns the winner's name for a decided pairing, else undefined. */
export type DecideFn = (homeName: string, awayName: string) => string | undefined;

/**
 * Resolve which slot advances from a match: a bye auto-advances the real team;
 * a decided result advances the winner; otherwise the next slot is TBD.
 */
function winnerSlot(m: BracketMatch, decide: DecideFn | undefined, colorOf: (n: string) => string | undefined): BracketSlot {
  const { home, away } = m;
  if (home.bye && !away.bye && !away.tbd) return away;
  if (away.bye && !home.bye && !home.tbd) return home;
  if (home.tbd || away.tbd || (home.bye && away.bye)) return { name: 'TBD', tbd: true };
  const w = decide?.(home.name, away.name);
  return w ? { name: w, color: colorOf(w) } : { name: 'TBD', tbd: true };
}

export function knockoutBracket(teams: BracketTeam[], decide?: DecideFn): BracketRound[] {
  const n = teams.length;
  if (n < 2) return [];
  const colorOf = (name: string) => teams.find((t) => t.name === name)?.color;
  const size = 1 << Math.ceil(Math.log2(n));
  const order = seedOrder(size);
  const slotTeam = (seed: number): BracketSlot =>
    seed <= n ? { name: teams[seed - 1].name, color: teams[seed - 1].color } : { name: 'BYE', bye: true };

  const first: BracketMatch[] = [];
  for (let i = 0; i < size; i += 2) first.push({ home: slotTeam(order[i]), away: slotTeam(order[i + 1]) });

  const rounds: BracketRound[] = [{ name: roundName(first.length), matches: first }];
  let current = first;
  while (current.length > 1) {
    // Carry forward the winner of each match into the next round's slots.
    const winners = current.map((m) => winnerSlot(m, decide, colorOf));
    const next: BracketMatch[] = [];
    for (let i = 0; i < winners.length; i += 2) next.push({ home: winners[i], away: winners[i + 1] });
    rounds.push({ name: roundName(next.length), matches: next });
    current = next;
  }
  return rounds;
}

/** The champion, if the final is decided. */
export function bracketChampion(rounds: BracketRound[], decide?: DecideFn): BracketSlot | undefined {
  const final = rounds[rounds.length - 1]?.matches[0];
  if (!final) return undefined;
  const colorOf = () => undefined;
  const w = winnerSlot(final, decide, colorOf);
  return w.tbd ? undefined : w;
}

/* ---------------------- Match-driven (staged) bracket ---------------------- */

/** One real knockout round: its stage + the actual matches, in bracket order. */
export interface KnockoutRound {
  stage: KoStage;
  label: string;
  matches: Match[];
}

/**
 * Group a tournament's matches into real knockout rounds by their `stage` tag,
 * ordered biggest field → final. Group-stage / league / friendly matches (no
 * knockout stage) are ignored. Matches within a round keep bracket order (by
 * kickoff, then id) so adjacent winners meet in the next round.
 */
export function knockoutStageRounds(matches: Match[]): KnockoutRound[] {
  const byStage = new Map<KoStage, Match[]>();
  for (const m of matches) {
    if (!isKoStage(m.stage)) continue;
    const list = byStage.get(m.stage) ?? [];
    list.push(m);
    byStage.set(m.stage, list);
  }
  return [...byStage.entries()]
    .sort((a, b) => koStageRank(a[0]) - koStageRank(b[0]))
    .map(([stage, ms]) => ({
      stage,
      label: KO_STAGE_LABEL[stage],
      matches: ms.slice().sort((x, y) => (x.startsAt ?? '').localeCompare(y.startsAt ?? '') || x.id.localeCompare(y.id)),
    }));
}

/** The winning team's id for a completed, decided match (else undefined). */
export function matchWinnerId(m: Match): string | undefined {
  if (m.status !== 'completed' || !m.winner || m.winner === 'draw') return undefined;
  return m.winner === 'home' ? m.homeTeam.id : m.awayTeam.id;
}

/**
 * The next round's pairings from a completed round: winners in bracket order,
 * paired adjacently (match 0 winner v match 1 winner, …). Returns null unless
 * every match in the round is decided and there are ≥2 winners to pair — i.e.
 * the round is ready to advance. A trailing unpaired winner (odd count) byes.
 */
export function nextRoundPairs(round: KnockoutRound): { homeId: string; awayId: string; stage: KoStage }[] | null {
  if (round.matches.length < 2) return null; // the final has nothing after it
  const winners = round.matches.map(matchWinnerId);
  if (winners.some((w) => !w)) return null; // round not finished
  const ids = winners as string[];
  const stage = stageForTeams(ids.length);
  const pairs: { homeId: string; awayId: string; stage: KoStage }[] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) pairs.push({ homeId: ids[i], awayId: ids[i + 1], stage });
  return pairs;
}

/** The tournament champion's team id, if the final has been decided. */
export function stageChampionId(rounds: KnockoutRound[]): string | undefined {
  const final = rounds.find((r) => r.stage === 'final');
  return final && final.matches.length === 1 ? matchWinnerId(final.matches[0]) : undefined;
}

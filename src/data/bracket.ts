/**
 * Knockout bracket generation. Seeds teams into the next power-of-two draw,
 * gives the top seeds byes when the count isn't a power of two, and lays out
 * each round (Round of 16 → … → Final). Pure.
 */
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

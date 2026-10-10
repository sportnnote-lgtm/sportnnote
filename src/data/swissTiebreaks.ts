/**
 * SD-26 — FIDE tie-breaks that read the whole crosstable (pure, RN-free):
 * Buchholz, Buchholz Cut-1, Buchholz Median-1, Sonneborn-Berger (+ Cut-1),
 * progressive score (+ Cut-1), games played / won with Black, WIN and WON.
 *
 * Unplayed rounds follow FIDE C.07 (2023 tie-break regulations, in force
 * since August 2024):
 *  • Round robin (Art. 15.2): a forfeit is treated as a regular game.
 *  • Swiss (Art. 16):
 *    – 16.4 a participant's OWN unplayed round (bye, forfeit win or loss,
 *      requested bye, absence) counts as a game against a dummy opponent who
 *      finished on the participant's own score, with the result matching the
 *      points awarded (no more "virtual opponent");
 *    – 16.3 for the tie-breaks of OPPONENTS, a participant's unplayed rounds
 *      count at face value (pairing-allocated byes and forfeits included) —
 *      except requested byes / absences followed only by unplayed-by-choice
 *      rounds or in the last round (16.2.5: a withdrawal), which count as
 *      draws;
 *    – 16.5 a Cut modifier first cuts the lowest contribution from a
 *      voluntary unplayed round (VUR: requested bye, absence, forfeit loss)
 *      when that is not below the least significant value.
 * Checked against the FIDE Arbiters' Commission "Exercises in tie-breaking"
 * (M. Held, rev. 2403, C.07-2023) — tests/chess-swiss.test.mts.
 */

export type RoundKind =
  /** played over the board */
  | 'played'
  /** won / lost by forfeit (unplayed, FIDE C.07) */
  | 'forfeitWin' | 'forfeitLoss'
  /** pairing-allocated bye */
  | 'pab'
  /** requested half-point / zero-point bye */
  | 'hpb' | 'zpb'
  /** not paired and no bye (absent, withdrawn) — a zero-point bye for C.07 */
  | 'absent'
  /** no result / abandoned (not a C.07 case): opponent counted, no SB credit */
  | 'nr';

export interface XRound {
  /** 1-based round number (Swiss) or the game's order (round robin) */
  round: number;
  kind: RoundKind;
  opponentId?: string;
  /** points awarded for the round */
  points: number;
  /** 'win' | 'draw' | 'loss' as awarded (a full-point bye is a win) */
  result: 'win' | 'draw' | 'loss' | 'nr';
  /** colour over the board (played games only) */
  colour?: 'white' | 'black';
}

export interface FideTieBreaks {
  /** Buchholz (C.07 8.1) */
  bh: number;
  /** Buchholz Cut-1 (14.1) */
  bhc1: number;
  /** Buchholz Median-1 (14.3): cut the least, then the most significant */
  bhm1: number;
  /** Sonneborn-Berger (9.1) */
  sb: number;
  /** Sonneborn-Berger Cut-1 */
  sbc1: number;
  /** sum of progressive scores (7.5) */
  ps: number;
  /** progressive score Cut-1: without the score after round 1 */
  psc1: number;
  /** games played with Black over the board (7.3) */
  bpg: number;
  /** games won with Black over the board (7.4) */
  bwg: number;
  /** rounds scored as a win, played or not (7.1) */
  win: number;
  /** games won over the board (7.2) */
  won: number;
}

export interface CrosstableOptions {
  /** C.07 Art. 16 (Swiss) or 15 (pre-determined pairings) */
  swiss: boolean;
  /** points for a draw (the 16.3.2 / 16.2.5 "evaluated as a draw") */
  draw: number;
  /** Swiss: the rounds played so far. A missing round below it is an
   *  absence (a zero-point bye) unless listed in `pending`. Default: the
   *  highest round in the data. */
  rounds?: number;
  /** `${id}|${round}` of games drawn but not finished — ignored, not absences */
  pending?: Set<string>;
}

const VUR = new Set<RoundKind>(['forfeitLoss', 'hpb', 'zpb', 'absent']);
const REQUESTED = new Set<RoundKind>(['hpb', 'zpb', 'absent']);
const factor = (r: XRound['result']) => (r === 'win' ? 1 : r === 'draw' ? 0.5 : 0);

/** One contribution to an opponent-based tie-break. */
interface Part { value: number; contribution: number; vur: boolean }

/** The index to cut per C.07 14.1 + 16.5: the least significant value (lowest
 *  value; tie → lowest contribution), unless the participant has a VUR whose
 *  lowest contribution is not below it — then that VUR is cut. */
function cutIndex(parts: Part[]): number {
  if (!parts.length) return -1;
  let least = 0;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i], q = parts[least];
    if (p.value < q.value || (p.value === q.value && p.contribution < q.contribution)) least = i;
  }
  let vur = -1;
  for (let i = 0; i < parts.length; i++) if (parts[i].vur && (vur < 0 || parts[i].contribution < parts[vur].contribution)) vur = i;
  return vur >= 0 && parts[vur].contribution >= parts[least].contribution ? vur : least;
}
const sum = (ps: Part[]) => ps.reduce((s, p) => s + p.contribution, 0);
const without = (ps: Part[], i: number) => (i < 0 ? ps : ps.filter((_, j) => j !== i));

/** Fill a Swiss record's missing rounds with absences and sort it by round. */
function normalise(rows: XRound[], id: string, o: CrosstableOptions, rounds: number): XRound[] {
  const out = [...rows].sort((a, b) => a.round - b.round);
  if (!o.swiss) return out;
  const have = new Set(out.map((r) => r.round));
  for (let r = 1; r <= rounds; r++)
    if (!have.has(r) && !o.pending?.has(`${id}|${r}`)) out.push({ round: r, kind: 'absent', points: 0, result: 'loss' });
  return out.sort((a, b) => a.round - b.round);
}

/**
 * Every participant's FIDE tie-breaks from their round records. `scoreOf` is
 * each participant's final score (game points — organiser adjustments are not
 * results); absent → the sum of their rounds.
 */
export function fideTieBreaks(
  records: Map<string, XRound[]>, o: CrosstableOptions, scoreOf?: (id: string) => number | undefined,
): Map<string, FideTieBreaks> {
  const rounds = o.rounds ?? Math.max(0, ...[...records.values()].flatMap((rs) => rs.map((r) => r.round)));
  const recs = new Map<string, XRound[]>();
  for (const [id, rs] of records) recs.set(id, normalise(rs, id, o, rounds));
  const score = new Map<string, number>();
  for (const [id, rs] of recs) score.set(id, scoreOf?.(id) ?? rs.reduce((s, r) => s + r.points, 0));

  // 16.3 — each participant's score as seen by their opponents.
  const adjusted = new Map<string, number>();
  for (const [id, rs] of recs) {
    let adj = score.get(id)!;
    if (o.swiss) {
      rs.forEach((r, i) => {
        // 16.2.5: a requested bye / absence followed only by VURs (or last).
        if (REQUESTED.has(r.kind) && rs.slice(i + 1).every((x) => VUR.has(x.kind))) adj += o.draw - r.points;
      });
    }
    adjusted.set(id, adj);
  }

  const out = new Map<string, FideTieBreaks>();
  for (const [id, rs] of recs) {
    const own = score.get(id)!;
    const parts: Part[] = [];
    let bpg = 0, bwg = 0, win = 0, won = 0, ps = 0, running = 0, first: number | undefined;
    for (const r of rs) {
      // Round robin (15.2): a forfeit is a regular game against its opponent.
      const asGame = r.kind === 'played' || r.kind === 'nr' || (!o.swiss && (r.kind === 'forfeitWin' || r.kind === 'forfeitLoss'));
      const value = asGame && r.opponentId !== undefined ? adjusted.get(r.opponentId) ?? score.get(r.opponentId) ?? 0 : own;
      parts.push({ value, contribution: factor(r.result) * value, vur: o.swiss && VUR.has(r.kind) });
      if (r.result === 'win') win += 1;
      if (r.kind === 'played' && r.result === 'win') won += 1;
      if (r.kind === 'played' && r.colour === 'black') { bpg += 1; if (r.result === 'win') bwg += 1; }
      running += r.points;
      ps += running;
      first ??= running;
    }
    const bhParts = parts.map((p) => ({ ...p, contribution: p.value }));
    const bh = sum(bhParts);
    const c1 = without(bhParts, cutIndex(bhParts));
    // Median-1: the least significant (16.5 applies), then the most significant.
    let hi = -1;
    c1.forEach((p, i) => { if (hi < 0 || p.value > c1[hi].value) hi = i; });
    out.set(id, {
      bh, bhc1: sum(c1), bhm1: sum(without(c1, hi)),
      sb: sum(parts), sbc1: sum(without(parts, cutIndex(parts))),
      ps, psc1: ps - (first ?? 0), bpg, bwg, win, won,
    });
  }
  return out;
}

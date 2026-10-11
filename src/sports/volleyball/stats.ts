/** SD-15 — volleyball's stat schema (see ../statSchema.ts). PURE. `points`
 *  includes aces and blocks (SD-04), so their weights are the bonus on top. */
import type { Qualifier, SportStatSchema } from '../statSchema.ts';

/** SD-27 (VB-08) — FIVB ranks its per-set awards (Best Blocker, Best Server)
 *  among players with enough sets on court. Default 5 sets (two matches of a
 *  school event); organisers can change it. */
export const VOLLEYBALL_MIN_SETS: Qualifier = { den: 5, unit: { label: 'sets', one: 'set' } };
const q = VOLLEYBALL_MIN_SETS;
/** SD-81 — attack efficiency / success rank among attackers with at least
 *  this many attempts (organisers can change it). */
export const VOLLEYBALL_MIN_ATTEMPTS: Qualifier = { den: 10, unit: { label: 'attack attempts', one: 'attack attempt' } };
import { ACES, BLOCKS, HIGH_POINTS, POINTS } from '../sharedStats.ts';

export const volleyballStats: SportStatSchema<'volleyball'> = {
  sport: 'volleyball',
  /** SD-25 — career split chips (line context) */
  splits: ['format', 'tournament', 'season', 'opponent'],
  stats: [
    { ...POINTS, group: 'attack', weight: 1 },
    { ...ACES, group: 'serve', weight: 2 },
    { ...BLOCKS, group: 'block', weight: 1 },
    { key: 'attackPoints', label: 'Attack pts', short: 'attack pts', abbr: 'ATK', group: 'attack', matchSummary: true },
    // SD-16 — the team's sets won / lost on a line (SD-19's set counts).
    { key: 'setsWon', label: 'Sets won', short: 'sets won', one: 'set won', group: 'record', coverage: 'present' },
    { key: 'setsLost', label: 'Sets lost', short: 'sets lost', one: 'set lost', group: 'record', coverage: 'present' },
    // SD-29 — sets the PLAYER was on court in (the on-court tracker, written
    // absolutely by statTotals): FIVB's per-set denominator. A line without it
    // (older matches) stays out of the per-set figures. Display is SD-27 / SD-81.
    { key: 'setsPlayed', label: 'Sets played', short: 'sets', one: 'set', abbr: 'SP', group: 'record', coverage: 'present' },
    // SD-23 — team-level (the comparison panel): points the side got from the
    // opponent's errors
    { key: 'oppErrors', label: 'Opp. errors', short: 'opp. errors', one: 'opp. error', source: 'team' },
    // Service errors: the side's on the comparison panel (team figure, SD-23);
    // SD-58 / SD-81 — and the SERVER's on a player line once serve tracking
    // names who missed (keyed: only a match that named one; older matches and
    // matches without the toss read "not tracked", never 0).
    { key: 'serveErrors', label: 'Serve errors', short: 'serve errors', one: 'serve error', abbr: 'SE', group: 'serve', coverage: 'keyed', format: { unit: 'count', better: 'lower' } },
    // SD-117b — faults the player committed (an "Opp. fault" that named the
    // erring player). Optional detail: tracked only in a match that named one
    // (statTotals writes it on every line then), "not tracked" elsewhere.
    { key: 'errors', label: 'Errors', short: 'errors', one: 'error', abbr: 'ERR', group: 'errors', coverage: 'keyed', format: { unit: 'count', better: 'lower' } },
    // SD-81 (VB-07 / VB-08) — the optional "Detailed stats" mode (detail.ts):
    // every attack swing by result, and reception grades. 'keyed': only a
    // match that captured them carries the keys; older matches read "not
    // tracked", never 0.
    { key: 'attackAttempts', label: 'Attack attempts', short: 'attack attempts', one: 'attack attempt', abbr: 'ATT', group: 'attack', coverage: 'keyed' },
    { key: 'attackKills', label: 'Kills', short: 'kills', one: 'kill', abbr: 'K', group: 'attack', coverage: 'keyed' },
    { key: 'attackErrors', label: 'Attack errors', short: 'attack errors', one: 'attack error', abbr: 'AE', group: 'attack', coverage: 'keyed', format: { unit: 'count', better: 'lower' } },
    { key: 'attacksBlocked', label: 'Attacks blocked', short: 'attacks blocked', one: 'attack blocked', abbr: 'BLKD', group: 'attack', coverage: 'keyed', format: { unit: 'count', better: 'lower' } },
    // NCAA hitting % / FIVB VIS attack efficiency: (kills − errors − blocked) ÷ attempts
    { key: 'attackEff', label: 'Attack efficiency', abbr: 'EFF', source: 'derived', group: 'attack', format: { unit: 'percent', dp: 1 },
      agg: { kind: 'rate', num: ['attackKills', '-attackErrors', '-attacksBlocked'], den: 'attackAttempts', scale: 100, dp: 1, qualifier: VOLLEYBALL_MIN_ATTEMPTS },
      tieBreak: [{ key: 'attackKills', better: 'higher' }] },
    // FIVB Best Attacker (success %): kills ÷ attempts
    { key: 'attackSuccess', label: 'Attack success %', source: 'derived', group: 'attack', format: { unit: 'percent', dp: 1 },
      agg: { kind: 'rate', num: 'attackKills', den: 'attackAttempts', scale: 100, dp: 1, qualifier: VOLLEYBALL_MIN_ATTEMPTS },
      tieBreak: [{ key: 'attackKills', better: 'higher' }] },
    { key: 'receptions', label: 'Receptions', short: 'receptions', one: 'reception', abbr: 'REC', group: 'reception', coverage: 'keyed' },
    { key: 'receptionsPerfect', label: 'Perfect receptions', short: 'perfect receptions', one: 'perfect reception', group: 'reception', coverage: 'keyed' },
    { key: 'receptionsPositive', label: 'Positive receptions', short: 'positive receptions', one: 'positive reception', group: 'reception', coverage: 'keyed' },
    { key: 'receptionPerfectPct', label: 'Perfect reception %', source: 'derived', group: 'reception', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'receptionsPerfect', den: 'receptions', scale: 100, dp: 0 } },
    { key: 'receptionPositivePct', label: 'Positive reception %', source: 'derived', group: 'reception', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'receptionsPositive', den: 'receptions', scale: 100, dp: 0 } },
    { key: 'pointsPerSet', label: 'Points per set', abbr: 'PTS/S', source: 'derived', group: 'attack', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'points', sets: 'setsPlayed', dp: 2, qualifier: q }, tieBreak: [{ key: 'points', better: 'higher' }] },
    { key: 'acesPerSet', label: 'Aces per set', abbr: 'ACE/S', source: 'derived', group: 'serve', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'aces', sets: 'setsPlayed', dp: 2, qualifier: q }, tieBreak: [{ key: 'aces', better: 'higher' }] },
    { key: 'blocksPerSet', label: 'Blocks per set', abbr: 'BLK/S', source: 'derived', group: 'block', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'blocks', sets: 'setsPlayed', dp: 2, qualifier: q }, tieBreak: [{ key: 'blocks', better: 'higher' }] },
    // SD-24 (VB-08) — the team's sets on the player's lines, and a best match
    { key: 'setsWL', label: 'Sets W-L', source: 'derived', group: 'record', format: { unit: 'figure' }, agg: { kind: 'pair', a: 'setsWon', b: 'setsLost' } },
    { key: 'setsPct', label: 'Sets won %', source: 'derived', group: 'record', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'setsWon', den: ['setsWon', 'setsLost'], scale: 100, dp: 0 } },
    { ...HIGH_POINTS },
  ],
  // SD-24 (VB-08) — FIVB per-set figures over the sets the player was on court
  sections: [
    { id: 'attack', title: 'Attack', rows: [
      { stat: 'points' }, { stat: 'pointsPerSet' }, { stat: 'attackPoints' }, { stat: 'highPoints' },
      // SD-81 — detail-mode matches only (hidden as "not tracked" otherwise)
      { stat: 'attackAttempts' }, { stat: 'attackKills', label: 'Kills (detailed matches)' }, { stat: 'attackErrors' }, { stat: 'attacksBlocked' }, { stat: 'attackEff' }, { stat: 'attackSuccess' },
    ] },
    { id: 'serve', title: 'Serve', rows: [{ stat: 'aces' }, { stat: 'acesPerSet' }, { stat: 'serveErrors' }] },
    { id: 'block', title: 'Block', rows: [{ stat: 'blocks' }, { stat: 'blocksPerSet' }] },
    { id: 'reception', title: 'Reception', rows: [{ stat: 'receptions' }, { stat: 'receptionPerfectPct' }, { stat: 'receptionPositivePct' }] },
    { id: 'errors', title: 'Errors', rows: [{ stat: 'errors' }] },
    { id: 'record', title: 'Sets', rows: [{ stat: 'setsPlayed' }, { stat: 'setsWL' }, { stat: 'setsPct' }] },
  ],
  careerView: 'sections',
  // SD-81: ATT / EFF (detail mode), SE and ERR (named) — hidden on a match
  // that didn't capture them
  box: [{ columns: [{ key: 'points', emphasis: true }, 'attackPoints', 'aces', 'blocks', 'attackAttempts', 'attackEff', 'serveErrors', 'errors'] }],
  compare: ['points', 'attackPoints', 'blocks', 'aces', 'oppErrors', 'serveErrors'],
  // SD-27 (VB-08): totals, then FIVB's per-set rates (min sets on court)
  leaders: ['points', 'attackPoints', 'aces', 'blocks', 'pointsPerSet', 'acesPerSet', 'blocksPerSet', 'attackEff'],
  headline: ['points', 'aces'],
  // FIVB individual awards. Best Scorer = attack + block + serve points (all in
  // `points` since SD-04); Best Server / Blocker by aces / blocks per set.
  // SD-81: Best Attacker by attack efficiency (min attempts) from matches
  // scored in "Detailed stats"; "Most attack points" stays for every match.
  // Setter / libero / receiver / digger: custom awards.
  awards: [
    { stat: 'points', icon: '🏐', label: 'Top scorer', tournamentLabel: 'Best scorer', tieBreak: [{ key: 'pointsPerSet', better: 'higher' }] },
    { stat: 'aces', icon: '💥', label: 'Aces', tournamentLabel: 'Best server', rankBy: 'acesPerSet' },
    { stat: 'blocks', icon: '🧱', label: 'Blocks', tournamentLabel: 'Best blocker', rankBy: 'blocksPerSet' },
    { stat: 'attackPoints', icon: '⚡', label: 'Attack points', tournamentLabel: 'Most attack points', match: false },
    { stat: 'attackKills', icon: '🎯', label: 'Attack efficiency', tournamentLabel: 'Best attacker', rankBy: 'attackEff', match: false },
  ],
  scoreUnit: 'sets',
};

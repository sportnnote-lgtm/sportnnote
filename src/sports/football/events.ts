/** A single timeline event during a football match. */
/** `sinbin` (SD-29): a timed suspension — only when the format sets a sin-bin. */
export type FootballEventType = 'goal' | 'owngoal' | 'yellow' | 'red' | 'sub' | 'stoppage' | 'sinbin';

export type GoalType = 'open' | 'penalty' | 'freekick' | 'header';

/** How the ball was struck for a goal — captured separately from how it was won. */
export type BodyPart = 'left' | 'right' | 'head' | 'chest';
export const BODY_PART_LABEL: Record<BodyPart, string> = {
  left: 'Left foot',
  right: 'Right foot',
  head: 'Header',
  chest: 'Chest',
};

export interface FootballEvent {
  id: number;
  minute: number;
  type: FootballEventType;
  side: 'home' | 'away';
  /** primary player: scorer / carded player / player coming OFF */
  playerName?: string;
  /** secondary: assister (goal) / player coming ON (sub) */
  secondName?: string;
  /** how a goal was scored (open play / penalty / free kick / header) */
  goalType?: GoalType;
  /** which half it occurred in — 1/2 in regulation, 3/4 in extra time */
  half?: 1 | 2 | 3 | 4;
  /** a red that resulted from a second yellow (shown as a red badge with a "2") */
  secondYellow?: boolean;
  /** goals: which body part struck it (left/right foot, head, chest) */
  bodyPart?: BodyPart;
  /** SD-09: subs — the ids of the player going off / coming on. SD-30: also
   *  the scorer / carded player / own-goal player (`playerId`) and the
   *  assister (`secondId`) on goals. New matches only; older logs carry names
   *  only and resolve by name (football/totals.ts). */
  playerId?: string;
  secondId?: string;
  /** SD-29: a sin-bin's length in minutes */
  suspendMinutes?: number;
  /** SD-29: a sin-bin's exact match-clock second (the live countdown) */
  sec?: number;
  /** SD-117 (F13, Law 12): a card shown to a team official (coach / staff),
   *  not a player — `playerName` is the official's name (or "Team official").
   *  Never on a player's stat line, never sends a player off. New logs only. */
  official?: true;
}

/** SD-117 (F13): is this card a player's (not a team official's)? */
export const isPlayerCard = (e: Pick<FootballEvent, 'official'>): boolean => e.official !== true;

export const GOAL_TYPE_LABEL: Record<GoalType, string> = {
  open: 'Open play',
  penalty: 'Penalty',
  freekick: 'Free kick',
  header: 'Header',
};

export const EVENT_META: Record<FootballEventType, { icon: string; label: string }> = {
  goal: { icon: '⚽', label: 'Goal' },
  owngoal: { icon: '🥅', label: 'Own goal' },
  yellow: { icon: '🟨', label: 'Yellow card' },
  red: { icon: '🟥', label: 'Red card' },
  sub: { icon: '🔄', label: 'Substitution' },
  stoppage: { icon: '⏸️', label: 'Stoppage' },
  sinbin: { icon: '⏱️', label: 'Sin-bin' },
};

/**
 * Granular, player-attributed match stats (FIFA-style team + player breakdown).
 * Each is one tap by the scorer: pick the action, pick the player, (for a shot)
 * pick on/off target. Aggregated they give both team totals and per-player lines.
 */
export type StatKind =
  | 'shot' // onTarget distinguishes on/off target (a goal also counts as a shot on target)
  | 'foul'
  | 'offside'
  | 'corner'
  | 'tackle' // a won defensive tackle — turns possession over
  | 'interception' // turns possession over
  | 'save'
  | 'pass' // complete distinguishes accurate/misplaced (heavy — off by default)
  // Catch-all "positive contribution" buttons — when the scorer can't pick the
  // exact action fast (a dribble vs a through ball; a block vs a clearance),
  // they log the general attacking / defensive contribution instead.
  | 'cross' // a delivery into the box
  | 'dribble' // a completed take-on
  | 'handball' // a handball offence
  | 'attackContribution'
  | 'defenceContribution'
  // Penalty outcomes (recorded via the dedicated penalty flow, not the button grid).
  | 'penaltyWon' // the attacker who won the penalty
  | 'penaltyMissed' // the taker failed to score (saved or off target)
  // SD-08: the defender who blocked a shot (the shot itself is logged as
  // `blocked`, never on target — Opta: shots = on + off + blocked).
  | 'block';

export interface StatEvent {
  id: number;
  kind: StatKind;
  side: 'home' | 'away';
  playerId?: string;
  playerName?: string;
  /** secondary player — for a foul, who was fouled (the victim) */
  secondName?: string;
  minute: number;
  /** shots: was it on target? (a blocked shot is not — SD-08) */
  onTarget?: boolean;
  /** shots: blocked by a defender before reaching goal (SD-08). Older logs
   *  recorded a block as `onTarget: true` with no flag. */
  blocked?: boolean;
  /** passes: was it completed? */
  complete?: boolean;
  /** which half it occurred in — 1/2 in regulation, 3/4 in extra time */
  half?: 1 | 2 | 3 | 4;
}

export const STAT_META: Record<StatKind, { icon: string; label: string }> = {
  shot: { icon: '🎯', label: 'Shot' },
  foul: { icon: '🟫', label: 'Foul' },
  offside: { icon: '🚩', label: 'Offside' },
  corner: { icon: '⛳', label: 'Corner' },
  tackle: { icon: '🛡️', label: 'Tackle' },
  interception: { icon: '✋', label: 'Interception' },
  save: { icon: '🧤', label: 'Save' },
  pass: { icon: '➡️', label: 'Pass' },
  cross: { icon: '↗️', label: 'Cross' },
  dribble: { icon: '🏃', label: 'Dribble' },
  handball: { icon: '🤾', label: 'Handball' },
  attackContribution: { icon: '⚡', label: 'Attacking play' },
  defenceContribution: { icon: '🧱', label: 'Defensive play' },
  penaltyWon: { icon: '⚖️', label: 'Penalty won' },
  penaltyMissed: { icon: '🚫', label: 'Penalty missed' },
  block: { icon: '🧱', label: 'Block' },
};

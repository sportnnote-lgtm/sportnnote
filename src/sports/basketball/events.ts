/** A play-by-play event in a basketball game. */
export type BBEventType =
  | 'score' // field goal (1/2/3 — 3×3 uses 1 & 2)
  | 'freethrow' // a single free-throw attempt (made or missed)
  | 'rebound'
  | 'assist'
  | 'foul'
  | 'steal'
  | 'block'
  | 'turnover'
  | 'timeout'
  | 'sub'
  | 'eject'; // a player removed for the rest of the game (ejection, not a foul-out)

/** Foul kinds a scorer distinguishes at the ground. Shooting/technical/flagrant
 *  send a player to the free-throw line; technical fouls don't count toward the
 *  team-foul bonus. */
export type FoulType = 'personal' | 'shooting' | 'technical' | 'flagrant' | 'offensive';
export type ReboundType = 'off' | 'def';

export interface BBEvent {
  id: number;
  quarter: number;
  minute: number;
  type: BBEventType;
  side: 'home' | 'away';
  playerName?: string;
  /** points for a 'score' event (1/2/3) */
  points?: number;
  /** free-throw made (true) or missed (false) */
  made?: boolean;
  /** foul kind — drives the FT prompt and team-foul-bonus counting */
  foulType?: FoulType;
  /** offensive or defensive rebound (box-score detail) */
  reboundType?: ReboundType;
  /** substitution: the player coming ON (playerName = the player going off) */
  onName?: string;
}

export const BB_META: Record<BBEventType, { icon: string; label: string }> = {
  score: { icon: '🏀', label: 'Basket' },
  freethrow: { icon: '🎯', label: 'Free throw' },
  rebound: { icon: '🔁', label: 'Rebound' },
  assist: { icon: '🅰️', label: 'Assist' },
  foul: { icon: '🟨', label: 'Foul' },
  steal: { icon: '✋', label: 'Steal' },
  block: { icon: '🛡️', label: 'Block' },
  turnover: { icon: '🔄', label: 'Turnover' },
  timeout: { icon: '⏱️', label: 'Timeout' },
  sub: { icon: '🔀', label: 'Substitution' },
  eject: { icon: '🟥', label: 'Ejected' },
};

/** Points a single event puts on the board — field goals and made free throws. */
export const pointsOf = (e: BBEvent): number =>
  e.type === 'score' ? e.points ?? 0 : e.type === 'freethrow' && e.made ? 1 : 0;

export const FOUL_LABEL: Record<FoulType, string> = {
  personal: 'Personal',
  shooting: 'Shooting',
  technical: 'Technical',
  flagrant: 'Flagrant',
  offensive: 'Offensive',
};

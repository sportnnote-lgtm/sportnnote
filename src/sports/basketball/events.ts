/** A play-by-play event in a basketball game. */
export type BBEventType = 'score' | 'rebound' | 'assist' | 'foul' | 'steal' | 'block';

export interface BBEvent {
  id: number;
  quarter: number;
  minute: number;
  type: BBEventType;
  side: 'home' | 'away';
  playerName?: string;
  /** points for a 'score' event (1/2/3) */
  points?: number;
}

export const BB_META: Record<BBEventType, { icon: string; label: string }> = {
  score: { icon: '🏀', label: 'Basket' },
  rebound: { icon: '🔁', label: 'Rebound' },
  assist: { icon: '🅰️', label: 'Assist' },
  foul: { icon: '🟨', label: 'Foul' },
  steal: { icon: '✋', label: 'Steal' },
  block: { icon: '🛡️', label: 'Block' },
};

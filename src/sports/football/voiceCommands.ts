/** Deterministic voice-command parsing for football live scoring. A small,
 *  offline grammar (no LLM) keeps it fast and predictable — you never want a
 *  mis-heard sentence to invent a red card. Phrases map to the same actions the
 *  on-screen buttons trigger; player/team names are matched separately against
 *  the live roster. (An LLM could be slotted in later for free-form phrasing.) */
import type { Player } from '../../core/types';

/** Strip accents so "Modric" matches "Modrić", "Sutalo" matches "Šutalo", etc. */
export const deburr = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};

/** A jersey number spoken as a digit or word ("number 9", "nine"). */
export function jerseyFromText(text: string): number | undefined {
  const q = deburr(text);
  const digit = q.match(/\b(\d{1,2})\b/);
  if (digit) return Number(digit[1]);
  for (const [w, n] of Object.entries(NUM_WORDS)) if (new RegExp(`\\b${w}\\b`).test(q)) return n;
  return undefined;
}

/** Best player match for an utterance: surname, any name token, or jersey number. */
export function matchPlayer(text: string, players: Player[]): Player | undefined {
  const q = deburr(text);
  if (!q) return undefined;
  // 1) surname / name-token contains
  let partial: Player | undefined;
  for (const p of players) {
    const name = deburr(p.fullName);
    const tokens = name.split(' ').filter((t) => t.length > 1);
    const surname = tokens[tokens.length - 1];
    if (surname && (q.includes(surname) || (surname.length > 3 && q.includes(surname.slice(0, 4))))) return p;
    if (!partial && tokens.some((t) => t.length > 2 && q.includes(t))) partial = p;
  }
  // 2) jersey number
  const num = jerseyFromText(text);
  if (num != null) {
    const byNum = players.find((p) => p.jerseyNo === num);
    if (byNum) return byNum;
  }
  return partial;
}

/** "home" | "away" if the utterance names one of the two teams (full or short). */
export function matchTeam(text: string, home: string[], away: string[]): 'home' | 'away' | undefined {
  const q = deburr(text);
  const hit = (names: string[]) => names.some((n) => n && q.includes(deburr(n)));
  if (hit(home)) return 'home';
  if (hit(away)) return 'away';
  return undefined;
}

export type Intent =
  | { kind: 'goal' }
  | { kind: 'ownGoal' }
  | { kind: 'card'; color?: 'yellow' | 'red' }
  | { kind: 'sub' }
  | { kind: 'corner' }
  | { kind: 'offside' }
  | { kind: 'foul' }
  | { kind: 'tackle' }
  | { kind: 'interception' }
  | { kind: 'save' }
  | { kind: 'shot'; onTarget?: boolean }
  | { kind: 'attack' }
  | { kind: 'defence' }
  | { kind: 'kickoff' }
  | { kind: 'endHalf' }
  | { kind: 'fullTime' }
  | { kind: 'cancel' }
  | { kind: 'noAssist' }
  | { kind: 'goalType'; type: 'open' | 'penalty' | 'freekick' | 'header' }
  | { kind: 'unknown' };

/** Parse a free-standing command (used when no capture flow is mid-way). */
export function parseIntent(text: string): Intent {
  const q = deburr(text);
  const has = (re: RegExp) => re.test(q);

  if (has(/\b(cancel|never mind|go back|nevermind)\b/)) return { kind: 'cancel' };
  if (has(/\bown goal\b/)) return { kind: 'ownGoal' };
  if (has(/\bgoal\b|\bscored?\b/)) return { kind: 'goal' };
  if (has(/\byellow\b/)) return { kind: 'card', color: 'yellow' };
  if (has(/\bred\b/)) return { kind: 'card', color: 'red' };
  if (has(/\bcard\b|\bbooking\b|\bbooked\b/)) return { kind: 'card' };
  if (has(/\b(sub|substitut|change)\b/)) return { kind: 'sub' };
  if (has(/\bcorner\b/)) return { kind: 'corner' };
  if (has(/\boffside\b/)) return { kind: 'offside' };
  if (has(/\bfoul\b/)) return { kind: 'foul' };
  if (has(/\btackle\b/)) return { kind: 'tackle' };
  if (has(/\b(interception|intercept)\b/)) return { kind: 'interception' };
  if (has(/\bsave\b|\bsaved\b/)) return { kind: 'save' };
  if (has(/\bshot\b|\bshoot\b/)) return { kind: 'shot', onTarget: has(/on target|on goal/) ? true : has(/off target|wide|over/) ? false : undefined };
  if (has(/\battack/)) return { kind: 'attack' };
  if (has(/\bdefen/)) return { kind: 'defence' };
  if (has(/\b(kick ?off|kickoff|start)\b/)) return { kind: 'kickoff' };
  if (has(/\bhalf ?time\b|end (the )?(first |1st )?half/)) return { kind: 'endHalf' };
  if (has(/\bfull ?time\b|final whistle|end (the )?(match|game)/)) return { kind: 'fullTime' };
  return { kind: 'unknown' };
}

/** Parse a goal-type answer ("penalty", "free kick", "header", "open play"). */
export function parseGoalType(text: string): 'open' | 'penalty' | 'freekick' | 'header' | undefined {
  const q = deburr(text);
  if (/penalty|spot kick|spot/.test(q)) return 'penalty';
  if (/free kick|freekick|set piece/.test(q)) return 'freekick';
  if (/header|head|headed/.test(q)) return 'header';
  if (/open play|open|normal/.test(q)) return 'open';
  return undefined;
}

export const isNoAssist = (text: string): boolean => /\bno assist\b|\bnone\b|\bsolo\b|\bno one\b|\bnobody\b|\bunassisted\b/.test(deburr(text));
export const isYes = (text: string): boolean => /\byes\b|\byeah\b|\byep\b|\bon target\b|\bon goal\b/.test(deburr(text));
export const isNo = (text: string): boolean => /\bno\b|\bnope\b|\boff target\b|\bwide\b|\bover\b|\bmiss/.test(deburr(text));

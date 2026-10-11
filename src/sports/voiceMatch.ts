/** Shared, sport-agnostic helpers for voice/typed scoring: accent-stripping,
 *  number words, fuzzy player matching (surname/jersey), and resolving which side
 *  an utterance means (explicit home/away, a team name, or a matched player).
 *  Football keeps its own richer grammar; these power every other sport. */
import type { Player } from '../core/types';
import type { ScoreAction, SportPlugin, VoiceContext, VoiceEnding } from './types';

/** Strip accents so "Modric" matches "Modrić", lower-case, keep alnum + spaces. */
export const deburr = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
};

/** A number spoken as a digit or word ("number 9", "nine"). */
export function numberFromText(text: string): number | undefined {
  const q = deburr(text);
  const digit = q.match(/\b(\d{1,2})\b/);
  if (digit) return Number(digit[1]);
  for (const [w, n] of Object.entries(NUM_WORDS)) if (new RegExp(`\\b${w}\\b`).test(q)) return n;
  return undefined;
}

/** SD-137a — every number in the phrase, in the order spoken ("4 5",
 *  "four five", "Rao 4 Khan five"). */
export function numbersFromText(text: string): number[] {
  const words = Object.keys(NUM_WORDS).join('|');
  const re = new RegExp(`\\b(\\d{1,2}|${words}|zero|nil)\\b`, 'g');
  const out: number[] = [];
  for (const m of deburr(text).matchAll(re)) out.push(/^\d/.test(m[1]) ? Number(m[1]) : m[1] === 'zero' || m[1] === 'nil' ? 0 : NUM_WORDS[m[1]]);
  return out;
}

/** SD-137a — the phrase with both team names taken out, so a house called
 *  "Red" or "Yellow" never reads as a card colour. */
export function withoutTeams(text: string, ctx: Pick<VoiceContext, 'homeName' | 'awayName'>): string {
  let q = deburr(text);
  for (const n of [ctx.homeName, ctx.awayName]) {
    const t = n ? deburr(n) : '';
    if (t) q = q.split(t).join(' ');
  }
  return q.replace(/\s+/g, ' ').trim();
}

/** Best player match: surname / any name token contained, else jersey number. */
export function matchPlayer(text: string, players: Player[]): Player | undefined {
  const q = deburr(text);
  if (!q) return undefined;
  let partial: Player | undefined;
  for (const p of players) {
    const tokens = deburr(p.fullName).split(' ').filter((t) => t.length > 1);
    const surname = tokens[tokens.length - 1];
    if (surname && (q.includes(surname) || (surname.length > 3 && q.includes(surname.slice(0, 4))))) return p;
    if (!partial && tokens.some((t) => t.length > 2 && q.includes(t))) partial = p;
  }
  const num = numberFromText(text);
  if (num != null) {
    const byNum = players.find((p) => p.jerseyNo === num);
    if (byNum) return byNum;
  }
  return partial;
}

/** Resolve which side an utterance refers to, and any player it names: explicit
 *  "home"/"away", a team name, or whichever roster contains a matched player. */
export function resolveSide(text: string, ctx: VoiceContext): { side?: 'home' | 'away'; player?: Player } {
  const q = deburr(text);
  let side: 'home' | 'away' | undefined =
    /\bhome\b/.test(q) ? 'home' : /\baway\b/.test(q) ? 'away' : undefined;
  if (!side) {
    if (ctx.homeName && q.includes(deburr(ctx.homeName))) side = 'home';
    else if (ctx.awayName && q.includes(deburr(ctx.awayName))) side = 'away';
  }
  const homeP = matchPlayer(text, ctx.homeRoster);
  const awayP = matchPlayer(text, ctx.awayRoster);
  if (!side && homeP && !awayP) side = 'home';
  if (!side && awayP && !homeP) side = 'away';
  const player = side === 'home' ? homeP : side === 'away' ? awayP : homeP ?? awayP;
  return { side, player };
}

/** Build a stat-line attribution for a matched player (or none). */
export const attribution = (player: Player | undefined, stat: string, by?: number) =>
  player ? { playerId: player.id, stat, playerName: player.fullName, ...(by ? { by } : {}) } : undefined;

/** SD-119 — stamp the credited player's own side (when it isn't the action's). */
export const sided = <A extends object>(a: A | undefined, side: 'home' | 'away'): (A & { side: 'home' | 'away' }) | undefined =>
  a ? { ...a, side } : undefined;

/** SD-137a — does this call end a period / the match? The sport says first;
 *  otherwise any call that would complete the match counts as full time. */
export function voiceEnding(
  voice: Pick<NonNullable<SportPlugin['voice']>, 'ends'>, actions: ScoreAction[], state: unknown, wouldComplete?: (actions: ScoreAction[]) => boolean,
): VoiceEnding | null {
  let e: VoiceEnding | null = null;
  try { e = voice.ends?.(actions, state) ?? null; } catch { e = null; }
  if (e) return e;
  try { return wouldComplete?.(actions) ? { action: 'fullTime' } : null; } catch { return null; }
}

/** SD-137a — would these actions complete a match that isn't complete yet?
 *  (the plugin's own pure reducer + isComplete; never throws). */
export function completesMatch<S>(
  plugin: { reducer: (s: S, a: ScoreAction) => S; isComplete: (s: S) => boolean }, state: S, actions: ScoreAction[],
): boolean {
  try {
    if (plugin.isComplete(state)) return false;
    return plugin.isComplete(actions.reduce((s, a) => plugin.reducer(s, a), state));
  } catch { return false; }
}

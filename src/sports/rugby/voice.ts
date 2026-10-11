/**
 * SD-143 — rugby voice / typed commands. PURE: the same actions (and credits)
 * the buttons dispatch, null when unsure (the shared panel confirms first).
 *   "try Rao" / "try Rao assist Khan" / "penalty try home"
 *   "conversion good Rao" / "conversion missed" (no side → the last try's side)
 *   "penalty goal Rao" / "penalty kick missed Rao" / "drop goal Rao"
 *   "yellow card Rao" / "red card Rao"
 *   "end half" / "full time" (full time only when it really is — `rugbyVoiceEnds`)
 */
import type { ScoreAction, VoiceContext, VoiceEnding } from '../types';
import type { Player } from '../../core/types';
import { deburr, resolveSide, matchPlayer, withoutTeams } from '../voiceMatch.ts';
import * as rg from './engine.ts';

type Side = 'home' | 'away';
const TRACKED: string[] = rg.LIVE_KEYS.filter((k) => k !== 'soTaken' && k !== 'soGoals');
const vid = (now: number) => `v${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const END_WORDS = /\b(full ?time|final whistle|end (of )?(the )?(match|game))\b/;
const PERIOD_WORDS = /\b(end (of )?(the )?(half|period|h[12]|extra time)|half ?time)\b/;

/** Is the period in play the match's last (as the Full time button reads it)? */
export function rugbyLast(s: rg.RugbyState): boolean {
  return s.period >= s.plan.length && !(rg.levelAtEnd(s) && rg.nextPlan(s).length > 0);
}

export function rugbyVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const s = ctx.state as rg.RugbyState | undefined;
  if (!s || s.ended) return null;
  const q = withoutTeams(text, ctx);
  const now = ctx.now ?? Date.now();
  const stamp = () => ({ uid: vid(now), at: now, sec: rg.matchSec(s, now), psec: rg.periodSec(s, now), period: s.period });
  if (END_WORDS.test(q) || PERIOD_WORDS.test(q)) {
    if (!rg.periodStarted(s)) return null;
    if (END_WORDS.test(q) && !rugbyLast(s)) return null;
    return [{ type: 'END_PERIOD', payload: { at: now } }];
  }
  if (!rg.periodStarted(s)) return null;
  // "20 minute red Rao": the 20 isn't a shirt number
  const red20Said = /\b(20|twenty) ?(min(ute)?s?)?\b/.test(q) && /\bred\b/.test(q);
  const said = resolveSide(red20Said ? text.replace(/\b(20|twenty) ?(min(ute)?s?)?\b/gi, ' ') : text, ctx);
  const lastTry = [...s.events].reverse().find((e) => e.type === 'try');
  const credit = (e: Parameters<typeof rg.eventCredits>[0]) => {
    const cr = rg.eventCredits(e);
    return { attribution: rg.creditAttribution(cr.first, 1, TRACKED), attribution2: rg.creditAttribution(cr.second, 1, TRACKED) };
  };
  const roster = (sd: Side): Player[] => (sd === 'home' ? ctx.homeRoster : ctx.awayRoster);
  if (/\bpenalty try\b/.test(q)) return said.side ? [{ type: 'PENALTY_TRY', side: said.side, payload: stamp() }] : null;
  if (/\bconver(t|sion|ted)\b/.test(q)) {
    const side = said.side ?? lastTry?.side;
    if (!side) return null;
    const made = !/\b(miss(ed)?|wide|no good|short|hit the post)\b/.test(q);
    const kicker = said.player ?? matchPlayer(q, roster(side));
    return [{ type: 'KICK', side, payload: { kick: 'conv', made, ...stamp() }, ...credit({ type: 'kick', kick: 'conv', made, playerId: kicker?.id, playerName: kicker?.fullName }) }];
  }
  const side = said.side;
  if (!side) return null;
  const player = said.player;
  if (/\bdrop ?(goal|kick)?\b/.test(q) || /\bpenalty (goal|kick)\b/.test(q)) {
    const kick: rg.KickKind = /\bdrop\b/.test(q) ? 'drop' : 'pen';
    const made = !/\b(miss(ed)?|wide|no good|short|hit the post)\b/.test(q);
    return [{ type: 'KICK', side, payload: { kick, made, ...stamp() }, ...credit({ type: 'kick', kick, made, playerId: player?.id, playerName: player?.fullName }) }];
  }
  const card = /\byellow\b/.test(q) ? 'yellow' : /\bred\b/.test(q) ? 'red' : null;
  if (card) {
    const second = card === 'yellow' && !!player && rg.yellowsOf(s, side, { id: player.id, name: player.fullName }) >= 1;
    const c: rg.CardKind = second ? 'red' : card;
    const r20 = s.red20 && (second || red20Said);
    return [{ type: 'CARD', side, payload: { card: c, ...(second ? { second: true } : {}), ...(r20 ? { red20: true } : {}), ...stamp() },
      ...credit({ type: 'card', card: c, second, playerId: player?.id, playerName: player?.fullName }) }];
  }
  if (/\btry\b|\bscores?\b/.test(q)) {
    const m = /\b(assist(?:ed)?(?: by)?|pass from|from)\b(.*)$/.exec(deburr(q));
    const scorer = m ? matchPlayer(q.slice(0, m.index), roster(side)) : player;
    const assist = m ? matchPlayer(m[2], roster(side).filter((p) => p.id !== scorer?.id)) : undefined;
    return [{ type: 'TRY', side, payload: stamp(), ...credit({ type: 'try', playerId: scorer?.id, playerName: scorer?.fullName, secondId: assist?.id, secondName: assist?.fullName }) }];
  }
  return null;
}

export function rugbyVoiceEnds(actions: ScoreAction[], state: unknown): VoiceEnding | null {
  const s = state as rg.RugbyState | undefined;
  if (!s || !actions.some((a) => a.type === 'END_PERIOD')) return null;
  const score = `${s.home}-${s.away}`;
  return rugbyLast(s) ? { action: 'fullTime', score } : { action: 'endPeriod', period: rg.periodName(s, s.period), score };
}

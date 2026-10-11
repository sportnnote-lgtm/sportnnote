/** SD-146 — netball voice / typed commands. PURE: the same actions (and
 *  credits) the buttons dispatch, null when unsure. A call that ends a period
 *  or the match goes through the ConfirmSheet (`netballVoiceEnds`).
 *   "goal GS home" / "home goal shooter" / "goal Asha"  → a goal (the shooter
 *        from the position on court, or the named GS / GA)
 *   "miss GA away" / "missed Asha"                       → a missed attempt
 *   "centre home"                                        → the centre pass is home's
 *   "time out home"                                      → a team time-out (league formats)
 *   "hold time injury" / "blood"                         → the umpires hold time
 *   "end quarter" / "full time"                          → ends (confirm first) */
import type { ScoreAction, VoiceContext, VoiceEnding } from '../types';
import { deburr, resolveSide, withoutTeams } from '../voiceMatch.ts';
import {
  creditAttribution, eventCredits, lineupAt, matchSec, periodLong, periodStarted, positionOf, timeoutCheck, totalPeriods,
  LIVE_KEYS, type NetballState, type Pos,
} from './engine.ts';

const TRACKED: string[] = [...LIVE_KEYS];
const vid = (now: number, n = 0) => `v${now.toString(36)}${n || ''}${Math.random().toString(36).slice(2, 5)}`;
const END_WORDS = /\b(full ?time|final whistle|end (of )?(the )?(match|game))\b/;
const PERIOD_WORDS = /\b(end (of )?(the )?(quarter|half|period|q[1-4]|h[12])|half ?time|quarter ?time)\b/;

function posWord(q: string): Pos | undefined {
  if (/\bg ?s\b|\bgoal ?shooter\b|\bshooter\b/.test(q)) return 'GS';
  if (/\bg ?a\b|\bgoal ?attack\b/.test(q)) return 'GA';
  return undefined;
}

/** Is the last regular / extra period in play (its end is full time)? */
export function netballLast(s: NetballState): boolean {
  if (s.period < totalPeriods(s)) return false;
  const level = s.home === s.away;
  if (level && s.decider === 'et' && !s.et && s.period === s.periods) return false;
  if (level && s.et && !s.playOn && s.period === s.periods + 2) return false;
  return true;
}

export function netballVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const s = ctx.state as NetballState | undefined;
  if (!s || s.ended) return null;
  const q = deburr(withoutTeams(text, ctx));
  const all = deburr(text);
  const now = ctx.now ?? Date.now();
  const stamp = (n = 0) => ({ uid: vid(now, n), at: now, sec: matchSec(s, now), period: s.period });
  if (END_WORDS.test(q) || PERIOD_WORDS.test(q)) {
    if (!periodStarted(s)) return null;
    if (END_WORDS.test(q) && !netballLast(s)) return null;
    if (s.playOn && s.home === s.away) return null; // play on until the lead
    return [{ type: 'END_PERIOD', payload: { at: now } }];
  }
  const { side, player } = resolveSide(text, ctx);
  if (/\bhold( the)? time\b|\binjur(y|ed)\b|\bblood\b/.test(all)) {
    const reason = /\bblood\b/.test(all) ? 'blood' : /\binjur(y|ed)\b/.test(all) ? 'injury' : 'other';
    return periodStarted(s) ? [{ type: 'STOP', ...(side ? { side } : {}), payload: { reason, ...stamp() } }] : null;
  }
  if (!side) return null;
  if (/\bcent(re|er)\b/.test(q) && !/\bgoal\b/.test(q)) return [{ type: 'CENTRE', side, payload: stamp() }];
  if (/\btime ?out\b/.test(q)) return timeoutCheck(s, side).ok ? [{ type: 'TIMEOUT', side, payload: stamp() }] : null;
  if (!periodStarted(s)) return null;
  const miss = /\bmiss(ed|es)?\b|\bno goal\b/.test(q);
  if (!miss && !/\bgoal\b|\bscores?d?\b/.test(q)) return null;
  // the shooter: a named player (their position), else the said position's player
  const said = posWord(q);
  const l = lineupAt(s, side);
  const pos = said ?? (player ? positionOf(s, side, { id: player.id, name: player.fullName }) : undefined);
  if (pos !== 'GS' && pos !== 'GA') return null; // only GS / GA score
  const shooter = said && l[said] ? { id: l[said]!.id, name: l[said]!.name } : player ? { id: player.id, name: player.fullName } : undefined;
  const ev = { type: miss ? 'miss' as const : 'goal' as const, playerId: shooter?.id, playerName: shooter?.name };
  const cr = eventCredits(ev);
  return [{ type: miss ? 'MISS' : 'GOAL', side, payload: { pos, ...stamp() }, attribution: creditAttribution(cr.first, 1, TRACKED) }];
}

export function netballVoiceEnds(actions: ScoreAction[], state: unknown): VoiceEnding | null {
  const s = state as NetballState | undefined;
  if (!s || !actions.some((a) => a.type === 'END_PERIOD')) return null;
  const score = `${s.home}-${s.away}`;
  return netballLast(s) ? { action: 'fullTime', score } : { action: 'endPeriod', period: periodLong(s, s.period), score };
}

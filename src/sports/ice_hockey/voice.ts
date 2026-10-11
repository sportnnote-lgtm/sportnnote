/**
 * SD-145 — ice hockey by voice (same shape as ../voiceParsers.ts: PURE, the
 * same actions and credits the buttons dispatch, null when unsure):
 *   "goal Rao assist Khan and Patel" (power play / short-handed / empty net
 *   from the penalties and the net, or said: "power play goal Rao"),
 *   "shot Rao" (the other goalie's save), "save Patel" / "save home",
 *   "penalty two minutes tripping Rao", "double minor Rao", "major Rao",
 *   "misconduct Rao", "game misconduct Rao", "match penalty Rao",
 *   "bench minor home", "time-out home", "pull goalie home", "end period",
 *   "full time" / "final" (the last period only).
 * Anything that closes a period or the match asks first (`iceHockeyVoiceEnds`).
 */
import type { Player } from '../../core/types';
import type { ScoreAction, VoiceContext, VoiceEnding } from '../types';
import { deburr, matchPlayer, resolveSide, withoutTeams } from '../voiceMatch.ts';
import {
  creditAttribution, eventCredits, goalFlagsNow, goalieAt, matchSec, nextIsOvertime, periodLong, periodStarted, timeoutLeft,
  INFRACTIONS, LIVE_KEYS, type IceEvent, type IceHockeyState, type PenKind, type Side,
} from './engine.ts';

const TRACKED: string[] = LIVE_KEYS.filter((k) => k !== 'soTaken' && k !== 'soGoals');
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const vid = (now: number, n = 0) => `v${now.toString(36)}${n || ''}${Math.random().toString(36).slice(2, 5)}`;
const END_WORDS = /\b(full ?time|final (whistle|horn|buzzer)|end (of )?(the )?(match|game)|\bfinal\b)\b/;
const PERIOD_WORDS = /\b(end (of )?(the )?(period|first|second|third|overtime|p[1-3])|intermission)\b/;

/** The voice credits as the buttons build them. */
export function voiceCredit(e: Parameters<typeof eventCredits>[0], scale: 'iihf' | 'nhl'): Pick<ScoreAction, 'attribution' | 'attribution2'> & { third?: ScoreAction['attribution'] } {
  const c = eventCredits(e, scale);
  return { attribution: creditAttribution(c.first, 1, TRACKED), attribution2: creditAttribution(c.second, 1, TRACKED), third: creditAttribution(c.third, 1, TRACKED) };
}

function penKindOf(q: string): PenKind | null {
  if (/\bmatch penalty\b/.test(q)) return 'match';
  if (/\bgame misconduct\b/.test(q)) return /\bmajor\b/.test(q) ? 'majorGm' : 'gm';
  if (/\bmisconduct\b|\bten minutes?\b|\b10 minutes?\b/.test(q)) return 'misconduct';
  if (/\bdouble minor\b|\bfour minutes?\b|\b4 minutes?\b/.test(q)) return 'double';
  if (/\bmajor\b|\bfive minutes?\b|\b5 minutes?\b/.test(q)) return 'major';
  if (/\bbench minor\b/.test(q)) return 'bench';
  if (/\bminor\b|\btwo minutes?\b|\b2 minutes?\b|\bpenalty\b/.test(q)) return 'minor';
  return null;
}

/** "goal Rao assist Khan and Patel" → scorer, assists (up to 2). */
function splitAssists(text: string, ctx: VoiceContext, side: Side): { scorer?: Player; assists: Player[] } {
  const q = withoutTeams(text, ctx);
  const roster = side === 'home' ? ctx.homeRoster : ctx.awayRoster;
  const m = /\b(assists?(?:ed)?(?: by)?|from)\b(.*)$/.exec(q);
  if (!m) return { scorer: matchPlayer(q, roster), assists: [] };
  const scorer = matchPlayer(q.slice(0, m.index), roster);
  const rest = roster.filter((p) => p.id !== scorer?.id);
  const parts = m[2].split(/\band\b|,/).map((x) => x.trim()).filter(Boolean);
  const assists: Player[] = [];
  for (const part of parts.slice(0, 2)) {
    const p = matchPlayer(part, rest.filter((x) => !assists.some((a) => a.id === x.id)));
    if (p) assists.push(p);
  }
  return { scorer, assists };
}

export function iceHockeyVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const s = ctx.state as IceHockeyState | undefined;
  if (!s || s.ended) return null;
  const q = withoutTeams(text, ctx);
  const now = ctx.now ?? Date.now();
  const sec = matchSec(s, now);
  const stamp = (n = 0) => ({ uid: vid(now, n), at: now, sec, period: s.period });
  if (END_WORDS.test(q) || PERIOD_WORDS.test(q)) {
    if (!periodStarted(s)) return null;
    if (END_WORDS.test(q) && !isLast(s)) return null;
    return [{ type: 'END_PERIOD', payload: { at: now } }];
  }
  if (!periodStarted(s)) return null;
  // "two minutes Rao": the minutes aren't a shirt number
  const { side, player } = resolveSide(text.replace(/\b(two|2|four|4|five|5|ten|10) ?min(ute)?s?\b/gi, ' '), ctx);
  if (!side) return null;
  if (/\btime ?out\b/.test(q)) return timeoutLeft(s, side) > 0 ? [{ type: 'TIMEOUT', side, payload: stamp() }] : null;
  if (/\bpull(ed)?\b.*\b(goalie|goaltender|keeper)\b|\bempty net\b.*\bpull/.test(q)) return [{ type: 'PULL', side, payload: stamp() }];
  if (/\b(goalie|goaltender|keeper)\b.*\bback\b/.test(q)) return [{ type: 'BACK', side, payload: stamp() }];
  const pen = penKindOf(q);
  if (pen && !/\bgoal\b/.test(q)) {
    const infraction = INFRACTIONS.find((x) => q.includes(deburr(x)));
    const who = pen === 'bench' ? undefined : player;
    const e: Partial<IceEvent> = { type: 'pen', side, pen, playerId: who?.id, playerName: who?.fullName };
    return [{ type: 'PEN', side, payload: { pen, ...(infraction ? { infraction } : {}), ...stamp() }, ...voiceCredit(e as IceEvent, s.pimScale) }];
  }
  if (/\bgoal\b|\bscores?\b/.test(q)) {
    const { scorer, assists } = splitAssists(text, ctx, side);
    const flags = goalFlagsNow(s, side, sec);
    const strength = /\bpower ?play\b|\bpp\b/.test(q) ? 'pp' : /\bshort ?handed\b|\bshorty\b/.test(q) ? 'sh' : /\beven strength\b/.test(q) ? 'ev' : flags.strength;
    const en = /\bempty ?net\b/.test(q) || flags.en;
    const st = stamp();
    const cr = voiceCredit({ type: 'goal', side, playerId: scorer?.id, playerName: scorer?.fullName, secondId: assists[0]?.id, secondName: assists[0]?.fullName, strength, en }, s.pimScale);
    const out: ScoreAction[] = [{ type: 'GOAL', side, payload: { strength, ...(en ? { en: true } : {}), ...st }, attribution: cr.attribution, attribution2: cr.attribution2 }];
    if (assists[1]) {
      const c3 = voiceCredit({ type: 'goal', side, playerId: undefined, thirdId: assists[1].id, thirdName: assists[1].fullName }, s.pimScale).third;
      out.push({ type: 'ASSIST2', side, payload: { ref: st.uid, uid: vid(now, 2) }, attribution: c3 });
    }
    return out;
  }
  if (/\bsave[sd]?\b/.test(q)) {
    // the named side's goalie saved a shot from the other side
    const gk = goalieAt(s, side);
    return [{ type: 'SHOT', side: other(side), payload: stamp(), ...voiceCredit({ type: 'shot', side: other(side), gkId: gk?.id, gkName: gk?.name }, s.pimScale) }];
  }
  if (/\bshot\b|\bshoots?\b/.test(q)) {
    const gk = goalieAt(s, other(side));
    return [{ type: 'SHOT', side, payload: stamp(), ...voiceCredit({ type: 'shot', side, playerId: player?.id, playerName: player?.fullName, gkId: gk?.id, gkName: gk?.name }, s.pimScale) }];
  }
  return null;
}

/** As the button: the end of the last period (or an OT) with no more play is full time. */
function isLast(s: IceHockeyState): boolean {
  return s.period >= s.periods && !nextIsOvertime(s);
}

export function iceHockeyVoiceEnds(actions: ScoreAction[], state: unknown): VoiceEnding | null {
  const s = state as IceHockeyState | undefined;
  if (!s || !actions.some((a) => a.type === 'END_PERIOD')) return null;
  const score = `${s.home}-${s.away}`;
  return isLast(s) ? { action: 'fullTime', score } : { action: 'endPeriod', period: periodLong(s, s.period), score };
}

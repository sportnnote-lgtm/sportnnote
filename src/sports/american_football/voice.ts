/**
 * SD-147 — American football voice / typed commands. PURE: the same actions
 * (and credits) the buttons dispatch, null when unsure (the shared panel
 * confirms first). Numbers are yards, never shirt numbers.
 *   "touchdown Rao" / "touchdown pass Rao from Khan 24" / "touchdown run Rao 5"
 *   "extra point good" / "PAT no good" / "two point good Rao" / "1 point good"
 *   "field goal good 32 Rao" / "field goal no good 45" / "safety home"
 *   "timeout home" / "end quarter" / "end of game"
 *   play by play: "pass complete to Rao for 12" / "incomplete" / "run Rao for 5"
 *   / "Rao loss of 3" / "sack Smith 7" / "interception Smith"
 */
import type { ScoreAction, VoiceContext, VoiceEnding } from '../types';
import type { Player } from '../../core/types';
import { deburr, matchPlayer, resolveSide, withoutTeams } from '../voiceMatch.ts';
import * as af from './engine.ts';

type Side = 'home' | 'away';
const vid = (now: number) => `v${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const END_WORDS = /\b(full ?time|final whistle|end (of )?(the )?(match|game))\b/;
const PERIOD_WORDS = /\b(end (of )?(the )?(quarter|half|period|q[1-4]|h[12]|overtime|ot)|half ?time)\b/;
const MISS = /\b(no good|miss(ed)?|wide|short|blocked|fail(ed|s)?|incomplete|stopped)\b/;

/** The passer a side last used (for "pass complete to X"). */
export function lastPasser(s: af.AFState, side: Side): af.Who | undefined {
  for (let i = s.events.length - 1; i >= 0; i--) {
    const e = s.events[i];
    if (e.side !== side) continue;
    if (e.type === 'play' && (e.play === 'pass' || e.play === 'inc' || e.play === 'int') && (e.playerId || e.playerName)) return { id: e.playerId, name: e.playerName };
    if (e.type === 'td' && e.how === 'pass' && (e.secondId || e.secondName)) return { id: e.secondId, name: e.secondName };
  }
  return undefined;
}

/** Yards in the phrase ("for 12", "loss of 3" → -3, "32 yards"). */
function yardsIn(q: string): number | undefined {
  const m = /(-?\d{1,3})/.exec(q);
  if (!m) return undefined;
  const n = Number(m[1]);
  return /\b(loss|lost|minus|back)\b/.test(q) ? -Math.abs(n) : n;
}
const noNumbers = (t: string) => t.replace(/-?\d{1,3}/g, ' ');

export function afVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const s = ctx.state as af.AFState | undefined;
  if (!s || s.ended) return null;
  const q = withoutTeams(text, ctx);
  const now = ctx.now ?? Date.now();
  const stamp = () => ({ uid: vid(now), at: now, sec: af.matchSec(s, now), psec: af.periodSec(s, now), period: s.period });
  if (END_WORDS.test(q) || PERIOD_WORDS.test(q)) {
    if (!af.periodStarted(s)) return null;
    if (END_WORDS.test(q) && !af.isLast(s)) return null;
    return [{ type: 'END_PERIOD', payload: { at: now } }];
  }
  const said = resolveSide(noNumbers(text), ctx);
  const roster = (sd: Side): Player[] => (sd === 'home' ? ctx.homeRoster : ctx.awayRoster);
  const who = (p?: Player): af.Who | undefined => (p ? { id: p.id, name: p.fullName } : undefined);
  const y = yardsIn(q);
  const lastTd = [...s.events].reverse().find((e) => e.type === 'td');

  if (/\btime ?out\b/.test(q)) return said.side ? [{ type: 'TIMEOUT', side: said.side, payload: { ...stamp() } }] : null;

  // the try after a touchdown
  if (/\b(extra point|pat|point after|two point|2 point|2pt|conversion|one point|1 point)\b/.test(q) && !/\bfield goal\b/.test(q)) {
    const side = said.side ?? s.pendingTry ?? lastTd?.side;
    if (!side) return null;
    const kind: af.TryKind = /\b(two|2) ?(point|pt)\b/.test(q) ? 'two' : /\b(one|1) ?point\b/.test(q) || s.variant === 'flag' ? 'one' : 'kick';
    const good = !MISS.test(q);
    const p = said.player ?? matchPlayer(noNumbers(q), roster(side));
    return [{ type: 'TRY', side, payload: { kind, good, ...stamp() }, ...af.credit({ type: 'try', kind, good, playerId: p?.id, playerName: p?.fullName }) }];
  }
  if (/\bsafety\b/.test(q)) {
    const side = said.side ?? (s.drive ? af.other(s.drive.off) : undefined);
    return side ? [{ type: 'SAFETY', side, payload: { ...stamp() } }] : null;
  }
  if (/\bfield goal\b|\bfg\b/.test(q)) {
    const side = said.side ?? s.drive?.off;
    if (!side) return null;
    const good = !MISS.test(q);
    const yards = y ?? (s.drive ? af.fgDistance(s, s.drive.spot) : undefined);
    const p = said.player;
    return [{ type: 'FG', side, payload: { good, ...(yards ? { yards } : {}), ...stamp() }, ...af.credit({ type: 'fg', good, playerId: p?.id, playerName: p?.fullName }) }];
  }
  if (/\btouch ?down\b|\btd\b/.test(q)) {
    const side = said.side ?? s.drive?.off;
    if (!side) return null;
    const how: af.TdHow = /\b(pass|catch|caught|from)\b/.test(q) ? 'pass' : /\b(intercept|pick)/.test(q) ? 'int' : /\bfumble\b/.test(q) ? 'fumble'
      : /\bpunt\b/.test(q) ? 'punt' : /\b(kick ?off|kick return)\b/.test(q) ? 'kick' : 'run';
    const qq = ` ${deburr(noNumbers(q))} `;
    const i = qq.indexOf(' from ');
    const scorer = i >= 0 ? matchPlayer(qq.slice(0, i), roster(side)) : said.player;
    const passer = i >= 0 ? matchPlayer(qq.slice(i + 6), roster(side).filter((p) => p.id !== scorer?.id)) : undefined;
    const pbpTd = s.mode === 'pbp' && (how === 'run' || how === 'pass') && s.drive?.off === side;
    const yards = y ?? (pbpTd ? s.field - s.drive!.spot : undefined);
    const ev = { type: 'td' as const, how, yards, pbp: pbpTd, playerId: scorer?.id, playerName: scorer?.fullName, ...(how === 'pass' && passer ? { secondId: passer.id, secondName: passer.fullName } : {}) };
    return [{ type: 'TD', side, payload: { how, ...(yards != null ? { yards } : {}), ...(pbpTd ? { pbp: true } : {}), ...stamp() }, ...af.credit(ev) }];
  }

  // play by play
  if (s.mode !== 'pbp' || !s.drive) return null;
  const off = s.drive.off;
  const def = af.other(off);
  if (/\bincomplete\b/.test(q)) return [af.buildPlay(s, off, { play: 'inc', p1: lastPasser(s, off) }, stamp())];
  if (/\bsack(ed)?\b/.test(q)) {
    const p = matchPlayer(noNumbers(q), roster(def));
    return [af.buildPlay(s, off, { play: 'sack', yards: -Math.abs(y ?? 0), p2: who(p) }, stamp())];
  }
  if (/\b(intercept(ed|ion)?|picked)\b/.test(q)) {
    const p = matchPlayer(noNumbers(q), roster(def));
    return [af.buildPlay(s, off, { play: 'int', p1: lastPasser(s, off), p2: who(p) }, stamp())];
  }
  if (/\bpass\b|\bcomplet(e|ed|ion)\b|\bcatch\b/.test(q)) {
    if (y === undefined) return null;
    const rec = matchPlayer(noNumbers(q), roster(off));
    return [af.buildPlay(s, off, { play: 'pass', yards: y, p1: lastPasser(s, off), p2: who(rec) }, stamp())];
  }
  if (/\b(run|rush|carry|for|gain|loss)\b/.test(q) && y !== undefined) {
    const p = matchPlayer(noNumbers(q), roster(off));
    return [af.buildPlay(s, off, { play: 'run', yards: y, p1: who(p) }, stamp())];
  }
  return null;
}

export function afVoiceEnds(actions: ScoreAction[], state: unknown): VoiceEnding | null {
  const s = state as af.AFState | undefined;
  if (!s || !actions.some((a) => a.type === 'END_PERIOD')) return null;
  const score = `${s.home}-${s.away}`;
  return af.isLast(s) ? { action: 'fullTime', score } : { action: 'endPeriod', period: af.periodName(s, s.period), score };
}

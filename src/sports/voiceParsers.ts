/** Deterministic voice/typed-command parsers for the point-based sports. Each is
 *  a PURE function (phrase + context → actions | null), matching what the on-screen
 *  buttons dispatch. Kept offline & rule-based so a mis-heard word can't invent a
 *  score. Football ships its own richer, stateful grammar separately. */
import type { ScoreAction } from './types';
import type { VoiceContext } from './types';
import { deburr, resolveSide, attribution, sided, numberFromText, numbersFromText, matchPlayer, withoutTeams } from './voiceMatch.ts';
import { previewRaid, outPlayers, type KabaddiState } from './kabaddi/engine.ts';
import { outcomeAction } from './volleyball/engine.ts';
import { creditAttribution, ftCredits, makeCredits, missCredits } from './basketball/credits.ts';
import type { Player } from '../core/types';
import type { VoiceEnding } from './types';
import * as hk from './hockey/engine.ts';
import * as hb from './handball/engine.ts';
import { boardCloses, boardPoints, nextBreaker, slamFor, PENALTY_POINTS, type CarromState } from './carrom/engine.ts';
import { creditedPlayers } from './carrom/totals.ts';
import { holeWinner } from './golf/engine.ts';
import { matchHole, scoreStatKey } from './golf/matchStrokes.ts';
import { golfMatchStateOf, type GolfMatchState } from './golf/match.ts';

/** Rally/set-point sports (badminton, tennis, volleyball, padel, pickleball,
 *  squash): "point home", "point away", "<team> point", "<player> scores".
 *  For side-out sports the reducer figures serve/handout from who won the rally. */
export function pointVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const q = deburr(text);
  const scoreWord = /\b(point|score|scored|won|winner|rally|ace|smash|kill|serve|up)\b/.test(q);
  const { side, player } = resolveSide(text, ctx);
  if (!side) return null;
  // Fire only with a scoring keyword OR a named player, so a bare "home" is ignored.
  if (!scoreWord && !player) return null;
  return [{ type: 'POINT', side, attribution: attribution(player, 'points') }];
}

/** Basketball: "two/three [player]", "free throw [player]", "rebound/assist/steal/
 *  block/turnover/foul [player]", and (SD-31, when the match tracks missed
 *  shots) "miss two/three [player]" / "missed free throw [player]". The
 *  credits are the buttons' (basketball/credits.ts), with the player's id in
 *  `pid` (SD-40). */
export function basketballVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const q = deburr(text);
  const { side, player } = resolveSide(text, ctx);
  if (!side) return null;
  const st = ctx.state as { targetPoints?: number; trackMisses?: boolean } | null;
  const fullCourt = Number(st?.targetPoints ?? 0) === 0;
  const tracking = st?.trackMisses === true;
  // SD-122: `v: 2` = foul-out / ejection checked for this side (and id).
  const pid = player ? { pid: player.id, v: 2 } : { v: 2 };
  const credit = (c: Record<string, number>) => (player ? creditAttribution(player.id, player.fullName, c) : undefined);
  const simple = (type: string, stat: string): ScoreAction[] => [{ type, side, payload: pid, attribution: attribution(player, stat) }];
  const ftWords = /\bfree ?throw\b|foul shot/.test(q);
  if (/\bmiss(ed|es)?\b/.test(q)) {
    if (ftWords) return [{ type: 'FREE_THROW', side, payload: { made: false, ...pid }, attribution: credit(ftCredits(false)) }];
    if (!tracking) return null; // turn on "Track missed shots" first (D8)
    const pts = fullCourt ? (/\bthree\b|three ?pointer/.test(q) ? 3 : 2) : (/\btwo\b|two ?pointer/.test(q) ? 2 : 1);
    return [{ type: 'MISS', side, payload: { points: pts, ...pid }, attribution: credit(missCredits(pts)) }];
  }
  if (/\brebound\b/.test(q)) return simple('REBOUND', 'rebounds');
  if (/\bassist\b/.test(q)) return simple('ASSIST', 'assists');
  if (/\bsteal\b|stole\b/.test(q)) return simple('STEAL', 'steals');
  if (/\bblock\b|blocked\b|swat/.test(q)) return simple('BLOCK', 'blocks');
  if (/\bturnover\b|turned over|lost the ball/.test(q)) return simple('TURNOVER', 'turnovers');
  if (/\bfoul\b/.test(q)) return [{ type: 'FOUL', side, payload: { foulType: 'personal', ...pid }, attribution: attribution(player, 'fouls') }];
  // A spoken free throw is a made free throw. In a full-court (timed) game a
  // spoken "one" is a free throw too, like the "+1 FT" button (SD-05); 3×3 /
  // first-to-N games keep the 1-point basket.
  if (ftWords || (fullCourt && /\bone\b|one ?pointer/.test(q) && !/\btwo\b|\bthree\b|\bbasket\b|\bbucket\b|lay ?up|dunk|jumper|and one/.test(q)))
    return [{ type: 'FREE_THROW', side, payload: { made: true, ...pid }, attribution: credit(ftCredits(true)) }];
  let pts: number | undefined;
  if (/\bthree\b|three ?pointer|from (downtown|deep)/.test(q)) pts = 3;
  else if (/\btwo\b|\bbasket\b|\bbucket\b|lay ?up|dunk|jumper|and one/.test(q)) pts = 2;
  else if (/\bone\b|one ?pointer/.test(q)) pts = 1; // 3×3 one-pointer (inside the arc)
  if (pts) return [{ type: 'SCORE', side, payload: { points: pts, ...(tracking ? { fga: true } : {}), ...pid }, attribution: credit(makeCredits(pts, !fullCourt, tracking)) }];
  return null;
}

/** Tennis: "ace [player]" → the ACE action; anything else is a plain point.
 *  (A spoken ace was previously logged as a generic point, losing the stat.) */
export function tennisVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const q = deburr(text);
  const { side, player } = resolveSide(text, ctx);
  if (!side) return null;
  // Double fault: the opponent wins the point; the faulting server gets the DF stat.
  if (/double ?fault|\bdf\b/.test(q)) return [{ type: 'POINT', side: side === 'home' ? 'away' : 'home', payload: { df: true }, attribution2: sided(attribution(player, 'doubleFaults'), side) }];
  if (/\bace\b/.test(q)) return [{ type: 'ACE', side, attribution: attribution(player, 'aces') }];
  return pointVoice(text, ctx);
}

/** Volleyball: "ace [player]" → ACE, "block [player]" → BLOCK; else a point. */
export function volleyballVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const q = deburr(text);
  const { side, player } = resolveSide(text, ctx);
  if (!side) return null;
  // Same actions (and credits — an ace/block is also a point) as the buttons.
  if (/\bblock\b|blocked\b|\bstuff\b/.test(q)) return [outcomeAction('block', side, player)];
  if (/\bace\b/.test(q)) return [outcomeAction('ace', side, player)];
  if (/\b(attack|kill|spike|smash)\b/.test(q)) return [outcomeAction('attack', side, player)];
  return pointVoice(text, ctx);
}

/** Kabaddi: "raid [player]" = a 1-touch raid; "tackle [player]" = the named side
 *  tackled the opponent's raider. Both route through the RAID_OUTCOME engine (so
 *  they advance the out-count / all-out / do-or-die state), not the simple +1
 *  actions that only moved the score. Credits match what the engine scores: a
 *  tackle on a raider facing ≤3 defenders is a super tackle (2). */
export function kabaddiVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const q = deburr(text);
  const { side, player } = resolveSide(text, ctx);
  if (!side) return null;
  const opp = side === 'home' ? 'away' : 'home';
  const state = ctx.state as KabaddiState | undefined;
  const preview = (o: { side: 'home' | 'away'; touches: number; bonus: boolean; raiderOut: boolean }) => (state ? previewRaid(state, o) : undefined);
  if (/\btackle\b/.test(q)) {
    const outcome = { side: opp, touches: 0, bonus: false, raiderOut: true } as const;
    const pts = preview(outcome)?.tacklePts ?? 1;
    return [{ type: 'RAID_OUTCOME', side: opp, payload: { ...outcome, ...(player ? { tacklerId: player.id, tacklerName: player.fullName } : null) }, attribution2: sided(attribution(player, 'tacklePoints', pts), side) }];
  }
  if (/\braid\b/.test(q)) {
    const outcome = { side, touches: 1, bonus: false, raiderOut: false } as const;
    const pts = preview(outcome)?.raidPts ?? 1;
    return [{ type: 'RAID_OUTCOME', side, payload: { ...outcome, ...(player ? { raiderId: player.id, raiderName: player.fullName } : null) }, attribution: pts ? attribution(player, 'raidPoints', pts) : undefined }];
  }
  return kabaddiExtrasVoice(text, ctx); // SD-137a — cards / technical points
}

/** Cricket: ball-by-ball outcomes. No side-matching (one side bats at a time) —
 *  instead each action carries the current innings' side + striker/bowler pulled
 *  from state, mirroring the plugin's own `ball()` wrapper. Extras/wickets are
 *  checked before generic runs so "no ball" / "leg bye" aren't read as runs. */
export function cricketVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const q = deburr(text);
  const s = ctx.state as { battingSide?: 'home' | 'away'; strikerId?: string; strikerName?: string; bowlerId?: string; bowlerName?: string };
  const wrap = (type: string, payload: Record<string, unknown> = {}): ScoreAction => ({
    type, side: s.battingSide, payload: { ...payload, strikerId: s.strikerId, strikerName: s.strikerName, bowlerId: s.bowlerId, bowlerName: s.bowlerName },
  });
  const n = numberFromText(q);
  const runsOffText = n != null && n <= 7 ? n : undefined;

  // Extras (contain words that overlap runs — check first).
  if (/\bno ?ball\b/.test(q)) {
    const nb = runsOffText ?? 0;
    // a 4/6 off the no-ball is a boundary unless "all run" was said (parity #15)
    const allRun = /\ball run\b|\bran\b/.test(q);
    // runs off the bat are the striker's (parity #19, as the tap flow)
    return [{ ...wrap('EXTRA', { kind: 'No ball', runs: nb, ...(nb === 4 || nb === 6 ? { boundary: !allRun } : {}) }), attribution: nb > 0 && s.strikerId ? { playerId: s.strikerId, stat: 'runs', by: nb, playerName: s.strikerName } : undefined }];
  }
  if (/\bwide\b/.test(q)) return [wrap('EXTRA', { kind: 'Wide' })];
  if (/\bleg ?bye/.test(q)) return [wrap('LEGBYES', { runs: runsOffText ?? 1 })];
  if (/\bbye/.test(q)) return [wrap('BYES', { runs: runsOffText ?? 1 })];

  // Wicket.
  if (/\b(wicket|bowled|caught|catch|lbw|leg before|stumped|run ?out|hit ?wicket|howzat|\bout\b|\bgone\b)\b/.test(q)) {
    const kind = /\bcaught\b|\bcatch\b/.test(q) ? 'caught'
      : /\blbw\b|leg before/.test(q) ? 'lbw'
      : /\bstumped\b/.test(q) ? 'stumped'
      : /\brun ?out\b/.test(q) ? 'runout'
      : /\bhit ?wicket\b/.test(q) ? 'hitwicket'
      : 'bowled';
    // Credit the bowler for a bowler's wicket (not a run out) — parity with the
    // plugin's tap flow, so voice-scored wickets count toward player stats too.
    return [{ ...wrap('WICKET', { kind }), attribution: s.bowlerId && kind !== 'runout' ? { playerId: s.bowlerId, stat: 'wickets', by: 1, playerName: s.bowlerName, side: s.battingSide === 'home' ? 'away' : 'home' } : undefined }];
  }

  // Runs — a run word or a bare 0-7 (parity #15: "five", "seven"; "all run" /
  // "ran four" = not a boundary; "four" / "six" / "boundary" = a boundary).
  const allRun = /\ball run\b|\bran (four|4|six|6)\b/.test(q);
  let r: number | undefined;
  if (/\bdot\b|no run|nothing|\bzero\b/.test(q)) r = 0;
  else if (allRun) r = runsOffText;
  else if (/\bfour\b|\bboundary\b/.test(q)) r = /\bsix\b/.test(q) ? 6 : 4;
  else if (/\bsix\b|\bmaximum\b/.test(q)) r = 6;
  else if (/\bsingle\b/.test(q)) r = 1;
  else if (/\bcouple\b|\bdouble\b/.test(q)) r = 2;
  else r = runsOffText;
  const runWord = /\b(dot|no run|nothing|zero|four|boundary|six|maximum|single|couple|double|run|runs|ran|scored?)\b/.test(q);
  if (r != null && r >= 0 && r <= 7 && (runWord || /^\d$/.test(q.trim()) || /^(five|seven)$/.test(q.trim()))) {
    const boundaryFlag = r === 4 || r === 6 ? { boundary: !allRun } : allRun ? { boundary: false } : {};
    return [{ ...wrap('RUNS', { runs: r, ...boundaryFlag }), attribution: s.strikerId ? { playerId: s.strikerId, stat: 'runs', by: r, playerName: s.strikerName } : undefined }];
  }
  return null;
}

/* ------------------------------------------------------------------------
 * SD-137a — voice for hockey, handball, carrom and golf match play, plus
 * kabaddi cards / technical points. Same shape as the parsers above: PURE,
 * the same actions (and credits) the buttons dispatch, null when unsure.
 * Anything that closes a period or the match is flagged by the sport's
 * `…VoiceEnds` so the panel asks in the ConfirmSheet first.
 * ---------------------------------------------------------------------- */

type Side = 'home' | 'away';
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const vid = (now: number, n = 0) => `v${now.toString(36)}${n || ''}${Math.random().toString(36).slice(2, 5)}`;
const rosterOf = (ctx: VoiceContext, side: Side): Player[] => (side === 'home' ? ctx.homeRoster : ctx.awayRoster);
/** "goal Rao assist Khan" → the scorer from the first part, the helper after the cue word. */
function splitAssist(text: string, ctx: VoiceContext, side: Side): { scorer?: Player; assist?: Player } {
  const q = withoutTeams(text, ctx);
  const m = /\b(assist(?:ed)?(?: by)?|from|pass from)\b(.*)$/.exec(q);
  const roster = rosterOf(ctx, side);
  if (!m) return { scorer: matchPlayer(q, roster) };
  const scorer = matchPlayer(q.slice(0, m.index), roster);
  const assist = matchPlayer(m[2], roster.filter((p) => p.id !== scorer?.id));
  return { scorer, assist };
}
const END_WORDS = /\b(full ?time|final (whistle|hooter)|end (of )?(the )?(match|game))\b/;
const PERIOD_WORDS = /\b(end (of )?(the )?(quarter|half|period|q[1-4]|h[12])|half ?time|hooter)\b/;

/* ---------------------------------- hockey ---------------------------------- */

const HOCKEY_TRACKED = [...hk.LIVE_KEYS.filter((k) => k !== 'soTaken' && k !== 'soGoals'), 'cleanSheets'];

/** Hockey: "goal Rao" / "PC goal Rao assist Khan" / "stroke goal home",
 *  "penalty corner home", "shot Rao" (off target) / "shot saved Rao" (the
 *  keeper's save too), "green / yellow (10) / red card Rao", "circle home",
 *  "end quarter", "full time" (the last period only). Stamped with the
 *  game-clock second heard. */
export function hockeyVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const s = ctx.state as hk.HockeyState | undefined;
  if (!s || s.ended) return null;
  const q = withoutTeams(text, ctx);
  const now = ctx.now ?? Date.now();
  const stamp = (n = 0) => ({ uid: vid(now, n), at: now, sec: hk.matchSec(s, now), period: s.period });
  if (END_WORDS.test(q) || PERIOD_WORDS.test(q)) {
    if (!hk.periodStarted(s)) return null; // a period that hasn't started can't end
    if (END_WORDS.test(q) && s.period < s.periods) return null; // "full time" only in the last period
    return [{ type: 'END_PERIOD', payload: { at: now } }];
  }
  if (!hk.periodStarted(s)) return null;
  // "yellow 10 Rao": the minutes aren't a shirt number
  const { side, player } = resolveSide(/\byellow\b/.test(q) ? text.replace(/\b(10|ten|5|five)\b( ?min(ute)?s?)?/gi, ' ') : text, ctx);
  if (!side) return null;
  const credit = (e: Parameters<typeof hk.eventCredits>[0]) => {
    const cr = hk.eventCredits(e);
    return { attribution: hk.creditAttribution(cr.first, 1, HOCKEY_TRACKED), attribution2: hk.creditAttribution(cr.second, 1, HOCKEY_TRACKED) };
  };
  if (/\bgoal\b/.test(q)) {
    const goalType: hk.GoalType = /\bstroke\b/.test(q) ? 'stroke' : s.penaltyCorners && /\b(pc|penalty corner|short corner|corner)\b/.test(q) ? 'pc' : 'field';
    const { scorer, assist } = splitAssist(text, ctx, side);
    const helper = goalType === 'stroke' ? undefined : assist;
    return [{ type: 'GOAL', side, payload: { goalType, ...stamp() }, ...credit({ type: 'goal', goalType, playerId: scorer?.id, playerName: scorer?.fullName, secondId: helper?.id, secondName: helper?.fullName }) }];
  }
  if (/\b(pc|penalty corner|short corner)\b/.test(q)) return s.penaltyCorners ? [{ type: 'PC', side, payload: stamp() }] : null;
  if (/\bcircle\b/.test(q)) return [{ type: 'CIRCLE', side, payload: { at: now, sec: hk.matchSec(s, now), period: s.period } }];
  const card = /\bgreen\b/.test(q) ? 'green' : /\byellow\b/.test(q) ? 'yellow' : /\bred\b/.test(q) ? 'red' : null;
  if (card && /\bcard\b|\bgreen\b|\byellow\b|\bred\b/.test(q)) {
    const minutes = card === 'green' ? 2 : card === 'yellow' ? (/\b(10|ten)\b/.test(q) ? 10 : 5) : undefined;
    return [{ type: 'CARD', side, payload: { card, ...(minutes ? { minutes } : {}), ...stamp() }, ...credit({ type: 'card', card, playerId: player?.id, playerName: player?.fullName }) }];
  }
  const saved = /\b(saved|save|on (goal|target))\b/.test(q);
  const keeperSave = (ref: string): ScoreAction => {
    const gk = hk.currentKeeper(s, other(side));
    return { type: 'SAVE', side: other(side), payload: { ref, ...stamp(1) }, ...credit({ type: 'save', playerId: gk?.id, playerName: gk?.name }) };
  };
  if (/\bstroke\b/.test(q)) {
    const result: 'saved' | 'missed' = saved ? 'saved' : 'missed';
    const st = stamp();
    return [{ type: 'STROKE', side, payload: { outcome: result, ...st }, ...credit({ type: 'stroke', outcome: result, playerId: player?.id, playerName: player?.fullName }) },
      ...(result === 'saved' ? [keeperSave(st.uid)] : [])];
  }
  if (/\bshot\b|\bshoots?\b/.test(q)) {
    const st = stamp();
    return [{ type: 'SHOT', side, payload: { onGoal: saved, ...st }, ...credit({ type: 'shot', onGoal: saved, playerId: player?.id, playerName: player?.fullName }) },
      ...(saved ? [keeperSave(st.uid)] : [])];
  }
  return null;
}

/** Hockey: the end of the last period is full time; any other is a period end. */
export function hockeyVoiceEnds(actions: ScoreAction[], state: unknown): VoiceEnding | null {
  const s = state as hk.HockeyState | undefined;
  if (!s || !actions.some((a) => a.type === 'END_PERIOD')) return null;
  const score = `${s.home}-${s.away}`;
  return s.period >= s.periods ? { action: 'fullTime', score } : { action: 'endPeriod', period: hk.periodName(s, s.period), score };
}

/* --------------------------------- handball --------------------------------- */

const HANDBALL_TRACKED: string[] = hb.LIVE_KEYS.filter((k) => k !== 'soTaken' && k !== 'soGoals');

function handballShot(q: string): hb.ShotType | undefined {
  if (/\b(7|seven) ?m(eter|etre|eters|etres)?\b|\bpenalty\b|\bseven metre\b/.test(q)) return 'sevenM';
  if (/\bfast ?break\b|\bcounter\b/.test(q)) return 'fastBreak';
  if (/\bwing\b/.test(q)) return 'wing';
  if (/\bbreak ?through\b/.test(q)) return 'breakthrough';
  if (/\b(6|six) ?m(eter|etre)?\b|\bpivot\b|\bline\b/.test(q)) return 'sixM';
  if (/\b(9|nine) ?m(eter|etre)?\b|\bback ?court\b|\bjump shot\b/.test(q)) return 'nineM';
  return undefined;
}

/** Handball: "goal Rao" (9 m unless said: "wing", "6 m", "7 m", "fast break",
 *  "breakthrough"; "assist Khan"), "7 m saved Rao" / "shot missed Rao" /
 *  "shot blocked Rao" (a saved attempt credits the other keeper), "yellow /
 *  two minutes / red Rao", "time-out home", "turnover Rao", "end half",
 *  "full time" (when the half is the last). */
export function handballVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const s = ctx.state as hb.HandballState | undefined;
  if (!s || s.ended) return null;
  const q = withoutTeams(text, ctx);
  const now = ctx.now ?? Date.now();
  const stamp = (n = 0) => ({ uid: vid(now, n), at: now, sec: hb.matchSec(s, now), period: s.period });
  if (END_WORDS.test(q) || PERIOD_WORDS.test(q)) {
    if (!hb.periodStarted(s)) return null;
    if (END_WORDS.test(q) && !handballLast(s)) return null;
    return [{ type: 'END_PERIOD', payload: { at: now } }];
  }
  if (!hb.periodStarted(s)) return null;
  // "two minutes Rao" / "7 m goal": those numbers aren't shirt numbers
  const { side, player } = resolveSide(text.replace(/\b(two|2) ?min(ute)?s?\b|\b(7|seven|6|six|9|nine) ?m(eter|etre)?s?\b/gi, ' '), ctx);
  if (!side) return null;
  const credit = (e: Parameters<typeof hb.eventCredits>[0]) => {
    const cr = hb.eventCredits(e);
    return { attribution: hb.creditAttribution(cr.first, 1, HANDBALL_TRACKED), attribution2: hb.creditAttribution(cr.second, 1, HANDBALL_TRACKED) };
  };
  if (/\btime ?out\b/.test(q)) return hb.timeoutCheck(s, side, now).ok ? [{ type: 'TIMEOUT', side, payload: stamp() }] : null;
  if (/\bturn ?over\b|\blost the ball\b/.test(q)) return [{ type: 'TURNOVER', side, payload: stamp(), ...credit({ type: 'turnover', playerId: player?.id, playerName: player?.fullName }) }];
  const card: hb.Sanction | null = /\b(two|2) ?min(ute)?s?\b|\bsuspension\b|\bsuspended\b/.test(q) ? 'twoMin' : /\byellow\b/.test(q) ? 'yellow' : /\bred\b/.test(q) ? 'red' : null;
  if (card) {
    const third = card === 'twoMin' && !!player && hb.suspensionsOf(s, side, { id: player.id, name: player.fullName }) >= 2;
    return [{ type: 'CARD', side, payload: { card, ...(third ? { third: true } : {}), ...stamp() }, ...credit({ type: 'card', card, third, playerId: player?.id, playerName: player?.fullName }) }];
  }
  const shotType = handballShot(q);
  const miss: hb.MissResult | null = /\b(saved|save)\b/.test(q) ? 'saved' : /\bblocked?\b/.test(q) ? 'blocked' : /\b(miss(ed)?|wide|post|over)\b/.test(q) ? 'missed' : null;
  if (/\bgoal\b|\bscores?\b/.test(q) && !miss) {
    const st = shotType ?? 'nineM';
    const { scorer, assist } = splitAssist(text, ctx, side);
    const helper = st === 'sevenM' ? undefined : assist;
    return [{ type: 'GOAL', side, payload: { shotType: st, ...stamp() }, ...credit({ type: 'goal', shotType: st, playerId: scorer?.id, playerName: scorer?.fullName, secondId: helper?.id, secondName: helper?.fullName }) }];
  }
  if (miss && (shotType || /\bshot\b|\bthrow\b/.test(q))) {
    const st = shotType ?? 'nineM';
    const one = stamp();
    const out: ScoreAction[] = [{ type: 'MISS', side, payload: { shotType: st, result: miss, ...one }, ...credit({ type: 'miss', shotType: st, playerId: player?.id, playerName: player?.fullName }) }];
    if (miss === 'saved') {
      const gk = hb.currentKeeper(s, other(side));
      out.push({ type: 'SAVE', side: other(side), payload: { ref: one.uid, shotType: st, ...stamp(1) }, ...credit({ type: 'save', shotType: st, playerId: gk?.id, playerName: gk?.name }) });
    }
    return out;
  }
  return null;
}

/** As the button: the end of regular time while level (with extra time to
 *  play) is a period end, not full time (IHF 2:2). */
function handballLast(s: hb.HandballState): boolean {
  const lastOfTotal = s.period >= hb.totalPeriods(s);
  const toExtra = lastOfTotal && hb.levelAtEnd(s) && s.etRounds < hb.maxEtRounds(s.decider);
  return lastOfTotal && !toExtra;
}

export function handballVoiceEnds(actions: ScoreAction[], state: unknown): VoiceEnding | null {
  const s = state as hb.HandballState | undefined;
  if (!s || !actions.some((a) => a.type === 'END_PERIOD')) return null;
  const score = `${s.home}-${s.away}`;
  return handballLast(s) ? { action: 'fullTime', score } : { action: 'endPeriod', period: hb.periodName(s, s.period), score };
}

/* ---------------------------------- carrom ---------------------------------- */

/** Carrom: "board home 5" / "Rao 3 queen" (the opponent's coins left, the
 *  Queen covered by the board winner), "… slam" (white / black from who
 *  broke), "penalty home" (3 to that side). Coins must be said — no default
 *  (as the buttons, SD-116). The board winner's player(s) are credited as
 *  the buttons do. */
export function carromVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const s = ctx.state as CarromState | undefined;
  if (!s || s.ended) return null;
  const q = withoutTeams(text, ctx);
  // the coins are numbers, not shirt numbers
  const { side, player } = resolveSide(text.replace(/\b\d+\b|\b(zero|nil|one|two|three|four|five|six|seven|eight|nine)\b/gi, ' '), ctx);
  if (!side) return null;
  const penalty = /\bpenalty\b|\bfoul\b/.test(q);
  // the coins: a number not part of a player's name / jersey
  const nums = numbersFromText(q.replace(/\bqueen\b/g, ''));
  const coins = nums.find((n) => n >= 0 && n <= 9);
  if (!penalty && coins == null) return null;
  const queen = !penalty && /\bqueen\b/.test(q) && !/\bno queen\b|\bwithout (the )?queen\b/.test(q);
  const breaker = nextBreaker(s);
  const slam = !penalty && /\bslam\b/.test(q)
    ? (/\bwhite\b/.test(q) ? 'white' : /\bblack\b/.test(q) ? 'black' : slamFor(side, breaker))
    : null;
  const perSide = s.perSide ?? 1;
  const roster = rosterOf(ctx, side);
  const players = creditedPlayers(roster, perSide, player ? [player.id] : []);
  const value = penalty ? PENALTY_POINTS : boardPoints(coins!, queen, s.current[side], s);
  const credit = Math.min(value, Math.max(0, s.target - s.current[side]));
  const attr = (p: Player) => ({ playerId: p.id, playerName: p.fullName, stat: 'points', by: credit, ...(penalty ? {} : { extra: { boards: 1, ...(queen ? { queens: 1 } : {}) } }) });
  return [{
    type: 'BOARD', side,
    payload: penalty ? { coins: 0, queen: false, penalty: true } : { coins, queen, ...(queen ? { queenBy: 'winner' } : {}), ...(slam ? { slam } : {}) },
    attribution: players[0] ? attr(players[0]) : undefined,
    attribution2: players[1] ? attr(players[1]) : undefined,
  }];
}

/** Carrom: a board that closes a game (or the match) asks first. */
export function carromVoiceEnds(actions: ScoreAction[], state: unknown): VoiceEnding | null {
  const s = state as CarromState | undefined;
  const a = actions.find((x) => x.type === 'BOARD');
  if (!s || !a || (a.side !== 'home' && a.side !== 'away')) return null;
  const p = a.payload ?? {};
  const c = boardCloses(s, a.side, Number(p.coins ?? 0), p.queen === true, p.penalty === true);
  if (!c) return null;
  return c.kind === 'match' ? { action: 'fullTime' } : { action: 'endPeriod', period: `game ${c.game}` };
}

/* ------------------------------ golf match play ------------------------------ */

/** Golf match play: "hole home" / "Rao wins the hole" / "halved". With
 *  handicap strokes set up, "strokes 4 5" (home first) or "Rao 4 Khan 5"
 *  enters each player's gross score and the hole goes to the better NET
 *  score, as on the screen. A hole that closes the match asks first (the
 *  shared panel checks the reducer). */
export function golfMatchVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const s = ctx.state as GolfMatchState | undefined;
  if (!s || s.ended) return null;
  const q = withoutTeams(text, ctx);
  const m = golfMatchStateOf(s);
  const here = s.strokes ? matchHole(s.strokes, m.played) : null;
  const nums = numbersFromText(q).filter((n) => n >= 1 && n <= 20);
  const p1 = (side: Side) => rosterOf(ctx, side)[0];
  if (here && nums.length >= 2) {
    // "Khan 5 Rao 4" — the side named first gets the first number
    const raw = deburr(text);
    const cut = raw.search(/\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/);
    const { side: first } = resolveSide(cut > 0 ? raw.slice(0, cut) : '', ctx);
    const [a, b] = nums;
    const strokes = first === 'away' ? { home: b, away: a } : { home: a, away: b };
    const winner = holeWinner(strokes.home, strokes.away, here.home, here.away);
    const credit = (who: Side) => {
      const pl = p1(who);
      if (!pl) return undefined;
      const key = scoreStatKey(strokes[who], here.hole.par);
      return winner === who
        ? { playerId: pl.id, playerName: pl.fullName, stat: 'holesWon', by: 1, extra: { [key]: 1 }, side: who }
        : { playerId: pl.id, playerName: pl.fullName, stat: key, by: 1, side: who };
    };
    return [{ type: 'HOLE', side: winner === 'halved' ? undefined : winner, payload: { winner, home: strokes.home, away: strokes.away }, attribution: credit('home'), attribution2: credit('away') }];
  }
  if (/\bhalved?\b|\bhalves\b|\bshared\b|\bhalf\b|\ball square\b/.test(q)) return [{ type: 'HOLE', payload: { winner: 'halved' } }];
  const { side } = resolveSide(text, ctx);
  if (!side || !/\bhole\b|\bwins?\b|\bwon\b/.test(q)) return null;
  const pl = p1(side);
  return [{ type: 'HOLE', side, payload: { winner: side }, attribution: pl ? { playerId: pl.id, playerName: pl.fullName, stat: 'holesWon', by: 1, side } : undefined }];
}

/* ------------------------------ kabaddi extras ------------------------------ */

/** Kabaddi cards and technical points by voice: "green / yellow card Rao",
 *  "technical point home". A red card stays on the button (it asks first and
 *  sets the technical point). */
export function kabaddiExtrasVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const q = withoutTeams(text, ctx);
  const { side, player } = resolveSide(text, ctx);
  if (!side) return null;
  if (/\btechnical\b|\btech point\b/.test(q)) return [{ type: 'TECH_POINT', side }];
  const card = /\bgreen\b/.test(q) ? 'green' : /\byellow\b/.test(q) ? 'yellow' : null;
  if (card && /\bcard\b|\bgreen\b|\byellow\b/.test(q)) {
    // as the button: a player carded while out serves it from his revival
    const st = ctx.state as KabaddiState | undefined;
    const wasOut = !!(player && st && outPlayers(st)[side]?.includes(player.fullName));
    return [{ type: 'CARD', side, payload: { card, ...(player ? { playerId: player.id, playerName: player.fullName } : { player: true }), ...(wasOut ? { wasOut: true } : {}) } }];
  }
  return null;
}

// Test/inspection hook (parity with the other __sportfolio* engines).
(globalThis as unknown as Record<string, unknown>).__sportfolioVoice = { pointVoice, basketballVoice, kabaddiVoice, cricketVoice, tennisVoice, volleyballVoice, hockeyVoice, handballVoice, carromVoice, golfMatchVoice };

/** Deterministic voice/typed-command parsers for the point-based sports. Each is
 *  a PURE function (phrase + context → actions | null), matching what the on-screen
 *  buttons dispatch. Kept offline & rule-based so a mis-heard word can't invent a
 *  score. Football ships its own richer, stateful grammar separately. */
import type { ScoreAction } from './types';
import type { VoiceContext } from './types';
import { deburr, resolveSide, attribution, sided, numberFromText } from './voiceMatch.ts';
import { previewRaid, type KabaddiState } from './kabaddi/engine.ts';
import { outcomeAction } from './volleyball/engine.ts';
import { creditAttribution, ftCredits, makeCredits, missCredits } from './basketball/credits.ts';

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
  const pid = player ? { pid: player.id } : {};
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
  return null;
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

// Test/inspection hook (parity with the other __sportfolio* engines).
(globalThis as unknown as Record<string, unknown>).__sportfolioVoice = { pointVoice, basketballVoice, kabaddiVoice, cricketVoice, tennisVoice, volleyballVoice };

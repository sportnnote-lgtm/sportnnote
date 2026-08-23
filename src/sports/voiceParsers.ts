/** Deterministic voice/typed-command parsers for the point-based sports. Each is
 *  a PURE function (phrase + context → actions | null), matching what the on-screen
 *  buttons dispatch. Kept offline & rule-based so a mis-heard word can't invent a
 *  score. Football ships its own richer, stateful grammar separately. */
import type { ScoreAction } from './types';
import type { VoiceContext } from './types';
import { deburr, resolveSide, attribution, numberFromText } from './voiceMatch';

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
 *  block/turnover/foul [player]". */
export function basketballVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const q = deburr(text);
  const { side, player } = resolveSide(text, ctx);
  if (!side) return null;
  if (/\brebound\b/.test(q)) return [{ type: 'REBOUND', side, attribution: attribution(player, 'rebounds') }];
  if (/\bassist\b/.test(q)) return [{ type: 'ASSIST', side, attribution: attribution(player, 'assists') }];
  if (/\bsteal\b|stole\b/.test(q)) return [{ type: 'STEAL', side, attribution: attribution(player, 'steals') }];
  if (/\bblock\b|blocked\b|swat/.test(q)) return [{ type: 'BLOCK', side, attribution: attribution(player, 'blocks') }];
  if (/\bturnover\b|turned over|lost the ball/.test(q)) return [{ type: 'TURNOVER', side, attribution: attribution(player, 'turnovers') }];
  if (/\bfoul\b/.test(q)) return [{ type: 'FOUL', side, payload: { foulType: 'personal' }, attribution: attribution(player, 'fouls') }];
  // A spoken free throw is a made free throw (say "miss" via the buttons).
  if (/\bfree ?throw\b|foul shot/.test(q))
    return [{ type: 'FREE_THROW', side, payload: { made: true }, attribution: player ? { playerId: player.id, stat: 'points', by: 1, playerName: player.fullName, extra: { freeThrowsMade: 1, freeThrowsAtt: 1 } } : undefined }];
  let pts: number | undefined;
  if (/\bthree\b|three ?pointer|from (downtown|deep)/.test(q)) pts = 3;
  else if (/\btwo\b|\bbasket\b|\bbucket\b|lay ?up|dunk|jumper|and one/.test(q)) pts = 2;
  else if (/\bone\b|one ?pointer/.test(q)) pts = 1; // 3×3 one-pointer (inside the arc)
  if (pts) return [{ type: 'SCORE', side, payload: { points: pts }, attribution: attribution(player, 'points', pts) }];
  return null;
}

/** Kabaddi: "raid [player]", "tackle [player]". */
export function kabaddiVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const q = deburr(text);
  const { side, player } = resolveSide(text, ctx);
  if (!side) return null;
  if (/\braid\b/.test(q)) return [{ type: 'RAID', side, attribution: attribution(player, 'raidPoints') }];
  if (/\btackle\b/.test(q)) return [{ type: 'TACKLE', side, attribution: attribution(player, 'tacklePoints') }];
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
  const runsOffText = n != null && n <= 6 ? n : undefined;

  // Extras (contain words that overlap runs — check first).
  if (/\bno ?ball\b/.test(q)) return [wrap('EXTRA', { kind: 'No ball', runs: runsOffText ?? 0 })];
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
    return [{ ...wrap('WICKET', { kind }), attribution: s.bowlerId && kind !== 'runout' ? { playerId: s.bowlerId, stat: 'wickets', by: 1, playerName: s.bowlerName } : undefined }];
  }

  // Runs — a run word or a bare 0-6.
  let r: number | undefined;
  if (/\bdot\b|no run|nothing|\bzero\b/.test(q)) r = 0;
  else if (/\bfour\b|\bboundary\b/.test(q)) r = 4;
  else if (/\bsix\b|\bmaximum\b/.test(q)) r = 6;
  else if (/\bsingle\b/.test(q)) r = 1;
  else if (/\bcouple\b|\bdouble\b/.test(q)) r = 2;
  else r = runsOffText;
  const runWord = /\b(dot|no run|nothing|zero|four|boundary|six|maximum|single|couple|double|run|runs|scored?)\b/.test(q);
  if (r != null && r >= 0 && r <= 6 && (runWord || /^\d$/.test(q.trim()))) return [{ ...wrap('RUNS', { runs: r }), attribution: s.strikerId ? { playerId: s.strikerId, stat: 'runs', by: r, playerName: s.strikerName } : undefined }];
  return null;
}

// Test/inspection hook (parity with the other __sportfolio* engines).
(globalThis as unknown as Record<string, unknown>).__sportfolioVoice = { pointVoice, basketballVoice, kabaddiVoice, cricketVoice };

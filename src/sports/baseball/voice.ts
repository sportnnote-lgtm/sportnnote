/** SD-144 — baseball / softball voice and typed calls. PURE: the same actions
 *  (and credits) the buttons dispatch, for the batter at the plate; null when
 *  unsure. The runners move the default way for the outcome (as the one-tap
 *  buttons do); anything else is fixed from the timeline.
 *   "ball" / "strike" / "strike swinging" / "foul"        → a pitch (ball four
 *        and strike three close the plate appearance by themselves)
 *   "single" "double" "triple" "home run" / "homer"     → a hit
 *   "walk" "intentional walk" "hit by pitch"            → on base
 *   "strikeout (looking)" "ground out 6 3" "fly out 8"  → outs (+ fielders)
 *   "line out" "sac fly" "sac bunt" "fielder's choice" "error 6" "double play 6 4 3"
 *   "stolen base" "caught stealing" "wild pitch" "passed ball" "balk"
 *  A called game ("end game") goes through the ConfirmSheet. */
import type { ScoreAction, VoiceContext, VoiceEnding } from '../types';
import { deburr, withoutTeams } from '../voiceMatch.ts';
import { buildPitch, buildPlay, buildRunner, defaultRunnerMoves, type BaseballState, type Outcome, type RunnerKind } from './engine.ts';

const OUTS: Outcome[] = ['GO', 'FO', 'LO', 'DP', 'SF', 'SH', 'FC'];
const DIGIT: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };

function fieldersOf(q: string): string | undefined {
  const ns = q.split(/[\s-]+/).map((w) => DIGIT[w] ?? w).filter((w) => /^[1-9]$/.test(w));
  return ns.length ? ns.join('-') : undefined;
}

function outcomeOf(q: string): Outcome | null {
  if (/\bhome ?run\b|\bhomer\b|\bgrand slam\b/.test(q)) return 'HR';
  if (/\bintentional\b/.test(q)) return 'IBB';
  if (/\bhit by (the )?pitch\b|\bhbp\b/.test(q)) return 'HBP';
  if (/\bdouble play\b|\bdp\b/.test(q)) return 'DP';
  if (/\bsac(rifice)? fly\b/.test(q)) return 'SF';
  if (/\bsac(rifice)? bunt\b|\bsac(rifice)?\b/.test(q)) return 'SH';
  if (/\bfielder'?s? choice\b|\bfc\b/.test(q)) return 'FC';
  if (/\berror\b|\be ?[1-9]\b/.test(q)) return 'E';
  if (/\bstrike ?out\b|\bstruck out\b|\bk\b|\bpunch ?out\b/.test(q)) return 'K';
  if (/\bwalk(ed|s)?\b|\bbase on balls\b/.test(q)) return 'BB';
  if (/\bsingle\b/.test(q)) return '1B';
  if (/\bdouble\b/.test(q)) return '2B';
  if (/\btriple\b/.test(q)) return '3B';
  if (/\bground ?(out|ball|er)\b/.test(q)) return 'GO';
  if (/\bline ?(out|drive)\b|\blined out\b/.test(q)) return 'LO';
  if (/\bfl(y|ied) ?out\b|\bpop ?(up|out|ped up)\b|\bfly ball\b|\bflied\b/.test(q)) return 'FO';
  return null;
}

function runnerOf(q: string): RunnerKind | null {
  if (/\bcaught stealing\b/.test(q)) return 'CS';
  if (/\bstole|\bsteal|\bstolen base\b/.test(q)) return 'SB';
  if (/\bwild pitch\b/.test(q)) return 'WP';
  if (/\bpassed ball\b/.test(q)) return 'PB';
  if (/\bbalk\b/.test(q)) return 'BK';
  if (/\bpick(ed)? ?off\b/.test(q)) return 'PO';
  return null;
}

export function baseballVoice(text: string, ctx: VoiceContext): ScoreAction[] | null {
  const s = ctx.state as BaseballState | undefined;
  if (!s?.g || s.g.ended) return null;
  const q = deburr(withoutTeams(text, ctx));
  if (/\b(end|call(ed)?) (the )?game\b|\bgame (is )?called\b/.test(q)) return [{ type: 'END', payload: { reason: 'called' } }];
  const rk = runnerOf(q);
  if (rk) {
    const moves = defaultRunnerMoves(s, rk);
    return moves.length ? [buildRunner(s, rk, moves)] : null;
  }
  const o = outcomeOf(q);
  if (o) {
    if ((o === 'SF' || o === 'SH' || o === 'DP') && s.g.outs >= 2) return null;
    const fielders = o === 'E' ? (/\be ?([1-9])\b/.exec(q)?.[1] ?? fieldersOf(q.replace(/\berror\b/, ''))?.split('-')[0]) : OUTS.includes(o) ? fieldersOf(q) : undefined;
    const pitch = o === 'K' ? (/\blooking\b|\bcalled\b/.test(q) ? 'called' : 'swinging') : undefined;
    return [buildPlay(s, o, { ...(fielders ? { fielders: o === 'E' ? `E${fielders}` : fielders } : {}), ...(pitch ? { pitch } : {}) })];
  }
  if (!s.cfg.pitches) return null;
  if (/\bfoul\b/.test(q)) return [buildPitch(s, 'foul')];
  if (/\bball\b/.test(q)) return [buildPitch(s, 'ball')];
  if (/\bstrike\b/.test(q)) return [buildPitch(s, /\bswing(ing)?\b|\bswung\b|\bmiss(ed)?\b/.test(q) ? 'swinging' : 'called')];
  return null;
}

/** Only a called game is an ending the sheet asks about; a play that ends
 *  the game (a walk-off, the 27th out) is caught by the shared panel. */
export function baseballVoiceEnds(actions: ScoreAction[], state: unknown): VoiceEnding | null {
  const s = state as BaseballState | undefined;
  if (!s?.g || !actions.some((a) => a.type === 'END')) return null;
  return { action: 'fullTime', score: `${s.g.score.home}-${s.g.score.away}`, detail: 'The game is called at this score.' };
}

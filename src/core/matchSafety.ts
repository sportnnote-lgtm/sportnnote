/**
 * SD-106 — Match safety. Which match-level controls a scorer sees, WHERE on the
 * scoring screen they sit, and the "Are you sure?" copy each one asks with.
 *
 * Founder report 2026-10-11: a tennis scorer saw "Restart match" and "End match"
 * right under the scorecard and could have tapped one by mistake. The rule now:
 *  - match-level destructive controls (end early, restart, reset, delete) live
 *    in a separate "Match controls" section at the very BOTTOM of the Scoring
 *    tab (reset/delete stay in the Info tab's Danger zone, also at the bottom);
 *  - the sport's own end-of-period / full-time buttons stay at the end of that
 *    sport's controls (scorers need them in the flow);
 *  - every one of them asks first in a ConfirmSheet: a red "Yes, …" and a safe
 *    "No, keep scoring" — even cancelling a start with nothing scored (audit G2),
 *    a walkover (G3, names the winner) and discarding unsynced taps (G5).
 *
 * Pure (no React Native) so tests/match-safety.test.mts can run it.
 */
import type { SportId } from './types';

export type MatchAction =
  | 'endMatch' // End match… early / by hand (parity #04 manual result)
  | 'restartMatch' // ↺ Restart — scored by mistake, first 5 min only
  | 'cancelStart' // ↺ Not started? Cancel — nothing scored yet
  | 'resetFixture' // Danger zone (parity #13): tournament fixture back to not started
  | 'deleteMatch' // Danger zone (parity #13): friendly deleted
  | 'fullTime' // the sport's own natural end (End Match / Full time / End match)
  | 'endTie' // "End as a draw / tie" when the scores are level
  | 'endPeriod' // End 1st half / quarter / period → (normal flow)
  | 'endInnings' // cricket: end the 1st innings
  | 'finishRound' // golf: finish the round
  | 'finishEvent' // athletics / swimming: finish & lock results
  | 'closePhase' // athletics / swimming: close a round and seed the next
  | 'walkover' // 🏳 Walkover to a named side (End panel / Info tab)
  | 'discardTaps' // discard this device's unsynced, rejected taps
  | 'removeEvent' // SD-114: ✕ on one "Correct the timeline" row
  | 'recordResult' // SD-116: chess ✓ Record result (the game closes)
  | 'concede' // SD-116: golf match play — one side concedes the match
  | 'pickUp' // SD-116: golf stroke play — a pick-up is a no return (NR)
  | 'clearHole' // SD-116: golf — wipe one hole's score
  | 'eject'; // SD-116: basketball 🟥 Eject a player

/** where on screen a control sits */
export type ControlZone =
  /** the "Match controls" section — the very end of the Scoring tab, below every scoring control */
  | 'bottom'
  /** the Info tab's Danger zone — the very end of the Info tab */
  | 'infoBottom'
  /** the end of the sport's own controls (period flow / natural end) */
  | 'flow';

export interface MatchControl {
  action: MatchAction;
  zone: ControlZone;
  /** asks with a ConfirmSheet before acting */
  confirm: boolean;
}

export interface MatchControlState {
  started: boolean;
  complete: boolean;
  eventCount: number;
  /** inside the restart window (nothing scored, or first 5 min of scoring) */
  canRestart: boolean;
  /** ended early on this device already (no more controls) */
  retired?: boolean;
  /** #13 delete windows (deleteVerdict) */
  dangerVerdict?: 'delete' | 'reset' | 'none';
  /** a saved match (not a local demo scratch match) */
  hasMatch?: boolean;
}

export interface MatchControlPerms {
  canScore: boolean;
  isHost: boolean;
}

/** The sport's own in-flow end controls (rendered by the plugin at the end of
 *  its controls). Racket / net / board sports end themselves when the last
 *  point is won — they only have the screen's "End match…" for ending early. */
export const FLOW_CONTROLS: Partial<Record<SportId, MatchAction[]>> = {
  football: ['endPeriod', 'fullTime'],
  cricket: ['endInnings', 'fullTime', 'endTie'],
  basketball: ['endPeriod', 'fullTime', 'endTie'],
  kabaddi: ['endPeriod', 'fullTime', 'endTie'],
  hockey: ['endPeriod', 'fullTime'],
};

/** Field / timed events run on their own screens; their finish lives at the
 *  bottom of the results sheet. */
export const EVENT_CONTROLS: Partial<Record<SportId, MatchAction[]>> = {
  golf: ['finishRound'],
  athletics: ['closePhase', 'finishEvent'],
  swimming: ['closePhase', 'finishEvent'],
};

/** Every control a scorer / host sees on a match's screen, in display order. */
export function matchControls(sport: SportId, s: MatchControlState, p: MatchControlPerms): MatchControl[] {
  const out: MatchControl[] = [];
  const event = EVENT_CONTROLS[sport];
  if (event) {
    if (!s.complete && (p.canScore || p.isHost)) for (const action of event) out.push({ action, zone: 'bottom', confirm: true });
    return out;
  }
  const live = s.started && !s.complete && !s.retired;
  if (live && p.canScore) for (const action of FLOW_CONTROLS[sport] ?? []) out.push({ action, zone: 'flow', confirm: true });
  if (live && p.canScore && s.canRestart) {
    out.push(s.eventCount === 0
      ? { action: 'cancelStart', zone: 'bottom', confirm: true }
      : { action: 'restartMatch', zone: 'bottom', confirm: true });
  }
  if (live && (p.canScore || p.isHost)) out.push({ action: 'endMatch', zone: 'bottom', confirm: true });
  if ((s.hasMatch ?? true) && p.isHost && s.dangerVerdict && s.dangerVerdict !== 'none') {
    out.push({ action: s.dangerVerdict === 'delete' ? 'deleteMatch' : 'resetFixture', zone: 'infoBottom', confirm: true });
  }
  return out;
}

/** does this state show `action`? */
export const showsControl = (list: MatchControl[], action: MatchAction): boolean => list.some((c) => c.action === action);

/* ------------------------------ confirm copy ------------------------------ */

export type ConfirmTone = 'danger' | 'caution';

export interface ConfirmCopy {
  title: string;
  /** one line: what happens on YES */
  message: string;
  /** the destructive button, with the action word ("Yes, end match") */
  yesLabel: string;
  /** the safe button ("No, keep scoring") — the default */
  noLabel: string;
  /** danger = red YES (match-level); caution = amber YES (period-level) */
  tone: ConfirmTone;
}

export interface ConfirmContext {
  /** the score / result as it will be saved ("6-4, 3-2" / "2-1") */
  score?: string;
  /** "1st half", "Q2", "3rd period" */
  period?: string;
  /** "Draw" / "Tie" */
  drawWord?: string;
  /** walkover: the side that takes the win */
  winner?: string;
  /** discardTaps: how many taps */
  count?: number;
  /** a sport- or screen-specific one-liner that replaces the default message */
  detail?: string;
  /** removeEvent: the row being removed ("Goal — Rahul (23′)");
   *  recordResult: the result line ("1-0: Anand beat Carlsen by Resignation");
   *  concede / pickUp / clearHole / eject: the player or side */
  what?: string;
}

const KEEP = 'No, keep scoring';

export function confirmCopy(action: MatchAction, ctx: ConfirmContext = {}): ConfirmCopy {
  const sc = ctx.score?.trim();
  switch (action) {
    case 'endMatch':
      return { title: 'End this match?', message: ctx.detail ?? (sc ? `${sc} will be saved and the match closes.` : 'The result will be saved and the match closes.'), yesLabel: 'Yes, end match', noLabel: KEEP, tone: 'danger' };
    case 'fullTime':
      return { title: 'End this match?', message: ctx.detail ?? (sc ? `Final score ${sc} will be saved and the match closes.` : 'The final score will be saved and the match closes.'), yesLabel: 'Yes, end match', noLabel: KEEP, tone: 'danger' };
    case 'endTie': {
      const w = (ctx.drawWord ?? 'Draw').toLowerCase();
      return { title: `End as a ${w}?`, message: ctx.detail ?? (sc ? `The match closes level at ${sc} — a ${w}.` : `The match closes level — a ${w}.`), yesLabel: `Yes, end as a ${w}`, noLabel: KEEP, tone: 'danger' };
    }
    case 'restartMatch':
      return { title: 'Restart this match?', message: ctx.detail ?? 'All points will be cleared and the match goes back to not started. This can’t be undone.', yesLabel: 'Yes, restart match', noLabel: KEEP, tone: 'danger' };
    case 'cancelStart':
      return { title: 'Cancel the start?', message: 'Nothing has been scored yet — the match goes back to not started.', yesLabel: 'Yes, cancel start', noLabel: 'No, keep the match on', tone: 'caution' };
    case 'walkover': {
      const w = ctx.winner ?? 'this side';
      return { title: `Walkover to ${w}?`, message: ctx.detail ?? `${w} is awarded the win without a score and the match closes.`, yesLabel: `Yes, walkover to ${w}`, noLabel: 'No, go back', tone: 'danger' };
    }
    case 'discardTaps': {
      const n = ctx.count ?? 0;
      return { title: 'Discard unsynced taps?', message: n === 1 ? 'This 1 tap will be lost.' : `These ${n} taps will be lost.`, yesLabel: 'Yes, discard', noLabel: 'No, keep them', tone: 'danger' };
    }
    case 'resetFixture':
      return { title: 'Reset this fixture?', message: ctx.detail ?? 'The score, player stats, result and POTM are cleared for everyone; it goes back to not started.', yesLabel: 'Yes, reset fixture', noLabel: 'No, keep it', tone: 'danger' };
    case 'deleteMatch':
      return { title: 'Delete this match?', message: ctx.detail ?? 'The score, its player stats and any table result go for everyone.', yesLabel: 'Yes, delete match', noLabel: 'No, keep it', tone: 'danger' };
    case 'endPeriod': {
      const pd = ctx.period ?? 'period';
      return { title: `End the ${pd}?`, message: ctx.detail ?? (sc ? `The ${pd} closes at ${sc}. Undo can bring it back.` : `The ${pd} closes. Undo can bring it back.`), yesLabel: `Yes, end ${pd}`, noLabel: 'No, keep playing', tone: 'caution' };
    }
    case 'endInnings':
      return { title: 'End this innings?', message: ctx.detail ?? (sc ? `The innings closes at ${sc}.` : 'The innings closes.'), yesLabel: 'Yes, end innings', noLabel: KEEP, tone: 'caution' };
    case 'finishRound':
      return { title: 'Finish the round?', message: ctx.detail ?? 'Scores are locked and stats go to each player’s profile.', yesLabel: 'Yes, finish round', noLabel: KEEP, tone: 'danger' };
    case 'finishEvent':
      return { title: 'Finish and lock the results?', message: ctx.detail ?? 'Places, medals and any new record are final.', yesLabel: 'Yes, finish & lock', noLabel: 'No, keep entering', tone: 'danger' };
    case 'removeEvent':
      return { title: ctx.what ? `Remove ${ctx.what}?` : 'Remove this from the timeline?', message: ctx.detail ?? 'It comes off the timeline and the score and player stats re-adjust.', yesLabel: 'Yes, remove', noLabel: 'No, keep it', tone: 'danger' };
    case 'recordResult':
      return { title: ctx.what ? `Record ${ctx.what}?` : 'Record this result?', message: ctx.detail ?? 'The game closes, the result goes to the standings and followers are told. Only a host can correct it after.', yesLabel: 'Yes, record result', noLabel: 'No, go back', tone: 'danger' };
    case 'concede': {
      const w = ctx.what ?? 'This side';
      return { title: `${w} concedes the match?`, message: ctx.detail ?? (ctx.winner ? `${ctx.winner} wins the match and it closes.` : 'The other side wins the match and it closes.'), yesLabel: 'Yes, concede match', noLabel: KEEP, tone: 'danger' };
    }
    case 'pickUp':
      return { title: ctx.what ? `Pick up for ${ctx.what}?` : 'Pick up on this hole?', message: ctx.detail ?? 'Pick up = no return (NR) for the round in stroke play: the card won’t get a total or a place.', yesLabel: 'Yes, pick up (NR)', noLabel: KEEP, tone: 'danger' };
    case 'clearHole':
      return { title: ctx.what ? `Clear ${ctx.what}?` : 'Clear this hole?', message: ctx.detail ?? 'The hole goes back to no score.', yesLabel: 'Yes, clear hole', noLabel: 'No, keep it', tone: 'caution' };
    case 'eject':
      return { title: ctx.what ? `Eject ${ctx.what}?` : 'Eject this player?', message: ctx.detail ?? 'The player is disqualified and can’t come back on. Undo can bring it back.', yesLabel: 'Yes, eject', noLabel: 'No, go back', tone: 'danger' };
    case 'closePhase':
      return { title: 'Close this round?', message: ctx.detail ?? 'The qualifiers are seeded into the next round and these results are locked.', yesLabel: 'Yes, close & seed', noLabel: 'No, keep entering', tone: 'caution' };
  }
}

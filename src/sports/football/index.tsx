/**
 * Football plugin — archetype: goal/time.
 *
 * Captures the full set of in-game events an organizer logs live: goals (with
 * scorer + assist), yellow/red cards, substitutions and own goals — each
 * attributed to a player and stamped with the match minute. A running clock and
 * an event timeline render on the live page (LiveExtras), visible to everyone.
 *
 * Clean sheets are NOT a live action: they're awarded automatically at full
 * time to the GK/defenders (from the lineup) of whichever side conceded zero.
 *
 * The reducer is pure, so it can't read the clock — the controls compute the
 * current minute (via `currentMinute`) and pass it in `payload.minute`.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, TextField } from '../../components/ui';
import { Pitch } from './Pitch';
import { LineupView } from './LineupView';
import { Timeline } from './Timeline';
import { DEFENSIVE_POSITIONS, emptyFormation } from './formation';
import { useSpeech } from '../../core/speech';
import { normalizeCommand as llmNormalize, enabled as llmEnabled } from '../../core/voiceLLM';
import { parseIntent, parseGoalType, matchPlayer, matchTeam, isNoAssist, isYes, isNo, deburr } from './voiceCommands';
import type { FootballEvent, GoalType, BodyPart } from './events';
import { type StatEvent, type StatKind, STAT_META, EVENT_META, GOAL_TYPE_LABEL, BODY_PART_LABEL } from './events';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';

/** How a level result at full time is settled. */
import {
  type Decider, type FootballState, type TrackConfig, type TeamStatTotals, type PlayerStatLine,
  init, reducer, decideShootout, penScore, HALF_NAME, currentMinute, halfBase, startOffset,
  clockLabel, clockTime, possessionPct, cardCount, footballStats,
} from "./engine";

/* ------------------------------- Controls ---------------------------------- */

/** A tappable player list shown as a table — jersey number, name, position —
 *  so picking who did something while scoring live is fast and unambiguous. */
const PlayerTable = ({
  players,
  onPick,
  selectedId,
}: {
  players: Player[];
  onPick: (p: Player) => void;
  selectedId?: string;
}) => (
  <View style={ctrl.table}>
    {players.length === 0 ? (
      <Text style={ctrl.meta}>No players on the field.</Text>
    ) : (
      players.map((p) => (
        <TouchableOpacity accessibilityRole="button"
          key={p.id}
          style={[ctrl.prow, p.id === selectedId && ctrl.prowSel]}
          activeOpacity={0.7}
          onPress={() => onPick(p)}
        >
          <View style={ctrl.jersey}><Text style={ctrl.jerseyTxt}>{p.jerseyNo ?? '–'}</Text></View>
          <Text style={ctrl.pname} numberOfLines={1}>{p.fullName}</Text>
          {p.sportDetails?.football?.position ? <Text style={ctrl.ppos}>{p.sportDetails.football.position}</Text> : null}
        </TouchableOpacity>
      ))
    )}
  </View>
);

// How a goal was WON (its body part is a separate choice — see BodyPart).
const GOAL_TYPES: GoalType[] = ['open', 'penalty', 'freekick'];
const BODY_PARTS: BodyPart[] = ['left', 'right', 'head', 'chest'];

/** Flow state for the multi-step capture (goal, foul, or a generic stat/card). */
type Flow =
  | { mode: 'goal'; side: 'home' | 'away'; step: 'scorer' }
  | { mode: 'goal'; side: 'home' | 'away'; step: 'og' }
  | { mode: 'goal'; side: 'home' | 'away'; step: 'type'; scorer: Player } // voice path only
  | { mode: 'goal'; side: 'home' | 'away'; step: 'body'; scorer: Player; goalType: GoalType } // voice path only
  // Consolidated fast panel: open-play is the default; type/header & assist are
  // optional. `logged` = the goal is already on the board (voice path); otherwise
  // it's recorded when the scorer finishes (picks an assister or "no assist").
  | { mode: 'goal'; side: 'home' | 'away'; step: 'assist'; scorer: Player; goalType?: GoalType; bodyPart?: BodyPart; logged?: boolean }
  | { mode: 'foul'; step: 'team' }
  | { mode: 'foul'; step: 'by'; side: 'home' | 'away' }
  | { mode: 'foul'; step: 'victim'; side: 'home' | 'away'; fouler: Player }
  | { mode: 'stat'; kind: StatKind | 'card'; step: 'team' }
  | { mode: 'stat'; kind: StatKind | 'card'; step: 'player'; side: 'home' | 'away' }
  | { mode: 'stat'; kind: StatKind | 'card'; step: 'detail'; side: 'home' | 'away'; player: Player }
  // A shot on target branches into its outcome (saved / blocked / goal).
  | { mode: 'stat'; kind: 'shot'; step: 'outcome'; side: 'home' | 'away'; player: Player }
  | { mode: 'stat'; kind: 'shot'; step: 'blocker'; side: 'home' | 'away'; player: Player }
  // Penalty: won by → taken by → scored / saved / missed.
  | { mode: 'pen'; step: 'team' }
  | { mode: 'pen'; step: 'wonBy'; side: 'home' | 'away' }
  | { mode: 'pen'; step: 'takenBy'; side: 'home' | 'away'; wonBy?: Player }
  | { mode: 'pen'; step: 'outcome'; side: 'home' | 'away'; taker: Player; wonBy?: Player };

const ScoringControls: SportPlugin<FootballState>['ScoringControls'] = ({
  state,
  dispatch,
  homeName,
  awayName,
  homeColor,
  awayColor,
  homeRoster = [],
  awayRoster = [],
  homeLineup = [],
  awayLineup = [],
}) => {
  // Team kit colours for the home/away controls (fall back to the app's accents).
  const hc = homeColor ?? theme.colors.home;
  const ac = awayColor ?? theme.colors.away;
  const [sub, setSub] = useState<{ side: 'home' | 'away'; off?: Player } | null>(null);
  // Multi-step capture: tap an action → pick the player(s) from a jersey+name
  // table → any follow-up (goal type, assist, on/off target). One tap per step.
  const [flow, setFlow] = useState<Flow | null>(null);
  // Joining a game already in progress: the minute to kick the clock off at.
  const [koMin, setKoMin] = useState('');
  // Backfill mode: when set, everything logged is stamped at this past minute
  // (so the scorer can catch up on events that happened before they started).
  const [backfillMin, setBackfillMin] = useState<number | null>(null);
  const [backfillText, setBackfillText] = useState('');
  // Show the "correct the timeline" editor (remove/edit a specific past moment).
  const [showEdit, setShowEdit] = useState(false);
  // Editing a past moment: re-entered events are stamped at this original minute
  // (auto-clears when the re-entry flow closes).
  const [editMin, setEditMin] = useState<number | null>(null);
  // Scorer-adjustable extra-time half length (knockout ties).
  const [etMins, setEtMins] = useState(state.etMinutes);
  const opp = (side: 'home' | 'away') => (side === 'home' ? 'away' : 'home');
  // Re-render every few seconds so time-based prompts (added time) keep up.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!state.startedAt || state.ended) return;
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [state.startedAt, state.ended]);

  // Stamp every event with the live minute — or, when backfilling / editing a past
  // moment, that past minute — plus the half it belongs to (a past minute derives
  // its half; live events use the current half).
  const pastMin = editMin ?? backfillMin;
  const fire = (action: ScoreAction) => {
    const hm = state.halfMinutes, et = state.etMinutes;
    const halfFromMin = (m: number): 1 | 2 | 3 | 4 => (m < hm ? 1 : m < 2 * hm ? 2 : m < 2 * hm + et ? 3 : 4);
    const half = pastMin != null ? halfFromMin(pastMin) : state.half;
    dispatch({ ...action, payload: { ...action.payload, minute: pastMin ?? currentMinute(state), half } });
  };

  // When a re-entry flow finishes (or is cancelled), stop stamping at the edited minute.
  useEffect(() => {
    if (flow === null && editMin != null) setEditMin(null);
  }, [flow]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = state.track;
  // The player-attributed stat keys being tracked this match — stamped on each
  // stat line so a profile can show "this total spans N of M games".
  const trackedKeys = (): string[] => {
    const keys = ['goals', 'openPlayGoals', 'penaltyGoals', 'freekickGoals', 'assists', 'yellowCards', 'redCards', 'cleanSheets'];
    if (t.shots) keys.push('shots', 'shotsOnTarget');
    if (t.fouls) keys.push('fouls');
    if (t.tackles) keys.push('tackles');
    if (t.interceptions) keys.push('interceptions');
    if (t.saves) keys.push('saves');
    if (t.passes) keys.push('passes', 'passesComplete');
    if (t.attackContribution) keys.push('attackingContributions');
    if (t.defenceContribution) keys.push('defensiveContributions');
    return keys;
  };

  const attr = (side: 'home' | 'away', type: string, stat: string, p: Player, extra?: Record<string, number>) =>
    fire({ type, side, attribution: { playerId: p.id, stat, playerName: p.fullName, extra, tracked: trackedKeys() } });

  // Record a card. A player's second yellow is also a red (sending off), flagged
  // so it shows as a red badge with a "2".
  const recordCard = (side: 'home' | 'away', color: 'yellow' | 'red', p: Player) => {
    if (color === 'red') { attr(side, 'RED', 'redCards', p); return; }
    const secondYellow = state.events.some((e) => e.type === 'yellow' && e.playerName === p.fullName);
    attr(side, 'YELLOW', 'yellowCards', p);
    if (secondYellow) {
      fire({ type: 'RED', side, payload: { secondYellow: true }, attribution: { playerId: p.id, stat: 'redCards', playerName: p.fullName, tracked: trackedKeys() } });
    }
  };

  // Which side the ball goes to after each kind of action.
  const handover = (kind: StatKind, side: 'home' | 'away'): 'home' | 'away' | undefined => {
    if (kind === 'foul' || kind === 'offside' || kind === 'handball') return side === 'home' ? 'away' : 'home';
    if (kind === 'tackle' || kind === 'interception' || kind === 'save' || kind === 'corner' || kind === 'defenceContribution') return side;
    return undefined; // shot / pass / cross / dribble / attacking play — possession unchanged
  };
  const STAT_KEY: Partial<Record<StatKind, string>> = { shot: 'shots', foul: 'fouls', offside: 'offsides', tackle: 'tackles', interception: 'interceptions', save: 'saves', pass: 'passes', cross: 'crosses', dribble: 'dribbles', handball: 'handballs', attackContribution: 'attackingContributions', defenceContribution: 'defensiveContributions', penaltyWon: 'penaltiesWon', penaltyMissed: 'penaltiesMissed' };
  const recordStat = (kind: StatKind, side: 'home' | 'away', player?: Player, detail?: { onTarget?: boolean; complete?: boolean }) => {
    const statKey = STAT_KEY[kind];
    // a shot on target also bumps shotsOnTarget; a completed pass bumps passesComplete
    const extra: Record<string, number> | undefined =
      kind === 'shot' && detail?.onTarget ? { shotsOnTarget: 1 }
      : kind === 'pass' && detail?.complete ? { passesComplete: 1 }
      : undefined;
    fire({
      type: 'STAT', side,
      payload: { kind, possSide: handover(kind, side), at: Date.now(), ...detail, playerName: player?.fullName },
      attribution: player && statKey ? { playerId: player.id, stat: statKey, playerName: player.fullName, extra, tracked: trackedKeys() } : undefined,
    });
    setFlow(null);
  };
  const setPossession = (side: 'home' | 'away') => dispatch({ type: 'POSSESSION', payload: { side, at: Date.now() } });
  const playerNeeded = (kind: StatKind | 'card') => kind !== 'corner';
  const detailNeeded = (kind: StatKind | 'card') => kind === 'shot' || kind === 'pass' || kind === 'card';

  const rosterOf = (side: 'home' | 'away') => (side === 'home' ? homeRoster : awayRoster);
  const lineupOf = (side: 'home' | 'away') => (side === 'home' ? homeLineup : awayLineup);

  // The 11 currently on the pitch: the starting XI from the lineup, with each
  // substitution applied. Falls back to the full squad if no lineup is set.
  const xi = (side: 'home' | 'away'): Player[] => {
    const roster = rosterOf(side);
    const byId = new Map(roster.map((p) => [p.id, p]));
    const byName = new Map(roster.map((p) => [p.fullName, p]));
    let names = lineupOf(side)
      .filter((sl) => sl.playerId)
      .map((sl) => byId.get(sl.playerId!)?.fullName ?? sl.playerName)
      .filter((n): n is string => !!n);
    if (names.length === 0) return roster;
    for (const e of state.events) {
      if (e.type === 'sub' && e.side === side && e.playerName && e.secondName) {
        names = names.map((n) => (n === e.playerName ? e.secondName! : n));
      }
    }
    const off = sentOff(side);
    return names
      .filter((n) => !off.has(n))
      .map((n) => byName.get(n))
      .filter((p): p is Player => !!p);
  };
  // Players shown a red card — off the pitch for good (can't score, can't be
  // subbed on; a sending-off leaves the side a player down).
  const sentOff = (side: 'home' | 'away'): Set<string> => {
    const names = new Set<string>();
    for (const e of state.events) if (e.type === 'red' && e.side === side && e.playerName) names.add(e.playerName);
    return names;
  };
  // The bench = squad members not currently on the pitch (and, for fixed subs,
  // not already withdrawn), never a player who's been sent off.
  const benchOf = (side: 'home' | 'away'): Player[] => {
    const onIds = new Set(xi(side).map((p) => p.id));
    const off = sentOff(side);
    return rosterOf(side)
      .filter((p) => !onIds.has(p.id))
      .filter((p) => !off.has(p.fullName))
      .filter((p) => state.subType !== 'fixed' || !state.subbedOff[side].includes(p.fullName));
  };

  // Each goal credits the total (`goals`) and a type-specific tally so a profile
  // shows the open-play / penalty / free-kick split alongside the total.
  const GOAL_STAT: Record<GoalType, string> = { open: 'openPlayGoals', header: 'openPlayGoals', penalty: 'penaltyGoals', freekick: 'freekickGoals' };
  // The team's current goalkeeper (the GK in the on-field XI) — saves default to
  // them, so the scorer doesn't pick a player for every save.
  const gkOf = (side: 'home' | 'away'): Player | undefined => {
    const gkSlot = lineupOf(side).find((sl) => sl.position === 'GK' && sl.playerId);
    const onField = xi(side);
    return (gkSlot && onField.find((p) => p.id === gkSlot.playerId))
      ?? onField.find((p) => p.sportDetails?.football?.position === 'GK');
  };

  const recordGoal = (side: 'home' | 'away', scorer: Player, goalType: GoalType, bodyPart?: BodyPart) =>
    fire({ type: 'GOAL', side, payload: { goalType, bodyPart }, attribution: { playerId: scorer.id, stat: 'goals', playerName: scorer.fullName, extra: { shots: 1, shotsOnTarget: 1, [GOAL_STAT[goalType]]: 1 }, tracked: trackedKeys() } });
  const recordOwnGoal = (side: 'home' | 'away', scorer: Player) => {
    fire({ type: 'OWN_GOAL', side, payload: { scorerName: scorer.fullName } });
    setFlow(null);
  };
  // Team goal — no named scorer. Keeps the scoreline correct for a friendly whose
  // players aren't on the app yet; who scored can be filled in later via the
  // timeline editor once they register.
  const recordTeamGoal = (side: 'home' | 'away') => {
    fire({ type: 'GOAL', side, payload: { goalType: 'open' } });
    setFlow(null);
  };
  const recordAssist = (side: 'home' | 'away', p: Player | null) => {
    if (p) attr(side, 'ASSIST', 'assists', p);
    setFlow(null);
  };

  // ----- Correct the timeline: remove one specific past moment (not undo-all) -----
  // The negative attribution reverses that action's stat line; the reducer reverses
  // its score/subs effect. Both are logged, so the correction replays cleanly.
  const rosterId = (nm?: string) => [...homeRoster, ...awayRoster].find((p) => p.fullName === nm)?.id;
  const removeEvent = (ev: FootballEvent) => {
    const pid = rosterId(ev.playerName);
    let attribution: ScoreAction['attribution'];
    if (ev.type === 'goal' && pid) attribution = { playerId: pid, stat: 'goals', by: -1, playerName: ev.playerName, extra: { shots: -1, shotsOnTarget: -1, [GOAL_STAT[ev.goalType ?? 'open']]: -1 } };
    else if (ev.type === 'yellow' && pid) attribution = { playerId: pid, stat: 'yellowCards', by: -1, playerName: ev.playerName };
    else if (ev.type === 'red' && pid) attribution = { playerId: pid, stat: 'redCards', by: -1, playerName: ev.playerName };
    dispatch({ type: 'REMOVE_EVENT', payload: { id: ev.id, target: 'event' }, attribution });
    // A goal's assist is a separate log entry keyed to the goal's `secondName` —
    // reverse the assister's tally too so an edit/remove leaves no phantom assist.
    if (ev.type === 'goal' && ev.secondName) {
      const aid = rosterId(ev.secondName);
      if (aid) dispatch({ type: 'REMOVE_EVENT', payload: { id: -1, target: 'stat' }, attribution: { playerId: aid, stat: 'assists', by: -1, playerName: ev.secondName } });
    }
  };
  const removeStat = (st: StatEvent) => {
    const key = STAT_KEY[st.kind];
    const extra: Record<string, number> | undefined =
      st.kind === 'shot' && st.onTarget ? { shotsOnTarget: -1 } : st.kind === 'pass' && st.complete ? { passesComplete: -1 } : undefined;
    const attribution = st.playerId && key ? { playerId: st.playerId, stat: key, by: -1, playerName: st.playerName, extra } : undefined;
    dispatch({ type: 'REMOVE_EVENT', payload: { id: st.id, target: 'stat' }, attribution });
  };
  // Edit a moment in place = remove the old one, then re-enter it through its normal
  // flow stamped at the SAME minute (so all match/profile stats re-adjust to match).
  const editEvent = (ev: FootballEvent) => {
    removeEvent(ev);
    setEditMin(ev.minute);
    setShowEdit(false);
    if (ev.type === 'goal') setFlow({ mode: 'goal', side: ev.side, step: 'scorer' });
    else if (ev.type === 'owngoal') setFlow({ mode: 'goal', side: ev.side, step: 'og' });
    else if (ev.type === 'yellow' || ev.type === 'red') setFlow({ mode: 'stat', kind: 'card', step: 'player', side: ev.side });
    else if (ev.type === 'sub') setSub({ side: ev.side });
  };
  const editStat = (st: StatEvent) => {
    removeStat(st);
    setEditMin(st.minute);
    setShowEdit(false);
    if (st.kind === 'foul') setFlow({ mode: 'foul', step: 'by', side: st.side });
    else if (playerNeeded(st.kind)) setFlow({ mode: 'stat', kind: st.kind, step: 'player', side: st.side });
    else setFlow({ mode: 'stat', kind: st.kind, step: 'team' });
  };
  const recordFoul = (side: 'home' | 'away', fouler: Player, victim: Player) => {
    fire({
      type: 'STAT', side,
      payload: { kind: 'foul', possSide: opp(side), at: Date.now(), playerName: fouler.fullName, secondName: victim.fullName },
      attribution: { playerId: fouler.id, stat: 'fouls', playerName: fouler.fullName, tracked: trackedKeys() },
    });
    setFlow(null);
  };

  // Penalty in open play: credit who won it, then the outcome — a scored goal, or
  // a miss (with the opponent GK's save when saved). Each is its own timeline row.
  const finishPenalty = (side: 'home' | 'away', outcome: 'scored' | 'saved' | 'missed', taker: Player, wonBy?: Player) => {
    if (wonBy) recordStat('penaltyWon', side, wonBy);
    if (outcome === 'scored') {
      recordGoal(side, taker, 'penalty');
    } else {
      recordStat('penaltyMissed', side, taker);
      if (outcome === 'saved') { const gk = gkOf(opp(side)); if (gk) recordStat('save', opp(side), gk); }
    }
    setFlow(null);
  };

  const endMatch = () => {
    const award = (side: 'home' | 'away', lineup: typeof homeLineup) =>
      lineup
        .filter((s) => s.playerId && DEFENSIVE_POSITIONS.has(s.position))
        .forEach((s) =>
          dispatch({ type: 'CLEAN_SHEET', side, attribution: { playerId: s.playerId!, stat: 'cleanSheets', playerName: s.playerName } })
        );
    if (state.away === 0) award('home', homeLineup);
    if (state.home === 0) award('away', awayLineup);
    dispatch({ type: 'END' });
  };

  // ───────────────────────── Voice scoring ─────────────────────────
  // Spoken commands drive the very same flow the buttons do. The command is
  // interpreted in the context of the current step ("who scored?" → a name).
  const [feedback, setFeedback] = useState('');
  const [voiceText, setVoiceText] = useState('');
  const cardColor = useRef<'yellow' | 'red' | null>(null);
  const homeTeams = [homeName, homeRoster[0]?.houseName].filter(Boolean) as string[];
  const awayTeams = [awayName, awayRoster[0]?.houseName].filter(Boolean) as string[];
  const teamName = (s: 'home' | 'away') => (s === 'home' ? homeName : awayName);

  const processCommand = (raw: string, fromLLM = false) => {
    const text = raw.trim();
    if (!text) return;
    const say = setFeedback;

    // ---- Mid-flow: the utterance answers the current question. ----
    if (flow) {
      if (parseIntent(text).kind === 'cancel') { setFlow(null); cardColor.current = null; say('Cancelled.'); return; }
      if (flow.mode === 'goal') {
        if (flow.step === 'scorer') {
          if (/own goal/.test(deburr(text))) { setFlow({ mode: 'goal', side: flow.side, step: 'og' }); say('Own goal — which opponent?'); return; }
          const p = matchPlayer(text, xi(flow.side));
          if (p) { setFlow({ mode: 'goal', side: flow.side, step: 'type', scorer: p }); say(`${p.fullName} — penalty, free kick, header or open play?`); }
          else say("Didn't catch the scorer — say a name.");
          return;
        }
        if (flow.step === 'og') { const p = matchPlayer(text, xi(opp(flow.side))); if (p) { recordOwnGoal(flow.side, p); say(`Own goal by ${p.fullName}.`); } else say("Didn't catch the player."); return; }
        if (flow.step === 'type') { const gt = parseGoalType(text) ?? 'open'; recordGoal(flow.side, flow.scorer, gt); setFlow({ mode: 'goal', side: flow.side, step: 'assist', scorer: flow.scorer, goalType: gt, logged: true }); say(`${GOAL_TYPE_LABEL[gt]} — who assisted? (or say "no assist")`); return; }
        // assist
        if (isNoAssist(text)) { recordAssist(flow.side, null); say('Goal recorded — no assist.'); return; }
        const a = matchPlayer(text, xi(flow.side).filter((x) => x.id !== flow.scorer.id));
        if (a) { recordAssist(flow.side, a); say(`Assist: ${a.fullName}.`); } else say('Say the assister\'s name, or "no assist".');
        return;
      }
      if (flow.mode === 'foul') {
        if (flow.step === 'team') { const s = matchTeam(text, homeTeams, awayTeams); if (s) { setFlow({ mode: 'foul', step: 'by', side: s }); say('Who committed the foul?'); } else say('Which team committed it?'); return; }
        if (flow.step === 'by') { const p = matchPlayer(text, xi(flow.side)); if (p) { setFlow({ mode: 'foul', step: 'victim', side: flow.side, fouler: p }); say(`${p.fullName} fouled whom?`); } else say("Didn't catch the player."); return; }
        const v = matchPlayer(text, xi(opp(flow.side))); if (v) { recordFoul(flow.side, flow.fouler, v); say(`Foul: ${flow.fouler.fullName} on ${v.fullName}.`); } else say("Didn't catch the player."); return;
      }
      // generic stat (shot / corner / card / save / tackle / …)
      if (flow.mode === 'stat') {
        if (flow.step === 'team') {
          const s = matchTeam(text, homeTeams, awayTeams); if (!s) { say('Which team?'); return; }
          const kind = flow.kind;
          if (kind === 'save') { const gk = gkOf(s); if (gk) { recordStat('save', s, gk); say(`Save by ${gk.fullName}.`); } else setFlow({ mode: 'stat', kind, step: 'player', side: s }); return; }
          if (!playerNeeded(kind)) { recordStat(kind as StatKind, s); say(`${STAT_META[kind].label} — ${teamName(s)}.`); return; }
          setFlow({ mode: 'stat', kind, step: 'player', side: s }); say('Which player?'); return;
        }
        if (flow.step === 'player') {
          const p = matchPlayer(text, xi(flow.side)); if (!p) { say("Didn't catch the player."); return; }
          if (flow.kind === 'card') {
            const col = cardColor.current;
            if (col) { recordCard(flow.side, col, p); cardColor.current = null; setFlow(null); say(`${col} card: ${p.fullName}.`); }
            else { setFlow({ mode: 'stat', kind: 'card', step: 'detail', side: flow.side, player: p }); say('Yellow or red?'); }
            return;
          }
          if (detailNeeded(flow.kind)) { setFlow({ mode: 'stat', kind: flow.kind, step: 'detail', side: flow.side, player: p }); say(flow.kind === 'shot' ? 'On target or off?' : 'Completed or misplaced?'); return; }
          recordStat(flow.kind as StatKind, flow.side, p); say(`${STAT_META[flow.kind as StatKind].label}: ${p.fullName}.`); return;
        }
        // detail
        const { kind, side, player } = flow;
        if (kind === 'card') { const col = /red/.test(deburr(text)) ? 'red' : /yellow/.test(deburr(text)) ? 'yellow' : null; if (!col) { say('Yellow or red?'); return; } recordCard(side, col, player); setFlow(null); say(`${col} card: ${player.fullName}.`); return; }
        if (kind === 'shot') { const on = isYes(text) ? true : isNo(text) ? false : undefined; if (on === undefined) { say('On target or off target?'); return; } recordStat('shot', side, player, { onTarget: on }); say(`Shot ${on ? 'on' : 'off'} target: ${player.fullName}.`); return; }
        if (kind === 'pass') { const c = /complete|accurate/.test(deburr(text)) ? true : /misplace|incomplete|miss/.test(deburr(text)) ? false : undefined; if (c === undefined) { say('Completed or misplaced?'); return; } recordStat('pass', side, player, { complete: c }); say(`Pass: ${player.fullName}.`); return; }
      }
      say("Didn't catch that — try again or say 'cancel'.");
      return;
    }

    // ---- No flow: a fresh command. ----
    const intent = parseIntent(text);
    const teamIn = matchTeam(text, homeTeams, awayTeams);
    const startStat = (kind: StatKind | 'card') => setFlow({ mode: 'stat', kind, step: 'team' });
    switch (intent.kind) {
      case 'kickoff': if (!state.startedAt) { dispatch({ type: 'KICKOFF', payload: { at: Date.now() } }); say('Kicked off ▶'); } else say('Already underway.'); return;
      case 'endHalf': if (state.half === 1 || state.half === 3) { const ended = HALF_NAME[state.half]; dispatch({ type: 'NEXT_HALF', payload: { at: Date.now() } }); say(`Ended the ${ended}.`); } else say('Say "full time" to end the match.'); return;
      case 'fullTime': endMatch(); say('Full time — match ended.'); return;
      case 'goal': { const side = teamIn ?? state.possession.side ?? 'home'; setFlow({ mode: 'goal', side, step: 'scorer' }); say(`Goal for ${teamName(side)} — who scored?`); return; }
      case 'ownGoal': { const side = teamIn ?? 'home'; setFlow({ mode: 'goal', side, step: 'og' }); say(`Own goal for ${teamName(side)} — which opponent?`); return; }
      case 'card': {
        cardColor.current = intent.color ?? null;
        if (teamIn) {
          const p = matchPlayer(text, xi(teamIn));
          if (p && intent.color) { recordCard(teamIn, intent.color, p); cardColor.current = null; say(`${intent.color} card: ${p.fullName}.`); return; }
          setFlow({ mode: 'stat', kind: 'card', step: 'player', side: teamIn }); say(`${intent.color ?? 'Card'} — who?`); return;
        }
        startStat('card'); say(`${intent.color ? intent.color + ' card' : 'Card'} — which team?`); return;
      }
      case 'foul': setFlow({ mode: 'foul', step: 'team' }); say('Foul — which team?'); return;
      case 'sub': { const side = teamIn ?? 'home'; setSub({ side }); say(`Substitution — ${teamName(side)}: pick who comes off.`); return; }
      case 'corner': { if (teamIn) { recordStat('corner', teamIn); say(`Corner — ${teamName(teamIn)}.`); } else { startStat('corner'); say('Corner — which team?'); } return; }
      case 'offside': { if (teamIn) { recordStat('offside', teamIn); say(`Offside — ${teamName(teamIn)}.`); } else { startStat('offside'); say('Offside — which team?'); } return; }
      case 'save': startStat('save'); say('Save — which team? (credited to their keeper)'); return;
      case 'tackle': startStat('tackle'); say('Tackle — which team?'); return;
      case 'interception': startStat('interception'); say('Interception — which team?'); return;
      case 'shot': startStat('shot'); say('Shot — which team?'); return;
      case 'attack': startStat('attackContribution'); say('Attacking play — which team?'); return;
      case 'defence': startStat('defenceContribution'); say('Defensive play — which team?'); return;
      default:
        // Free-form phrasing the grammar didn't catch → ask the optional LLM to
        // normalise it to a canonical command, then re-run that through the grammar.
        // `fromLLM` guards against a loop if the LLM echoes something unparseable.
        if (!fromLLM && llmEnabled()) {
          say('🤖 interpreting…');
          const players = [...xi('home'), ...xi('away')].map((p) => p.fullName);
          void llmNormalize(text, { teams: { home: homeName, away: awayName }, players }).then((cmd) => {
            if (cmd && deburr(cmd) !== deburr(text)) processCommand(cmd, true);
            else say(`Didn't recognise "${text}".`);
          });
          return;
        }
        say(`Didn't recognise "${text}". Try: goal, yellow card, corner, substitution, kick off.`);
        return;
    }
  };

  const speech = useSpeech((t) => processCommand(t)); // ignore the confidence arg here
  const sendTyped = () => { if (voiceText.trim()) { processCommand(voiceText); setVoiceText(''); } };
  // Use a real player from this match in the example, not a stock "Kane" no one
  // on the teamsheet recognises. Falls back to a name-free example if empty.
  const samplePlayer = (homeRoster[0] ?? awayRoster[0])?.fullName?.split(' ')[0];
  const cmdPlaceholder = samplePlayer
    ? `…or type a command (e.g. "goal", "${samplePlayer}", "penalty")`
    : '…or type a command (e.g. "goal", "penalty")';
  const voiceBar = (
    <View style={ctrl.voiceBar}>
      <View style={ctrl.row}>
        <Button
          label={speech.listening ? '🛑 Stop listening' : '🎤 Voice scoring'}
          variant={speech.listening ? 'danger' : 'ghost'}
          style={ctrl.flex}
          onPress={() => (speech.listening ? speech.stop() : speech.supported ? speech.start() : setFeedback('Voice needs Chrome/Edge on web — use the text box below.'))}
        />
      </View>
      {speech.interim ? (
        <Text style={ctrl.voiceHeard}>🎙 {speech.interim}</Text>
      ) : feedback ? (
        <Text style={ctrl.voiceFeedback}>🤖 {feedback}</Text>
      ) : (
        <Text style={ctrl.meta}>Say e.g. “goal”, “yellow card”, “corner”, “substitution”, “kick off”. Then answer its follow-ups by voice.</Text>
      )}
      <View style={ctrl.row}>
        <View style={ctrl.flex}><TextField label="" value={voiceText} onChange={setVoiceText} placeholder={cmdPlaceholder} /></View>
        <Button label="Send" variant="ghost" onPress={sendTyped} disabled={!voiceText.trim()} />
      </View>
    </View>
  );

  // Substitution UI — shared between the live controls and the half-time break.
  // Rolling subs are unlimited (players can return); only fixed subs hit a cap.
  const subsCapped = state.subType === 'fixed';
  const atCap = (side: 'home' | 'away') => subsCapped && state.subsUsed[side] >= state.maxSubs;
  const subsTally = (side: 'home' | 'away') =>
    subsCapped ? ` ${state.maxSubs - state.subsUsed[side]}/${state.maxSubs}` : ` ${state.subsUsed[side]} (rolling)`;
  const subSection = (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={ctrl.label}>
        🔄 Substitution · {state.subType} ·{subsTally('home')} {homeName}{atCap('home') ? ' (none left)' : ''},{subsTally('away')} {awayName}{atCap('away') ? ' (none left)' : ''}
      </Text>
      <View style={ctrl.row}>
        <Button label={atCap('home') ? `${homeName} · no subs left` : `Sub — ${homeName}`} variant="ghost" style={ctrl.flex}
          disabled={atCap('home')}
          onPress={() => setSub(sub?.side === 'home' ? null : { side: 'home' })} />
        <Button label={atCap('away') ? `${awayName} · no subs left` : `Sub — ${awayName}`} variant="ghost" style={ctrl.flex}
          disabled={atCap('away')}
          onPress={() => setSub(sub?.side === 'away' ? null : { side: 'away' })} />
      </View>
      {sub && (
        <View style={ctrl.subBox}>
          <Text style={ctrl.meta}>Player OFF (on the field):</Text>
          <PlayerTable players={xi(sub.side)} selectedId={sub.off?.id} onPick={(p) => setSub({ ...sub, off: p })} />
          {sub.off && (
            <>
              <Text style={ctrl.meta}>Player ON (from the bench){state.subType === 'fixed' ? ' — withdrawn players unavailable' : ''}:</Text>
              <PlayerTable players={benchOf(sub.side)} onPick={(p) => { fire({ type: 'SUB', side: sub.side, payload: { offName: sub.off!.fullName, onName: p.fullName } }); setSub(null); }} />
            </>
          )}
        </View>
      )}
    </View>
  );

  // Pre-kickoff / half-time / extra-time breaks: show the clock-start control.
  if (!state.startedAt && !state.ended) {
    const base = startOffset(state);
    // Joining a game already in progress: start the clock at the current minute.
    const startAt = koMin.trim() === '' ? base : Math.max(base, Math.floor(Number(koMin)) || base);
    const kickoff = () => dispatch({ type: 'KICKOFF', payload: { at: Date.now() - Math.max(0, startAt - base) * 60000 } });
    const koLabel = state.half === 1 ? 'Kick off' : state.half === 2 ? 'Start 2nd half' : state.half === 3 ? 'Start extra time' : 'Start ET 2nd half';
    const breakMsg = state.half === 1 ? 'Set the lineup, then kick off to start the clock.'
      : state.half === 2 ? 'Half time — make any substitutions, then start the second half.'
      : state.half === 3 ? `Extra time (${state.etMinutes}′ halves) — make substitutions, then kick off.`
      : 'Extra-time break — then start the second ET half.';
    return (
      <View style={{ gap: theme.spacing(3) }}>
        <Text style={ctrl.meta}>{breakMsg}</Text>
        {/* #7 / Phase C: substitutions during any break (HT and the extra-time breaks). */}
        {state.half >= 2 && subSection}
        {/* #6: joining a match already underway — start the clock at the live minute. */}
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={ctrl.meta}>⏱ Already underway? Enter the current match minute (optional).</Text>
          <TextField label="" value={koMin} onChange={setKoMin} placeholder={`e.g. ${base + 25}`} autoCapitalize="none" />
        </View>
        <Button label={startAt > base ? `▶ ${koLabel} at ${startAt}'` : `▶ ${koLabel}`} onPress={kickoff} />
        {voiceBar}
      </View>
    );
  }

  // Level knockout tie: after full time offer extra time (following the 2nd half)
  // or penalties; once the shootout is under way, the shootout controls take over.
  if (state.ended) {
    if (state.shootout) return <ShootoutControls state={state} dispatch={dispatch} homeName={homeName} awayName={awayName} />;
    // Extra time is only offered when it's the chosen decider and we're at the end
    // of normal time; "penalties straightaway" jumps direct to the shootout.
    const canET = state.half === 2 && state.decider === 'extra_time';
    const atFullTime = state.half === 2;
    return (
      <View style={{ gap: theme.spacing(3) }}>
        <View style={ctrl.addedBox}>
          <Text style={ctrl.label}>⏱ {atFullTime ? 'Full time — level' : 'Extra time over — still level'}</Text>
          <Text style={ctrl.meta}>{homeName} {state.home}–{state.away} {awayName}. {canET ? 'Play extra time, or go straight to penalties.' : 'Decide it on penalties.'}</Text>
          {canET && (
            <>
              <View style={ctrl.row}>
                <Button label="−1'" variant="ghost" style={ctrl.flex} onPress={() => setEtMins((m) => Math.max(1, m - 1))} />
                <Text style={[ctrl.label, { alignSelf: 'center' }]}>{etMins}′ halves</Text>
                <Button label="+1'" variant="ghost" style={ctrl.flex} onPress={() => setEtMins((m) => m + 1)} />
              </View>
              <Button label={`▶ Extra time · 2×${etMins}′ · +${state.etExtraSubs} sub`} variant="home" onPress={() => dispatch({ type: 'START_EXTRA_TIME', payload: { etMinutes: etMins } })} />
            </>
          )}
          <Button label="Penalty shootout →" variant="danger" onPress={() => dispatch({ type: 'START_SHOOTOUT' })} />
        </View>
      </View>
    );
  }

  // ----- Multi-step capture (goal / foul / generic stat) -----
  const panel = (title: string, hint: string | undefined, body: React.ReactNode) => (
    <View style={{ gap: theme.spacing(3) }}>
      <View style={ctrl.flowPanel}>
        <View style={ctrl.extrasHeader}>
          <Text style={ctrl.label}>{title}</Text>
          <Button label="Cancel" variant="ghost" onPress={() => setFlow(null)} />
        </View>
        {editMin != null ? <Text style={ctrl.editBanner}>✎ Re-entering the {editMin}&apos; moment — your pick replaces the old one.</Text> : null}
        {hint ? <Text style={ctrl.meta}>{hint}</Text> : null}
        {body}
      </View>
      {voiceBar}
    </View>
  );
  const teamButtons = (onSide: (side: 'home' | 'away') => void) => (
    <View style={ctrl.row}>
      <Button label={homeName} variant="home" color={hc} style={ctrl.flex} onPress={() => onSide('home')} />
      <Button label={awayName} variant="away" color={ac} style={ctrl.flex} onPress={() => onSide('away')} />
    </View>
  );

  if (flow) {
    if (flow.mode === 'goal') {
      const sideName = flow.side === 'home' ? homeName : awayName;
      if (flow.step === 'scorer') {
        return panel(`⚽ Goal — ${sideName}`, 'Who scored?', (
          <>
            <PlayerTable players={xi(flow.side)} onPick={(p) => setFlow({ mode: 'goal', side: flow.side, step: 'assist', scorer: p, goalType: 'open', logged: false })} />
            <Button label={`⚽ Team goal — no scorer${xi(flow.side).length === 0 ? ' (no players yet)' : ''}`} variant="ghost" onPress={() => recordTeamGoal(flow.side)} />
            <Button label="🥅 Own goal instead" variant="ghost" onPress={() => setFlow({ mode: 'goal', side: flow.side, step: 'og' })} />
          </>
        ));
      }
      if (flow.step === 'og') {
        return panel(`🥅 Own goal → ${sideName}`, `Which ${flow.side === 'home' ? awayName : homeName} player put it into their own net?`, (
          <PlayerTable players={xi(opp(flow.side))} onPick={(p) => recordOwnGoal(flow.side, p)} />
        ));
      }
      if (flow.step === 'type') {
        return panel(`⚽ Goal — ${flow.scorer.fullName}`, 'How was it won?', (
          <View style={ctrl.chips}>
            {GOAL_TYPES.map((g) => (
              <Button key={g} label={GOAL_TYPE_LABEL[g]} variant="ghost" style={ctrl.actionBtn}
                onPress={() => setFlow({ mode: 'goal', side: flow.side, step: 'body', scorer: flow.scorer, goalType: g })} />
            ))}
          </View>
        ));
      }
      if (flow.step === 'body') {
        return panel(`⚽ Goal — ${flow.scorer.fullName}`, 'Struck with?', (
          <View style={ctrl.chips}>
            {BODY_PARTS.map((b) => (
              <Button key={b} label={BODY_PART_LABEL[b]} variant="ghost" style={ctrl.actionBtn}
                onPress={() => { recordGoal(flow.side, flow.scorer, flow.goalType, b); setFlow({ mode: 'goal', side: flow.side, step: 'assist', scorer: flow.scorer }); }} />
            ))}
          </View>
        ));
      }
      {
        // Consolidated fast panel — the goal is open-play by default; type/header
        // and assist are optional. `logged` is true only on the voice path (goal
        // already scored); the button path records it here on finish.
        const gt = flow.goalType ?? 'open';
        const bp = flow.bodyPart;
        const finish = (assister: Player | null) => {
          if (!flow.logged) recordGoal(flow.side, flow.scorer, gt, bp);
          recordAssist(flow.side, assister); // attaches to the just-scored goal, then closes
        };
        // A goal-type/header refinement after the goal is already logged (voice
        // path) re-logs it with the corrected type so the score stays right.
        const refine = (nextType: GoalType, nextBody?: BodyPart) => {
          if (flow.logged) { dispatch({ type: 'UNDO_GOAL', side: flow.side }); recordGoal(flow.side, flow.scorer, nextType, nextBody); }
          setFlow({ mode: 'goal', side: flow.side, step: 'assist', scorer: flow.scorer, goalType: nextType, bodyPart: nextBody, logged: flow.logged });
        };
        const typeChips: { label: string; t: GoalType; b?: BodyPart }[] = [
          { label: 'Open play', t: 'open' }, { label: 'Header', t: 'open', b: 'head' },
          { label: 'Penalty', t: 'penalty' }, { label: 'Free kick', t: 'freekick' },
        ];
        return panel(`⚽ Goal — ${flow.scorer.fullName}`, 'Assist? (optional — type below)', (
          <>
            <PlayerTable players={xi(flow.side).filter((p) => p.id !== flow.scorer.id)} onPick={finish} />
            <Button label="✓ No assist" variant="ghost" onPress={() => finish(null)} />
            <Text style={ctrl.meta}>Goal type {bp === 'head' ? '· header' : ''}</Text>
            <View style={ctrl.chips}>
              {typeChips.map((c) => (
                <Button key={c.label} label={c.label} variant="ghost" style={ctrl.actionBtn}
                  color={(c.t === gt && (c.b ?? undefined) === (bp ?? undefined)) ? theme.colors.primary : undefined}
                  onPress={() => refine(c.t, c.b)} />
              ))}
            </View>
          </>
        ));
      }
    }

    if (flow.mode === 'foul') {
      if (flow.step === 'team') {
        return panel('🟫 Foul', 'Which team committed it?', teamButtons((side) => setFlow({ mode: 'foul', step: 'by', side })));
      }
      if (flow.step === 'by') {
        const sideName = flow.side === 'home' ? homeName : awayName;
        return panel(`🟫 Foul — ${sideName}`, 'Who committed the foul?', (
          <PlayerTable players={xi(flow.side)} onPick={(p) => setFlow({ mode: 'foul', step: 'victim', side: flow.side, fouler: p })} />
        ));
      }
      return panel(`🟫 ${flow.fouler.fullName} fouled…`, 'Who was fouled?', (
        <PlayerTable players={xi(opp(flow.side))} onPick={(v) => recordFoul(flow.side, flow.fouler, v)} />
      ));
    }

    if (flow.mode === 'pen') {
      if (flow.step === 'team') {
        return panel('🥅 Penalty', 'Which team has the penalty?', teamButtons((side) => setFlow({ mode: 'pen', step: 'wonBy', side })));
      }
      const sideName = flow.side === 'home' ? homeName : awayName;
      if (flow.step === 'wonBy') {
        return panel(`🥅 Penalty — ${sideName}`, 'Who won the penalty?', (
          <>
            <PlayerTable players={xi(flow.side)} onPick={(p) => setFlow({ mode: 'pen', step: 'takenBy', side: flow.side, wonBy: p })} />
            <Button label="Skip — not recorded" variant="ghost" onPress={() => setFlow({ mode: 'pen', step: 'takenBy', side: flow.side })} />
          </>
        ));
      }
      if (flow.step === 'takenBy') {
        return panel(`🥅 Penalty — ${sideName}`, 'Who is taking it?', (
          <PlayerTable players={xi(flow.side)} onPick={(p) => setFlow({ mode: 'pen', step: 'outcome', side: flow.side, taker: p, wonBy: flow.wonBy })} />
        ));
      }
      return panel(`🥅 Penalty — ${flow.taker.fullName}`, 'Outcome?', (
        <View style={ctrl.row}>
          <Button label="⚽ Scored" variant="home" style={ctrl.flex} onPress={() => finishPenalty(flow.side, 'scored', flow.taker, flow.wonBy)} />
          <Button label="🧤 Saved" variant="ghost" style={ctrl.flex} onPress={() => finishPenalty(flow.side, 'saved', flow.taker, flow.wonBy)} />
          <Button label="🚫 Missed" variant="ghost" style={ctrl.flex} onPress={() => finishPenalty(flow.side, 'missed', flow.taker, flow.wonBy)} />
        </View>
      ));
    }

    // Generic stat (shot, corner, offside, tackle, interception, save, pass, card)
    const meta = flow.kind === 'card' ? { icon: '🟨', label: 'Card' } : STAT_META[flow.kind];
    if (flow.step === 'team') {
      const kind = flow.kind;
      const hint = kind === 'save' ? 'Which team made the save? (credited to their goalkeeper)' : 'Which team?';
      return panel(`${meta.icon} ${meta.label}`, hint, teamButtons((side) => {
        // A save defaults to the team's current goalkeeper — no player pick needed.
        if (kind === 'save') {
          const gk = gkOf(side);
          return gk ? recordStat('save', side, gk) : setFlow({ mode: 'stat', kind, step: 'player', side });
        }
        return playerNeeded(kind)
          ? setFlow({ mode: 'stat', kind, step: 'player', side })
          : recordStat(kind as StatKind, side);
      }));
    }
    if (flow.step === 'player') {
      const sideName = flow.side === 'home' ? homeName : awayName;
      return panel(`${meta.icon} ${meta.label} — ${sideName}`, 'Who?', (
        <PlayerTable players={xi(flow.side)} onPick={(p) => (
          detailNeeded(flow.kind)
            ? setFlow({ mode: 'stat', kind: flow.kind, step: 'detail', side: flow.side, player: p })
            : recordStat(flow.kind as StatKind, flow.side, p)
        )} />
      ));
    }
    const { kind, side, player } = flow;
    if (kind === 'shot') {
      // On-target shots branch into their outcome; a block is credited to the defender.
      if (flow.step === 'outcome') {
        return panel(`🎯 On target — ${player.fullName}`, 'What happened?', (
          <View style={{ gap: theme.spacing(2) }}>
            <View style={ctrl.row}>
              <Button label="⚽ Goal" variant="home" style={ctrl.flex} onPress={() => setFlow({ mode: 'goal', side, step: 'type', scorer: player })} />
              <Button label="🧤 Saved" variant="ghost" style={ctrl.flex}
                onPress={() => { recordStat('shot', side, player, { onTarget: true }); const gk = gkOf(opp(side)); if (gk) recordStat('save', opp(side), gk); }} />
            </View>
            <View style={ctrl.row}>
              <Button label="🧱 Blocked" variant="ghost" style={ctrl.flex}
                onPress={() => { recordStat('shot', side, player, { onTarget: true }); setFlow({ mode: 'stat', kind: 'shot', step: 'blocker', side, player }); }} />
              <Button label="On target only" variant="ghost" style={ctrl.flex} onPress={() => recordStat('shot', side, player, { onTarget: true })} />
            </View>
          </View>
        ));
      }
      if (flow.step === 'blocker') {
        return panel('🧱 Blocked by…', `Which ${opp(side) === 'home' ? homeName : awayName} player blocked it?`, (
          <PlayerTable players={xi(opp(side))} onPick={(b) => recordStat('defenceContribution', opp(side), b)} />
        ));
      }
      return panel(`🎯 Shot — ${player.fullName}`, 'On target?', (
        <View style={ctrl.row}>
          <Button label="🎯 On target" variant="home" style={ctrl.flex} onPress={() => setFlow({ mode: 'stat', kind: 'shot', step: 'outcome', side, player })} />
          <Button label="↗ Off target" variant="ghost" style={ctrl.flex} onPress={() => recordStat('shot', side, player, { onTarget: false })} />
        </View>
      ));
    }
    if (kind === 'pass') {
      return panel(`➡️ Pass — ${player.fullName}`, 'Pass outcome?', (
        <View style={ctrl.row}>
          <Button label="✓ Completed" variant="home" style={ctrl.flex} onPress={() => recordStat('pass', side, player, { complete: true })} />
          <Button label="✗ Misplaced" variant="ghost" style={ctrl.flex} onPress={() => recordStat('pass', side, player, { complete: false })} />
        </View>
      ));
    }
    return panel(`🟨 Card — ${player.fullName}`, 'Which card?', (
      <View style={ctrl.row}>
        <Button label="🟨 Yellow" variant="home" style={[ctrl.flex, { backgroundColor: theme.colors.accent }]} onPress={() => { recordCard(side, 'yellow', player); setFlow(null); }} />
        <Button label="🟥 Red" variant="danger" style={ctrl.flex} onPress={() => { recordCard(side, 'red', player); setFlow(null); }} />
      </View>
    ));
  }

  // ----- Main controls -----
  // Actions grouped so the scorer scans by phase of play, not one long list.
  const trackFor: Record<string, boolean> = {
    shot: t.shots, cross: t.crosses, dribble: t.dribbles, corner: t.corners, pass: t.passes, attackContribution: t.attackContribution,
    tackle: t.tackles, interception: t.interceptions, save: t.saves, defenceContribution: t.defenceContribution,
    foul: t.fouls, offside: t.offsides, handball: t.handball, card: t.cards,
  };
  const ACTION_GROUPS: { title: string; kinds: (StatKind | 'card')[] }[] = [
    { title: '⚡ Attacking', kinds: ['shot', 'cross', 'dribble', 'corner', 'pass', 'attackContribution'] },
    { title: '🛡️ Defensive', kinds: ['tackle', 'interception', 'save', 'defenceContribution'] },
    { title: '🟨 Discipline', kinds: ['foul', 'offside', 'handball', 'card'] },
  ];
  const startAction = (kind: StatKind | 'card') =>
    setFlow(kind === 'foul' ? { mode: 'foul', step: 'team' } : { mode: 'stat', kind, step: 'team' });

  return (
    <View style={{ gap: theme.spacing(4) }}>
      {voiceBar}
      {t.possession && <PossessionBar state={state} homeName={homeName} awayName={awayName} homeColor={hc} awayColor={ac} onSwitch={setPossession} />}

      {/* In-play stoppage marker (injury / cooling break / VAR check) — a timeline
          note; distinct from signalling ADDED time (which extends the clock). */}
      <Button label="⏸️ Stoppage / injury" variant="ghost" onPress={() => dispatch({ type: 'STOPPAGE', side: state.possession.side ?? 'home' })} />

      {/* Goal — one flow: scorer (or own goal) → goal type → assist. */}
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>⚽ Goal</Text>
        <Text style={ctrl.meta}>Pick the scorer (or own goal), the goal type, then the assist.</Text>
        <View style={ctrl.row}>
          <Button label={`Goal — ${homeName}`} variant="home" color={hc} style={ctrl.flex} onPress={() => setFlow({ mode: 'goal', side: 'home', step: 'scorer' })} />
          <Button label={`Goal — ${awayName}`} variant="away" color={ac} style={ctrl.flex} onPress={() => setFlow({ mode: 'goal', side: 'away', step: 'scorer' })} />
        </View>
      </View>

      {/* Penalty — won by → taken by → scored / saved / missed (credits the GK on a save). */}
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>🥅 Penalty</Text>
        <Text style={ctrl.meta}>Who won it, who took it, and whether it was scored, saved or missed.</Text>
        <Button label="Award a penalty" variant="ghost" onPress={() => setFlow({ mode: 'pen', step: 'team' })} />
      </View>

      {ACTION_GROUPS.map((g) => {
        const kinds = g.kinds.filter((k) => trackFor[k]);
        if (kinds.length === 0) return null;
        return (
          <View key={g.title} style={{ gap: theme.spacing(2) }}>
            <Text style={ctrl.label}>{g.title}</Text>
            <View style={ctrl.chips}>
              {kinds.map((k) => {
                const m = k === 'card' ? { icon: '🟨', label: 'Card' } : STAT_META[k];
                return <Button key={k} label={`${m.icon} ${m.label}`} variant="ghost" style={ctrl.actionBtn} onPress={() => startAction(k)} />;
              })}
            </View>
          </View>
        );
      })}

      {subSection}

      {/* #6: backfill — catch up on events that happened before scoring started.
          While active, every logged action is stamped at the chosen past minute. */}
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>⏪ Backfill an earlier moment</Text>
        {backfillMin == null ? (
          <>
            <Text style={ctrl.meta}>Started scoring late? Enter a past minute — everything you log is stamped there until you go back to live.</Text>
            <View style={ctrl.row}>
              <View style={ctrl.flex}><TextField label="" value={backfillText} onChange={setBackfillText} placeholder="minute, e.g. 12" autoCapitalize="none" /></View>
              <Button label="Backfill" variant="ghost" disabled={backfillText.trim() === ''} onPress={() => setBackfillMin(Math.max(0, Math.floor(Number(backfillText)) || 0))} />
            </View>
          </>
        ) : (
          <View style={ctrl.addedBox}>
            <Text style={ctrl.label}>⏪ Backfilling at {backfillMin}&apos;</Text>
            <Text style={ctrl.meta}>Every action you log now is stamped at {backfillMin}&apos;. Adjust the minute, or go back to live scoring.</Text>
            <View style={ctrl.row}>
              <Button label="−1'" variant="ghost" style={ctrl.flex} onPress={() => setBackfillMin(Math.max(0, backfillMin - 1))} />
              <Button label="+1'" variant="ghost" style={ctrl.flex} onPress={() => setBackfillMin(backfillMin + 1)} />
              <Button label="▶ Back to live" variant="home" style={ctrl.flex} onPress={() => { setBackfillMin(null); setBackfillText(''); }} />
            </View>
          </View>
        )}
      </View>

      {/* B9: correct the timeline — remove one specific wrong moment (e.g. a mistaken
          decision at 10') without undoing everything back to it. */}
      <View style={{ gap: theme.spacing(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={ctrl.label}>🗓 Correct the timeline</Text>
          <Button label={showEdit ? 'Done' : 'Edit'} variant="ghost" onPress={() => setShowEdit((v) => !v)} />
        </View>
        {showEdit && (() => {
          const items = [
            ...state.events.map((e) => ({ key: `e${e.id}`, minute: e.minute, order: e.id, label: `${EVENT_META[e.type].icon} ${EVENT_META[e.type].label}${e.type === 'sub' ? ` — ${e.secondName ?? ''} for ${e.playerName ?? ''}` : e.playerName ? ` — ${e.playerName}` : ''}`, onRemove: () => removeEvent(e), onEdit: () => editEvent(e) })),
            ...state.stats.map((st) => ({ key: `s${st.id}`, minute: st.minute, order: st.id, label: `${STAT_META[st.kind].icon} ${STAT_META[st.kind].label}${st.playerName ? ` — ${st.playerName}` : ''}`, onRemove: () => removeStat(st), onEdit: () => editStat(st) })),
          ].sort((a, b) => b.minute - a.minute || b.order - a.order);
          if (items.length === 0) return <Text style={ctrl.meta}>Nothing logged yet.</Text>;
          return (
            <View style={{ gap: theme.spacing(1) }}>
              <Text style={ctrl.meta}>Tap Edit to re-pick the player/type (stamped at the same minute — every stat re-adjusts), or Remove to delete it. Nothing else is touched.</Text>
              {items.map((it) => (
                <View key={it.key} style={ctrl.editRow}>
                  <Text style={ctrl.editMin}>{it.minute}&apos;</Text>
                  <Text style={ctrl.editLabel} numberOfLines={1}>{it.label}</Text>
                  <Text style={ctrl.editEdit} onPress={it.onEdit}>✎ Edit</Text>
                  <Text style={ctrl.editRemove} onPress={it.onRemove}>✕</Text>
                </View>
              ))}
            </View>
          );
        })()}
      </View>

      {/* Added (injury) time: near the half's end, prompt for the minutes; then
          count up as 45+x / 90+x; once they're up, nudge to end. */}
      {(() => {
        const base = halfBase(state);
        const min = currentMinute(state);
        // `?? 0` covers matches saved before ET halves were keyed here.
        const stop = state.stoppage[state.half] ?? 0;
        if (stop === 0 && min >= base - 2) {
          return (
            <View style={ctrl.addedBox}>
              <Text style={ctrl.label}>⏱ Added time</Text>
              <Text style={ctrl.meta}>The {HALF_NAME[state.half]} is nearly up — enter the minutes of added (injury) time.</Text>
              <View style={ctrl.chips}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((m) => (
                  <Button key={m} label={`+${m}`} variant="ghost" style={ctrl.actionBtn} onPress={() => dispatch({ type: 'SET_STOPPAGE', payload: { minutes: m } })} />
                ))}
              </View>
            </View>
          );
        }
        if (stop > 0 && min >= base + stop) {
          return <Text style={ctrl.endNudge}>⏱ {stop}′ added time is up — {state.half === 1 || state.half === 3 ? `end the ${HALF_NAME[state.half]}` : 'end the match'}.</Text>;
        }
        if (stop > 0) return <Text style={ctrl.meta}>⏱ +{stop}′ added time signalled</Text>;
        return null;
      })()}

      {(() => {
        const nextHalf = () => dispatch({ type: 'NEXT_HALF', payload: { at: Date.now() } });
        if (state.half === 1) return <Button label="End 1st Half →" onPress={nextHalf} />;
        if (state.half === 3) return <Button label="End ET 1st half →" onPress={nextHalf} />;
        // End of 2nd half (or 2nd ET half): a level knockout tie goes to the ET/penalty
        // decision (END without awarding clean sheets yet); otherwise it's full time.
        const toDecision = state.knockout && state.home === state.away;
        const label = toDecision ? (state.half === 2 ? 'End 2nd Half →' : 'End extra time →') : 'End Match';
        return <Button label={label} variant="danger" onPress={() => (toDecision ? dispatch({ type: 'END', payload: { at: Date.now() } }) : endMatch())} />;
      })()}
    </View>
  );
};

/** Live possession bar — time-based split, ticking each second, with a one-tap
 *  switch for when the ball changes hands. */
function PossessionBar({
  state, homeName, awayName, homeColor, awayColor, onSwitch,
}: {
  state: FootballState; homeName: string; awayName: string; homeColor?: string; awayColor?: string; onSwitch: (side: 'home' | 'away') => void;
}) {
  const hc = homeColor ?? theme.colors.home;
  const ac = awayColor ?? theme.colors.away;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!state.startedAt) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [state.startedAt]);
  const pct = possessionPct(state, Date.now());
  const side = state.possession.side;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={ctrl.label}>⚽ Possession — {homeName} {pct.home}% : {pct.away}% {awayName}</Text>
      <View style={[ctrl.possTrack, { backgroundColor: ac }]}>
        <View style={[ctrl.possFill, { width: `${pct.home}%`, backgroundColor: hc }]} />
      </View>
      <View style={ctrl.row}>
        <Button label={`${side === 'home' ? '● ' : ''}Ball: ${homeName}`} variant={side === 'home' ? 'home' : 'ghost'} color={hc} style={ctrl.flex} onPress={() => onSwitch('home')} />
        <Button label={`${side === 'away' ? '● ' : ''}Ball: ${awayName}`} variant={side === 'away' ? 'away' : 'ghost'} color={ac} style={ctrl.flex} onPress={() => onSwitch('away')} />
      </View>
      <Text style={ctrl.meta}>Tap to set who has the ball (after a throw-in, corner, foul…); time on the ball drives the %.</Text>
    </View>
  );
}

/** Penalty shootout panel — shown when a knockout tie is level at full time. */
function ShootoutControls({
  state, dispatch, homeName, awayName,
}: {
  state: FootballState; dispatch: (a: ScoreAction) => void; homeName: string; awayName: string;
}) {
  if (!state.knockout || state.home !== state.away) {
    return <Text style={ctrl.meta}>✅ Full time — final score saved.</Text>;
  }
  const pens = penScore(state);
  if (!state.shootout) {
    return (
      <View style={{ gap: theme.spacing(3) }}>
        <Text style={ctrl.label}>⚖️ Level {state.home}–{state.away} at full time</Text>
        <Text style={ctrl.meta}>Extra time settled nothing — it goes to a penalty shootout.</Text>
        <Button label="▶ Start penalty shootout" onPress={() => dispatch({ type: 'START_SHOOTOUT' })} />
      </View>
    );
  }
  const nextSide: 'home' | 'away' = state.shootout.home.length <= state.shootout.away.length ? 'home' : 'away';
  const nextName = nextSide === 'home' ? homeName : awayName;
  const dot = (scored: boolean, i: number) => (
    <Text key={i} style={[ctrl.penDot, { color: scored ? theme.colors.primary : theme.colors.textMuted }]}>{scored ? '●' : '○'}</Text>
  );
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>🥅 Penalty shootout — {pens.home} : {pens.away}</Text>
      <View style={ctrl.penRow}><Text style={ctrl.penTeam}>{homeName}</Text><View style={ctrl.row}>{state.shootout.home.map(dot)}</View></View>
      <View style={ctrl.penRow}><Text style={ctrl.penTeam}>{awayName}</Text><View style={ctrl.row}>{state.shootout.away.map(dot)}</View></View>
      <Text style={ctrl.meta}>{nextName} to take the next kick</Text>
      <View style={ctrl.row}>
        <Button label="✓ Scored" variant={nextSide} style={ctrl.flex} onPress={() => dispatch({ type: 'PEN', side: nextSide, payload: { scored: true } })} />
        <Button label="✗ Missed" variant="ghost" style={ctrl.flex} onPress={() => dispatch({ type: 'PEN', side: nextSide, payload: { scored: false } })} />
      </View>
    </View>
  );
}

/* ------------------------------ Live panel --------------------------------- */

/** Running match clock — rendered inside the scoreboard (between status & score). */
const LiveClock: NonNullable<SportPlugin<FootballState>['LiveClock']> = ({ state }) => {
  const s = state as FootballState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s.startedAt || s.ended) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.startedAt, s.ended]);

  const running = !!s.startedAt && !s.ended;
  const label = s.ended ? 'FT' : !s.startedAt ? (s.half === 2 ? 'HT' : '—') : clockTime(s);
  return (
    <View style={ctrl.clockRow}>
      <View style={[ctrl.liveDot, { backgroundColor: running ? theme.colors.danger : theme.colors.textMuted }]} />
      <Text style={ctrl.clockTime}>{label}</Text>
    </View>
  );
};

/** Timeline only — the pitch/lineups are rendered generically by the live
 *  screen from `plugin.Court`, so every sport's layout shows the same way. */
/** One comparison row: the higher value gets a colored pill (FIFA-style). A stat
 *  the scorer isn't tracking this match is shown muted with a ☁ "not tracked" tag
 *  rather than hidden — so viewers see the same coverage idea as on profiles. */
function StatRow({ label, home, away, homeColor, awayColor, tracked }: { label: string; home: string; away: string; homeColor: string; awayColor: string; tracked: boolean }) {
  if (!tracked) {
    return (
      <View style={sv.statRow}>
        <Text style={[sv.statLabel, sv.labelMuted, { textAlign: 'left' }]}>{label}</Text>
        <Text style={sv.notTracked}>☁ not tracked</Text>
      </View>
    );
  }
  const hn = parseFloat(home), an = parseFloat(away);
  const lead = isNaN(hn) || isNaN(an) || hn === an ? null : hn > an ? 'home' : 'away';
  // Proportional comparison bar: each side's share of the two values, so the
  // balance of play reads at a glance (5 shots vs 3 → a 5:3 split, 60% vs 40%
  // possession → 60:40). Neutral when there's nothing yet (0–0).
  const h = isNaN(hn) ? 0 : hn, a = isNaN(an) ? 0 : an;
  const total = h + a;
  const Cell = ({ v, side }: { v: string; side: 'home' | 'away' }) => (
    <View style={[sv.cell, lead === side && { backgroundColor: side === 'home' ? homeColor : awayColor }]}>
      <Text style={[sv.cellText, lead === side && sv.cellTextLead]}>{v}</Text>
    </View>
  );
  return (
    <View style={sv.statBlock}>
      <View style={sv.statRow}>
        <Cell v={home} side="home" />
        <Text style={sv.statLabel}>{label}</Text>
        <Cell v={away} side="away" />
      </View>
      <View style={sv.bar}>
        {total > 0 ? (
          <>
            <View style={{ flex: h, backgroundColor: homeColor }} />
            <View style={{ flex: a, backgroundColor: awayColor }} />
          </>
        ) : (
          <View style={{ flex: 1, backgroundColor: theme.colors.surfaceAlt }} />
        )}
      </View>
    </View>
  );
}

const StatsComparison = ({ s, homeName, awayName, homeColor, awayColor }: { s: FootballState; homeName: string; awayName: string; homeColor: string; awayColor: string }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s.startedAt) return;
    const id = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, [s.startedAt]);
  // Split the table into Overall / 1st half / 2nd half. Events carry their half,
  // so per-half totals are just the same aggregation over a filtered event set.
  const [scope, setScope] = useState<'all' | 1 | 2 | 3 | 4>('all');
  // Only offer the period split once a 2nd period has actually started — while a
  // match is still in the 1st half, "Overall" and "1st half" are identical, so the
  // toggle (and a dead all-zeros "2nd half" filter) would just be noise. Each ET
  // period's chip appears as it's played. Mirrors the basketball/kabaddi toggles.
  const periods: ('all' | 1 | 2 | 3 | 4)[] = s.half >= 2
    ? ['all', 1, 2, ...(s.half >= 3 ? [3 as const] : []), ...(s.half >= 4 ? [4 as const] : [])]
    : [];
  const scopeLabel = (k: 'all' | 1 | 2 | 3 | 4) =>
    k === 'all' ? 'Overall' : k === 1 ? '1st half' : k === 2 ? '2nd half' : k === 3 ? 'ET 1' : 'ET 2';
  const active: 'all' | 1 | 2 | 3 | 4 = periods.includes(scope) ? scope : 'all';
  const inScope = (h?: 1 | 2 | 3 | 4) => active === 'all' || h === active;
  const scoped = active === 'all'
    ? s
    : { ...s, stats: s.stats.filter((e) => inScope(e.half)), events: s.events.filter((e) => inScope(e.half)) };
  const { totals, possession, passAcc } = footballStats(scoped, Date.now());
  const t = s.track;
  const rows: { label: string; home: string; away: string; tracked: boolean; overallOnly?: boolean }[] = [
    { label: 'Shots', home: `${totals.home.shots}`, away: `${totals.away.shots}`, tracked: t.shots },
    { label: 'Shots on target', home: `${totals.home.shotsOnTarget}`, away: `${totals.away.shotsOnTarget}`, tracked: t.shots },
    // Possession is time-based (cumulative), so it's only meaningful over the whole match.
    { label: 'Possession', home: `${possession.home}%`, away: `${possession.away}%`, tracked: t.possession, overallOnly: true },
    { label: 'Passes', home: `${totals.home.passes}`, away: `${totals.away.passes}`, tracked: t.passes },
    { label: 'Pass accuracy', home: `${passAcc.home}%`, away: `${passAcc.away}%`, tracked: t.passes },
    { label: 'Fouls', home: `${totals.home.fouls}`, away: `${totals.away.fouls}`, tracked: t.fouls },
    { label: 'Yellow cards', home: `${totals.home.yellow}`, away: `${totals.away.yellow}`, tracked: t.cards },
    { label: 'Red cards', home: `${totals.home.red}`, away: `${totals.away.red}`, tracked: t.cards },
    { label: 'Offsides', home: `${totals.home.offsides}`, away: `${totals.away.offsides}`, tracked: t.offsides },
    { label: 'Corners', home: `${totals.home.corners}`, away: `${totals.away.corners}`, tracked: t.corners },
    { label: 'Tackles', home: `${totals.home.tackles}`, away: `${totals.away.tackles}`, tracked: t.tackles },
    { label: 'Interceptions', home: `${totals.home.interceptions}`, away: `${totals.away.interceptions}`, tracked: t.interceptions },
    { label: 'Saves', home: `${totals.home.saves}`, away: `${totals.away.saves}`, tracked: t.saves },
    { label: 'Crosses', home: `${totals.home.crosses}`, away: `${totals.away.crosses}`, tracked: t.crosses },
    { label: 'Dribbles', home: `${totals.home.dribbles}`, away: `${totals.away.dribbles}`, tracked: t.dribbles },
    { label: 'Handballs', home: `${totals.home.handballs}`, away: `${totals.away.handballs}`, tracked: t.handball },
    { label: 'Attacking plays', home: `${totals.home.attackContributions}`, away: `${totals.away.attackContributions}`, tracked: t.attackContribution },
    { label: 'Defensive plays', home: `${totals.home.defenceContributions}`, away: `${totals.away.defenceContributions}`, tracked: t.defenceContribution },
  ];
  // Show only the stats this match is capturing; list the rest compactly below so
  // the comparison isn't padded with a stack of "☁ not tracked" rows.
  const shownRows = rows.filter((r) => (active === 'all' || !r.overallOnly) && r.tracked);
  const untracked = rows.filter((r) => !r.tracked).map((r) => r.label);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {periods.length > 0 ? (
        <View style={sv.scopeRow}>
          {periods.map((key) => (
            <SelectChip key={String(key)} label={scopeLabel(key)} active={active === key} onPress={() => setScope(key)} />
          ))}
        </View>
      ) : null}
      <View style={sv.head}>
        <Text style={[sv.headTeam, { color: homeColor }]} numberOfLines={1}>{homeName}</Text>
        <Text style={sv.headTitle}>TEAM STATS</Text>
        <Text style={[sv.headTeam, { color: awayColor, textAlign: 'right' }]} numberOfLines={1}>{awayName}</Text>
      </View>
      {shownRows.map((r) => <StatRow key={r.label} label={r.label} home={r.home} away={r.away} homeColor={homeColor} awayColor={awayColor} tracked />)}
      {untracked.length ? (
        <Text style={sv.coverageHint}>☁ Not tracked: {untracked.join(', ')} — turn on in Scoring settings (Info tab).</Text>
      ) : null}
    </View>
  );
};

/** Football contributes Lineups / Stats / Timeline as their own top-level tabs on
 *  the live screen (the screen calls LiveExtras with each view's key). */
const FOOTBALL_VIEWS = [
  { key: 'lineups', label: 'Lineups' },
  { key: 'stats', label: 'Stats' },
  { key: 'timeline', label: 'Timeline' },
];

const LiveExtras: NonNullable<SportPlugin<FootballState>['LiveExtras']> = ({
  state,
  homeName,
  awayName,
  homeColor,
  awayColor,
  homeRoster,
  awayRoster,
  homeLineup,
  awayLineup,
  homeManager,
  awayManager,
  homeFormation,
  awayFormation,
  canEditHome,
  canEditAway,
  onEditLineup,
  onPlayer,
  view = 'lineups',
}) => {
  const s = state as FootballState;
  const hc = homeColor ?? theme.colors.home;
  const ac = awayColor ?? theme.colors.away;
  if (view === 'timeline') {
    return <Timeline events={s.events} stats={s.stats} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />;
  }
  if (view === 'stats') {
    return <StatsComparison s={s} homeName={homeName} awayName={awayName} homeColor={hc} awayColor={ac} />;
  }
  return (
    <LineupView
      homeLineup={homeLineup} awayLineup={awayLineup} homeRoster={homeRoster} awayRoster={awayRoster}
      events={s.events} homeName={homeName} awayName={awayName} homeColor={hc} awayColor={ac}
      homeManager={homeManager} awayManager={awayManager}
      homeFormation={homeFormation} awayFormation={awayFormation}
      canEditHome={canEditHome} canEditAway={canEditAway} onEditLineup={onEditLineup} onPlayer={onPlayer}
    />
  );
};

const sv = StyleSheet.create({
  scopeRow: { flexDirection: 'row', justifyContent: 'center', gap: theme.spacing(2), marginBottom: theme.spacing(1) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2), marginBottom: theme.spacing(1) },
  headTeam: { flex: 1, fontSize: theme.font.small, fontWeight: '800' },
  headTitle: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  statBlock: { gap: theme.spacing(1), paddingVertical: theme.spacing(1.5) },
  statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt },
  statLabel: { flex: 1, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small },
  cell: { minWidth: 48, paddingVertical: 4, paddingHorizontal: 10, borderRadius: theme.radius.pill, alignItems: 'center' },
  cellText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  cellTextLead: { color: '#06120D', fontWeight: '900' },
  labelMuted: { color: theme.colors.textMuted },
  notTracked: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', fontStyle: 'italic' },
  coverageHint: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontStyle: 'italic', marginTop: theme.spacing(2), textAlign: 'center' },
});

/** Football's pitch as the generic Court (positions mirrored per side). */
const Court: NonNullable<SportPlugin<FootballState>['Court']> = ({ homeLineup, awayLineup, homeColor, awayColor }) => (
  <Pitch homeLineup={homeLineup} awayLineup={awayLineup} homeColor={homeColor} awayColor={awayColor} />
);

export const footballPlugin: SportPlugin<FootballState> = {
  id: 'football',
  name: 'Football',
  icon: '⚽',
  archetype: 'goal-time',
  createInitialState: init,
  reducer,
  // A level knockout tie isn't complete until the shootout produces a winner.
  isComplete: (s) => s.ended && (s.home !== s.away || !s.knockout || s.shootoutWinner != null),
  result: (s) => {
    if (!(s.ended && (s.home !== s.away || !s.knockout || s.shootoutWinner != null))) return null;
    const winner = s.home > s.away ? 'home' : s.away > s.home ? 'away' : (s.shootoutWinner ?? 'draw');
    return { winner, home: s.home, away: s.away };
  },
  summary: (s) => {
    const pens = penScore(s);
    // Cards are no longer a lumped tally on the scorecard — reds show as badges by
    // the team name (see homeReds/awayReds), so the scorer sees who's down to 10.
    return {
      homeScore: String(s.home),
      awayScore: String(s.away),
      statusLine: s.shootoutWinner
        ? `${s.shootoutWinner === 'home' ? 'Home' : 'Away'} win ${pens.home}–${pens.away} on pens`
        : s.shootout
        ? `Penalties ${pens.home}–${pens.away}`
        : s.ended
        ? 'Full Time'
        : s.half === 1 ? '1st Half' : s.half === 2 ? '2nd Half' : s.half === 3 ? 'Extra Time (1st)' : 'Extra Time (2nd)',
      detailLine: s.shootout ? `Shootout · ${pens.home}–${pens.away}` : undefined,
      homeReds: s.events.filter((e) => e.type === 'red' && e.side === 'home').length,
      awayReds: s.events.filter((e) => e.type === 'red' && e.side === 'away').length,
    };
  },
  ScoringControls,
  LiveExtras,
  LiveClock,
  formation: emptyFormation,
  Court,
  // football renders its own rich lineups inside LiveExtras (the LINEUPS sub-tab),
  // so the generic court isn't shown twice on the live screen.
  lineupsInExtras: true,
  liveViews: FOOTBALL_VIEWS,
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'eleven',
      options: [
        { value: 'eleven', label: '11-a-side', set: { playersPerSide: 11, halfMinutes: 45, substitutes: 5, subType: 'rolling' } },
        { value: 'sevens', label: '7-a-side', set: { playersPerSide: 7, halfMinutes: 25, substitutes: 5, subType: 'rolling' } },
        { value: 'fives', label: '5s turf', set: { playersPerSide: 5, halfMinutes: 20, substitutes: 5, subType: 'rolling' } },
        { value: 'futsal', label: 'Futsal', set: { playersPerSide: 5, halfMinutes: 20, substitutes: 9, subType: 'rolling' } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 11, min: 1, max: 11, advanced: true },
    { key: 'halfMinutes', label: 'Minutes per half', type: 'number', default: 45, min: 1, max: 60 },
    { key: 'substitutes', label: 'Substitutes per side', type: 'count', default: 5, min: 0, max: 11 },
    {
      key: 'subType', label: 'Substitutions', type: 'choice', default: 'rolling',
      options: [
        { value: 'rolling', label: 'Rolling (can return)' },
        { value: 'fixed', label: 'Fixed (no return)' },
      ],
    },
    {
      key: 'decider', label: 'If level at full time', type: 'choice', default: 'none',
      options: [
        { value: 'none', label: 'Draw stands — no extra time or penalties' },
        { value: 'extra_time', label: 'Extra time, then penalties' },
        { value: 'penalties', label: 'Penalties straightaway (no extra time)' },
      ],
    },
    { key: 'extraTimeMinutes', label: 'Extra-time half length', type: 'number', default: 15, min: 1, max: 30, advanced: true, hint: 'used only when the decider is “Extra time, then penalties”' },
    { key: 'extraTimeSubs', label: 'Extra substitutions in extra time', type: 'count', default: 1, min: 0, max: 3, advanced: true },
  ],
};

const ctrl = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  editMin: { color: theme.colors.accent, fontWeight: '800', width: 34, fontSize: theme.font.small },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  editEdit: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  editBanner: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700', backgroundColor: theme.colors.accent + '22', padding: theme.spacing(2), borderRadius: theme.radius.sm },
  editRemove: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  subBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  extrasHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  clockTime: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', letterSpacing: 1 },
  penRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  penTeam: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', width: 110 },
  penDot: { fontSize: 18, marginRight: 2 },
  flowPanel: { gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4) },
  actionBtn: { paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3) },
  table: { borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  prow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  prowSel: { backgroundColor: theme.colors.surfaceAlt },
  jersey: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  jerseyTxt: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small },
  pname: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  ppos: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  addedBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  endNudge: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800', textAlign: 'center' },
  voiceBar: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  voiceHeard: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', fontStyle: 'italic' },
  voiceFeedback: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  pickRow: { flexDirection: 'row', gap: theme.spacing(3) },
  pickCol: { flex: 1, gap: theme.spacing(2) },
  pickTeam: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  possTrack: { height: 8, borderRadius: 4, backgroundColor: theme.colors.away, overflow: 'hidden' },
  possFill: { height: 8, borderRadius: 4 },
  extraTabs: { flexDirection: 'row', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, padding: 3 },
  extraTab: { flex: 1, textAlign: 'center', paddingVertical: theme.spacing(2), borderRadius: theme.radius.pill, color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', overflow: 'hidden' },
  extraTabActive: { backgroundColor: theme.colors.primary, color: '#06120D', fontWeight: '800' },
});

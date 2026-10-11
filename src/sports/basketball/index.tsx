/**
 * Basketball plugin — archetype: running-points, with the same live-event depth
 * as football: a per-quarter game clock, play-by-play timeline, player-attributed
 * baskets (1/2/3), rebounds, assists and fouls, and a live box score.
 *
 * The pure reducer can't read the clock, so the controls stamp each event's
 * quarter + minute via `payload`.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip } from '../../components/ui';
import { askConfirm, confirmMatchAction } from '../../components/ConfirmSheet';
import { GameFlowCard } from '../../components/GameFlowCard';
import { Timeline } from './Timeline';
import { MatchBoxScore } from '../../components/BoxScore';
import { basketballBox } from '../boxSources';
import { basketballStatTotals, shotsTracked } from './totals';
import { creditAttribution, eventCredits, ftCredits, isFieldGoal, makeCredits, missCredits, reboundCredits } from './credits';
import { BB_META, DQ_LABEL, FOUL_LABEL, pointsOf, type BBEvent, type DqReason, type FoulType, type ReboundType } from './events';
import type { Player } from '../../core/types';
import type { LiveSettings, ScoreAction, SportPlugin } from '../types';
import { basketballVoice } from '../voiceParsers';
import { courtFormation, makeCourt } from '../courts';
import { LineScoreboard } from '../../components/LineScoreboard';
import { usePendingEdit } from '../usePendingEdit';
import { BackfillBar, RowAction, confirmRemove } from '../TimelineControls';

import {
  type BasketballState, init, reducer, periodLabel, currentMinute,
  isFouledOut, isPlayerOut, isEjected, inBonus, timeoutStatus, onCourtNames, teamFoulsThisQuarter,
  disqualifyingFoul, freeThrowsFor,
} from "./engine";

/** SD-117 (B12): the foul-type chips, FIBA's U and D included. */
const FOUL_TYPES: FoulType[] = ['personal', 'shooting', 'offensive', 'technical', 'unsportsmanlike', 'disqualifying', 'flagrant'];

/* ------------------------------- Controls ---------------------------------- */

const Row = ({ label, roster, onPick, disabledFor }: { label: string; roster: Player[]; onPick: (p: Player) => void; disabledFor?: (p: Player) => boolean }) => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={ctrl.label}>{label}</Text>
    {roster.length > 0 ? (
      <View style={ctrl.chips}>
        {roster.map((p) => (
          <SelectChip key={p.id} label={p.fullName} active={false} disabled={disabledFor?.(p)} onPress={() => onPick(p)} />
        ))}
      </View>
    ) : (
      <Text style={ctrl.meta}>No roster set.</Text>
    )}
  </View>
);

/** A multi-step capture in progress: free throws, foul-type pick, off/def rebound,
 *  a substitution, or setting the starting five. */
type Flow =
  | { kind: 'ft'; side: 'home' | 'away'; shooter?: Player; reason?: string; remaining?: number; total?: number }
  // SD-117 (B3): a player picked first, then the action — no row of look-alike chips to mis-tap
  | { kind: 'act'; side: 'home' | 'away'; player: Player }
  | { kind: 'foul'; side: 'home' | 'away'; fouler?: Player }
  | { kind: 'rebound'; side: 'home' | 'away'; player: Player }
  | { kind: 'sub'; side: 'home' | 'away'; off?: string }
  | { kind: 'setFive'; side: 'home' | 'away'; picked: string[] }
  | null;

const ScoringControls: SportPlugin<BasketballState>['ScoringControls'] = ({
  state: liveState,
  dispatch: rawDispatch,
  homeName,
  awayName,
  homeRoster = [],
  awayRoster = [],
}) => {
  // SD-114: ✎ Edit holds the removal until the re-entry commits (Cancel keeps
  // the play); `state` is the view as if it were removed. See usePendingEdit.
  const { view: state, dispatch, begin: holdRemoval, cancel: dropHeldRemoval } = usePendingEdit(liveState, rawDispatch, reducer);
  const [sel, setSel] = useState<{ home?: Player; away?: Player }>({});
  // Timeline correction: edit one past play in place, or backfill a missed one.
  const [showEdit, setShowEdit] = useState(false);
  const [edit, setEdit] = useState<BBEvent | null>(null); // the play being re-entered
  const [editSel, setEditSel] = useState<Player | null>(null); // scorer chosen while editing a basket
  const [backfillQ, setBackfillQ] = useState<number | null>(null); // stamp new plays into this quarter
  // Multi-step captures (free throws, foul type, rebound off/def, sub, starting five).
  const [flow, setFlow] = useState<Flow>(null);
  const [showSubs, setShowSubs] = useState(false);
  // SD-117 (B6): right after a made basket — "Assist?" for the on-court teammates
  const [assistFor, setAssistFor] = useState<{ side: 'home' | 'away'; scorer?: Player; points: number } | null>(null);

  // Half-court small-sided ball (3×3 / 2v2 / 1v1 — all first-to-N) scores 1s and
  // 2s only: a made shot is 1, from behind the arc it's 2. Full-court games keep
  // the 1/2/3 buttons (used as-is when re-entering an old play).
  const halfCourt = state.targetPoints > 0;
  const pointValues = halfCourt ? [1, 2] : [1, 2, 3];

  // While editing, stamp the re-entered play at the original moment; while
  // backfilling, at the chosen quarter; otherwise live.
  const stampFor = () =>
    edit ? { quarter: edit.quarter, minute: edit.minute } : backfillQ != null ? { quarter: backfillQ, minute: 0 } : { quarter: state.quarter, minute: currentMinute(state) };
  // Any other play closes the "Assist?" prompt (a make re-opens it after).
  const fire = (action: ScoreAction) => {
    setAssistFor(null);
    dispatch({ ...action, payload: { ...action.payload, ...stampFor() } });
  };

  // SD-31: "Track missed shots" (live settings) — Miss buttons, and every make
  // counts as an attempt (`fga`) so FGA / FG% / EFF are complete.
  const tracking = state.trackMisses === true;
  // SD-40: the credited player's id rides in `pid` so statTotals keys by id.
  const pidOf = (p?: Player) => (p ? { pid: p.id } : {});
  // SD-116 (B1): the picked scorer is for ONE shot — cleared after each make /
  // miss, so the next basket isn't silently credited to the previous player.
  const clearSel = (side: 'home' | 'away') => setSel((cur) => (cur[side] ? { ...cur, [side]: undefined } : cur));
  const score = (side: 'home' | 'away', pts: number, p: Player | undefined = sel[side], fga = tracking) => {
    clearSel(side);
    fire({
      type: 'SCORE',
      side,
      payload: { points: pts, ...(fga ? { fga: true } : {}), ...pidOf(p) },
      attribution: p ? creditAttribution(p.id, p.fullName, makeCredits(pts, halfCourt, fga)) : undefined,
    });
    // SD-117 (B6): a made field goal asks "Assist?" (live plays only, not an edit)
    if (!edit && isFieldGoal(pts, halfCourt)) setAssistFor({ side, scorer: p, points: pts });
  };
  const miss = (side: 'home' | 'away', pts: number, p: Player | undefined = sel[side]) => {
    clearSel(side);
    fire({ type: 'MISS', side, payload: { points: pts, ...pidOf(p) }, attribution: p ? creditAttribution(p.id, p.fullName, missCredits(pts)) : undefined });
  };
  const stat = (side: 'home' | 'away', type: string, key: string, p: Player) =>
    fire({ type, side, payload: pidOf(p), attribution: { playerId: p.id, stat: key, playerName: p.fullName } });

  // ----- Correct the timeline: remove / edit one specific past play -----
  const STAT_KEY: Record<string, string> = { rebound: 'rebounds', assist: 'assists', foul: 'fouls', steal: 'steals', block: 'blocks', turnover: 'turnovers' };
  // Which plays can be re-entered in place (single-player stat plays). Free
  // throws (made/miss), timeouts and subs are remove-only.
  const canEdit = (e: BBEvent) => !!e.playerName && (e.type === 'score' || !!STAT_KEY[e.type]);
  const rosterId = (nm?: string) => (nm ? state.ids?.[nm] : undefined) ?? [...homeRoster, ...awayRoster].find((p) => p.fullName === nm)?.id;
  const removal = (e: BBEvent): ScoreAction => {
    // Reverse exactly what the play credited (credits.ts — FG / 3P / misses /
    // OREB-DREB included), so the lines match the log again.
    const pid = rosterId(e.playerName);
    const attribution = pid ? creditAttribution(pid, e.playerName, eventCredits(e, halfCourt, shotsTracked(state)), -1) : undefined;
    return { type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution };
  };
  const removeEvent = (e: BBEvent) => dispatch(removal(e));
  // Edit = remove the old play, then re-enter it stamped at the same moment so
  // the score and every player tally re-adjust to match. SD-114: the removal is
  // held until the re-entry commits — Cancel keeps the play.
  const editEvent = (e: BBEvent) => { holdRemoval([removal(e)]); setShowEdit(false); setEditSel(null); setEdit(e); };
  const cancelEdit = () => { dropHeldRemoval(); setEdit(null); setEditSel(null); };
  const commitEdit = (p: Player, points?: number) => {
    if (!edit) return;
    if (edit.type === 'score') score(edit.side, points ?? 0, p, shotsTracked(state));
    else if (edit.type === 'rebound') fire({ type: 'REBOUND', side: edit.side, payload: { ...(edit.reboundType ? { reboundType: edit.reboundType } : {}), ...pidOf(p) }, attribution: creditAttribution(p.id, p.fullName, reboundCredits(edit.reboundType)) });
    else if (edit.type === 'foul') fire({ type: 'FOUL', side: edit.side, payload: { foulType: edit.foulType ?? 'personal', ...pidOf(p) }, attribution: { playerId: p.id, stat: 'fouls', playerName: p.fullName } });
    else stat(edit.side, edit.type.toUpperCase(), STAT_KEY[edit.type], p);
    setEdit(null); setEditSel(null);
  };

  // ----- Multi-step captures -----
  const opp = (side: 'home' | 'away') => (side === 'home' ? 'away' : 'home');
  const nameOf = (side: 'home' | 'away') => (side === 'home' ? homeName : awayName);
  const rosterOf = (side: 'home' | 'away') => (side === 'home' ? homeRoster : awayRoster);
  // SD-117 (B9): once the on-court five is tracked, player rows list just them
  // (the bench can't score, rebound or foul) — no long scroll past the squad.
  const courtOf = (side: 'home' | 'away'): Player[] => {
    const roster = rosterOf(side);
    const five = state.onCourt ? onCourtNames(state, side) : [];
    if (!five.length) return roster;
    const on = roster.filter((p) => five.includes(p.fullName));
    return on.length ? on : roster;
  };

  // Free throw — one attempt; the panel stays open so 2- and 3-shot trips are quick.
  const freeThrow = (side: 'home' | 'away', made: boolean, shooter?: Player) =>
    fire({
      type: 'FREE_THROW', side, payload: { made, ...pidOf(shooter) },
      attribution: shooter ? creditAttribution(shooter.id, shooter.fullName, ftCredits(made)) : undefined,
    });

  // SD-116 (B2): ejection asks first (ConfirmSheet), then logs EJECT.
  const eject = async (side: 'home' | 'away', p: Player) => {
    if (!(await confirmMatchAction('eject', { what: p.fullName }))) return;
    fireEject(side, p);
    setFlow(null);
  };
  const fireEject = (side: 'home' | 'away', p: Player, reason?: DqReason) =>
    fire({ type: 'EJECT', side, payload: { ...pidOf(p), ...(reason ? { reason } : {}) }, attribution: { playerId: p.id, stat: 'ejections', playerName: p.fullName } });

  // Foul — logged with its type. SD-117: it flows straight into the other
  // side's free throws with the count prefilled (B11: technical 1, shooting /
  // U / D / flagrant 2) — and a personal foul once the fouling side is over the
  // team-foul limit opens the bonus 2 (B8). A D foul, or a 2nd T / 2nd U / T + U,
  // disqualifies (B12): asked first in the ConfirmSheet, then logged + ejected.
  const recordFoul = async (side: 'home' | 'away', fouler: Player, type: FoulType) => {
    const dq = disqualifyingFoul(state, fouler.fullName, type);
    if (dq && !(await confirmMatchAction('eject', {
      what: fouler.fullName,
      detail: `${FOUL_LABEL[type]} — that's ${DQ_LABEL[dq]}, so the rules disqualify ${fouler.fullName}. The foul is logged and the player is ejected. Undo can bring it back.`,
    }))) return;
    const shots = freeThrowsFor(state, side, type);
    const bonus = shots > 0 && (type === 'personal');
    fire({ type: 'FOUL', side, payload: { foulType: type, ...pidOf(fouler) }, attribution: { playerId: fouler.id, stat: 'fouls', playerName: fouler.fullName } });
    if (dq) fireEject(side, fouler, dq);
    if (shots > 0) {
      const why = bonus ? `Bonus — ${nameOf(side)} are over the team-foul limit` : `${FOUL_LABEL[type]} foul on ${fouler.fullName}`;
      setFlow({ kind: 'ft', side: opp(side), remaining: shots, total: shots, reason: `${why}${dq ? ` · ${fouler.fullName} disqualified` : ''} — ${shots} free throw${shots > 1 ? 's' : ''} for ${nameOf(opp(side))}` });
    } else setFlow(null);
  };

  const recordRebound = (side: 'home' | 'away', player: Player, rt: ReboundType) => {
    fire({ type: 'REBOUND', side, payload: { reboundType: rt, ...pidOf(player) }, attribution: creditAttribution(player.id, player.fullName, reboundCredits(rt)) });
    setFlow(null);
  };

  const recordSub = (side: 'home' | 'away', offName: string, onName: string) => {
    // SD-29: the ids ride along so minutes / +/- reach the right stat lines.
    const offId = rosterOf(side).find((p) => p.fullName === offName)?.id;
    const onId = rosterOf(side).find((p) => p.fullName === onName)?.id;
    fire({ type: 'SUB', side, payload: { offName, onName, ...(offId ? { offId } : {}), ...(onId ? { onId } : {}) } });
    setFlow(null);
  };

  const confirmFive = (side: 'home' | 'away', picked: string[]) => {
    const ids = Object.fromEntries(rosterOf(side).filter((p) => picked.includes(p.fullName)).map((p) => [p.fullName, p.id]));
    dispatch({ type: 'SET_LINEUP', payload: { [side]: picked, ...(Object.keys(ids).length ? { ids } : {}) } });
    setFlow(null);
  };

  // The active-flow panel (free throws / foul type / rebound off-def / sub / five).
  const renderFlow = () => {
    if (!flow) return null;
    const nm = nameOf(flow.side);
    const cancel = <Button label="Cancel" variant="ghost" onPress={() => setFlow(null)} />;
    if (flow.kind === 'ft') {
      const roster = courtOf(flow.side);
      // Count-aware mode: once the number of shots is known, each Made/Miss
      // auto-advances and the panel closes on the last shot — no "Done" tap.
      const counted = flow.remaining != null && flow.total != null;
      const shoot = (made: boolean) => {
        freeThrow(flow.side, made, flow.shooter);
        if (counted) {
          const left = (flow.remaining ?? 1) - 1;
          if (left <= 0) setFlow(null);
          else setFlow({ ...flow, remaining: left });
        }
      };
      return (
        <View style={ctrl.editPanel}>
          <View style={ctrl.editHead}><Text style={ctrl.label}>🎯 Free throws — {nm}</Text>{cancel}</View>
          {flow.reason && <Text style={ctrl.editBanner}>{flow.reason}</Text>}
          {roster.length > 0 && (
            <>
              <Text style={ctrl.meta}>Shooter{flow.shooter ? `: ${flow.shooter.fullName}` : ' (optional)'}</Text>
              <View style={ctrl.chips}>
                {roster.map((p) => (
                  <SelectChip key={p.id} label={p.fullName} active={flow.shooter?.id === p.id} disabled={fouledOut(p)}
                    onPress={() => setFlow({ ...flow, shooter: flow.shooter?.id === p.id ? undefined : p })} />
                ))}
              </View>
            </>
          )}
          {!counted ? (
            // Pick how many shots — then the panel counts them down for you.
            <>
              <Text style={ctrl.meta}>How many free throws?</Text>
              <View style={ctrl.row}>
                {[1, 2, 3].map((n) => (
                  <Button key={n} label={n === 1 ? '1 (and-one / tech)' : `${n} shots`} variant="ghost" style={ctrl.flex}
                    onPress={() => setFlow({ ...flow, remaining: n, total: n })} />
                ))}
              </View>
              <View style={ctrl.row}>
                <Button label="✅ Made +1" variant={flow.side} style={ctrl.flex} onPress={() => freeThrow(flow.side, true, flow.shooter)} />
                <Button label="❌ Miss" variant="ghost" style={ctrl.flex} onPress={() => freeThrow(flow.side, false, flow.shooter)} />
              </View>
              <Button label="Done" onPress={() => setFlow(null)} />
            </>
          ) : (
            <>
              {/* SD-117 (B11): the count is prefilled from the foul — change it before the first shot */}
              {flow.remaining === flow.total && (
                <View style={ctrl.chips}>
                  <Text style={ctrl.meta}>Shots:</Text>
                  {[1, 2, 3].map((n) => (
                    <SelectChip key={n} label={String(n)} active={flow.total === n} onPress={() => setFlow({ ...flow, remaining: n, total: n })} />
                  ))}
                </View>
              )}
              <Text style={ctrl.meta}>Shot {(flow.total ?? 1) - (flow.remaining ?? 1) + 1} of {flow.total} — tap the outcome</Text>
              <View style={ctrl.row}>
                <Button label="✅ Made +1" variant={flow.side} style={ctrl.flex} onPress={() => shoot(true)} />
                <Button label="❌ Miss" variant="ghost" style={ctrl.flex} onPress={() => shoot(false)} />
              </View>
            </>
          )}
        </View>
      );
    }
    if (flow.kind === 'foul') {
      const roster = courtOf(flow.side);
      return (
        <View style={ctrl.editPanel}>
          <View style={ctrl.editHead}><Text style={ctrl.label}>🟨 Foul — {nm}</Text>{cancel}</View>
          {!flow.fouler ? (
            <>
              <Text style={ctrl.meta}>Who committed it?</Text>
              <View style={ctrl.chips}>
                {roster.map((p) => (
                  <SelectChip key={p.id} label={p.fullName} active={false} disabled={fouledOut(p)} onPress={() => setFlow({ ...flow, fouler: p })} />
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={ctrl.meta}>{flow.fouler.fullName} — what kind of foul?</Text>
              <View style={ctrl.chips}>
                {FOUL_TYPES.map((t) => (
                  <SelectChip key={t} label={FOUL_LABEL[t]} active={false} onPress={() => void recordFoul(flow.side, flow.fouler!, t)} />
                ))}
              </View>
              <Text style={ctrl.meta}>Free throws open next with the count filled in: technical 1; shooting, U, D, flagrant 2; a personal foul in the bonus 2. A D foul, or a 2nd T / 2nd U / T + U, disqualifies (asks first).</Text>
              {/* SD-116 (B2): ejecting is a separate, confirmed step — set well
                  apart from the foul-type chips so a slip can't disqualify. */}
              <View style={ctrl.ejectZone}>
                <Text style={ctrl.meta}>Not a foul to log — sending the player off?</Text>
                <Button label={`🟥 Eject ${flow.fouler.fullName}…`} variant="ghost"
                  onPress={() => void eject(flow.side, flow.fouler!)} />
              </View>
            </>
          )}
        </View>
      );
    }
    if (flow.kind === 'act') {
      // SD-117 (B3): the player is already picked — one labelled tap logs the stat.
      const { side, player } = flow;
      const one = (type: string, key: string) => { stat(side, type, key, player); setFlow(null); };
      return (
        <View style={ctrl.editPanel}>
          <View style={ctrl.editHead}><Text style={ctrl.label} numberOfLines={1}>📋 {player.fullName} — {nm}</Text>{cancel}</View>
          <View style={ctrl.row}>
            <Button label="🔁 Def. rebound" variant={side} style={ctrl.flex} onPress={() => recordRebound(side, player, 'def')} />
            <Button label="🔁 Off. rebound" variant="ghost" style={ctrl.flex} onPress={() => recordRebound(side, player, 'off')} />
          </View>
          <View style={ctrl.row}>
            <Button label="🅰️ Assist" variant="ghost" style={ctrl.flex} onPress={() => one('ASSIST', 'assists')} />
            <Button label="✋ Steal" variant="ghost" style={ctrl.flex} onPress={() => one('STEAL', 'steals')} />
          </View>
          <View style={ctrl.row}>
            <Button label="🛡️ Block" variant="ghost" style={ctrl.flex} onPress={() => one('BLOCK', 'blocks')} />
            <Button label="🔄 Turnover" variant="ghost" style={ctrl.flex} onPress={() => one('TURNOVER', 'turnovers')} />
          </View>
          <Button label="🟨 Foul…" variant="ghost" onPress={() => setFlow({ kind: 'foul', side, fouler: player })} />
        </View>
      );
    }
    if (flow.kind === 'rebound') {
      return (
        <View style={ctrl.editPanel}>
          <View style={ctrl.editHead}><Text style={ctrl.label}>🔁 Rebound — {flow.player.fullName}</Text>{cancel}</View>
          <View style={ctrl.row}>
            <Button label="Defensive" variant={flow.side} style={ctrl.flex} onPress={() => recordRebound(flow.side, flow.player, 'def')} />
            <Button label="Offensive" variant="ghost" style={ctrl.flex} onPress={() => recordRebound(flow.side, flow.player, 'off')} />
          </View>
        </View>
      );
    }
    if (flow.kind === 'sub') {
      const roster = rosterOf(flow.side);
      const five = state.onCourt ? onCourtNames(state, flow.side) : null;
      const offOptions = five ?? roster.map((p) => p.fullName);
      const benchNames = five ? roster.map((p) => p.fullName).filter((n) => !five.includes(n)) : roster.map((p) => p.fullName).filter((n) => n !== flow.off);
      return (
        <View style={ctrl.editPanel}>
          <View style={ctrl.editHead}><Text style={ctrl.label}>🔀 Substitution — {nm}</Text>{cancel}</View>
          {!flow.off ? (
            <>
              <Text style={ctrl.meta}>Who comes off?</Text>
              <View style={ctrl.chips}>
                {offOptions.map((n) => (
                  <SelectChip key={n} label={n} active={false} onPress={() => setFlow({ ...flow, off: n })} />
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={ctrl.meta}>Who comes on for {flow.off}?</Text>
              <View style={ctrl.chips}>
                {benchNames.length > 0 ? benchNames.map((n) => (
                  <SelectChip key={n} label={n} active={false} onPress={() => recordSub(flow.side, flow.off!, n)} />
                )) : <Text style={ctrl.meta}>No bench players available.</Text>}
              </View>
            </>
          )}
        </View>
      );
    }
    // setFive — pick who starts on court
    const roster = rosterOf(flow.side);
    const toggle = (n: string) => setFlow({ ...flow, picked: flow.picked.includes(n) ? flow.picked.filter((x) => x !== n) : [...flow.picked, n] });
    return (
      <View style={ctrl.editPanel}>
        <View style={ctrl.editHead}><Text style={ctrl.label}>🏀 On court — {nm}</Text>{cancel}</View>
        <Text style={ctrl.meta}>Tap the {state.regPeriods === 1 ? '' : 'five '}players starting on court.</Text>
        <View style={ctrl.chips}>
          {roster.map((p) => (
            <SelectChip key={p.id} label={p.fullName} active={flow.picked.includes(p.fullName)} onPress={() => toggle(p.fullName)} />
          ))}
        </View>
        <Button label={`Confirm (${flow.picked.length})`} disabled={flow.picked.length === 0} onPress={() => confirmFive(flow.side, flow.picked)} />
      </View>
    );
  };

  // Foul-out enforcement (format: foulsToFoulOut). A disqualified player is
  // greyed out everywhere and can't be credited further actions.
  // "Out" = fouled out OR ejected — both grey the player out and block credit.
  const fouledOut = (p: Player) => isPlayerOut(state, p.fullName);
  const outNames = [...homeRoster, ...awayRoster].filter(fouledOut)
    .map((p) => `${p.fullName}${isEjected(state, p.fullName) ? ' (ejected)' : ''}`);
  // Team-foul bonus (format: foulsForBonus): once a side has committed that many
  // team fouls in a period, the opponent shoots free throws on every further foul
  // (FIBA: from the 5th). Under FIBA, overtime fouls count with the last quarter.
  const homeBonus = inBonus(state, 'home');
  const awayBonus = inBonus(state, 'away');
  const homeTF = teamFoulsThisQuarter(state, 'home');
  const awayTF = teamFoulsThisQuarter(state, 'away');
  const foulPeriod = state.quarter > state.regPeriods && state.otFoulsCarry
    ? `${periodLabel(state.quarter, state.regPeriods)} (carried from ${periodLabel(state.regPeriods, state.regPeriods)})`
    : periodLabel(state.quarter, state.regPeriods);

  // Shown while any overtime period is live (quarter 5+).
  const otBanner = state.quarter > state.regPeriods ? (
    <View style={ctrl.otBanner}>
      <Text style={ctrl.otTitle}>🏀 OVERTIME{state.quarter > 5 ? ` ${state.quarter - 4}` : ''}</Text>
      <Text style={ctrl.otMeta}>{state.overtimeMinutes}-minute period · score carries over · still level ⇒ another OT</Text>
    </View>
  ) : null;

  if (!state.startedAt && !state.ended && !edit) {
    return (
      <View style={{ gap: theme.spacing(3) }}>
        {otBanner}
        <Text style={ctrl.meta}>Tip off {periodLabel(state.quarter, state.regPeriods)} to start the clock.</Text>
        <Button label={`▶ Start ${periodLabel(state.quarter, state.regPeriods)}`} onPress={() => dispatch({ type: 'KICKOFF', payload: { at: Date.now() } })} />
      </View>
    );
  }

  // In-place edit of one past play: re-pick the player (and points, for a basket)
  // stamped at the original moment. The old play was already reversed on entry.
  if (edit) {
    const roster = edit.side === 'home' ? homeRoster : awayRoster;
    const nm = edit.side === 'home' ? homeName : awayName;
    return (
      <View style={ctrl.editPanel}>
        <View style={ctrl.editHead}>
          <Text style={ctrl.label}>✎ Re-enter {BB_META[edit.type].label} — {nm}</Text>
          <Button label="Cancel" variant="ghost" onPress={cancelEdit} />
        </View>
        <Text style={ctrl.editBanner}>Re-entering the Q{edit.quarter} {edit.minute}&apos; moment — your pick replaces the old one.</Text>
        <Text style={ctrl.meta}>{edit.type === 'score' ? 'Who scored?' : 'Which player?'}</Text>
        <View style={ctrl.chips}>
          {roster.map((p) => (
            <SelectChip key={p.id} label={p.fullName} active={editSel?.id === p.id} disabled={fouledOut(p)}
              onPress={() => (edit.type === 'score' ? setEditSel(p) : commitEdit(p))} />
          ))}
        </View>
        {edit.type === 'score' && editSel && (
          <View style={ctrl.row}>
            {pointValues.map((n) => (
              <Button key={n} label={`+${n}`} variant={edit.side} style={ctrl.flex} onPress={() => commitEdit(editSel, n)} />
            ))}
          </View>
        )}
      </View>
    );
  }

  // SD-114: pinned at the top of the controls while backfilling.
  const backfillBar = backfillQ != null
    ? <BackfillBar at={periodLabel(backfillQ, state.regPeriods)} onLive={() => setBackfillQ(null)} /> : null;

  // A capture is mid-flow (free throws, foul type, rebound off/def, sub, five).
  if (flow) return backfillBar ? <View style={{ gap: theme.spacing(3) }}>{backfillBar}{renderFlow()}</View> : renderFlow();

  // SD-57: timeouts left in the current window (FIBA 2 / 3 / 1 per OT, NBA,
  // or a per-game count; null = not tracked), at the moment the play is stamped.
  const toStatus = (side: 'home' | 'away') => timeoutStatus(state, side, stampFor());
  const timeoutLabel = (side: 'home' | 'away') => {
    const left = toStatus(side).left;
    return left == null ? `⏱️ Timeout — ${nameOf(side)}` : `⏱️ Timeout — ${nameOf(side)} (${left})`;
  };
  // Over the allowance: asked first (the clock is the scorer's, so it's a
  // warning, not a block) — "No" keeps scoring.
  const callTimeout = async (side: 'home' | 'away') => {
    const t = toStatus(side);
    if (t.left != null && t.left <= 0) {
      const why = t.late
        ? `${nameOf(side)} have used the most allowed in the last minutes of ${periodLabel(state.regPeriods, state.regPeriods)}.`
        : t.window === 'game'
          ? `${nameOf(side)} have used all ${t.allowance} timeout${t.allowance === 1 ? '' : 's'}.`
          : `${nameOf(side)} have used their ${t.allowance} for the ${t.window} — unused timeouts don't carry over.`;
      if (!(await askConfirm({ title: 'No timeouts left', message: `${why} Log one anyway?`, yesLabel: 'Log anyway', noLabel: 'No, keep scoring', tone: 'caution' }))) return;
    }
    fire({ type: 'TIMEOUT', side });
  };
  const toLine = (['home', 'away'] as const).map((side) => ({ side, t: toStatus(side) }));
  const toTracked = toLine.some(({ t }) => t.left != null);

  const ScoreSide = ({ side, name, variant }: { side: 'home' | 'away'; name: string; variant: 'home' | 'away' }) => {
    const roster = courtOf(side);
    const selected = sel[side];
    return (
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>🏀 Basket — {name}{selected ? ` · for ${selected.fullName}` : ''}</Text>
        {roster.length > 0 && !selected ? <Text style={ctrl.meta}>Tap the scorer first — or the basket goes to the team.</Text> : null}
        {roster.length > 0 && (
          <View style={ctrl.chips}>
            {roster.map((p) => (
              <SelectChip key={p.id} label={fouledOut(p) ? `${p.fullName} 🚫` : p.fullName} active={selected?.id === p.id} disabled={fouledOut(p)}
                onPress={() => setSel((s) => ({ ...s, [side]: selected?.id === p.id ? undefined : p }))} />
            ))}
          </View>
        )}
        <View style={ctrl.row}>
          {/* SD-05: in a full-court game the only 1-point play is a free throw, so
              "+1 FT" logs a made free throw (FTM/FTA counted), not a 1-pt basket. */}
          {pointValues.map((n) => (
            !halfCourt && n === 1
              ? <Button key={n} label="+1 FT" variant={variant} style={ctrl.flex} onPress={() => { clearSel(side); freeThrow(side, true, selected); }} />
              : <Button key={n} label={`+${n}`} variant={variant} style={ctrl.flex} onPress={() => score(side, n)} />
          ))}
        </View>
        {/* SD-31: missed field goals — one tap, the selected player optional. */}
        {tracking && (
          <View style={ctrl.row}>
            {(halfCourt ? [1, 2] : [2, 3]).map((n) => (
              <Button key={n} label={`⭕ Miss ${n}`} variant="ghost" style={ctrl.flex} onPress={() => miss(side, n)} />
            ))}
          </View>
        )}
        {/* And-one: score the basket AND open the bonus free throw for the scorer.
            SD-117 (B10): a 3 + 1 too (half-court: 1 + 1 and 2 + 1). */}
        <View style={ctrl.row}>
          {(halfCourt ? [1, 2] : [2, 3]).map((n) => (
            <Button key={n} label={`🔗 And-one +${n}`} variant="ghost" style={ctrl.flex}
              onPress={() => { score(side, n); setFlow({ kind: 'ft', side, shooter: selected, remaining: 1, total: 1, reason: `And-one — +${n} and the bonus free throw` }); }} />
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={{ gap: theme.spacing(4) }}>
      {backfillBar}
      {/* SD-117 (B6): "Assist?" right after a make — the on-court teammates, or Skip */}
      {assistFor && (() => {
        const mates = courtOf(assistFor.side).filter((p) => p.id !== assistFor.scorer?.id && !fouledOut(p));
        if (!mates.length) return null;
        return (
          <View style={ctrl.assistBox}>
            <View style={ctrl.editHead}>
              <Text style={[ctrl.label, ctrl.flex]} numberOfLines={2}>🅰️ Assist on {assistFor.scorer ? `${assistFor.scorer.fullName}'s` : 'the'} +{assistFor.points}?</Text>
              <Button label="Skip" variant="ghost" onPress={() => setAssistFor(null)} />
            </View>
            <View style={ctrl.chips}>
              {mates.map((p) => (
                <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => stat(assistFor.side, 'ASSIST', 'assists', p)} />
              ))}
            </View>
          </View>
        );
      })()}
      {otBanner}
      {outNames.length > 0 && (
        <Text style={ctrl.fouledOut}>🚫 Out: {outNames.join(', ')}</Text>
      )}
      {state.foulsForBonus > 0 && (
        <Text style={ctrl.meta}>Team fouls {foulPeriod} · {homeName} {homeTF} · {awayName} {awayTF}</Text>
      )}
      {homeBonus && (
        <Text style={ctrl.bonus}>🎯 BONUS · {homeName} shoots free throws on every foul ({awayName}: {awayTF} team fouls)</Text>
      )}
      {awayBonus && (
        <Text style={ctrl.bonus}>🎯 BONUS · {awayName} shoots free throws on every foul ({homeName}: {homeTF} team fouls)</Text>
      )}
      <ScoreSide side="home" name={homeName} variant="home" />
      <ScoreSide side="away" name={awayName} variant="away" />

      {/* Free throws — always available: shooting foul, and-one, technical, bonus. */}
      <View style={ctrl.row}>
        <Button label={`🎯 Free throws — ${homeName}`} variant="home" style={ctrl.flex} onPress={() => setFlow({ kind: 'ft', side: 'home' })} />
        <Button label={`🎯 Free throws — ${awayName}`} variant="away" style={ctrl.flex} onPress={() => setFlow({ kind: 'ft', side: 'away' })} />
      </View>

      {/* SD-117 (B3): one row per side — tap the player, then the action
          (rebound / assist / steal / block / turnover / foul) in a labelled panel. */}
      {(['home', 'away'] as const).map((side) => (
        <Row key={side} label={`📋 Rebound · assist · steal · block · TO · foul — ${nameOf(side)}`} roster={courtOf(side)}
          onPick={(p) => setFlow({ kind: 'act', side, player: p })} disabledFor={fouledOut} />
      ))}
      <Text style={ctrl.meta}>Tap the player first, then pick what they did.</Text>

      {/* Timeouts — SD-57: what's left in this half / OT, per team */}
      {toTracked && (
        <Text style={ctrl.meta} accessibilityLabel="Timeouts left">
          ⏱️ Timeouts left{toLine[0].t.window !== 'game' ? ` (${toLine[0].t.window})` : ''}: {homeName} {toLine[0].t.left} · {awayName} {toLine[1].t.left}
          {toLine.some(({ t }) => t.late) ? ' · last-minutes limit' : ''}
        </Text>
      )}
      <View style={ctrl.row}>
        <Button label={timeoutLabel('home')} variant="ghost" style={ctrl.flex} onPress={() => void callTimeout('home')} />
        <Button label={timeoutLabel('away')} variant="ghost" style={ctrl.flex} onPress={() => void callTimeout('away')} />
      </View>

      {/* Substitutions — optional on-court tracking */}
      <View style={{ gap: theme.spacing(2) }}>
        <View style={ctrl.editHead}>
          <Text style={ctrl.label}>🔀 Substitutions</Text>
          <Button label={showSubs ? 'Done' : 'Manage'} variant="ghost" onPress={() => setShowSubs((v) => !v)} />
        </View>
        {showSubs && (['home', 'away'] as const).map((side) => {
          const five = state.onCourt ? onCourtNames(state, side) : null;
          return (
            <View key={side} style={ctrl.addedBox}>
              <Text style={ctrl.label}>{nameOf(side)}</Text>
              {five ? (
                <>
                  <Text style={ctrl.meta}>On court: {five.join(', ') || '—'}</Text>
                  <View style={ctrl.row}>
                    <Button label="🔀 Substitute" variant="ghost" style={ctrl.flex} onPress={() => setFlow({ kind: 'sub', side })} />
                    <Button label="Edit five" variant="ghost" style={ctrl.flex} onPress={() => setFlow({ kind: 'setFive', side, picked: five })} />
                  </View>
                </>
              ) : (
                <>
                  <Text style={ctrl.meta}>Set who&apos;s on court to track subs live — or just log a quick sub.</Text>
                  <View style={ctrl.row}>
                    <Button label="Set five" variant="ghost" style={ctrl.flex} onPress={() => setFlow({ kind: 'setFive', side, picked: [] })} />
                    <Button label="🔀 Quick sub" variant="ghost" style={ctrl.flex} onPress={() => setFlow({ kind: 'sub', side })} />
                  </View>
                </>
              )}
            </View>
          );
        })}
      </View>

      {/* ⏪ Backfill a play the scorer missed earlier — stamp it into a past quarter. */}
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>⏪ Backfill a missed play</Text>
        {backfillQ == null ? (
          <>
            <Text style={ctrl.meta}>Missed a basket or foul earlier? Pick the quarter — everything you log is stamped there until you go back to live.</Text>
            <View style={ctrl.chips}>
              {Array.from({ length: Math.min(state.quarter, 8) }, (_, i) => i + 1).map((q) => (
                <SelectChip key={q} label={periodLabel(q, state.regPeriods)} active={false} onPress={() => setBackfillQ(q)} />
              ))}
            </View>
          </>
        ) : (
          <View style={ctrl.addedBox}>
            <Text style={ctrl.label}>⏪ Backfilling into {periodLabel(backfillQ, state.regPeriods)}</Text>
            <Text style={ctrl.meta}>Every play you log now is stamped in {periodLabel(backfillQ, state.regPeriods)}. Log it above, then go back to live.</Text>
            <Button label="Back to live scoring" variant="ghost" onPress={() => setBackfillQ(null)} />
          </View>
        )}
      </View>

      {/* 🗓 Correct the timeline — remove or edit one specific past play. */}
      {state.events.length > 0 && (
        <View style={{ gap: theme.spacing(2) }}>
          <View style={ctrl.editHead}>
            <Text style={ctrl.label}>🗓 Correct the timeline</Text>
            <Button label={showEdit ? 'Done' : 'Edit'} variant="ghost" onPress={() => setShowEdit((v) => !v)} />
          </View>
          {showEdit && (
            <View style={{ gap: theme.spacing(1) }}>
              <Text style={ctrl.meta}>Tap ✎ Edit to re-pick the player/points (stamped at the same moment — every tally re-adjusts; Cancel keeps it as it was), or ✕ to remove it (asks first).</Text>
              {[...state.events].sort((a, b) => b.quarter - a.quarter || b.minute - a.minute || b.id - a.id).map((e) => (
                <View key={e.id} style={ctrl.editRow}>
                  <Text style={ctrl.editMin}>{periodLabel(e.quarter, state.regPeriods)}</Text>
                  <Text style={ctrl.editLabel} numberOfLines={1}>{BB_META[e.type].icon} {BB_META[e.type].label}{e.type === 'score' ? ` +${e.points}` : e.type === 'miss' ? ` ${e.points}` : ''}{e.type === 'freethrow' ? (e.made ? ' ✅' : ' ❌') : ''}{e.playerName ? ` — ${e.playerName}` : ''}{e.type === 'sub' && e.onName ? ` ▸ ${e.onName}` : ''}</Text>
                  {canEdit(e) && <RowAction label="✎ Edit" tone="edit" a11y={`Edit ${BB_META[e.type].label}`} onPress={() => editEvent(e)} />}
                  <RowAction label="✕" tone="remove" a11y={`Remove ${BB_META[e.type].label}`}
                    onPress={() => void confirmRemove(`${BB_META[e.type].label}${e.type === 'score' ? ` +${e.points}` : ''}${e.playerName ? ` — ${e.playerName}` : ''} (${periodLabel(e.quarter, state.regPeriods)})`, () => removeEvent(e))} />
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {state.quarter < state.regPeriods ? (
        <Button label={`End ${periodLabel(state.quarter, state.regPeriods)} →`}
          onPress={async () => { if (await confirmMatchAction('endPeriod', { period: periodLabel(state.quarter, state.regPeriods), score: `${state.home}-${state.away}` })) dispatch({ type: 'NEXT_QUARTER' }); }} />
      ) : state.home === state.away ? (
        // Level at the end of Q4 or an OT period → play (another) overtime.
        // SD-57: a draw only where the format allows one (league / friendly
        // option); otherwise ending level asks first and offers overtime.
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.meta}>Scores level ({state.home}–{state.away}) at the end of {periodLabel(state.quarter, state.regPeriods)}{state.allowDraw ? ' — this format allows a draw.' : ' — basketball plays overtime until there is a winner.'}</Text>
          <Button label={`🏀 Start Overtime (${periodLabel(state.quarter + 1, state.regPeriods)})`} onPress={() => dispatch({ type: 'START_OVERTIME' })} />
          {state.allowDraw ? (
            <Button label="End as a draw" variant="ghost" onPress={async () => { if (await confirmMatchAction('endTie', { drawWord: 'Draw', score: `${state.home}-${state.away}` })) dispatch({ type: 'END' }); }} />
          ) : (
            <Button label="End level, no overtime…" variant="ghost" onPress={async () => {
              if (await askConfirm({
                title: 'End the game level?',
                message: `It's ${state.home}-${state.away}. This format plays overtime when level — end as a draw only if the organiser's rules allow it.`,
                yesLabel: 'Yes, end as a draw', noLabel: 'No, go back', tone: 'danger',
              })) dispatch({ type: 'END' });
            }} />
          )}
        </View>
      ) : (
        <Button label="🏁 End Match" variant="danger" onPress={async () => { if (await confirmMatchAction('fullTime', { score: `${state.home}-${state.away}` })) dispatch({ type: 'END' }); }} />
      )}
    </View>
  );
};

/* ------------------------------ Live panel --------------------------------- */

const LiveClock: NonNullable<SportPlugin<BasketballState>['LiveClock']> = ({ state }) => {
  const s = state as BasketballState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s.startedAt || s.ended) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.startedAt, s.ended]);

  const running = !!s.startedAt && !s.ended;
  const per = periodLabel(s.quarter, s.regPeriods);
  const label = s.ended ? (s.quarter > s.regPeriods ? `Final · ${per}` : 'Final') : !s.startedAt ? `${per} ·` : `${per} · ${currentMinute(s)}'`;
  return (
    <View style={ctrl.clockRow}>
      <View style={[ctrl.liveDot, { backgroundColor: running ? theme.colors.danger : theme.colors.textMuted }]} />
      <Text style={ctrl.clockTime}>{label}</Text>
    </View>
  );
};

const LiveExtras: NonNullable<SportPlugin<BasketballState>['LiveExtras']> = ({
  state,
  homeName,
  awayName,
  homeColor,
  awayColor,
  homeRoster,
  awayRoster,
  homeLineup,
  awayLineup,
  onPlayer,
}) => {
  const s = state as BasketballState;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>Play-by-play</Text>
      <Timeline events={s.events} homeColor={homeColor} awayColor={awayColor} homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
      <Text style={ctrl.label}>Box score</Text>
      <MatchBoxScore sport="basketball" source={basketballBox(s, { homeRoster, awayRoster, homeName, awayName })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
      {/* SD-50: biggest lead, lead changes, times tied, runs, bench points */}
      <GameFlowCard sport="basketball" state={s} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} homeLineup={homeLineup} awayLineup={awayLineup} />
    </View>
  );
};

/** Broadcast-style board: the TOTAL score + a column of points per quarter, the
 *  live quarter highlighted — the line score TV graphics show. */
const BasketballScoreboard: NonNullable<SportPlugin<BasketballState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as BasketballState;
  const nQ = Math.max(1, s.quarter);
  const columns = Array.from({ length: nQ }, (_, i) => ({ label: periodLabel(i + 1, s.regPeriods), highlight: !s.ended && i + 1 === s.quarter }));
  const pts = (side: 'home' | 'away', q: number) =>
    s.events.filter((e) => e.side === side && e.quarter === q).reduce((a, e) => a + pointsOf(e), 0);
  return (
    <LineScoreboard
      live={live}
      clock={<LiveClock state={s} />}
      leadLabel="TOTAL"
      columns={columns}
      winner={s.ended ? (s.home >= s.away ? 'home' : 'away') : undefined}
      home={{ name: homeName, color: homeColor ?? theme.colors.home, lead: String(s.home), cells: columns.map((_, i) => String(pts('home', i + 1))) }}
      away={{ name: awayName, color: awayColor ?? theme.colors.away, lead: String(s.away), cells: columns.map((_, i) => String(pts('away', i + 1))) }}
    />
  );
};

/** SD-31 — the scorer's coverage toggle (config mode: patches the match
 *  format; each make records its own `fga`, so past plays keep their credit). */
const BASKETBALL_LIVE_SETTINGS: LiveSettings<BasketballState> = {
  title: '⚙️ Scoring settings',
  hint: 'Capture only what this scorer can keep up with — applies to this match only.',
  mode: 'config',
  fields: [{ key: 'trackMisses', label: 'Track missed shots', type: 'toggle', default: false, group: 'Stats captured', hint: 'Miss 2 / Miss 3 buttons — FG%, 3P% and full EFF' }],
  read: (s) => ({ trackMisses: s.trackMisses === true }),
  defaults: { trackMisses: false },
};

export const basketballPlugin: SportPlugin<BasketballState> = {
  id: 'basketball',
  name: 'Basketball',
  icon: '🏀',
  archetype: 'running-points',
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  // SD-40 (BK-05): every box key from the log (credits.ts) + SD-29 MIN and
  // +/-, set absolutely at completion and after corrections. Partial: an older
  // log whose players can't all be resolved to ids keeps the box keys on live
  // increments (only MIN / +/- are synced).
  statTotals: basketballStatTotals,
  statTotalsPartial: true,
  liveSettings: BASKETBALL_LIVE_SETTINGS,
  result: (s) => (s.ended ? { winner: s.home > s.away ? 'home' : s.away > s.home ? 'away' : 'draw', home: s.home, away: s.away } : null),
  Scoreboard: BasketballScoreboard,
  summary: (s) => ({
    homeScore: String(s.home),
    awayScore: String(s.away),
    statusLine: s.ended ? (s.quarter > s.regPeriods ? `Final · ${periodLabel(s.quarter, s.regPeriods)}` : 'Final') : periodLabel(s.quarter, s.regPeriods),
  }),
  ScoringControls,
  LiveClock,
  LiveExtras,
  formation: () => courtFormation('basketball'),
  Court: makeCourt('basketball'),
  voice: { hints: ['two {name}', 'three {name}', 'miss three {name}', 'free throw {name}', 'rebound {name}', 'steal {name}', 'block {name}', 'foul {name}'], parse: basketballVoice },
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'fiba',
      options: [
        { value: 'fiba', label: 'FIBA (4×10)', set: { playersPerSide: 5, substitutes: 5, regPeriods: 4, periodMinutes: 10, foulsToFoulOut: 5, foulsForBonus: 4, techIsTeamFoul: true, otFoulsCarry: true, overtimeMinutes: 5, targetPoints: 0, winBy: 2, shotClock: 24, timeouts: 5, timeoutRule: 'fiba' } },
        { value: 'nba', label: 'NBA (4×12)', set: { playersPerSide: 5, substitutes: 5, regPeriods: 4, periodMinutes: 12, foulsToFoulOut: 6, foulsForBonus: 4, techIsTeamFoul: false, otFoulsCarry: false, overtimeMinutes: 5, targetPoints: 0, winBy: 2, shotClock: 24, timeouts: 7, timeoutRule: 'nba' } },
        { value: 'ncaa', label: 'NCAA (2×20 halves)', set: { playersPerSide: 5, substitutes: 7, regPeriods: 2, periodMinutes: 20, foulsToFoulOut: 5, foulsForBonus: 6, techIsTeamFoul: true, otFoulsCarry: true, overtimeMinutes: 5, targetPoints: 0, winBy: 2, shotClock: 30, timeouts: 4, timeoutRule: 'game' } },
        { value: '3x3', label: '3×3 (first to 21)', set: { playersPerSide: 3, substitutes: 1, regPeriods: 1, periodMinutes: 10, foulsToFoulOut: 0, foulsForBonus: 6, techIsTeamFoul: true, otFoulsCarry: true, overtimeMinutes: 0, targetPoints: 21, winBy: 1, shotClock: 12, timeouts: 1, timeoutRule: 'game' } },
        { value: '2v2', label: '2v2 (first to 15)', set: { playersPerSide: 2, substitutes: 1, regPeriods: 1, periodMinutes: 10, foulsToFoulOut: 0, foulsForBonus: 7, techIsTeamFoul: true, otFoulsCarry: true, overtimeMinutes: 0, targetPoints: 15, winBy: 2, shotClock: 0, timeouts: 0, timeoutRule: 'game' } },
        { value: '1v1', label: '1v1 (first to 11)', set: { playersPerSide: 1, substitutes: 0, regPeriods: 1, periodMinutes: 10, foulsToFoulOut: 0, foulsForBonus: 0, overtimeMinutes: 0, targetPoints: 11, winBy: 2, shotClock: 0, timeouts: 0, timeoutRule: 'game' } },
        { value: 'school', label: 'School (4×8)', set: { playersPerSide: 5, substitutes: 7, regPeriods: 4, periodMinutes: 8, foulsToFoulOut: 5, foulsForBonus: 4, techIsTeamFoul: true, otFoulsCarry: true, overtimeMinutes: 4, targetPoints: 0, winBy: 2, shotClock: 24, timeouts: 4, timeoutRule: 'fiba' } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 5, min: 1, max: 11, hint: '5 standard · 3 for 3×3' },
    {
      key: 'regPeriods', label: 'Period structure', type: 'choice', default: 4,
      options: [
        { value: 4, label: '4 quarters' },
        { value: 2, label: '2 halves' },
        { value: 1, label: 'Single period (3×3)' },
      ],
    },
    { key: 'periodMinutes', label: 'Minutes per period', type: 'number', default: 10, min: 1, max: 24 },
    { key: 'targetPoints', label: 'First-to-N points', type: 'number', default: 0, min: 0, max: 50, advanced: true, hint: '0 = timed game · 21 for 3×3/streetball' },
    { key: 'substitutes', label: 'Substitutes per side', type: 'count', default: 5, min: 0, max: 11, advanced: true },
    { key: 'foulsToFoulOut', label: 'Fouls to foul out', type: 'number', default: 5, min: 0, max: 10, advanced: true, hint: '0 = no foul-out (3×3)' },
    // SD-05: the number of team fouls AFTER which the opponent shoots — FIBA/NBA 4
    // (free throws from the 5th). Old matches stored 5 and keep their behaviour.
    { key: 'foulsForBonus', label: 'Team fouls before free throws', type: 'number', default: 4, min: 1, max: 10, advanced: true, hint: 'FIBA 4: free throws from the 5th team foul in a quarter' },
    { key: 'techIsTeamFoul', label: 'Technical fouls count as team fouls', type: 'toggle', default: true, advanced: true, hint: 'FIBA yes · NBA no' },
    { key: 'otFoulsCarry', label: 'Overtime team fouls carry over from the last quarter', type: 'toggle', default: true, advanced: true, hint: 'FIBA yes · NBA resets' },
    { key: 'overtimeMinutes', label: 'Overtime length (min)', type: 'number', default: 5, min: 1, max: 10, advanced: true, hint: 'played when tied after regulation; repeats until decided' },
    { key: 'trackMisses', label: 'Track missed shots', type: 'toggle', default: false, hint: 'Miss 2 / Miss 3 buttons — FG%, 3P% and full EFF' },
    { key: 'shotClock', label: 'Shot clock (sec)', type: 'number', default: 24, min: 0, max: 35, advanced: true, hint: 'shown for reference' },
    {
      key: 'timeoutRule', label: 'Timeouts', type: 'choice', default: 'fiba', advanced: true,
      options: [
        { value: 'fiba', label: 'FIBA: 2 first half · 3 second half · 1 per OT' },
        { value: 'nba', label: 'NBA: 7 per game · 2 per OT' },
        { value: 'game', label: 'A set number per game' },
      ],
      hint: 'FIBA: at most 2 in the last 2 minutes; unused timeouts don’t carry over',
    },
    { key: 'timeouts', label: 'Timeouts per team (per game)', type: 'number', default: 0, min: 0, max: 9, advanced: true, hint: 'used when Timeouts = a set number per game · 0 = don’t track · 3×3: 1' },
    // SD-57: basketball never ends level unless the organiser's format says so
    { key: 'allowDraw', label: 'Allow a draw (league / friendly)', type: 'toggle', default: false, hint: 'Off: a level game goes to overtime' },
  ],
};

const ctrl = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  clockTime: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', letterSpacing: 1 },
  fouledOut: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
  bonus: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  otBanner: { backgroundColor: theme.colors.primary + '1A', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.primary, padding: theme.spacing(3), gap: theme.spacing(1) },
  otTitle: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '900', letterSpacing: 0.5 },
  otMeta: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  ejectZone: { gap: theme.spacing(2), marginTop: theme.spacing(5), paddingTop: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border },
  editPanel: { gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4) },
  editHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editBanner: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700', backgroundColor: theme.colors.accent + '22', padding: theme.spacing(2), borderRadius: theme.radius.sm },
  assistBox: { gap: theme.spacing(2), backgroundColor: theme.colors.primary + '14', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.primary, padding: theme.spacing(3) },
  addedBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  editMin: { color: theme.colors.accent, fontWeight: '800', width: 40, fontSize: theme.font.small },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
});

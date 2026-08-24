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
import { Timeline } from './Timeline';
import { BoxScore } from './BoxScore';
import { BB_META, FOUL_LABEL, pointsOf, type BBEvent, type FoulType, type ReboundType } from './events';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import { basketballVoice } from '../voiceParsers';
import { courtFormation, makeCourt } from '../courts';
import { LineScoreboard } from '../../components/LineScoreboard';

import {
  type BasketballState, init, reducer, periodLabel, currentMinute,
  isFouledOut, isPlayerOut, isEjected, inBonus, timeoutsUsed, onCourtNames,
} from "./engine";

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
  | { kind: 'ft'; side: 'home' | 'away'; shooter?: Player; reason?: string }
  | { kind: 'foul'; side: 'home' | 'away'; fouler?: Player }
  | { kind: 'rebound'; side: 'home' | 'away'; player: Player }
  | { kind: 'sub'; side: 'home' | 'away'; off?: string }
  | { kind: 'setFive'; side: 'home' | 'away'; picked: string[] }
  | null;

const ScoringControls: SportPlugin<BasketballState>['ScoringControls'] = ({
  state,
  dispatch,
  homeName,
  awayName,
  homeRoster = [],
  awayRoster = [],
}) => {
  const [sel, setSel] = useState<{ home?: Player; away?: Player }>({});
  // Timeline correction: edit one past play in place, or backfill a missed one.
  const [showEdit, setShowEdit] = useState(false);
  const [edit, setEdit] = useState<BBEvent | null>(null); // the play being re-entered
  const [editSel, setEditSel] = useState<Player | null>(null); // scorer chosen while editing a basket
  const [backfillQ, setBackfillQ] = useState<number | null>(null); // stamp new plays into this quarter
  // Multi-step captures (free throws, foul type, rebound off/def, sub, starting five).
  const [flow, setFlow] = useState<Flow>(null);
  const [showSubs, setShowSubs] = useState(false);

  // While editing, stamp the re-entered play at the original moment; while
  // backfilling, at the chosen quarter; otherwise live.
  const stampFor = () =>
    edit ? { quarter: edit.quarter, minute: edit.minute } : backfillQ != null ? { quarter: backfillQ, minute: 0 } : { quarter: state.quarter, minute: currentMinute(state) };
  const fire = (action: ScoreAction) =>
    dispatch({ ...action, payload: { ...action.payload, ...stampFor() } });

  const score = (side: 'home' | 'away', pts: number) => {
    const p = sel[side];
    fire({
      type: 'SCORE',
      side,
      payload: { points: pts },
      attribution: p ? { playerId: p.id, stat: 'points', by: pts, playerName: p.fullName } : undefined,
    });
  };
  const stat = (side: 'home' | 'away', type: string, key: string, p: Player) =>
    fire({ type, side, attribution: { playerId: p.id, stat: key, playerName: p.fullName } });

  // ----- Correct the timeline: remove / edit one specific past play -----
  const STAT_KEY: Record<string, string> = { rebound: 'rebounds', assist: 'assists', foul: 'fouls', steal: 'steals', block: 'blocks', turnover: 'turnovers' };
  // Which plays can be re-entered in place (single-player stat plays). Free
  // throws (made/miss), timeouts and subs are remove-only.
  const canEdit = (e: BBEvent) => !!e.playerName && (e.type === 'score' || !!STAT_KEY[e.type]);
  const rosterId = (nm?: string) => [...homeRoster, ...awayRoster].find((p) => p.fullName === nm)?.id;
  const removeEvent = (e: BBEvent) => {
    const pid = rosterId(e.playerName);
    let attribution: ScoreAction['attribution'];
    if (pid && e.type === 'score') attribution = { playerId: pid, stat: 'points', by: -(e.points ?? 0), playerName: e.playerName };
    else if (pid && e.type === 'freethrow') attribution = e.made
      ? { playerId: pid, stat: 'points', by: -1, playerName: e.playerName, extra: { freeThrowsMade: -1, freeThrowsAtt: -1 } }
      : { playerId: pid, stat: 'freeThrowsAtt', by: -1, playerName: e.playerName };
    else if (pid && STAT_KEY[e.type]) attribution = { playerId: pid, stat: STAT_KEY[e.type], by: -1, playerName: e.playerName };
    dispatch({ type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution });
  };
  // Edit = remove the old play, then re-enter it stamped at the same moment so
  // the score and every player tally re-adjust to match.
  const editEvent = (e: BBEvent) => { removeEvent(e); setShowEdit(false); setEditSel(null); setEdit(e); };
  const commitEdit = (p: Player, points?: number) => {
    if (!edit) return;
    if (edit.type === 'score') fire({ type: 'SCORE', side: edit.side, payload: { points }, attribution: { playerId: p.id, stat: 'points', by: points, playerName: p.fullName } });
    else fire({ type: edit.type.toUpperCase(), side: edit.side, attribution: { playerId: p.id, stat: STAT_KEY[edit.type], playerName: p.fullName } });
    setEdit(null); setEditSel(null);
  };

  // ----- Multi-step captures -----
  const opp = (side: 'home' | 'away') => (side === 'home' ? 'away' : 'home');
  const nameOf = (side: 'home' | 'away') => (side === 'home' ? homeName : awayName);
  const rosterOf = (side: 'home' | 'away') => (side === 'home' ? homeRoster : awayRoster);

  // Free throw — one attempt; the panel stays open so 2- and 3-shot trips are quick.
  const freeThrow = (side: 'home' | 'away', made: boolean, shooter?: Player) =>
    fire({
      type: 'FREE_THROW', side, payload: { made },
      attribution: shooter
        ? { playerId: shooter.id, stat: made ? 'points' : 'freeThrowsAtt', by: 1, playerName: shooter.fullName, extra: made ? { freeThrowsMade: 1, freeThrowsAtt: 1 } : undefined }
        : undefined,
    });

  // Foul — logged with its type; a shooting/technical/flagrant foul flows straight
  // into the opponent's free throws.
  const recordFoul = (side: 'home' | 'away', fouler: Player, type: FoulType) => {
    fire({ type: 'FOUL', side, payload: { foulType: type }, attribution: { playerId: fouler.id, stat: 'fouls', playerName: fouler.fullName } });
    if (type === 'shooting' || type === 'technical' || type === 'flagrant')
      setFlow({ kind: 'ft', side: opp(side), reason: `${FOUL_LABEL[type]} foul on ${fouler.fullName} — free throws for ${nameOf(opp(side))}` });
    else setFlow(null);
  };

  const recordRebound = (side: 'home' | 'away', player: Player, rt: ReboundType) => {
    fire({ type: 'REBOUND', side, payload: { reboundType: rt }, attribution: { playerId: player.id, stat: 'rebounds', playerName: player.fullName } });
    setFlow(null);
  };

  const recordSub = (side: 'home' | 'away', offName: string, onName: string) => {
    fire({ type: 'SUB', side, payload: { offName, onName } });
    setFlow(null);
  };

  const confirmFive = (side: 'home' | 'away', picked: string[]) => {
    dispatch({ type: 'SET_LINEUP', payload: { [side]: picked } });
    setFlow(null);
  };

  // The active-flow panel (free throws / foul type / rebound off-def / sub / five).
  const renderFlow = () => {
    if (!flow) return null;
    const nm = nameOf(flow.side);
    const cancel = <Button label="Cancel" variant="ghost" onPress={() => setFlow(null)} />;
    if (flow.kind === 'ft') {
      const roster = rosterOf(flow.side);
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
          <View style={ctrl.row}>
            <Button label="✅ Made +1" variant={flow.side} style={ctrl.flex} onPress={() => freeThrow(flow.side, true, flow.shooter)} />
            <Button label="❌ Miss" variant="ghost" style={ctrl.flex} onPress={() => freeThrow(flow.side, false, flow.shooter)} />
          </View>
          <Text style={ctrl.meta}>Tap once per attempt — 1 for an and-one/technical, 2 for a shooting foul, 3 from the arc.</Text>
          <Button label="Done" onPress={() => setFlow(null)} />
        </View>
      );
    }
    if (flow.kind === 'foul') {
      const roster = rosterOf(flow.side);
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
                {(['personal', 'shooting', 'technical', 'flagrant', 'offensive'] as FoulType[]).map((t) => (
                  <SelectChip key={t} label={FOUL_LABEL[t]} active={false} onPress={() => recordFoul(flow.side, flow.fouler!, t)} />
                ))}
              </View>
              <Text style={ctrl.meta}>Shooting, technical & flagrant fouls go to the free-throw line next.</Text>
              <Button label={`🟥 Eject ${flow.fouler.fullName}`} variant="danger"
                onPress={() => { fire({ type: 'EJECT', side: flow.side, attribution: { playerId: flow.fouler!.id, stat: 'ejections', playerName: flow.fouler!.fullName } }); setFlow(null); }} />
            </>
          )}
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
  // Team-foul bonus (format: foulsForBonus): once a side reaches the team-foul
  // limit in a quarter, the opponent shoots free throws.
  const homeBonus = inBonus(state, 'home');
  const awayBonus = inBonus(state, 'away');

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
          <Button label="Cancel" variant="ghost" onPress={() => { setEdit(null); setEditSel(null); }} />
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
            {[1, 2, 3].map((n) => (
              <Button key={n} label={`+${n}`} variant={edit.side} style={ctrl.flex} onPress={() => commitEdit(editSel, n)} />
            ))}
          </View>
        )}
      </View>
    );
  }

  // A capture is mid-flow (free throws, foul type, rebound off/def, sub, five).
  if (flow) return renderFlow();

  // Timeouts remaining (null = untracked/unlimited).
  const toLeft = (side: 'home' | 'away') => (state.timeouts > 0 ? state.timeouts - timeoutsUsed(state, side) : null);
  const timeoutLabel = (side: 'home' | 'away') => {
    const left = toLeft(side);
    return left == null ? `⏱️ Timeout — ${nameOf(side)}` : `⏱️ Timeout — ${nameOf(side)} (${left})`;
  };
  const timeoutSpent = (side: 'home' | 'away') => { const l = toLeft(side); return l != null && l <= 0; };

  const ScoreSide = ({ side, name, variant }: { side: 'home' | 'away'; name: string; variant: 'home' | 'away' }) => {
    const roster = side === 'home' ? homeRoster : awayRoster;
    const selected = sel[side];
    return (
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>🏀 Basket — {name}{selected ? ` · ${selected.fullName}` : ''}</Text>
        {roster.length > 0 && (
          <View style={ctrl.chips}>
            {roster.map((p) => (
              <SelectChip key={p.id} label={fouledOut(p) ? `${p.fullName} 🚫` : p.fullName} active={selected?.id === p.id} disabled={fouledOut(p)}
                onPress={() => setSel((s) => ({ ...s, [side]: selected?.id === p.id ? undefined : p }))} />
            ))}
          </View>
        )}
        <View style={ctrl.row}>
          {[1, 2, 3].map((n) => (
            <Button key={n} label={`+${n}`} variant={variant} style={ctrl.flex} onPress={() => score(side, n)} />
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={{ gap: theme.spacing(4) }}>
      {otBanner}
      {outNames.length > 0 && (
        <Text style={ctrl.fouledOut}>🚫 Out: {outNames.join(', ')}</Text>
      )}
      {(homeBonus || awayBonus) && (
        <Text style={ctrl.bonus}>
          🎯 BONUS · {homeBonus ? homeName : awayName} shoots free throws ({state.foulsForBonus} team fouls on {homeBonus ? awayName : homeName} this quarter)
        </Text>
      )}
      <ScoreSide side="home" name={homeName} variant="home" />
      <ScoreSide side="away" name={awayName} variant="away" />

      {/* Free throws — always available: shooting foul, and-one, technical, bonus. */}
      <View style={ctrl.row}>
        <Button label={`🎯 Free throws — ${homeName}`} variant="home" style={ctrl.flex} onPress={() => setFlow({ kind: 'ft', side: 'home' })} />
        <Button label={`🎯 Free throws — ${awayName}`} variant="away" style={ctrl.flex} onPress={() => setFlow({ kind: 'ft', side: 'away' })} />
      </View>

      <Row label={`🔁 Rebound — ${homeName}`} roster={homeRoster} onPick={(p) => setFlow({ kind: 'rebound', side: 'home', player: p })} disabledFor={fouledOut} />
      <Row label={`🔁 Rebound — ${awayName}`} roster={awayRoster} onPick={(p) => setFlow({ kind: 'rebound', side: 'away', player: p })} disabledFor={fouledOut} />
      <Row label={`🅰️ Assist — ${homeName}`} roster={homeRoster} onPick={(p) => stat('home', 'ASSIST', 'assists', p)} disabledFor={fouledOut} />
      <Row label={`🅰️ Assist — ${awayName}`} roster={awayRoster} onPick={(p) => stat('away', 'ASSIST', 'assists', p)} disabledFor={fouledOut} />
      <Row label={`✋ Steal — ${homeName}`} roster={homeRoster} onPick={(p) => stat('home', 'STEAL', 'steals', p)} disabledFor={fouledOut} />
      <Row label={`✋ Steal — ${awayName}`} roster={awayRoster} onPick={(p) => stat('away', 'STEAL', 'steals', p)} disabledFor={fouledOut} />
      <Row label={`🛡️ Block — ${homeName}`} roster={homeRoster} onPick={(p) => stat('home', 'BLOCK', 'blocks', p)} disabledFor={fouledOut} />
      <Row label={`🛡️ Block — ${awayName}`} roster={awayRoster} onPick={(p) => stat('away', 'BLOCK', 'blocks', p)} disabledFor={fouledOut} />
      <Row label={`🔄 Turnover — ${homeName}`} roster={homeRoster} onPick={(p) => stat('home', 'TURNOVER', 'turnovers', p)} disabledFor={fouledOut} />
      <Row label={`🔄 Turnover — ${awayName}`} roster={awayRoster} onPick={(p) => stat('away', 'TURNOVER', 'turnovers', p)} disabledFor={fouledOut} />
      <Row label={`🟨 Foul — ${homeName}`} roster={homeRoster} onPick={(p) => setFlow({ kind: 'foul', side: 'home', fouler: p })} disabledFor={fouledOut} />
      <Row label={`🟨 Foul — ${awayName}`} roster={awayRoster} onPick={(p) => setFlow({ kind: 'foul', side: 'away', fouler: p })} disabledFor={fouledOut} />

      {/* Timeouts */}
      <View style={ctrl.row}>
        <Button label={timeoutLabel('home')} variant="ghost" style={ctrl.flex} disabled={timeoutSpent('home')} onPress={() => fire({ type: 'TIMEOUT', side: 'home' })} />
        <Button label={timeoutLabel('away')} variant="ghost" style={ctrl.flex} disabled={timeoutSpent('away')} onPress={() => fire({ type: 'TIMEOUT', side: 'away' })} />
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
              <Text style={ctrl.meta}>Tap Edit to re-pick the player/points (stamped at the same moment — every tally re-adjusts), or Remove to delete it.</Text>
              {[...state.events].sort((a, b) => b.quarter - a.quarter || b.minute - a.minute || b.id - a.id).map((e) => (
                <View key={e.id} style={ctrl.editRow}>
                  <Text style={ctrl.editMin}>{periodLabel(e.quarter, state.regPeriods)}</Text>
                  <Text style={ctrl.editLabel} numberOfLines={1}>{BB_META[e.type].icon} {BB_META[e.type].label}{e.type === 'score' ? ` +${e.points}` : ''}{e.type === 'freethrow' ? (e.made ? ' ✅' : ' ❌') : ''}{e.playerName ? ` — ${e.playerName}` : ''}{e.type === 'sub' && e.onName ? ` ▸ ${e.onName}` : ''}</Text>
                  {canEdit(e) && <Text style={ctrl.editEdit} onPress={() => editEvent(e)}>✎ Edit</Text>}
                  <Text style={ctrl.editRemove} onPress={() => removeEvent(e)}>✕</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {state.quarter < state.regPeriods ? (
        <Button label={`End ${periodLabel(state.quarter, state.regPeriods)} →`} onPress={() => dispatch({ type: 'NEXT_QUARTER' })} />
      ) : state.home === state.away ? (
        // Level at the end of Q4 or an OT period → play (another) overtime; a draw
        // stays possible for formats that allow one.
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.meta}>Scores level ({state.home}–{state.away}) at the end of {periodLabel(state.quarter, state.regPeriods)}.</Text>
          <Button label={`🏀 Start Overtime (${periodLabel(state.quarter + 1, state.regPeriods)})`} onPress={() => dispatch({ type: 'START_OVERTIME' })} />
          <Button label="End as a draw" variant="ghost" onPress={() => dispatch({ type: 'END' })} />
        </View>
      ) : (
        <Button label="🏁 End Match" variant="danger" onPress={() => dispatch({ type: 'END' })} />
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
}) => {
  const s = state as BasketballState;
  // Periods played so far, for the box score's per-quarter toggle (Q1…, then OT).
  const periods = Array.from({ length: Math.max(1, s.quarter) }, (_, i) => ({ value: i + 1, label: periodLabel(i + 1, s.regPeriods) }));
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>Play-by-play</Text>
      <Timeline events={s.events} homeColor={homeColor} awayColor={awayColor} />
      <Text style={ctrl.label}>Box score</Text>
      <BoxScore events={s.events} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeColor={homeColor} awayColor={awayColor} periods={periods} />
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

export const basketballPlugin: SportPlugin<BasketballState> = {
  id: 'basketball',
  name: 'Basketball',
  icon: '🏀',
  archetype: 'running-points',
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
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
  voice: { hints: ['two {name}', 'three {name}', 'free throw {name}', 'rebound {name}', 'steal {name}', 'block {name}', 'foul {name}'], parse: basketballVoice },
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'fiba',
      options: [
        { value: 'fiba', label: 'FIBA (4×10)', set: { playersPerSide: 5, substitutes: 5, regPeriods: 4, periodMinutes: 10, foulsToFoulOut: 5, foulsForBonus: 5, overtimeMinutes: 5, targetPoints: 0, winBy: 2, shotClock: 24, timeouts: 5 } },
        { value: 'nba', label: 'NBA (4×12)', set: { playersPerSide: 5, substitutes: 5, regPeriods: 4, periodMinutes: 12, foulsToFoulOut: 6, foulsForBonus: 5, overtimeMinutes: 5, targetPoints: 0, winBy: 2, shotClock: 24, timeouts: 7 } },
        { value: 'ncaa', label: 'NCAA (2×20 halves)', set: { playersPerSide: 5, substitutes: 7, regPeriods: 2, periodMinutes: 20, foulsToFoulOut: 5, foulsForBonus: 7, overtimeMinutes: 5, targetPoints: 0, winBy: 2, shotClock: 30, timeouts: 4 } },
        { value: '3x3', label: '3×3 (first to 21)', set: { playersPerSide: 3, substitutes: 1, regPeriods: 1, periodMinutes: 10, foulsToFoulOut: 0, foulsForBonus: 7, overtimeMinutes: 0, targetPoints: 21, winBy: 1, shotClock: 12, timeouts: 1 } },
        { value: '2v2', label: '2v2 (first to 15)', set: { playersPerSide: 2, substitutes: 1, regPeriods: 1, periodMinutes: 10, foulsToFoulOut: 0, foulsForBonus: 7, overtimeMinutes: 0, targetPoints: 15, winBy: 2, shotClock: 0, timeouts: 0 } },
        { value: '1v1', label: '1v1 (first to 11)', set: { playersPerSide: 1, substitutes: 0, regPeriods: 1, periodMinutes: 10, foulsToFoulOut: 0, foulsForBonus: 0, overtimeMinutes: 0, targetPoints: 11, winBy: 2, shotClock: 0, timeouts: 0 } },
        { value: 'school', label: 'School (4×8)', set: { playersPerSide: 5, substitutes: 7, regPeriods: 4, periodMinutes: 8, foulsToFoulOut: 5, foulsForBonus: 5, overtimeMinutes: 4, targetPoints: 0, winBy: 2, shotClock: 24, timeouts: 4 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 5, min: 1, max: 11, hint: '5 standard · 3 for 3×3' },
    {
      key: 'regPeriods', label: 'Period structure', type: 'choice', default: 4, advanced: true,
      options: [
        { value: 4, label: '4 quarters' },
        { value: 2, label: '2 halves' },
        { value: 1, label: 'Single period (3×3)' },
      ],
    },
    { key: 'periodMinutes', label: 'Minutes per period', type: 'number', default: 10, min: 1, max: 24, advanced: true },
    { key: 'targetPoints', label: 'First-to-N points', type: 'number', default: 0, min: 0, max: 50, advanced: true, hint: '0 = timed game · 21 for 3×3/streetball' },
    { key: 'substitutes', label: 'Substitutes per side', type: 'count', default: 5, min: 0, max: 11, advanced: true },
    { key: 'foulsToFoulOut', label: 'Fouls to foul out', type: 'number', default: 5, min: 0, max: 10, advanced: true, hint: '0 = no foul-out (3×3)' },
    { key: 'foulsForBonus', label: 'Team fouls for bonus', type: 'number', default: 5, min: 1, max: 10, advanced: true, hint: 'opponent shoots free throws after this many team fouls' },
    { key: 'overtimeMinutes', label: 'Overtime length (min)', type: 'number', default: 5, min: 1, max: 10, advanced: true, hint: 'played when tied after regulation; repeats until decided' },
    { key: 'shotClock', label: 'Shot clock (sec)', type: 'number', default: 24, min: 0, max: 35, advanced: true, hint: 'shown for reference' },
    { key: 'timeouts', label: 'Timeouts per team', type: 'number', default: 0, min: 0, max: 9, advanced: true, hint: '0 = don’t track' },
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
  editPanel: { gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4) },
  editHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editBanner: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700', backgroundColor: theme.colors.accent + '22', padding: theme.spacing(2), borderRadius: theme.radius.sm },
  addedBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  editMin: { color: theme.colors.accent, fontWeight: '800', width: 40, fontSize: theme.font.small },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  editEdit: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  editRemove: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
});

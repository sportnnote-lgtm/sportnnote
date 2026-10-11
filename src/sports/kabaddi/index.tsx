/**
 * Kabaddi plugin — archetype: raid. Two timed halves with a running clock.
 * Raid and tackle points are attributed to players and logged to the timeline
 * with the match minute.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, TextField, textStyles } from '../../components/ui';
import { askConfirm, confirmMatchAction } from '../../components/ConfirmSheet';
import { FieldBanner } from '../FieldBanner';
import { LiveTimeline } from '../LiveTimeline';
import { MatchBoxScore } from '../../components/BoxScore';
import { kabaddiBox } from '../boxSources';
import type { LiveEvent } from '../liveEvents';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import { kabaddiVoice } from '../voiceParsers';
import { LineScoreboard } from '../../components/LineScoreboard';
import { courtFormation, makeCourt } from '../courts';
import { BackfillBar, RowAction, confirmRemove } from '../TimelineControls';
import { sum } from './rules';
import { kabaddiTotals, kabaddiSuspended } from './totals.ts';

import {
  init, reducer, currentMinute, halfLabel, previewRaid, raidOfEvent, raidReversals, raidActions, isRaidHead, kabaddiWinner, halfPoints, defendersOnMat,
  expectedRaider, outPlayers, clockPaused, timeoutsUsed, TIMEOUTS_PER_HALF, TACKLE_TYPES,
  formOutcome, matNow, unavailable, cardsOf, suggestedCard, TECH_REASONS, CARD_ICON,
  type KabaddiState, type KabaddiEvent, type CardColour,
} from './engine.ts';

export { halfLabel, currentMinute };
export type { KabaddiState };


const Row = ({ label, roster, onPick, onTeam }: { label: string; roster: Player[]; onPick: (p: Player) => void; onTeam?: () => void }) => (
  <View style={{ gap: theme.spacing(2) }}>
    <Text style={ctrl.label}>{label}</Text>
    <View style={ctrl.chips}>
      {roster.map((p) => <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => onPick(p)} />)}
      {/* Team point — no named player (friendly whose players aren't on the app yet). */}
      {onTeam && <SelectChip label={roster.length ? '＋ Team' : '＋ Team point (no players yet)'} active={false} onPress={onTeam} />}
    </View>
  </View>
);

/** On-mat status (SD-72: suspended / sent-off players aren't on the mat) and
 *  the suspension banner — re-rendered every second while a yellow runs. */
const MatStatus = ({ state, homeName, awayName }: { state: KabaddiState; homeName: string; awayName: string }) => {
  const [, tick] = useState(0);
  const suspended = kabaddiSuspended(state);
  const running = suspended.length > 0 && !clockPaused(state) && !!state.startedAt;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const m = matNow(state);
  const size = state.teamSize ?? 7;
  const chip = (side: 'home' | 'away', nm: string) => {
    const bits = [m.short[side] - m.sentOff[side] > 0 ? `${m.short[side] - m.sentOff[side]} suspended` : null, m.sentOff[side] ? `${m.sentOff[side]} sent off` : null].filter(Boolean).join(', ');
    return <Text key={side} style={ctrl.matChip}>🟢 {nm} on mat: {m.onMat[side]}/{size}{bits ? ` (${bits})` : ''}</Text>;
  };
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <View style={ctrl.matRow}>{chip('home', homeName)}{chip('away', awayName)}</View>
      <FieldBanner suspended={suspended.map((x) => ({ ...x, name: `${x.name} (${x.side === 'home' ? homeName : awayName})` }))} />
    </View>
  );
};

const ScoringControls: SportPlugin<KabaddiState>['ScoringControls'] = ({ state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [] }) => {
  const [sub, setSub] = useState<{ side: 'home' | 'away'; off?: Player } | null>(null);
  // Timeline correction: edit one past moment in place, or backfill a missed one.
  const [showEdit, setShowEdit] = useState(false);
  const [edit, setEdit] = useState<LiveEvent | null>(null); // a legacy raid/tackle point being re-entered
  const [backfillText, setBackfillText] = useState('');
  const [backfillMin, setBackfillMin] = useState<number | null>(null);
  // Guided raid capture: who raided, how many touched, bonus, was the raider caught.
  // `editOf` = re-entering a past guided raid (its id), stamped at its moment.
  const [raidFlow, setRaidFlow] = useState<{
    side: 'home' | 'away'; raider?: Player; touches: number; bonus: boolean; tackled: boolean; tackler?: Player;
    editOf?: number; at?: { minute: number; half: number }; tackleType?: string;
    /** SD-59: line-outs */
    defOut?: number; lineOut?: boolean;
  } | null>(null);
  // SD-59: a technical point (to `side`); SD-72: a card (to a player of `side`)
  const [tech, setTech] = useState<{ side?: 'home' | 'away'; reason?: string; by?: Player } | null>(null);
  const [card, setCard] = useState<{ side?: 'home' | 'away'; colour?: CardColour; who?: Player | 'official' | 'player'; tp: boolean; tpSet?: boolean } | null>(null);

  const hm = state.halfMinutes, et = state.extraTimeMinutes;
  const halfFromMin = (m: number): 1 | 2 | 3 | 4 => (m < hm ? 1 : m < 2 * hm ? 2 : m < 2 * hm + et ? 3 : 4);
  // While editing, stamp at the original moment; while backfilling, at the past
  // minute (its half derived); otherwise live.
  const stampFor = () =>
    raidFlow?.at ? raidFlow.at
    : edit ? { minute: edit.minute ?? 0, half: edit.half ?? state.half }
    : backfillMin != null ? { minute: backfillMin, half: halfFromMin(backfillMin) } : { minute: currentMinute(state), half: state.half };
  // SD-72: a live step also carries the time (suspensions run on the clock);
  // backfilled / edited steps keep their minute stamp only.
  const live = !raidFlow?.at && !edit && backfillMin == null;
  const fire = (action: ScoreAction) => dispatch({ ...action, payload: { ...action.payload, ...stampFor(), ...(live && state.startedAt ? { at: Date.now() } : null) } });
  // Pro-Kabaddi live figures, defensive against pre-upgrade state.
  const kEmpty = state.emptyRaids ?? { home: 0, away: 0 };

  // ----- Correct the timeline: remove / edit one specific past moment -----
  const STAT_KEY: Record<string, string> = { raid: 'raidPoints', tackle: 'tacklePoints' };
  const allPlayers = [...homeRoster, ...awayRoster];
  const rosterId = (nm?: string) => allPlayers.find((p) => p.fullName === nm)?.id;
  const byId = (id?: string, nm?: string) => allPlayers.find((p) => (id ? p.id === id : p.fullName === nm));
  const raidRev = (e: KabaddiEvent) => raidReversals(state, e, rosterId);
  const removeEvent = (e: KabaddiEvent) => {
    // A guided raid (any of its lines) goes as a whole — raid, tackle, all-out.
    if (e.group != null) {
      dispatch({ type: 'REMOVE_EVENT', side: e.side, payload: { id: e.group, v: 2 }, ...raidRev(e) });
      return;
    }
    const pid = rosterId(e.playerName);
    const attribution = pid && e.kind && STAT_KEY[e.kind]
      ? { playerId: pid, stat: STAT_KEY[e.kind], by: -(e.points ?? 1), playerName: e.playerName }
      : undefined;
    dispatch({ type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id, v: 2 }, attribution });
  };
  // SD-114: what a ✕ takes with it — a guided raid goes with its tackle / all-out lines.
  const removeDetail = (e: KabaddiEvent): string | undefined => {
    if (e.group == null) return undefined;
    const lines = state.events.filter((x) => x.group === e.group).map((x) => x.label.replace(/ — .*$/, ''));
    return lines.length > 1 ? `Removes all of it: ${lines.join(', ')}. The score, players on the mat and stats re-derive.` : undefined;
  };
  // Edit a guided raid = re-open the raid form pre-filled; saving re-dispatches a
  // RAID_OUTCOME that replaces it in place (same id, same slot in the raid order).
  // Edit a legacy point = re-pick the player. Nothing changes until you save.
  const editEvent = (e: KabaddiEvent) => {
    setShowEdit(false);
    const r = raidOfEvent(state, e);
    if (r) {
      const { raid } = r;
      setRaidFlow({
        side: raid.side, touches: raid.touches, bonus: raid.bonus, tackled: raid.raiderOut,
        raider: byId(raid.raiderId, raid.raider), tackler: raid.raiderOut ? byId(raid.tacklerId, raid.tackler) : undefined,
        tackleType: raid.raiderOut ? raid.tt : undefined,
        ...(raid.defOut ? { defOut: raid.defOut } : null), ...(raid.lineOut ? { lineOut: true } : null),
        editOf: raid.eid, at: { minute: raid.minute ?? 0, half: raid.half ?? state.half },
      });
      return;
    }
    setEdit(e);
  };
  const commitEdit = (p: Player) => {
    if (!edit || !edit.side || !edit.kind) return;
    removeEvent(edit);
    fire({ type: edit.kind.toUpperCase(), side: edit.side, payload: { points: edit.points ?? 1 }, attribution: { playerId: p.id, stat: STAT_KEY[edit.kind], by: edit.points ?? 1, playerName: p.fullName } });
    setEdit(null);
  };
  /** Log the guided raid (or its correction) — see raidActions. */
  const recordRaid = () => {
    if (!raidFlow) return;
    for (const action of raidActions(state, raidFlow, rosterId)) {
      if (action.type === 'REMOVE_EVENT') dispatch(action);
      else fire(action);
    }
    setRaidFlow(null);
  };

  // Players subbed off this match take no further part.
  const offNames = (side: 'home' | 'away') => state.subbedOff[side];
  const onField = (side: 'home' | 'away', roster: Player[]) => roster.filter((p) => !offNames(side).includes(p.fullName));
  // SD-72: sent off (red) / serving a yellow — can't raid, tackle or be substituted
  const unav = unavailable(state);
  const unavName = (side: 'home' | 'away', nm: string) => unav[side].find((x) => x.name === nm);
  const rosterFor = (side: 'home' | 'away') => (side === 'home' ? homeRoster : awayRoster);
  const subsLeft = (side: 'home' | 'away') => state.maxSubs - state.subsUsed[side];

  if (!state.startedAt && !state.ended && !state.goldenRaid && !edit && raidFlow?.editOf == null) {
    const startLabel = state.half === 1 ? '▶ Start match' : state.half === 2 ? '▶ Start 2nd half' : `▶ Start ${halfLabel(state.half)}`;
    const startHint = state.half === 1 ? 'Start the match to run the clock.' : state.half === 2 ? 'Half time.' : state.half === 3 ? 'Extra time — first half.' : 'Extra time — second half.';
    return (
      <View style={{ gap: theme.spacing(3) }}>
        <Text style={ctrl.meta}>{startHint}</Text>
        <Button label={startLabel} onPress={() => dispatch({ type: 'KICKOFF', payload: { at: Date.now() } })} />
      </View>
    );
  }

  // Substitution flow (format: substitutes) — pick who comes off, then who comes on.
  // SD-114 (P0): pinned at the top of the controls while backfilling — every
  // raid is stamped at the past minute until the scorer goes back to live.
  const backToLive = () => { setBackfillMin(null); setBackfillText(''); };
  const backfillBar = backfillMin != null && !raidFlow?.at && !edit
    ? <BackfillBar at={`${backfillMin}′ (${halfLabel(halfFromMin(backfillMin))})`} onLive={backToLive} /> : null;

  if (sub) {
    const sideName = sub.side === 'home' ? homeName : awayName;
    const offOpts = onField(sub.side, rosterFor(sub.side)).filter((p) => !unavName(sub.side, p.fullName));
    // SD-117b (format: subReturn): a player substituted earlier may come back on.
    const onOpts = rosterFor(sub.side).filter((p) => p.id !== sub.off?.id && !unavName(sub.side, p.fullName) && (state.subReturn || !offNames(sub.side).includes(p.fullName)));
    return (
      <View style={{ gap: theme.spacing(3) }}>
      {backfillBar}
      <View style={ctrl.subPanel}>
        <View style={ctrl.subHead}>
          <Text style={ctrl.label}>🔄 Substitution — {sideName}</Text>
          <Button label="Cancel" variant="ghost" onPress={() => setSub(null)} />
        </View>
        {!sub.off ? (
          <>
            <Text style={ctrl.meta}>{state.subReturn ? 'Who comes off? (may come back on later, within the limit)' : 'Who comes off? (takes no further part)'}</Text>
            <View style={ctrl.chips}>
              {offOpts.map((p) => <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => setSub({ ...sub, off: p })} />)}
            </View>
          </>
        ) : (
          <>
            <Text style={ctrl.meta}>Who comes on for {sub.off.fullName}?</Text>
            {onOpts.length > 0 ? (
              <View style={ctrl.chips}>
                {onOpts.map((p) => (
                  <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => {
                    fire({ type: 'SUB', side: sub.side, payload: { offName: sub.off!.fullName, onName: p.fullName } });
                    setSub(null);
                  }} />
                ))}
              </View>
            ) : <Text style={textStyles.muted}>No available substitute in the squad.</Text>}
          </>
        )}
      </View>
      </View>
    );
  }

  // In-place edit of one past raid/tackle: re-pick the player, stamped at the
  // original moment. The old point was already reversed on entry.
  if (edit) {
    const roster = onField(edit.side!, edit.side === 'home' ? homeRoster : awayRoster);
    const nm = edit.side === 'home' ? homeName : awayName;
    return (
      <View style={ctrl.subPanel}>
        <View style={ctrl.subHead}>
          <Text style={ctrl.label}>✎ Re-enter {edit.kind === 'tackle' ? 'Tackle' : 'Raid'} point — {nm}</Text>
          <Button label="Cancel" variant="ghost" onPress={() => setEdit(null)} />
        </View>
        <Text style={ctrl.editBanner}>Re-entering the {edit.minute}&apos; moment — your pick replaces the old one.</Text>
        <Text style={ctrl.meta}>Who got the point?</Text>
        <View style={ctrl.chips}>
          {roster.map((p) => <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => commitEdit(p)} />)}
        </View>
      </View>
    );
  }

  const tied = state.home === state.away;
  const paused = clockPaused(state);
  const expected = expectedRaider(state);
  const outNow = outPlayers(state);

  // 5-raid shootout tie-breaker: record each raid's points per side; the panel
  // decides the winner (best-of-5, then sudden death) and ends the match.
  if (state.shootout && !state.ended) {
    const so = state.shootout;
    const raidRow = (side: 'home' | 'away', label: string) => (
      <View key={side} style={{ gap: theme.spacing(1) }}>
        <Text style={ctrl.label}>🎯 {label} — {sum(so[side])} pts ({so[side].length}/5)</Text>
        <View style={ctrl.row}>
          {[0, 1, 2, 3].map((n) => (
            <Button key={n} label={n === 0 ? 'Empty' : `+${n}`} variant={n === 0 ? 'ghost' : side} style={ctrl.flex}
              onPress={() => fire({ type: 'SHOOTOUT_RAID', side, payload: { points: n } })} />
          ))}
        </View>
      </View>
    );
    return (
      <View style={{ gap: theme.spacing(4) }}>
        <View style={ctrl.grBanner}>
          <Text style={ctrl.grTitle}>🎯 5-RAID SHOOTOUT</Text>
          <Text style={ctrl.grMeta}>Level {state.home}–{state.away}. Each side takes five raids — most points wins (then sudden death). Tap the points each raid scores.</Text>
        </View>
        {raidRow('home', homeName)}
        {raidRow('away', awayName)}
        <Button label="End as a tie" variant="ghost" onPress={async () => { if (await confirmMatchAction('endTie', { drawWord: 'Tie', score: `${state.home}-${state.away}` })) dispatch({ type: 'END' }); }} />
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing(4) }}>
      {backfillBar}
      {state.goldenRaid && (
        <View style={ctrl.grBanner}>
          <Text style={ctrl.grTitle}>⚡ GOLDEN RAID — SUDDEN DEATH</Text>
          <Text style={ctrl.grMeta}>Scores level {state.home}–{state.away}. The next point wins it — log the raid or tackle that decides the match.</Text>
        </View>
      )}
      {/* On-mat status: players in = teamSize − out − carded; suspensions count down. */}
      <MatStatus state={state} homeName={homeName} awayName={awayName} />

      {/* SD-117b: pause the clock for a timeout / injury / review; team timeouts */}
      {!state.goldenRaid && (
        <View style={{ gap: theme.spacing(2) }}>
          {paused && (
            <Text style={ctrl.pausedBanner} accessibilityLiveRegion="polite">⏸ Clock paused at {currentMinute(state)}′ — resume when play restarts.</Text>
          )}
          <View style={ctrl.row}>
            <Button label={paused ? '▶ Resume clock' : '⏸ Pause clock'} variant={paused ? 'primary' : 'ghost'} style={ctrl.flex}
              onPress={() => dispatch({ type: paused ? 'RESUME' : 'PAUSE', payload: { at: Date.now() } })} />
          </View>
          <View style={ctrl.row}>
            {(['home', 'away'] as const).map((side) => {
              const left = Math.max(0, TIMEOUTS_PER_HALF - timeoutsUsed(state, side));
              return (
                <Button key={side} label={`⏱️ Timeout — ${side === 'home' ? homeName : awayName} (${left} left)`} variant="ghost" style={ctrl.flex} disabled={left === 0}
                  onPress={() => {
                    fire({ type: 'TIMEOUT', side });
                    // the clock stops for a timeout
                    if (!paused && backfillMin == null) dispatch({ type: 'PAUSE', payload: { at: Date.now() } });
                  }} />
              );
            })}
          </View>
        </View>
      )}

      {!raidFlow ? (
        <View style={ctrl.row}>
          {(['home', 'away'] as const).map((side) => {
            // SD-117b: raids alternate — the side due to raid is highlighted, the
            // other is a quiet button; ⚠ DoD when its next raid is do-or-die.
            const dod = (state.proRules ?? true) && kEmpty[side] >= 2;
            const due = expected === side;
            const nm = side === 'home' ? homeName : awayName;
            return (
              <Button key={side} label={`🤼 ${nm} raiding${dod ? ' · ⚠ DoD' : ''}${due ? ' ◀ next' : ''}`}
                variant={expected && !due ? 'ghost' : side} style={ctrl.flex}
                accessibilityHint={due ? 'Expected to raid next' : undefined}
                onPress={() => setRaidFlow({ side, touches: 0, bonus: false, tackled: false })} />
            );
          })}
        </View>
      ) : (
        <View style={ctrl.raidPanel}>
          <View style={ctrl.subHead}>
            <Text style={ctrl.label}>{raidFlow.editOf != null ? '✎' : '🤼'} {raidFlow.side === 'home' ? homeName : awayName} raiding</Text>
            <Button label="Cancel" variant="ghost" onPress={() => setRaidFlow(null)} />
          </View>
          {raidFlow.at && <Text style={ctrl.editBanner}>Editing the {raidFlow.at.minute}&apos; raid — saving replaces it in place.</Text>}
          {raidFlow.editOf == null && (state.proRules ?? true) && kEmpty[raidFlow.side] >= 2 && (
            <Text style={ctrl.doOrDie}>⚠ DO-OR-DIE raid — the raider is out if this raid scores nothing.</Text>
          )}
          {onField(raidFlow.side, raidFlow.side === 'home' ? homeRoster : awayRoster).length > 0 && (
            <>
              <Text style={ctrl.meta}>Raider (optional)</Text>
              <View style={ctrl.chips}>
                {onField(raidFlow.side, raidFlow.side === 'home' ? homeRoster : awayRoster).map((p) => {
                  // SD-117b: tap again to clear; a player who's out can't raid (dimmed)
                  const un = raidFlow.editOf == null ? unavName(raidFlow.side, p.fullName) : undefined;
                  const isOut = raidFlow.editOf == null && (outNow[raidFlow.side].includes(p.fullName) || !!un);
                  const on = raidFlow.raider?.id === p.id;
                  return <SelectChip key={p.id} label={un ? `${p.fullName} · ${un.why === 'red' ? 'sent off' : 'suspended'}` : isOut ? `${p.fullName} · out` : p.fullName} active={on} disabled={isOut && !on}
                    onPress={() => setRaidFlow({ ...raidFlow, raider: on ? undefined : p })} />;
                })}
              </View>
            </>
          )}
          {(() => {
            // SD-114: you can't touch more defenders than are on the mat (the
            // engine caps v2 raids the same way).
            const onMat = defendersOnMat(state, raidFlow.side, raidFlow.editOf);
            // SD-83: a caught raider's touches don't score (AKFI / IKF / PKL) —
            // SD-59: nor do a raider's who stepped out
            const caughtVoid = state.caughtTouches === 'void' && raidFlow.tackled;
            const noTouches = caughtVoid || !!raidFlow.lineOut;
            return (
              <>
                <Text style={ctrl.meta}>Defenders touched (they go out) · {onMat} on the mat</Text>
                {!noTouches && (
                  <View style={ctrl.chips}>
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <SelectChip key={n} label={String(n)} active={raidFlow.touches === n} disabled={n > onMat} onPress={() => setRaidFlow({ ...raidFlow, touches: n })} />
                    ))}
                  </View>
                )}
                {noTouches
                  ? <Text style={ctrl.meta}>{raidFlow.lineOut ? 'Raider stepped out — his touches don’t count.' : 'Raider caught — touches don’t score and the touched defenders stay in (a bonus still counts).'}</Text>
                  : raidFlow.touches > onMat && <Text style={ctrl.doOrDie}>Only {onMat} defender{onMat === 1 ? '' : 's'} on the mat — this raid counts {onMat} touch{onMat === 1 ? '' : 'es'}.</Text>}
                <Text style={ctrl.meta}>Line-out: defenders who stepped out (no struggle) — out, +1 each to the raiders</Text>
                <View style={ctrl.chips}>
                  {[0, 1, 2].map((n) => (
                    <SelectChip key={n} label={n === 0 ? 'None' : `${n} stepped out`} active={(raidFlow.defOut ?? 0) === n} disabled={n > Math.max(0, onMat - (noTouches ? 0 : raidFlow.touches))}
                      onPress={() => setRaidFlow({ ...raidFlow, defOut: n || undefined })} />
                  ))}
                </View>
              </>
            );
          })()}
          <View style={ctrl.chips}>
            <SelectChip label={`Bonus point: ${raidFlow.bonus ? 'Yes' : 'No'}`} active={raidFlow.bonus} onPress={() => setRaidFlow({ ...raidFlow, bonus: !raidFlow.bonus })} />
            <SelectChip label={`Raider tackled: ${raidFlow.tackled ? 'Yes' : 'No'}`} active={raidFlow.tackled} onPress={() => setRaidFlow({ ...raidFlow, tackled: !raidFlow.tackled, lineOut: raidFlow.tackled ? raidFlow.lineOut : undefined, tackler: raidFlow.tackled ? undefined : raidFlow.tackler, tackleType: raidFlow.tackled ? undefined : raidFlow.tackleType })} />
            {/* SD-59: the raider stepped out of bounds — out, +1 to the defence, no tackle */}
            <SelectChip label={`Raider stepped out: ${raidFlow.lineOut ? 'Yes' : 'No'}`} active={!!raidFlow.lineOut} onPress={() => setRaidFlow({ ...raidFlow, lineOut: !raidFlow.lineOut || undefined, ...(!raidFlow.lineOut ? { tackled: false, tackler: undefined, tackleType: undefined } : null) })} />
          </View>
          {/* Who made the tackle? Credits the defender their tackle (or super-tackle) point. */}
          {raidFlow.tackled && (() => {
            const defSide = raidFlow.side === 'home' ? 'away' : 'home';
            const defenders = onField(defSide, defSide === 'home' ? homeRoster : awayRoster);
            return defenders.length > 0 ? (
              <>
                <Text style={ctrl.meta}>Who made the tackle? (optional — credits the defender)</Text>
                <View style={ctrl.chips}>
                  {defenders.map((p) => {
                    const un = raidFlow.editOf == null ? unavName(defSide, p.fullName) : undefined;
                    const isOut = raidFlow.editOf == null && (outNow[defSide].includes(p.fullName) || !!un);
                    const on = raidFlow.tackler?.id === p.id;
                    return <SelectChip key={p.id} label={un ? `${p.fullName} · ${un.why === 'red' ? 'sent off' : 'suspended'}` : isOut ? `${p.fullName} · out` : p.fullName} active={on} disabled={isOut && !on}
                      onPress={() => setRaidFlow({ ...raidFlow, tackler: on ? undefined : p })} />;
                  })}
                </View>
              </>
            ) : null;
          })()}
          {raidFlow.tackled && (
            <>
              <Text style={ctrl.meta}>How was the raider stopped? (optional)</Text>
              <View style={ctrl.chips}>
                {TACKLE_TYPES.map((t) => (
                  <SelectChip key={t.key} label={t.label} active={raidFlow.tackleType === t.key}
                    onPress={() => setRaidFlow({ ...raidFlow, tackleType: raidFlow.tackleType === t.key ? undefined : t.key })} />
                ))}
              </View>
            </>
          )}
          {(() => {
            // What the engine will score for this raid — what the raider / tackler get.
            const b = previewRaid(state, formOutcome(raidFlow), raidFlow.editOf);
            if (!b) return null;
            const oppName = raidFlow.side === 'home' ? awayName : homeName;
            const bits = [
              `raid +${b.raidPts}${raidFlow.bonus && !b.bonusPts ? ' (bonus void: under 6 defenders)' : ''}`,
              b.defOutPts ? `line-out +${b.defOutPts}` : null,
              b.lineOut ? `line-out +1 to ${oppName}` : b.raiderOut ? `${b.superTackle ? 'super tackle' : b.doOrDieFail ? 'do-or-die stop' : 'tackle'} +${b.tacklePts} to ${oppName}` : null,
              b.allOuts.length ? `all out +2` : null,
            ].filter(Boolean).join(' · ');
            return <Text style={ctrl.meta}>Scores: {bits}</Text>;
          })()}
          <Button label={raidFlow.editOf != null ? '✓ Save raid' : '✓ Record raid'} onPress={recordRaid} />
        </View>
      )}

      {/* SD-59 technical point · SD-72 cards */}
      {!state.goldenRaid && !raidFlow && !tech && !card && (
        <View style={ctrl.row}>
          <Button label="⚖️ Technical point" variant="ghost" style={ctrl.flex} onPress={() => setTech({})} />
          <Button label="🟨 Card" variant="ghost" style={ctrl.flex} onPress={() => setCard({ tp: false })} />
        </View>
      )}
      {tech && (() => {
        const atFault = tech.side ? onField(tech.side === 'home' ? 'away' : 'home', rosterFor(tech.side === 'home' ? 'away' : 'home')) : [];
        return (
          <View style={ctrl.raidPanel}>
            <View style={ctrl.subHead}>
              <Text style={ctrl.label}>⚖️ Technical point</Text>
              <Button label="Cancel" variant="ghost" onPress={() => setTech(null)} />
            </View>
            <Text style={ctrl.meta}>Point to (nobody goes out — line-outs are logged on the raid)</Text>
            <View style={ctrl.chips}>
              {(['home', 'away'] as const).map((sd) => (
                <SelectChip key={sd} label={sd === 'home' ? homeName : awayName} active={tech.side === sd} onPress={() => setTech({ ...tech, side: sd, by: undefined })} />
              ))}
            </View>
            <Text style={ctrl.meta}>Why?</Text>
            <View style={ctrl.chips}>
              {TECH_REASONS.map((r) => (
                <SelectChip key={r.key} label={r.label} active={tech.reason === r.key} onPress={() => setTech({ ...tech, reason: tech.reason === r.key ? undefined : r.key })} />
              ))}
            </View>
            {atFault.length > 0 && (
              <>
                <Text style={ctrl.meta}>Who was at fault? (optional)</Text>
                <View style={ctrl.chips}>
                  {atFault.map((p) => (
                    <SelectChip key={p.id} label={p.fullName} active={tech.by?.id === p.id} onPress={() => setTech({ ...tech, by: tech.by?.id === p.id ? undefined : p })} />
                  ))}
                </View>
              </>
            )}
            <Button label={tech.side ? `✓ +1 to ${tech.side === 'home' ? homeName : awayName}` : 'Pick who gets the point'} disabled={!tech.side}
              onPress={() => {
                if (!tech.side) return;
                fire({ type: 'TECH_POINT', side: tech.side, payload: { ...(tech.reason ? { reason: tech.reason } : null), ...(tech.by ? { playerId: tech.by.id, playerName: tech.by.fullName } : null) } });
                setTech(null);
              }} />
          </View>
        );
      })()}
      {card && (() => {
        const sd = card.side;
        const nm = (x?: 'home' | 'away') => (x === 'home' ? homeName : awayName);
        const opp = sd === 'home' ? 'away' : 'home';
        const players = sd ? onField(sd, rosterFor(sd)).filter((p) => unavName(sd, p.fullName)?.why !== 'red') : [];
        const who = card.who;
        const person = typeof who === 'object' ? who : undefined;
        const counts = sd && person ? cardsOf(state, sd, { id: person.id, name: person.fullName }) : null;
        const hint = counts ? suggestedCard(counts) : null;
        const wasOut = !!(sd && person && outNow[sd].includes(person.fullName));
        const tpDefault = (c?: CardColour) => c === 'red';
        const whoLabel = who === 'official' ? 'the team official' : person ? person.fullName : 'the player';
        const ready = !!sd && !!card.colour && !!who;
        const record = async () => {
          if (!ready || !sd || !card.colour) return;
          if (card.colour === 'red' && who !== 'official') {
            const ok = await askConfirm({
              title: `Red card for ${person ? person.fullName : 'this player'}?`,
              message: `Sent off for the rest of the match — no substitute; ${nm(sd)} plays a player short${card.tp ? `, and ${nm(opp)} get a technical point` : ''}. Undo can bring it back.`,
              yesLabel: 'Yes, red card', noLabel: 'No, go back', tone: 'danger',
            });
            if (!ok) return;
          }
          fire({
            type: 'CARD', side: sd,
            payload: {
              card: card.colour,
              ...(who === 'official' ? { official: true } : person ? { playerId: person.id, playerName: person.fullName } : { player: true }),
              ...(wasOut ? { wasOut: true } : null),
              ...(card.tp ? { tp: 1 } : null),
            },
          });
          setCard(null);
        };
        return (
          <View style={ctrl.raidPanel}>
            <View style={ctrl.subHead}>
              <Text style={ctrl.label}>{card.colour ? CARD_ICON[card.colour] : '🟨'} Card</Text>
              <Button label="Cancel" variant="ghost" onPress={() => setCard(null)} />
            </View>
            <Text style={ctrl.meta}>Team</Text>
            <View style={ctrl.chips}>
              {(['home', 'away'] as const).map((x) => (
                <SelectChip key={x} label={nm(x)} active={sd === x} onPress={() => setCard({ ...card, side: x, who: undefined })} />
              ))}
            </View>
            <Text style={ctrl.meta}>Card</Text>
            <View style={ctrl.chips}>
              {([['green', 'Green — warning'], ['yellow', 'Yellow — 2 min off'], ['red', 'Red — sent off']] as const).map(([c, l]) => (
                <SelectChip key={c} label={`${CARD_ICON[c]} ${l}`} active={card.colour === c} onPress={() => setCard({ ...card, colour: c, tp: card.tpSet ? card.tp : tpDefault(c) })} />
              ))}
            </View>
            {sd && (
              <>
                <Text style={ctrl.meta}>Who?</Text>
                <View style={ctrl.chips}>
                  {players.map((p) => {
                    const un = unavName(sd, p.fullName);
                    return <SelectChip key={p.id} label={un ? `${p.fullName} · suspended` : outNow[sd].includes(p.fullName) ? `${p.fullName} · out` : p.fullName} active={person?.id === p.id} onPress={() => setCard({ ...card, who: person?.id === p.id ? undefined : p })} />;
                  })}
                  {players.length === 0 && <SelectChip label="A player (not named)" active={who === 'player'} onPress={() => setCard({ ...card, who: who === 'player' ? undefined : 'player' })} />}
                  <SelectChip label="Coach / team official" active={who === 'official'} onPress={() => setCard({ ...card, who: who === 'official' ? undefined : 'official' })} />
                </View>
              </>
            )}
            {counts && (counts.green || counts.yellow) ? (
              <Text style={ctrl.meta}>{person!.fullName} has {[counts.green ? `${counts.green} green` : null, counts.yellow ? `${counts.yellow} yellow` : null].filter(Boolean).join(', ')}{hint ? ` — the next card is ${hint} (two of a colour step up)` : ''}.</Text>
            ) : null}
            {card.colour === 'yellow' && who !== 'official' && (
              <Text style={ctrl.meta}>{wasOut ? 'Out now — the 2 minutes start when he is revived; no one else is revived in his place.' : `Off the mat for 2 minutes of playing time — ${sd ? nm(sd) : 'the team'} plays a player short, then he comes back on.`}</Text>
            )}
            {card.colour === 'red' && who !== 'official' && <Text style={ctrl.doOrDie}>Off for the rest of the match — no substitute.</Text>}
            {sd && card.colour && card.colour !== 'green' || card.tp ? (
              <View style={ctrl.chips}>
                <SelectChip label={`Technical point to ${sd ? nm(opp) : 'the opponent'}: ${card.tp ? 'Yes' : 'No'}`} active={card.tp} onPress={() => setCard({ ...card, tp: !card.tp, tpSet: true })} />
              </View>
            ) : null}
            <Button label={ready ? `✓ ${card.colour === 'red' ? 'Red card' : card.colour === 'yellow' ? 'Yellow card' : 'Green card'} — ${whoLabel}` : 'Pick the team, card and who'} disabled={!ready} onPress={() => void record()} />
          </View>
        );
      })()}

      {state.maxSubs > 0 && !state.goldenRaid && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.label}>🔄 Substitutions</Text>
          <View style={ctrl.chips}>
            <Button label={`${homeName} (${subsLeft('home')} left)`} variant="ghost" style={ctrl.flex} disabled={subsLeft('home') <= 0} onPress={() => setSub({ side: 'home' })} />
            <Button label={`${awayName} (${subsLeft('away')} left)`} variant="ghost" style={ctrl.flex} disabled={subsLeft('away') <= 0} onPress={() => setSub({ side: 'away' })} />
          </View>
        </View>
      )}

      {/* ⏪ Backfill a point the scorer missed earlier — stamp it at a past minute. */}
      {!state.goldenRaid && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.label}>⏪ Backfill an earlier moment</Text>
          {backfillMin == null ? (
            <>
              <Text style={ctrl.meta}>Missed a raid or tackle? Enter a past minute — everything you log is stamped there until you go back to live.</Text>
              <View style={ctrl.chips}>
                <View style={ctrl.flex}><TextField label="" value={backfillText} onChange={setBackfillText} placeholder="minute, e.g. 12" autoCapitalize="none" /></View>
                <Button label="Backfill" variant="ghost" disabled={backfillText.trim() === ''} onPress={() => setBackfillMin(Math.max(0, Math.floor(Number(backfillText)) || 0))} />
              </View>
            </>
          ) : (
            <View style={ctrl.addedBox}>
              <Text style={ctrl.label}>⏪ Backfilling at {backfillMin}&apos; ({halfLabel(halfFromMin(backfillMin))})</Text>
              <Text style={ctrl.meta}>Every point you log now is stamped at {backfillMin}&apos;. Log it above, then go back to live.</Text>
              <Button label="Back to live scoring" variant="ghost" onPress={backToLive} />
            </View>
          )}
        </View>
      )}

      {/* 🗓 Correct the timeline — remove or edit one specific past moment. */}
      {!state.goldenRaid && state.events.length > 0 && (
        <View style={{ gap: theme.spacing(2) }}>
          <View style={ctrl.subHead}>
            <Text style={ctrl.label}>🗓 Correct the timeline</Text>
            <Button label={showEdit ? 'Done' : 'Edit'} variant="ghost" onPress={() => setShowEdit((v) => !v)} />
          </View>
          {showEdit && (
            <View style={{ gap: theme.spacing(1) }}>
              <Text style={ctrl.meta}>Tap Edit on a raid to re-enter it — raider, touches, bonus, tackle, line-outs — at the same minute (the score & tallies re-adjust), or ✕ to remove it along with its tackle / all-out points (asks first). Technical points and cards: ✕ to remove.</Text>
              {/* one row per moment: a guided raid's tackle / all-out lines go with it */}
              {[...state.events].filter((e) => e.group == null || isRaidHead(e)).sort((a, b) => (b.minute ?? 0) - (a.minute ?? 0) || b.id - a.id).map((e) => (
                <View key={e.id} style={ctrl.editRow}>
                  <Text style={ctrl.editMin}>{e.stamp}</Text>
                  <Text style={ctrl.editLabel} numberOfLines={1}>{e.icon} {e.label}{e.detail ? ` — ${e.detail}` : ''}</Text>
                  {(e.kind === 'raid' || e.kind === 'tackle') && <RowAction label="✎ Edit" tone="edit" a11y={`Edit ${e.label}`} onPress={() => editEvent(e)} />}
                  <RowAction label="✕" tone="remove" a11y={`Remove ${e.label}`} onPress={() => void confirmRemove(`${e.label.replace(/ — .*$/, '')} (${e.stamp})`, () => removeEvent(e), removeDetail(e))} />
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {state.goldenRaid ? (
        <Button label="End as a tie" variant="ghost" onPress={async () => { if (await confirmMatchAction('endTie', { drawWord: 'Tie', score: `${state.home}-${state.away}` })) dispatch({ type: 'END' }); }} />
      ) : state.half === 1 ? (
        <Button label="End 1st Half →" onPress={async () => { if (await confirmMatchAction('endPeriod', { period: '1st half', score: `${state.home}-${state.away}` })) dispatch({ type: 'NEXT_HALF' }); }} />
      ) : state.half === 3 ? (
        <Button label="End Extra Time · 1st half →" onPress={async () => { if (await confirmMatchAction('endPeriod', { period: 'extra-time 1st half', score: `${state.home}-${state.away}` })) dispatch({ type: 'NEXT_HALF' }); }} />
      ) : tied ? (
        // Level after the 2nd half or extra time → the tie-breaker the organizer
        // chose (draw stands / extra time then Golden Raid / Golden Raid direct).
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.meta}>Scores level ({state.home}–{state.away}) at the end of {halfLabel(state.half)}.
            {state.decider === 'none' ? ' This match can end level.' : ''}</Text>
          {state.decider !== 'none' && (
            <Button label="⚡ Golden Raid — sudden death" onPress={() => dispatch({ type: 'START_GOLDEN_RAID' })} />
          )}
          {state.decider === 'extra_time' && state.half === 2 && (
            <Button label={`Extra time (2 × ${state.extraTimeMinutes} min)`} variant="ghost" onPress={() => dispatch({ type: 'START_EXTRA_TIME' })} />
          )}
          {state.decider !== 'none' && (
            <Button label="🎯 5-Raid Shootout" variant="ghost" onPress={() => dispatch({ type: 'START_SHOOTOUT' })} />
          )}
          <Button label="End as a tie" variant="ghost" onPress={async () => { if (await confirmMatchAction('endTie', { drawWord: 'Tie', score: `${state.home}-${state.away}` })) dispatch({ type: 'END' }); }} />
        </View>
      ) : (
        <Button label="🏁 End Match" variant="danger" onPress={async () => { if (await confirmMatchAction('fullTime', { score: `${state.home}-${state.away}` })) dispatch({ type: 'END' }); }} />
      )}
    </View>
  );
};

const LiveClock: NonNullable<SportPlugin<KabaddiState>['LiveClock']> = ({ state }) => {
  const s = state as KabaddiState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s.startedAt || s.ended || s.pausedAt != null) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.startedAt, s.ended, s.pausedAt]);
  const paused = clockPaused(s);
  const running = !!s.startedAt && !s.ended && !paused;
  const label = s.ended
    ? (s.goldenRaid ? 'FT · GR' : s.half > 2 ? 'FT · ET' : 'FT')
    : s.goldenRaid ? '⚡ GR'
    : !s.startedAt ? (s.half === 1 ? '—' : 'HT')
    : paused ? `${currentMinute(s)}' ⏸`
    : `${currentMinute(s)}'`;
  return (
    <View style={ctrl.clockRow}>
      <View style={[ctrl.liveDot, { backgroundColor: running ? theme.colors.danger : theme.colors.textMuted }]} />
      <Text style={ctrl.clockTime}>{label}</Text>
    </View>
  );
};

const LiveExtras: NonNullable<SportPlugin<KabaddiState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster, awayRoster, onPlayer }) => {
  const s = state as KabaddiState;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>Timeline</Text>
      <LiveTimeline events={s.events} homeColor={homeColor} awayColor={awayColor} emptyText="No raids yet." homeRoster={homeRoster} awayRoster={awayRoster} onPlayer={onPlayer} />
      <Text style={ctrl.label}>Player stats</Text>
      <MatchBoxScore sport="kabaddi" source={kabaddiBox(s, { homeRoster, awayRoster })} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
    </View>
  );
};

/** Broadcast-style board: the TOTAL score + a column of points per half, the live
 *  half highlighted. */
const KabaddiScoreboard: NonNullable<SportPlugin<KabaddiState>['Scoreboard']> = ({ state, homeName, awayName, homeColor, awayColor, live }) => {
  const s = state as KabaddiState;
  const nH = Math.max(1, s.half);
  const shortHalf = (h: number) => (h <= 2 ? `H${h}` : `ET${h - 2}`);
  const columns = Array.from({ length: nH }, (_, i) => ({ label: shortHalf(i + 1), highlight: !s.ended && i + 1 === s.half }));
  // Points per half from the timeline: raid, tackle and all-out lines each on the
  // side that scored them; shootout raids aren't regulation points.
  const pts = (side: 'home' | 'away', h: number) => halfPoints(s, side, h);
  const w = s.ended ? kabaddiWinner(s) : undefined;
  return (
    <LineScoreboard
      live={live}
      clock={<LiveClock state={s} />}
      leadLabel="TOTAL"
      columns={columns}
      winner={w && w !== 'draw' ? w : undefined}
      home={{ name: homeName, color: homeColor ?? theme.colors.home, lead: String(s.home), cells: columns.map((_, i) => String(pts('home', i + 1))) }}
      away={{ name: awayName, color: awayColor ?? theme.colors.away, lead: String(s.away), cells: columns.map((_, i) => String(pts('away', i + 1))) }}
    />
  );
};

export const kabaddiPlugin: SportPlugin<KabaddiState> = {
  id: 'kabaddi',
  name: 'Kabaddi',
  icon: '🤼',
  Scoreboard: KabaddiScoreboard,
  archetype: 'raid',
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => {
    if (!s.ended) return null;
    // A shootout decides the winner while the regulation score stays tied.
    if (s.shootout) {
      const hs = sum(s.shootout.home), as = sum(s.shootout.away);
      const winner = hs > as ? 'home' : as > hs ? 'away' : s.home > s.away ? 'home' : s.away > s.home ? 'away' : 'draw';
      return { winner, home: s.home, away: s.away };
    }
    return { winner: s.home > s.away ? 'home' : s.away > s.home ? 'away' : 'draw', home: s.home, away: s.away };
  },
  summary: (s) => ({
    homeScore: String(s.home),
    awayScore: String(s.away),
    statusLine: s.ended
      ? (s.goldenRaid ? 'Full Time · Golden Raid' : s.half > 2 ? 'Full Time · Extra Time' : 'Full Time')
      : s.goldenRaid ? '⚡ Golden Raid'
      : s.half <= 2 ? `Half ${s.half}` : halfLabel(s.half),
  }),
  // SD-33 (KB-02): absolute stat lines from the raid replay — heals the
  // pre-SD-03 +1-per-raid lines on completion / the D2 resync. Partial: when a
  // credited player can't be named (an old snapshot) the point keys are left
  // to the live increments.
  statTotals: kabaddiTotals,
  statTotalsPartial: true,
  statTotalsNeedsPlayers: true,
  ScoringControls,
  LiveClock,
  LiveExtras,
  formation: () => courtFormation('kabaddi'),
  Court: makeCourt('kabaddi'),
  voice: { hints: ['raid {name}', 'tackle {name}', 'raid away'], parse: kabaddiVoice },
  formatFields: [
    {
      key: 'preset', label: 'Rule set', type: 'preset', default: 'pro',
      options: [
        { value: 'pro', label: 'Standard / Pro (7 · 2×20)', set: { playersPerSide: 7, substitutes: 5, halfMinutes: 20, extraTimeMinutes: 5, decider: 'extra_time', style: 'sanjeevani', proRules: true, subReturn: true, caughtTouches: 'void' } },
        { value: 'circle', label: 'Circle style (7 · 2×15)', set: { playersPerSide: 7, substitutes: 5, halfMinutes: 15, extraTimeMinutes: 5, decider: 'golden_raid', style: 'sanjeevani', proRules: false, subReturn: true, caughtTouches: 'void' } },
        { value: 'school', label: 'School (7 · 2×10)', set: { playersPerSide: 7, substitutes: 5, halfMinutes: 10, extraTimeMinutes: 5, decider: 'extra_time', style: 'sanjeevani', proRules: false, subReturn: true, caughtTouches: 'void' } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 7, min: 1, max: 11 },
    {
      key: 'style', label: 'Revival style', type: 'choice', default: 'sanjeevani',
      options: [
        { value: 'sanjeevani', label: 'Sanjeevani (revival)' },
        { value: 'amar', label: 'Amar (points only)' },
        { value: 'gaminee', label: 'Gaminee (all-out ends)' },
      ],
    },
    {
      key: 'decider', label: 'If level at full time', type: 'choice', default: 'extra_time',
      options: [
        { value: 'none', label: 'Draw stands' },
        { value: 'extra_time', label: 'Extra time, then Golden Raid' },
        { value: 'golden_raid', label: 'Golden Raid straightaway' },
      ],
    },
    { key: 'proRules', label: 'Pro rules (do-or-die, super tackle, bonus)', type: 'toggle', default: true },
    // SD-83 (D6): AKFI / IKF — and PKL — a raider caught before getting back loses his touches
    {
      key: 'caughtTouches', label: 'Raider caught after touching', type: 'choice', default: 'void', advanced: true,
      options: [
        { value: 'void', label: 'Touches don’t score (AKFI / PKL)' },
        { value: 'count', label: 'Touches still score (house rule)' },
      ],
    },
    { key: 'substitutes', label: 'Substitutes per side', type: 'count', default: 5, min: 0, max: 11, advanced: true },
    // SD-117b: AKFI / PKL let a substituted player come back on (within the limit)
    { key: 'subReturn', label: 'Substituted players may return', type: 'toggle', default: true, advanced: true },
    { key: 'halfMinutes', label: 'Minutes per half', type: 'number', default: 20, min: 5, max: 30 },
    { key: 'extraTimeMinutes', label: 'Extra-time half (min)', type: 'number', default: 5, min: 1, max: 15, advanced: true, hint: 'used only for the “extra time” decider' },
  ],
};

const ctrl = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  subPanel: { gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4) },
  raidPanel: { gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.primary, padding: theme.spacing(4) },
  matRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  matChip: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3) },
  pausedBanner: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', backgroundColor: theme.colors.accent + '22', borderWidth: 1, borderColor: theme.colors.accent, borderRadius: theme.radius.md, padding: theme.spacing(2) },
  doOrDie: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
  subHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  clockTime: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', letterSpacing: 1 },
  grBanner: { backgroundColor: theme.colors.primary + '1A', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.primary, padding: theme.spacing(3), gap: theme.spacing(1) },
  grTitle: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '900', letterSpacing: 0.5 },
  grMeta: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  editBanner: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700', backgroundColor: theme.colors.accent + '22', padding: theme.spacing(2), borderRadius: theme.radius.sm },
  addedBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  editMin: { color: theme.colors.accent, fontWeight: '800', width: 40, fontSize: theme.font.small },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
});

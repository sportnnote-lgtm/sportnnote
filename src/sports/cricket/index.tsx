/**
 * Cricket plugin — ball-by-ball, two-innings limited-overs match.
 *
 * The scorer records each delivery against the selected striker + bowler: runs
 * off the bat (credited to the striker), wickets (to the bowler), extras
 * (wide/no-ball). Innings end automatically at the overs limit or 10 wickets;
 * the chase ends the moment the target is passed.
 *
 * From the ball-by-ball log the reducer reconstructs everything: scoreboard,
 * over count, run rate, the current over's dots, a batting card and a bowling
 * card — so a viewer replaying the log sees the same scorecard. The reducer is
 * pure; striker/bowler identity rides in each action's payload.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { useMask } from '../../core/disputeMask';
import { playerLink, idByName } from '../playerLink';
import { Button, SelectChip, TextField, textStyles } from '../../components/ui';
import { RankBadge, podiumColor } from '../../components/Rank';
import { LiveTimeline } from '../LiveTimeline';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin, QuickOptionsProps } from '../types';
import { Tile } from '../../components/QuickOptionsSheet';
import { cricketVoice } from '../voiceParsers';
import {
  init, reducer, other, resultLine, outcome, superOverWinner, WICKET_LABEL, NO_BOWLER, composeDismissal,
  oversStr, runRate, inPowerplay, nrrOvers, manualNrrOvers, involvedPlayerIds,
  clampRuns, ballRuns, symbolTone, penalty,
  NO_DELIVERY, RUNS_KINDS, WIDE_WICKETS, NOBALL_WICKETS, creaseAfterWicket, wicketAttribution,
  canBowl, midOver, oversUsed, snapshotState,
} from './engine';
import {
  hasLog, extrasBreakdown, extrasText, fallOfWickets, fowText, partnerships, overHistory, bowlerSplits, statTotals,
} from './scorecard';
import type { CricketState, DismissalKind, Innings, RunsAs } from './engine';
import { OverEditor } from './OverEditor';
import {
  LOCAL_RULE_FIELDS, CRICKET_LIVE_SETTINGS, rulesOf, effectiveRules, inStandardWindow, isStandard,
  rulesChip, STANDARD_RULES,
} from './rules';

/* ------------------------------- Controls ---------------------------------- */

/** Shown when a match ends level (or a Super Over round ties): start the (next)
 *  Super Over, or accept the tie and end the match. */
function SuperOverDecision({
  rootState, dispatch, homeName, awayName, homeColor, awayColor,
}: {
  rootState: CricketState; dispatch: (a: ScoreAction) => void; homeName: string; awayName: string;
  homeColor?: string; awayColor?: string;
}) {
  const so = rootState.superOver;
  const nm = (sd: 'home' | 'away') => (sd === 'home' ? homeName : awayName);
  const col = (sd: 'home' | 'away') => (sd === 'home' ? (homeColor ?? theme.colors.home) : (awayColor ?? theme.colors.away));
  const tiedRound = !!so && superOverWinner(so.state) === null; // a Super Over that itself tied
  const nextRound = (so?.round ?? 0) + 1;
  const nextFirst = so ? other(so.battingFirst) : rootState.battingSide;
  return (
    <View style={ctrl.wktPanel}>
      <Text style={ctrl.soTitle}>🔥 {tiedRound ? `Super Over ${so!.round} tied!` : 'Scores level — it’s a tie!'}</Text>
      <View style={ctrl.tieBoard}>
        <View style={ctrl.tieSide}>
          <Text style={[ctrl.tieScore, { color: col('home') }]}>{rootState.scores.home.runs}/{rootState.scores.home.wickets}</Text>
          <Text style={[ctrl.tieName, { color: col('home') }]} numberOfLines={1}>{homeName}</Text>
        </View>
        <View style={ctrl.tieTag}><Text style={ctrl.tieTagText}>TIED</Text></View>
        <View style={ctrl.tieSide}>
          <Text style={[ctrl.tieScore, { color: col('away') }]}>{rootState.scores.away.runs}/{rootState.scores.away.wickets}</Text>
          <Text style={[ctrl.tieName, { color: col('away') }]} numberOfLines={1}>{awayName}</Text>
        </View>
      </View>
      {!!so && so.history.map((h) => (
        <Text key={h.round} style={ctrl.meta}>Super Over {h.round}: {homeName} {h.home} · {awayName} {h.away} — tied</Text>
      ))}
      {tiedRound && (
        <Text style={ctrl.meta}>Super Over {so!.round}: {homeName} {so!.state.scores.home.runs} · {awayName} {so!.state.scores.away.runs} — tied</Text>
      )}
      {/* A Super Over is offered unless the tie-break is "shared/tie stands" (and
          a Super Over that itself tied always continues to another one). */}
      {(rootState.tieBreak !== 'shared' || tiedRound) && (
        <>
          <Text style={ctrl.hint}>{nm(nextFirst)} bat first in Super Over {nextRound} · 1 over · 2 wickets.</Text>
          <Button label={`🔥 Start Super Over${so ? ` ${nextRound}` : ''}`} variant="primary" onPress={() => dispatch({ type: 'START_SUPER_OVER' })} />
        </>
      )}
      <Button label={rootState.tieBreak === 'shared' && !tiedRound ? 'End the match — tie stands' : 'Accept the tie & end the match'} variant="ghost" onPress={() => dispatch({ type: 'END' })} />
    </View>
  );
}

/** Pre-match setup: each side names a captain (c) and wicket-keeper (†) before
 *  scoring begins — the keeper drives stumpings & caught-behind. One name list
 *  per team; tapping a name offers "Captain" or "Keeper" to keep it compact. */
function SetupPanel({
  state, dispatch, homeName, awayName, homeRoster, awayRoster, homeKeeperId, awayKeeperId,
}: {
  state: CricketState; dispatch: (a: ScoreAction) => void;
  homeName: string; awayName: string; homeRoster: Player[]; awayRoster: Player[];
  homeKeeperId?: string; awayKeeperId?: string;
}) {
  const [pick, setPick] = useState<{ side: 'home' | 'away'; id: string; name: string } | null>(null);

  // Pre-fill the wicket-keeper the organizer designated in the batting-order
  // editor, so the scorer only has to pick captains. Guarded on !already-set so
  // it fires once per side and the scorer can still override with a manual tap.
  useEffect(() => {
    ([['home', homeKeeperId, homeRoster], ['away', awayKeeperId, awayRoster]] as const).forEach(
      ([sd, kid, roster]) => {
        if (!kid || state.keepers[sd]) return;
        const p = roster.find((x) => x.id === kid);
        if (p) dispatch({ type: 'SET_KEEPER', payload: { side: sd, id: p.id, name: p.fullName } });
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeKeeperId, awayKeeperId, homeRoster, awayRoster, state.keepers.home, state.keepers.away]);
  const roleTag = (key: 'home' | 'away', id: string) =>
    (state.captains[key]?.id === id ? ' (c)' : '') + (state.keepers[key]?.id === id ? ' †' : '');
  const assign = (role: 'SET_CAPTAIN' | 'SET_KEEPER') => {
    if (!pick) return;
    dispatch({ type: role, payload: { side: pick.side, id: pick.id, name: pick.name } });
    setPick(null);
  };

  const side = (key: 'home' | 'away', name: string, roster: Player[]) => {
    const capSet = !!state.captains[key];
    const kprSet = !!state.keepers[key];
    const missing = [!capSet && 'captain', !kprSet && 'keeper'].filter(Boolean).join(' & ');
    return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={ctrl.setupHead}>
        <Text style={ctrl.label}>{name}</Text>
        {capSet && kprSet
          ? <View style={ctrl.readyTag}><Text style={ctrl.readyTagText}>✓ Ready</Text></View>
          : <View style={ctrl.needTag}><Text style={ctrl.needTagText}>Need {missing}</Text></View>}
      </View>
      <View style={ctrl.chips}>
        {roster.map((p) => {
          const tag = roleTag(key, p.id);
          return (
            <SelectChip
              key={p.id}
              label={`${p.fullName}${tag}`}
              active={!!tag || (pick?.side === key && pick.id === p.id)}
              onPress={() => setPick((c) => (c?.side === key && c.id === p.id ? null : { side: key, id: p.id, name: p.fullName }))}
            />
          );
        })}
      </View>
      {pick?.side === key && (
        <View style={ctrl.roleRow}>
          <Text style={ctrl.meta}>Set {pick.name} as</Text>
          <Button label="Captain (c)" variant="ghost" style={ctrl.roleBtn} onPress={() => assign('SET_CAPTAIN')} />
          <Button label="Keeper †" variant="ghost" style={ctrl.roleBtn} onPress={() => assign('SET_KEEPER')} />
        </View>
      )}
    </View>
    );
  };
  // Who bats first is the toss's job. Defaults to home batting until a toss is
  // recorded; settable only before the first ball (the reducer enforces that).
  const toss = state.toss;
  const battingFirstName = state.battingSide === 'home' ? homeName : awayName;
  const setToss = (winner: 'home' | 'away', decision: 'bat' | 'bowl') =>
    dispatch({ type: 'SET_TOSS', payload: { winner, decision } });

  return (
    <View style={ctrl.wktPanel}>
      <Text style={ctrl.label}>🪙 Toss</Text>
      <Text style={ctrl.meta}>Who won the toss, and what did they choose? This sets who bats first.</Text>
      <View style={ctrl.chips}>
        <SelectChip label={`${homeName} won`} active={toss?.winner === 'home'} onPress={() => setToss('home', toss?.decision ?? 'bat')} />
        <SelectChip label={`${awayName} won`} active={toss?.winner === 'away'} onPress={() => setToss('away', toss?.decision ?? 'bat')} />
      </View>
      {toss && (
        <>
          <View style={ctrl.chips}>
            <SelectChip label="⏏ Chose to bat" active={toss.decision === 'bat'} onPress={() => setToss(toss.winner, 'bat')} />
            <SelectChip label="◎ Chose to bowl" active={toss.decision === 'bowl'} onPress={() => setToss(toss.winner, 'bowl')} />
          </View>
          <Text style={ctrl.meta}>
            {(toss.winner === 'home' ? homeName : awayName)} chose to {toss.decision} — {battingFirstName} bat first.
          </Text>
        </>
      )}

      <Text style={[ctrl.label, { marginTop: theme.spacing(3) }]}>🧢 Match setup</Text>
      <Text style={ctrl.meta}>Tap a player to make them captain (c) or wicket-keeper (†). Both are needed per side to begin.</Text>
      {roster0(homeRoster) ? side('home', homeName, homeRoster) : <Text style={ctrl.meta}>No {homeName} squad set.</Text>}
      {roster0(awayRoster) ? side('away', awayName, awayRoster) : <Text style={ctrl.meta}>No {awayName} squad set.</Text>}
    </View>
  );
}
const roster0 = (r: Player[]) => r.length > 0;

/** The six everyday dismissals; the rare ones fold under "More ▾" (parity #16). */
const MAIN_DISMISSALS: DismissalKind[] = ['bowled', 'caught', 'lbw', 'runout', 'stumped', 'hitwicket'];
const MORE_DISMISSALS: DismissalKind[] = ['obstruct', 'hittwice', 'mankad', 'retired', 'retiredout', 'timedout'];
/** On a free hit only these can happen (UI-only — the engine doesn't police it). */
const FREE_HIT_DISMISSALS: DismissalKind[] = ['runout', 'obstruct', 'hittwice', 'mankad', 'retired', 'retiredout'];
const needsFielder = (k: DismissalKind) => k === 'caught' || k === 'runout';
const needsBatter = (k: DismissalKind) => k === 'runout' || k === 'obstruct' || k === 'retired' || k === 'retiredout' || k === 'timedout';
/** Inline law hints (no modal). */
const DISMISSAL_HINT: Partial<Record<DismissalKind, string>> = {
  mankad: 'Bowler ran out the non-striker for leaving early. Not a ball; not the bowler\u2019s wicket.',
  obstruct: 'Includes handling the ball. Completed runs count; not the bowler\u2019s wicket.',
  hittwice: 'Striker only. Not the bowler\u2019s wicket.',
  retiredout: 'Retired without the umpire\u2019s consent: a wicket, no ball bowled, can\u2019t bat again.',
  retired: 'Not a wicket — they can resume their innings later.',
};
/** "Runs were" on a run out / obstruction: how the completed runs are scored. */
const RUNS_WERE = [['bat', 'Off the bat'], ['bye', 'Byes'], ['legbye', 'Leg byes'], ['wide', 'Wide'], ['noball', 'No ball']] as const;
type RunsWere = (typeof RUNS_WERE)[number][0];

/** A rare run value (parity #15): digits-only field + Add, 0–99. Common values
 *  stay one-tap buttons; this is only for the odd 9 or Wd+7. */
function RunsInput({ onAdd, min = 0, placeholder, addLabel }: {
  onAdd: (n: number) => void;
  min?: number;
  placeholder?: string;
  /** button text for a valid value, e.g. n => `Add Wd+${n}` */
  addLabel?: (n: number) => string;
}) {
  const [v, setV] = useState('');
  const n = clampRuns(v);
  const ok = v !== '' && n >= min;
  return (
    <View style={[ctrl.row, { alignItems: 'center' }]}>
      <View style={ctrl.flex}>
        <TextField label="" value={v} onChange={(t) => setV(t.replace(/[^0-9]/g, '').slice(0, 2))} placeholder={placeholder ?? `Other runs (${min}–99)`} autoCapitalize="none" />
      </View>
      <Button label={ok ? (addLabel ? addLabel(n) : `Add ${n}`) : 'Add'} variant="ghost" disabled={!ok}
        onPress={() => { if (!ok) return; onAdd(n); setV(''); }} />
    </View>
  );
}

/** " (DLS)" / " (revised)" after a revised target (parity #18). */
const targetTag = (s: CricketState) => (s.revision === 'dls' ? ' (DLS)' : s.revision === 'manual' ? ' (revised)' : '');

type OversMode = 'overs' | 'rain' | 'target';
/** Parity #18 — "⏱ Overs & target": change the overs (any innings, up or down,
 *  DLS or not), a rain interruption (DLS cut), or a target typed in by hand.
 *  Every preview is the reducer's own result for the action it would send, so
 *  there is no second copy of the DLS maths here. Always sends `v: 2`. */
function OversTargetCard({ s, dispatch, battingName }: { s: CricketState; dispatch: (a: ScoreAction) => void; battingName: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<OversMode>('overs');
  const [ov, setOv] = useState('');
  const [tRuns, setTRuns] = useState('');
  const bpo = s.ballsPerOver;
  const cur = s.scores[s.battingSide];
  const bowled = oversStr(cur.balls, bpo);
  const chase = s.innings === 2;
  const canRain = s.dls && !s.dlsLocked;
  const m: OversMode = (mode === 'rain' && !canRain) || (mode === 'target' && !chase) ? 'overs' : mode;
  const pick = (md: OversMode) => {
    setMode(md);
    setOv(md === 'rain' ? '' : String(s.oversLimit));
    setTRuns(md === 'target' && s.target ? String(s.target) : '');
  };
  const close = () => { setOpen(false); setOv(''); setTRuns(''); setMode('overs'); };
  if (!open) {
    return (
      <Button label="⏱ Overs & target" variant="ghost" style={ctrl.ovOpenBtn}
        accessibilityLabel="Overs and target: change overs, rain (DLS) or set a target"
        onPress={() => { setOpen(true); pick('overs'); }} />
    );
  }

  const n = parseInt(ov, 10);
  const runsN = parseInt(tRuns, 10);
  const action: ScoreAction | null = ov === '' || isNaN(n) ? null
    : m === 'overs' ? { type: 'SET_OVERS', payload: { overs: n, v: 2 } }
    : m === 'rain' ? { type: 'RAIN', payload: { overs: n, v: 2 } }
    : tRuns === '' || isNaN(runsN) ? null
    : { type: 'SET_TARGET', payload: { runs: runsN, overs: n, v: 2 } };
  const next = action ? reducer(s, action) : null;
  const ok = !!next && next !== s;
  const ballsLeft = (lim: number) => Math.max(0, lim * bpo - cur.balls);

  // Unchanged overs (the prefilled value) is not an error — just nothing to apply.
  const error = !action || ok || (m === 'overs' && n === s.oversLimit) ? null
    : n * bpo <= cur.balls ? `Must be more than ${bowled} overs bowled.`
    : n > 999 ? 'At most 999 overs.'
    : m === 'rain' && n >= s.oversLimit ? `Rain only cuts overs — enter fewer than ${s.oversLimit} (use Change overs to add).`
    : m === 'target' && runsN <= cur.runs ? `Target must be more than ${cur.runs} (the score now).`
    : 'That can’t be applied right now.';

  const preview = !ok || !next ? null
    : m === 'overs'
      ? chase && s.target !== undefined
        ? `Target stays ${s.target} — need ${Math.max(0, s.target - cur.runs)} off ${ballsLeft(n)}`
        : `Both innings now ${n} overs`
    : m === 'rain'
      ? chase
        ? next.ended
          ? `Overs lost ${s.oversLimit - n} · revised target ${next.target} — ${battingName} are already there: chase won`
          : `Overs lost ${s.oversLimit - n} · revised target ${next.target} in ${n} ov — need ${Math.max(0, (next.target ?? 0) - cur.runs)} off ${ballsLeft(n)}`
        : `Overs lost ${s.oversLimit - n} · innings now ${n} ov — the chase target is revised when it starts`
    : `Target ${next.target} in ${n} ov — need ${Math.max(0, (next.target ?? 0) - cur.runs)} off ${ballsLeft(n)}`;

  const step = (d: number) => {
    const base = isNaN(n) ? s.oversLimit : n;
    setOv(String(Math.max(1, Math.min(999, base + d))));
  };
  const digits = (t: string) => t.replace(/[^0-9]/g, '').slice(0, 3);

  return (
    <View style={ctrl.rainBox}>
      <View style={ctrl.creaseHead}>
        <Text style={ctrl.label}>⏱ Overs & target</Text>
        <Button label="Close" variant="ghost" style={ctrl.swapBtn} onPress={close} />
      </View>
      <Text style={ctrl.meta}>
        Now {s.oversLimit} ov · {bowled} bowled{chase && s.target !== undefined ? ` · target ${s.target}${targetTag(s)}` : ''}
      </Text>
      <View style={ctrl.chips}>
        <SelectChip label="Change overs" active={m === 'overs'} onPress={() => pick('overs')} />
        {canRain ? <SelectChip label="☔ Rain (DLS)" active={m === 'rain'} onPress={() => pick('rain')} /> : null}
        {chase ? <SelectChip label="Set target" active={m === 'target'} onPress={() => pick('target')} /> : null}
      </View>
      {m === 'target' ? (
        <View style={ctrl.row}>
          <View style={ctrl.flex}>
            <TextField label="Target runs" value={tRuns} onChange={(t) => setTRuns(digits(t))} placeholder={`More than ${cur.runs}`} autoCapitalize="none" />
          </View>
          <View style={ctrl.flex}>
            <TextField label="In overs" value={ov} onChange={(t) => setOv(digits(t))} placeholder={String(s.oversLimit)} autoCapitalize="none" />
          </View>
        </View>
      ) : (
        <View style={ctrl.row}>
          <Button label="−" variant="ghost" style={ctrl.ovStep} accessibilityLabel="One over fewer" onPress={() => step(-1)} />
          <View style={ctrl.flex}>
            <TextField label="" value={ov} onChange={(t) => setOv(digits(t))}
              placeholder={m === 'rain' ? `New total overs (fewer than ${s.oversLimit})` : 'Total overs'} autoCapitalize="none" />
          </View>
          <Button label="＋" variant="ghost" style={ctrl.ovStep} accessibilityLabel="One over more" onPress={() => step(1)} />
        </View>
      )}
      {m === 'target' ? <Text style={ctrl.ovWarn}>⚠️ Built-in DLS will be switched off for this match.</Text> : null}
      {error ? <Text style={ctrl.rainErr}>{error}</Text> : preview ? <Text style={ctrl.rainPreview}>→ {preview}</Text> : null}
      <Button label="Apply" disabled={!ok} onPress={() => { if (action && ok) { dispatch(action); close(); } }} />
    </View>
  );
}

const ScoringControls: SportPlugin<CricketState>['ScoringControls'] = ({
  state: rootState, dispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], homeKeeperId, awayKeeperId,
}) => {
  const [wf, setWf] = useState<{
    kind?: DismissalKind; fielder?: Player; batterOut?: 'striker' | 'nonstriker'; runs?: number;
    /** the extra this wicket fell on (from the extras pad, or the Off a wide / no-ball toggle) */
    offExtra?: 'wide' | 'noball';
    /** rare kinds unfolded */
    more?: boolean;
    /** run out / obstructing: how the completed runs were scored (+ the no-ball's runs) */
    runsAs?: RunsWere; nbRunsAs?: 'bat' | 'bye' | 'legbye';
    /** run out: 2nd fielder; null = skipped */
    fielder2?: Player | null;
    /** run out / obstructing: where the wicket was broken */
    end?: 'striker' | 'bowler';
  } | null>(null);
  const [extraMode, setExtraMode] = useState<'b' | 'lb' | 'nb' | 'wd' | 'more' | null>(null);
  // Overthrows builder (parity #15): runs completed + overthrows.
  const [otRan, setOtRan] = useState(0);
  const [otOver, setOtOver] = useState<number | null>(null);
  const [impact, setImpact] = useState<{ side: 'home' | 'away'; out?: Player; kind?: 'impact' | 'concussion' } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // Bowling rules (parity #17): the mid-over replacement panel (with its reason)
  // and the "Allow anyway" quota override.
  const [bowlRepl, setBowlRepl] = useState<'injury' | 'suspended' | 'other' | null>(null);
  const [forceQuota, setForceQuota] = useState(false);

  // While a Super Over is live, ALL the live-scoring UI below operates on the
  // nested mini-match; dispatched actions are routed there by the reducer. The
  // parent (tied) match stays frozen underneath.
  const soActive = !!rootState.superOver && !rootState.superOver.state.ended;
  const state = soActive ? rootState.superOver!.state : rootState;
  // A new over (or innings) closes a stale replacement panel / quota override.
  const overKey = `${soActive ? 'so' : ''}${state.innings}:${Math.floor(state.scores[state.battingSide].balls / state.ballsPerOver)}`;
  useEffect(() => { setBowlRepl(null); setForceQuota(false); }, [overKey]);

  // Regulation ended level (or a Super Over just tied) — offer the tie-breaker.
  if (rootState.pendingTie && !soActive) {
    return <SuperOverDecision rootState={rootState} dispatch={dispatch} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />;
  }

  const battingName = state.battingSide === 'home' ? homeName : awayName;
  const bowlingName = state.battingSide === 'home' ? awayName : homeName;
  const battingRoster = state.battingSide === 'home' ? homeRoster : awayRoster;
  const bowlingRoster = state.battingSide === 'home' ? awayRoster : homeRoster;
  // Runs go to whoever is batting, so tint the run pad in the batting side's kit
  // colour (boundaries stay green); the pad visually "belongs" to that team.
  const battingColor = state.battingSide === 'home' ? (homeColor ?? theme.colors.home) : (awayColor ?? theme.colors.away);
  const rosterFor = (sd: 'home' | 'away') => (sd === 'home' ? homeRoster : awayRoster);
  const cur = state.scores[state.battingSide];
  // Local rules (parity #14) in force for the next ball (a Super Over is standard).
  const rules = rulesOf(state);
  const R = effectiveRules(state);
  const rulesNote = isStandard(rules) ? null
    : inStandardWindow(state) ? `Normal rules now (last ${rules.stdLastOvers} over${rules.stdLastOvers === 1 ? '' : 's'})`
    : `Local rules: ${rulesChip(rules)}`;

  const { strikerId, strikerName, nonStrikerId, nonStrikerName, bowlerId, bowlerName } = state;
  const isOut = (id: string) => state.batting[id]?.out === true;
  const isUnavailable = (id: string) => state.unavailable.includes(id);
  const atCrease = (id: string) => id === strikerId || id === nonStrikerId;
  const bothSet = !!strikerId && !!nonStrikerId;
  const canScore = bothSet && !!bowlerId;

  // Gate scoring on the pre-match setup.
  const configured = !!(state.captains.home && state.captains.away && state.keepers.home && state.keepers.away);
  if (!configured) {
    return <SetupPanel state={state} dispatch={dispatch} homeName={homeName} awayName={awayName} homeRoster={homeRoster} awayRoster={awayRoster} homeKeeperId={homeKeeperId} awayKeeperId={awayKeeperId} />;
  }

  const pickBat = (p: Player) => {
    if (isOut(p.id) || atCrease(p.id) || isUnavailable(p.id)) return;
    if (!strikerId) dispatch({ type: 'SET_STRIKER', payload: { id: p.id, name: p.fullName } });
    else if (!nonStrikerId) dispatch({ type: 'SET_NONSTRIKER', payload: { id: p.id, name: p.fullName } });
  };

  // ----- Impact Player flow (one substitution per side, format-gated) -----
  const finishImpact = (inP: Player) => {
    if (!impact?.out) return;
    dispatch({
      type: impact.kind === 'concussion' ? 'CONCUSSION_SUB' : 'IMPACT_SUB',
      side: impact.side,
      payload: { side: impact.side, outId: impact.out.id, outName: impact.out.fullName, inId: inP.id, inName: inP.fullName },
    });
    setImpact(null);
  };

  const ball = (extra: Partial<ScoreAction> & { type: string }) =>
    dispatch({
      ...extra,
      side: state.battingSide,
      payload: { ...extra.payload, strikerId, strikerName, bowlerId, bowlerName },
    } as ScoreAction);

  // `boundary`: 4/6 keys send true; all-run / overthrow / typed runs send false
  // (parity #15). A missing flag (old clients, voice) is read as a legacy event.
  const runs = (r: number, extra: { boundary?: boolean; overthrows?: number } = {}) =>
    ball({ type: 'RUNS', payload: { runs: r, ...extra }, attribution: strikerId ? { playerId: strikerId, stat: 'runs', by: r, playerName: strikerName } : undefined });
  // Runs off the bat on a no-ball are the striker's (parity #19 — they used to
  // reach the scorecard but never the profile).
  const nbRuns = (n: number): ScoreAction['attribution'] =>
    (n > 0 && strikerId ? { playerId: strikerId, stat: 'runs', by: n, playerName: strikerName } : undefined);
  const closeMore = () => { setExtraMode(null); setOtRan(0); setOtOver(null); };

  // ----- wicket flow ----- (retired hurt isn't a wicket, so it never "all out")
  const allOut = wf?.kind !== 'retired' && cur.wickets + 1 >= state.wicketsLimit;
  const newBatOptions = battingRoster.filter((p) => !isOut(p.id) && !atCrease(p.id) && !isUnavailable(p.id));
  const keeper = state.keepers[other(state.battingSide)];
  // Fielder pickers list the keeper first (marked †) — most run-outs end there.
  const keeperFirst = (r: Player[]) => (keeper ? [...r.filter((p) => p.id === keeper.id), ...r.filter((p) => p.id !== keeper.id)] : r);
  const finishWicket = (newBat?: Player) => {
    if (!wf?.kind) return;
    const kind = wf.kind;
    const takesRuns = RUNS_KINDS.includes(kind);
    // The extra this wicket fell on: the "Runs were" pick (run out / obstructing),
    // or the "Off a wide" / "Off a no-ball" toggle (stumped, hit wicket, hit twice).
    const onExtra = takesRuns ? (wf.runsAs === 'wide' ? 'wide' : wf.runsAs === 'noball' ? 'noball' : undefined) : wf.offExtra;
    const runsN = takesRuns ? (wf.runs ?? 0) : 0;
    const runsAs: RunsAs = takesRuns ? (wf.runsAs === 'bye' || wf.runsAs === 'legbye' ? wf.runsAs : onExtra === 'noball' ? (wf.nbRunsAs ?? 'bat') : 'bat') : 'bat';
    const batterOut = kind === 'mankad' ? 'nonstriker' : kind === 'hittwice' || kind === 'stumped' || kind === 'hitwicket' ? 'striker' : (wf.batterOut ?? 'striker');
    const payload: Record<string, unknown> = {
      strikerId, strikerName, bowlerId, bowlerName,
      fielderId: wf.fielder?.id, fielderName: wf.fielder?.fullName,
      batterOut, runs: runsN,
      newBatId: newBat?.id, newBatName: newBat?.fullName,
    };
    if (kind === 'runout' && wf.fielder2) { payload.fielder2Id = wf.fielder2.id; payload.fielder2Name = wf.fielder2.fullName; }
    if (takesRuns && wf.end) payload.end = wf.end;
    if (takesRuns && runsAs !== 'bat') payload.runsAs = runsAs;
    // One credit rule for the live UI and the ball editor (engine `wicketAttribution`).
    const credits = wicketAttribution({
      kind,
      bowler: { id: bowlerId, name: bowlerName },
      fielder: { id: wf.fielder?.id, name: wf.fielder?.fullName },
      keeper,
      striker: { id: strikerId, name: strikerName },
      runs: runsN, runsAs, wide: onExtra === 'wide',
    });
    if (onExtra) {
      // A wicket ON a wide / no-ball — routed through EXTRA so the over doesn't
      // advance and the penalty in force is applied.
      dispatch({ type: 'EXTRA', side: state.battingSide, payload: { ...payload, kind: onExtra === 'wide' ? 'Wide' : 'No ball', wicket: kind }, ...credits });
    } else {
      dispatch({ type: 'WICKET', side: state.battingSide, payload: { ...payload, kind }, ...credits });
    }
    setWf(null);
  };

  if (wf) {
    const k = wf.kind;
    // Kinds on offer: a wicket off a wide / no-ball; a free hit (only these can
    // happen on one — UI-only, replays don't change); otherwise all, the rare
    // ones folded under "More ▾".
    const options: DismissalKind[] = wf.offExtra === 'wide' ? WIDE_WICKETS
      : wf.offExtra === 'noball' ? NOBALL_WICKETS
      : state.freeHit ? FREE_HIT_DISMISSALS
      : wf.more ? [...MAIN_DISMISSALS, ...MORE_DISMISSALS] : MAIN_DISMISSALS;
    const showMore = !wf.offExtra && !state.freeHit && !wf.more;
    const takesRuns = !!k && RUNS_KINDS.includes(k);
    const runsStep = takesRuns && wf.runs === undefined;
    const fielderStep = !!k && needsFielder(k) && !wf.fielder && !runsStep;
    const fielder2Step = k === 'runout' && !!wf.fielder && wf.fielder2 === undefined;
    const fieldDone = !!k && (!needsFielder(k) || !!wf.fielder) && (k !== 'runout' || wf.fielder2 !== undefined);
    const batterStep = !!k && needsBatter(k) && !wf.batterOut && !runsStep && fieldDone;
    const batterKnown = !!k && (!needsBatter(k) || !!wf.batterOut);
    const endStep = takesRuns && !runsStep && fieldDone && batterKnown && !wf.end;
    const newBatStep = !!k && !runsStep && fieldDone && batterKnown && (!takesRuns || !!wf.end);
    // Live scorecard-style recap of the dismissal as the scorer builds it, so the
    // wicket reads back ("c Fielder b Bowler") before the final confirming tap.
    const keeperNm = keeper?.name;
    const haveFielder = !k || !needsFielder(k) || !!wf.fielder;
    const outWho = k === 'mankad' ? 'nonstriker' : !k || !needsBatter(k) ? 'striker' : wf.batterOut;
    const outName = (outWho === 'nonstriker' ? nonStrikerName : strikerName) ?? 'Batter';
    const descriptor = !k ? '' : haveFielder ? composeDismissal(k, bowlerName, wf.fielder?.fullName, keeperNm, wf.fielder2?.fullName) : WICKET_LABEL[k].toLowerCase();
    // e.g. "1 run", "2 byes", "1 leg bye", "2 run(s) off a wide", "1 bye off a no-ball"
    const unitOf = (x: string | undefined, n: number) => (x === 'bye' ? `bye${n === 1 ? '' : 's'}` : x === 'legbye' ? `leg bye${n === 1 ? '' : 's'}` : `run${n === 1 ? '' : 's'}`);
    const runsTail = takesRuns && wf.runs != null
      ? ` · ${wf.runs} ${unitOf(wf.runsAs === 'noball' ? wf.nbRunsAs : wf.runsAs, wf.runs)}${wf.runsAs === 'wide' ? ' off a wide' : wf.runsAs === 'noball' ? ' off a no-ball' : ''}`
      : '';
    const offTail = !takesRuns && wf.offExtra ? ` · off a ${wf.offExtra === 'wide' ? 'wide' : 'no-ball'}` : '';
    const wktRecap = k ? `${batterKnown ? `${outName} ` : ''}${descriptor}${runsTail}${offTail}` : '';
    // "Next ball: X faces" — from where the wicket was broken (run out /
    // obstructing), else the new batter takes the vacated end; then the over end.
    const onExtraNow = takesRuns ? (wf.runsAs === 'wide' || wf.runsAs === 'noball' ? wf.runsAs : undefined) : wf.offExtra;
    const legalNow = !onExtraNow || (onExtraNow === 'wide' ? R.wideLegal : R.noBallLegal);
    const ballsNow = state.ballsInOver >= state.ballsPerOver ? 0 : state.ballsInOver;
    const overEndNow = !!k && !NO_DELIVERY.includes(k) && legalNow && ballsNow + 1 >= state.ballsPerOver;
    const outEnd = k && takesRuns && wf.end ? wf.end : outWho === 'nonstriker' ? 'bowler' : 'striker';
    const nextFaces = k ? creaseAfterWicket({ strikerId, strikerName, nonStrikerId, nonStrikerName }, outWho === 'nonstriker' ? 'nonstriker' : 'striker', outEnd, { id: '__new', name: 'the new batter' }, overEndNow) : undefined;
    // Legacy (no `end`) rotation isn't previewed for odd runs; every new wicket sends `end`.
    const facesText = nextFaces?.strikerName ? `Next ball: ${nextFaces.strikerName} faces${overEndNow ? ' (over ends)' : ''}` : '';
    const hint = k ? DISMISSAL_HINT[k] : undefined;
    const extraToggle = k === 'stumped' || k === 'hitwicket' ? 'wide' : k === 'hittwice' ? 'noball' : undefined;
    return (
      <View style={ctrl.wktPanel}>
        <View style={ctrl.creaseHead}>
          <Text style={ctrl.label}>🎯 Wicket{bowlerName ? ` — ${bowlerName}` : ''}</Text>
          <Button label="Cancel" variant="ghost" style={ctrl.swapBtn} onPress={() => setWf(null)} />
        </View>
        {state.freeHit && !wf.offExtra && <Text style={ctrl.freeHit}>🟢 FREE HIT — no bowler's wicket counts</Text>}
        {wktRecap ? <View style={ctrl.wktRecap}><Text style={ctrl.wktRecapText}>{wktRecap}</Text></View> : null}
        {hint ? <Text style={ctrl.meta}>ⓘ {hint}</Text> : null}

        {!k && (
          <>
            <Text style={ctrl.meta}>{wf.offExtra ? `Wicket off the ${wf.offExtra === 'wide' ? 'wide' : 'no-ball'} — how?` : `How was ${strikerName ?? 'the batter'} out?`}</Text>
            <View style={ctrl.chips}>
              {options.map((d) => (
                <SelectChip key={d} label={WICKET_LABEL[d]} active={false}
                  onPress={() => setWf({ kind: d, offExtra: wf.offExtra, runsAs: RUNS_KINDS.includes(d) ? (wf.offExtra ?? 'bat') : undefined })} />
              ))}
              {showMore && <SelectChip label="More ▾" active={false} onPress={() => setWf({ ...wf, more: true })} />}
            </View>
          </>
        )}

        {/* Stumped / hit wicket can fall off a wide; hit twice off a no-ball. */}
        {extraToggle && (
          <View style={ctrl.chips}>
            <SelectChip label={extraToggle === 'wide' ? 'Off a wide' : 'Off a no-ball'} active={wf.offExtra === extraToggle}
              onPress={() => setWf({ ...wf, offExtra: wf.offExtra === extraToggle ? undefined : extraToggle })} />
          </View>
        )}

        {runsStep && (
          <>
            <Text style={ctrl.meta}>Runs were</Text>
            <View style={ctrl.chips}>
              {RUNS_WERE.filter(([v]) => (v !== 'bye' || R.byes) && (v !== 'legbye' || R.legByes)).map(([v, label]) => (
                <SelectChip key={v} label={label} active={(wf.runsAs ?? 'bat') === v} onPress={() => setWf({ ...wf, runsAs: v })} />
              ))}
            </View>
            {wf.runsAs === 'noball' && (R.byes || R.legByes) && (
              <View style={[ctrl.chips, { alignItems: 'center' }]}>
                <Text style={ctrl.moreLabel}>No-ball runs</Text>
                {([['bat', 'Off the bat'], ['bye', 'Byes'], ['legbye', 'Leg byes']] as const).filter(([v]) => (v !== 'bye' || R.byes) && (v !== 'legbye' || R.legByes)).map(([v, label]) => (
                  <SelectChip key={v} label={label} active={(wf.nbRunsAs ?? 'bat') === v} onPress={() => setWf({ ...wf, nbRunsAs: v })} />
                ))}
              </View>
            )}
            <Text style={ctrl.meta}>Runs completed before the {k === 'obstruct' ? 'obstruction' : 'run out'}?</Text>
            <View style={ctrl.chips}>
              {[0, 1, 2, 3].map((n) => (
                <SelectChip key={n} label={String(n)} active={false} onPress={() => setWf({ ...wf, runs: n })} />
              ))}
            </View>
            <RunsInput placeholder="Other runs completed (0–99)" addLabel={(n) => `${n} run${n === 1 ? '' : 's'}`} onAdd={(n) => setWf({ ...wf, runs: n })} />
          </>
        )}

        {fielderStep && (
          <>
            <Text style={ctrl.meta}>{k === 'caught' ? 'Caught by?' : 'Run out by? (fielder)'}</Text>
            <View style={ctrl.chips}>
              {keeperFirst(bowlingRoster).map((p) => (
                <SelectChip key={p.id} label={`${p.fullName}${p.id === keeper?.id ? ' †' : ''}`} active={false} onPress={() => setWf({ ...wf, fielder: p })} />
              ))}
            </View>
          </>
        )}

        {fielder2Step && (
          <>
            <Text style={ctrl.meta}>2nd fielder (optional)</Text>
            <View style={ctrl.chips}>
              {keeperFirst(bowlingRoster).filter((p) => p.id !== wf.fielder?.id).map((p) => (
                <SelectChip key={p.id} label={`${p.fullName}${p.id === keeper?.id ? ' †' : ''}`} active={false} onPress={() => setWf({ ...wf, fielder2: p })} />
              ))}
              <SelectChip label="Skip" active={false} onPress={() => setWf({ ...wf, fielder2: null })} />
            </View>
          </>
        )}

        {batterStep && (
          <>
            <Text style={ctrl.meta}>{k === 'retired' ? 'Which batsman is retiring hurt?' : k === 'retiredout' ? 'Which batsman is retiring out?' : k === 'timedout' ? 'Which batsman timed out?' : 'Which batsman is out?'}</Text>
            <View style={ctrl.chips}>
              <SelectChip label={strikerName ?? 'Striker'} active={false} onPress={() => setWf({ ...wf, batterOut: 'striker' })} />
              <SelectChip label={`${nonStrikerName ?? 'Non-striker'} (NS)`} active={false} onPress={() => setWf({ ...wf, batterOut: 'nonstriker' })} />
            </View>
          </>
        )}

        {endStep && (
          <>
            <Text style={ctrl.meta}>Wicket broken at</Text>
            <View style={ctrl.chips}>
              <SelectChip label="Striker's end" active={false} onPress={() => setWf({ ...wf, end: 'striker' })} />
              <SelectChip label="Bowler's end" active={false} onPress={() => setWf({ ...wf, end: 'bowler' })} />
            </View>
          </>
        )}

        {newBatStep && (
          allOut ? (
            <Button label="Confirm wicket — all out" variant="danger" onPress={() => finishWicket(undefined)} />
          ) : (
            <>
              {facesText ? <Text style={ctrl.hint}>{facesText}</Text> : null}
              <Text style={ctrl.meta}>Next batsman in</Text>
              {newBatOptions.length > 0 ? (
                <View style={ctrl.chips}>
                  {newBatOptions.map((p) => (
                    <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => finishWicket(p)} />
                  ))}
                </View>
              ) : <Text style={ctrl.hint}>No batsmen left to come in.</Text>}
            </>
          )
        )}
      </View>
    );
  }

  // Impact Player flow: choose who makes way (not currently batting/bowling),
  // then the substitute coming in. One per side, enforced in the reducer.
  if (impact) {
    const sideName = impact.side === 'home' ? homeName : awayName;
    const pool = rosterFor(impact.side);
    const outOptions = pool.filter((p) => !isUnavailable(p.id) && !atCrease(p.id) && p.id !== bowlerId && !isOut(p.id));
    const inOptions = pool.filter((p) => !isUnavailable(p.id) && p.id !== impact.out?.id && !state.batting[p.id] && !state.bowling[p.id]);
    return (
      <View style={ctrl.wktPanel}>
        <View style={ctrl.creaseHead}>
          <Text style={ctrl.label}>{impact.kind === 'concussion' ? '🚑 Concussion sub' : '⚡ Impact Player'} — {sideName}</Text>
          <Button label="Cancel" variant="ghost" style={ctrl.swapBtn} onPress={() => setImpact(null)} />
        </View>
        {impact.out ? <View style={ctrl.impactRecap}><Text style={ctrl.impactRecapText}>⚡ {impact.out.fullName} makes way</Text></View> : null}
        {!impact.out ? (
          <>
            <Text style={ctrl.meta}>Who makes way? (takes no further part — can't be batting or bowling now)</Text>
            {outOptions.length > 0 ? (
              <View style={ctrl.chips}>
                {outOptions.map((p) => (
                  <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => setImpact({ ...impact, out: p })} />
                ))}
              </View>
            ) : <Text style={ctrl.hint}>No eligible player to replace right now.</Text>}
          </>
        ) : (
          <>
            <Text style={ctrl.meta}>Choose the {impact.kind === 'concussion' ? 'replacement' : 'Impact Player'} coming in</Text>
            {inOptions.length > 0 ? (
              <View style={ctrl.chips}>
                {inOptions.map((p) => (
                  <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => finishImpact(p)} />
                ))}
              </View>
            ) : <Text style={ctrl.hint}>No unused substitute available — add one to the matchday squad.</Text>}
          </>
        )}
      </View>
    );
  }

  const need = !strikerId ? 'striker' : !nonStrikerId ? 'a non-striker' : null;
  const wk = state.keepers[other(state.battingSide)]?.name;
  const pp = inPowerplay(state);
  // Sides that still have their Impact Player available (format-gated).
  const impactSides = (['home', 'away'] as const).filter((sd) => state.impactEnabled && !state.impactUsed[sd]);

  // Over-complete flow: the reducer clears the bowler after the 6th legal ball, so
  // `!bowlerId` with a whole number of overs bowled means an over just finished.
  const oversDone = Math.floor(cur.balls / state.ballsPerOver);
  const nextOverNo = oversDone + 1;
  const oversLabel = state.oversLimit < 100 ? ` of ${state.oversLimit}` : ''; // hide for timeless/Test
  const overJustDone = !bowlerId && cur.balls > 0 && cur.balls % state.ballsPerOver === 0;

  return (
    <View style={{ gap: theme.spacing(4) }}>
      {soActive && (() => {
        const so = rootState.superOver!;
        const bt = state.scores[state.battingSide];
        const line = [
          `${state.innings === 1 ? '1st' : '2nd'} innings`,
          `${battingName} ${bt.runs}/${bt.wickets}`,
          `${state.scores[state.battingSide].balls}/6 balls`,
          ...(state.innings === 2 && state.target ? [`need ${Math.max(0, state.target - bt.runs)} off ${Math.max(0, 6 - bt.balls)}`] : []),
        ].join('  ·  ');
        return (
          <View style={ctrl.soBanner}>
            <Text style={ctrl.soTitle}>🔥 SUPER OVER{so.round > 1 ? ` — Round ${so.round}` : ''}</Text>
            <Text style={ctrl.soLine}>{line}</Text>
            <Text style={ctrl.soMeta}>1 over · 2 wickets · {so.battingFirst === 'home' ? homeName : awayName} bat first</Text>
          </View>
        );
      })()}
      {pp && <Text style={ctrl.powerplay}>🟡 POWERPLAY · overs 1–{state.powerplayOvers} — fielding restrictions in effect</Text>}
      {/* Batsmen at the crease — auto-rotated; dismissed players are grayed out. */}
      <View style={{ gap: theme.spacing(2) }}>
        <View style={ctrl.creaseHead}>
          <Text style={ctrl.label}>🏏 Batsmen — {battingName}</Text>
          <Button label="⇄ Swap" variant="ghost" style={ctrl.swapBtn} disabled={!bothSet} onPress={() => dispatch({ type: 'SWAP_STRIKE' })} />
        </View>
        <Text style={ctrl.meta}>
          Striker: <Text style={ctrl.creaseHi}>{strikerName ?? '—'}</Text>{strikerId ? ' 🏏' : ''}   ·   Non-striker: <Text style={ctrl.creaseHi}>{nonStrikerName ?? '—'}</Text>
        </Text>
        <View style={ctrl.chips}>
          {battingRoster.map((p) => (
            <SelectChip key={p.id} label={isUnavailable(p.id) ? `${p.fullName} ⚡` : p.fullName} active={atCrease(p.id)} disabled={isOut(p.id) || isUnavailable(p.id)} onPress={() => pickBat(p)} />
          ))}
        </View>
        {need && <Text style={ctrl.hint}>Pick {need} to start scoring.</Text>}
      </View>

      {state.freeHit && (
        <View style={ctrl.freeHitBox}>
          <Text style={ctrl.freeHitText}>🟢 FREE HIT — {strikerName ?? 'the batter'} can’t be out bowled, caught, lbw or stumped</Text>
        </View>
      )}

      {/* Overs & target (parity #18): change overs, a rain cut (DLS) or a typed
          target — one card. Not during a Super Over / the tie call, nor a Test. */}
      {!soActive && !rootState.ended && !rootState.pendingTie && rootState.oversLimit < 100 && (
        <OversTargetCard s={rootState} dispatch={dispatch} battingName={battingName} />
      )}

      {rulesNote ? (
        <View style={ctrl.rulesChip} accessibilityLabel={rulesNote}>
          <Text style={ctrl.rulesChipText}>⚙️ {rulesNote}</Text>
        </View>
      ) : null}

      {/* Runs — credited to the on-strike batsman; strike rotates automatically. */}
      <View style={ctrl.row}>
        {[0, 1, 2, 3, 4, 6].map((r) => (
          <Button key={r} label={String(r)} color={r === 4 || r === 6 ? theme.colors.primary : battingColor} style={[ctrl.flex, ctrl.padKey]} disabled={!canScore}
            accessibilityLabel={r === 4 ? 'Four (boundary)' : r === 6 ? 'Six (boundary)' : undefined}
            onPress={() => (r === 4 || r === 6 ? runs(r, { boundary: true }) : runs(r))} />
        ))}
        {/* 7th key: rare run values (a compact ghost key so the pad stays one row). */}
        <TouchableOpacity
          style={[ctrl.flex, ctrl.moreKey, extraMode === 'more' && ctrl.moreKeyOn, !canScore && { opacity: 0.4 }]}
          disabled={!canScore} activeOpacity={0.85} accessibilityRole="button"
          accessibilityLabel="More runs: all run, overthrows, other" accessibilityState={{ disabled: !canScore, expanded: extraMode === 'more' }}
          onPress={() => { const open = extraMode === 'more'; closeMore(); if (!open) setExtraMode('more'); }}>
          <Text style={ctrl.moreKeyText} numberOfLines={1} adjustsFontSizeToFit>5·7·+</Text>
        </TouchableOpacity>
      </View>

      {extraMode === 'more' && (() => {
        const otTotal = otRan + (otOver ?? 0);
        const credit = otOver === 4 || otTotal === 4 ? ' · not a four' : otTotal === 6 ? ' · not a six' : '';
        return (
          <View style={ctrl.morePanel}>
            <Text style={ctrl.meta}>All run — not a boundary</Text>
            <View style={ctrl.row}>
              {[4, 5, 7].map((n) => (
                <Button key={n} label={`${n} runs`} color={battingColor} style={ctrl.flex}
                  onPress={() => { runs(n, { boundary: false }); closeMore(); }} />
              ))}
            </View>
            <Text style={ctrl.meta}>Overthrows — runs completed, then the overthrows</Text>
            <View style={[ctrl.chips, { alignItems: 'center' }]}>
              <Text style={ctrl.moreLabel}>Ran</Text>
              {[0, 1, 2, 3].map((n) => <SelectChip key={n} label={String(n)} active={otRan === n} onPress={() => setOtRan(n)} />)}
            </View>
            <View style={[ctrl.chips, { alignItems: 'center' }]}>
              <Text style={ctrl.moreLabel}>Overthrows</Text>
              {[1, 2, 3, 4].map((n) => <SelectChip key={n} label={n === 4 ? '4 (boundary)' : String(n)} active={otOver === n} onPress={() => setOtOver(n)} />)}
            </View>
            {otOver ? (
              <>
                <Text style={ctrl.morePreview}>= {otTotal} to {strikerName ?? 'the striker'}{credit}</Text>
                <Button label={`Add ${otTotal} run${otTotal === 1 ? '' : 's'}`} color={battingColor}
                  onPress={() => { runs(otTotal, { boundary: false, overthrows: otOver }); closeMore(); }} />
              </>
            ) : null}
            <Text style={ctrl.meta}>Any other number</Text>
            <RunsInput onAdd={(n) => { runs(n, { boundary: false }); closeMore(); }} addLabel={(n) => `Add ${n}`} />
          </View>
        );
      })()}

      {/* Byes / leg byes — team extras, not charged to bat or bowler. */}
      <View style={{ gap: theme.spacing(2) }}>
        {(R.byes || R.legByes) && (
          <View style={ctrl.row}>
            {R.byes && <Button label="Bye" variant="ghost" style={ctrl.flex} disabled={!canScore} onPress={() => setExtraMode((m) => (m === 'b' ? null : 'b'))} />}
            {R.legByes && <Button label="Leg bye" variant="ghost" style={ctrl.flex} disabled={!canScore} onPress={() => setExtraMode((m) => (m === 'lb' ? null : 'lb'))} />}
          </View>
        )}
        {((extraMode === 'b' && R.byes) || (extraMode === 'lb' && R.legByes)) && (
          <View style={ctrl.row}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Button key={n} label={`${extraMode === 'lb' ? 'LB' : 'B'} ${n}`} color={battingColor} style={[ctrl.flex, ctrl.padKey]}
                onPress={() => { ball({ type: extraMode === 'lb' ? 'LEGBYES' : 'BYES', payload: { runs: n } }); setExtraMode(null); }} />
            ))}
          </View>
        )}
        {((extraMode === 'b' && R.byes) || (extraMode === 'lb' && R.legByes)) && (
          <>
            <RunsInput min={1} placeholder={`Other ${extraMode === 'lb' ? 'leg byes' : 'byes'} (1–99)`}
              addLabel={(n) => `Add ${extraMode === 'lb' ? 'LB' : 'B'} ${n}`}
              onAdd={(n) => { ball({ type: extraMode === 'lb' ? 'LEGBYES' : 'BYES', payload: { runs: n } }); setExtraMode(null); }} />
            <Text style={ctrl.meta}>Overthrows off a bye → add them to the byes.</Text>
          </>
        )}
        {extraMode === 'nb' && (
          <>
            <Text style={ctrl.meta}>No ball{R.noBallRuns !== STANDARD_RULES.noBallRuns ? ` (+${R.noBallRuns})` : ''}{R.noBallLegal ? ' · counts as a ball' : ''} — runs off the bat?</Text>
            <View style={ctrl.row}>
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <Button key={n} label={n === 0 ? 'Nb' : `+${n}`} accessibilityLabel={n === 0 ? 'Nb' : `Nb+${n}`} color={n === 4 || n === 6 ? theme.colors.primary : battingColor} style={[ctrl.flex, ctrl.padKey]}
                  // 4 and 6 are boundaries; an all-run 4 off a no-ball goes in the field below.
                  onPress={() => { ball({ type: 'EXTRA', payload: { kind: 'No ball', runs: n, boundary: n === 4 || n === 6 }, attribution: nbRuns(n) }); setExtraMode(null); }} />
              ))}
            </View>
            <RunsInput placeholder="Other off the bat, all run (0–99)" addLabel={(n) => `Add Nb+${n}`}
              onAdd={(n) => { ball({ type: 'EXTRA', payload: { kind: 'No ball', runs: n, boundary: false }, attribution: nbRuns(n) }); setExtraMode(null); }} />
            <Text style={ctrl.meta}>…or byes run off the no-ball (missed the bat)?</Text>
            <View style={ctrl.row}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Button key={n} label={`Nb+${n}b`} variant="ghost" style={[ctrl.flex, ctrl.padKey]}
                  onPress={() => { ball({ type: 'EXTRA', payload: { kind: 'No ball', byes: n } }); setExtraMode(null); }} />
              ))}
            </View>
            <Button label="🎯 …or a WICKET off the no-ball" variant="danger" disabled={!canScore}
              onPress={() => { setExtraMode(null); setWf({ offExtra: 'noball' }); }} />
          </>
        )}
        {extraMode === 'wd' && (
          <>
            <Text style={ctrl.meta}>Wide{R.wideRuns !== STANDARD_RULES.wideRuns ? ` (+${R.wideRuns})` : ''}{R.wideLegal ? ' · counts as a ball' : ''} — any runs run (byes on the wide, or 4 if it beat the keeper)?</Text>
            <View style={ctrl.row}>
              {[0, 1, 2, 3, 4].map((n) => (
                // label shows the total with the wide penalty in force, e.g. Wd+3 (=4)
                <Button key={n} label={n === 0 ? 'Wd' : `Wd+${n} (=${penalty('wide', R) + n})`} color={n === 4 ? theme.colors.primary : battingColor} style={[ctrl.flex, ctrl.padKey]}
                  onPress={() => { ball({ type: 'EXTRA', payload: { kind: 'Wide', runs: n } }); setExtraMode(null); }} />
              ))}
            </View>
            <RunsInput placeholder="Other runs on the wide (0–99)" addLabel={(n) => `Add Wd+${n} (=${penalty('wide', R) + n})`}
              onAdd={(n) => { ball({ type: 'EXTRA', payload: { kind: 'Wide', runs: n } }); setExtraMode(null); }} />
            <Button label="🎯 …or a WICKET off the wide" variant="danger" disabled={!canScore}
              onPress={() => { setExtraMode(null); setWf({ offExtra: 'wide' }); }} />
          </>
        )}
      </View>

      {/* Bowler — must be (re)named at the start of each over. Parity #17: the
          engine's canBowl drives every chip (quota, last over, suspended); once a
          ball of the over is bowled the bowler is locked — only an inline
          mid-over replacement can take over. Every SET_BOWLER here sends v: 2. */}
      {(() => {
        const locked = midOver(state) && !!bowlerId;
        const q = state.bowlerQuota ?? 0;
        const checks = bowlingRoster.map((p) => ({ p, c: canBowl(state, p.id) }));
        const tagFor = (reason?: string) => reason === 'last-over' ? ' · last over' : reason === 'quota' ? ' · quota done'
          : reason === 'barred' ? ' · suspended' : reason === 'this-over' ? ' · this over' : reason === 'unavailable' ? ' ⚡' : '';
        const chipLabel = (p: Player, reason?: string) => {
          const used = oversUsed(state, p.id);
          const tally = q > 0 ? ` · ${used}/${q}` : used > 0 ? ` · ${used} ov` : '';
          return `${p.fullName}${tally}${tagFor(reason)}`;
        };
        // Pickable now: ok, or held back only by the quota while "Allow anyway" is on.
        const pickable = (c: { ok: boolean; reason?: string }) => c.ok || (forceQuota && c.reason === 'quota');
        const pick = (p: Player, c: { ok: boolean; reason?: string }, reason?: 'injury' | 'suspended' | 'other') => {
          dispatch({ type: 'SET_BOWLER', payload: { id: p.id, name: p.fullName, v: 2, ...(reason ? { reason } : {}), ...(!c.ok && c.reason === 'quota' ? { force: true } : {}) } });
          setForceQuota(false);
          setBowlRepl(null);
        };
        // Replacements: anyone but the current bowler (bowlers of THIS over are
        // already blocked by canBowl).
        const pool = checks.filter(({ p }) => p.id !== bowlerId);
        const onlyQuota = (list: typeof checks) => list.length > 0 && !list.some(({ c }) => c.ok) && list.some(({ c }) => c.reason === 'quota');
        const quotaOut = (list: typeof checks) => onlyQuota(list) && (
          <View style={ctrl.rulesChip}>
            <Text style={ctrl.rulesChipText}>Everyone has bowled their quota</Text>
            {!forceQuota && <Button label="Allow anyway" variant="ghost" style={ctrl.swapBtn} onPress={() => setForceQuota(true)} />}
          </View>
        );
        return (
          <View style={{ gap: theme.spacing(2) }}>
            {overJustDone ? <View style={ctrl.overDone}><Text style={ctrl.overDoneText}>✓ Over {oversDone} complete — new bowler needed</Text></View> : null}
            <Text style={ctrl.label}>
              🎯 {bowlerId ? `Bowling: ${bowlerName}` : `Over ${nextOverNo}${oversLabel} — pick ${bowlingName} bowler`}{wk ? `  ·  † ${wk}` : ''}
            </Text>
            <View style={ctrl.chips}>
              {checks.map(({ p, c }) => (
                <SelectChip
                  key={p.id}
                  label={chipLabel(p, p.id === bowlerId ? undefined : c.reason)}
                  active={bowlerId === p.id}
                  disabled={locked ? p.id !== bowlerId : !pickable(c)}
                  onPress={() => { if (!locked && p.id !== bowlerId) pick(p, c); }}
                />
              ))}
            </View>
            {!locked && !bowlRepl && quotaOut(checks)}
            {!bowlerId && <Text style={ctrl.hint}>Bowlers of the last over (any part of it) can't bowl this one.</Text>}
            {locked && !bowlRepl && (
              <Button label="🚑 Replace bowler mid-over" variant="ghost" onPress={() => setBowlRepl('injury')} />
            )}
            {locked && bowlRepl && (
              <View style={ctrl.morePanel}>
                <View style={ctrl.creaseHead}>
                  <Text style={[ctrl.label, ctrl.flex]}>Replace {bowlerName} at {oversStr(cur.balls, state.ballsPerOver)} — balls so far stay with them</Text>
                  <Button label="Cancel" variant="ghost" style={ctrl.swapBtn} onPress={() => { setBowlRepl(null); setForceQuota(false); }} />
                </View>
                <View style={ctrl.chips}>
                  {([['injury', 'Injured'], ['suspended', 'Suspended'], ['other', 'Other']] as const).map(([v, l]) => (
                    <SelectChip key={v} label={l} active={bowlRepl === v} onPress={() => setBowlRepl(v)} />
                  ))}
                </View>
                {bowlRepl === 'suspended' && <Text style={ctrl.meta}>{bowlerName} can't bowl again this innings.</Text>}
                <Text style={ctrl.meta}>Who finishes the over?</Text>
                <View style={ctrl.chips}>
                  {pool.map(({ p, c }) => (
                    <SelectChip key={p.id} label={chipLabel(p, c.reason)} active={false} disabled={!pickable(c)} onPress={() => pick(p, c, bowlRepl)} />
                  ))}
                </View>
                {quotaOut(pool)}
              </View>
            )}
          </View>
        );
      })()}

      {/* Impact Player (IPL-style) — one substitution per side, format-gated. */}
      {(state.impactEnabled && (impactSides.length > 0 || state.impactUsed.home || state.impactUsed.away)) && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={ctrl.label}>⚡ Impact Player</Text>
          {(['home', 'away'] as const).map((sd) => {
            const used = state.impactUsed[sd];
            const nm = sd === 'home' ? homeName : awayName;
            return used ? (
              <Text key={sd} style={ctrl.meta}>{nm}: {used.inName} in for {used.outName}</Text>
            ) : (
              <Button key={sd} label={`⚡ Bring in Impact Player — ${nm}`} variant="ghost" onPress={() => setImpact({ side: sd, kind: 'impact' })} />
            );
          })}
        </View>
      )}

      {/* Concussion / injury replacement — a like-for-like sub (any time, not the
          IPL Impact Player). The injured player takes no further part. */}
      {canScore && (
        <View style={ctrl.row}>
          <Button label={`🚑 Concussion sub — ${homeName}`} variant="ghost" style={ctrl.flex} onPress={() => setImpact({ side: 'home', kind: 'concussion' })} />
          <Button label={`🚑 Concussion sub — ${awayName}`} variant="ghost" style={ctrl.flex} onPress={() => setImpact({ side: 'away', kind: 'concussion' })} />
        </View>
      )}

      <View style={ctrl.row}>
        <Button label="WICKET" variant="danger" style={ctrl.flex} disabled={!canScore} onPress={() => setWf({})} />
        <Button label="Wide" variant="ghost" style={ctrl.flex} disabled={!canScore} onPress={() => setExtraMode((m) => (m === 'wd' ? null : 'wd'))} />
        <Button label="No ball" variant="ghost" style={ctrl.flex} disabled={!canScore} onPress={() => setExtraMode((m) => (m === 'nb' ? null : 'nb'))} />
      </View>
      <View style={ctrl.row}>
        <Button label="⚖️ Penalty +5" variant="ghost" style={ctrl.flex} disabled={!canScore} onPress={() => ball({ type: 'PENALTY', payload: { runs: 5 } })} />
      </View>

      {/* Ending an innings/match is a big, easy-to-mis-tap action — confirm it,
          and show the key facts (score, overs, resulting target) first. */}
      {confirmEnd ? (
        <View style={ctrl.confirmBox}>
          <Text style={ctrl.confirmText}>
            {state.innings === 1
              ? `End ${battingName}'s innings at ${cur.runs}/${cur.wickets} (${oversStr(cur.balls, state.ballsPerOver)} ov)? ${bowlingName} will chase ${cur.runs + 1}.`
              : `End the match with ${battingName} on ${cur.runs}/${cur.wickets}${state.target ? `, chasing ${state.target}` : ''}?`}
          </Text>
          <View style={ctrl.row}>
            <Button label="Cancel" variant="ghost" style={ctrl.flex} onPress={() => setConfirmEnd(false)} />
            {state.innings === 1 ? (
              <Button label="End innings →" style={ctrl.flex} onPress={() => { dispatch({ type: 'END_INNINGS' }); setConfirmEnd(false); }} />
            ) : (
              <Button label="End match" variant="danger" style={ctrl.flex} onPress={() => { dispatch({ type: 'END' }); setConfirmEnd(false); }} />
            )}
          </View>
        </View>
      ) : (
        <Button
          label={state.innings === 1 ? 'End innings →' : 'End match'}
          variant={state.innings === 1 ? 'ghost' : 'danger'}
          onPress={() => setConfirmEnd(true)}
        />
      )}
    </View>
  );
};

/* ------------------------------ Live panel --------------------------------- */

const LiveClock: NonNullable<SportPlugin<CricketState>['LiveClock']> = ({ state }) => {
  const s = state as CricketState;
  const inn = s.scores[s.battingSide];
  return (
    <View style={ctrl.clockRow}>
      <View style={[ctrl.liveDot, { backgroundColor: s.ended ? theme.colors.textMuted : theme.colors.danger }]} />
      <Text style={ctrl.clockTime}>{s.ended ? 'Result' : `${oversStr(inn.balls, s.ballsPerOver)} / ${s.oversLimit} ov${s.revision === 'dls' ? ' · DLS' : ''}`}</Text>
      {inPowerplay(s) && <Text style={ctrl.ppTag}>🟡 PP</Text>}
    </View>
  );
};

/** Cricket's own scoreboard: innings on top, the batting team's live score +
 *  overs next, then who's yet to bat (1st inn) or the target (2nd inn). */
/* ---------------------- Post-match performance ratings --------------------- */

export interface PlayerRating {
  id: string;
  name: string;
  side: 'home' | 'away';
  bat: number;
  bowl: number;
  field: number;
  total: number;
  /** contribution mapped to a 1–5 star rating */
  rating: number;
}

/** Map raw contribution points to a 1–5 rating (par ≈ 2). */
const ratingFor = (total: number) => Math.max(1, Math.min(5, Math.round((2 + total / 14) * 2) / 2));
const stars = (r: number) => '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));
/** Up to two initials from a (possibly masked) name, for a rating-row avatar. */
const nameInitials = (name?: string): string =>
  (name ?? '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

/**
 * Rate every player's match contribution (cricket-expert weighting):
 *  • Batting: runs + boundary bonus (4→+1, 6→+2), milestones (30/50/100),
 *    strike-rate context, duck penalty.
 *  • Bowling: wickets (×18) + dot balls + 3/5-fer bonus + economy + a top-order
 *    bonus (dismissing a top-3 bat is worth more than a tail-ender).
 *  • Fielding: catch +8, run out +8 (incl. a Mankad, to the bowler), stumping +10.
 * Returns players sorted by total, plus the MVP / best bat / best bowl.
 */
export function matchRatings(s: CricketState): {
  players: PlayerRating[]; mvp?: PlayerRating; bestBat?: PlayerRating; bestBowl?: PlayerRating;
} {
  const reg = new Map<string, { name: string; side: 'home' | 'away' }>();
  for (const [id, b] of Object.entries(s.batting)) reg.set(id, { name: b.name, side: b.side });
  for (const [id, w] of Object.entries(s.bowling)) if (!reg.has(id)) reg.set(id, { name: w.name, side: w.side });
  for (const d of s.dismissals) {
    if (d.fielderId && d.fielderName && !reg.has(d.fielderId)) {
      const outSide = d.outId ? s.batting[d.outId]?.side : undefined;
      reg.set(d.fielderId, { name: d.fielderName, side: outSide ? other(outSide) : 'home' });
    }
  }
  (['home', 'away'] as const).forEach((sd) => {
    const k = s.keepers[sd]; if (k && !reg.has(k.id)) reg.set(k.id, { name: k.name, side: sd });
    const c = s.captains[sd]; if (c && !reg.has(c.id)) reg.set(c.id, { name: c.name, side: sd });
  });

  // Batting order = insertion order within a side.
  const orderOf = (id?: string): number => {
    if (!id) return 99;
    const side = s.batting[id]?.side;
    if (!side) return 99;
    const ids = Object.keys(s.batting).filter((k) => s.batting[k].side === side);
    const i = ids.indexOf(id);
    return i < 0 ? 99 : i + 1;
  };

  const players: PlayerRating[] = [...reg.entries()].map(([id, info]) => {
    const b = s.batting[id];
    const w = s.bowling[id];
    let bat = 0;
    if (b) {
      bat = b.runs + b.fours + b.sixes * 2;
      if (b.runs >= 100) bat += 16; else if (b.runs >= 50) bat += 8; else if (b.runs >= 30) bat += 4;
      if (b.balls >= 10) {
        const sr = (b.runs / b.balls) * 100;
        if (sr >= 150) bat += 6; else if (sr >= 120) bat += 3; else if (sr < 70) bat -= 3;
      }
      if (b.out && b.runs === 0 && b.balls > 0) bat -= 4; // duck
    }
    let bowl = 0;
    if (w) {
      bowl = w.wickets * 18 + w.dots;
      bowl -= w.extras * 1.5; // each wide / no-ball shaves a little off the rating
      if (w.wickets >= 5) bowl += 16; else if (w.wickets >= 3) bowl += 8;
      if (w.balls >= 12) {
        const econ = w.runs / (w.balls / s.ballsPerOver);
        if (econ <= 4) bowl += 10; else if (econ <= 6) bowl += 5; else if (econ >= 11) bowl -= 5;
      }
    }
    let field = 0;
    for (const d of s.dismissals) {
      if (d.bowlerId === id && !NO_BOWLER.includes(d.kind)) {
        const o = orderOf(d.outId);
        if (o <= 3) bowl += 10; else if (o <= 6) bowl += 5;
      }
      if (d.fielderId === id) {
        if (d.kind === 'caught') field += 8;
        else if (d.kind === 'stumped') field += 10;
        else if (d.kind === 'runout' || d.kind === 'mankad') field += 8; // a Mankad counts like a run-out
      }
    }
    const total = bat + bowl + field;
    return { id, name: info.name, side: info.side, bat, bowl, field, total, rating: ratingFor(total) };
  }).filter((p) => !!s.batting[p.id] || !!s.bowling[p.id] || p.field > 0);

  players.sort((a, b) => b.total - a.total || b.bat + b.bowl - (a.bat + a.bowl));
  const mvp = players.find((p) => p.total > 0);
  const bestBat = [...players].sort((a, b) => b.bat - a.bat).find((p) => p.bat > 0);
  const bestBowl = [...players].sort((a, b) => b.bowl - a.bowl).find((p) => p.bowl > 0);
  return { players, mvp, bestBat, bestBowl };
}

const CricketSummary: NonNullable<SportPlugin<CricketState>['Summary']> = ({ state, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away, onPlayer, manualResultLine }) => {
  const s = state as CricketState;
  const mask = useMask();
  const { players, mvp, bestBat, bestBowl } = matchRatings(s);
  const teamName = (side: 'home' | 'away') => (side === 'home' ? homeName : awayName);
  const teamColor = (side: 'home' | 'away') => (side === 'home' ? homeColor : awayColor);

  const Award = ({ icon, label, p, detail }: { icon: string; label: string; p?: PlayerRating; detail: string }) => {
    if (!p) return null;
    const nm = mask.byId(p.id, p.name);
    return (
      <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={() => onPlayer?.(p.id)} style={sum.award}>
        <View style={[sum.awardAvatar, { backgroundColor: teamColor(p.side) }]}>
          <Text style={sum.awardAvatarText}>{nameInitials(nm)}</Text>
          <Text style={sum.awardBadge}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={sum.awardLabel} numberOfLines={1}>{label}</Text>
          <Text style={sum.awardName} numberOfLines={1}>{nm}</Text>
          <Text style={sum.awardDetail} numberOfLines={1}>{detail} · {teamName(p.side)}</Text>
        </View>
        <Text style={[sum.awardPts, { color: teamColor(p.side) }]} numberOfLines={1}>★{p.rating.toFixed(1)}</Text>
      </TouchableOpacity>
    );
  };

  const batLine = (p: PlayerRating) => { const b = s.batting[p.id]; return b ? `${b.runs} (${b.balls})` : '—'; };
  const bowlLine = (p: PlayerRating) => { const w = s.bowling[p.id]; return w ? `${w.wickets}-${w.runs} (${oversStr(w.balls, s.ballsPerOver)})` : '—'; };
  // MVP line — only the disciplines the player actually featured in, so a pure
  // batter reads "30 (17)" not "30 (17) · —" (and an all-rounder shows both).
  const mvpDetail = (p: PlayerRating) => {
    const parts: string[] = [];
    if (s.batting[p.id]) parts.push(batLine(p));
    if (s.bowling[p.id]) parts.push(bowlLine(p));
    return parts.join(' · ') || '—';
  };

  // Player-ratings list — shared by the live ("so far") and post-match views.
  const ratingsBlock = () => (
    <View style={ctrl.card}>
      {players.map((p, i) => {
        const tier = podiumColor(i);
        const dispName = mask.byId(p.id, p.name);
        return (
        <TouchableOpacity accessibilityRole="button" key={p.id} activeOpacity={onPlayer ? 0.8 : 1} onPress={() => onPlayer?.(p.id)} style={[sum.prow, tier ? { backgroundColor: tier + '14', borderRadius: theme.radius.sm } : i > 0 && sum.divider]}>
          <RankBadge index={i} width={22} />
          <View style={[sum.rateAvatar, { backgroundColor: teamColor(p.side) }]}>
            <Text style={sum.rateAvatarText}>{nameInitials(dispName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={textStyles.body} numberOfLines={1}>{dispName}</Text>
            <Text style={sum.rateDetail} numberOfLines={1}>{mvpDetail(p)}</Text>
          </View>
          <View style={sum.ratingCol}>
            <Text style={sum.stars} numberOfLines={1}>{stars(p.rating)}</Text>
            <Text style={sum.total}>{p.rating.toFixed(1)}</Text>
          </View>
        </TouchableOpacity>
        );
      })}
    </View>
  );

  // Live, in progress: show the standouts so far rather than a bare "come back
  // later" card (matches the generic MatchSummary's live treatment). Before a
  // ball is bowled there's nothing to rank, so keep the gentle placeholder.
  // Closed by hand (abandoned / no result / conceded…) before the natural end:
  // the stored result is the final word — no LIVE card, no chase equation.
  if (!s.ended && manualResultLine) {
    return (
      <View style={{ gap: theme.spacing(3) }}>
        <View style={ctrl.card}>
          <Text style={ctrl.label}>🏁 Result</Text>
          <Text style={sum.awardName}>{manualResultLine}</Text>
        </View>
        {mvp ? <Award icon="👑" label="Most valuable player" p={mvp} detail={mvpDetail(mvp)} /> : null}
      </View>
    );
  }
  if (!s.ended) {
    if (players.length === 0) {
      return (
        <View style={ctrl.card}>
          <Text style={ctrl.label}>🏅 Match summary</Text>
          <Text style={ctrl.meta}>Best performers, the MVP and player ratings appear here once play begins.</Text>
        </View>
      );
    }
    const bat = s.battingSide;
    const inn = s.scores[bat];
    // In the chase, spell out the equation a spectator wants — target, runs still
    // needed, balls left and the required rate — which otherwise only ever showed
    // in the scorer's own controls (Super Over / DLS), never to a view-only viewer.
    const inChase = s.innings === 2 && !!s.target;
    const runsNeeded = Math.max(0, (s.target ?? 0) - inn.runs);
    const ballsLeft = Math.max(0, s.oversLimit * s.ballsPerOver - inn.balls);
    const rrr = ballsLeft > 0 ? (runsNeeded / (ballsLeft / s.ballsPerOver)).toFixed(2) : '—';
    return (
      <View style={{ gap: theme.spacing(3) }}>
        <View style={sum.liveResult}>
          <View style={sum.liveHead}>
            <View style={sum.liveTag}><View style={sum.liveDot} /><Text style={sum.liveTagText}>LIVE</Text></View>
            <Text style={sum.liveInnings}>Innings {s.innings}</Text>
          </View>
          {s.pendingTie ? (
            <Text style={sum.liveLine}>🔥 Scores level</Text>
          ) : (
            <>
              <View style={sum.liveScoreRow}>
                <Text style={[sum.liveTeam, { color: teamColor(bat) }]} numberOfLines={1}>{teamName(bat)}</Text>
                <Text style={[sum.liveScore, { color: teamColor(bat) }]}>{inn.runs}/{inn.wickets}</Text>
                <Text style={sum.liveOvers}>({oversStr(inn.balls, s.ballsPerOver)} ov)</Text>
              </View>
              <Text style={sum.liveRR}>Run rate {runRate(inn.runs, inn.balls, s.ballsPerOver)}</Text>
              {inChase ? (
                <View style={sum.chaseStrip}>
                  <Text style={sum.chaseNeed}>Need {runsNeeded} off {ballsLeft}</Text>
                  <Text style={sum.chaseMeta}>Target {s.target}{targetTag(s)} · RRR {rrr}</Text>
                </View>
              ) : null}
            </>
          )}
        </View>

        <Text style={ctrl.label}>Standouts so far</Text>
        {mvp && <Award icon="🔥" label="Top performer" p={mvp} detail={mvpDetail(mvp)} />}
        <View style={sum.row}>
          <View style={sum.half}>{bestBat && <Award icon="🏏" label="Top bat" p={bestBat} detail={batLine(bestBat)} />}</View>
          <View style={sum.half}>{bestBowl && <Award icon="🎯" label="Top bowl" p={bestBowl} detail={bowlLine(bestBowl)} />}</View>
        </View>

        <Text style={[ctrl.label, { marginTop: theme.spacing(2) }]}>Player ratings · so far</Text>
        <Text style={ctrl.meta}>Updates every ball — final ratings lock when the match ends.</Text>
        {ratingsBlock()}
      </View>
    );
  }

  // Who won — so the final banner can name the side and dim the loser's score
  // (resultLine only carries the margin, e.g. "Won by 26 runs").
  const { winner: winnerSide, text: resultTail } = outcome(s);
  const FinalSide = ({ side }: { side: 'home' | 'away' }) => (
    <View style={[sum.finalSide, winnerSide && winnerSide !== side && sum.finalLost]}>
      <Text style={[sum.finalTeam, { color: teamColor(side) }]} numberOfLines={1}>{teamName(side)}</Text>
      <Text style={[sum.finalScore, { color: teamColor(side) }]}>{s.scores[side].runs}/{s.scores[side].wickets}</Text>
      <Text style={sum.finalOvers}>({oversStr(s.scores[side].balls, s.ballsPerOver)})</Text>
      {winnerSide === side ? <Text style={sum.finalCrown}>🏆</Text> : null}
    </View>
  );

  return (
    <View style={{ gap: theme.spacing(3) }}>
      <View style={sum.liveResult}>
        <Text style={sum.finalTag}>Final</Text>
        <View style={sum.finalScoreCol}>
          <FinalSide side="home" />
          <FinalSide side="away" />
        </View>
        {winnerSide
          ? <Text style={sum.finalWinner}>{teamName(winnerSide)} {resultTail.charAt(0).toLowerCase() + resultTail.slice(1)}</Text>
          : <Text style={sum.drawn}>{resultTail}</Text>}
      </View>

      {mvp && <Award icon="🏅" label="Player of the Match" p={mvp} detail={mvpDetail(mvp)} />}
      <View style={sum.row}>
        <View style={sum.half}>{bestBat && <Award icon="🏏" label="Best bat" p={bestBat} detail={batLine(bestBat)} />}</View>
        <View style={sum.half}>{bestBowl && <Award icon="🎯" label="Best bowl" p={bestBowl} detail={bowlLine(bestBowl)} />}</View>
      </View>

      <Text style={[ctrl.label, { marginTop: theme.spacing(2) }]}>Player ratings · out of 5</Text>
      <Text style={ctrl.meta}>Rated on runs, wickets, dots, boundaries, catches & run-outs (top-order wickets count more).</Text>
      {ratingsBlock()}
    </View>
  );
};

/** One team's full, collapsible scorecard: a tappable header (name · score ·
 *  overs) that expands to the batting card (with dismissals), extras, total,
 *  who's yet to bat, and the opposition's bowling figures. */
function InningsCard({
  s, side, name, color, roster, batting, open, onToggle, onPlayer,
}: {
  s: CricketState; side: 'home' | 'away'; name: string; color: string;
  roster: Player[]; batting: boolean; open: boolean; onToggle: () => void;
  /** tap a batter/bowler name → their profile */
  onPlayer?: (playerId: string) => void;
}) {
  const inn = s.scores[side];
  const batters = Object.entries(s.batting).filter(([, c]) => c.side === side).map(([id, c]) => ({ id, ...c }));
  const bowlers = Object.entries(s.bowling).filter(([, b]) => b.side === other(side)).map(([id, b]) => ({ id, ...b }));
  const atCrease = batting && !s.ended; // this side is the one currently batting
  const battedIds = new Set(batters.map((b) => b.id));
  const toBat = roster.filter((p) => !battedIds.has(p.id));
  const sr = (runs: number, balls: number) => (balls ? ((runs / balls) * 100).toFixed(1) : '-');
  const captainId = s.captains[side]?.id;
  const keeperId = s.keepers[side]?.id;
  const role = (id: string) => (id === captainId ? ' (c)' : '') + (id === keeperId ? ' †' : '');
  const eco = (runs: number, balls: number) => (balls ? (runs / (balls / s.ballsPerOver)).toFixed(2) : '-');
  // Parity #19 — depth from the replayed ball log (a persisted snapshot has none:
  // those rows simply don't show).
  const logged = hasLog(s);
  const extrasParts = logged ? extrasText(extrasBreakdown(s, side)) : '';
  const fow = logged ? fallOfWickets(s, side) : [];
  const splits = logged ? bowlerSplits(s, side) : {};
  const parts = logged ? partnerships(s, side) : [];
  const overs = logged ? overHistory(s, side) : [];
  const [showParts, setShowParts] = useState(false);
  const [showOvers, setShowOvers] = useState(false);
  const [pickedOver, setPickedOver] = useState<number | null>(null);

  return (
    <View style={ctrl.card}>
      <TouchableOpacity accessibilityRole="button" activeOpacity={0.8} onPress={onToggle} style={ctrl.innHead}>
        <View style={[ctrl.teamDot, { backgroundColor: color }]} />
        <Text style={[ctrl.innName, batting && !s.ended && { color: theme.colors.primary }]} numberOfLines={1}>
          {name}{batting && !s.ended ? ' 🏏' : ''}
        </Text>
        <Text style={ctrl.innScore}>{inn.runs}/{inn.wickets}</Text>
        <Text style={ctrl.innOvers}>({oversStr(inn.balls, s.ballsPerOver)})</Text>
        <Text style={ctrl.caret}>{open ? '⌃' : '⌄'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={ctrl.innBody}>
          {batters.length === 0 ? (
            <Text style={ctrl.meta}>Yet to bat.</Text>
          ) : (
            <>
              <View style={ctrl.thead}>
                <Text style={[ctrl.cName, ctrl.th]}>Batter</Text>
                <Text style={[ctrl.cNum, ctrl.th]}>R</Text>
                <Text style={[ctrl.cNum, ctrl.th]}>B</Text>
                <Text style={[ctrl.cNum, ctrl.th]}>4s</Text>
                <Text style={[ctrl.cNum, ctrl.th]}>6s</Text>
                <Text style={[ctrl.cWide, ctrl.th]}>SR</Text>
              </View>
              {batters.map((b) => {
                const onStrike = atCrease && b.id === s.strikerId;
                const live = atCrease && (b.id === s.strikerId || b.id === s.nonStrikerId);
                return (
                <View key={b.id} style={[ctrl.trow, live && ctrl.trowLive]}>
                  <View style={ctrl.cName}>
                    <Text style={[ctrl.bName, live && ctrl.bNameLive]} numberOfLines={1} {...playerLink(roster.some((p) => p.id === b.id) ? b.id : undefined, b.name || 'Batter', onPlayer)}>{b.name || 'Batter'}{role(b.id)}{!b.out && !b.retired ? ' *' : ''}{onStrike ? ' 🏏' : ''}</Text>
                    <Text style={ctrl.bDismiss} numberOfLines={1}>{b.out ? (b.dismissal ?? 'out') : b.retired ? (b.dismissal ?? 'retired hurt') : 'not out'}</Text>
                  </View>
                  <Text style={[ctrl.cNum, live && ctrl.cNumLive]}>{b.runs}</Text>
                  <Text style={ctrl.cNum}>{b.balls}</Text>
                  <Text style={ctrl.cNum}>{b.fours}</Text>
                  <Text style={ctrl.cNum}>{b.sixes}</Text>
                  <Text style={ctrl.cWide}>{sr(b.runs, b.balls)}</Text>
                </View>
                );
              })}
            </>
          )}

          <View style={ctrl.totalRow}>
            <Text style={ctrl.meta}>Extras</Text>
            <Text style={ctrl.totalVal}>{inn.extras}{extrasParts ? <Text style={ctrl.extrasParts}> ({extrasParts})</Text> : null}</Text>
          </View>
          <View style={ctrl.totalRow}>
            <Text style={ctrl.totalLabel}>Total</Text>
            <Text style={ctrl.totalVal}>{inn.runs}/{inn.wickets} ({oversStr(inn.balls, s.ballsPerOver)} ov) · CRR {runRate(inn.runs, inn.balls, s.ballsPerOver)}</Text>
          </View>
          {fow.length > 0 && (
            <View style={ctrl.fow}>
              <Text style={ctrl.th}>Fall of wickets</Text>
              <Text style={ctrl.fowText}>{fowText(fow)}</Text>
            </View>
          )}
          {toBat.length > 0 && (
            <Text style={ctrl.toBat}>
              Yet to bat: {toBat.map((p, i) => (
                <Text key={p.id} {...playerLink(p.id, p.fullName, onPlayer)}>{i > 0 ? ', ' : ''}{p.fullName}</Text>
              ))}
            </Text>
          )}

          {bowlers.length > 0 && (
            <>
              <View style={[ctrl.thead, { marginTop: theme.spacing(2) }]}>
                <Text style={[ctrl.cName, ctrl.th]}>Bowler</Text>
                <Text style={[ctrl.cNumS, ctrl.th]}>O</Text>
                <Text style={[ctrl.cNumS, ctrl.th]}>M</Text>
                <Text style={[ctrl.cNumS, ctrl.th]}>R</Text>
                <Text style={[ctrl.cNumS, ctrl.th]}>W</Text>
                <Text style={[ctrl.cNumS, ctrl.th]}>0s</Text>
                <Text style={[ctrl.cEco, ctrl.th]}>Eco</Text>
              </View>
              {bowlers.map((b) => {
                const live = atCrease && b.id === s.bowlerId;
                const sp = splits[b.id];
                const wdnb = [sp?.wides ? `${sp.wides}wd` : '', sp?.noBalls ? `${sp.noBalls}nb` : ''].filter(Boolean).join(' ');
                return (
                <View key={b.id} style={[ctrl.trow, live && ctrl.trowLive]}>
                  <View style={ctrl.cName}>
                    <Text style={[ctrl.bName, live && ctrl.bNameLive]} numberOfLines={1} {...playerLink(b.id, b.name || 'Bowler', onPlayer)}>{b.name || 'Bowler'}{live ? ' 🎯' : ''}</Text>
                    {wdnb ? <Text style={ctrl.bDismiss}>{wdnb}</Text> : null}
                  </View>
                  <Text style={ctrl.cNumS}>{oversStr(b.balls, s.ballsPerOver)}</Text>
                  <Text style={ctrl.cNumS}>{logged ? sp?.maidens ?? 0 : '-'}</Text>
                  <Text style={ctrl.cNumS}>{b.runs}</Text>
                  <Text style={[ctrl.cNumS, live && ctrl.cNumLive]}>{b.wickets}</Text>
                  <Text style={ctrl.cNumS}>{b.dots}</Text>
                  <Text style={ctrl.cEco}>{eco(b.runs, b.balls)}</Text>
                </View>
                );
              })}
            </>
          )}

          {parts.length > 0 && (
            <>
              <TouchableOpacity accessibilityRole="button" activeOpacity={0.8} onPress={() => setShowParts((v) => !v)} style={[ctrl.innHead, ctrl.subHead]}>
                <Text style={[ctrl.label, { flex: 1 }]}>Partnerships</Text>
                <Text style={ctrl.caret}>{showParts ? '⌃' : '⌄'}</Text>
              </TouchableOpacity>
              {showParts && (() => {
                const top = Math.max(1, ...parts.map((p) => p.runs));
                return parts.map((p, i) => (
                  <View key={i} style={ctrl.partRow}>
                    <View style={ctrl.partLine}>
                      <Text style={ctrl.partNames} numberOfLines={2}>
                        {p.a.name} {p.a.runs} ({p.a.balls}) · {p.b.name} {p.b.runs} ({p.b.balls})
                      </Text>
                      <Text style={ctrl.partTotal}>{p.runs}{p.unbroken ? '*' : ''} ({p.balls})</Text>
                    </View>
                    <View style={ctrl.partTrack}>
                      <View style={[ctrl.partBar, { width: `${Math.round((p.runs / top) * 100)}%`, backgroundColor: color }]} />
                    </View>
                  </View>
                ));
              })()}
            </>
          )}

          {overs.length > 0 && (
            <>
              <TouchableOpacity accessibilityRole="button" activeOpacity={0.8} onPress={() => setShowOvers((v) => !v)} style={[ctrl.innHead, ctrl.subHead]}>
                <Text style={[ctrl.label, { flex: 1 }]}>Overs</Text>
                <Text style={ctrl.caret}>{showOvers ? '⌃' : '⌄'}</Text>
              </TouchableOpacity>
              {showOvers && (() => {
                const top = Math.max(1, ...overs.map((o) => o.runs));
                const every = overs.length > 25 ? 10 : overs.length > 10 ? 5 : 1;
                const picked = overs.find((o) => o.over === pickedOver);
                return (
                  <>
                    <View style={ctrl.manhattan}>
                      {overs.map((o) => (
                        <TouchableOpacity key={o.over} accessibilityRole="button" accessibilityLabel={`Over ${o.over}, ${o.runs} runs${o.wkts ? `, ${o.wkts} wicket${o.wkts === 1 ? '' : 's'}` : ''}`}
                          activeOpacity={0.7} style={ctrl.mCol} onPress={() => setPickedOver((cur) => (cur === o.over ? null : o.over))}>
                          <View style={ctrl.mPlot}>
                            {o.wkts > 0 && <View style={ctrl.mWkt} />}
                            <View style={[ctrl.mBar, { height: Math.max(2, Math.round((o.runs / top) * 64)), backgroundColor: color }, pickedOver === o.over && ctrl.mBarOn]} />
                          </View>
                          <Text style={ctrl.mNum} numberOfLines={1}>{o.over % every === 0 || o.over === 1 ? o.over : ''}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {picked ? (
                      <View style={{ gap: theme.spacing(1) }}>
                        <View style={ctrl.overRow}>{picked.syms.map((sym, i) => <BallChip key={i} sym={sym} />)}</View>
                        <Text style={ctrl.meta}>Over {picked.over} · {picked.bowlerName || 'Bowler'} · {picked.runs} run{picked.runs === 1 ? '' : 's'} · {picked.cum}/{picked.cumW}</Text>
                      </View>
                    ) : (
                      <Text style={ctrl.meta}>Tap a bar to see that over.</Text>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </View>
      )}
    </View>
  );
}

/** Over-strip chip colour from the engine's `symbolTone` (so the strip, the
 *  over editor and the engine agree on '4' vs '4r' / '5ot'). */
const TONE_COLOR = {
  wicket: theme.colors.danger, boundary: theme.colors.primary, extra: theme.colors.accent, plain: theme.colors.surfaceAlt,
} as const;
const overSymbolColor = (sym: string) => TONE_COLOR[symbolTone(sym)];
/** Chip text + caption: '5ot' → '5' with a small 'ot'; '4r' → '4' with 'r'; '0' → '·'. */
const chipParts = (sym: string): { main: string; cap?: string } => {
  const m = /^(\d+)(ot|r)$/.exec(sym);
  if (m) return { main: m[1], cap: m[2] };
  return { main: sym === '0' ? '·' : sym };
};

/** One over-strip chip (live "This over" strip and the Manhattan's over detail). */
function BallChip({ sym }: { sym: string }) {
  const bg = overSymbolColor(sym);
  const neutral = bg === theme.colors.surfaceAlt;
  const { main, cap } = chipParts(sym);
  return (
    <View style={[ctrl.ballDot, { backgroundColor: bg }, neutral && ctrl.ballDotNeutral]}
      accessibilityLabel={cap === 'ot' ? `${main} including overthrows` : cap === 'r' ? `${main} all run` : undefined}>
      <Text style={[ctrl.ballSym, neutral && ctrl.ballSymNeutral]}>
        {main}{cap ? <Text style={ctrl.ballCap}>{cap}</Text> : null}
      </Text>
    </View>
  );
}

const LiveExtras: NonNullable<SportPlugin<CricketState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], dispatch, canScore, onPlayer }) => {
  const s = state as CricketState;
  // Default the open innings to whoever is batting (or the chase, post-match).
  const [open, setOpen] = useState<'home' | 'away' | null>(s.battingSide);
  const toggle = (side: 'home' | 'away') => setOpen((o) => (o === side ? null : side));

  return (
    <View style={{ gap: theme.spacing(3) }}>
      <View style={ctrl.scTitleRow}>
        <Text style={ctrl.label}>Scorecard</Text>
        {!s.ended && (
          <View style={ctrl.overRow}>
            <Text style={ctrl.meta}>This over</Text>
            {s.thisOver.length === 0 ? (
              <Text style={ctrl.meta}>—</Text>
            ) : (
              <>
                {s.thisOver.map((sym, i) => <BallChip key={i} sym={sym} />)}
                <Text style={ctrl.overRuns}>{s.thisOver.reduce((a, x) => a + ballRuns(x, effectiveRules(s)), 0)} runs</Text>
              </>
            )}
          </View>
        )}
      </View>

      <InningsCard
        s={s} side="home" name={homeName} color={homeColor ?? theme.colors.home}
        roster={homeRoster} batting={s.battingSide === 'home'} open={open === 'home'} onToggle={() => toggle('home')} onPlayer={onPlayer}
      />
      <InningsCard
        s={s} side="away" name={awayName} color={awayColor ?? theme.colors.away}
        roster={awayRoster} batting={s.battingSide === 'away'} open={open === 'away'} onToggle={() => toggle('away')} onPlayer={onPlayer}
      />

      {s.potm ? <Text style={ctrl.potm} {...playerLink(idByName(s.potm, homeRoster, awayRoster), s.potm, onPlayer)}>🏅 Player of the Match: {s.potm}</Text> : null}

      {s.ended && canScore && dispatch && !s.potm && (homeRoster.length > 0 || awayRoster.length > 0) && (
        <View style={ctrl.card}>
          <Text style={ctrl.label}>🏅 Player of the Match</Text>
          <View style={ctrl.chips}>
            {[...homeRoster, ...awayRoster].map((p) => (
              <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => dispatch({ type: 'POTM', payload: { name: p.fullName } })} />
            ))}
          </View>
        </View>
      )}

      <Text style={ctrl.label}>Ball by ball</Text>
      <LiveTimeline events={s.events} homeColor={homeColor} awayColor={awayColor} emptyText="No balls bowled yet." />
    </View>
  );
};

/** Quick options (parity #13): 🧤 Change keeper — the fielding side's roster,
 *  † on the current keeper; a tap sends SET_KEEPER (logged once a ball is bowled). */
function CricketQuickOptions({ state, dispatch, homeRoster, awayRoster, homeName, awayName, onDone }: QuickOptionsProps) {
  const s = state as CricketState;
  const [open, setOpen] = useState(false);
  const fielding = other(s.battingSide);
  const roster = fielding === 'home' ? homeRoster : awayRoster;
  const cur = s.keepers[fielding];
  const unavailable = new Set(s.unavailable ?? []);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) }}>
        <Tile icon="🧤" label="Change keeper" hint={cur ? `Now: ${cur.name}` : 'No keeper set'} active={open} onPress={() => setOpen((o) => !o)} />
      </View>
      {open && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.muted}>{fielding === 'home' ? homeName : awayName} are fielding — who keeps wicket?</Text>
          <View style={ctrl.chips}>
            {roster.filter((p) => !unavailable.has(p.id)).map((p) => (
              <SelectChip key={p.id} label={`${p.fullName}${cur?.id === p.id ? ' †' : ''}`} active={cur?.id === p.id}
                onPress={() => {
                  if (cur?.id !== p.id) dispatch({ type: 'SET_KEEPER', payload: { side: fielding, id: p.id, name: p.fullName } });
                  onDone(`${p.fullName} is now keeping`);
                }} />
            ))}
            {roster.length === 0 && <Text style={textStyles.muted}>No players in this squad yet.</Text>}
          </View>
        </View>
      )}
    </View>
  );
}

export const cricketPlugin: SportPlugin<CricketState> = {
  QuickOptions: CricketQuickOptions,
  involvedPlayerIds,
  id: 'cricket',
  name: 'Cricket',
  icon: '🏏',
  archetype: 'running-points',
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  statTotals,
  snapshot: snapshotState,
  result: (s) => {
    if (!s.ended) return null;
    const score = { home: s.scores.home.runs, away: s.scores.away.runs };
    // The same decision as the final banner (super over → chase → par margin).
    return { winner: outcome(s).winner ?? 'draw', ...score };
  },
  standingsRate: (s) => (s.ended ? nrrOvers(s) : null),
  manualRate: (s) => manualNrrOvers(s),
  manualEnd: { drawLabel: 'Tie', nrrToggle: true },
  // Its own correction editor (parity #06): ball chips → Edit ball, bowler, batters.
  correctable: true,
  CorrectionEditor: OverEditor,
  summary: (s) => {
    // While a Super Over is live/decided, tag each side's board with its SO runs.
    const so = s.superOver;
    const soTag = (side: 'home' | 'away') => (so ? `  ·  SO ${so.state.scores[side].runs}` : '');
    const status = s.ended
      ? resultLine(s)
      : s.pendingTie
        ? so ? `🔥 Super Over ${so.round}` : '🔥 Scores level — Super Over?'
        : `Innings ${s.innings}`;
    const base =
      s.innings === 2 && s.target !== undefined && !s.ended && !s.pendingTie
        ? `Target ${s.target}${targetTag(s)}`
        : `${s.oversLimit} overs · RR ${runRate(s.scores[s.battingSide].runs, s.scores[s.battingSide].balls, s.ballsPerOver)}`;
    // Carry the toss through onto the card, the way a real scorecard notes it.
    const tossNote = s.toss ? ` · 🪙 ${(s.toss.winner === 'home' ? 'Home' : 'Away')} chose to ${s.toss.decision}` : '';
    return {
      homeScore: `${s.scores.home.runs}/${s.scores.home.wickets}${soTag('home')}`,
      awayScore: `${s.scores.away.runs}/${s.scores.away.wickets}${soTag('away')}`,
      statusLine: status,
      detailLine: `${base}${tossNote}`,
    };
  },
  ScoringControls,
  LiveClock,
  LiveExtras,
  Summary: CricketSummary,
  hideScoreboard: true,
  voice: { hints: ['four', 'six', 'dot', 'wicket', 'wide', 'two runs', 'five', 'all run four'], parse: cricketVoice },
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 't20',
      options: [
        { value: 't20', label: 'T20', set: { overs: 20, ballsPerOver: 6, playersPerSide: 11, powerplayOvers: 6, impactPlayer: false, tieBreak: 'super_over', ballType: 'leather', dls: true, bowlerMaxOvers: 0 } },
        { value: 'odi', label: 'ODI (50)', set: { overs: 50, ballsPerOver: 6, playersPerSide: 11, powerplayOvers: 10, impactPlayer: false, tieBreak: 'super_over', ballType: 'leather', dls: true, bowlerMaxOvers: 0 } },
        { value: 't10', label: 'T10', set: { overs: 10, ballsPerOver: 6, playersPerSide: 11, powerplayOvers: 3, impactPlayer: false, tieBreak: 'super_over', ballType: 'leather', dls: true, bowlerMaxOvers: 0 } },
        { value: 'hundred', label: 'The Hundred (100 balls)', set: { overs: 10, ballsPerOver: 10, playersPerSide: 11, powerplayOvers: 3, impactPlayer: false, tieBreak: 'super_over', ballType: 'leather', dls: true, bowlerMaxOvers: 0 } },
        { value: 'sixes', label: 'Sixes (6-a-side · 6 ov)', set: { overs: 6, ballsPerOver: 6, playersPerSide: 6, powerplayOvers: 0, impactPlayer: false, tieBreak: 'super_over', ballType: 'leather', dls: false, bowlerMaxOvers: 0 } },
        { value: 'box', label: 'Box cricket', set: { overs: 5, ballsPerOver: 6, playersPerSide: 6, powerplayOvers: 0, impactPlayer: false, tieBreak: 'super_over', ballType: 'tennis', dls: false, bowlerMaxOvers: 0 } },
        { value: 'test', label: 'Test / timeless', set: { overs: 999, ballsPerOver: 6, playersPerSide: 11, powerplayOvers: 0, impactPlayer: false, tieBreak: 'shared', ballType: 'leather', dls: false, bowlerMaxOvers: 0 } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 11, min: 1, max: 11, hint: 'wickets = players − 1 · set any number for box' },
    {
      key: 'ballType', label: 'Ball', type: 'choice', default: 'leather', onCreate: true,
      options: [
        { value: 'leather', label: 'Leather (match ball)' },
        { value: 'tennis', label: 'Tennis ball' },
      ],
    },
    {
      // Informational only (parity #09) — shown on the tournament page; the engine ignores it.
      key: 'pitchType', label: 'Pitch', type: 'choice', default: 'turf', onCreate: true,
      options: [
        { value: 'turf', label: 'Turf' },
        { value: 'matting', label: 'Matting' },
        { value: 'cement', label: 'Cement' },
        { value: 'astroturf', label: 'Astroturf' },
        { value: 'rough', label: 'Rough' },
      ],
    },
    {
      key: 'tieBreak', label: 'If the match ties', type: 'choice', default: 'super_over',
      options: [
        { value: 'super_over', label: 'Super Over' },
        { value: 'shared', label: 'Tie stands / shared' },
      ],
    },
    { key: 'overs', label: 'Overs per innings', type: 'number', default: 20, min: 1, max: 999 },
    {
      key: 'ballsPerOver', label: 'Balls per over', type: 'choice', default: 6, advanced: true,
      options: [
        { value: 6, label: '6 (standard)' },
        { value: 10, label: '10 (The Hundred)' },
      ],
    },
    { key: 'bowlerMaxOvers', label: 'Max overs per bowler', type: 'number', default: 0, min: 0, max: 999, advanced: true, hint: '0 = auto (overs ÷ 5, rounded up; none for Test)' },
    { key: 'powerplayOvers', label: 'Powerplay overs', type: 'number', default: 0, min: 0, max: 10, advanced: true, hint: '0 = none' },
    { key: 'dls', label: 'DLS (rain-revised targets)', type: 'toggle', default: false, advanced: true, hint: 'reduce overs on a rain break; the chase target auto-revises' },
    { key: 'substitutes', label: 'Substitutes per side', type: 'count', default: 0, min: 0, max: 5, advanced: true, hint: '12th man, etc.' },
    { key: 'impactPlayer', label: 'Impact Player (IPL-style)', type: 'toggle', default: false, hint: 'one named sub can come in to bat or bowl mid-match' },
    // Local rules (parity #14) — also editable mid-match via liveSettings.
    ...LOCAL_RULE_FIELDS,
  ],
  liveSettings: CRICKET_LIVE_SETTINGS,
};

const ctrl = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  creaseHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  swapBtn: { paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(3) },
  creaseHi: { color: theme.colors.text, fontWeight: '800' },
  hint: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  roleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing(2) },
  roleBtn: { paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(3) },
  setupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  readyTag: { backgroundColor: theme.colors.primary + '22', borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(2), paddingVertical: 2 },
  readyTagText: { color: theme.colors.primary, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  needTag: { backgroundColor: theme.colors.accent + '22', borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(2), paddingVertical: 2 },
  needTagText: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800' },
  freeHit: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '900', letterSpacing: 0.5 },
  rulesChip: { backgroundColor: theme.colors.accent + '1A', borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.accent, paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(3), alignSelf: 'flex-start' },
  rulesChipText: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  freeHitBox: { backgroundColor: theme.colors.primary + '1A', borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.primary, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), alignSelf: 'flex-start' },
  freeHitText: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '900', letterSpacing: 0.3 },
  wktRecap: { backgroundColor: theme.colors.danger + '1A', borderRadius: theme.radius.sm, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), alignSelf: 'flex-start' },
  wktRecapText: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
  impactRecap: { backgroundColor: theme.colors.accent + '1A', borderRadius: theme.radius.sm, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), alignSelf: 'flex-start' },
  impactRecapText: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  tieBoard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2) },
  tieSide: { flex: 1, alignItems: 'center', gap: 2 },
  tieScore: { fontSize: theme.font.h2, fontWeight: '900' },
  tieName: { fontSize: theme.font.small, fontWeight: '800' },
  tieTag: { backgroundColor: theme.colors.accent + '22', borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing(2), paddingVertical: 2 },
  tieTagText: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '900', letterSpacing: 1 },
  soBanner: { backgroundColor: theme.colors.primary + '1A', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.primary, padding: theme.spacing(3), gap: theme.spacing(1) },
  soTitle: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '900', letterSpacing: 0.5 },
  soLine: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  soMeta: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  powerplay: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '900', letterSpacing: 0.3 },
  ppTag: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '900' },
  rainBox: {
    gap: theme.spacing(2),
    backgroundColor: theme.colors.accent + '14',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    padding: theme.spacing(3),
  },
  rainErr: { color: theme.colors.danger, fontSize: theme.font.tiny, fontWeight: '700' },
  ovWarn: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800' },
  ovStep: { minWidth: 44, paddingHorizontal: theme.spacing(2) },
  ovOpenBtn: { alignSelf: 'flex-start' },
  rainPreview: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  overDone: { backgroundColor: theme.colors.accent + '1A', borderRadius: theme.radius.sm, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), alignSelf: 'flex-start' },
  overDoneText: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  confirmBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  confirmText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  wktPanel: {
    gap: theme.spacing(3),
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing(4),
  },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  clockTime: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', letterSpacing: 0.5 },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  potm: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  overRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), flexWrap: 'wrap' },
  ballDot: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  ballDotNeutral: { borderWidth: 1, borderColor: theme.colors.border },
  ballSym: { color: '#06120D', fontSize: theme.font.tiny, fontWeight: '800' },
  ballSymNeutral: { color: theme.colors.text },
  ballCap: { fontSize: 8, fontWeight: '700' },
  // parity #15 — the '5·7·+' key and its panel
  // 7 keys in one row on a phone: no side padding, equal widths
  padKey: { paddingHorizontal: 0, minWidth: 0 },
  moreKey: { minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing(3), paddingHorizontal: 2, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  moreKeyOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface },
  moreKeyText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  morePanel: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  moreLabel: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', minWidth: 76 },
  morePreview: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  overRuns: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', marginLeft: theme.spacing(1) },
  scTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: theme.spacing(2) },
  // collapsible innings card
  innHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  teamDot: { width: 12, height: 12, borderRadius: 6 },
  innName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700', flex: 1 },
  innScore: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900' },
  innOvers: { color: theme.colors.textMuted, fontSize: theme.font.small },
  caret: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '800', width: 18, textAlign: 'center' },
  innBody: { gap: theme.spacing(1), marginTop: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing(3) },
  thead: { flexDirection: 'row', alignItems: 'center', paddingBottom: theme.spacing(1) },
  th: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase' },
  trow: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(1) },
  trowLive: { backgroundColor: theme.colors.primary + '14', borderRadius: theme.radius.sm, marginHorizontal: -theme.spacing(1), paddingHorizontal: theme.spacing(1) },
  cName: { flex: 1 },
  cNum: { width: 34, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small },
  cNumLive: { color: theme.colors.primary, fontWeight: '900' },
  cWide: { width: 52, textAlign: 'right', color: theme.colors.textMuted, fontSize: theme.font.small },
  bName: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  bNameLive: { color: theme.colors.primary, fontWeight: '800' },
  bDismiss: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing(1) },
  totalLabel: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  totalVal: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  toBat: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontStyle: 'italic', marginTop: theme.spacing(1) },
  // parity #19 — scorecard depth
  cNumS: { width: 28, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small },
  cEco: { width: 44, textAlign: 'right', color: theme.colors.textMuted, fontSize: theme.font.small },
  extrasParts: { color: theme.colors.textMuted, fontWeight: '400' },
  fow: { gap: 2, marginTop: theme.spacing(1) },
  fowText: { color: theme.colors.textMuted, fontSize: theme.font.tiny, lineHeight: 16 },
  subHead: { marginTop: theme.spacing(3), paddingTop: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  partRow: { gap: 4, paddingVertical: theme.spacing(1) },
  partLine: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(2) },
  partNames: { flex: 1, color: theme.colors.text, fontSize: theme.font.tiny },
  partTotal: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  partTrack: { height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden' },
  partBar: { height: 4, borderRadius: 2 },
  manhattan: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  mCol: { flex: 1, maxWidth: 22, alignItems: 'center' },
  mPlot: { height: 76, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  mBar: { width: '100%', borderTopLeftRadius: 2, borderTopRightRadius: 2, opacity: 0.85 },
  mBarOn: { opacity: 1, borderWidth: 1, borderColor: theme.colors.text },
  mWkt: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.danger, marginBottom: 2 },
  mNum: { color: theme.colors.textMuted, fontSize: 9, marginTop: 2 },
});

const sum = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  half: { flex: 1 },
  liveResult: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
    padding: theme.spacing(4), alignItems: 'center', gap: theme.spacing(2),
  },
  liveHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing(2) },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.danger },
  liveTagText: { color: theme.colors.danger, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  liveInnings: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  liveScoreRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', flexWrap: 'wrap', gap: theme.spacing(2) },
  liveTeam: { fontSize: theme.font.body, fontWeight: '800' },
  liveScore: { fontSize: theme.font.h2, fontWeight: '900' },
  liveOvers: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  liveRR: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  chaseStrip: { alignItems: 'center', alignSelf: 'center', marginTop: theme.spacing(1), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(4), backgroundColor: theme.colors.primary + '14', borderRadius: theme.radius.sm },
  chaseNeed: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '900' },
  chaseMeta: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', marginTop: 1 },
  liveLine: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', textAlign: 'center' },
  finalTag: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  finalScoreCol: { alignSelf: 'stretch', gap: theme.spacing(1) },
  finalSide: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', flexWrap: 'wrap', gap: theme.spacing(2) },
  finalLost: { opacity: 0.45 },
  finalTeam: { fontSize: theme.font.body, fontWeight: '800' },
  finalScore: { fontSize: theme.font.h2, fontWeight: '900' },
  finalOvers: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  finalCrown: { fontSize: theme.font.body },
  finalWinner: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '900', textAlign: 'center', marginTop: theme.spacing(1) },
  drawn: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '900', textAlign: 'center', marginTop: theme.spacing(1) },
  award: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3),
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3),
  },
  awardAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  awardAvatarText: { color: '#06120D', fontSize: theme.font.body, fontWeight: '900' },
  awardBadge: { position: 'absolute', bottom: -5, right: -5, fontSize: 15 },
  awardLabel: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  awardName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  awardDetail: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  awardPts: { fontSize: theme.font.h3, fontWeight: '900' },
  prow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2) },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  rateAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rateAvatarText: { color: '#06120D', fontSize: theme.font.small, fontWeight: '900' },
  rateDetail: { color: theme.colors.textMuted, fontSize: theme.font.tiny, marginTop: 1 },
  ratingCol: { alignItems: 'flex-end', minWidth: 64 },
  stars: { color: theme.colors.accent, fontSize: theme.font.tiny },
  total: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '900', textAlign: 'right' },
});

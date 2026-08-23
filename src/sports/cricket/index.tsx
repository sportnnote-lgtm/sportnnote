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
import { Button, SelectChip, TextField, textStyles } from '../../components/ui';
import { RankBadge, podiumColor } from '../../components/Rank';
import { LiveTimeline } from '../LiveTimeline';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';
import { cricketVoice } from '../voiceParsers';
import {
  init, reducer, other, resultLine, superOverWinner, WICKET_LABEL, NO_BOWLER, composeDismissal,
  oversStr, runRate, inPowerplay,
} from './engine';
import type { CricketState, DismissalKind, Innings } from './engine';
import { resourcePct, revisedTarget } from './dls';

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
  return (
    <View style={ctrl.wktPanel}>
      <Text style={ctrl.label}>🧢 Match setup</Text>
      <Text style={ctrl.meta}>Tap a player to make them captain (c) or wicket-keeper (†). Both are needed per side to begin.</Text>
      {roster0(homeRoster) ? side('home', homeName, homeRoster) : <Text style={ctrl.meta}>No {homeName} squad set.</Text>}
      {roster0(awayRoster) ? side('away', awayName, awayRoster) : <Text style={ctrl.meta}>No {awayName} squad set.</Text>}
    </View>
  );
}
const roster0 = (r: Player[]) => r.length > 0;

const DISMISSALS: DismissalKind[] = ['bowled', 'caught', 'lbw', 'stumped', 'runout', 'hitwicket', 'retired', 'timedout'];
const needsFielder = (k: DismissalKind) => k === 'caught' || k === 'runout';
const needsBatter = (k: DismissalKind) => k === 'runout' || k === 'retired' || k === 'timedout';

const ScoringControls: SportPlugin<CricketState>['ScoringControls'] = ({
  state: rootState, dispatch, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], homeKeeperId, awayKeeperId,
}) => {
  const [wf, setWf] = useState<{ kind?: DismissalKind; fielder?: Player; batterOut?: 'striker' | 'nonstriker'; runs?: number; offExtra?: 'wide' | 'noball' } | null>(null);
  const [extraMode, setExtraMode] = useState<'b' | 'lb' | 'nb' | 'wd' | null>(null);
  const [impact, setImpact] = useState<{ side: 'home' | 'away'; out?: Player } | null>(null);
  const [rain, setRain] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);

  // While a Super Over is live, ALL the live-scoring UI below operates on the
  // nested mini-match; dispatched actions are routed there by the reducer. The
  // parent (tied) match stays frozen underneath.
  const soActive = !!rootState.superOver && !rootState.superOver.state.ended;
  const state = soActive ? rootState.superOver!.state : rootState;

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
      type: 'IMPACT_SUB',
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

  const runs = (r: number) =>
    ball({ type: 'RUNS', payload: { runs: r }, attribution: strikerId ? { playerId: strikerId, stat: 'runs', by: r, playerName: strikerName } : undefined });

  // ----- wicket flow ----- (retired hurt isn't a wicket, so it never "all out")
  const allOut = wf?.kind !== 'retired' && cur.wickets + 1 >= state.wicketsLimit;
  const newBatOptions = battingRoster.filter((p) => !isOut(p.id) && !atCrease(p.id) && !isUnavailable(p.id));
  const keeper = state.keepers[other(state.battingSide)];
  // Credit the fielder: a catch, a stumping (the keeper), or a run-out.
  const fielderCredit = () => {
    if (!wf) return undefined;
    if (wf.kind === 'caught' && wf.fielder) return { playerId: wf.fielder.id, stat: 'catches', playerName: wf.fielder.fullName };
    if (wf.kind === 'stumped' && keeper?.id) return { playerId: keeper.id, stat: 'stumpings', playerName: keeper.name };
    if (wf.kind === 'runout' && wf.fielder) return { playerId: wf.fielder.id, stat: 'runouts', playerName: wf.fielder.fullName };
    return undefined;
  };
  const finishWicket = (newBat?: Player) => {
    if (!wf?.kind) return;
    const common = {
      strikerId, strikerName, bowlerId, bowlerName,
      fielderId: wf.fielder?.id, fielderName: wf.fielder?.fullName,
      batterOut: wf.batterOut ?? 'striker', runs: wf.runs ?? 0,
      newBatId: newBat?.id, newBatName: newBat?.fullName,
    };
    if (wf.offExtra) {
      // A run-out that happened ON a wide/no-ball — routed through EXTRA so the
      // over doesn't advance and the +1 penalty is applied.
      dispatch({
        type: 'EXTRA', side: state.battingSide,
        payload: { ...common, kind: wf.offExtra === 'wide' ? 'Wide' : 'No ball', runout: true },
        attribution: wf.fielder ? { playerId: wf.fielder.id, stat: 'runouts', playerName: wf.fielder.fullName } : undefined,
      });
      setWf(null);
      return;
    }
    dispatch({
      type: 'WICKET',
      side: state.battingSide,
      payload: { ...common, kind: wf.kind },
      // bowler's wicket (not on a run-out) + the fielder's catch/stumping as a 2nd credit
      attribution: wf.kind === 'runout'
        ? fielderCredit()
        : bowlerId ? { playerId: bowlerId, stat: 'wickets', by: 1, playerName: bowlerName } : undefined,
      attribution2: wf.kind === 'runout' ? undefined : fielderCredit(),
    });
    setWf(null);
  };

  if (wf) {
    const k = wf.kind;
    // On a free hit the batter can only be run out.
    const options = state.freeHit ? (['runout'] as DismissalKind[]) : DISMISSALS;
    const runsStep = k === 'runout' && wf.runs === undefined;
    const fielderStep = !!k && needsFielder(k) && !wf.fielder && !runsStep;
    const batterStep = !!k && needsBatter(k) && !wf.batterOut && !runsStep && (!needsFielder(k) || !!wf.fielder);
    const newBatStep = !!k && !runsStep && (!needsFielder(k) || !!wf.fielder) && (!needsBatter(k) || !!wf.batterOut);
    // Live scorecard-style recap of the dismissal as the scorer builds it, so the
    // wicket reads back ("c Fielder b Bowler") before the final confirming tap.
    const keeperNm = state.keepers[other(state.battingSide)]?.name;
    const haveFielder = !needsFielder(k as DismissalKind) || !!wf.fielder;
    const batterKnown = !needsBatter(k as DismissalKind) || !!wf.batterOut;
    const outName = (wf.batterOut === 'nonstriker' ? nonStrikerName : strikerName) ?? 'Batter';
    const descriptor = !k ? '' : haveFielder ? composeDismissal(k, bowlerName, wf.fielder?.fullName, keeperNm) : WICKET_LABEL[k].toLowerCase();
    const runsTail = k === 'runout' && wf.runs != null ? ` · ${wf.runs} run${wf.runs === 1 ? '' : 's'}` : '';
    const wktRecap = k ? `${batterKnown ? `${outName} ` : ''}${descriptor}${runsTail}` : '';
    return (
      <View style={ctrl.wktPanel}>
        <View style={ctrl.creaseHead}>
          <Text style={ctrl.label}>🎯 Wicket{bowlerName ? ` — ${bowlerName}` : ''}</Text>
          <Button label="Cancel" variant="ghost" style={ctrl.swapBtn} onPress={() => setWf(null)} />
        </View>
        {state.freeHit && <Text style={ctrl.freeHit}>🟢 FREE HIT — only a run out counts</Text>}
        {wktRecap ? <View style={ctrl.wktRecap}><Text style={ctrl.wktRecapText}>{wktRecap}</Text></View> : null}

        {!k && (
          <>
            <Text style={ctrl.meta}>How was {strikerName ?? 'the batter'} out?</Text>
            <View style={ctrl.chips}>
              {options.map((d) => (
                <SelectChip key={d} label={WICKET_LABEL[d]} active={false} onPress={() => setWf({ kind: d })} />
              ))}
            </View>
          </>
        )}

        {runsStep && (
          <>
            <Text style={ctrl.meta}>Runs completed before the run out?</Text>
            <View style={ctrl.chips}>
              {[0, 1, 2, 3].map((n) => (
                <SelectChip key={n} label={String(n)} active={false} onPress={() => setWf({ ...wf, runs: n })} />
              ))}
            </View>
          </>
        )}

        {fielderStep && (
          <>
            <Text style={ctrl.meta}>{k === 'caught' ? 'Caught by?' : 'Run out by? (fielder)'}</Text>
            <View style={ctrl.chips}>
              {bowlingRoster.map((p) => (
                <SelectChip key={p.id} label={p.fullName} active={false} onPress={() => setWf({ ...wf, fielder: p })} />
              ))}
            </View>
          </>
        )}

        {batterStep && (
          <>
            <Text style={ctrl.meta}>{k === 'retired' ? 'Which batsman is retiring hurt?' : k === 'timedout' ? 'Which batsman timed out?' : 'Which batsman is out?'}</Text>
            <View style={ctrl.chips}>
              <SelectChip label={strikerName ?? 'Striker'} active={false} onPress={() => setWf({ ...wf, batterOut: 'striker' })} />
              <SelectChip label={`${nonStrikerName ?? 'Non-striker'} (NS)`} active={false} onPress={() => setWf({ ...wf, batterOut: 'nonstriker' })} />
            </View>
          </>
        )}

        {newBatStep && (
          allOut ? (
            <Button label="Confirm wicket — all out" variant="danger" onPress={() => finishWicket(undefined)} />
          ) : (
            <>
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
          <Text style={ctrl.label}>⚡ Impact Player — {sideName}</Text>
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
            <Text style={ctrl.meta}>Choose the Impact Player coming in</Text>
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

  // Rain (DLS) input: validate against the reducer's own bounds (must be more than
  // overs already bowled, fewer than the current limit) and preview the effect —
  // the revised chase target — using the same dls helpers the reducer applies.
  const rainN = parseInt(rain, 10);
  const rainOversDone = Math.floor(cur.balls / state.ballsPerOver);
  const rainValid = rain !== '' && !isNaN(rainN) && rainN > rainOversDone && rainN < state.oversLimit;
  const rainPreview = (() => {
    if (!rainValid) return null;
    const lost = Math.max(0, resourcePct(state.oversLimit - rainOversDone, cur.wickets) - resourcePct(rainN - rainOversDone, cur.wickets));
    if (state.innings === 2) {
      const t1 = state.scores[other(state.battingSide)].runs;
      const nt = revisedTarget(t1, 100 - state.r1Lost, 100 - (state.r2Lost + lost));
      return `New target ${nt} — need ${Math.max(0, nt - cur.runs)} off the last ${rainN - rainOversDone} overs`;
    }
    return `Innings capped at ${rainN} overs`;
  })();

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
          <Text style={ctrl.freeHitText}>🟢 FREE HIT — {strikerName ?? 'the batter'} can’t be out (run out only)</Text>
        </View>
      )}

      {/* Rain (DLS): cut the overs; in the chase the target auto-revises. */}
      {state.dls && !state.ended && !soActive && (
        <View style={ctrl.rainBox}>
          <Text style={ctrl.label}>☔ Rain — reduce overs</Text>
          <Text style={ctrl.meta}>
            Now {state.oversLimit} overs · {oversStr(cur.balls, state.ballsPerOver)} bowled
            {state.innings === 2 ? ` · target ${state.target}` : ''}
          </Text>
          <View style={ctrl.row}>
            <View style={ctrl.flex}>
              <TextField label="" value={rain} onChange={(t) => setRain(t.replace(/[^0-9]/g, ''))} placeholder={`New total overs (${rainOversDone + 1}–${state.oversLimit - 1})`} autoCapitalize="none" />
            </View>
            <Button label="Apply" variant="ghost" disabled={!rainValid} onPress={() => { dispatch({ type: 'RAIN', payload: { overs: rainN } }); setRain(''); }} />
          </View>
          {rain !== '' && !rainValid ? (
            <Text style={ctrl.rainErr}>Enter a whole number between {rainOversDone + 1} and {state.oversLimit - 1}.</Text>
          ) : rainPreview ? (
            <Text style={ctrl.rainPreview}>→ {rainPreview}</Text>
          ) : null}
        </View>
      )}

      {/* Runs — credited to the on-strike batsman; strike rotates automatically. */}
      <View style={ctrl.row}>
        {[0, 1, 2, 3, 4, 6].map((r) => (
          <Button key={r} label={String(r)} color={r === 4 || r === 6 ? theme.colors.primary : battingColor} style={ctrl.flex} disabled={!canScore} onPress={() => runs(r)} />
        ))}
      </View>

      {/* Byes / leg byes — team extras, not charged to bat or bowler. */}
      <View style={{ gap: theme.spacing(2) }}>
        <View style={ctrl.row}>
          <Button label="Bye" variant="ghost" style={ctrl.flex} disabled={!canScore} onPress={() => setExtraMode((m) => (m === 'b' ? null : 'b'))} />
          <Button label="Leg bye" variant="ghost" style={ctrl.flex} disabled={!canScore} onPress={() => setExtraMode((m) => (m === 'lb' ? null : 'lb'))} />
        </View>
        {(extraMode === 'b' || extraMode === 'lb') && (
          <View style={ctrl.row}>
            {[1, 2, 3, 4].map((n) => (
              <Button key={n} label={`${extraMode === 'lb' ? 'LB' : 'B'} ${n}`} color={battingColor} style={ctrl.flex}
                onPress={() => { ball({ type: extraMode === 'lb' ? 'LEGBYES' : 'BYES', payload: { runs: n } }); setExtraMode(null); }} />
            ))}
          </View>
        )}
        {extraMode === 'nb' && (
          <>
            <Text style={ctrl.meta}>No ball — runs off the bat?</Text>
            <View style={ctrl.row}>
              {[0, 1, 2, 3, 4, 6].map((n) => (
                <Button key={n} label={n === 0 ? 'Nb' : `Nb+${n}`} color={n === 4 || n === 6 ? theme.colors.primary : battingColor} style={ctrl.flex}
                  onPress={() => { ball({ type: 'EXTRA', payload: { kind: 'No ball', runs: n } }); setExtraMode(null); }} />
              ))}
            </View>
            <Text style={ctrl.meta}>…or byes run off the no-ball (missed the bat)?</Text>
            <View style={ctrl.row}>
              {[1, 2, 3, 4].map((n) => (
                <Button key={n} label={`Nb+${n}b`} variant="ghost" style={ctrl.flex}
                  onPress={() => { ball({ type: 'EXTRA', payload: { kind: 'No ball', byes: n } }); setExtraMode(null); }} />
              ))}
            </View>
            <Button label="🎯 …or a RUN OUT off the no-ball" variant="danger" disabled={!canScore}
              onPress={() => { setExtraMode(null); setWf({ kind: 'runout', offExtra: 'noball' }); }} />
          </>
        )}
        {extraMode === 'wd' && (
          <>
            <Text style={ctrl.meta}>Wide — any runs run (byes on the wide, or 4 if it beat the keeper)?</Text>
            <View style={ctrl.row}>
              {[0, 1, 2, 4].map((n) => (
                <Button key={n} label={n === 0 ? 'Wd' : `Wd+${n}`} color={n === 4 ? theme.colors.primary : battingColor} style={ctrl.flex}
                  onPress={() => { ball({ type: 'EXTRA', payload: { kind: 'Wide', runs: n } }); setExtraMode(null); }} />
              ))}
            </View>
            <Button label="🎯 …or a RUN OUT off the wide" variant="danger" disabled={!canScore}
              onPress={() => { setExtraMode(null); setWf({ kind: 'runout', offExtra: 'wide' }); }} />
          </>
        )}
      </View>

      {/* Bowler — must be (re)named at the start of each over. */}
      <View style={{ gap: theme.spacing(2) }}>
        {overJustDone ? <View style={ctrl.overDone}><Text style={ctrl.overDoneText}>✓ Over {oversDone} complete — new bowler needed</Text></View> : null}
        <Text style={ctrl.label}>
          🎯 {bowlerId ? `Bowling: ${bowlerName}` : `Over ${nextOverNo}${oversLabel} — pick ${bowlingName} bowler`}{wk ? `  ·  † ${wk}` : ''}
        </Text>
        <View style={ctrl.chips}>
          {bowlingRoster.map((p) => (
            <SelectChip
              key={p.id}
              label={p.id === state.lastOverBowlerId ? `${p.fullName} · last over` : isUnavailable(p.id) ? `${p.fullName} ⚡` : p.fullName}
              active={bowlerId === p.id}
              disabled={p.id === state.lastOverBowlerId || isUnavailable(p.id)}
              onPress={() => dispatch({ type: 'SET_BOWLER', payload: { id: p.id, name: p.fullName } })}
            />
          ))}
        </View>
        {!bowlerId && <Text style={ctrl.hint}>Pick the bowler for this over (last over's bowler can't bowl again).</Text>}
      </View>

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
              <Button key={sd} label={`⚡ Bring in Impact Player — ${nm}`} variant="ghost" onPress={() => setImpact({ side: sd })} />
            );
          })}
        </View>
      )}

      <View style={ctrl.row}>
        <Button label={state.freeHit ? 'RUN OUT' : 'WICKET'} variant="danger" style={ctrl.flex} disabled={!canScore} onPress={() => setWf(state.freeHit ? { kind: 'runout' } : {})} />
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
      <Text style={ctrl.clockTime}>{s.ended ? 'Result' : `${oversStr(inn.balls, s.ballsPerOver)} / ${s.oversLimit} ov`}</Text>
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
 *  • Fielding: catch +8, run out +8, stumping +10.
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
        else if (d.kind === 'runout') field += 8;
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

const CricketSummary: NonNullable<SportPlugin<CricketState>['Summary']> = ({ state, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away, onPlayer }) => {
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
                  <Text style={sum.chaseMeta}>Target {s.target} · RRR {rrr}</Text>
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
  const winnerSide: 'home' | 'away' | null = (() => {
    if (s.superOver) return superOverWinner(s.superOver.state);
    const chase = s.scores[s.battingSide];
    if (chase.runs >= (s.target ?? Infinity)) return s.battingSide;
    const margin = s.scores[other(s.battingSide)].runs - chase.runs;
    return margin === 0 ? null : other(s.battingSide);
  })();
  const resultTail = resultLine(s);
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
  s, side, name, color, roster, batting, open, onToggle,
}: {
  s: CricketState; side: 'home' | 'away'; name: string; color: string;
  roster: Player[]; batting: boolean; open: boolean; onToggle: () => void;
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
                    <Text style={[ctrl.bName, live && ctrl.bNameLive]} numberOfLines={1}>{b.name || 'Batter'}{role(b.id)}{!b.out && !b.retired ? ' *' : ''}{onStrike ? ' 🏏' : ''}</Text>
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
            <Text style={ctrl.totalVal}>{inn.extras}</Text>
          </View>
          <View style={ctrl.totalRow}>
            <Text style={ctrl.totalLabel}>Total</Text>
            <Text style={ctrl.totalVal}>{inn.runs}/{inn.wickets} ({oversStr(inn.balls, s.ballsPerOver)} ov) · CRR {runRate(inn.runs, inn.balls, s.ballsPerOver)}</Text>
          </View>
          {toBat.length > 0 && <Text style={ctrl.toBat}>Yet to bat: {toBat.map((p) => p.fullName).join(', ')}</Text>}

          {bowlers.length > 0 && (
            <>
              <View style={[ctrl.thead, { marginTop: theme.spacing(2) }]}>
                <Text style={[ctrl.cName, ctrl.th]}>Bowler</Text>
                <Text style={[ctrl.cNum, ctrl.th]}>O</Text>
                <Text style={[ctrl.cNum, ctrl.th]}>R</Text>
                <Text style={[ctrl.cNum, ctrl.th]}>W</Text>
                <Text style={[ctrl.cWide, ctrl.th]}>Eco</Text>
              </View>
              {bowlers.map((b) => {
                const live = atCrease && b.id === s.bowlerId;
                return (
                <View key={b.id} style={[ctrl.trow, live && ctrl.trowLive]}>
                  <Text style={[ctrl.cName, ctrl.bName, live && ctrl.bNameLive]} numberOfLines={1}>{b.name || 'Bowler'}{live ? ' 🎯' : ''}</Text>
                  <Text style={ctrl.cNum}>{oversStr(b.balls, s.ballsPerOver)}</Text>
                  <Text style={ctrl.cNum}>{b.runs}</Text>
                  <Text style={[ctrl.cNum, live && ctrl.cNumLive]}>{b.wickets}</Text>
                  <Text style={ctrl.cWide}>{eco(b.runs, b.balls)}</Text>
                </View>
                );
              })}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const overSymbolColor = (sym: string) =>
  sym === 'W' || sym.endsWith('W') ? theme.colors.danger
    : sym === '4' || sym === '6' ? theme.colors.primary
    : sym.endsWith('wd') || sym.endsWith('nb') || sym.startsWith('b') || sym.startsWith('lb') ? theme.colors.accent
    : theme.colors.surfaceAlt;

/** Runs conceded on a single ball, decoded from its over-strip symbol
 *  (e.g. '4'→4, '2+W'→2, 'wd'→1, '2nb'→3, 'lb2'→2, 'W'/'0'→0). */
const ballRuns = (sym: string): number => {
  if (sym.endsWith('nb')) return 1 + (parseInt(sym, 10) || 0);
  if (sym === 'wd') return 1;
  if (sym.startsWith('lb')) return parseInt(sym.slice(2), 10) || 1;
  if (sym.startsWith('b')) return parseInt(sym.slice(1), 10) || 1;
  if (sym.endsWith('W')) return parseInt(sym, 10) || 0;
  return parseInt(sym, 10) || 0;
};

const LiveExtras: NonNullable<SportPlugin<CricketState>['LiveExtras']> = ({ state, homeName, awayName, homeColor, awayColor, homeRoster = [], awayRoster = [], dispatch, canScore }) => {
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
                {s.thisOver.map((sym, i) => {
                  const bg = overSymbolColor(sym);
                  const neutral = bg === theme.colors.surfaceAlt;
                  return (
                    <View key={i} style={[ctrl.ballDot, { backgroundColor: bg }, neutral && ctrl.ballDotNeutral]}>
                      <Text style={[ctrl.ballSym, neutral && ctrl.ballSymNeutral]}>{sym === '0' ? '·' : sym}</Text>
                    </View>
                  );
                })}
                <Text style={ctrl.overRuns}>{s.thisOver.reduce((a, x) => a + ballRuns(x), 0)} runs</Text>
              </>
            )}
          </View>
        )}
      </View>

      <InningsCard
        s={s} side="home" name={homeName} color={homeColor ?? theme.colors.home}
        roster={homeRoster} batting={s.battingSide === 'home'} open={open === 'home'} onToggle={() => toggle('home')}
      />
      <InningsCard
        s={s} side="away" name={awayName} color={awayColor ?? theme.colors.away}
        roster={awayRoster} batting={s.battingSide === 'away'} open={open === 'away'} onToggle={() => toggle('away')}
      />

      {s.potm ? <Text style={ctrl.potm}>🏅 Player of the Match: {s.potm}</Text> : null}

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

export const cricketPlugin: SportPlugin<CricketState> = {
  id: 'cricket',
  name: 'Cricket',
  icon: '🏏',
  archetype: 'running-points',
  createInitialState: init,
  reducer,
  isComplete: (s) => s.ended,
  result: (s) => {
    if (!s.ended) return null;
    const score = { home: s.scores.home.runs, away: s.scores.away.runs };
    // Mirror the final banner's winner logic (super over → chase → runs margin).
    let winner: 'home' | 'away' | 'draw';
    if (s.superOver) winner = superOverWinner(s.superOver.state) ?? 'draw';
    else {
      const chase = s.scores[s.battingSide];
      if (chase.runs >= (s.target ?? Infinity)) winner = s.battingSide;
      else {
        const margin = s.scores[other(s.battingSide)].runs - chase.runs;
        winner = margin === 0 ? 'draw' : other(s.battingSide);
      }
    }
    return { winner, ...score };
  },
  summary: (s) => {
    // While a Super Over is live/decided, tag each side's board with its SO runs.
    const so = s.superOver;
    const soTag = (side: 'home' | 'away') => (so ? `  ·  SO ${so.state.scores[side].runs}` : '');
    const status = s.ended
      ? resultLine(s)
      : s.pendingTie
        ? so ? `🔥 Super Over ${so.round}` : '🔥 Scores level — Super Over?'
        : `Innings ${s.innings}`;
    return {
      homeScore: `${s.scores.home.runs}/${s.scores.home.wickets}${soTag('home')}`,
      awayScore: `${s.scores.away.runs}/${s.scores.away.wickets}${soTag('away')}`,
      statusLine: status,
      detailLine:
        s.innings === 2 && s.target !== undefined && !s.ended && !s.pendingTie
          ? `Target ${s.target}`
          : `${s.oversLimit} overs · RR ${runRate(s.scores[s.battingSide].runs, s.scores[s.battingSide].balls, s.ballsPerOver)}`,
    };
  },
  ScoringControls,
  LiveClock,
  LiveExtras,
  Summary: CricketSummary,
  hideScoreboard: true,
  voice: { hints: ['four', 'six', 'dot', 'wicket', 'wide', 'two runs'], parse: cricketVoice },
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 't20',
      options: [
        { value: 't20', label: 'T20', set: { overs: 20, ballsPerOver: 6, playersPerSide: 11, powerplayOvers: 6, impactPlayer: false, tieBreak: 'super_over', ballType: 'leather', dls: true } },
        { value: 'odi', label: 'ODI (50)', set: { overs: 50, ballsPerOver: 6, playersPerSide: 11, powerplayOvers: 10, impactPlayer: false, tieBreak: 'super_over', ballType: 'leather', dls: true } },
        { value: 't10', label: 'T10', set: { overs: 10, ballsPerOver: 6, playersPerSide: 11, powerplayOvers: 3, impactPlayer: false, tieBreak: 'super_over', ballType: 'leather', dls: true } },
        { value: 'hundred', label: 'The Hundred (100 balls)', set: { overs: 10, ballsPerOver: 10, playersPerSide: 11, powerplayOvers: 3, impactPlayer: false, tieBreak: 'super_over', ballType: 'leather', dls: true } },
        { value: 'sixes', label: 'Sixes (6-a-side · 6 ov)', set: { overs: 6, ballsPerOver: 6, playersPerSide: 6, powerplayOvers: 0, impactPlayer: false, tieBreak: 'super_over', ballType: 'leather', dls: false } },
        { value: 'box', label: 'Box cricket', set: { overs: 5, ballsPerOver: 6, playersPerSide: 6, powerplayOvers: 0, impactPlayer: false, tieBreak: 'super_over', ballType: 'tennis', dls: false } },
        { value: 'test', label: 'Test / timeless', set: { overs: 999, ballsPerOver: 6, playersPerSide: 11, powerplayOvers: 0, impactPlayer: false, tieBreak: 'shared', ballType: 'leather', dls: false } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 11, min: 1, max: 11, hint: 'wickets = players − 1 · set any number for box' },
    {
      key: 'ballType', label: 'Ball', type: 'choice', default: 'leather',
      options: [
        { value: 'leather', label: 'Leather (match ball)' },
        { value: 'tennis', label: 'Tennis ball' },
      ],
    },
    {
      key: 'tieBreak', label: 'If the match ties', type: 'choice', default: 'super_over',
      options: [
        { value: 'super_over', label: 'Super Over' },
        { value: 'shared', label: 'Tie stands / shared' },
      ],
    },
    { key: 'overs', label: 'Overs per innings', type: 'number', default: 20, min: 1, max: 999, advanced: true },
    {
      key: 'ballsPerOver', label: 'Balls per over', type: 'choice', default: 6, advanced: true,
      options: [
        { value: 6, label: '6 (standard)' },
        { value: 10, label: '10 (The Hundred)' },
      ],
    },
    { key: 'powerplayOvers', label: 'Powerplay overs', type: 'number', default: 0, min: 0, max: 10, advanced: true, hint: '0 = none' },
    { key: 'dls', label: 'DLS (rain-revised targets)', type: 'toggle', default: false, advanced: true, hint: 'reduce overs on a rain break; the chase target auto-revises' },
    { key: 'substitutes', label: 'Substitutes per side', type: 'count', default: 0, min: 0, max: 5, advanced: true, hint: '12th man, etc.' },
    { key: 'impactPlayer', label: 'Impact Player (IPL-style)', type: 'toggle', default: false, advanced: true, hint: 'one named sub can come in to bat or bowl mid-match' },
  ],
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
